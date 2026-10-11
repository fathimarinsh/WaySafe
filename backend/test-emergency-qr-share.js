/**
 * WaySafe - Emergency Trip QR Code & Public Sharing Test Suite
 *
 * Verifies:
 * 1. Unguessable QR token generation upon emergency trip creation/start
 * 2. Dedicated public emergency page URL format (not dashboard/login)
 * 3. Public access without user authentication or WaySafe account
 * 4. Data sanitization: only explicitly approved fields exposed
 * 5. Strict privacy: user_id, credentials, tokens, and unrelated trips never leaked
 * 6. Consensual location display: coordinates shown only when recorded & consented
 * 7. Consent controls: toggle location, emergency contact, ETA, and display name
 * 8. Immediate token revocation by trip owner (HTTP 410 Expired)
 * 9. Trip completion deactivation: ending trip expires public sharing link (HTTP 410)
 * 10. QR code streaming & download headers (image/png, Content-Disposition)
 * 11. Cross-user isolation: User B cannot access or modify User A's share token
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
  return { status: res.status, headers: res.headers, data };
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 WaySafe Emergency Trip QR Code Test Suite');
  console.log('====================================================\n');

  // ---------------------------------------------------------
  // 1. Authentication & Route Protection Checks
  // ---------------------------------------------------------
  console.log('1. Testing Route Protection & Access Control:');

  let res = await request('/trips/fake-trip-id/share-token', { method: 'GET' });
  assert(res.status === 401, `GET /api/trips/:id/share-token without token returns 401 (got ${res.status})`);

  res = await request('/trips/fake-trip-id/share-token/revoke', { method: 'POST' });
  assert(res.status === 401, `POST /api/trips/:id/share-token/revoke without token returns 401 (got ${res.status})`);

  res = await request('/trips/fake-trip-id/share-token/settings', { method: 'PATCH', body: JSON.stringify({ share_location: false }) });
  assert(res.status === 401, `PATCH /api/trips/:id/share-token/settings without token returns 401 (got ${res.status})`);

  res = await request('/trips/fake-trip-id/qr', { method: 'GET' });
  assert(res.status === 401, `GET /api/trips/:id/qr without token returns 401 (got ${res.status})`);

  // ---------------------------------------------------------
  // 2. Setup Emergency Contact for User Alpha
  // ---------------------------------------------------------
  console.log('\n2. Setting Up Emergency Contact:');
  const contactRes = await request('/contacts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      name: 'Morgan Blake',
      phone: '+1-555-0199',
      relationship: 'Emergency Guardian'
    })
  });
  assert(contactRes.status === 201, `Created emergency contact for User Alpha (status ${contactRes.status})`);
  const contactId = contactRes.data.data.id;

  // ---------------------------------------------------------
  // 3. Create & Start Emergency Trip with QR Code Generation
  // ---------------------------------------------------------
  console.log('\n3. Starting Emergency Trip & Generating QR Code:');
  const createRes = await request('/trips', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      tripName: 'Night Transit from Downtown Campus',
      startLocation: 'Library Annex, 4th Ave',
      destination: 'North Residence Hall',
      departureTime: new Date().toISOString(),
      estimatedArrival: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      trustedContactId: contactId,
      locationSharingConsent: true,
      transportMode: 'transit',
      emergencyNotes: 'Taking the blue line shuttle.'
    })
  });
  assert(createRes.status === 201, `Created emergency trip (status ${createRes.status})`);
  const tripId = createRes.data.data.id;

  // Start trip
  const startRes = await request(`/trips/${tripId}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(startRes.status === 200, `Started emergency trip (status ${startRes.status})`);

  // Fetch share token & QR details as trip owner
  const shareRes = await request(`/trips/${tripId}/share-token`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(shareRes.status === 200, `Owner retrieved share token & QR metadata (status ${shareRes.status})`);
  const shareData = shareRes.data.data;

  assert(Boolean(shareData.shareToken), 'Share token was generated and returned');
  assert(shareData.shareToken.length >= 32, `Share token is random and cryptographically unguessable (${shareData.shareToken.length} chars)`);
  assert(shareData.shareUrl.includes('public-trip.html?token='), `Share URL opens dedicated public page: ${shareData.shareUrl}`);
  assert(!shareData.shareUrl.includes('dashboard.html') && !shareData.shareUrl.includes('login.html'), 'Share URL does NOT redirect to dashboard or login');
  assert(shareData.qrCodeDataUrl.startsWith('data:image/png;base64,'), 'QR code data URL is a valid base64 PNG');

  // Verify PNG QR endpoint directly
  const qrImageRes = await fetch(`http://localhost:5000/api/trips/${tripId}/qr?download=true`, {
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(qrImageRes.status === 200, `GET /api/trips/:id/qr returns HTTP 200 (got ${qrImageRes.status})`);
  assert(qrImageRes.headers.get('content-type') === 'image/png', `QR Content-Type is image/png (got ${qrImageRes.headers.get('content-type')})`);
  assert(qrImageRes.headers.get('content-disposition')?.includes('attachment; filename='), 'Content-Disposition includes attachment filename for download');

  // ---------------------------------------------------------
  // 4. Cross-User Isolation on Share Endpoints
  // ---------------------------------------------------------
  console.log('\n4. Testing Cross-User Isolation (User Beta vs User Alpha):');
  const betaShareRes = await request(`/trips/${tripId}/share-token`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${userBetaToken}` }
  });
  assert(betaShareRes.status === 404, `User Beta cannot access User Alpha share token (status ${betaShareRes.status})`);

  const betaRevokeRes = await request(`/trips/${tripId}/share-token/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userBetaToken}` }
  });
  assert(betaRevokeRes.status === 404, `User Beta cannot revoke User Alpha share token (status ${betaRevokeRes.status})`);

  // ---------------------------------------------------------
  // 5. Public Unauthenticated QR Scanner Verification
  // ---------------------------------------------------------
  console.log('\n5. Public Scanner Verification (No WaySafe Account / No Auth Token):');
  const publicRes = await request(`/trips/public/${shareData.shareToken}`, {
    method: 'GET'
    // Intentionally NO Authorization header
  });
  assert(publicRes.status === 200, `Public endpoint accessible without credentials (status ${publicRes.status})`);
  const publicData = publicRes.data.data;

  // Verify approved fields
  assert(publicData.destination === 'North Residence Hall', `Public destination matches: ${publicData.destination}`);
  assert(publicData.startLocation === 'Library Annex, 4th Ave', `Public origin matches: ${publicData.startLocation}`);
  assert(publicData.status === 'active', `Public status is active: ${publicData.status}`);
  assert(publicData.emergencyNotes === 'Taking the blue line shuttle.', 'Emergency notes visible to responder');
  assert(publicData.emergencyContact !== null, 'Emergency contact included by default consent');
  assert(publicData.emergencyContact.name === 'Morgan Blake', `Emergency contact name: ${publicData.emergencyContact.name}`);
  assert(publicData.emergencyContact.phone === '+1-555-0199', `Emergency contact phone: ${publicData.emergencyContact.phone}`);

  // Verify strict data protection (NEVER leak private credentials or account details)
  assert(!('user_id' in publicData) && !('userId' in publicData), 'User ID is NOT exposed in public response');
  assert(!('email' in publicData), 'User email is NOT exposed');
  assert(!('password' in publicData), 'Password is NOT exposed');
  assert(!('token' in publicData), 'User tokens are NOT exposed');
  assert(!('trips' in publicData) && !('history' in publicData), 'User trip history is NOT exposed');

  // Verify location is NOT fabricated when no check-in exists yet
  assert(publicData.lastLocation === null, 'Last known location is null when no check-in has been recorded (never fabricated)');

  // ---------------------------------------------------------
  // 6. Record Real Check-in and Verify Consensual Location Display
  // ---------------------------------------------------------
  console.log('\n6. Recording Verified Check-in & Testing Location Display:');
  const checkinRes = await request(`/trips/${tripId}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      latitude: 40.7128,
      longitude: -74.0060,
      accuracy: 14.5,
      locationConsent: true,
      message: 'On the connector bus now.'
    })
  });
  assert(checkinRes.status === 201, `Recorded check-in with GPS coordinates (status ${checkinRes.status})`);

  const publicResWithLoc = await request(`/trips/public/${shareData.shareToken}`, {
    method: 'GET'
  });
  assert(publicResWithLoc.status === 200, `Public endpoint returned status 200 after check-in`);
  const locData = publicResWithLoc.data.data.lastLocation;
  assert(locData !== null, 'Public response now includes last known location');
  assert(Number(locData.latitude) === 40.7128, `Latitude matches recorded check-in: ${locData.latitude}`);
  assert(Number(locData.longitude) === -74.0060, `Longitude matches recorded check-in: ${locData.longitude}`);
  assert(Boolean(locData.recordedAt), `Location has valid recorded timestamp: ${locData.recordedAt}`);

  // ---------------------------------------------------------
  // 7. Testing Consent Controls (Custom Display Name & Data Masking)
  // ---------------------------------------------------------
  console.log('\n7. Testing Emergency Sharing Consent Settings:');
  const updateSettingsRes = await request(`/trips/${tripId}/share-token/settings`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      share_location: false,
      share_contact: false,
      display_name: 'Alex T. (Engineering)'
    })
  });
  assert(updateSettingsRes.status === 200, `Updated consent settings (status ${updateSettingsRes.status})`);

  const publicMaskedRes = await request(`/trips/public/${shareData.shareToken}`, {
    method: 'GET'
  });
  assert(publicMaskedRes.status === 200, 'Public endpoint accessible with updated consent');
  assert(publicMaskedRes.data.data.travellerName === 'Alex T. (Engineering)', `Display name updated to custom name: ${publicMaskedRes.data.data.travellerName}`);
  assert(publicMaskedRes.data.data.lastLocation === null, 'Location hidden when share_location consent is turned off');
  assert(publicMaskedRes.data.data.emergencyContact === null, 'Emergency contact hidden when share_contact consent is turned off');

  // Re-enable location consent and verify it reappears
  await request(`/trips/${tripId}/share-token/settings`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ share_location: true, share_contact: true })
  });
  const publicUnmaskedRes = await request(`/trips/public/${shareData.shareToken}`, { method: 'GET' });
  assert(publicUnmaskedRes.data.data.lastLocation !== null, 'Location reappears when consent is restored');
  assert(publicUnmaskedRes.data.data.emergencyContact !== null, 'Emergency contact reappears when consent is restored');

  // ---------------------------------------------------------
  // 8. Testing Token Revocation by Owner
  // ---------------------------------------------------------
  console.log('\n8. Testing Share Token Revocation:');
  const revokeRes = await request(`/trips/${tripId}/share-token/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(revokeRes.status === 200, `Revoked share token (status ${revokeRes.status})`);

  // Now public scanner should receive HTTP 410 Gone / Expired
  const revokedPublicRes = await request(`/trips/public/${shareData.shareToken}`, {
    method: 'GET'
  });
  assert(revokedPublicRes.status === 410, `Revoked token returns HTTP 410 Gone (got ${revokedPublicRes.status})`);
  assert(revokedPublicRes.data.expired === true, 'Public response explicitly marks link as expired');

  // ---------------------------------------------------------
  // 9. Testing Trip Completion Automatically Expires Public Link
  // ---------------------------------------------------------
  console.log('\n9. Testing Trip End Auto-Expiration:');
  // Create second trip to verify trip completion behavior
  const trip2Res = await request('/trips', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      tripName: 'Walk to Transit Center',
      startLocation: 'Main Quad',
      destination: 'Central Transit Hub',
      departureTime: new Date().toISOString()
    })
  });
  const trip2Id = trip2Res.data.data.id;
  await request(`/trips/${trip2Id}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });

  const trip2Share = await request(`/trips/${trip2Id}/share-token`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  const token2 = trip2Share.data.data.shareToken;

  // Verify public access is currently active
  const checkActive = await request(`/trips/public/${token2}`, { method: 'GET' });
  assert(checkActive.status === 200, `Second trip public link is initially active (got ${checkActive.status})`);

  // End the trip
  const endRes = await request(`/trips/${trip2Id}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(endRes.status === 200, `Safely completed second trip (status ${endRes.status})`);

  // Verify public access is now terminated
  const checkEnded = await request(`/trips/public/${token2}`, { method: 'GET' });
  assert(checkEnded.status === 410, `Completed trip returns HTTP 410 Expired on public link (got ${checkEnded.status})`);
  assert(checkEnded.data.status === 'completed', `Public response reflects completed status`);

  // ---------------------------------------------------------
  // 10. Nonexistent / Unguessable Token
  // ---------------------------------------------------------
  console.log('\n10. Testing Nonexistent Share Token:');
  const fakeTokenRes = await request('/trips/public/nonexistent_random_unfound_token_9999', { method: 'GET' });
  assert(fakeTokenRes.status === 404, `Nonexistent token returns 404 Not Found (got ${fakeTokenRes.status})`);

  // ---------------------------------------------------------
  // Summary
  // ---------------------------------------------------------
  console.log('\n====================================================');
  console.log(`🎉 ALL TESTS PASSED: ${passedTests} / ${totalTests}`);
  console.log('====================================================');
}

runTestSuite().catch(err => {
  console.error('\n❌ Test execution encountered an unhandled error:');
  console.error(err);
  process.exit(1);
});
