import { PrismaClient, Prisma } from '@prisma/client';
import { encryptPII, decryptPII, isPIIEncryptionConfigured } from '../utils/encryption';

// ═══════════════════════════════════════════════════════════════════
//  Prisma Client with Transparent PII Encryption Middleware
//
//  Handles transparent encryption/decryption of sensitive fields:
//    - User.mobile (Searchable/Deterministic)
//    - User.email (Searchable/Deterministic)
//    - User.kycDocumentUrl (Non-Deterministic)
//    - UserEducation.incomeProofUrl (Non-Deterministic)
//    - UserPhysical.medicalReportUrl (Non-Deterministic)
//
//  Active only when PII_ENCRYPTION_KEY is configured in .env.
// ═══════════════════════════════════════════════════════════════════

const prisma = new PrismaClient();

// Fields to encrypt per model
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  User: ['mobile', 'email', 'kycDocumentUrl', 'kycNumber'],
  UserEducation: ['incomeProofUrl'],
  UserPhysical: ['medicalReportUrl'],
};

// Searchable fields that require deterministic symmetric encryption
const SEARCHABLE_FIELDS = new Set(['email', 'mobile']);

// Models that use encryption
const ENCRYPTED_MODELS = new Set(Object.keys(ENCRYPTED_FIELDS));

if (isPIIEncryptionConfigured()) {
  console.log('[PII] Encryption middleware active. Sensitive fields will be encrypted at rest.');

  // ── 1. Encrypt Query Filters on Read/Delete/Update Operations ──
  prisma.$use(async (params: Prisma.MiddlewareParams, next: (params: Prisma.MiddlewareParams) => Promise<any>) => {
    const model = params.model;
    if (!model || !ENCRYPTED_MODELS.has(model)) return next(params);

    // List of query actions that filter on searchable PII columns
    const queryActions = ['findUnique', 'findFirst', 'findMany', 'count', 'update', 'upsert', 'delete', 'updateMany', 'deleteMany'];
    if (!queryActions.includes(params.action)) return next(params);

    const fields = ENCRYPTED_FIELDS[model];
    if (!fields) return next(params);

    const encryptQueryFilter = (where: Record<string, any>) => {
      if (!where) return where;
      
      for (const key of Object.keys(where)) {
        // Handle standard simple query filters or Prisma relation filters
        if (fields.includes(key) && SEARCHABLE_FIELDS.has(key)) {
          const val = where[key];
          
          if (typeof val === 'string') {
            where[key] = encryptPII(val, { deterministic: true });
          } else if (val && typeof val === 'object') {
            // Handle Prisma operator objects like: { equals: '...', in: [...] }
            if (typeof val.equals === 'string') {
              val.equals = encryptPII(val.equals, { deterministic: true });
            }
            if (Array.isArray(val.in)) {
              val.in = val.in.map((item: any) => 
                typeof item === 'string' ? encryptPII(item, { deterministic: true }) : item
              );
            }
          }
        }
      }
      return where;
    };

    // Recursively parse OR/AND/NOT arrays in Prisma queries
    const traverseConditions = (where: any) => {
      if (!where) return;
      encryptQueryFilter(where);

      if (Array.isArray(where.OR)) {
        where.OR.forEach(traverseConditions);
      }
      if (Array.isArray(where.AND)) {
        where.AND.forEach(traverseConditions);
      }
      if (Array.isArray(where.NOT)) {
        where.NOT.forEach(traverseConditions);
      }
    };

    if (params.args?.where) {
      traverseConditions(params.args.where);
    }

    return next(params);
  });

  // ── 2. Encrypt on Write Operations ──
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
          const deterministic = SEARCHABLE_FIELDS.has(field);
          data[field] = encryptPII(data[field], { deterministic });
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

  // ── 3. Decrypt on Read Operations ──
  prisma.$use(async (params: Prisma.MiddlewareParams, next: (params: Prisma.MiddlewareParams) => Promise<any>) => {
    const result = await next(params);

    const decryptRecursive = (data: any): any => {
      if (!data) return data;
      if (Array.isArray(data)) {
        return data.map(decryptRecursive);
      }
      if (typeof data === 'object') {
        if (data instanceof Date) return data;
        for (const key of Object.keys(data)) {
          if (
            (key === 'mobile' || key === 'email' || key === 'kycDocumentUrl' || 
             key === 'incomeProofUrl' || key === 'medicalReportUrl' || key === 'kycNumber') && 
            typeof data[key] === 'string'
          ) {
            data[key] = decryptPII(data[key]);
          } else {
            data[key] = decryptRecursive(data[key]);
          }
        }
      }
      return data;
    };

    return decryptRecursive(result);
  });
} else {
  console.warn('[PII] PII_ENCRYPTION_KEY not configured. Sensitive fields stored in plaintext.');
}

export default prisma;
