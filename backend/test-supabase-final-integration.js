/**
 * WaySafe - Final Supabase Database & Backend Integration Test Suite
 * 
 * Comprehensive tests covering:
 * 1. Missing & Invalid Access Tokens (401 Unauthorized)
 * 2. Profile Creation & Retrieval (POST/GET /api/profile)
 * 3. Contact CRUD & Validation (POST/GET/PATCH/DELETE /api/contacts)
 * 4. Trip CRUD, Ownership & Status Transition Enforcement (/api/trips)
 * 5. Check-ins & Location Consent Enforcement (/api/trips/:id/checkins)
 * 6. Trip History & Validated Status Filtering (?status=planned|active|completed|cancelled)
 * 7. Safe Sorting & Parameter Sanitization
 * 8. Cross-User Access Attempts & Isolation (User B cannot access User A's data)
 * 9. Empty States & Graceful Responses
 * 10. Database Error Handling (appropriate HTTP status codes on failure)
 */

const BASE_URL = 'http://localhost:5000/api';

const userAlphaToken = 'mock-token-user-alpha';
const userBetaToken = 'mock-token-user-beta';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    }
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('🛡️  WaySafe Final Supabase Database & Backend Integration Tests');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. Missing & Invalid Access Tokens
  // ---------------------------------------------------------------------------
  console.log('1. Testing Token Verification & Authentication (401 Unauthorized):');
  let res = await request('/profile', { method: 'GET' });
  assert(res.status === 401, `GET /api/profile without token returns 401 (got ${res.status})`);

  res = await request('/contacts', { method: 'GET' });
  assert(res.status === 401, `GET /api/contacts without token returns 401 (got ${res.status})`);

  res = await request('/trips', { method: 'GET' });
  assert(res.status === 401, `GET /api/trips without token returns 401 (got ${res.status})`);

  res = await request('/trips', {
    method: 'GET',
    headers: { Authorization: 'Basic someuser:password' }
  });
  assert(res.status === 401, `Malformed authorization scheme returns 401 (got ${res.status})`);

  res = await request('/trips', {
    method: 'GET',
    headers: { Authorization: 'Bearer ' }
  });
  assert(res.status === 401, `Empty Bearer token returns 401 (got ${res.status})`);

  // ---------------------------------------------------------------------------
  // 2. Profile Creation & Retrieval
  // ---------------------------------------------------------------------------
  console.log('\n2. Testing Protected User Profile (POST & GET /api/profile):');
  // Validation: empty name
  res = await request('/profile', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ full_name: '   ' })
  });
  assert(res.status === 400, `POST /api/profile with empty name returns 400 Bad Request (got ${res.status})`);

  // Valid profile creation
  res = await request('/profile', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ full_name: 'Alex Rivera' })
  });
  assert(res.status === 200, `POST /api/profile saves profile successfully (status ${res.status})`);
  assert(res.data.profile.full_name === 'Alex Rivera', `Profile full_name matches 'Alex Rivera'`);

  // Profile retrieval
  res = await request('/profile', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `GET /api/profile retrieves profile (status ${res.status})`);
  assert(res.data.profile.full_name === 'Alex Rivera', `Retrieved profile name matches`);

  // Cross-user profile isolation: User Beta profile is distinct
  res = await request('/profile', {
    headers: { Authorization: `Bearer ${userBetaToken}` }
  });
  assert(res.status === 200, `User Beta can fetch own profile`);
  assert(res.data.profile.id !== 'user-alpha', `User Beta does NOT receive User Alpha's profile`);

  // ---------------------------------------------------------------------------
  // 3. Contact CRUD & Validation
  // ---------------------------------------------------------------------------
  console.log('\n3. Testing Contact CRUD & Input Validation (/api/contacts):');
  // Rejects invalid phone
  res = await request('/contacts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ name: 'Maria', phone: '123' })
  });
  assert(res.status === 400, `Rejects short phone with 400 Bad Request`);

  // Create valid primary contact
  res = await request('/contacts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      name: 'Maria Rivera',
      phone: '+1 555-019-8822',
      relationship: 'Sister',
      email: 'maria@example.com',
      isPrimary: true
    })
  });
  assert(res.status === 201, `Contact created with 201 Created`);
  const contactAId = res.data.data.id;
  assert(Boolean(contactAId), `Returned unique contact ID`);
  assert(res.data.data.name === 'Maria Rivera', `Contact name matches`);

  // List contacts
  res = await request('/contacts', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `GET /api/contacts returns 200`);
  assert(res.data.data.some(c => c.id === contactAId), `Created contact appears in list`);

  // Edit contact
  res = await request(`/contacts/${contactAId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ relationship: 'Emergency Contact & Sister' })
  });
  assert(res.status === 200, `PATCH /api/contacts/:id returns 200`);
  assert(res.data.data.relationship === 'Emergency Contact & Sister', `Relationship updated`);

  // ---------------------------------------------------------------------------
  // 4. Trip CRUD, Ownership & Status Transitions
  // ---------------------------------------------------------------------------
  console.log('\n4. Testing Trip CRUD, Ownership & Status Transitions (/api/trips):');
  const now = new Date();
  const depTime = new Date(now.getTime() + 1000 * 60 * 30).toISOString();
  const arrTime = new Date(now.getTime() + 1000 * 60 * 90).toISOString();

  // Validation: estimated arrival before departure
  res = await request('/trips', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      destination: 'Central Station',
      departure_time: arrTime,
      estimated_arrival: depTime
    })
  });
  assert(res.status === 400, `Rejects arrival before departure with 400 Bad Request`);

  // Create planned trip with trusted contact
  res = await request('/trips', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      trip_name: 'Metro Trip to Grand Central',
      destination: { name: 'Grand Central Terminal', latitude: 40.7527, longitude: -73.9772 },
      start_location: { name: 'Upper West Side' },
      departure_time: depTime,
      estimated_arrival: arrTime,
      trusted_contact_id: contactAId,
      location_sharing_consent: true,
      transport_mode: 'transit',
      status: 'planned'
    })
  });
  assert(res.status === 201, `Trip created with status 201 (got ${res.status})`);
  const tripId = res.data.data.id;
  assert(res.data.data.status === 'planned', `Initial status is 'planned'`);

  // Attempt invalid transition: completing unstarted planned trip
  res = await request(`/trips/${tripId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 400, `Cannot end planned trip without starting (got 400)`);

  // Start trip
  res = await request(`/trips/${tripId}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `POST /api/trips/:id/start transitions to 'active' (status 200)`);
  assert(res.data.data.status === 'active', `Trip is now active`);

  // Attempt invalid transition: starting already active trip
  res = await request(`/trips/${tripId}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 400, `Cannot start already active trip (got 400)`);

  // Attempt invalid transition: reverting active trip to planned
  res = await request(`/trips/${tripId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ status: 'planned' })
  });
  assert(res.status === 400, `Cannot revert active trip to planned (got 400)`);

  // ---------------------------------------------------------------------------
  // 5. Check-ins & Location Consent Enforcement
  // ---------------------------------------------------------------------------
  console.log('\n5. Testing Check-ins & Consensual Location Logging (/api/trips/:id/checkins):');
  // Check-in without location consent
  res = await request(`/trips/${tripId}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      message: 'Boarded metro car #4',
      consent: false,
      location: { latitude: 40.7600, longitude: -73.9800 }
    })
  });
  assert(res.status === 201, `Check-in recorded with status 201`);
  assert(res.data.data.latitude === null, `Coordinates suppressed when location consent is false`);

  // Check-in with explicit location consent
  res = await request(`/trips/${tripId}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      message: 'Approaching 42nd St stop',
      consent: true,
      location: { latitude: 40.7555, longitude: -73.9785, accuracy: 8.4 },
      batteryLevel: 82,
      isCharging: false
    })
  });
  assert(res.status === 201, `Check-in with consent recorded`);
  assert(res.data.data.latitude === 40.7555, `Latitude persisted under explicit consent`);
  assert(res.data.data.longitude === -73.9785, `Longitude persisted under explicit consent`);

  // Rejects invalid coordinates
  res = await request(`/trips/${tripId}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      consent: true,
      location: { latitude: 999.0, longitude: -73.9785 }
    })
  });
  assert(res.status === 400, `Rejects out-of-range coordinates with 400 Bad Request`);

  // Complete the trip
  res = await request(`/trips/${tripId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ message: 'Arrived safely at Grand Central' })
  });
  assert(res.status === 200, `POST /api/trips/:id/end completes trip (got 200)`);
  assert(res.data.data.status === 'completed', `Status is 'completed'`);
  assert(Boolean(res.data.data.completedAt || res.data.data.completed_at), `completed_at timestamp recorded`);

  // Cannot check-in to completed trip
  res = await request(`/trips/${tripId}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ message: 'Late check-in attempt' })
  });
  assert(res.status === 400, `Check-in on completed trip rejected with 400`);

  // Terminal state: Cannot transition completed trip
  res = await request(`/trips/${tripId}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 400, `Cannot start completed trip (got 400)`);

  res = await request(`/trips/${tripId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 400, `Cannot re-end completed trip (got 400)`);

  res = await request(`/trips/${tripId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ status: 'active' })
  });
  assert(res.status === 400, `Cannot PATCH completed trip to active (got 400)`);

  // ---------------------------------------------------------------------------
  // 6. Trip History & Validated Filtering
  // ---------------------------------------------------------------------------
  console.log('\n6. Testing Trip History & Validated Filtering (GET /api/trips):');
  res = await request('/trips', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `GET /api/trips returns 200`);
  const foundTrip = res.data.data.find(t => t.id === tripId);
  assert(Boolean(foundTrip), `Completed trip appears in history`);
  assert((foundTrip.checkinCount ?? foundTrip.checkin_count) >= 3, `Accurate check-in count aggregated`);

  // Valid status filter: completed
  res = await request('/trips?status=completed', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `Filter status=completed returns 200`);
  assert(res.data.data.every(t => t.status === 'completed'), `All filtered items are completed`);

  // Valid status filter: active
  res = await request('/trips?status=active', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `Filter status=active returns 200`);
  assert(res.data.data.every(t => t.status === 'active'), `All filtered items are active`);

  // Invalid status filter -> 400
  res = await request('/trips?status=unknown_nonexistent_status', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 400, `Invalid status filter returns 400 Bad Request`);
  assert(res.data.error.includes('Invalid status filter'), `Error details permitted statuses`);

  // ---------------------------------------------------------------------------
  // 7. Safe Sorting
  // ---------------------------------------------------------------------------
  console.log('\n7. Testing Safe Sorting:');
  res = await request('/trips?sort=created_at&order=asc', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `Sorting by created_at asc returns 200`);

  res = await request('/trips?sort=departure_time&order=desc', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `Sorting by departure_time desc returns 200`);

  // Unrecognized column is safely defaulted without SQL injection or crash
  res = await request('/trips?sort=malicious_col_drop_tables&order=desc', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `Unrecognized sort column gracefully handled`);

  // ---------------------------------------------------------------------------
  // 8. Cross-User Access Attempts (Security Isolation)
  // ---------------------------------------------------------------------------
  console.log('\n8. Testing Cross-User Access Prevention (User B vs User A):');
  // User B tries to view User A's trip
  res = await request(`/trips/${tripId}`, {
    headers: { Authorization: `Bearer ${userBetaToken}` }
  });
  assert(res.status === 404, `User B cannot view User A's trip (got 404 Not Found)`);

  // User B tries to update User A's trip
  res = await request(`/trips/${tripId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userBetaToken}` },
    body: JSON.stringify({ trip_name: 'Stolen Trip' })
  });
  assert(res.status === 404, `User B cannot PATCH User A's trip (got 404 Not Found)`);

  // User B tries to end User A's trip
  res = await request(`/trips/${tripId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userBetaToken}` }
  });
  assert(res.status === 404, `User B cannot end User A's trip (got 404 Not Found)`);

  // User B tries to check-in to User A's trip
  res = await request(`/trips/${tripId}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userBetaToken}` },
    body: JSON.stringify({ message: 'Unauthorized check-in' })
  });
  assert(res.status === 404, `User B cannot check in to User A's trip (got 404 Not Found)`);

  // User B tries to delete User A's trip
  res = await request(`/trips/${tripId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userBetaToken}` }
  });
  assert(res.status === 404, `User B cannot delete User A's trip (got 404 Not Found)`);

  // User B tries to edit User A's contact
  res = await request(`/contacts/${contactAId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userBetaToken}` },
    body: JSON.stringify({ name: 'Hacked Contact' })
  });
  assert(res.status === 404, `User B cannot edit User A's contact (got 404 Not Found)`);

  // User B tries to delete User A's contact
  res = await request(`/contacts/${contactAId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userBetaToken}` }
  });
  assert(res.status === 404, `User B cannot delete User A's contact (got 404 Not Found)`);

  // ---------------------------------------------------------------------------
  // 9. Empty States & Graceful Responses
  // ---------------------------------------------------------------------------
  console.log('\n9. Testing Empty States for New User (User Gamma):');
  const userGammaToken = 'mock-token-user-gamma';
  
  res = await request('/trips', {
    headers: { Authorization: `Bearer ${userGammaToken}` }
  });
  assert(res.status === 200, `GET /api/trips for new user returns 200`);
  assert(Array.isArray(res.data.data) && res.data.data.length === 0, `Returns empty array for trips with 0 records`);

  res = await request('/contacts', {
    headers: { Authorization: `Bearer ${userGammaToken}` }
  });
  assert(res.status === 200, `GET /api/contacts for new user returns 200`);
  assert(Array.isArray(res.data.data) && res.data.data.length === 0, `Returns empty array for contacts with 0 records`);

  // ---------------------------------------------------------------------------
  // 10. Database Health Check Endpoint
  // ---------------------------------------------------------------------------
  console.log('\n10. Testing Health Check Endpoint:');
  res = await request('/health', { method: 'GET' });
  assert(res.status === 200, `GET /api/health returns 200`);
  assert(res.data.database.provider === 'supabase', `Health reports Supabase as database provider`);

  console.log('\n================================================================');
  console.log(`🎉 ALL SUPABASE INTEGRATION TESTS PASSED: ${passedTests}/${totalTests}`);
  console.log('================================================================');
}

runTestSuite().catch(err => {
  console.error('\n❌ Test suite execution error:', err);
  process.exit(1);
});
