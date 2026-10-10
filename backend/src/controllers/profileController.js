import { supabase, supabaseAdmin, isSupabaseConfigured, getUserClient } from '../config/supabase.js';

// In-memory fallback cache for development or before profiles table migration
const localProfileStore = new Map();

/**
 * POST /api/profile
 * Create or update the authenticated user's minimal profile
 * Enforces server-side user ID verification from verified token (req.user.uid)
 */
export async function createOrUpdateProfile(req, res, next) {
  try {
    const userId = req.user.uid;
    const { full_name } = req.body;

    if (!full_name || typeof full_name !== 'string' || full_name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: full_name is required and must be a non-empty string.'
      });
    }

    const cleanName = full_name.trim();
    const now = new Date().toISOString();
    let savedProfile = {
      id: userId,
      full_name: cleanName,
      created_at: now,
      updated_at: now
    };

    // 1. If Supabase is configured, attempt writing to the profiles table
    if (isSupabaseConfigured) {
      try {
        // Prefer user client with user's JWT to respect RLS
        const client = req.user.token ? getUserClient(req.user.token) : (supabaseAdmin || supabase);
        
        if (client) {
          const { data, error } = await client
            .from('profiles')
            .upsert({
              id: userId,
              full_name: cleanName,
              updated_at: now
            }, { onConflict: 'id' })
            .select()
            .single();

          if (error) {
            console.error('[Profile Controller] Supabase profiles upsert error:', error.message);
            if (!req.user.isMock) {
              return res.status(500).json({
                success: false,
                error: 'Database operation failed while saving profile: ' + error.message
              });
            }
            localProfileStore.set(userId, savedProfile);
          } else if (data) {
            savedProfile = data;
          }
        }
      } catch (err) {
        console.error('[Profile Controller] Exception writing to Supabase profiles:', err.message);
        if (!req.user.isMock) {
          return res.status(500).json({
            success: false,
            error: 'Database exception: ' + err.message
          });
        }
        localProfileStore.set(userId, savedProfile);
      }
    } else {
      localProfileStore.set(userId, savedProfile);
    }

    return res.status(200).json({
      success: true,
      message: 'Profile created/updated successfully.',
      profile: savedProfile
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/profile
 * Retrieve current authenticated user's minimal profile
 */
export async function getProfile(req, res, next) {
  try {
    const userId = req.user.uid;

    if (isSupabaseConfigured) {
      try {
        const client = req.user.token ? getUserClient(req.user.token) : (supabaseAdmin || supabase);
        if (client) {
          const { data, error } = await client
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

          if (!error && data) {
            return res.json({
              success: true,
              profile: data
            });
          }
        }
      } catch (err) {
        console.warn('[Profile Controller] Error querying Supabase profiles:', err.message);
      }
    }

    const cached = localProfileStore.get(userId) || {
      id: userId,
      full_name: req.user.name || 'Safe Traveler',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    return res.json({
      success: true,
      profile: cached
    });
  } catch (error) {
    next(error);
  }
}
