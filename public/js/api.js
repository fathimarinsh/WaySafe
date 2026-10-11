import { getIdToken } from './auth.js';

// On Vercel or production hosting, use relative /api.
// When running locally on port 5000, use relative /api.
// When running locally on dev server (port 5500, 3000, etc.), point to http://localhost:5000/api.
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE_URL = (!isLocalhost || window.location.port === '5000' || !window.location.port)
  ? '/api'
  : `${window.location.protocol}//${window.location.hostname}:5000/api`;

export class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(endpoint, options = {}) {
  const token = await getIdToken();
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errMsg = (data && data.error) ? data.error : `HTTP error ${response.status}: ${response.statusText}`;
      throw new ApiError(errMsg, response.status, data?.details);
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // Network / offline error
    console.error(`API Network Failure [${endpoint}]:`, error);
    throw new ApiError('Unable to connect to WaySafe server. Please ensure the backend is running.', 0);
  }
}

export const api = {
  // Base HTTP helpers
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),

  // System Health
  getHealth: () => request('/health', { method: 'GET' }),

  // Trips Endpoints
  trips: {
    list: (params = '') => request(`/trips${params ? `?${params}` : ''}`, { method: 'GET' }),
    getActive: () => request('/trips/active', { method: 'GET' }),
    getById: (id) => request(`/trips/${id}`, { method: 'GET' }),
    create: (tripData) => request('/trips', { method: 'POST', body: JSON.stringify(tripData) }),
    update: (id, updates) => request(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    start: (id) => request(`/trips/${id}/start`, { method: 'POST' }),
    end: (id, extra = {}) => request(`/trips/${id}/end`, { method: 'POST', body: JSON.stringify(extra) }),
    checkin: (id, checkinData) => request(`/trips/${id}/checkins`, { method: 'POST', body: JSON.stringify(checkinData) }),
    getCheckins: (id) => request(`/trips/${id}/checkins`, { method: 'GET' }),
    updateStatus: (id, status, extra = {}) => request(`/trips/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...extra })
    }),
    // Emergency Trip Sharing and QR Code Methods
    getShareToken: (id) => request(`/trips/${id}/share-token`, { method: 'GET' }),
    generateShareToken: (id, options = {}) => request(`/trips/${id}/share-token/generate`, { method: 'POST', body: JSON.stringify(options) }),
    revokeShareToken: (id) => request(`/trips/${id}/share-token/revoke`, { method: 'POST' }),
    updateShareSettings: (id, settings) => request(`/trips/${id}/share-token/settings`, { method: 'PATCH', body: JSON.stringify(settings) }),
    getPublicShare: (token) => request(`/trips/public/${encodeURIComponent(token)}`, { method: 'GET' }),
    delete: (id) => request(`/trips/${id}`, { method: 'DELETE' })
  },

  // Emergency Contacts Endpoints
  contacts: {
    list: () => request('/contacts', { method: 'GET' }),
    create: (contactData) => request('/contacts', { method: 'POST', body: JSON.stringify(contactData) }),
    update: (id, contactData) => request(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(contactData) }),
    delete: (id) => request(`/contacts/${id}`, { method: 'DELETE' })
  },

  // Check-ins Endpoints
  checkins: {
    create: (checkinData) => request('/checkins', { method: 'POST', body: JSON.stringify(checkinData) }),
    listForTrip: (tripId) => request(`/checkins/trip/${tripId}`, { method: 'GET' })
  },

  // User Profile Endpoints
  profile: {
    get: () => request('/profile', { method: 'GET' }),
    save: (profileData) => request('/profile', { method: 'POST', body: JSON.stringify(profileData) })
  }
};
