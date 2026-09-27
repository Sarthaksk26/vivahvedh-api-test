import { Router } from 'express';
import { verifyPayment, getPendingPayments, updatePaymentStatus } from '../controllers/payment.controller';
import { requireAuth, requireAdmin, requireActiveAccount, requireActivePassword } from '../middleware/auth.middleware';
import { uploadDocument, processDocument } from '../config/multer';

const router = Router();

// User endpoint to submit proof
router.post('/verify', requireAuth, requireActivePassword, requireActiveAccount, uploadDocument.single('screenshot'), processDocument, verifyPayment);

// Admin endpoints to manage proof
router.get('/admin/pending', requireAuth, requireActiveAccount, requireAdmin, getPendingPayments);
router.patch('/admin/verify/:id', requireAuth, requireActiveAccount, requireAdmin, updatePaymentStatus);

export default router;
