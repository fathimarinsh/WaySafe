import { db, isMockMode } from '../config/firebase-admin.js';

// In-memory fallback storage for offline development/demo testing
const mockStore = {
  users: {}
};

function getMockUserStore(userId) {
  if (!mockStore.users[userId]) {
    mockStore.users[userId] = {
      trips: new Map(),
      contacts: new Map(),
      checkins: new Map() // key: tripId, value: Map of checkinId -> data
    };

    // Pre-populate demo contact ONLY for the designated demo traveler, never for real users
    if (userId === 'demo-user-101') {
      const demoContactId = 'demo-contact-01';
      mockStore.users[userId].contacts.set(demoContactId, {
        id: demoContactId,
        name: 'Sarah Connor',
        phone: '+1 555-019-2831',
        relationship: 'Sister',
        email: 'sarah.connor@example.com',
        isPrimary: true,
        createdAt: new Date().toISOString()
      });
    }
  }
  return mockStore.users[userId];
}

export const firestoreService = {
  // =========================================================================
  // TRIPS
  // =========================================================================

  async createTrip(userId, tripData) {
    const now = new Date().toISOString();
    const data = {
      ...tripData,
      status: tripData.status || 'planned',
      createdAt: now,
      updatedAt: now
    };

    if (isMockMode || !db) {
      const userStore = getMockUserStore(userId);
      const tripId = 'trip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const savedTrip = { id: tripId, ...data };
      userStore.trips.set(tripId, savedTrip);
      return savedTrip;
    }

    const tripsRef = db.collection('users').doc(userId).collection('trips');
    const docRef = await tripsRef.add(data);
    return { id: docRef.id, ...data };
  },

  async listTrips(userId) {
    if (isMockMode || !db) {
      const userStore = getMockUserStore(userId);
      const trips = Array.from(userStore.trips.values()).map(trip => {
        const count = userStore.checkins.get(trip.id)?.size || 0;
        return {
          ...trip,
          checkinCount: count,
          checkin_count: count
        };
      });
      // Sort newest first
      return trips.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const tripsRef = db.collection('users').doc(userId).collection('trips');
    const snapshot = await tripsRef.orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getActiveTrip(userId) {
    if (isMockMode || !db) {
      const userStore = getMockUserStore(userId);
      for (const trip of userStore.trips.values()) {
        if (trip.status === 'active') {
          const count = userStore.checkins.get(trip.id)?.size || 0;
          return {
            ...trip,
            checkinCount: count,
            checkin_count: count
          };
        }
      }
      return null;
    }

    const tripsRef = db.collection('users').doc(userId).collection('trips');
    const snapshot = await tripsRef.where('status', '==', 'active').limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  },

  async getTripById(userId, tripId) {
    if (isMockMode || !db) {
      const userStore = getMockUserStore(userId);
      const trip = userStore.trips.get(tripId);
      if (!trip) return null;
      const count = userStore.checkins.get(tripId)?.size || 0;
      return {
        ...trip,
        checkinCount: count,
        checkin_count: count
      };
    }

    const docRef = db.collection('users').doc(userId).collection('trips').doc(tripId);
    const doc = await docRef.get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  async updateTrip(userId, tripId, updateData) {
    const now = new Date().toISOString();
    const dataToUpdate = {
      ...updateData,
      updatedAt: now
    };

    if (isMockMode || !db) {
      const userStore = getMockUserStore(userId);
      const existing = userStore.trips.get(tripId);
      if (!existing) return null;
      const updated = { ...existing, ...dataToUpdate };
      userStore.trips.set(tripId, updated);
      return updated;
    }

    const docRef = db.collection('users').doc(userId).collection('trips').doc(tripId);
    const doc = await docRef.get();
    if (!doc.exists) return null;

    await docRef.update(dataToUpdate);
    const updatedDoc = await docRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() };
  },

  async deleteTrip(userId, tripId) {
    if (isMockMode || !db) {
      const userStore = getMockUserStore(userId);
      const existed = userStore.trips.has(tripId);
      userStore.trips.delete(tripId);
      userStore.checkins.delete(tripId);
      return existed;
    }

    const docRef = db.collection('users').doc(userId).collection('trips').doc(tripId);
    const doc = await docRef.get();
    if (!doc.exists) return false;

    // Delete subcollection checkins if any
    const checkinsRef = docRef.collection('checkins');
    const checkinDocs = await checkinsRef.get();
    const batch = db.batch();
    checkinDocs.forEach(d => batch.delete(d.ref));
    batch.delete(docRef);
    await batch.commit();

    return true;
  },

  // =========================================================================
  // CONTACTS
  // =========================================================================

  async listContacts(userId) {
    if (isMockMode || !db) {
      const userStore = getMockUserStore(userId);
      const contacts = Array.from(userStore.contacts.values());
      return contacts.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
    }

    const contactsRef = db.collection('users').doc(userId).collection('contacts');
    const snapshot = await contactsRef.orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async createContact(userId, contactData) {
    const now = new Date().toISOString();
    const data = {
      name: contactData.name,
      phone: contactData.phone,
      relationship: contactData.relationship || 'Emergency Contact',
      email: contactData.email || '',
      isPrimary: Boolean(contactData.isPrimary),
      createdAt: now,
      updatedAt: now
    };

    if (isMockMode || !db) {
      const userStore = getMockUserStore(userId);
      // If this contact is primary, unset other primaries
      if (data.isPrimary) {
        for (const [id, c] of userStore.contacts.entries()) {
          userStore.contacts.set(id, { ...c, isPrimary: false });
        }
      }
      const contactId = 'contact_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const saved = { id: contactId, ...data };
      userStore.contacts.set(contactId, saved);
      return saved;
    }

    const contactsRef = db.collection('users').doc(userId).collection('contacts');

    // If new contact is primary, clear previous primary contacts
    if (data.isPrimary) {
      const primaryDocs = await contactsRef.where('isPrimary', '==', true).get();
      const batch = db.batch();
      primaryDocs.forEach(doc => {
        batch.update(doc.ref, { isPrimary: false });
      });
      await batch.commit();
    }

    const docRef = await contactsRef.add(data);
    return { id: docRef.id, ...data };
  },

  async updateContact(userId, contactId, contactData) {
    const now = new Date().toISOString();
    const dataToUpdate = {
      ...contactData,
      updatedAt: now
    };

    if (isMockMode || !db) {
      const userStore = getMockUserStore(userId);
      const existing = userStore.contacts.get(contactId);
      if (!existing) return null;

      if (dataToUpdate.isPrimary) {
        for (const [id, c] of userStore.contacts.entries()) {
          if (id !== contactId) {
            userStore.contacts.set(id, { ...c, isPrimary: false });
          }
        }
      }

      const updated = { ...existing, ...dataToUpdate };
      userStore.contacts.set(contactId, updated);
      return updated;
    }

    const docRef = db.collection('users').doc(userId).collection('contacts').doc(contactId);
    const doc = await docRef.get();
    if (!doc.exists) return null;

    if (dataToUpdate.isPrimary) {
      const contactsRef = db.collection('users').doc(userId).collection('contacts');
      const primaryDocs = await contactsRef.where('isPrimary', '==', true).get();
      const batch = db.batch();
      primaryDocs.forEach(d => {
        if (d.id !== contactId) {
          batch.update(d.ref, { isPrimary: false });
        }
      });
      await batch.commit();
    }

    await docRef.update(dataToUpdate);
    const updatedDoc = await docRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() };
  },

  async deleteContact(userId, contactId) {
    if (isMockMode || !db) {
      const userStore = getMockUserStore(userId);
      const existed = userStore.contacts.has(contactId);
      userStore.contacts.delete(contactId);
      return existed;
    }

    const docRef = db.collection('users').doc(userId).collection('contacts').doc(contactId);
    const doc = await docRef.get();
    if (!doc.exists) return false;

    await docRef.delete();
    return true;
  },

  async getContactById(userId, contactId) {
    if (isMockMode || !db) {
      const userStore = getMockUserStore(userId);
      return userStore.contacts.get(contactId) || null;
    }

    const docRef = db.collection('users').doc(userId).collection('contacts').doc(contactId);
    const doc = await docRef.get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  // =========================================================================
  // CHECK-INS
  // =========================================================================

  async createCheckin(userId, tripId, checkinData) {
    const now = checkinData.checked_in_at || checkinData.checkedInAt || new Date().toISOString();
    const data = {
      tripId,
      trip_id: tripId,
      userId,
      user_id: userId,
      checkedInAt: now,
      checked_in_at: now,
      locationConsent: Boolean(checkinData.location_consent ?? checkinData.locationConsent),
      location_consent: Boolean(checkinData.location_consent ?? checkinData.locationConsent),
      latitude: checkinData.latitude ?? (checkinData.location ? checkinData.location.latitude : null),
      longitude: checkinData.longitude ?? (checkinData.location ? checkinData.location.longitude : null),
      accuracy: checkinData.accuracy ?? (checkinData.location ? checkinData.location.accuracy : null),
      type: checkinData.type || 'manual',
      batteryLevel: checkinData.batteryLevel !== undefined ? Number(checkinData.batteryLevel) : (checkinData.battery_level !== undefined ? Number(checkinData.battery_level) : null),
      battery_level: checkinData.battery_level !== undefined ? Number(checkinData.battery_level) : (checkinData.batteryLevel !== undefined ? Number(checkinData.batteryLevel) : null),
      isCharging: checkinData.isCharging !== undefined ? Boolean(checkinData.isCharging) : (checkinData.is_charging !== undefined ? Boolean(checkinData.is_charging) : null),
      is_charging: checkinData.is_charging !== undefined ? Boolean(checkinData.is_charging) : (checkinData.isCharging !== undefined ? Boolean(checkinData.isCharging) : null),
      location: checkinData.location || null,
      message: checkinData.message || "I'm safe",
      note: checkinData.note || '',
      createdAt: now,
      created_at: now
    };

    if (isMockMode || !db) {
      const userStore = getMockUserStore(userId);
      // Verify trip belongs to user
      const trip = userStore.trips.get(tripId);
      if (!trip) return null;

      if (!userStore.checkins.has(tripId)) {
        userStore.checkins.set(tripId, new Map());
      }
      const checkinId = 'chk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const saved = { id: checkinId, ...data };
      userStore.checkins.get(tripId).set(checkinId, saved);

      // Also update trip's lastCheckin summary and last_check_in_at
      userStore.trips.set(tripId, {
        ...trip,
        lastCheckin: saved,
        last_check_in_at: now,
        lastCheckInAt: now,
        updatedAt: now,
        updated_at: now
      });

      return saved;
    }

    const tripRef = db.collection('users').doc(userId).collection('trips').doc(tripId);
    const tripDoc = await tripRef.get();
    if (!tripDoc.exists) return null;

    const checkinRef = await tripRef.collection('checkins').add(data);
    const saved = { id: checkinRef.id, ...data };

    // Update parent trip with lastCheckin summary and last_check_in_at
    await tripRef.update({
      lastCheckin: saved,
      last_check_in_at: now,
      updatedAt: now,
      updated_at: now
    });

    return saved;
  },

  async createTripCheckin(userId, tripId, checkinData) {
    return this.createCheckin(userId, tripId, {
      ...checkinData,
      tripId
    });
  },

  async listTripCheckins(userId, tripId) {
    if (isMockMode || !db) {
      const userStore = getMockUserStore(userId);
      const trip = userStore.trips.get(tripId);
      if (!trip) return null;

      const tripCheckinsMap = userStore.checkins.get(tripId);
      if (!tripCheckinsMap) return [];
      const list = Array.from(tripCheckinsMap.values());
      // Sort newest first
      return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const tripRef = db.collection('users').doc(userId).collection('trips').doc(tripId);
    const tripDoc = await tripRef.get();
    if (!tripDoc.exists) return null;

    const checkinsRef = tripRef.collection('checkins');
    const snapshot = await checkinsRef.orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async findTripByShareToken(shareToken) {
    if (!shareToken) return null;
    if (isMockMode || !db) {
      for (const [userId, userStore] of Object.entries(mockStore.users)) {
        for (const [tripId, trip] of userStore.trips.entries()) {
          const tToken = trip.share_token || trip.shareToken;
          if (tToken === shareToken) {
            let contact = null;
            const contactId = trip.trusted_contact_id || trip.trustedContactId;
            if (contactId && userStore.contacts.has(contactId)) {
              contact = userStore.contacts.get(contactId);
            }
            let latestCheckin = null;
            const checkinsMap = userStore.checkins.get(tripId);
            if (checkinsMap && checkinsMap.size > 0) {
              const list = Array.from(checkinsMap.values()).sort((a, b) => new Date(b.checked_in_at || b.createdAt || b.created_at || 0) - new Date(a.checked_in_at || a.createdAt || a.created_at || 0));
              latestCheckin = list.find(c => c.latitude !== null && c.latitude !== undefined);
            }
            return { trip, contact, latestCheckin, userId };
          }
        }
      }
      return null;
    }

    // Firestore query if live
    const snapshot = await db.collectionGroup('trips').where('share_token', '==', shareToken).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    const trip = { id: doc.id, ...doc.data() };
    const userId = doc.ref.parent.parent.id;
    return { trip, contact: null, latestCheckin: null, userId };
  }
};

