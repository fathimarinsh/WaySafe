/**
 * WaySafe - Battery & Location Safety Module Test Suite
 * 
 * Verifies:
 * 1. Battery level reading & calculations (low <= 20%, critical <= 10%)
 * 2. Threshold changes & event triggering
 * 3. Duplicate-alert prevention logic
 * 4. Dismissed alert suppression & reset
 * 5. Event listener cleanup (destroy)
 * 6. Graceful fallback when Battery API is unsupported
 * 7. Developer simulator states (50%, 20%, 10%, 5%)
 * 8. Simulator disabled in production
 * 9. Geolocation coordinate validation & safe map URL generation
 * 10. Stale location detection (> 5 minutes)
 * 11. Geolocation error handling (denial, unavailable, timeout)
 */

import { batteryMonitor } from '../frontend/js/battery.js';
import { locationService } from '../frontend/js/location.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 WaySafe Low-Battery & Location Module Test Suite');
  console.log('====================================================\n');

  // Test 1: Developer Simulator Thresholds (50%, 20%, 10%, 5%)
  console.log('1. Testing Developer Simulator States (50%, 20%, 10%, 5%):');
  
  batteryMonitor.simulate(50, false);
  let state = batteryMonitor.getCurrentState();
  assert(state.level === 50, 'Level is 50%');
  assert(state.isLow === false, '50% is not low');
  assert(state.isCritical === false, '50% is not critical');

  batteryMonitor.simulate(20, false);
  state = batteryMonitor.getCurrentState();
  assert(state.level === 20, 'Level is 20%');
  assert(state.isLow === true, '20% is low threshold');
  assert(state.isCritical === false, '20% is not critical threshold');

  batteryMonitor.simulate(10, false);
  state = batteryMonitor.getCurrentState();
  assert(state.level === 10, 'Level is 10%');
  assert(state.isLow === true, '10% is low');
  assert(state.isCritical === true, '10% is critical threshold');

  batteryMonitor.simulate(5, false);
  state = batteryMonitor.getCurrentState();
  assert(state.level === 5, 'Level is 5%');
  assert(state.isLow === true, '5% is low');
  assert(state.isCritical === true, '5% is critical threshold');

  // Test 2: Duplicate Alert Prevention
  console.log('\n2. Testing Duplicate-Alert Prevention:');
  batteryMonitor.resetSimulation();
  let alertCount = 0;
  let lastAlert = null;
  const unbindAlert = batteryMonitor.onLowBattery((alert) => {
    alertCount++;
    lastAlert = alert;
  });

  // Transition: 50% -> 20% (should trigger 1 alert)
  batteryMonitor.simulate(50, false);
  alertCount = 0;
  batteryMonitor.simulate(20, false);
  assert(alertCount === 1, `Triggered 1 alert on entering 20% (received: ${alertCount})`);
  assert(lastAlert && lastAlert.alertType === 'low', 'Alert type is "low"');

  // Repeated update at 19% (still low, should NOT re-trigger duplicate alert)
  batteryMonitor.simulate(19, false);
  assert(alertCount === 1, 'Duplicate alert prevented when remaining in low state');

  // Transition to critical 10% (should trigger critical alert)
  batteryMonitor.simulate(10, false);
  assert(alertCount === 2, 'Triggered critical alert upon crossing into 10%');
  assert(lastAlert && lastAlert.alertType === 'critical', 'Alert type is "critical"');

  // Repeated update at 9% (still critical, should NOT re-trigger)
  batteryMonitor.simulate(9, false);
  assert(alertCount === 2, 'Duplicate alert prevented when remaining in critical state');

  // Recovery above 20% (e.g. charging to 50%) -> resets trigger state
  batteryMonitor.simulate(50, true);
  assert(batteryMonitor.lastAlertTriggered === null, 'lastAlertTriggered reset after recovery');

  // Dropping back down to 20% should alert again
  batteryMonitor.simulate(20, false);
  assert(alertCount === 3, 'Alert triggers again after recovery and re-entering low power');

  unbindAlert();

  // Test 3: Alert Dismissal Suppression
  console.log('\n3. Testing Alert Dismissal Suppression:');
  batteryMonitor.resetSimulation();
  let dismissTriggerCount = 0;

  // User dismisses alert for 15 minutes
  batteryMonitor.dismissAlert(15);
  assert(batteryMonitor.isAlertDismissed() === true, 'Alert is recognized as dismissed');

  const unbindDismissTest = batteryMonitor.onLowBattery(() => {
    dismissTriggerCount++;
  });

  // Simulation changes threshold while dismissed
  batteryMonitor.simulate(50, false);
  batteryMonitor.simulate(20, false);
  assert(dismissTriggerCount === 0, 'No alert fired while dismissedUntil is active');

  // Reset dismissal
  batteryMonitor.resetDismissal();
  assert(batteryMonitor.isAlertDismissed() === false, 'Alert is no longer dismissed after reset');
  unbindDismissTest();

  // Test 4: Proper Cleanup (destroy)
  console.log('\n4. Testing Event Listener Cleanup (destroy):');
  let testCbCalled = false;
  batteryMonitor.onChange(() => { testCbCalled = true; });
  batteryMonitor.destroy();
  assert(batteryMonitor.listeners.size === 0, 'listeners set cleared on destroy()');
  assert(batteryMonitor.thresholdListeners.size === 0, 'thresholdListeners set cleared on destroy()');
  assert(batteryMonitor.battery === null, 'battery reference nulled on destroy()');

  // Test 5: Unsupported API Fallback
  console.log('\n5. Testing Graceful Fallback for Unsupported API:');
  batteryMonitor.simulateUnsupportedApi(true);
  const unsuppRes = await batteryMonitor.init();
  assert(unsuppRes.supported === false, 'Correctly reports unsupported API');
  assert(typeof unsuppRes.message === 'string', 'Provides informative fallback message');
  batteryMonitor.resetSimulation();

  // Test 6: Production Safety Check
  console.log('\n6. Testing Developer Simulator Production Safeguard:');
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const prodSimResult = batteryMonitor.simulate(10);
  assert(prodSimResult === false, 'Simulation is rejected when in production environment');
  process.env.NODE_ENV = originalEnv;

  // Test 7: Geolocation Coordinate Validation & Safe Map URL
  console.log('\n7. Testing Geolocation Validation & Map Links:');
  assert(locationService.isValidCoordinates(37.7749, -122.4194) === true, 'San Francisco coords valid');
  assert(locationService.isValidCoordinates(0, 0) === true, 'Null Island (0,0) valid');
  assert(locationService.isValidCoordinates(91, 50) === false, 'Latitude > 90 invalid');
  assert(locationService.isValidCoordinates(-95, 50) === false, 'Latitude < -90 invalid');
  assert(locationService.isValidCoordinates(50, 185) === false, 'Longitude > 180 invalid');
  assert(locationService.isValidCoordinates(NaN, 50) === false, 'NaN coordinate invalid');
  assert(locationService.isValidCoordinates('37', '-122') === false, 'String coordinate invalid');

  const validMapUrl = locationService.getMapUrl(51.5074, -0.1278);
  assert(validMapUrl && validMapUrl.includes('openstreetmap.org') && validMapUrl.includes('51.5074'), 'OpenStreetMap link generated for valid coordinates');
  const invalidMapUrl = locationService.getMapUrl(999, 999);
  assert(invalidMapUrl === null, 'Map link is null for invalid coordinates');

  // Test 8: Stale Location Detection
  console.log('\n8. Testing Stale Location Timestamp Logic:');
  const freshTimestamp = Date.now() - (2 * 60 * 1000); // 2 minutes ago
  const staleTimestamp = Date.now() - (10 * 60 * 1000); // 10 minutes ago
  assert(locationService.isStale(freshTimestamp, 5) === false, '2 minutes ago is FRESH (within 5m threshold)');
  assert(locationService.isStale(staleTimestamp, 5) === true, '10 minutes ago is STALE (> 5m threshold)');
  assert(locationService.isStale(null) === true, 'Null timestamp is considered stale');

  // Test 9: Coordinate Formatting
  console.log('\n9. Testing Coordinate Human-Readable Formatting:');
  const formatted = locationService.formatCoordinates(34.0522, -118.2437);
  assert(formatted.includes('34.0522° N') && formatted.includes('118.2437° W'), `Formatted correctly: "${formatted}"`);
  assert(locationService.formatCoordinates(NaN, NaN) === 'Unavailable', 'Invalid returns "Unavailable"');

  // Test 10: Geolocation Permission Denial, Failures & Error Mapping
  console.log('\n10. Testing Geolocation Failures & Permission Denial:');
  // 10a. Unsupported
  const origNavigator = globalThis.navigator;
  try {
    delete globalThis.navigator;
    await locationService.getCurrentPosition().catch(err => {
      assert(err.code === 'UNSUPPORTED', 'Rejects with UNSUPPORTED when navigator missing');
    });

    // 10b. Mock navigator with PERMISSION_DENIED
    globalThis.navigator = {
      geolocation: {
        getCurrentPosition: (success, error) => {
          error({
            code: 1, // PERMISSION_DENIED
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
            message: 'User denied geolocation prompt'
          });
        }
      }
    };
    await locationService.getCurrentPosition().catch(err => {
      assert(err.code === 'PERMISSION_DENIED', 'Maps error code to PERMISSION_DENIED');
      assert(err.message.includes('denied'), 'Includes clear permission denial explanation');
    });

    // 10c. Mock POSITION_UNAVAILABLE
    globalThis.navigator.geolocation.getCurrentPosition = (success, error) => {
      error({
        code: 2, // POSITION_UNAVAILABLE
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: 'GPS fix unavailable'
      });
    };
    await locationService.getCurrentPosition().catch(err => {
      assert(err.code === 'POSITION_UNAVAILABLE', 'Maps error code to POSITION_UNAVAILABLE');
      assert(err.message.includes('unavailable'), 'Explains position unavailable');
    });

    // 10d. Mock TIMEOUT
    globalThis.navigator.geolocation.getCurrentPosition = (success, error) => {
      error({
        code: 3, // TIMEOUT
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: 'Location request timed out'
      });
    };
    await locationService.getCurrentPosition().catch(err => {
      assert(err.code === 'TIMEOUT', 'Maps error code to TIMEOUT');
      assert(err.message.includes('timed out'), 'Explains location request timeout');
    });
  } finally {
    globalThis.navigator = origNavigator;
  }

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('====================================================\n');
}

runTestSuite().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
