/**
 * WaySafe - Trip Completion and History Acceptance Test Suite
 * 
 * Verifies:
 * 1. Authentication requirement and token validation (401 Unauthorized)
 * 2. Trip completion workflow (POST /api/trips/:id/end sets completed_at, safe arrival check-in)
 * 3. Prevention of invalid trip status transitions (e.g. starting completed, completing unstarted)
 * 4. Trip history retrieval and check-in count calculation
 * 5. Validated status filtering (planned, active, completed, rejected on invalid)
 * 6. Safe sorting (created_at, departure_time, etc.)
 * 7. Page refresh data retrieval and last recorded location update
 * 8. Cross-user isolation (User B cannot access or modify User A's trip records)
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
  console.log('====================================================');
  console.log('🧪 WaySafe Trip Completion & History Test Suite');
  console.log('====================================================\n');

  // 1. Authentication & Security Checks
  console.log('1. Testing Authentication Enforcement (401 Unauthorized):');
  let res = await request('/trips', { method: 'GET' });
  assert(res.status === 401, `GET /api/trips without token returns 401 (got ${res.status})`);

  res = await request('/trips/some-trip-id/end', { method: 'POST' });
  assert(res.status === 401, `POST /api/trips/:id/end without token returns 401 (got ${res.status})`);

  res = await request('/trips/some-trip-id', { method: 'GET' });
  assert(res.status === 401, `GET /api/trips/:id without token returns 401 (got ${res.status})`);

  // 2. Setup Trips for User Alpha
  console.log('\n2. Creating Trips for User Alpha:');
  const departureDate = new Date(Date.now() + 1000 * 60 * 10).toISOString();
  const arrivalDate = new Date(Date.now() + 1000 * 60 * 70).toISOString();

  // Trip 1: Planned
  res = await request('/trips', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      trip_name: 'Metro Commute to Work',
      destination: { name: 'Tech Hub Center', latitude: 40.7580, longitude: -73.9855 },
      start_location: { name: 'Home Apartment' },
      departure_time: departureDate,
      estimated_arrival: arrivalDate,
      transport_mode: 'transit',
      status: 'planned'
    })
  });
  assert(res.status === 201, `Planned trip created successfully (status ${res.status})`);
  const plannedTripId = res.data.data.id;
  assert(res.data.data.status === 'planned', `Trip status is 'planned'`);

  // Trip 2: To be started, checked-in, and completed
  res = await request('/trips', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      trip_name: 'Evening Walk to Downtown Cafe',
      destination: 'Central Library & Cafe, 5th Ave',
      start_location: 'Office Lobby',
      departure_time: new Date().toISOString(),
      estimated_arrival: new Date(Date.now() + 1000 * 60 * 45).toISOString(),
      transport_mode: 'walking',
      status: 'planned'
    })
  });
  assert(res.status === 201, `Second planned trip created successfully`);
  const activeTripId = res.data.data.id;

  // Start Trip 2
  res = await request(`/trips/${activeTripId}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `POST /api/trips/:id/start sets status to 'active' (got ${res.status})`);
  assert(res.data.data.status === 'active', `Trip 2 status is active`);
  assert(Boolean(res.data.data.startedAt || res.data.data.started_at), `Trip 2 has started_at timestamp`);

  // 3. Record Check-ins on Active Trip
  console.log('\n3. Recording Consensual Check-ins on Active Trip:');
  // Checkin 1: with coordinates
  res = await request(`/trips/${activeTripId}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      type: 'manual',
      message: 'Reached 2nd Avenue intersection',
      consent: true,
      location: { latitude: 40.7484, longitude: -73.9857, accuracy: 9.5 },
      batteryLevel: 78,
      isCharging: false
    })
  });
  assert(res.status === 201, `First check-in with GPS recorded (status ${res.status})`);

  // Checkin 2: with coordinates
  res = await request(`/trips/${activeTripId}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      type: 'manual',
      message: 'Approaching Central Library entrance',
      consent: true,
      location: { latitude: 40.7532, longitude: -73.9822, accuracy: 6.2 },
      batteryLevel: 75,
      isCharging: false
    })
  });
  assert(res.status === 201, `Second check-in recorded (status ${res.status})`);

  // 4. Trip Completion (POST /api/trips/:id/end)
  console.log('\n4. Testing Trip Completion:');
  const endRes = await request(`/trips/${activeTripId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      message: 'Safe arrival manually confirmed by user.',
      batteryLevel: 74
    })
  });
  assert(endRes.status === 200, `POST /api/trips/:id/end returns 200 (got ${endRes.status})`);
  const completedTrip = endRes.data.data;
  assert(completedTrip.status === 'completed', `Completed trip status is 'completed'`);
  assert(Boolean(completedTrip.completedAt || completedTrip.completed_at), `Completed trip has completed_at timestamp`);
  assert(Boolean(completedTrip.lastCheckInAt || completedTrip.last_check_in_at), `Completed trip updated last_check_in_at`);

  // Verify check-in on completed trip is prevented
  res = await request(`/trips/${activeTripId}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ message: 'Post-completion check-in' })
  });
  assert(res.status === 400, `POST /checkins on completed trip returns 400 Bad Request (got ${res.status})`);

  // 5. Invalid Trip Status Transitions
  console.log('\n5. Testing Prevention of Invalid Status Transitions:');
  // Attempt to start already completed trip
  res = await request(`/trips/${activeTripId}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 400, `Starting completed trip returns 400 (got ${res.status})`);

  // Attempt to end already completed trip
  res = await request(`/trips/${activeTripId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 400, `Ending already completed trip returns 400 (got ${res.status})`);

  // Attempt to PATCH completed trip to active
  res = await request(`/trips/${activeTripId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ status: 'active' })
  });
  assert(res.status === 400, `PATCH completed trip to active returns 400 (got ${res.status})`);

  // Attempt to PATCH completed trip to planned
  res = await request(`/trips/${activeTripId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ status: 'planned' })
  });
  assert(res.status === 400, `PATCH completed trip to planned returns 400 (got ${res.status})`);

  // Attempt to end unstarted planned trip directly
  res = await request(`/trips/${plannedTripId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 400, `Ending unstarted planned trip returns 400 (got ${res.status})`);

  // Attempt to PATCH planned trip directly to completed
  res = await request(`/trips/${plannedTripId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ status: 'completed' })
  });
  assert(res.status === 400, `PATCH planned trip directly to completed returns 400 (got ${res.status})`);

  // 6. Page Refresh / Trip Detail Retrieval (trip-completed.html)
  console.log('\n6. Testing Page Refresh & Completed Trip Retrieval (GET /api/trips/:id):');
  res = await request(`/trips/${activeTripId}`, {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `GET /api/trips/:id returns 200`);
  const refreshedTrip = res.data.data;
  assert(refreshedTrip.destination === 'Central Library & Cafe, 5th Ave', `Destination matches: ${refreshedTrip.destination}`);
  assert(Boolean(refreshedTrip.departureTime || refreshedTrip.departure_time), `Departure time is present`);
  assert(Boolean(refreshedTrip.estimatedArrival || refreshedTrip.estimated_arrival), `Estimated arrival is present`);
  assert(Boolean(refreshedTrip.completedAt || refreshedTrip.completed_at), `Actual completion timestamp is present`);
  assert((refreshedTrip.checkinCount ?? refreshedTrip.checkin_count) >= 3, `Successful check-in count accurately recorded (${refreshedTrip.checkinCount})`);

  // Verify Check-ins list contains location records
  res = await request(`/trips/${activeTripId}/checkins`, {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `GET /api/trips/:id/checkins returns 200`);
  const checkinsList = res.data.data;
  assert(Array.isArray(checkinsList) && checkinsList.length >= 3, `Trip check-in logs returned (${checkinsList.length})`);
  const locCheckin = checkinsList.find(c => c.latitude !== null && c.latitude !== undefined);
  assert(Boolean(locCheckin), `Last recorded location update is available in check-in history`);
  assert(locCheckin.latitude === 40.7532 && locCheckin.longitude === -73.9822, `Last recorded coordinates match second check-in`);

  // 7. Trip History Retrieval & Check-in count (GET /api/trips)
  console.log('\n7. Testing Trip History Retrieval:');
  res = await request('/trips', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `GET /api/trips returns 200`);
  assert(Array.isArray(res.data.data) && res.data.data.length >= 2, `User Alpha has multiple trips in history`);
  const foundCompleted = res.data.data.find(t => t.id === activeTripId);
  assert(Boolean(foundCompleted), `Completed trip found in trip history`);
  assert(foundCompleted.status === 'completed', `History item has completed status`);
  assert((foundCompleted.checkinCount ?? foundCompleted.checkin_count) >= 3, `History item includes accurate check-in count`);

  // 8. Status Filtering (GET /api/trips?status=...)
  console.log('\n8. Testing Validated Status Filtering:');
  // Filter: completed
  res = await request('/trips?status=completed', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `GET /api/trips?status=completed returns 200`);
  assert(res.data.data.every(t => t.status === 'completed'), `All filtered items have status 'completed'`);
  assert(res.data.data.some(t => t.id === activeTripId), `Active trip now listed under completed filter`);

  // Filter: planned
  res = await request('/trips?status=planned', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `GET /api/trips?status=planned returns 200`);
  assert(res.data.data.every(t => t.status === 'planned'), `All filtered items have status 'planned'`);
  assert(res.data.data.some(t => t.id === plannedTripId), `Planned trip found in planned filter`);

  // Filter: active
  res = await request('/trips?status=active', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `GET /api/trips?status=active returns 200`);
  assert(res.data.data.every(t => t.status === 'active'), `All filtered items have status 'active'`);

  // Filter: all
  res = await request('/trips?status=all', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `GET /api/trips?status=all returns 200`);
  assert(res.data.data.length >= 2, `Filter 'all' returns all user trips`);

  // Filter: invalid status -> 400
  res = await request('/trips?status=invalid_bogus_status', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 400, `GET /api/trips with invalid status filter returns 400 Bad Request (got ${res.status})`);
  assert(res.data.error.includes('Invalid status filter'), `Error specifies allowed statuses`);

  // 9. Safe Sorting
  console.log('\n9. Testing Safe Sorting:');
  res = await request('/trips?sort=created_at&order=asc', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `GET /api/trips?sort=created_at&order=asc returns 200`);

  res = await request('/trips?sort=departure_time&order=desc', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `GET /api/trips?sort=departure_time&order=desc returns 200`);

  // Unrecognized sort column safely falls back to created_at without error
  res = await request('/trips?sort=malicious_sql_inject_or_random&order=desc', {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(res.status === 200, `Invalid sort parameter safely handled without error`);

  // 10. Cross-User Access Isolation
  console.log('\n10. Testing Cross-User Access Isolation (User B cannot access User A):');
  // User B attempts to fetch User A's completed trip
  res = await request(`/trips/${activeTripId}`, {
    headers: { Authorization: `Bearer ${userBetaToken}` }
  });
  assert(res.status === 404, `User B GET /api/trips/:id for User A trip returns 404 Not Found (got ${res.status})`);

  // User B attempts to end User A's trip
  res = await request(`/trips/${activeTripId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userBetaToken}` }
  });
  assert(res.status === 404, `User B POST /api/trips/:id/end for User A trip returns 404 Not Found (got ${res.status})`);

  // User B attempts to patch User A's trip
  res = await request(`/trips/${activeTripId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userBetaToken}` },
    body: JSON.stringify({ trip_name: 'Hijacked Trip' })
  });
  assert(res.status === 404, `User B PATCH /api/trips/:id for User A trip returns 404 Not Found (got ${res.status})`);

  // User B attempts to delete User A's trip
  res = await request(`/trips/${activeTripId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userBetaToken}` }
  });
  assert(res.status === 404, `User B DELETE /api/trips/:id for User A trip returns 404 Not Found (got ${res.status})`);

  // User B listing trips does not leak User A's trips
  res = await request('/trips', {
    headers: { Authorization: `Bearer ${userBetaToken}` }
  });
  assert(res.status === 200, `User B GET /api/trips returns 200`);
  assert(!res.data.data.some(t => t.id === activeTripId), `User B's trip list does NOT include User A's trip`);

  console.log('\n====================================================');
  console.log(`🎉 ALL ACCEPTANCE TESTS PASSED: ${passedTests}/${totalTests}`);
  console.log('====================================================');
}

runTestSuite().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
