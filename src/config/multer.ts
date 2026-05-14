import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { Request, Response, NextFunction } from 'express';
import { StorageService } from '../services/storage.service';

// ── Directory setup ─────────────────────────────────────────────────
const isVercel = process.env.VERCEL === '1';
const UPLOAD_DIR = isVercel 
  ? path.join('/tmp', 'uploads') 
  : path.join(process.cwd(), 'uploads');
const DOCS_DIR = path.join(UPLOAD_DIR, 'docs');

for (const dir of [UPLOAD_DIR, DOCS_DIR]) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.warn(`[Multer Config] Could not create directory ${dir}:`, error);
    }
  }
}

// ── Shared constants ────────────────────────────────────────────────
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const DOCUMENT_MIME_TYPES = ['application/pdf'] as const;

/** 
 * Bulletproof filename sanitization. 
 * Strips directory traversal characters and replaces non-alphanumeric with dashes.
 */
const sanitizeFilename = (raw: string): string => {
  const ext = path.extname(raw).toLowerCase();
  const base = path.basename(raw, ext).replace(/[^a-z0-9]/gi, '-').toLowerCase();
  return `${base}-${Date.now()}${ext}`;
};

// ── Image upload (memory storage → sharp processing) ────────────────
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
 * Middleware: process an in-memory image buffer,
 * then persist to disk OR cloud storage via StorageService.
 */
export const processImage = async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.file) return next();

  try {
    const userId = (req as any).user?.id || 'anon';
    const filename = `img-${userId}-${Date.now()}-${Math.round(Math.random() * 1e4)}.webp`;

    // sharp will handle buffer sanitization/conversion
    const url = await StorageService.uploadImage(req.file.buffer, filename);

    req.file.path = url;
    req.file.filename = filename;
    req.file.mimetype = 'image/webp';

    next();
  } catch (error) {
    next(error);
  }
};

// ── Document upload (disk storage, no sharp) ────────────────────────
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
