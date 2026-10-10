import { supabase, isSupabaseConfigured, setRememberSessionPreference } from './supabase-config.js';
import { storage } from './storage.js';
import { api } from './api.js';

const authStateListeners = new Set();
let isInitialized = false;

/**
 * Initialize Auth service using Supabase Auth exclusively
 */
export async function initAuth() {
  if (isInitialized) {
    return getCurrentUser();
  }
  isInitialized = true;

  if (isSupabaseConfigured() && supabase) {
    // 1. Subscribe to real-time auth state events (SIGN_IN, SIGN_OUT, TOKEN_REFRESHED)
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session && session.user) {
        const userData = {
          uid: session.user.id,
          email: session.user.email,
          displayName: session.user.user_metadata?.full_name || session.user.user_metadata?.display_name || session.user.email?.split('@')[0],
          photoURL: session.user.user_metadata?.avatar_url || null,
          provider: 'supabase'
        };
        storage.set('current_user', userData);
        storage.set('auth_token', session.access_token);
        notifyListeners(userData);
      } else if (event === 'SIGNED_OUT') {
        storage.clearSession();
        notifyListeners(null);
      }
    });

    // 2. Restore existing session on page load/refresh
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!error && session && session.user) {
        const userData = {
          uid: session.user.id,
          email: session.user.email,
          displayName: session.user.user_metadata?.full_name || session.user.user_metadata?.display_name || session.user.email?.split('@')[0],
          photoURL: session.user.user_metadata?.avatar_url || null,
          provider: 'supabase'
        };
        storage.set('current_user', userData);
        storage.set('auth_token', session.access_token);
        notifyListeners(userData);
        return userData;
      }
    } catch (err) {
      console.warn('[WaySafe Auth] Session restoration check notice:', err);
    }
  }

  // Fallback demo user if in local mock mode without Supabase session
  const cached = storage.get('current_user');
  if (cached) {
    notifyListeners(cached);
    return cached;
  }

  notifyListeners(null);
  return null;
}

function notifyListeners(user) {
  authStateListeners.forEach(listener => {
    try {
      listener(user);
    } catch (e) {
      console.error('Error in auth listener:', e);
    }
  });
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChanged(callback) {
  authStateListeners.add(callback);
  const currentUser = getCurrentUser();
  callback(currentUser);
  return () => authStateListeners.delete(callback);
}

/**
 * Get cached current user
 */
export function getCurrentUser() {
  return storage.get('current_user', null);
}

/**
 * Get current Supabase Bearer token
 */
export async function getIdToken() {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        return session.access_token;
      }
    } catch (e) {
      console.warn('Failed to refresh Supabase session token:', e);
    }
  }
  return storage.get('auth_token', 'demo-token');
}

/**
 * Sign up with email, password, and full name
 * Automatically creates minimal user profile through protected Express endpoint POST /api/profile
 */
export async function signup(email, password, fullName) {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase is not configured. Please supply your Supabase URL and Publishable Key.');
  }

  const cleanName = fullName ? fullName.trim() : '';

  // 1. Supabase Auth registration
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password: password,
    options: {
      data: {
        full_name: cleanName,
        display_name: cleanName
      }
    }
  });

  if (error) {
    throw error;
  }

  const user = {
    uid: data.user.id,
    email: data.user.email,
    displayName: cleanName || data.user.email?.split('@')[0],
    provider: 'supabase'
  };

  if (data.session) {
    storage.set('current_user', user);
    storage.set('auth_token', data.session.access_token);
    notifyListeners(user);

    // 2. Create minimal user profile through protected Express endpoint
    try {
      await api.profile.save({ full_name: cleanName });
    } catch (profileErr) {
      console.warn('[WaySafe Auth] Could not record initial profile via /api/profile:', profileErr);
    }
  }

  return {
    user,
    session: data.session,
    requiresEmailConfirmation: !data.session && data.user && data.user.identities && data.user.identities.length > 0
  };
}

/**
 * Log in with email, password, and optional remember-session preference
 */
export async function login(email, password, rememberSession = true) {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase is not configured. Please supply your Supabase URL and Publishable Key.');
  }

  // Apply remember session storage preference
  setRememberSessionPreference(rememberSession);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: password
  });

  if (error) {
    throw error;
  }

  const user = {
    uid: data.user.id,
    email: data.user.email,
    displayName: data.user.user_metadata?.full_name || data.user.user_metadata?.display_name || data.user.email?.split('@')[0],
    provider: 'supabase'
  };

  storage.set('current_user', user);
  storage.set('auth_token', data.session.access_token);
  notifyListeners(user);

  // Sync profile after login if needed
  try {
    const profileRes = await api.profile.get().catch(() => null);
    if (profileRes?.profile?.full_name) {
      user.displayName = profileRes.profile.full_name;
      storage.set('current_user', user);
      notifyListeners(user);
    }
  } catch (e) {
    // Non-critical
  }

  return user;
}

/**
 * Log out
 */
export async function logout() {
  if (isSupabaseConfigured() && supabase) {
    await supabase.auth.signOut().catch(e => console.warn(e));
  }
  storage.clearSession();
  notifyListeners(null);
}

/**
 * Route protection: redirects unauthenticated users to login
 */
export async function requireAuth(redirectBack = window.location.pathname) {
  await initAuth();
  const user = getCurrentUser();
  if (!user) {
    const filename = redirectBack.split('/').pop() || 'dashboard.html';
    window.location.href = `login.html?redirect=${encodeURIComponent(filename)}`;
    return false;
  }
  return true;
}

/**
 * Auth guard: redirects already authenticated users away from login/signup
 */
export async function redirectIfAuth(destination = 'dashboard.html') {
  await initAuth();
  const user = getCurrentUser();
  if (user) {
    window.location.href = destination;
    return true;
  }
  return false;
}
