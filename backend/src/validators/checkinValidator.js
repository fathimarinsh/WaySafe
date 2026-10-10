export function validateCheckin(req, res, next) {
  const { tripId, batteryLevel, location, type } = req.body;
  const errors = [];

  if (!tripId || typeof tripId !== 'string' || tripId.trim().length === 0) {
    errors.push('tripId is required and must be a non-empty string.');
  }

  if (batteryLevel !== undefined && batteryLevel !== null) {
    const bat = Number(batteryLevel);
    if (isNaN(bat) || bat < 0 || bat > 100) {
      errors.push('batteryLevel must be a number between 0 and 100.');
    }
  }

  if (location !== undefined && location !== null) {
    if (typeof location !== 'object') {
      errors.push('location must be an object containing latitude and longitude.');
    } else {
      if (location.latitude !== undefined && (typeof location.latitude !== 'number' || isNaN(location.latitude))) {
        errors.push('location.latitude must be a valid number.');
      }
      if (location.longitude !== undefined && (typeof location.longitude !== 'number' || isNaN(location.longitude))) {
        errors.push('location.longitude must be a valid number.');
      }
    }
  }

  const validTypes = ['manual', 'auto', 'low_battery_warning', 'sos_alert', 'safe_arrival', 'status_update'];
  if (type && !validTypes.includes(type)) {
    errors.push(`type must be one of: ${validTypes.join(', ')}`);
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
