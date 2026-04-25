import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ── Global type augmentation ────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────
const extractToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.split(' ')[1];
};

const verifyToken = (token: string) => {
  return jwt.verify(token, process.env.JWT_SECRET as string);
};

// ── Core middleware ─────────────────────────────────────────────────

/** Requires a valid JWT. Rejects with 401 if missing/invalid. */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. No token provided.' });
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized. Invalid token.' });
  }
};

/** Attaches user if a valid JWT is present; does NOT block if absent. */
export const optionalAuth = (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (token) {
    try { req.user = verifyToken(token); } catch { /* ignore */ }
  }
  next();
};

/** Requires `role === 'ADMIN'` on an already-authenticated request. */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin elevation required.' });
  }
  next();
};

/**
 * Blocks any request from a user whose `requiresPasswordChange` flag
 * is still true, EXCEPT for the password-change endpoint itself and login.
 * Returns 403 so the frontend can redirect to the change-password flow.
 */
export const requireActivePassword = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return next(); // No user attached → let requireAuth handle it

  if (req.user.requiresPasswordChange === true) {
    // Allow the user to actually change their password or log out
    const allowed = ['/api/user/change-password', '/api/auth/login'];
    if (allowed.some((p) => req.originalUrl.startsWith(p))) {
      return next();
    }
    return res.status(403).json({
      error: 'Password change required.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }

  next();
};
