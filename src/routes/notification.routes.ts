import { Router } from 'express';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from '../controllers/userNotification.controller';
import { requireAuth, requireActiveAccount, requireActivePassword } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth, requireActivePassword, requireActiveAccount);
router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/:id/read', markAsRead);
router.patch('/mark-all-read', markAllAsRead);

export default router;
