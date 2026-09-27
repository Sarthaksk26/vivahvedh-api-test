import { Router } from 'express';
import { 
  sendInterest, 
  acceptInterest, 
  rejectInterest, 
  getMyConnections, 
  withdrawInterest,
  getStatusBetweenUsers,
  requestContact
} from '../controllers/connection.controller';
import { requireAuth, requireActiveAccount, requireActivePassword } from '../middleware/auth.middleware';

const router = Router();

// ACTIONS: require active, approved account
router.use(requireAuth, requireActivePassword, requireActiveAccount);
router.post('/send', sendInterest);
router.post('/accept', acceptInterest);
router.post('/reject', rejectInterest);
router.post('/withdraw', withdrawInterest);
router.post('/request-contact', requestContact);

// DATA: require only auth
router.get('/my-connections', getMyConnections);
router.get('/status/:id', getStatusBetweenUsers);

export default router;
