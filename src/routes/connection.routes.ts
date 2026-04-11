import { Router } from 'express';
import { sendInterest, acceptInterest, rejectInterest, getMyConnections } from '../controllers/connection.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// @route   POST /api/connections/send
router.post('/send', requireAuth, sendInterest);

// @route   POST /api/connections/accept
router.post('/accept', requireAuth, acceptInterest);

// @route   POST /api/connections/reject
router.post('/reject', requireAuth, rejectInterest);

// @route   GET /api/connections/my-connections
router.get('/my-connections', requireAuth, getMyConnections);

export default router;
