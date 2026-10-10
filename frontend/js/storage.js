/**
 * WaySafe - Local Storage Helper
 * Provides typed, safe access to localStorage for app preferences and session state.
 */

const STORAGE_PREFIX = 'waysafe_';

export const storage = {
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(STORAGE_PREFIX + key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.warn(`Error reading ${key} from localStorage:`, e);
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn(`Error writing ${key} to localStorage:`, e);
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(STORAGE_PREFIX + key);
      return true;
    } catch (e) {
      console.warn(`Error removing ${key} from localStorage:`, e);
      return false;
    }
  },

  clearSession() {
    this.remove('current_user');
    this.remove('auth_token');
    this.remove('active_trip');
  }
};
