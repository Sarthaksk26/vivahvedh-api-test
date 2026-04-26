import { Router } from 'express';
import { sendInterest, acceptInterest, rejectInterest, getMyConnections, withdrawInterest } from '../controllers/connection.controller';
import { requireAuth, requireActiveAccount } from '../middleware/auth.middleware';

const router = Router();

// Connection routes require active, approved account
router.use(requireAuth, requireActiveAccount);

// @route   POST /api/connections/send
router.post('/send', sendInterest);

// @route   POST /api/connections/accept
router.post('/accept', acceptInterest);

// @route   POST /api/connections/reject
router.post('/reject', rejectInterest);

// @route   GET /api/connections/my-connections
router.get('/my-connections', getMyConnections);

// @route   POST /api/connections/withdraw
router.post('/withdraw', withdrawInterest);


export default router;
