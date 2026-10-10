import { initAuth, onAuthStateChanged, logout, getCurrentUser } from './auth.js';
import { batteryMonitor } from './battery.js';

/**
 * WaySafe - Global Application Entry
 */

export function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.2s ease-in';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatDate(isoString) {
  if (!isoString) return 'N/A';
  try {
    const d = new Date(isoString);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return isoString;
  }
}

// Global Battery Warning & Accessible Modal Setup
function setupGlobalBatteryWatcher() {
  batteryMonitor.init().then(res => {
    if (res && res.supported) {
      batteryMonitor.onLowBattery(state => {
        if (batteryMonitor.isAlertDismissed()) return;

        // If on the dedicated low-battery page, avoid duplicate modal popup
        if (window.location.pathname.endsWith('low-battery.html')) return;

        // Accessible Modal for Low Battery
        let existingModal = document.getElementById('global-battery-modal');
        if (!existingModal) {
          const modalBackdrop = document.createElement('div');
          modalBackdrop.id = 'global-battery-modal';
          modalBackdrop.className = 'modal-backdrop active';
          modalBackdrop.setAttribute('role', 'dialog');
          modalBackdrop.setAttribute('aria-modal', 'true');
          modalBackdrop.setAttribute('aria-labelledby', 'modal-battery-title');

          modalBackdrop.innerHTML = `
            <div class="modal-dialog" style="max-width: 520px;">
              <div class="card-header" style="background-color: var(--surface-card); border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
                <h3 class="card-title" id="modal-battery-title" style="color: ${state.isCritical ? 'var(--danger-600)' : 'var(--warning-600)'};">
                  <span>${state.isCritical ? '🚨' : '⚠️'}</span> Low Battery Advisory (${state.level}%)
                </h3>
                <button type="button" id="btn-close-global-modal" aria-label="Dismiss alert" style="background: none; border: none; font-size: 1.25rem; cursor: pointer; color: var(--text-muted);">✕</button>
              </div>

              <div class="card-body">
                <div style="background-color: var(--surface-alt); padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Sensor Reading</span>
                    <div style="font-size: 1.25rem; font-weight: 800; color: var(--navy-900);">${state.level}%</div>
                  </div>
                  <span class="badge ${state.isCritical ? 'badge-danger' : 'badge-warning'}">
                    ${state.isCharging ? '⚡ CHARGING' : (state.isCritical ? 'CRITICAL <=10%' : 'LOW <=20%')}
                  </span>
                </div>

                <div style="font-weight: 700; font-size: 0.9rem; color: var(--navy-900); margin-bottom: 0.5rem;">
                  Immediate Safety Checklist:
                </div>
                <ol style="margin-left: 1.25rem; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 1.25rem;">
                  <li><strong>Enable phone's built-in Battery Saver:</strong> Manually turn on native power saver in OS settings.</li>
                  <li><strong>Save important trip details:</strong> Review destination and ETA before screen powers off.</li>
                  <li><strong>Contact a trusted person:</strong> Inform contacts via SMS or quick phone call.</li>
                  <li><strong>Share location only with explicit consent:</strong> Send GPS coordinates with prior confirmation.</li>
                  <li><strong>Keep emergency contact details accessible:</strong> Memorize phone number or note it offline.</li>
                </ol>
              </div>

              <div class="card-footer" style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
                <button type="button" id="btn-dismiss-global-modal" class="btn btn-sm btn-outline">
                  Dismiss Alert
                </button>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                  <a href="trip-status.html" class="btn btn-sm btn-secondary">View Trip</a>
                  <a href="emergency-contacts.html" class="btn btn-sm btn-secondary">Contacts</a>
                  <a href="low-battery.html" class="btn btn-sm btn-primary">Share Location →</a>
                </div>
              </div>
            </div>
          `;

          document.body.appendChild(modalBackdrop);

          const closeModal = () => {
            batteryMonitor.dismissAlert(15);
            modalBackdrop.remove();
          };

          document.getElementById('btn-close-global-modal')?.addEventListener('click', closeModal);
          document.getElementById('btn-dismiss-global-modal')?.addEventListener('click', closeModal);
        }
      });
    }
  });
}

// Global Nav bar updater
function updateNavUI(user) {
  const navAuthContainer = document.getElementById('nav-auth-container');
  if (!navAuthContainer) return;

  if (user) {
    const displayName = user.displayName || user.email.split('@')[0] || 'User';
    const initial = displayName.charAt(0).toUpperCase();

    navAuthContainer.innerHTML = `
      <div class="user-pill" title="${escapeHtml(user.email)}">
        <div class="user-avatar">${escapeHtml(initial)}</div>
        <span>${escapeHtml(displayName)}</span>
      </div>
      <button id="btn-logout" class="btn btn-sm btn-outline">Log Out</button>
    `;

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      await logout();
      showToast('Logged out successfully.', 'info');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 500);
    });
  } else {
    navAuthContainer.innerHTML = `
      <a href="login.html" class="btn btn-sm btn-outline">Log In</a>
      <a href="signup.html" class="btn btn-sm btn-primary">Sign Up</a>
    `;
  }
}

// Mobile nav toggle setup
function setupMobileNav() {
  const toggleBtn = document.getElementById('mobile-nav-toggle');
  const mainNav = document.getElementById('main-nav');
  if (toggleBtn && mainNav) {
    toggleBtn.addEventListener('click', () => {
      mainNav.classList.toggle('open');
    });
  }
}

// Auto-run on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  setupMobileNav();
  await initAuth();

  const user = getCurrentUser();
  onAuthStateChanged(u => {
    updateNavUI(u);
  });
  setupGlobalBatteryWatcher();

  // Route protection and authentication redirects
  const pathParts = window.location.pathname.split('/');
  const currentPage = pathParts[pathParts.length - 1] || 'index.html';

  const protectedPages = [
    'dashboard.html',
    'trip-setup.html',
    'trip-status.html',
    'emergency-contacts.html',
    'trip-history.html',
    'trip-completed.html',
    'emergency-travel.html',
    'accessibility-planner.html'
  ];

  const authPages = ['login.html', 'signup.html'];

  if (protectedPages.includes(currentPage) && !user) {
    window.location.href = `login.html?redirect=${encodeURIComponent(currentPage)}`;
    return;
  }

  if (authPages.includes(currentPage) && user) {
    window.location.href = 'dashboard.html';
    return;
  }
});
