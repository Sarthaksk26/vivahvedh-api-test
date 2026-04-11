import { Router } from 'express';
import { submitEnquiry } from '../controllers/public.controller';

const router = Router();

// @route   POST /api/public/contact
router.post('/contact', submitEnquiry);

export default router;
