import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { validateCreateTrip, validateUpdateTrip, validateUpdateTripStatus } from '../validators/tripValidator.js';
import {
  createTrip,
  listTrips,
  getActiveTrip,
  getTripById,
  updateTrip,
  startTrip,
  endTrip,
  updateTripStatus,
  deleteTrip,
  createTripCheckin,
  listTripCheckins
} from '../controllers/tripsController.js';

const router = Router();

// All trip endpoints require a verified Supabase access token
router.use(authenticate);

// GET /api/trips - list user trips
router.get('/', listTrips);

// GET /api/trips/active - get current active trip
router.get('/active', getActiveTrip);

// GET /api/trips/:id - get trip by id
router.get('/:id', getTripById);

// POST /api/trips - create new trip
router.post('/', validateCreateTrip, createTrip);

// PATCH /api/trips/:id - update trip details or status
router.patch('/:id', validateUpdateTrip, updateTrip);

// POST /api/trips/:id/start - start a planned trip
router.post('/:id/start', startTrip);

// POST /api/trips/:id/end - complete an active trip
router.post('/:id/end', endTrip);

// POST /api/trips/:id/checkins - record check-in with server-generated timestamp
router.post('/:id/checkins', createTripCheckin);

// GET /api/trips/:id/checkins - list check-in history for a trip
router.get('/:id/checkins', listTripCheckins);

// PATCH /api/trips/:id/status - legacy status update support
router.patch('/:id/status', validateUpdateTripStatus, updateTripStatus);

// DELETE /api/trips/:id - remove trip
router.delete('/:id', deleteTrip);

export default router;
