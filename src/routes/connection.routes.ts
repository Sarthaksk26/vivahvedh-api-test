import { Router } from 'express';
import { 
  sendInterest, 
  acceptInterest, 
  rejectInterest, 
  getMyConnections, 
  withdrawInterest,
  getStatusBetweenUsers
} from '../controllers/connection.controller';
import { requireAuth, requireActiveAccount } from '../middleware/auth.middleware';

const router = Router();

// ACTIONS: require active, approved account
router.post('/send', requireAuth, requireActiveAccount, sendInterest);
router.post('/accept', requireAuth, requireActiveAccount, acceptInterest);
router.post('/reject', requireAuth, requireActiveAccount, rejectInterest);
router.post('/withdraw', requireAuth, requireActiveAccount, withdrawInterest);

// DATA: require only auth
router.get('/my-connections', requireAuth, getMyConnections);
router.get('/status/:id', requireAuth, getStatusBetweenUsers);

export default router;
