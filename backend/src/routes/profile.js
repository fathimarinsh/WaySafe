import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { createOrUpdateProfile, getProfile } from '../controllers/profileController.js';

const router = Router();

// Profile operations require authentication
router.use(authenticate);

// POST /api/profile - create or update minimal profile
router.post('/', createOrUpdateProfile);

// GET /api/profile - retrieve authenticated user profile
router.get('/', getProfile);

export default router;
