import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { Request, Response, NextFunction } from 'express';

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Use Memory Storage so we can process the buffer with sharp before saving
const storage = multer.memoryStorage();

// File filter to block malicious non-image payloads
const fileFilter = (req: any, file: any, cb: any) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WEBP are allowed.'), false);
  }
};

// Export the middleware ready to digest a single field max 5MB
export const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MegaBytes max
});

// Middleware to process image buffer with sharp and save as WebP
export const processImage = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.file) {
    return next();
  }

  try {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const userId = (req as any).user?.id || 'unknown';
    const filename = `img-${userId}-${uniqueSuffix}.webp`;
    const outputPath = path.join(uploadDir, filename);

    await sharp(req.file.buffer)
      .resize({ width: 1200, withoutEnlargement: true }) // Resize large images
      .webp({ quality: 80 }) // Compress and convert to WebP
      .toFile(outputPath);

    // Update req.file to reflect the saved file so controllers can use it
    req.file.filename = filename;
    req.file.path = outputPath;
    req.file.mimetype = 'image/webp';
    
    next();
  } catch (error) {
    console.error('Image Processing Error:', error);
    res.status(500).json({ error: 'Failed to process image.' });
  }
};
