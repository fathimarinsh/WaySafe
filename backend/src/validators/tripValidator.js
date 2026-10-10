export function validateCreateTrip(req, res, next) {
  const body = req.body || {};
  const destination = body.destination;
  const departureTime = body.departure_time || body.departureTime;
  const estimatedArrival = body.estimated_arrival || body.estimatedArrival;
  const transportMode = body.transport_mode || body.transportMode;
  const initialBattery = body.initial_battery ?? body.initialBattery;
  const errors = [];

  // Destination is strictly required
  if (!destination) {
    errors.push('destination is required.');
  } else if (typeof destination === 'string' && destination.trim().length === 0) {
    errors.push('destination cannot be an empty string.');
  } else if (typeof destination === 'object') {
    if (!destination.name && (!destination.latitude || !destination.longitude)) {
      errors.push('destination must include a name or coordinates (latitude and longitude).');
    }
  }

  // Validate departure date/time format if provided
  let depDate = null;
  if (departureTime) {
    depDate = new Date(departureTime);
    if (isNaN(depDate.getTime())) {
      errors.push('departure_time must be a valid ISO date/time string.');
    }
  }

  // Validate estimated arrival date/time format if provided
  let arrDate = null;
  if (estimatedArrival) {
    arrDate = new Date(estimatedArrival);
    if (isNaN(arrDate.getTime())) {
      errors.push('estimated_arrival must be a valid ISO date/time string.');
    }
  }

  // Enforce: Estimated arrival must be after departure time
  if (depDate && arrDate && !isNaN(depDate.getTime()) && !isNaN(arrDate.getTime())) {
    if (arrDate.getTime() <= depDate.getTime()) {
      errors.push('estimated_arrival must be later than departure_time.');
    }
  }

  // Optional transport mode validation
  const validModes = ['walking', 'transit', 'driving', 'cycling', 'rideshare', 'flight', 'other'];
  if (transportMode && !validModes.includes(String(transportMode).toLowerCase())) {
    errors.push(`transport_mode must be one of: ${validModes.join(', ')}`);
  }

  // Optional initial battery validation
  if (initialBattery !== undefined && initialBattery !== null) {
    const bat = Number(initialBattery);
    if (isNaN(bat) || bat < 0 || bat > 100) {
      errors.push('initial_battery must be a number between 0 and 100.');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
}

export function validateUpdateTrip(req, res, next) {
  const body = req.body || {};
  const departureTime = body.departure_time || body.departureTime;
  const estimatedArrival = body.estimated_arrival || body.estimatedArrival;
  const status = body.status;
  const errors = [];

  const allowedStatuses = ['planned', 'active', 'completed', 'cancelled'];
  if (status && !allowedStatuses.includes(status)) {
    errors.push(`status must be one of: ${allowedStatuses.join(', ')}`);
  }

  let depDate = null;
  if (departureTime) {
    depDate = new Date(departureTime);
    if (isNaN(depDate.getTime())) {
      errors.push('departure_time must be a valid ISO date/time string.');
    }
  }

  let arrDate = null;
  if (estimatedArrival) {
    arrDate = new Date(estimatedArrival);
    if (isNaN(arrDate.getTime())) {
      errors.push('estimated_arrival must be a valid ISO date/time string.');
    }
  }

  if (depDate && arrDate && !isNaN(depDate.getTime()) && !isNaN(arrDate.getTime())) {
    if (arrDate.getTime() <= depDate.getTime()) {
      errors.push('estimated_arrival must be later than departure_time.');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
}

export function validateUpdateTripStatus(req, res, next) {
  const { status } = req.body;
  const allowedStatuses = ['planned', 'active', 'completed', 'cancelled'];

  if (!status || !allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `status must be one of: ${allowedStatuses.join(', ')}`
    });
  }

  next();
}
