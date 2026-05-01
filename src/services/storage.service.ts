import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

// ── Local Storage Setup ─────────────────────────────────────────────
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ── Cloudinary Setup ────────────────────────────────────────────────
const useCloudinary = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (useCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export const cloudinaryStorage = useCloudinary
  ? new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder: 'vivahvedh/profiles',
        format: async () => 'webp',
        public_id: (_req: any, _file: any) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          return `img-${uniqueSuffix}`;
        },
      } as any,
    })
  : null;

/**
 * Storage Service to handle both Local and Cloud storage
 */
export class StorageService {
  /**
   * Uploads a buffer to the configured storage (Cloudinary or Local)
   * @param buffer Image buffer
   * @param filename Desired filename (for local storage)
   * @returns URL of the uploaded image
   */
  static async uploadImage(buffer: Buffer, filename: string): Promise<string> {
    if (useCloudinary) {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'vivahvedh/profiles',
            format: 'webp',
            transformation: [{ width: 1200, crop: 'limit', quality: 80 }],
          },
          (error: any, result: any) => {
            if (error) return reject(error);
            resolve(result!.secure_url);
          }
        );
        uploadStream.end(buffer);
      });
    } else {
      const outputPath = path.join(UPLOAD_DIR, filename);
      await sharp(buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(outputPath);
      
      // Return a relative URL that the express app can serve
      return `/uploads/${filename}`;
    }
  }

  /**
   * Deletes an image from storage
   * @param url URL or filename of the image
   */
  static async deleteImage(url: string): Promise<void> {
    if (useCloudinary && url.includes('cloudinary.com')) {
      // Extract public_id from URL
      const parts = url.split('/');
      const filename = parts[parts.length - 1].split('.')[0];
      const folder = parts[parts.length - 2];
      const publicId = `vivahvedh/${folder}/${filename}`;
      await cloudinary.uploader.destroy(publicId);
    } else {
      const filename = path.basename(url);
      const filePath = path.join(UPLOAD_DIR, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
}
