/**
 * WaySafe - Battery Status Module
 * 
 * CORE PRINCIPLES & REALISTIC LIMITATIONS:
 * 1. Web applications CANNOT programmatically switch on the phone's native "Battery Saver" mode.
 * 2. Web applications CANNOT reliably monitor battery or track GPS after the page or browser is closed.
 * 3. Battery Status API (navigator.getBattery) is supported primarily in Chromium browsers (Chrome, Edge, Opera).
 *    Safari, Firefox, and iOS WebKit disable it by default for anti-fingerprinting privacy.
 * 4. We NEVER fabricate battery numbers. When unsupported, we inform the user and provide safe manual guidance.
 */

class BatteryMonitor {
  constructor() {
    this.isSupported = typeof navigator !== 'undefined' && 'getBattery' in navigator;
    this.battery = null;
    this.listeners = new Set();
    this.thresholdListeners = new Set();
    this.lastState = null;
    this.nativeHandlers = null;

    // Duplicate alert prevention
    this.lastAlertTriggered = null; // 'low' | 'critical' | null
    this.dismissedUntil = 0; // Timestamp until which alerts are suppressed

    // Developer-only Simulator state
    this.simulatedState = null;
    this.simulateUnsupported = false;
  }

  /**
   * Check if developer mode is enabled (localhost or manual dev flag)
   */
  isDevMode() {
    if (typeof window === 'undefined') {
      // Node.js testing environment: enable unless explicitly set to production
      return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
    }
    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' ||
                    window.location.hostname.endsWith('.local');
    const devFlag = typeof localStorage !== 'undefined' && localStorage.getItem('waysafe_dev_mode') === 'true';
    return isLocal || devFlag;
  }

  /**
   * Initialize battery monitor using Battery Status API
   */
  async init() {
    // If developer simulator is mocking unsupported API
    if (this.simulateUnsupported) {
      return {
        supported: false,
        message: 'Battery Status API unavailable (Simulated unsupported state).'
      };
    }

    // Developer simulated state override
    if (this.simulatedState) {
      this.lastState = this.simulatedState;
      return {
        supported: true,
        state: this.simulatedState,
        isSimulated: true
      };
    }

    if (!this.isSupported) {
      console.info('[BatteryMonitor] Battery Status API is not supported in this browser environment.');
      return {
        supported: false,
        message: 'Battery Status API is not supported by your current browser (e.g. Safari or Firefox). Safe travel protocols remain fully active.'
      };
    }

    try {
      this.battery = await navigator.getBattery();

      // Bind native change listeners with proper reference for cleanup
      this.nativeHandlers = {
        levelchange: () => this._handleBatteryUpdate(),
        chargingchange: () => this._handleBatteryUpdate(),
        chargingtimechange: () => this._handleBatteryUpdate(),
        dischargingtimechange: () => this._handleBatteryUpdate()
      };

      this.battery.addEventListener('levelchange', this.nativeHandlers.levelchange);
      this.battery.addEventListener('chargingchange', this.nativeHandlers.chargingchange);
      this.battery.addEventListener('chargingtimechange', this.nativeHandlers.chargingtimechange);
      this.battery.addEventListener('dischargingtimechange', this.nativeHandlers.dischargingtimechange);

      this.lastState = this._formatState();
      return {
        supported: true,
        state: this.lastState
      };
    } catch (err) {
      console.warn('[BatteryMonitor] Error accessing Battery API:', err);
      this.isSupported = false;
      return {
        supported: false,
        message: 'Battery API could not be initialized due to browser permissions or sandbox restrictions.'
      };
    }
  }

  /**
   * Proper cleanup of event listeners and subscribers
   */
  destroy() {
    if (this.battery && this.nativeHandlers) {
      try {
        this.battery.removeEventListener('levelchange', this.nativeHandlers.levelchange);
        this.battery.removeEventListener('chargingchange', this.nativeHandlers.chargingchange);
        this.battery.removeEventListener('chargingtimechange', this.nativeHandlers.chargingtimechange);
        this.battery.removeEventListener('dischargingtimechange', this.nativeHandlers.dischargingtimechange);
      } catch (e) {
        console.warn('[BatteryMonitor] Error detaching native battery listeners:', e);
      }
      this.nativeHandlers = null;
    }
    this.listeners.clear();
    this.thresholdListeners.clear();
    this.battery = null;
  }

  _formatState() {
    if (this.simulatedState) return this.simulatedState;
    if (!this.battery) return null;

    const levelPercentage = Math.round(this.battery.level * 100);
    return {
      level: levelPercentage,
      decimal: this.battery.level,
      isCharging: Boolean(this.battery.charging),
      dischargingTime: this.battery.dischargingTime,
      chargingTime: this.battery.chargingTime,
      isLow: levelPercentage <= 20,
      isCritical: levelPercentage <= 10
    };
  }

  _handleBatteryUpdate() {
    const state = this._formatState();
    if (!state) return;
    this.lastState = state;

    // Notify all change listeners
    this.listeners.forEach(cb => {
      try { cb(state); } catch (e) { console.error('Error in battery onChange listener:', e); }
    });

    // Handle threshold warnings with duplicate-alert prevention
    this._checkThresholdAlerts(state);
  }

  /**
   * Duplicate alert prevention logic:
   * Only triggers an alert when crossing into <=20% or <=10%,
   * and respects the user dismissal timeout.
   */
  _checkThresholdAlerts(state) {
    if (this.isAlertDismissed()) return;

    if (state.isCritical && this.lastAlertTriggered !== 'critical') {
      this.lastAlertTriggered = 'critical';
      this.thresholdListeners.forEach(cb => {
        try { cb({ ...state, alertType: 'critical' }); } catch (e) { console.error(e); }
      });
    } else if (state.isLow && !state.isCritical && this.lastAlertTriggered !== 'low') {
      this.lastAlertTriggered = 'low';
      this.thresholdListeners.forEach(cb => {
        try { cb({ ...state, alertType: 'low' }); } catch (e) { console.error(e); }
      });
    } else if (!state.isLow && !state.isCritical) {
      // Recovered above 20% (e.g. charging) -> reset trigger so subsequent drops alert again
      this.lastAlertTriggered = null;
    }
  }

  /**
   * Subscribe to battery state changes
   * @returns {Function} unbind function to remove listener
   */
  onChange(callback) {
    this.listeners.add(callback);
    if (this.lastState) {
      callback(this.lastState);
    }
    return () => this.listeners.delete(callback);
  }

  /**
   * Subscribe to threshold alert events (<=20% and <=10%) with duplicate prevention
   * @returns {Function} unbind function
   */
  onLowBattery(callback) {
    this.thresholdListeners.add(callback);
    if (!this.isAlertDismissed() && this.lastState && (this.lastState.isLow || this.lastState.isCritical)) {
      this._checkThresholdAlerts(this.lastState);
    }
    return () => this.thresholdListeners.delete(callback);
  }

  /**
   * Dismiss alert for a duration (in minutes) to prevent annoying duplicate popups
   */
  dismissAlert(durationMinutes = 15) {
    this.dismissedUntil = Date.now() + (durationMinutes * 60 * 1000);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('waysafe_battery_dismissed_until', String(this.dismissedUntil));
      } catch (e) {}
    }
  }

  /**
   * Check if alert is currently suppressed
   */
  isAlertDismissed() {
    let stored = 0;
    if (typeof localStorage !== 'undefined') {
      try {
        stored = Number(localStorage.getItem('waysafe_battery_dismissed_until') || 0);
      } catch (e) {}
    }
    return Date.now() < Math.max(this.dismissedUntil, stored);
  }

  /**
   * Reset dismissal state
   */
  resetDismissal() {
    this.dismissedUntil = 0;
    this.lastAlertTriggered = null;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('waysafe_battery_dismissed_until');
      } catch (e) {}
    }
  }

  getCurrentState() {
    return this.lastState;
  }

  // =========================================================================
  // Developer-Only Battery Simulator
  // =========================================================================

  /**
   * Simulate a battery level and charging state for testing (disabled in production)
   */
  simulate(level, isCharging = false) {
    if (!this.isDevMode()) {
      console.warn('[BatteryMonitor] Simulation is disabled in production environments.');
      return false;
    }

    const pct = Math.max(0, Math.min(100, Math.round(level)));
    this.simulateUnsupported = false;
    this.simulatedState = {
      level: pct,
      decimal: pct / 100,
      isCharging: Boolean(isCharging),
      dischargingTime: Infinity,
      chargingTime: 0,
      isLow: pct <= 20,
      isCritical: pct <= 10,
      isSimulated: true
    };

    this.lastState = this.simulatedState;
    this._handleBatteryUpdate();
    console.info(`[BatteryMonitor] Simulated battery set to ${pct}% (charging: ${isCharging})`);
    return true;
  }

  /**
   * Simulate unsupported Battery Status API for testing fallbacks
   */
  simulateUnsupportedApi(unsupported = true) {
    if (!this.isDevMode()) return false;
    this.simulateUnsupported = Boolean(unsupported);
    this.simulatedState = null;
    this.lastState = null;
    console.info('[BatteryMonitor] Simulated unsupported API state:', unsupported);
    this.listeners.forEach(cb => {
      try { cb(null); } catch (e) {}
    });
    return true;
  }

  /**
   * Reset simulation back to real hardware sensor
   */
  resetSimulation() {
    this.simulatedState = null;
    this.simulateUnsupported = false;
    this.lastAlertTriggered = null;
    this.dismissedUntil = 0;
    this.lastState = null;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('waysafe_battery_dismissed_until');
      } catch (e) {}
    }

    if (this.battery) {
      this.lastState = this._formatState();
      this._handleBatteryUpdate();
    } else {
      this.init();
    }
    console.info('[BatteryMonitor] Reset to real hardware battery sensor.');
  }

  isSimulationActive() {
    return Boolean(this.simulatedState || this.simulateUnsupported);
  }
}

export const batteryMonitor = new BatteryMonitor();
