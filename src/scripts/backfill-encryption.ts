import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { encryptPII, isPIIEncryptionConfigured } from '../utils/encryption';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

// Helper to determine if a string in the DB is stored as plaintext
function isPlaintext(dbValue: string | null): boolean {
  if (!dbValue) return false; // Nulls are not plaintext
  if (dbValue.length < 44 || !/^[A-Za-z0-9+/=]+$/.test(dbValue)) {
    return true;
  }
  return false;
}

async function backfillEncryption() {
  console.log('🚀 Starting PII Encryption Backfill...');
  
  if (!isPIIEncryptionConfigured()) {
    console.error('❌ FATAL: PII_ENCRYPTION_KEY is not configured in .env');
    process.exit(1);
  }

  if (DRY_RUN) console.log('⚠️ RUNNING IN DRY-RUN MODE (No changes will be made)');

  let totalEncrypted = 0;
  let totalErrors = 0;

  try {
    // ── 1. User table (mobile, email, kycDocumentUrl) ──
    const users: any[] = await prisma.$queryRaw`SELECT id, mobile, email, "kycDocumentUrl" FROM "User"`;
    
    for (const row of users) {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      if (isPlaintext(row.mobile)) {
        updates.push(`"mobile" = $${paramIdx++}`);
        values.push(encryptPII(row.mobile, { deterministic: true }));
      }
      if (isPlaintext(row.email)) {
        updates.push(`"email" = $${paramIdx++}`);
        values.push(encryptPII(row.email, { deterministic: true }));
      }
      if (isPlaintext(row.kycDocumentUrl)) {
        updates.push(`"kycDocumentUrl" = $${paramIdx++}`);
        values.push(encryptPII(row.kycDocumentUrl, { deterministic: false }));
      }

      if (updates.length > 0) {
        if (!DRY_RUN) {
          try {
            values.push(row.id);
            const query = `UPDATE "User" SET ${updates.join(', ')} WHERE id = $${paramIdx}`;
            await prisma.$executeRawUnsafe(query, ...values);
            totalEncrypted += updates.length;
          } catch (err: any) {
            console.error(`❌ Failed to encrypt User ${row.id}: ${err.message}`);
            totalErrors++;
          }
        } else {
          totalEncrypted += updates.length;
        }
      }
    }

    // ── 2. UserEducation table (incomeProofUrl) ──
    const educations: any[] = await prisma.$queryRaw`SELECT "userId", "incomeProofUrl" FROM "UserEducation"`;
    
    for (const row of educations) {
      if (isPlaintext(row.incomeProofUrl)) {
        if (!DRY_RUN) {
          try {
            const encryptedUrl = encryptPII(row.incomeProofUrl, { deterministic: false });
            await prisma.$executeRawUnsafe(
              `UPDATE "UserEducation" SET "incomeProofUrl" = $1 WHERE "userId" = $2`,
              encryptedUrl, row.userId
            );
            totalEncrypted++;
          } catch (err: any) {
            console.error(`❌ Failed to encrypt UserEducation for User ${row.userId}: ${err.message}`);
            totalErrors++;
          }
        } else {
          totalEncrypted++;
        }
      }
    }

    // ── 3. UserPhysical table (medicalReportUrl) ──
    const physicals: any[] = await prisma.$queryRaw`SELECT "userId", "medicalReportUrl" FROM "UserPhysical"`;
    
    for (const row of physicals) {
      if (isPlaintext(row.medicalReportUrl)) {
        if (!DRY_RUN) {
          try {
            const encryptedUrl = encryptPII(row.medicalReportUrl, { deterministic: false });
            await prisma.$executeRawUnsafe(
              `UPDATE "UserPhysical" SET "medicalReportUrl" = $1 WHERE "userId" = $2`,
              encryptedUrl, row.userId
            );
            totalEncrypted++;
          } catch (err: any) {
            console.error(`❌ Failed to encrypt UserPhysical for User ${row.userId}: ${err.message}`);
            totalErrors++;
          }
        } else {
          totalEncrypted++;
        }
      }
    }

    console.log(`\n🏁 Backfill Complete!`);
    console.log(`✅ Total fields encrypted: ${totalEncrypted}`);
    console.log(`❌ Errors: ${totalErrors}`);

  } catch (error) {
    console.error("Critical error during backfill:", error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  backfillEncryption();
}
