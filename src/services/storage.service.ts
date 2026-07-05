import { v2 as cloudinary } from 'cloudinary';

// ── Cloudinary Setup (strict, no local fallback) ────────────────────
// In serverless environments (Vercel/Render) the local filesystem is
// ephemeral and wiped on every cold start, so local-disk storage would
// silently lose uploaded files. Cloudinary is therefore mandatory.
const REQUIRED_CLOUDINARY_VARS = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;

const missingCloudinaryVars = REQUIRED_CLOUDINARY_VARS.filter(
  (key) => !process.env[key]
);

if (missingCloudinaryVars.length > 0) {
  // Fail fast at module load — never fall back to local disk silently.
  throw new Error(
    `[StorageService] FATAL: Cloudinary is required but the following environment ` +
      `variables are missing: ${missingCloudinaryVars.join(', ')}. ` +
      `Set them and restart the server. Local-disk storage is disabled because ` +
      `it does not persist across cold starts in serverless deployments.`
  );
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Storage Service — Cloudinary only.
 * Buffers are streamed directly to Cloudinary; nothing is written to disk.
 */
export class StorageService {
  /**
   * Uploads an image buffer to Cloudinary.
   * @param buffer Image buffer
   * @param filename Desired filename (used for logging/debug only)
   * @returns Secure URL of the uploaded image
   */
  static async uploadImage(buffer: Buffer, filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'vivahvedh/profiles',
          format: 'webp',
          transformation: [{ width: 1200, crop: 'limit', quality: 80 }],
        },
        (error: any, result: any) => {
          if (error) {
            return reject(
              new Error(
                `[StorageService] uploadImage failed for "${filename}": ${error.message}`
              )
            );
          }
          resolve(result!.secure_url);
        }
      );
      uploadStream.end(buffer);
    });
  }

  /**
   * Uploads a document buffer to Cloudinary.
   * Uses resource_type 'image' for image mimetypes (folder: vivahvedh/documents)
   * and 'raw' for PDFs so Cloudinary handles each correctly.
   * @param buffer Document buffer
   * @param filename Desired filename
   * @param mimeType Original file mimetype
   * @returns Secure URL of the uploaded document
   */
  static async uploadDocument(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const isImage = mimeType.startsWith('image/');
    const options: Record<string, unknown> = {
      folder: 'vivahvedh/documents',
      resource_type: isImage ? 'image' as const : 'raw' as const,
      type: 'authenticated', // Prevent public access via direct URL
    };
    if (isImage) {
      options.format = 'webp';
      options.transformation = [{ width: 1200, crop: 'limit', quality: 80 }];
    }
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (error: any, result: any) => {
          if (error) {
            return reject(
              new Error(
                `[StorageService] uploadDocument failed for "${filename}": ${error.message}`
              )
            );
          }
          resolve(result!.secure_url);
        }
      );
      uploadStream.end(buffer);
    });
  }

  /**
   * Deletes an image from Cloudinary.
   * @param url Secure URL or public_id of the image
   */
  static async deleteImage(url: string): Promise<void> {
    // Only initiate deletion for actual Cloudinary URLs; ignore other values
    // (e.g. legacy relative paths) rather than crashing.
    if (!url || !url.includes('cloudinary.com')) {
      return;
    }
    // Extract public_id from URL
    const parts = url.split('/');
    const filename = parts[parts.length - 1].split('.')[0];
    const folder = parts[parts.length - 2];
    const publicId = `vivahvedh/${folder}/${filename}`;
    await cloudinary.uploader.destroy(publicId);
  }
}
