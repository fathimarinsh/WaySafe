/**
 * WaySafe - Supabase Client Configuration (Frontend)
 *
 * For Vanilla HTML/CSS/JavaScript with ES Modules:
 * - We import the official Supabase client directly from an ESM CDN (no bundler/Next.js needed).
 * - ONLY use the Project URL and the Publishable (Anon) Key here.
 * - NEVER put the service_role secret key in this file or any frontend file.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Your live Supabase credentials:
export const SUPABASE_URL = 'https://msouolyxxjgkkdnngleo.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_DEk8umxm97zLwshg5XHJig_GV3vyLuZ';

/**
 * Checks if real credentials have been provided instead of placeholder values.
 */
export function isSupabaseConfigured() {
  return (
    SUPABASE_URL &&
    SUPABASE_URL !== 'https://YOUR_PROJECT_ID.supabase.co' &&
    !SUPABASE_URL.includes('YOUR_PROJECT_ID') &&
    SUPABASE_ANON_KEY &&
    SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_PUBLIC_KEY' &&
    !SUPABASE_ANON_KEY.startsWith('YOUR_')
  );
}

/**
 * Storage adapter supporting Remember-Session option:
 * When remember is enabled (default), persists to localStorage.
 * When remember is unchecked, persists to sessionStorage (cleared on browser/tab close).
 */
export const sessionStore = {
  getItem: (key) => {
    return localStorage.getItem(key) || sessionStorage.getItem(key);
  },
  setItem: (key, value) => {
    const remember = localStorage.getItem('waysafe_remember_session') !== 'false';
    if (remember) {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    }
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
};

export function setRememberSessionPreference(remember) {
  if (remember) {
    localStorage.setItem('waysafe_remember_session', 'true');
  } else {
    localStorage.setItem('waysafe_remember_session', 'false');
  }
}

// Initialise Supabase Client for the browser
export const supabase = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: sessionStore
      }
    })
  : null;

if (!isSupabaseConfigured()) {
  console.info(
    '🛡️ [WaySafe Supabase] Running with placeholders. To connect live Supabase, enter your Project URL and anon key in frontend/js/supabase-config.js.'
  );
} else {
  console.log('⚡ [WaySafe Supabase] Client initialized successfully for Vanilla JS frontend.');
}
