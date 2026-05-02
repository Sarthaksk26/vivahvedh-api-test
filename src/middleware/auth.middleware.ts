import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ── Global type augmentation ────────────────────────────────────────
interface AuthUser {
  id: string;
  role: 'USER' | 'ADMIN';
  [key: string]: any; // Allow for extra properties if needed, but enforce id/role
}

declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
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

/** Requires a valid JWT and checks for suspended/deleted accounts. */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. No token provided.' });
  }
  try {
    const decoded: any = verifyToken(token);
    
    // Strict DB Check to prevent stale JWT bypass for suspended/deleted users
    const prisma = (await import('../config/db')).default;
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, role: true, accountStatus: true, planType: true, planExpiresAt: true, requiresPasswordChange: true }
    });

    if (!user || user.accountStatus === 'SUSPENDED' || user.accountStatus === 'DELETED') {
      return res.status(401).json({ error: 'Unauthorized. Account is inactive or non-existent.' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized. Invalid or expired token.' });
  }
};

/** Attaches user if a valid JWT is present; does NOT block if absent. Checks for suspension. */
export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (token) {
    try { 
      const decoded: any = verifyToken(token); 
      const prisma = (await import('../config/db')).default;
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, role: true, accountStatus: true, planType: true, planExpiresAt: true, requiresPasswordChange: true }
      });

      if (user && user.accountStatus !== 'SUSPENDED' && user.accountStatus !== 'DELETED') {
        req.user = user;
      }
    } catch { /* ignore invalid tokens */ }
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


/** 
 * Strict check for account status. 
 * Rejects if user is SUSPENDED or DELETED.
 * Fetches latest status from DB to bypass stale JWTs.
 */
export const requireActiveAccount = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return next();

  try {
    // Current state is already fetched in requireAuth for security, but we double check status logic here
    if (req.user.accountStatus === 'SUSPENDED' || req.user.accountStatus === 'DELETED') {
      return res.status(403).json({ 
        error: 'Your account has been suspended or deleted. Please contact support.',
        code: 'ACCOUNT_SUSPENDED'
      });
    }

    // Check Plan Expiry and downgrade if necessary
    if (req.user.planType !== 'FREE' && req.user.planExpiresAt) {
      const now = new Date();
      const expiresAt = new Date(req.user.planExpiresAt);
      if (now > expiresAt) {
        const prisma = (await import('../config/db')).default;
        await prisma.user.update({
          where: { id: req.user.id },
          data: { planType: 'FREE', planExpiresAt: null }
        });
        req.user.planType = 'FREE';
        req.user.planExpiresAt = null;
      }
    }

    if (req.user.accountStatus === 'INACTIVE') {
      const allowed = ['/api/user/profile', '/api/user/update', '/api/user/upload-photo', '/api/user/change-password', '/api/auth/login'];
      const isAllowed = allowed.some(p => req.originalUrl.startsWith(p));
      
      if (!isAllowed) {
        return res.status(403).json({ 
          error: 'Your account is pending admin approval. Access to this feature is restricted.',
          code: 'ACCOUNT_INACTIVE'
        });
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

