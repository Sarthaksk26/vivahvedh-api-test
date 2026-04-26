import { Router } from 'express';
import { 
  getPendingApprovals, 
  getAllUsers, 
  approveUser, 
  banUser, 
  deleteUser, 
  getEnquiries, 
  replyToEnquiry, 
  markEnquiryResolved, 
  setUserPlan, 
  createOfflineUser,
  getAdminStats,
  updateUserByAdmin,
  getUpcomingBirthdays,
  sendBirthdayWish,
  getConnectionLogs,
  getProfitStats,
  getAllUsersWithLocation
} from '../controllers/admin.controller';
import { getAdminNotifications } from '../controllers/notification.controller';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// @route   GET /api/admin/stats
router.get('/stats', requireAuth, requireAdmin, getAdminStats);

// Notifications
router.get('/notifications', requireAuth, requireAdmin, getAdminNotifications);

// @route   GET /api/admin/pending
router.get('/pending', requireAuth, requireAdmin, getPendingApprovals);

// @route   GET /api/admin/all-users
router.get('/all-users', requireAuth, requireAdmin, getAllUsers);

// Location-based user search (must be before /users/:id to avoid route conflict)
router.get('/users/by-location', requireAuth, requireAdmin, getAllUsersWithLocation);

// @route   PATCH /api/admin/users/:id
router.patch('/users/:id', requireAuth, requireAdmin, updateUserByAdmin);

// @route   POST /api/admin/approve
router.post('/approve', requireAuth, requireAdmin, approveUser);

// @route   POST /api/admin/ban
router.post('/ban', requireAuth, requireAdmin, banUser);

// @route   DELETE /api/admin/delete/:id
router.delete('/delete/:id', requireAuth, requireAdmin, deleteUser);

// Get Enquiries
router.get('/enquiries', requireAuth, requireAdmin, getEnquiries);

// Reply to Enquiry
router.post('/enquiries/reply', requireAuth, requireAdmin, replyToEnquiry);

// Resolve Enquiry
router.patch('/enquiries/resolve', requireAuth, requireAdmin, markEnquiryResolved);

// Set user plan (FREE / SILVER / GOLD)
router.post('/set-plan', requireAuth, requireAdmin, setUserPlan);

// @route   POST /api/admin/users/create
router.post('/users/create', requireAuth, requireAdmin, createOfflineUser);

// Birthdays
router.get('/birthdays', requireAuth, requireAdmin, getUpcomingBirthdays);
router.post('/birthdays/send-wishes/:id', requireAuth, requireAdmin, sendBirthdayWish);

// Connections
router.get('/connections', requireAuth, requireAdmin, getConnectionLogs);

// Profit Tracker
router.get('/profit', requireAuth, requireAdmin, getProfitStats);

export default router;
