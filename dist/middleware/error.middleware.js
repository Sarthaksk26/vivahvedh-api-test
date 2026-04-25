"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const AppError_1 = require("../utils/AppError");
/**
 * Central error handler — mounted as the LAST middleware in app.ts.
 *
 * Catches:
 *  - AppError       → known operational errors with correct status codes
 *  - ZodError       → request validation failures  → 400
 *  - Prisma errors  → unique constraint / not-found → 409 / 404
 *  - Multer errors  → file size / type rejections   → 400
 *  - Everything else                                → 500
 */
const errorHandler = (err, _req, res, _next) => {
    var _a, _b, _c;
    // ── AppError (our own throw) ──────────────────────────────────────
    if (err instanceof AppError_1.AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
    }
    // ── Zod validation ────────────────────────────────────────────────
    if (err instanceof zod_1.ZodError) {
        const formatted = err.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
        }));
        res.status(400).json({ error: 'Validation failed.', details: formatted });
        return;
    }
    // ── Prisma known-request errors ───────────────────────────────────
    if (err instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        // P2002 = unique constraint violation
        if (err.code === 'P2002') {
            const target = ((_b = (_a = err.meta) === null || _a === void 0 ? void 0 : _a.target) === null || _b === void 0 ? void 0 : _b.join(', ')) || 'field';
            res.status(409).json({ error: `A record with this ${target} already exists.` });
            return;
        }
        // P2025 = record not found for update/delete
        if (err.code === 'P2025') {
            res.status(404).json({ error: 'Requested record not found.' });
            return;
        }
    }
    // ── Multer errors (file size, type) ───────────────────────────────
    if (err.name === 'MulterError' || ((_c = err.message) === null || _c === void 0 ? void 0 : _c.includes('Invalid file type'))) {
        res.status(400).json({ error: err.message });
        return;
    }
    // ── Fallback — unexpected error ───────────────────────────────────
    console.error('Unhandled Error:', err);
    res.status(500).json({ error: 'Internal Server Error.' });
};
exports.errorHandler = errorHandler;
