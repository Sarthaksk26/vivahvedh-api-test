import { Router } from 'express';
import { getPendingApprovals, getAllUsers, approveUser, banUser, deleteUser, getEnquiries, replyToEnquiry, markEnquiryResolved, setUserPlan, createOfflineUser } from '../controllers/admin.controller';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// @route   GET /api/admin/pending
router.get('/pending', requireAuth, requireAdmin, getPendingApprovals);

// @route   GET /api/admin/all-users
router.get('/all-users', requireAuth, requireAdmin, getAllUsers);

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
// @desc    Admin creates a profile for an offline/walk-in customer
router.post('/users/create', requireAuth, requireAdmin, createOfflineUser);

export default router;
