import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { StorageService } from '../services/storage.service';

/**
 * Storage strategy: in-memory only.
 * Buffers are handed directly to StorageService, which streams them to
 * Cloudinary. Nothing is written to disk (serverless-safe). See
 * storage.service.ts for the strict Cloudinary enforcement.
 */

// ── Shared constants ────────────────────────────────────────────────
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const DOCUMENT_MIME_TYPES = ['application/pdf'] as const;

// ── Image upload (memory storage → Cloudinary via StorageService) ───
const imageFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (IMAGE_MIME_TYPES.includes(file.mimetype as any)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid image type. Only JPEG, PNG, and WEBP allowed.'));
  }
};

export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1, // Only 1 file per request
  },
});

/**
 * Middleware: take the in-memory image buffer and stream it to
 * Cloudinary via StorageService. No disk I/O.
 */
export const processImage = async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.file) return next();

  try {
    const userId = (req as any).user?.id || 'anon';
    const filename = `img-${userId}-${Date.now()}-${Math.round(Math.random() * 1e4)}.webp`;

    const url = await StorageService.uploadImage(req.file.buffer, filename);

    req.file.path = url;
    req.file.filename = filename;
    req.file.mimetype = 'image/webp';

    next();
  } catch (error) {
    next(error);
  }
};

// ── Document upload (memory storage → Cloudinary via StorageService) ──
const documentFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (DOCUMENT_MIME_TYPES.includes(file.mimetype as any)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid document type. Only PDF allowed.'));
  }
};

export const uploadDocument = multer({
  storage: multer.memoryStorage(),
  fileFilter: documentFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB (reduced from 20)
    files: 1,
  },
});

export const processDocument = async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.file) return next();

  try {
    const userId = (req as any).user?.id || 'anon';
    const filename = `doc-${userId}-${Date.now()}-${Math.round(Math.random() * 1e4)}.pdf`;

    const url = await StorageService.uploadDocument(req.file.buffer, filename);

    req.file.path = url;
    req.file.filename = filename;

    next();
  } catch (error) {
    next(error);
  }
};
