import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { validateCreateContact, validateUpdateContact } from '../validators/contactValidator.js';
import {
  listContacts,
  createContact,
  updateContact,
  deleteContact
} from '../controllers/contactsController.js';

const router = Router();

// All contacts routes require authentication
router.use(authenticate);

// GET /api/contacts - list user contacts
router.get('/', listContacts);

// POST /api/contacts - add new emergency contact
router.post('/', validateCreateContact, createContact);

// PATCH /api/contacts/:id - update existing contact
router.patch('/:id', validateUpdateContact, updateContact);

// PUT /api/contacts/:id - update existing contact (compatibility)
router.put('/:id', validateUpdateContact, updateContact);

// DELETE /api/contacts/:id - remove contact
router.delete('/:id', deleteContact);

export default router;
