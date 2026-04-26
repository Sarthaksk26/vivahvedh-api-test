import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/AppError';

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
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  // ── AppError (our own throw) ──────────────────────────────────────
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // ── Zod validation ────────────────────────────────────────────────
  if (err instanceof ZodError) {
    const formatted = err.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    res.status(400).json({ error: 'Validation failed.', details: formatted });
    return;
  }

  // ── Prisma known-request errors ───────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 = unique constraint violation
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'field';
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
  if (err.name === 'MulterError' || err.message?.includes('Invalid file type')) {
    res.status(400).json({ error: err.message });
    return;
  }

  // ── Fallback — unexpected error ───────────────────────────────────
  console.error('Unhandled Error:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });
  res.status(500).json({ error: 'Internal Server Error.' });
};
