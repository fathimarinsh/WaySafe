import { api } from './api.js';
import { supabase, isSupabaseConfigured } from './supabase-config.js';

/**
 * Helper to check if current user has an active Supabase session
 */
async function hasSupabaseUser() {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return Boolean(session && session.user);
  } catch (e) {
    return false;
  }
}

/**
 * Normalizes PostgreSQL snake_case rows into UI-compatible camelCase objects
 */
function mapTrip(row) {
  if (!row) return null;
  const name = row.trip_name || row.title || 'Untitled Journey';
  const checkins = row.checkin_count ?? row.checkinCount ?? 0;
  return {
    id: row.id,
    userId: row.user_id,
    user_id: row.user_id,
    tripName: name,
    trip_name: name,
    title: name,
    startLocation: row.start_location,
    start_location: row.start_location,
    destination: row.destination,
    departureTime: row.departure_time,
    departure_time: row.departure_time,
    estimatedArrival: row.estimated_arrival,
    estimated_arrival: row.estimated_arrival,
    trustedContactId: row.trusted_contact_id,
    trusted_contact_id: row.trusted_contact_id,
    locationSharingConsent: Boolean(row.location_sharing_consent),
    location_sharing_consent: Boolean(row.location_sharing_consent),
    transportMode: row.transport_mode || 'transit',
    transport_mode: row.transport_mode || 'transit',
    emergencyNotes: row.emergency_notes || '',
    emergency_notes: row.emergency_notes || '',
    initialBattery: row.initial_battery,
    initial_battery: row.initial_battery,
    status: row.status,
    startedAt: row.started_at,
    started_at: row.started_at,
    completedAt: row.completed_at,
    completed_at: row.completed_at,
    lastCheckInAt: row.last_check_in_at,
    last_check_in_at: row.last_check_in_at,
    checkinCount: checkins,
    checkin_count: checkins,
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at
  };
}

function mapCheckin(row) {
  if (!row) return null;
  return {
    id: row.id,
    tripId: row.trip_id,
    trip_id: row.trip_id,
    userId: row.user_id,
    type: row.type,
    batteryLevel: row.battery_level,
    battery_level: row.battery_level,
    isCharging: row.is_charging,
    is_charging: row.is_charging,
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    locationConsent: row.location_consent,
    message: row.message,
    note: row.note,
    createdAt: row.created_at || row.checked_in_at,
    created_at: row.created_at || row.checked_in_at,
    checkedInAt: row.checked_in_at || row.created_at,
    checked_in_at: row.checked_in_at || row.created_at
  };
}

export const tripsService = {
  async list(filterOptions = {}) {
    const opts = typeof filterOptions === 'string' ? { status: filterOptions } : (filterOptions || {});
    const { status, sort = 'created_at', order = 'desc' } = opts;

    if (await hasSupabaseUser()) {
      let query = supabase
        .from('trips')
        .select('*');

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      query = query.order(sort, { ascending: order === 'asc' });

      const { data, error } = await query;
      if (error) {
        console.warn('[Supabase trips.list error]:', error);
      } else if (Array.isArray(data)) {
        return data.map(mapTrip);
      }
    }

    const params = new URLSearchParams();
    if (status && status !== 'all') params.set('status', status);
    if (sort) params.set('sort', sort);
    if (order) params.set('order', order);
    const queryString = params.toString();

    const res = await api.trips.list(queryString);
    return (res.data || []).map(mapTrip);
  },

  async getActive() {
    if (await hasSupabaseUser()) {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.warn('[Supabase trips.getActive error]:', error);
      } else if (data && data.length > 0) {
        return mapTrip(data[0]);
      } else {
        return null;
      }
    }
    const res = await api.trips.getActive();
    return res.data;
  },

  async getById(id) {
    if (await hasSupabaseUser()) {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.warn('[Supabase trips.getById error]:', error);
      } else if (data) {
        return mapTrip(data);
      }
    }
    const res = await api.trips.getById(id);
    return res.data;
  },

  async create(tripData) {
    const payload = {
      trip_name: tripData.trip_name || tripData.tripName || tripData.title,
      title: tripData.trip_name || tripData.tripName || tripData.title,
      start_location: tripData.start_location || tripData.startLocation || null,
      destination: tripData.destination,
      departure_time: tripData.departure_time || tripData.departureTime || null,
      estimated_arrival: tripData.estimated_arrival || tripData.estimatedArrival || null,
      trusted_contact_id: tripData.trusted_contact_id || tripData.trustedContactId || null,
      location_sharing_consent: Boolean(tripData.location_sharing_consent ?? tripData.locationSharingConsent),
      transport_mode: tripData.transport_mode || tripData.transportMode || 'transit',
      emergency_notes: tripData.emergency_notes || tripData.emergencyNotes || null,
      initial_battery: tripData.initial_battery !== undefined ? Number(tripData.initial_battery) : (tripData.initialBattery !== undefined ? Number(tripData.initialBattery) : null),
      status: tripData.status || 'planned'
    };

    if (await hasSupabaseUser()) {
      const { data, error } = await supabase
        .from('trips')
        .insert([{
          ...payload,
          started_at: payload.status === 'active' ? new Date().toISOString() : null
        }])
        .select()
        .single();

      if (error) {
        console.error('[Supabase trips.create error]:', error);
        throw error;
      }
      return mapTrip(data);
    }
    const res = await api.trips.create(payload);
    return res.data;
  },

  async start(id) {
    const res = await api.trips.start(id);
    return res.data;
  },

  async end(id, extra = {}) {
    const res = await api.trips.end(id, extra);
    return res.data;
  },

  async update(id, updates) {
    const res = await api.trips.update(id, updates);
    return res.data;
  },

  async updateStatus(id, status, extra = {}) {
    if (status === 'active') return this.start(id);
    if (status === 'completed') return this.end(id, extra);
    const res = await api.trips.updateStatus(id, status, extra);
    return res.data;
  },

  async delete(id) {
    if (await hasSupabaseUser()) {
      const { error } = await supabase
        .from('trips')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[Supabase trips.delete error]:', error);
        throw error;
      }
      return true;
    }
    await api.trips.delete(id);
    return true;
  },

  // Check-ins
  async recordCheckin(tripId, checkinData) {
    if (await hasSupabaseUser()) {
      const now = new Date().toISOString();
      const hasConsent = Boolean(
        checkinData.consent || 
        checkinData.locationConsent || 
        checkinData.location_consent
      );
      const payload = {
        trip_id: tripId,
        type: checkinData.type || 'manual',
        message: checkinData.message || "I'm safe",
        battery_level: checkinData.batteryLevel !== undefined ? Number(checkinData.batteryLevel) : (checkinData.battery_level !== undefined ? Number(checkinData.battery_level) : null),
        is_charging: checkinData.isCharging !== undefined ? Boolean(checkinData.isCharging) : (checkinData.is_charging !== undefined ? Boolean(checkinData.is_charging) : null),
        location_consent: hasConsent,
        latitude: hasConsent && checkinData.location ? (checkinData.location.latitude ?? checkinData.latitude ?? null) : null,
        longitude: hasConsent && checkinData.location ? (checkinData.location.longitude ?? checkinData.longitude ?? null) : null,
        accuracy: hasConsent && checkinData.location ? (checkinData.location.accuracy ?? checkinData.accuracy ?? null) : null,
        location: hasConsent && checkinData.location ? checkinData.location : null,
        checked_in_at: now
      };

      // Try trip_checkins table first
      let res = await supabase
        .from('trip_checkins')
        .insert([payload])
        .select()
        .single();

      if (res.error) {
        // Fallback to checkins table
        res = await supabase
          .from('checkins')
          .insert([{
            trip_id: tripId,
            type: payload.type,
            message: payload.message,
            battery_level: payload.battery_level,
            is_charging: payload.is_charging,
            location: payload.location,
            created_at: now
          }])
          .select()
          .single();
      }

      if (res.error) {
        console.error('[Supabase checkins.create error]:', res.error);
        throw res.error;
      }

      // Update trip's last_check_in_at
      await supabase
        .from('trips')
        .update({ last_check_in_at: now, updated_at: now })
        .eq('id', tripId)
        .catch(e => console.warn('[Supabase trip last_check_in_at update notice]:', e));

      return mapCheckin(res.data);
    }
    const res = await api.trips.checkin(tripId, checkinData);
    return res.data;
  },

  async getCheckins(tripId) {
    if (await hasSupabaseUser()) {
      let { data, error } = await supabase
        .from('trip_checkins')
        .select('*')
        .eq('trip_id', tripId)
        .order('checked_in_at', { ascending: false });

      if (error || !data) {
        const fallback = await supabase
          .from('checkins')
          .select('*')
          .eq('trip_id', tripId)
          .order('created_at', { ascending: false });
        data = fallback.data;
      }

      if (data) {
        return (data || []).map(mapCheckin);
      }
    }
    try {
      const res = await api.trips.getCheckins(tripId);
      return res.data || [];
    } catch (e) {
      const res = await api.checkins.listForTrip(tripId);
      return res.data || [];
    }
  },

  // UI Helpers
  getBadgeClass(status) {
    switch (status) {
      case 'active':
        return 'badge-teal';
      case 'completed':
        return 'badge-success';
      case 'cancelled':
        return 'badge-danger';
      case 'planned':
      default:
        return 'badge-navy';
    }
  },

  formatTransportIcon(mode) {
    switch (mode?.toLowerCase()) {
      case 'walking':
        return '🚶';
      case 'transit':
        return '🚆';
      case 'driving':
        return '🚗';
      case 'cycling':
        return '🚲';
      case 'rideshare':
        return '🚕';
      case 'flight':
        return '✈️';
      default:
        return '📍';
    }
  }
};
