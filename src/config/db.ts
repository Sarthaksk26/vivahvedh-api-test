import { PrismaClient, Prisma } from '@prisma/client';
import { encryptPII, decryptPII, isPIIEncryptionConfigured } from '../utils/encryption';

// ═══════════════════════════════════════════════════════════════════
//  Prisma Client with PII Encryption Middleware
//
//  Transparent encryption/decryption of sensitive fields:
//    - User.mobile
//    - User.email
//    - User.kycDocumentUrl
//    - UserEducation.incomeProofUrl
//    - UserPhysical.medicalReportUrl
//
//  The middleware runs on every Prisma query, automatically 
//  encrypting on write and decrypting on read. If PII_ENCRYPTION_KEY
//  is not configured, it operates as a plain PrismaClient.
// ═══════════════════════════════════════════════════════════════════

const prisma = new PrismaClient();

// Fields to encrypt per model
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  User: ['mobile', 'email', 'kycDocumentUrl'],
  UserEducation: ['incomeProofUrl'],
  UserPhysical: ['medicalReportUrl'],
};

// Models that use encryption
const ENCRYPTED_MODELS = new Set(Object.keys(ENCRYPTED_FIELDS));

if (isPIIEncryptionConfigured()) {
  console.log('[PII] Encryption middleware active. Sensitive fields will be encrypted at rest.');

  // ── Encrypt on Write ────────────────────────────────────────────
  prisma.$use(async (params: Prisma.MiddlewareParams, next: (params: Prisma.MiddlewareParams) => Promise<any>) => {
    const model = params.model;
    if (!model || !ENCRYPTED_MODELS.has(model)) return next(params);

    const writeActions = ['create', 'update', 'upsert', 'createMany', 'updateMany'];
    if (!writeActions.includes(params.action)) return next(params);

    const fields = ENCRYPTED_FIELDS[model];
    if (!fields) return next(params);

    const encryptData = (data: Record<string, any>) => {
      if (!data) return data;
      for (const field of fields) {
        if (data[field] && typeof data[field] === 'string') {
          data[field] = encryptPII(data[field]);
        }
      }
      return data;
    };

    if (params.args?.data) {
      params.args.data = encryptData(params.args.data);
    }
    if (params.args?.create) {
      params.args.create = encryptData(params.args.create);
    }
    if (params.args?.update) {
      params.args.update = encryptData(params.args.update);
    }

    return next(params);
  });

  // ── Decrypt on Read ─────────────────────────────────────────────
  prisma.$use(async (params: Prisma.MiddlewareParams, next: (params: Prisma.MiddlewareParams) => Promise<any>) => {
    const result = await next(params);
    const model = params.model;

    if (!model || !ENCRYPTED_MODELS.has(model)) return result;

    const readActions = ['findUnique', 'findFirst', 'findMany', 'create', 'update', 'upsert'];
    if (!readActions.includes(params.action)) return result;

    const fields = ENCRYPTED_FIELDS[model];
    if (!fields) return result;

    const decryptData = (data: Record<string, any>) => {
      if (!data) return data;
      for (const field of fields) {
        if (data[field] && typeof data[field] === 'string') {
          data[field] = decryptPII(data[field]);
        }
      }
      return data;
    };

    if (Array.isArray(result)) {
      return result.map(decryptData);
    }
    if (result && typeof result === 'object') {
      return decryptData(result);
    }

    return result;
  });
} else {
  console.warn('[PII] PII_ENCRYPTION_KEY not configured. Sensitive fields stored in plaintext.');
}

export default prisma;
