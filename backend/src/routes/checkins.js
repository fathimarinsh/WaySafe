import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { validateCheckin } from '../validators/checkinValidator.js';
import {
  createCheckin,
  listTripCheckins
} from '../controllers/checkinsController.js';

const router = Router();

// All checkin routes require authentication
router.use(authenticate);

// POST /api/checkins - record checkin for a trip
router.post('/', validateCheckin, createCheckin);

// GET /api/checkins/trip/:tripId - list checkin history for a trip
router.get('/trip/:tripId', listTripCheckins);

export default router;
