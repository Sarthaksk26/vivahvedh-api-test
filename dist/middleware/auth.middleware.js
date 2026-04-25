"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireActivePassword = exports.requireAdmin = exports.optionalAuth = exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// ── Helpers ─────────────────────────────────────────────────────────
const extractToken = (req) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer '))
        return null;
    return header.split(' ')[1];
};
const verifyToken = (token) => {
    return jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
};
// ── Core middleware ─────────────────────────────────────────────────
/** Requires a valid JWT. Rejects with 401 if missing/invalid. */
const requireAuth = (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized. No token provided.' });
    }
    try {
        req.user = verifyToken(token);
        next();
    }
    catch (_a) {
        return res.status(401).json({ error: 'Unauthorized. Invalid token.' });
    }
};
exports.requireAuth = requireAuth;
/** Attaches user if a valid JWT is present; does NOT block if absent. */
const optionalAuth = (req, _res, next) => {
    const token = extractToken(req);
    if (token) {
        try {
            req.user = verifyToken(token);
        }
        catch ( /* ignore */_a) { /* ignore */ }
    }
    next();
};
exports.optionalAuth = optionalAuth;
/** Requires `role === 'ADMIN'` on an already-authenticated request. */
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized.' });
    }
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin elevation required.' });
    }
    next();
};
exports.requireAdmin = requireAdmin;
/**
 * Blocks any request from a user whose `requiresPasswordChange` flag
 * is still true, EXCEPT for the password-change endpoint itself and login.
 * Returns 403 so the frontend can redirect to the change-password flow.
 */
const requireActivePassword = (req, res, next) => {
    if (!req.user)
        return next(); // No user attached → let requireAuth handle it
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
exports.requireActivePassword = requireActivePassword;
