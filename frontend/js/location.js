/**
 * WaySafe - Geolocation Helper
 * 
 * CORE PRINCIPLES & REALISTIC LIMITATIONS:
 * 1. Web applications CANNOT reliably track GPS location in the background when the phone
 *    screen is turned off or when navigating to another app, due to OS and browser sandboxing.
 * 2. We ALWAYS request explicit user confirmation and consent before acquiring or sharing coordinates.
 * 3. We NEVER fabricate coordinates. If GPS fails or user denies permission, we handle it gracefully.
 * 4. We clearly distinguish between fresh, stale, and unavailable location data.
 */

export const locationService = {
  isSupported() {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  },

  /**
   * Validate latitude and longitude numerical bounds
   */
  isValidCoordinates(latitude, longitude) {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
    if (isNaN(latitude) || isNaN(longitude)) return false;
    return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  },

  /**
   * Format coordinates into human-readable direction representation
   */
  formatCoordinates(latitude, longitude) {
    if (!this.isValidCoordinates(latitude, longitude)) return 'Unavailable';
    const latDir = latitude >= 0 ? 'N' : 'S';
    const lngDir = longitude >= 0 ? 'E' : 'W';
    return `${Math.abs(latitude).toFixed(4)}° ${latDir}, ${Math.abs(longitude).toFixed(4)}° ${lngDir}`;
  },

  /**
   * Check if location timestamp is stale (older than maxAgeMinutes)
   */
  isStale(timestamp, maxAgeMinutes = 5) {
    if (!timestamp) return true;
    const ageMs = Date.now() - new Date(timestamp).getTime();
    return ageMs > (maxAgeMinutes * 60 * 1000);
  },

  /**
   * Request user's current GPS location with explicit consent
   */
  getCurrentPosition(options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isSupported()) {
        return reject({
          code: 'UNSUPPORTED',
          message: 'Geolocation is not supported by your current browser.'
        });
      }

      const defaultOptions = {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15000,
        ...options
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          if (!this.isValidCoordinates(lat, lng)) {
            return reject({
              code: 'INVALID_COORDINATES',
              message: 'Browser returned invalid latitude/longitude readings.'
            });
          }

          resolve({
            latitude: lat,
            longitude: lng,
            accuracy: Math.round(position.coords.accuracy),
            altitude: position.coords.altitude,
            speed: position.coords.speed,
            timestamp: position.timestamp || Date.now(),
            formatted: this.formatCoordinates(lat, lng)
          });
        },
        (error) => {
          let message = 'An unknown location error occurred.';
          let code = 'UNKNOWN';

          switch (error.code) {
            case error.PERMISSION_DENIED:
              code = 'PERMISSION_DENIED';
              message = 'Location permission was denied. Please allow location access in your browser to share your position.';
              break;
            case error.POSITION_UNAVAILABLE:
              code = 'POSITION_UNAVAILABLE';
              message = 'GPS signal is currently unavailable. Ensure device location is enabled.';
              break;
            case error.TIMEOUT:
              code = 'TIMEOUT';
              message = 'Location request timed out. Please check GPS signal and try again.';
              break;
          }

          reject({ code, message, originalError: error });
        },
        defaultOptions
      );
    });
  },

  /**
   * Reverse geocode coordinates to human-readable address using OpenStreetMap Nominatim
   */
  async reverseGeocode(latitude, longitude) {
    if (!this.isValidCoordinates(latitude, longitude)) return 'Unknown location';
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        {
          headers: {
            'Accept': 'application/json'
          }
        }
      );
      if (!response.ok) return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      const data = await response.json();
      return data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    } catch (e) {
      return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    }
  },

  /**
   * Generate an OpenStreetMap link ONLY from valid coordinates
   */
  getMapUrl(latitude, longitude) {
    if (!this.isValidCoordinates(latitude, longitude)) return null;
    return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
  }
};
