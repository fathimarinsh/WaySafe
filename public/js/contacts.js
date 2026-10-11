import { api } from './api.js';
import { supabase, isSupabaseConfigured } from './supabase-config.js';

/**
 * Helper to check if current user has an active Supabase session
 */
async function hasSupabaseUser() {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return Boolean(session && session.user);
  } catch (e) {
    return false;
  }
}

/**
 * Normalizes PostgreSQL snake_case contact rows into UI-compatible camelCase objects
 */
function mapContact(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    relationship: row.relationship,
    email: row.email,
    isPrimary: Boolean(row.is_primary),
    is_primary: Boolean(row.is_primary),
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at
  };
}

export const contactsService = {
  /**
   * Fetch all emergency contacts for current user
   */
  async list() {
    if (await hasSupabaseUser()) {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[Supabase contacts.list error]:', error);
      } else {
        return (data || []).map(mapContact);
      }
    }
    const res = await api.contacts.list();
    return res.data || [];
  },

  /**
   * Add a new emergency contact
   */
  async add(contact) {
    if (await hasSupabaseUser()) {
      const isPrimary = Boolean(contact.isPrimary ?? contact.is_primary);

      // If designated primary, reset existing primary contacts for this user
      if (isPrimary) {
        await supabase
          .from('contacts')
          .update({ is_primary: false })
          .neq('id', '00000000-0000-0000-0000-000000000000');
      }

      const insertPayload = {
        name: contact.name,
        phone: contact.phone,
        relationship: contact.relationship || 'Emergency Contact',
        email: contact.email || null,
        is_primary: isPrimary
      };

      const { data, error } = await supabase
        .from('contacts')
        .insert([insertPayload])
        .select()
        .single();

      if (error) {
        console.error('[Supabase contacts.add error]:', error);
        throw error;
      }
      return mapContact(data);
    }
    const res = await api.contacts.create(contact);
    return res.data;
  },

  /**
   * Update an emergency contact
   */
  async update(id, contact) {
    if (await hasSupabaseUser()) {
      const isPrimary = Boolean(contact.isPrimary ?? contact.is_primary);

      if (isPrimary) {
        await supabase
          .from('contacts')
          .update({ is_primary: false })
          .neq('id', id);
      }

      const updates = {
        name: contact.name,
        phone: contact.phone,
        relationship: contact.relationship || 'Emergency Contact',
        email: contact.email || null,
        is_primary: isPrimary,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[Supabase contacts.update error]:', error);
        throw error;
      }
      return mapContact(data);
    }
    const res = await api.contacts.update(id, contact);
    return res.data;
  },

  /**
   * Delete an emergency contact
   */
  async delete(id) {
    if (await hasSupabaseUser()) {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[Supabase contacts.delete error]:', error);
        throw error;
      }
      return true;
    }
    await api.contacts.delete(id);
    return true;
  },

  /**
   * Compose emergency SMS link
   * Generates a pre-filled sms: link for mobile devices.
   */
  createSmsLink(phone, message) {
    const cleanPhone = phone ? phone.replace(/[^\d+]/g, '') : '';
    const separator = /iPad|iPhone|iPod/.test(navigator.userAgent) ? '&' : '?';
    return `sms:${cleanPhone}${separator}body=${encodeURIComponent(message)}`;
  },

  /**
   * Compose emergency phone dial link
   */
  createTelLink(phone) {
    const cleanPhone = phone ? phone.replace(/[^\d+]/g, '') : '';
    return `tel:${cleanPhone}`;
  },

  /**
   * Format a high-clarity safety message for emergency contacts
   */
  formatEmergencyMessage({ contactName, tripTitle, batteryLevel, location, note }) {
    let msg = `[WaySafe Travel Alert] Hi ${contactName || 'there'}, `;

    if (tripTitle) {
      msg += `I am currently on my journey: "${tripTitle}". `;
    }

    if (batteryLevel !== undefined && batteryLevel !== null) {
      msg += `My phone battery is currently at ${batteryLevel}%. `;
    }

    if (location && location.latitude && location.longitude) {
      msg += `My last reported location: https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=16/${location.latitude}/${location.longitude} (accuracy ~${location.accuracy || 15}m). `;
    }

    if (note) {
      msg += `Note: ${note}. `;
    } else {
      msg += `Please keep this for reference in case my phone turns off.`;
    }

    return msg;
  }
};
