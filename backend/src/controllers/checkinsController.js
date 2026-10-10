import { firestoreService } from '../services/firestoreService.js';
import { isSupabaseConfigured, getUserClient, supabaseAdmin } from '../config/supabase.js';

export async function createCheckin(req, res, next) {
  try {
    const userId = req.user.uid;
    const { tripId } = req.body;

    if (!tripId) {
      return res.status(400).json({
        success: false,
        error: 'tripId is required.'
      });
    }

    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          // Verify trip ownership
          const { data: trip } = await client
            .from('trips')
            .select('id, user_id, status')
            .eq('id', tripId)
            .eq('user_id', userId)
            .maybeSingle();

          if (!trip) {
            return res.status(404).json({
              success: false,
              error: `Trip not found or unauthorized for id: ${tripId}`
            });
          }

          if (trip.status === 'completed' || trip.status === 'cancelled') {
            return res.status(400).json({
              success: false,
              error: `Cannot record check-in for a ${trip.status} trip.`
            });
          }

          const now = new Date().toISOString();
          const { data, error } = await client
            .from('trip_checkins')
            .insert([{
              trip_id: tripId,
              user_id: userId,
              checked_in_at: now,
              location_consent: Boolean(req.body.location_consent ?? req.body.consent),
              latitude: req.body.latitude ?? null,
              longitude: req.body.longitude ?? null,
              accuracy: req.body.accuracy ?? null,
              message: req.body.message || "I'm safe",
              type: req.body.type || 'manual',
              battery_level: req.body.battery_level ?? req.body.batteryLevel ?? null,
              is_charging: req.body.is_charging ?? req.body.isCharging ?? null
            }])
            .select()
            .single();

          if (!error && data) {
            await client.from('trips').update({ last_check_in_at: now, updated_at: now }).eq('id', tripId);
            return res.status(201).json({
              success: true,
              data,
              message: 'Check-in recorded successfully.'
            });
          }

          if (error) {
            return res.status(500).json({
              success: false,
              error: 'Database operation failed while recording check-in: ' + error.message
            });
          }
        }
      } catch (sbErr) {
        return res.status(500).json({
          success: false,
          error: 'Database exception: ' + sbErr.message
        });
      }
    }

    const checkin = await firestoreService.createCheckin(userId, tripId, req.body);
    if (!checkin) {
      return res.status(404).json({
        success: false,
        error: `Trip not found or unauthorized for id: ${tripId}`
      });
    }

    res.status(201).json({
      success: true,
      data: checkin,
      message: 'Check-in recorded successfully.'
    });
  } catch (error) {
    next(error);
  }
}

export async function listTripCheckins(req, res, next) {
  try {
    const userId = req.user.uid;
    const { tripId } = req.params;

    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { data: trip } = await client
            .from('trips')
            .select('id')
            .eq('id', tripId)
            .eq('user_id', userId)
            .maybeSingle();

          if (!trip) {
            return res.status(404).json({
              success: false,
              error: `Trip not found or unauthorized for id: ${tripId}`
            });
          }

          const { data, error } = await client
            .from('trip_checkins')
            .select('*')
            .eq('trip_id', tripId)
            .order('checked_in_at', { ascending: false });

          if (!error && Array.isArray(data)) {
            return res.json({
              success: true,
              count: data.length,
              data
            });
          }
        }
      } catch (e) {}
    }

    const checkins = await firestoreService.listTripCheckins(userId, tripId);
    if (checkins === null) {
      return res.status(404).json({
        success: false,
        error: `Trip not found or unauthorized for id: ${tripId}`
      });
    }

    res.json({
      success: true,
      count: checkins.length,
      data: checkins
    });
  } catch (error) {
    next(error);
  }
}
