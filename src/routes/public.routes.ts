import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { submitEnquiry } from '../controllers/public.controller';

const router = Router();
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many contact attempts. Please try again later.' },
});

// @route   POST /api/public/contact
router.post('/contact', contactLimiter, submitEnquiry);

export default router;
