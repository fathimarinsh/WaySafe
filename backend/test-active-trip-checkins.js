/**
 * WaySafe - Active Trip and Check-in Module Acceptance Test Suite
 * 
 * Verifies:
 * 1. Unauthorized requests (missing or invalid tokens return 401)
 * 2. Invalid trip IDs (non-existent trips return 404)
 * 3. User ownership enforcement (user cannot check into another user's trip)
 * 4. Active vs Completed trip states (active succeeds, completed rejects with 400)
 * 5. Check-in persistence & server-generated timestamp
 * 6. Trip's last_check_in_at update verification
 * 7. Consensual location handling (saved only when user explicitly consents)
 * 8. Location error handling (invalid coordinates reject with 400)
 * 9. GET /api/trips/:id/checkins history verification
 */

const BASE_URL = 'http://localhost:5000/api';

const userAToken = 'mock-token-user-alpha';
const userBToken = 'mock-token-user-bravo';

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
  console.log('🧪 WaySafe Active Trip & Check-In Acceptance Tests');
  console.log('====================================================\n');

  // Test 1: Unauthorized Requests
  console.log('1. Testing Unauthorized Requests (Token Verification):');
  
  // 1a. POST without token
  let res = await request('/trips/trip-123/checkins', {
    method: 'POST',
    body: JSON.stringify({ message: "I'm safe" })
  });
  assert(res.status === 401, `POST /api/trips/:id/checkins without token returns 401 (got ${res.status})`);
  assert(res.data && res.data.success === false, 'Error body indicates failure');

  // 1b. GET without token
  res = await request('/trips/trip-123/checkins', {
    method: 'GET'
  });
  assert(res.status === 401, `GET /api/trips/:id/checkins without token returns 401 (got ${res.status})`);

  // Test 2: Invalid Trip IDs
  console.log('\n2. Testing Invalid Trip IDs:');
  res = await request('/trips/non-existent-trip-id-999/checkins', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAToken}` },
    body: JSON.stringify({ message: "I'm safe" })
  });
  assert(res.status === 404, `POST check-in with invalid trip ID returns 404 (got ${res.status})`);

  res = await request('/trips/non-existent-trip-id-999/checkins', {
    method: 'GET',
    headers: { Authorization: `Bearer ${userAToken}` }
  });
  assert(res.status === 404, `GET check-ins with invalid trip ID returns 404 (got ${res.status})`);

  // Test 3: Create Active Trip for User A
  console.log('\n3. Creating Active Trip for User A:');
  const now = new Date();
  const departTime = now.toISOString();
  const arrivalTime = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  const tripRes = await request('/trips', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAToken}` },
    body: JSON.stringify({
      trip_name: 'Downtown Travel Corridor',
      destination: { name: 'Metro Center Plaza', address: '100 Main St', latitude: 37.789, longitude: -122.401 },
      departure_time: departTime,
      estimated_arrival: arrivalTime,
      status: 'active'
    })
  });
  assert(tripRes.status === 201, `Trip created with status 201 (got ${tripRes.status})`);
  assert(tripRes.data?.data?.id, 'Received trip ID');
  const tripAId = tripRes.data.data.id;

  // Test 4: Ownership Enforcement
  console.log('\n4. Testing Trip Ownership Enforcement:');
  // User B tries to check in to User A's trip
  const unauthorizedCheckin = await request(`/trips/${tripAId}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userBToken}` },
    body: JSON.stringify({ message: "Intruder check-in" })
  });
  assert(unauthorizedCheckin.status === 404, `User B cannot check in to User A's trip (status ${unauthorizedCheckin.status})`);

  // User B cannot list User A's check-ins
  const unauthorizedList = await request(`/trips/${tripAId}/checkins`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${userBToken}` }
  });
  assert(unauthorizedList.status === 404, `User B cannot view User A's trip check-ins (status ${unauthorizedList.status})`);

  // Test 5: Check-in Persistence & Server-Generated Timestamp
  console.log('\n5. Testing Check-in Persistence & Server Timestamp:');
  const checkinRes1 = await request(`/trips/${tripAId}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAToken}` },
    body: JSON.stringify({
      message: "I'm safe",
      type: "im_safe",
      batteryLevel: 68,
      isCharging: false
    })
  });
  assert(checkinRes1.status === 201, `Check-in recorded with 201 Created (got ${checkinRes1.status})`);
  assert(checkinRes1.data?.success === true, 'Response indicates success');
  const checkinData1 = checkinRes1.data.data;
  assert(checkinData1.id, 'Check-in returned a unique ID');
  assert(checkinData1.checkedInAt || checkinData1.checked_in_at, 'Check-in has server-generated timestamp');
  const checkinTime1 = checkinData1.checkedInAt || checkinData1.checked_in_at;
  assert(Math.abs(Date.now() - new Date(checkinTime1).getTime()) < 5000, 'Server-generated timestamp is current within 5s');

  // Verify trip's last_check_in_at was updated
  const fetchTripRes = await request(`/trips/${tripAId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${userAToken}` }
  });
  assert(fetchTripRes.status === 200, 'Fetched trip successfully');
  const updatedTrip = fetchTripRes.data.data;
  assert(updatedTrip.lastCheckInAt === checkinTime1 || updatedTrip.last_check_in_at === checkinTime1, 'Trip last_check_in_at was updated to check-in timestamp');

  // Test 6: Consensual Location Coordinates
  console.log('\n6. Testing Consensual Location Coordinates Handling:');
  // 6a. Explicit consent granted: coordinates should be persisted
  const locCheckinRes = await request(`/trips/${tripAId}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAToken}` },
    body: JSON.stringify({
      message: 'Location verified at transit hub',
      type: 'location_update',
      consent: true,
      locationConsent: true,
      location: {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 12
      }
    })
  });
  assert(locCheckinRes.status === 201, 'Check-in with consent recorded');
  const locCheckinData = locCheckinRes.data.data;
  assert(locCheckinData.latitude === 37.7749, 'Persisted latitude');
  assert(locCheckinData.longitude === -122.4194, 'Persisted longitude');
  assert(locCheckinData.locationConsent === true || locCheckinData.location_consent === true, 'Flagged as consented location');

  // 6b. Without consent: coordinates must NOT be persisted even if sent
  const noConsentRes = await request(`/trips/${tripAId}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAToken}` },
    body: JSON.stringify({
      message: 'Check-in without location consent',
      consent: false,
      location: {
        latitude: 37.7749,
        longitude: -122.4194
      }
    })
  });
  assert(noConsentRes.status === 201, 'Recorded check-in without consent');
  const noConsentData = noConsentRes.data.data;
  assert(noConsentData.latitude === null, 'Coordinates suppressed when consent is false');
  assert(noConsentData.longitude === null, 'Longitude suppressed when consent is false');

  // Test 7: Location Validation Errors
  console.log('\n7. Testing Location Coordinate Validation Errors:');
  const invalidLocRes = await request(`/trips/${tripAId}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAToken}` },
    body: JSON.stringify({
      message: 'Invalid coordinates check-in',
      consent: true,
      location: {
        latitude: 999.0, // Invalid latitude > 90
        longitude: -122.4194
      }
    })
  });
  assert(invalidLocRes.status === 400, `Rejected invalid latitude with 400 (got ${invalidLocRes.status})`);
  assert(invalidLocRes.data?.error?.includes('Invalid coordinates'), 'Informative error returned');

  // Test 8: List Check-in History
  console.log('\n8. Testing GET /api/trips/:id/checkins History:');
  const listCheckinsRes = await request(`/trips/${tripAId}/checkins`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${userAToken}` }
  });
  assert(listCheckinsRes.status === 200, 'Check-in history fetched successfully');
  assert(Array.isArray(listCheckinsRes.data.data), 'Returns array of check-ins');
  assert(listCheckinsRes.data.data.length >= 3, `Found ${listCheckinsRes.data.data.length} check-ins in history`);

  // Test 9: Active vs Completed Trip States
  console.log('\n9. Testing Active vs Completed Trip State Constraints:');
  // Complete the trip
  const endTripRes = await request(`/trips/${tripAId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAToken}` },
    body: JSON.stringify({ message: 'Safely arrived home' })
  });
  assert(endTripRes.status === 200, 'Trip ended and marked completed');
  assert(endTripRes.data.data.status === 'completed', 'Trip status is completed');

  // Now attempt to record a check-in to completed trip
  const completedCheckinRes = await request(`/trips/${tripAId}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAToken}` },
    body: JSON.stringify({ message: "Trying to check in after completion" })
  });
  assert(completedCheckinRes.status === 400, `Check-in on completed trip rejected with 400 (got ${completedCheckinRes.status})`);
  assert(completedCheckinRes.data?.error?.includes('completed trip'), 'Returns clear completed trip error');

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} ACCEPTANCE TESTS PASSED!`);
  console.log('====================================================\n');
}

runTestSuite().catch(err => {
  console.error('\n❌ Acceptance test suite failed:', err);
  process.exit(1);
});
