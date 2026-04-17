import { Router } from 'express';
import { verifyPayment, getPendingPayments, updatePaymentStatus } from '../controllers/payment.controller';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { upload, processImage } from '../config/multer';

const router = Router();

// User endpoint to submit proof
router.post('/verify', requireAuth, upload.single('screenshot'), processImage, verifyPayment);

// Admin endpoints to manage proof
router.get('/admin/pending', requireAuth, requireAdmin, getPendingPayments);
router.patch('/admin/verify/:id', requireAuth, requireAdmin, updatePaymentStatus);

export default router;
