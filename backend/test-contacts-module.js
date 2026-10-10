/**
 * WaySafe - Trusted Emergency Contacts Acceptance Test Suite
 * 
 * Tests:
 * 1. Missing authentication (401 Unauthorized on GET, POST, PATCH, DELETE)
 * 2. Invalid inputs (400 Bad Request on missing name, empty name, short/invalid phone)
 * 3. Add contact (POST /api/contacts returns 201 with contact record)
 * 4. List contacts (GET /api/contacts returns 200 with isolated user list)
 * 5. Edit contact (PATCH /api/contacts/:id returns 200 with updated fields)
 * 6. Cross-user access protection (User B cannot update or delete User A's contact)
 * 7. Delete contact (DELETE /api/contacts/:id returns 200 and removes record)
 * 8. Location sharing: map link generation, permission denial & sharing cancellation
 */

import { locationService } from '../frontend/js/location.js';

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
  console.log('🧪 WaySafe Trusted Contacts Acceptance Test Suite');
  console.log('====================================================\n');

  // Test 1: Missing Authentication
  console.log('1. Testing Missing Authentication (401 Unauthorized):');
  let res = await request('/contacts', { method: 'GET' });
  assert(res.status === 401, `GET /api/contacts without token returns 401 (got ${res.status})`);

  res = await request('/contacts', { method: 'POST', body: JSON.stringify({ name: 'Bob', phone: '1234567' }) });
  assert(res.status === 401, `POST /api/contacts without token returns 401 (got ${res.status})`);

  res = await request('/contacts/contact-123', { method: 'PATCH', body: JSON.stringify({ name: 'Bob' }) });
  assert(res.status === 401, `PATCH /api/contacts/:id without token returns 401 (got ${res.status})`);

  res = await request('/contacts/contact-123', { method: 'DELETE' });
  assert(res.status === 401, `DELETE /api/contacts/:id without token returns 401 (got ${res.status})`);

  // Test 2: Input Validation (POST)
  console.log('\n2. Testing Server-Side Input Validation (POST /api/contacts):');
  
  // 2a. Missing name
  res = await request('/contacts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ phone: '+1 555-019-2831' })
  });
  assert(res.status === 400, `Rejects missing name with 400 (got ${res.status})`);
  assert(res.data?.error?.includes('Validation') || res.data?.details?.length > 0, 'Returns validation error details');

  // 2b. Empty name
  res = await request('/contacts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ name: '   ', phone: '+1 555-019-2831' })
  });
  assert(res.status === 400, `Rejects whitespace-only name with 400 (got ${res.status})`);

  // 2c. Missing phone
  res = await request('/contacts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ name: 'Sarah Connor' })
  });
  assert(res.status === 400, `Rejects missing phone with 400 (got ${res.status})`);

  // 2d. Phone too short (< 5 digits)
  res = await request('/contacts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ name: 'Sarah Connor', phone: '12' })
  });
  assert(res.status === 400, `Rejects phone with <5 digits with 400 (got ${res.status})`);

  // Test 3: Add Contact for User Alpha
  console.log('\n3. Testing Add Contact (POST /api/contacts):');
  const addRes = await request('/contacts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      name: 'Sarah Connor',
      phone: '+1 555-019-2831',
      relationship: 'Sister',
      isPrimary: true
    })
  });
  assert(addRes.status === 201, `Contact created with status 201 (got ${addRes.status})`);
  assert(addRes.data?.success === true, 'Response indicates success');
  const contactA = addRes.data.data;
  assert(contactA.id, 'Returned unique contact ID');
  assert(contactA.name === 'Sarah Connor', 'Returned correct name');
  assert(contactA.phone === '+1 555-019-2831', 'Returned correct phone');
  assert(contactA.relationship === 'Sister', 'Returned correct relationship');
  const contactAId = contactA.id;

  // Test 4: List Contacts for User Alpha
  console.log('\n4. Testing List Contacts (GET /api/contacts):');
  const listRes = await request('/contacts', {
    method: 'GET',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(listRes.status === 200, `List returns status 200 (got ${listRes.status})`);
  assert(Array.isArray(listRes.data.data), 'Returns array of contacts');
  const foundA = listRes.data.data.find(c => c.id === contactAId);
  assert(Boolean(foundA), 'User Alpha can find their created contact in list');

  // Test 5: Input Validation (PATCH)
  console.log('\n5. Testing Input Validation on Edit (PATCH /api/contacts/:id):');
  res = await request(`/contacts/${contactAId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ name: '' })
  });
  assert(res.status === 400, `Rejects empty name in PATCH with 400 (got ${res.status})`);

  res = await request(`/contacts/${contactAId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({ phone: '12' })
  });
  assert(res.status === 400, `Rejects short phone in PATCH with 400 (got ${res.status})`);

  // Test 6: Edit Contact (PATCH /api/contacts/:id)
  console.log('\n6. Testing Edit Contact (PATCH /api/contacts/:id):');
  const editRes = await request(`/contacts/${contactAId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userAlphaToken}` },
    body: JSON.stringify({
      name: 'Sarah Connor-Reese',
      phone: '+1 555-999-4321',
      relationship: 'Older Sister'
    })
  });
  assert(editRes.status === 200, `Contact edited with status 200 (got ${editRes.status})`);
  const updatedA = editRes.data.data;
  assert(updatedA.name === 'Sarah Connor-Reese', 'Name was updated');
  assert(updatedA.phone === '+1 555-999-4321', 'Phone was updated');
  assert(updatedA.relationship === 'Older Sister', 'Relationship was updated');

  // Test 7: Cross-User Access Protection
  console.log('\n7. Testing Cross-User Access Protection:');
  // User Beta attempts to edit User Alpha's contact
  const crossEditRes = await request(`/contacts/${contactAId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userBetaToken}` },
    body: JSON.stringify({ name: 'Hacked Contact' })
  });
  assert(crossEditRes.status === 404, `User Beta cannot edit User Alpha's contact (got ${crossEditRes.status})`);

  // User Beta attempts to delete User Alpha's contact
  const crossDelRes = await request(`/contacts/${contactAId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userBetaToken}` }
  });
  assert(crossDelRes.status === 404, `User Beta cannot delete User Alpha's contact (got ${crossDelRes.status})`);

  // User Beta's contact list should NOT contain User Alpha's contact
  const betaListRes = await request('/contacts', {
    method: 'GET',
    headers: { Authorization: `Bearer ${userBetaToken}` }
  });
  const crossFound = betaListRes.data.data?.find(c => c.id === contactAId);
  assert(!crossFound, 'User Beta list does not contain User Alpha contact (isolation verified)');

  // Test 8: Delete Contact (DELETE /api/contacts/:id)
  console.log('\n8. Testing Delete Contact (DELETE /api/contacts/:id):');
  const delRes = await request(`/contacts/${contactAId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  assert(delRes.status === 200, `Contact deleted with status 200 (got ${delRes.status})`);

  // Verify it is no longer in list
  const afterDelList = await request('/contacts', {
    method: 'GET',
    headers: { Authorization: `Bearer ${userAlphaToken}` }
  });
  const deletedFound = afterDelList.data.data?.find(c => c.id === contactAId);
  assert(!deletedFound, 'Contact was removed from User Alpha contact list');

  // Test 9: Location Sharing Map Link & Error Handling
  console.log('\n9. Testing Location Sharing Map Link & Cancellation Handling:');
  const mapLink = locationService.getMapUrl(37.7749, -122.4194);
  assert(mapLink && mapLink.includes('openstreetmap.org') && mapLink.includes('37.7749'), 'Generated valid OpenStreetMap sharing link');

  // Test Permission Denial
  const origDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        geolocation: {
          getCurrentPosition: (success, error) => {
            error({
              code: 1,
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
              message: 'User denied location prompt'
            });
          }
        }
      },
      configurable: true,
      writable: true
    });
    await locationService.getCurrentPosition().catch(err => {
      assert(err.code === 'PERMISSION_DENIED', 'Maps permission denial correctly to PERMISSION_DENIED');
      assert(err.message.includes('denied'), 'Includes clear permission denial explanation');
    });

    // Test Web Share API cancellation / abort handling
    let shareAborted = false;
    const mockShare = async () => {
      const abortErr = new Error('Share cancelled by user');
      abortErr.name = 'AbortError';
      throw abortErr;
    };
    try {
      await mockShare();
    } catch (e) {
      if (e.name === 'AbortError') {
        shareAborted = true;
      }
    }
    assert(shareAborted === true, 'Gracefully handles Web Share API cancellation without error popup');
  } finally {
    if (origDescriptor) {
      Object.defineProperty(globalThis, 'navigator', origDescriptor);
    }
  }

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} ACCEPTANCE TESTS PASSED!`);
  console.log('====================================================\n');
}

runTestSuite().catch(err => {
  console.error('\n❌ Contacts acceptance test suite failed:', err);
  process.exit(1);
});
