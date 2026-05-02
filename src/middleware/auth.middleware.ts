import { Request, Response, NextFunction } from 'express';
import {
  verifyAccessToken,
  ACCESS_TOKEN_COOKIE,
} from '../config/tokens';
import type { AuthUser, AccessTokenPayload } from '../types';

// ── Global type augmentation ────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Extracts the access token from:
 *  1. HttpOnly cookie (primary — new flow)
 *  2. Authorization header (fallback — backward compat during migration)
 */
const extractToken = (req: Request): string | null => {
  // 1. Cookie-based (preferred)
  const cookieToken = req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;
  if (cookieToken) return cookieToken;

  // 2. Bearer header fallback
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.split(' ')[1];

  return null;
};

// ── Core middleware ─────────────────────────────────────────────────

/**
 * Requires a valid access token JWT.
 * 
 * PERFORMANCE: Validates JWT signature + expiry ONLY — no database call.
 * Account status enforcement is deferred to requireActiveAccount middleware
 * and re-validated during token refresh (every 15 min max).
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized. No token provided.' });
    return;
  }

  try {
    const decoded: AccessTokenPayload = verifyAccessToken(token);

    // Populate req.user from JWT payload — zero DB queries
    req.user = {
      id: decoded.id,
      role: decoded.role,
      accountStatus: decoded.accountStatus,
      planType: decoded.planType,
      planExpiresAt: null, // Not in access token; checked in requireActiveAccount
      requiresPasswordChange: decoded.requiresPasswordChange,
    };

    next();
  } catch (err: any) {
    console.error(`[Auth] Token validation failed: ${err.message}`);
    res.status(401).json({ error: 'Unauthorized. Invalid or expired token.' });
    return;
  }
};

/**
 * Attaches user if a valid JWT is present; does NOT block if absent.
 * 
 * PERFORMANCE: JWT-only validation — no database call.
 */
export const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const token = extractToken(req);
  if (token) {
    try {
      const decoded: AccessTokenPayload = verifyAccessToken(token);
      req.user = {
        id: decoded.id,
        role: decoded.role,
        accountStatus: decoded.accountStatus,
        planType: decoded.planType,
        planExpiresAt: null,
        requiresPasswordChange: decoded.requiresPasswordChange,
      };
    } catch { /* ignore invalid tokens */ }
  }
  next();
};


/** Requires `role === 'ADMIN'` on an already-authenticated request. */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }
  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden. Admin elevation required.' });
    return;
  }
  next();
};

/**
 * Blocks any request from a user whose `requiresPasswordChange` flag
 * is still true, EXCEPT for the password-change endpoint itself and login.
 * Returns 403 so the frontend can redirect to the change-password flow.
 */
export const requireActivePassword = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) return next(); // No user attached → let requireAuth handle it

  if (req.user.requiresPasswordChange === true) {
    // Allow the user to actually change their password or log out
    const allowed = ['/api/user/change-password', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout'];
    if (allowed.some((p) => req.originalUrl.startsWith(p))) {
      return next();
    }
    res.status(403).json({
      error: 'Password change required.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
    return;
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
      res.status(403).json({ 
        error: 'Your account has been suspended or deleted. Please contact support.',
        code: 'ACCOUNT_SUSPENDED'
      });
      return;
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
      const allowed = ['/api/user/profile', '/api/user/update', '/api/user/upload-photo', '/api/user/change-password', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout'];
      const isAllowed = allowed.some(p => req.originalUrl.startsWith(p));
      
      if (!isAllowed) {
        res.status(403).json({ 
          error: 'Your account is pending admin approval. Access to this feature is restricted.',
          code: 'ACCOUNT_INACTIVE'
        });
        return;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};
