import { supabase, isSupabaseConfigured } from '../config/supabase.js';

/**
 * Authentication Middleware using Supabase Auth
 * Validates Supabase JWT token from Authorization header (Bearer <token>)
 * Derives user ID strictly from the verified token (req.user.uid)
 * Never trusts any client-supplied userId
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Missing or malformed Authorization header. Expected Bearer token.'
      });
    }

    const token = authHeader.split('Bearer ')[1]?.trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No token provided in Bearer authorization header.'
      });
    }

    // 1. Handle Mock / Demo tokens in development or when mock mode is enabled
    if (process.env.ALLOW_DEV_MOCK_AUTH === 'true' || process.env.NODE_ENV !== 'production') {
      if (token.startsWith('mock-token-') || token === 'demo-token' || token === 'dev-token') {
        req.user = {
          uid: token === 'demo-token' ? 'demo-user-101' : token.replace('mock-token-', 'user-'),
          email: 'demo@waysafe.local',
          name: 'Demo Safe Traveler',
          token: token,
          isMock: true
        };
        return next();
      }
    }

    // 2. Server-side Supabase Auth token verification
    if (isSupabaseConfigured && supabase) {
      const { data, error: sbError } = await supabase.auth.getUser(token);
      if (data?.user && !sbError) {
        req.user = {
          uid: data.user.id,
          email: data.user.email || null,
          name: data.user.user_metadata?.full_name || data.user.user_metadata?.display_name || data.user.user_metadata?.name || '',
          token: token,
          isMock: false
        };
        return next();
      }

      return res.status(401).json({
        success: false,
        error: 'Authentication failed: Invalid or expired Supabase token.',
        code: 'INVALID_TOKEN'
      });
    }

    return res.status(503).json({
      success: false,
      error: 'Supabase Auth is not configured. Please supply SUPABASE_URL and SUPABASE_ANON_KEY.'
    });
  } catch (error) {
    console.error('[Auth Middleware Error]:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed: ' + error.message,
      code: 'AUTH_ERROR'
    });
  }
}
