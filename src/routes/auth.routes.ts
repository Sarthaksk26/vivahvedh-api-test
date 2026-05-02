import { Router } from 'express';
import { register, login, refresh, logout } from '../controllers/auth.controller';

const router = Router();

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

export default router;
