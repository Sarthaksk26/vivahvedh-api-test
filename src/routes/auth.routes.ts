import { Router } from 'express';
import { register, login } from '../controllers/auth.controller';

const router = Router();

// @route POST /api/auth/register
// @desc Register a new user profile
router.post('/register', register);

// @route POST /api/auth/login
// @desc Omni-login with RegID, Email, or Mobile
router.post('/login', login);

export default router;
