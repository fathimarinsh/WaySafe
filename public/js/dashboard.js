import { requireAuth, getCurrentUser, logout } from './auth.js';
import { tripsService } from './trips.js';
import { contactsService } from './contacts.js';
import { batteryMonitor } from './battery.js';
import { locationService } from './location.js';
import { showToast, formatDate, escapeHtml } from './app.js';
import { storage } from './storage.js';

let currentActiveTrip = null;
let currentBatteryState = null;

// =========================================================================
// 1. Navigation & User Profile Header
// =========================================================================

function setupUserHeader(user) {
  const welcomeHeading = document.getElementById('welcome-heading');
  const welcomeSub = document.getElementById('welcome-sub');
  const authContainer = document.getElementById('nav-auth-container');

  if (user) {
    const displayName = user.displayName || user.email?.split('@')[0] || 'Traveler';
    if (welcomeHeading) {
      welcomeHeading.textContent = `Welcome Back, ${displayName}`;
    }
    if (welcomeSub) {
      const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
      welcomeSub.textContent = `Personal safety command for ${today} • Device power and trip readiness.`;
    }

    if (authContainer) {
      const initial = (displayName.charAt(0) || 'U').toUpperCase();
      authContainer.innerHTML = `
        <div class="user-pill" title="Signed in as ${escapeHtml(user.email || displayName)}">
          <div class="user-avatar">${escapeHtml(initial)}</div>
          <span>${escapeHtml(displayName)}</span>
        </div>
        <button type="button" id="btn-dashboard-logout" class="btn btn-sm btn-outline" style="border-color: var(--border-subtle);">
          Log Out
        </button>
      `;

      document.getElementById('btn-dashboard-logout')?.addEventListener('click', async () => {
        try {
          await logout();
          showToast('Signed out successfully.', 'info');
          setTimeout(() => {
            window.location.href = 'login.html';
          }, 400);
        } catch (e) {
          console.error('Logout error:', e);
          window.location.href = 'login.html';
        }
      });
    }
  }
}

// =========================================================================
// 2. Battery Status Module (Hardware API with Privacy Fallback)
// =========================================================================

async function loadBattery() {
  const batteryPctEl = document.getElementById('battery-percentage');
  const batteryFillEl = document.getElementById('battery-fill');
  const batteryStatusTextEl = document.getElementById('battery-status-text');
  const batteryBadgeEl = document.getElementById('battery-badge');
  const supportedView = document.getElementById('battery-supported-view');
  const unsupportedNotice = document.getElementById('battery-unsupported-notice');
  const readingNoteEl = document.getElementById('battery-reading-note');

  try {
    const res = await batteryMonitor.init();

    if (res && res.supported && res.state) {
      if (supportedView) supportedView.style.display = 'block';
      if (unsupportedNotice) unsupportedNotice.style.display = 'none';

      updateBatteryDisplay(res.state);

      // Listen for battery level and charging state changes
      batteryMonitor.onChange(state => updateBatteryDisplay(state));
    } else {
      // Browser does not support Battery API (Safari, Firefox, iOS WebKit)
      // Per instructions: Never fabricate battery readings.
      if (supportedView) supportedView.style.display = 'none';
      if (unsupportedNotice) unsupportedNotice.style.display = 'block';
      if (batteryBadgeEl) {
        batteryBadgeEl.textContent = 'RESTRICTED';
        batteryBadgeEl.className = 'badge badge-neutral';
      }
      if (readingNoteEl) {
        readingNoteEl.textContent = 'Battery API restricted by browser privacy standards';
      }
    }
  } catch (err) {
    console.warn('Battery monitor initialization note:', err);
    if (supportedView) supportedView.style.display = 'none';
    if (unsupportedNotice) unsupportedNotice.style.display = 'block';
  }
}

function updateBatteryDisplay(state) {
  if (!state) return;
  currentBatteryState = state;

  const batteryPctEl = document.getElementById('battery-percentage');
  const batteryFillEl = document.getElementById('battery-fill');
  const batteryStatusTextEl = document.getElementById('battery-status-text');
  const batteryBadgeEl = document.getElementById('battery-badge');

  if (batteryPctEl) batteryPctEl.textContent = `${state.level}%`;

  if (batteryFillEl) {
    batteryFillEl.style.width = `${Math.min(100, Math.max(5, state.level))}%`;
    batteryFillEl.classList.remove('battery-low', 'battery-critical');

    if (state.isCritical) {
      batteryFillEl.classList.add('battery-critical');
    } else if (state.isLow) {
      batteryFillEl.classList.add('battery-low');
    }
  }

  if (batteryStatusTextEl) {
    const chargingStr = state.isCharging ? '⚡ Charging' : '🔋 On Battery';
    let statusDesc = 'Healthy charge';
    if (state.isCritical) statusDesc = '🚨 Critical power (under 10%)';
    else if (state.isLow) statusDesc = '⚠️ Low power (under 20%)';

    batteryStatusTextEl.textContent = `${chargingStr} • ${statusDesc}`;
  }

  if (batteryBadgeEl) {
    if (state.isCritical) {
      batteryBadgeEl.textContent = 'CRITICAL ALERT';
      batteryBadgeEl.className = 'badge badge-danger';
    } else if (state.isLow) {
      batteryBadgeEl.textContent = 'LOW POWER';
      batteryBadgeEl.className = 'badge badge-warning';
    } else {
      batteryBadgeEl.textContent = 'ONLINE MONITOR';
      batteryBadgeEl.className = 'badge badge-teal';
    }
  }
}

// =========================================================================
// 3. Safety Readiness Checklist
// =========================================================================

const READINESS_STORAGE_KEY = 'waysafe_readiness_checklist';

function initReadinessChecklist() {
  const container = document.getElementById('readiness-checklist');
  const scoreEl = document.getElementById('readiness-score');
  const fillEl = document.getElementById('readiness-progress-fill');
  if (!container) return;

  const checkboxes = container.querySelectorAll('input[type="checkbox"]');
  const savedState = storage.get(READINESS_STORAGE_KEY, {});

  // Restore saved state
  checkboxes.forEach((cb) => {
    const idx = cb.getAttribute('data-index');
    if (savedState[idx]) {
      cb.checked = true;
      cb.closest('.readiness-item')?.classList.add('completed');
    }

    cb.addEventListener('change', () => {
      savedState[idx] = cb.checked;
      storage.set(READINESS_STORAGE_KEY, savedState);

      if (cb.checked) {
        cb.closest('.readiness-item')?.classList.add('completed');
      } else {
        cb.closest('.readiness-item')?.classList.remove('completed');
      }
      updateReadinessScore();
    });
  });

  function updateReadinessScore() {
    let checkedCount = 0;
    checkboxes.forEach(cb => {
      if (cb.checked) checkedCount++;
    });

    const total = checkboxes.length;
    const pct = Math.round((checkedCount / total) * 100);

    if (scoreEl) {
      scoreEl.textContent = `${checkedCount} of ${total} Ready (${pct}%)`;
    }
    if (fillEl) {
      fillEl.style.width = `${pct}%`;
    }
  }

  updateReadinessScore();
}

// =========================================================================
// 4. Active Journey Section (Loading, Active Card, Empty, Error)
// =========================================================================

async function loadActiveTrip() {
  const container = document.getElementById('active-trip-container');
  const headerActionEl = document.getElementById('active-trip-header-action');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
      <span class="loading-spinner" style="border-color: var(--teal-500); border-top-color: transparent;"></span>
      <span>Checking active journey status...</span>
    </div>
  `;

  try {
    const trip = await tripsService.getActive();
    currentActiveTrip = trip;

    if (!trip) {
      if (headerActionEl) headerActionEl.innerHTML = '';
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🛡️</div>
          <h3 class="empty-state-title">No Active Journey in Progress</h3>
          <p class="empty-state-desc">
            You are not currently on a monitored trip. Set up a route, estimated arrival, and notify your emergency contacts before departing.
          </p>
          <a href="trip-setup.html" class="btn btn-primary btn-lg">
            <span>🚀</span> Start Safe Trip
          </a>
        </div>
      `;
      return;
    }

    // Active trip found
    const modeIcon = tripsService.formatTransportIcon(trip.transportMode || trip.transport_mode);
    const badgeClass = tripsService.getBadgeClass(trip.status);
    const destName = typeof trip.destination === 'object' ? trip.destination.name : trip.destination;

    if (headerActionEl) {
      headerActionEl.innerHTML = `
        <span class="badge ${badgeClass}">● ACTIVE</span>
      `;
    }

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">
              Started ${formatDate(trip.startedAt || trip.started_at || trip.createdAt || trip.created_at)}
            </span>
          </div>
          <h3 style="font-size: 1.35rem; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
            <span>${modeIcon}</span>
            <span>${escapeHtml(trip.title)}</span>
          </h3>
          <p style="color: var(--text-secondary); font-size: 0.95rem;">
            Destination: <strong>${escapeHtml(destName || 'Unspecified location')}</strong>
          </p>
        </div>

        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <a href="trip-status.html?id=${trip.id}" class="btn btn-primary">
            Live Monitor & Map
          </a>
          <button id="btn-quick-checkin" class="btn btn-secondary">
            ⚡ Quick Check-in
          </button>
          <button id="btn-complete-trip" class="btn btn-outline" style="border-color: var(--success-500); color: var(--success-600);" title="Arrived safely">
            ✓ Arrived
          </button>
        </div>
      </div>

      <div style="background-color: var(--surface-alt); border-radius: var(--radius-md); padding: 1rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1rem; border: 1px solid var(--border-subtle);">
        <div>
          <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Mode</span>
          <div style="font-weight: 600; text-transform: capitalize; margin-top: 0.15rem;">
            ${escapeHtml(trip.transportMode || trip.transport_mode || 'Transit')}
          </div>
        </div>
        <div>
          <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Est. Arrival</span>
          <div style="font-weight: 600; margin-top: 0.15rem;">
            ${(trip.estimatedArrival || trip.estimated_arrival) ? formatDate(trip.estimatedArrival || trip.estimated_arrival) : 'Flexible'}
          </div>
        </div>
        <div>
          <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Last Check-In</span>
          <div style="font-weight: 600; margin-top: 0.15rem;" id="active-trip-last-checkin">
            ${trip.lastCheckin ? formatDate(trip.lastCheckin.createdAt || trip.lastCheckin.created_at) : 'Pending first check-in'}
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-quick-checkin')?.addEventListener('click', handleQuickCheckin);
    document.getElementById('btn-complete-trip')?.addEventListener('click', handleCompleteTrip);
  } catch (err) {
    console.error('Failed to load active trip:', err);
    if (headerActionEl) headerActionEl.innerHTML = '';
    container.innerHTML = `
      <div class="card-error">
        <div class="card-error-text">
          ⚠️ Unable to load active trip data (${escapeHtml(err.message || 'Server unreachable')}).
        </div>
        <button type="button" id="btn-retry-active-trip" class="btn btn-sm btn-secondary">
          ↻ Retry
        </button>
      </div>
    `;
    document.getElementById('btn-retry-active-trip')?.addEventListener('click', loadActiveTrip);
  }
}

async function handleQuickCheckin() {
  if (!currentActiveTrip) return;

  const btn = document.getElementById('btn-quick-checkin');
  if (btn) btn.disabled = true;

  showToast('Locating device for consent-based check-in...', 'info');

  let loc = null;
  if (locationService.isSupported()) {
    try {
      loc = await locationService.getCurrentPosition();
    } catch (e) {
      console.warn('Location omitted during check-in:', e.message);
    }
  }

  const batteryLevel = currentBatteryState ? currentBatteryState.level : null;
  const isCharging = currentBatteryState ? currentBatteryState.isCharging : null;

  try {
    await tripsService.recordCheckin(currentActiveTrip.id, {
      type: 'manual',
      batteryLevel,
      battery_level: batteryLevel,
      isCharging,
      is_charging: isCharging,
      location: loc ? { latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy } : null,
      message: 'Quick dashboard check-in'
    });

    showToast('Check-in recorded successfully!', 'success');
    await loadActiveTrip();
  } catch (err) {
    showToast(err.message || 'Failed to record check-in', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleCompleteTrip() {
  if (!currentActiveTrip) return;
  if (!confirm('Have you arrived safely at your destination? This will mark the journey as completed.')) return;

  try {
    await tripsService.updateStatus(currentActiveTrip.id, 'completed');
    showToast('Safe arrival recorded! Journey marked completed.', 'success');
    currentActiveTrip = null;
    await Promise.all([loadActiveTrip(), loadRecentTrips()]);
  } catch (err) {
    showToast(err.message || 'Could not complete trip', 'error');
  }
}

// =========================================================================
// 5. Trusted Contacts Section (Loading, Contact Cards, Empty, Error)
// =========================================================================

async function loadContacts() {
  const container = document.getElementById('contacts-list-container');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
      <span class="loading-spinner" style="border-color: var(--teal-500); border-top-color: transparent;"></span>
      <span>Loading trusted contacts...</span>
    </div>
  `;

  try {
    const contacts = await contactsService.list();

    if (!contacts || contacts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <h3 class="empty-state-title">No Emergency Contacts Added</h3>
          <p class="empty-state-desc">
            Add trusted contacts who should receive battery alerts and arrival check-ins during your travels.
          </p>
          <a href="emergency-contacts.html" class="btn btn-primary btn-sm">
            + Add Trusted Contact
          </a>
        </div>
      `;
      return;
    }

    const preview = contacts.slice(0, 3);
    container.innerHTML = preview.map(c => {
      const initial = (c.name?.charAt(0) || '?').toUpperCase();
      const isPrimary = Boolean(c.isPrimary ?? c.is_primary);
      const telLink = contactsService.createTelLink ? contactsService.createTelLink(c.phone) : `tel:${c.phone}`;

      return `
        <div class="contact-item">
          <div class="contact-info">
            <div class="contact-avatar">${escapeHtml(initial)}</div>
            <div>
              <div style="font-weight: 600; display: flex; align-items: center; gap: 0.4rem;">
                <span>${escapeHtml(c.name)}</span>
                ${isPrimary ? '<span class="badge badge-teal">PRIMARY</span>' : ''}
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">
                ${escapeHtml(c.relationship || 'Emergency Contact')} • ${escapeHtml(c.phone)}
              </div>
            </div>
          </div>
          <div class="contact-actions">
            <a href="${telLink}" class="btn btn-sm btn-secondary" title="Call ${escapeHtml(c.name)}">
              📞 Call
            </a>
          </div>
        </div>
      `;
    }).join('') + `
      <div style="padding: 0.85rem 1rem; text-align: center; background-color: var(--surface-alt); border-top: 1px solid var(--border-subtle);">
        <a href="emergency-contacts.html" style="font-size: 0.85rem; font-weight: 600;">
          Manage All Contacts (${contacts.length}) →
        </a>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load contacts:', err);
    container.innerHTML = `
      <div class="card-error">
        <div class="card-error-text">
          ⚠️ Unable to load contacts (${escapeHtml(err.message || 'Server error')}).
        </div>
        <button type="button" id="btn-retry-contacts" class="btn btn-sm btn-secondary">
          ↻ Retry
        </button>
      </div>
    `;
    document.getElementById('btn-retry-contacts')?.addEventListener('click', loadContacts);
  }
}

// =========================================================================
// 6. Recent Trip History Section (Loading, History List, Empty, Error)
// =========================================================================

async function loadRecentTrips() {
  const container = document.getElementById('recent-trips-container');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
      <span class="loading-spinner" style="border-color: var(--teal-500); border-top-color: transparent;"></span>
      <span>Loading past journeys...</span>
    </div>
  `;

  try {
    const trips = await tripsService.list();

    // Filter out currently active trip to display completed/past journeys
    const pastTrips = (trips || []).filter(t => t.status !== 'active');

    if (!pastTrips || pastTrips.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📜</div>
          <h3 class="empty-state-title">No Past Journeys Recorded</h3>
          <p class="empty-state-desc">
            Your completed travel logs and arrival timestamps will be archived here for safety review.
          </p>
          <a href="trip-setup.html" class="btn btn-sm btn-outline">
            Plan First Journey
          </a>
        </div>
      `;
      return;
    }

    const preview = pastTrips.slice(0, 4);
    container.innerHTML = `
      <div class="trip-history-list">
        ${preview.map(trip => {
          const modeIcon = tripsService.formatTransportIcon(trip.transportMode || trip.transport_mode);
          const badgeClass = tripsService.getBadgeClass(trip.status);
          const destName = typeof trip.destination === 'object' ? trip.destination.name : trip.destination;
          const dateStr = formatDate(trip.completedAt || trip.completed_at || trip.createdAt || trip.created_at);

          return `
            <div class="trip-history-row">
              <div>
                <div class="trip-history-title">
                  <span>${modeIcon}</span>
                  <span>${escapeHtml(trip.title)}</span>
                </div>
                <div class="trip-history-sub">
                  To: ${escapeHtml(destName || 'Unspecified')} • ${dateStr}
                </div>
              </div>
              <div>
                <span class="badge ${badgeClass}">${escapeHtml((trip.status || 'completed').toUpperCase())}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div style="padding: 0.85rem 1rem; text-align: center; background-color: var(--surface-alt); border-top: 1px solid var(--border-subtle);">
        <a href="trip-history.html" style="font-size: 0.85rem; font-weight: 600;">
          View Full History (${pastTrips.length}) →
        </a>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load recent trips:', err);
    container.innerHTML = `
      <div class="card-error">
        <div class="card-error-text">
          ⚠️ Unable to load trip history (${escapeHtml(err.message || 'Server error')}).
        </div>
        <button type="button" id="btn-retry-trips" class="btn btn-sm btn-secondary">
          ↻ Retry
        </button>
      </div>
    `;
    document.getElementById('btn-retry-trips')?.addEventListener('click', loadRecentTrips);
  }
}

// =========================================================================
// 7. Global Refresh Action & Initialization
// =========================================================================

async function refreshAllDashboard() {
  const refreshBtn = document.getElementById('btn-refresh-dashboard');
  if (refreshBtn) refreshBtn.disabled = true;

  showToast('Refreshing dashboard data...', 'info');

  await Promise.allSettled([
    loadBattery(),
    loadActiveTrip(),
    loadContacts(),
    loadRecentTrips()
  ]);

  showToast('Dashboard updated.', 'success');

  if (refreshBtn) refreshBtn.disabled = false;
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce authentication guard
  const isAuthenticated = await requireAuth();
  if (!isAuthenticated) return;

  const user = getCurrentUser();
  setupUserHeader(user);

  // 2. Setup refresh action
  document.getElementById('btn-refresh-dashboard')?.addEventListener('click', refreshAllDashboard);

  // 3. Initialize checklist
  initReadinessChecklist();

  // 4. Fetch all dashboard data concurrently
  loadBattery();
  loadActiveTrip();
  loadContacts();
  loadRecentTrips();
});
