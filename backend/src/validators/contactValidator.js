export function validateCreateContact(req, res, next) {
  const { name, phone, relationship, email } = req.body;
  const errors = [];

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('name is required and must be a non-empty string.');
  }

  if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
    errors.push('phone is required for emergency contact.');
  } else {
    // Basic phone pattern check
    const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '');
    if (cleanPhone.length < 5) {
      errors.push('phone number must have at least 5 digits.');
    }
  }

  if (email && typeof email === 'string' && email.trim().length > 0) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      errors.push('email format is invalid.');
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

export function validateUpdateContact(req, res, next) {
  const { name, phone, email } = req.body;
  const errors = [];

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      errors.push('name must be a non-empty string.');
    }
  }

  if (phone !== undefined) {
    if (typeof phone !== 'string' || phone.trim().length === 0) {
      errors.push('phone must be a non-empty string.');
    } else {
      const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '');
      if (cleanPhone.length < 5) {
        errors.push('phone number must have at least 5 digits.');
      }
    }
  }

  if (email !== undefined && email !== null && typeof email === 'string' && email.trim().length > 0) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      errors.push('email format is invalid.');
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

