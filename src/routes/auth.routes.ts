import { Router } from 'express';
import { register, login, refresh, logout, forgotPassword, resetPassword } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 requests per 15 minutes
  message: { error: 'Too many password reset requests from this IP, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// @route POST /api/auth/register
// @desc Register a new user profile
router.post('/register', register);

// @route POST /api/auth/login
// @desc Omni-login with RegID, Email, or Mobile
router.post('/login', login);

// @route POST /api/auth/refresh
// @desc Rotate access+refresh tokens via HttpOnly cookie
router.post('/refresh', refresh);

// @route POST /api/auth/logout
// @desc Clear HttpOnly cookies + revoke refresh token
router.post('/logout', logout);

// @route POST /api/auth/forgot-password
// @desc Request password reset email
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);

// @route POST /api/auth/reset-password
// @desc Reset password using token
router.post('/reset-password', resetPassword);

export default router;
