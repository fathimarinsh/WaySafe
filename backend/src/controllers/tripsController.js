import { firestoreService } from '../services/firestoreService.js';
import { isSupabaseConfigured, getUserClient, supabaseAdmin } from '../config/supabase.js';

function mapTripRow(row) {
  if (!row) return null;
  const name = row.trip_name || row.title || 'Untitled Journey';
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
    status: row.status,
    transportMode: row.transport_mode || 'transit',
    transport_mode: row.transport_mode || 'transit',
    emergencyNotes: row.emergency_notes || '',
    emergency_notes: row.emergency_notes || '',
    initialBattery: row.initial_battery ?? null,
    initial_battery: row.initial_battery ?? null,
    startedAt: row.started_at,
    started_at: row.started_at,
    completedAt: row.completed_at,
    completed_at: row.completed_at,
    lastCheckInAt: row.last_check_in_at,
    last_check_in_at: row.last_check_in_at,
    checkinCount: row.checkin_count ?? row.checkinCount ?? 0,
    checkin_count: row.checkin_count ?? row.checkinCount ?? 0,
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at
  };
}

/**
 * Validate that a trusted contact ID, if specified, actually belongs to the authenticated user.
 */
async function validateContactBelongsToUser(userId, contactId, token, isMock) {
  if (!contactId) return true;

  // Supabase check
  if (isSupabaseConfigured && token && !isMock) {
    try {
      const client = getUserClient(token) || supabaseAdmin;
      if (client) {
        const { data, error } = await client
          .from('contacts')
          .select('id')
          .eq('id', contactId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!error && data) return true;
        if (error) console.warn('[tripsController] Contact validation notice:', error.message);
      }
    } catch (e) {
      console.warn('[tripsController] Contact validation exception:', e.message);
    }
  }

  // Fallback store check
  const contact = await firestoreService.getContactById(userId, contactId);
  return Boolean(contact);
}

/**
 * POST /api/trips
 * Create new trip (planned or active)
 */
export async function createTrip(req, res, next) {
  try {
    const userId = req.user.uid;
    const body = req.body || {};

    const dest = body.destination;
    const destName = typeof dest === 'object' ? (dest.name || 'Destination') : String(dest);
    const tripName = body.trip_name || body.tripName || body.title || `Trip to ${destName}`;
    const contactId = body.trusted_contact_id || body.trustedContactId || null;

    // Validate trusted contact ownership
    if (contactId) {
      const isOwner = await validateContactBelongsToUser(userId, contactId, req.user.token, req.user.isMock);
      if (!isOwner) {
        return res.status(400).json({
          success: false,
          error: 'Invalid trusted_contact_id: Contact not found or does not belong to you.'
        });
      }
    }

    const status = body.status === 'active' ? 'active' : (body.status || 'planned');
    const now = new Date().toISOString();
    const startedAt = status === 'active' ? (body.started_at || body.startedAt || now) : null;

    const payload = {
      user_id: userId,
      trip_name: tripName,
      title: tripName,
      start_location: body.start_location || body.startLocation || null,
      destination: dest,
      departure_time: body.departure_time || body.departureTime || (status === 'active' ? now : null),
      estimated_arrival: body.estimated_arrival || body.estimatedArrival || null,
      trusted_contact_id: contactId,
      location_sharing_consent: Boolean(body.location_sharing_consent ?? body.locationSharingConsent),
      transport_mode: body.transport_mode || body.transportMode || 'transit',
      emergency_notes: body.emergency_notes || body.emergencyNotes || '',
      initial_battery: body.initial_battery ?? body.initialBattery ?? null,
      status,
      started_at: startedAt,
      completed_at: null,
      last_check_in_at: status === 'active' ? now : null,
      created_at: now,
      updated_at: now
    };

    // 1. Supabase attempt
    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { data, error } = await client
            .from('trips')
            .insert([payload])
            .select()
            .single();

          if (!error && data) {
            return res.status(201).json({
              success: true,
              data: mapTripRow(data),
              message: 'Trip created successfully.'
            });
          }

          if (error) {
            console.error('[tripsController Supabase createTrip error]:', error.message);
            return res.status(500).json({
              success: false,
              error: 'Database operation failed while creating trip: ' + error.message
            });
          }
        }
      } catch (sbErr) {
        console.error('[tripsController] Supabase createTrip exception:', sbErr.message);
        return res.status(500).json({
          success: false,
          error: 'Database exception: ' + sbErr.message
        });
      }
    }

    // 2. Fallback store
    const trip = await firestoreService.createTrip(userId, payload);
    return res.status(201).json({
      success: true,
      data: mapTripRow(trip),
      message: 'Trip created successfully.'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/trips
 * List all trips for current authenticated user with validated status filtering and safe sorting
 */
export async function listTrips(req, res, next) {
  try {
    const userId = req.user.uid;
    const { status, sort = 'created_at', order = 'desc' } = req.query;

    const allowedStatuses = ['planned', 'active', 'completed', 'cancelled'];
    if (status && status !== 'all' && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status filter '${status}'. Allowed values: ${allowedStatuses.join(', ')}`
      });
    }

    const allowedSortFields = ['created_at', 'departure_time', 'updated_at', 'started_at', 'completed_at'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
    const isAsc = String(order).toLowerCase() === 'asc';

    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          let query = client
            .from('trips')
            .select('*')
            .eq('user_id', userId)
            .order(sortField, { ascending: isAsc });

          if (status && status !== 'all') {
            query = query.eq('status', status);
          }

          const { data, error } = await query;
          if (!error && Array.isArray(data)) {
            const tripIds = data.map(d => d.id);
            let countsMap = {};
            if (tripIds.length > 0) {
              const { data: chkData } = await client
                .from('checkins')
                .select('trip_id')
                .in('trip_id', tripIds);
              if (chkData) {
                chkData.forEach(c => {
                  countsMap[c.trip_id] = (countsMap[c.trip_id] || 0) + 1;
                });
              }
            }

            return res.json({
              success: true,
              count: data.length,
              data: data.map(row => {
                const mapped = mapTripRow(row);
                mapped.checkinCount = countsMap[row.id] || 0;
                mapped.checkin_count = countsMap[row.id] || 0;
                return mapped;
              })
            });
          }
        }
      } catch (sbErr) {
        console.warn('[tripsController] Supabase listTrips notice:', sbErr.message);
      }
    }

    let trips = await firestoreService.listTrips(userId);
    if (status && status !== 'all') {
      trips = trips.filter(t => t.status === status);
    }

    trips.sort((a, b) => {
      const valA = new Date(a[sortField] || a.createdAt || 0).getTime();
      const valB = new Date(b[sortField] || b.createdAt || 0).getTime();
      return isAsc ? valA - valB : valB - valA;
    });

    return res.json({
      success: true,
      count: trips.length,
      data: trips.map(mapTripRow)
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/trips/active
 * Retrieve current user's active journey if any
 */
export async function getActiveTrip(req, res, next) {
  try {
    const userId = req.user.uid;

    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { data, error } = await client
            .from('trips')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1);

          if (!error) {
            return res.json({
              success: true,
              data: data && data.length > 0 ? mapTripRow(data[0]) : null
            });
          }
        }
      } catch (sbErr) {
        console.warn('[tripsController] Supabase getActiveTrip notice:', sbErr.message);
      }
    }

    const trip = await firestoreService.getActiveTrip(userId);
    return res.json({
      success: true,
      data: mapTripRow(trip)
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/trips/:id
 * Retrieve trip by ID strictly scoped to user_id
 */
export async function getTripById(req, res, next) {
  try {
    const userId = req.user.uid;
    const { id } = req.params;

    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { data, error } = await client
            .from('trips')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .maybeSingle();

          if (!error && data) {
            let count = 0;
            const { count: tcCount, error: tcErr } = await client
              .from('trip_checkins')
              .select('*', { count: 'exact', head: true })
              .eq('trip_id', id);
            if (!tcErr && typeof tcCount === 'number' && tcCount > 0) {
              count = tcCount;
            } else {
              const { count: cCount } = await client
                .from('checkins')
                .select('*', { count: 'exact', head: true })
                .eq('trip_id', id);
              if (typeof cCount === 'number') count = cCount;
            }
            const mapped = mapTripRow(data);
            mapped.checkinCount = count;
            mapped.checkin_count = count;
            return res.json({
              success: true,
              data: mapped
            });
          }
        }
      } catch (sbErr) {
        console.warn('[tripsController] Supabase getTripById notice:', sbErr.message);
      }
    }

    const trip = await firestoreService.getTripById(userId, id);
    if (!trip) {
      return res.status(404).json({
        success: false,
        error: `Trip not found with id: ${id}`
      });
    }

    return res.json({
      success: true,
      data: mapTripRow(trip)
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/trips/:id
 * General trip updates with status transition validation
 */
export async function updateTrip(req, res, next) {
  try {
    const userId = req.user.uid;
    const { id } = req.params;
    const body = req.body || {};

    // 1. Fetch existing trip
    let existing = null;
    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { data } = await client.from('trips').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
          if (data) existing = data;
        }
      } catch (e) {}
    }
    if (!existing) {
      existing = await firestoreService.getTripById(userId, id);
    }

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Trip not found with id: ${id}`
      });
    }

    // 2. Validate contact ownership if changing contact
    const contactId = body.trusted_contact_id || body.trustedContactId;
    if (contactId && contactId !== existing.trusted_contact_id) {
      const isOwner = await validateContactBelongsToUser(userId, contactId, req.user.token, req.user.isMock);
      if (!isOwner) {
        return res.status(400).json({
          success: false,
          error: 'Invalid trusted_contact_id: Contact not found or does not belong to you.'
        });
      }
    }

    // 3. Validate status transitions
    const newStatus = body.status;
    const currentStatus = existing.status || 'planned';
    if (newStatus && newStatus !== currentStatus) {
      if (currentStatus === 'completed' || currentStatus === 'cancelled') {
        return res.status(400).json({
          success: false,
          error: `Invalid status transition: Cannot change from '${currentStatus}' to '${newStatus}'.`
        });
      }
      if (currentStatus === 'planned' && newStatus === 'completed') {
        return res.status(400).json({
          success: false,
          error: `Invalid status transition: Cannot change from 'planned' directly to 'completed'. Trip must be started first.`
        });
      }
      if (currentStatus === 'active' && newStatus === 'planned') {
        return res.status(400).json({
          success: false,
          error: `Invalid status transition: Cannot change from 'active' back to 'planned'.`
        });
      }
    }

    // 4. Build updates
    const now = new Date().toISOString();
    const updates = {
      updated_at: now
    };

    if (body.trip_name || body.tripName || body.title) {
      const name = body.trip_name || body.tripName || body.title;
      updates.trip_name = name;
      updates.title = name;
    }
    if (body.start_location !== undefined || body.startLocation !== undefined) {
      updates.start_location = body.start_location || body.startLocation || null;
    }
    if (body.destination !== undefined) {
      updates.destination = body.destination;
    }
    if (body.departure_time !== undefined || body.departureTime !== undefined) {
      updates.departure_time = body.departure_time || body.departureTime || null;
    }
    if (body.estimated_arrival !== undefined || body.estimatedArrival !== undefined) {
      updates.estimated_arrival = body.estimated_arrival || body.estimatedArrival || null;
    }
    if (body.trusted_contact_id !== undefined || body.trustedContactId !== undefined) {
      updates.trusted_contact_id = body.trusted_contact_id || body.trustedContactId || null;
    }
    if (body.location_sharing_consent !== undefined || body.locationSharingConsent !== undefined) {
      updates.location_sharing_consent = Boolean(body.location_sharing_consent ?? body.locationSharingConsent);
    }
    if (body.transport_mode || body.transportMode) {
      updates.transport_mode = body.transport_mode || body.transportMode;
    }
    if (body.emergency_notes !== undefined || body.emergencyNotes !== undefined) {
      updates.emergency_notes = body.emergency_notes || body.emergencyNotes;
    }
    if (body.initial_battery !== undefined || body.initialBattery !== undefined) {
      updates.initial_battery = body.initial_battery ?? body.initialBattery;
    }

    if (newStatus) {
      updates.status = newStatus;
      if (newStatus === 'active' && !existing.started_at) {
        updates.started_at = now;
      } else if (newStatus === 'completed' && !existing.completed_at) {
        updates.completed_at = now;
      }
    }

    // 5. Save updates
    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { data, error } = await client
            .from('trips')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

          if (!error && data) {
            return res.json({
              success: true,
              data: mapTripRow(data),
              message: 'Trip updated successfully.'
            });
          }

          if (error) {
            console.error('[tripsController Supabase updateTrip error]:', error.message);
            return res.status(500).json({
              success: false,
              error: 'Database operation failed while updating trip: ' + error.message
            });
          }
        }
      } catch (e) {
        console.error('[tripsController Supabase updateTrip exception]:', e.message);
        return res.status(500).json({
          success: false,
          error: 'Database exception: ' + e.message
        });
      }
    }

    const updated = await firestoreService.updateTrip(userId, id, updates);
    return res.json({
      success: true,
      data: mapTripRow(updated),
      message: 'Trip updated successfully.'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/trips/:id/start
 * Starts a planned trip, setting status to 'active' and started_at to now()
 */
export async function startTrip(req, res, next) {
  try {
    const userId = req.user.uid;
    const { id } = req.params;

    // Fetch existing
    let existing = null;
    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { data } = await client.from('trips').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
          if (data) existing = data;
        }
      } catch (e) {}
    }
    if (!existing) {
      existing = await firestoreService.getTripById(userId, id);
    }

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Trip not found with id: ${id}`
      });
    }

    // Status transition enforcement
    if (existing.status === 'active') {
      return res.status(400).json({
        success: false,
        error: 'Trip is already active.'
      });
    }

    if (existing.status === 'completed' || existing.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: `Cannot start a trip that is already '${existing.status}'.`
      });
    }

    const now = new Date().toISOString();
    const updates = {
      status: 'active',
      started_at: existing.started_at || now,
      last_check_in_at: now,
      updated_at: now
    };

    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { data, error } = await client
            .from('trips')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

          if (!error && data) {
            return res.json({
              success: true,
              data: mapTripRow(data),
              message: 'Trip started successfully.'
            });
          }

          if (error) {
            console.error('[tripsController Supabase startTrip error]:', error.message);
            return res.status(500).json({
              success: false,
              error: 'Database operation failed while starting trip: ' + error.message
            });
          }
        }
      } catch (e) {
        console.error('[tripsController Supabase startTrip exception]:', e.message);
        return res.status(500).json({
          success: false,
          error: 'Database exception: ' + e.message
        });
      }
    }

    const updated = await firestoreService.updateTrip(userId, id, updates);
    return res.json({
      success: true,
      data: mapTripRow(updated),
      message: 'Trip started successfully.'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/trips/:id/end
 * Completes an active trip after user confirmation, sets completed_at and records safe arrival
 */
export async function endTrip(req, res, next) {
  try {
    const userId = req.user.uid;
    const { id } = req.params;

    // Fetch existing
    let existing = null;
    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { data } = await client.from('trips').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
          if (data) existing = data;
        }
      } catch (e) {}
    }
    if (!existing) {
      existing = await firestoreService.getTripById(userId, id);
    }

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Trip not found with id: ${id}`
      });
    }

    if (existing.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Trip has already been completed.'
      });
    }

    if (existing.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Cannot end a cancelled trip.'
      });
    }

    if (existing.status === 'planned') {
      return res.status(400).json({
        success: false,
        error: 'Cannot complete a planned trip that has not been started.'
      });
    }

    const now = new Date().toISOString();
    const updates = {
      status: 'completed',
      completed_at: now,
      last_check_in_at: now,
      updated_at: now
    };

    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { data, error } = await client
            .from('trips')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

          if (!error && data) {
            // Also record safe arrival check-in automatically
            await client.from('checkins').insert([{
              trip_id: id,
              user_id: userId,
              type: 'safe_arrival',
              message: req.body.message || 'Safe arrival confirmed. Journey completed.',
              battery_level: req.body.batteryLevel ?? req.body.battery_level ?? null,
              created_at: now
            }]).catch(e => console.warn('[endTrip checkin notice]:', e.message));

            return res.json({
              success: true,
              data: mapTripRow(data),
              message: 'Trip completed safely.'
            });
          }

          if (error) {
            console.error('[tripsController Supabase endTrip error]:', error.message);
            return res.status(500).json({
              success: false,
              error: 'Database operation failed while completing trip: ' + error.message
            });
          }
        }
      } catch (e) {
        console.error('[tripsController Supabase endTrip exception]:', e.message);
        return res.status(500).json({
          success: false,
          error: 'Database exception: ' + e.message
        });
      }
    }

    const updated = await firestoreService.updateTrip(userId, id, updates);

    // Record check-in in fallback store
    await firestoreService.createCheckin(userId, id, {
      type: 'safe_arrival',
      message: req.body.message || 'Safe arrival confirmed. Journey completed.',
      batteryLevel: req.body.batteryLevel ?? req.body.battery_level ?? null
    }).catch(e => console.warn(e));

    return res.json({
      success: true,
      data: mapTripRow(updated),
      message: 'Trip completed safely.'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/trips/:id/status
 * Backward-compatible endpoint for status updates
 */
export async function updateTripStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (status === 'active') return startTrip(req, res, next);
    if (status === 'completed') return endTrip(req, res, next);
    return updateTrip(req, res, next);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/trips/:id
 */
export async function deleteTrip(req, res, next) {
  try {
    const userId = req.user.uid;
    const { id } = req.params;

    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { error } = await client
            .from('trips')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

          if (!error) {
            return res.json({
              success: true,
              message: 'Trip deleted successfully.'
            });
          }

          if (error) {
            console.error('[tripsController Supabase deleteTrip error]:', error.message);
            return res.status(500).json({
              success: false,
              error: 'Database operation failed while deleting trip: ' + error.message
            });
          }
        }
      } catch (e) {
        console.error('[tripsController Supabase deleteTrip exception]:', e.message);
        return res.status(500).json({
          success: false,
          error: 'Database exception: ' + e.message
        });
      }
    }

    const deleted = await firestoreService.deleteTrip(userId, id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: `Trip not found with id: ${id}`
      });
    }

    return res.json({
      success: true,
      message: 'Trip deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/trips/:id/checkins
 * Record a check-in with server-generated timestamp, verify trip ownership,
 * update last_check_in_at, and optionally save consensual coordinates.
 */
export async function createTripCheckin(req, res, next) {
  try {
    const userId = req.user.uid;
    const { id } = req.params;
    const body = req.body || {};

    // 1. Verify trip existence and ownership
    let trip = null;
    let client = null;

    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { data, error } = await client
            .from('trips')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .maybeSingle();

          if (!error && data) {
            trip = data;
          }
        }
      } catch (e) {
        console.warn('[createTripCheckin Supabase fetch notice]:', e.message);
      }
    }

    if (!trip) {
      trip = await firestoreService.getTripById(userId, id);
    }

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: `Trip not found or unauthorized for id: ${id}`
      });
    }

    // Verify trip is active / not completed
    if (trip.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot record check-in for a completed trip.'
      });
    }

    if (trip.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Cannot record check-in for a cancelled trip.'
      });
    }

    // 2. Server-generated timestamp
    const serverTimestamp = new Date().toISOString();

    // 3. Location consent validation
    const hasConsent = Boolean(
      body.consent === true ||
      body.locationConsent === true ||
      body.location_consent === true ||
      body.explicitConsent === true
    );

    let lat = null;
    let lng = null;
    let acc = null;
    let locObj = null;

    if (hasConsent && body.location) {
      const candidateLat = body.location.latitude ?? body.latitude;
      const candidateLng = body.location.longitude ?? body.longitude;
      const candidateAcc = body.location.accuracy ?? body.accuracy;

      if (typeof candidateLat === 'number' && typeof candidateLng === 'number' &&
          !isNaN(candidateLat) && !isNaN(candidateLng) &&
          candidateLat >= -90 && candidateLat <= 90 &&
          candidateLng >= -180 && candidateLng <= 180) {
        lat = candidateLat;
        lng = candidateLng;
        acc = typeof candidateAcc === 'number' ? candidateAcc : null;
        locObj = {
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          timestamp: serverTimestamp
        };
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid coordinates provided for location check-in.'
        });
      }
    }

    const checkinPayload = {
      trip_id: id,
      user_id: userId,
      checked_in_at: serverTimestamp,
      location_consent: hasConsent,
      latitude: lat,
      longitude: lng,
      accuracy: acc,
      location: locObj,
      message: body.message || "I'm safe",
      type: body.type || 'manual',
      battery_level: body.batteryLevel ?? body.battery_level ?? null,
      is_charging: body.isCharging ?? body.is_charging ?? null,
      created_at: serverTimestamp
    };

    let savedCheckin = null;

    // 4. Record to Supabase if configured and user is authentic
    if (client) {
      try {
        // Try trip_checkins table first
        let insertRes = await client
          .from('trip_checkins')
          .insert([checkinPayload])
          .select()
          .single();

        if (insertRes.error) {
          // Fallback to checkins table
          const fallbackPayload = {
            trip_id: id,
            user_id: userId,
            type: checkinPayload.type,
            battery_level: checkinPayload.battery_level,
            is_charging: checkinPayload.is_charging,
            location: locObj,
            message: checkinPayload.message,
            created_at: serverTimestamp
          };
          insertRes = await client
            .from('checkins')
            .insert([fallbackPayload])
            .select()
            .single();
        }

        if (insertRes.error) {
          console.error('[createTripCheckin Supabase insert error]:', insertRes.error);
          return res.status(500).json({
            success: false,
            error: 'Database operation failed while recording check-in: ' + insertRes.error.message
          });
        }

        // Update trip last_check_in_at
        const updateTripRes = await client
          .from('trips')
          .update({
            last_check_in_at: serverTimestamp,
            updated_at: serverTimestamp
          })
          .eq('id', id)
          .eq('user_id', userId);

        if (updateTripRes.error) {
          console.error('[createTripCheckin trip update error]:', updateTripRes.error);
          return res.status(500).json({
            success: false,
            error: 'Failed to update last_check_in_at on trip: ' + updateTripRes.error.message
          });
        }

        savedCheckin = {
          id: insertRes.data.id,
          tripId: id,
          trip_id: id,
          userId: userId,
          user_id: userId,
          checkedInAt: insertRes.data.checked_in_at || insertRes.data.created_at || serverTimestamp,
          checked_in_at: insertRes.data.checked_in_at || insertRes.data.created_at || serverTimestamp,
          locationConsent: hasConsent,
          location_consent: hasConsent,
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          location: locObj,
          message: checkinPayload.message,
          type: checkinPayload.type,
          batteryLevel: checkinPayload.battery_level,
          isCharging: checkinPayload.is_charging,
          createdAt: serverTimestamp
        };
      } catch (dbErr) {
        console.error('[createTripCheckin DB Exception]:', dbErr);
        return res.status(500).json({
          success: false,
          error: 'Database exception occurred during check-in persistence.'
        });
      }
    }

    // Fallback store
    if (!savedCheckin) {
      savedCheckin = await firestoreService.createTripCheckin(userId, id, checkinPayload);
      if (!savedCheckin) {
        return res.status(500).json({
          success: false,
          error: 'Failed to record check-in in datastore.'
        });
      }
    }

    // 5. Return success only after the database operation succeeds
    return res.status(201).json({
      success: true,
      data: savedCheckin,
      message: 'Check-in recorded successfully.'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/trips/:id/checkins
 * List check-ins for a trip
 */
export async function listTripCheckins(req, res, next) {
  try {
    const userId = req.user.uid;
    const { id } = req.params;

    let trip = null;
    let client = null;

    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { data } = await client
            .from('trips')
            .select('id, user_id')
            .eq('id', id)
            .eq('user_id', userId)
            .maybeSingle();
          if (data) trip = data;
        }
      } catch (e) {}
    }

    if (!trip) {
      trip = await firestoreService.getTripById(userId, id);
    }

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: `Trip not found or unauthorized for id: ${id}`
      });
    }

    if (client) {
      try {
        let { data, error } = await client
          .from('trip_checkins')
          .select('*')
          .eq('trip_id', id)
          .eq('user_id', userId)
          .order('checked_in_at', { ascending: false });

        if (error || !data) {
          const fallback = await client
            .from('checkins')
            .select('*')
            .eq('trip_id', id)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
          data = fallback.data;
        }

        if (data) {
          return res.json({
            success: true,
            count: data.length,
            data: data.map(chk => ({
              id: chk.id,
              tripId: chk.trip_id,
              trip_id: chk.trip_id,
              userId: chk.user_id,
              user_id: chk.user_id,
              checkedInAt: chk.checked_in_at || chk.created_at,
              checked_in_at: chk.checked_in_at || chk.created_at,
              locationConsent: Boolean(chk.location_consent),
              latitude: chk.latitude,
              longitude: chk.longitude,
              accuracy: chk.accuracy,
              location: chk.location || (chk.latitude ? { latitude: chk.latitude, longitude: chk.longitude, accuracy: chk.accuracy } : null),
              message: chk.message,
              type: chk.type,
              batteryLevel: chk.battery_level,
              createdAt: chk.created_at
            }))
          });
        }
      } catch (e) {}
    }

    const checkins = await firestoreService.listTripCheckins(userId, id);
    return res.json({
      success: true,
      count: checkins ? checkins.length : 0,
      data: checkins || []
    });
  } catch (error) {
    next(error);
  }
}
