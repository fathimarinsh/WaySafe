import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseUrl !== 'https://YOUR_PROJECT_ID.supabase.co' &&
  !supabaseUrl.includes('YOUR_PROJECT_ID') &&
  (supabaseAnonKey || supabaseServiceRoleKey)
);

let supabase = null;
let supabaseAdmin = null;

if (isSupabaseConfigured) {
  // Standard client (respects RLS)
  if (supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false }
    });
  }

  // Admin client (uses secret service_role key to bypass RLS for server-side maintenance)
  if (supabaseServiceRoleKey) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    console.log('[Supabase Admin] Initialized with service_role key.');
  } else {
    console.warn('[Supabase Warning] SUPABASE_SERVICE_ROLE_KEY is not defined. Admin operations will be disabled.');
  }
} else {
  console.info('[Supabase Info] Supabase environment variables not configured. Skipping initialization.');
}

export function getUserClient(token) {
  if (!supabaseUrl || !supabaseAnonKey || !token) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
}

export { supabase, supabaseAdmin };
export default supabase;
