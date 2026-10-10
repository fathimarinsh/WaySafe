import { firestoreService } from '../services/firestoreService.js';
import { isSupabaseConfigured, getUserClient, supabaseAdmin } from '../config/supabase.js';

function mapContactRow(row) {
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

export async function listContacts(req, res, next) {
  try {
    const userId = req.user.uid;

    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { data, error } = await client
            .from('contacts')
            .select('*')
            .eq('user_id', userId)
            .order('is_primary', { ascending: false })
            .order('created_at', { ascending: false });

          if (!error && Array.isArray(data)) {
            return res.json({
              success: true,
              count: data.length,
              data: data.map(mapContactRow)
            });
          }
        }
      } catch (sbErr) {
        console.warn('[contactsController] Supabase listContacts notice:', sbErr.message);
      }
    }

    const contacts = await firestoreService.listContacts(userId);
    res.json({
      success: true,
      count: contacts.length,
      data: contacts
    });
  } catch (error) {
    next(error);
  }
}

export async function createContact(req, res, next) {
  try {
    const userId = req.user.uid;

    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const isPrimary = Boolean(req.body.isPrimary ?? req.body.is_primary);
          if (isPrimary) {
            await client
              .from('contacts')
              .update({ is_primary: false })
              .eq('user_id', userId);
          }

          const insertPayload = {
            user_id: userId,
            name: req.body.name,
            phone: req.body.phone,
            relationship: req.body.relationship || 'Emergency Contact',
            email: req.body.email || null,
            is_primary: isPrimary
          };

          const { data, error } = await client
            .from('contacts')
            .insert([insertPayload])
            .select()
            .single();

          if (!error && data) {
            return res.status(201).json({
              success: true,
              data: mapContactRow(data),
              message: 'Emergency contact added successfully.'
            });
          }

          if (error) {
            console.error('[contactsController Supabase createContact error]:', error.message);
            return res.status(500).json({
              success: false,
              error: 'Database operation failed while adding contact: ' + error.message
            });
          }
        }
      } catch (sbErr) {
        console.error('[contactsController] Supabase createContact exception:', sbErr.message);
        return res.status(500).json({
          success: false,
          error: 'Database exception: ' + sbErr.message
        });
      }
    }

    const contact = await firestoreService.createContact(userId, req.body);
    res.status(201).json({
      success: true,
      data: contact,
      message: 'Emergency contact added successfully.'
    });
  } catch (error) {
    next(error);
  }
}

export async function updateContact(req, res, next) {
  try {
    const userId = req.user.uid;
    const { id } = req.params;

    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { data: existing, error: findErr } = await client
            .from('contacts')
            .select('id, user_id')
            .eq('id', id)
            .eq('user_id', userId)
            .maybeSingle();

          if (!existing || findErr) {
            return res.status(404).json({
              success: false,
              error: `Contact not found with id: ${id}`
            });
          }

          const isPrimary = req.body.isPrimary !== undefined ? Boolean(req.body.isPrimary) : (req.body.is_primary !== undefined ? Boolean(req.body.is_primary) : undefined);
          if (isPrimary === true) {
            await client.from('contacts').update({ is_primary: false }).eq('user_id', userId);
          }

          const updates = {
            updated_at: new Date().toISOString()
          };
          if (req.body.name !== undefined) updates.name = req.body.name;
          if (req.body.phone !== undefined) updates.phone = req.body.phone;
          if (req.body.relationship !== undefined) updates.relationship = req.body.relationship;
          if (req.body.email !== undefined) updates.email = req.body.email;
          if (isPrimary !== undefined) updates.is_primary = isPrimary;

          const { data: updated, error: updErr } = await client
            .from('contacts')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

          if (!updErr && updated) {
            return res.json({
              success: true,
              data: mapContactRow(updated),
              message: 'Contact updated successfully.'
            });
          }

          if (updErr) {
            console.error('[contactsController Supabase updateContact error]:', updErr.message);
            return res.status(500).json({
              success: false,
              error: 'Database operation failed while updating contact: ' + updErr.message
            });
          }
        }
      } catch (sbErr) {
        console.error('[contactsController] Supabase updateContact exception:', sbErr.message);
        return res.status(500).json({
          success: false,
          error: 'Database exception: ' + sbErr.message
        });
      }
    }

    const existing = await firestoreService.getContactById(userId, id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Contact not found with id: ${id}`
      });
    }

    const updated = await firestoreService.updateContact(userId, id, req.body);
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: `Contact not found with id: ${id}`
      });
    }
    return res.json({
      success: true,
      data: updated,
      message: 'Contact updated successfully.'
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteContact(req, res, next) {
  try {
    const userId = req.user.uid;
    const { id } = req.params;

    if (isSupabaseConfigured && req.user.token && !req.user.isMock) {
      try {
        const client = getUserClient(req.user.token) || supabaseAdmin;
        if (client) {
          const { data: existing } = await client
            .from('contacts')
            .select('id')
            .eq('id', id)
            .eq('user_id', userId)
            .maybeSingle();

          if (!existing) {
            return res.status(404).json({
              success: false,
              error: `Contact not found with id: ${id}`
            });
          }

          const { error: delErr } = await client
            .from('contacts')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

          if (!delErr) {
            return res.json({
              success: true,
              message: 'Contact deleted successfully.'
            });
          }

          if (delErr) {
            console.error('[contactsController Supabase deleteContact error]:', delErr.message);
            return res.status(500).json({
              success: false,
              error: 'Database operation failed while deleting contact: ' + delErr.message
            });
          }
        }
      } catch (sbErr) {
        console.error('[contactsController] Supabase deleteContact exception:', sbErr.message);
        return res.status(500).json({
          success: false,
          error: 'Database exception: ' + sbErr.message
        });
      }
    }

    const deleted = await firestoreService.deleteContact(userId, id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: `Contact not found with id: ${id}`
      });
    }
    return res.json({
      success: true,
      message: 'Contact deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
}
