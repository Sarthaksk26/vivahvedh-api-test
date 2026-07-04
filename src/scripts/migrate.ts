import { PrismaClient } from '@prisma/client';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { appendFile } from 'fs/promises';
import path from 'path';

/**
 * VIVAHVEDH GLOBAL MIGRATION SCRIPT
 * ---------------------------------
 * This script serves as the bridge between your old WordPress MySQL database
 * and your new lightning-fast PostgreSQL robust backend.
 *
 * HOW IT WORKS:
 * 1. It creates a READ-ONLY connection to your old MySQL database.
 * 2. It connects to your NEW PostgreSQL database via Prisma.
 * 3. It loops through legacy users and securely migrates their data into the strict new layout.
 */

const prisma = new PrismaClient();
const CHUNK_SIZE = 50;
const ERROR_LOG_PATH = path.resolve(__dirname, '../../migration_errors.log');

async function logError(regId: string, reason: string) {
  const line = `[${new Date().toISOString()}] RegID: ${regId} — ${reason}\n`;
  await appendFile(ERROR_LOG_PATH, line, 'utf-8');
}

async function migrateMember(member: any): Promise<boolean> {
  try {
    // The Mapping Engine: Translate old sloppy data into new strict data
    const mappedGender = String(member.gender).toUpperCase() === 'M' ? 'MALE' : 'FEMALE';
    const mappedStatus = member.maritalStatus === 'Unmarried' ? 'UNMARRIED' :
                         member.maritalStatus === 'Divorced' ? 'DIVORCED' : 'UNMARRIED';

    // Hash the password — never store plaintext
    const rawPassword = member.password || 'migrated_temp_password';
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    // Prisma Transaction: Safely insert into the new Normalized tables
    await prisma.user.create({
      data: {
        regId: member.regId || `VV-MIGRATE-${member.id}`,
        email: member.email || null,
        mobile: member.mobile || `MIGRATE-${Date.now()}-${member.id}`,
        password: hashedPassword,
        accountStatus: member.regStatus === 'Active' ? 'ACTIVE' : 'INACTIVE',
        paymentDone: member.paymentDone === 'Yes',
        requiresPasswordChange: true,  // Force password reset on first login

        // Building the linked profile simultaneously
        profile: {
          create: {
            firstName: member.firstName || 'Unknown',
            lastName: member.lastName || '',
            middleName: member.middleName || null,
            gender: mappedGender,
            maritalStatus: mappedStatus,
            birthPlace: member.birthPlace || null,
            aboutMe: member.aboutMe || null,
          }
        },

        // Linking family details automatically
        family: {
          create: {
            fatherName: member.fatherFullName || null,
            fatherOccupation: member.fatherOccupation || null,
            motherName: member.motherFullName || null,
            brothers: parseInt(member.brothers) || 0,
            sisters: parseInt(member.sisters) || 0,
          }
        }
      }
    });

    return true;
  } catch (err) {
    const regId = member.regId || `VV-MIGRATE-${member.id}`;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ FAILED to migrate RegID [${regId}]:`, err);
    await logError(regId, message).catch(e =>
      console.error(`⚠️  Failed to write error log for [${regId}]:`, e)
    );
    return false;
  }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function runMigration() {
  console.log("🚀 Starting Vivahvedh Data Migration Engine...");

  // 1. Setup connection to the OLD MySQL Database (READ ONLY)
  // Ensure you have this running locally before executing the final script.
  const legacyDb = await mysql.createConnection({
    host: 'localhost',
    user: 'root',       // Add your local mysql username
    password: '',       // Add your local mysql password
    database: 'vivahbrr_vivahvedh744'
  });

  try {
    console.log("✅ Attached to legacy MySQL database.");

    // 2. Fetch all legacy members
    const [rows] = await legacyDb.execute('SELECT * FROM members');
    const members = rows as any[];
    console.log(`📦 Found ${members.length} legacy profiles. Beginning translations...`);

    let migratedCount = 0;
    let failedCount = 0;
    const chunks = chunkArray(members, CHUNK_SIZE);
    console.log(`📎 Split into ${chunks.length} chunks of ${CHUNK_SIZE} each.`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const results = await Promise.all(chunk.map(member => migrateMember(member)));

      const chunkMigrated = results.filter(Boolean).length;
      const chunkFailed = results.filter(r => !r).length;
      migratedCount += chunkMigrated;
      failedCount += chunkFailed;

      console.log(
        `  Chunk ${i + 1}/${chunks.length}: ${chunkMigrated} migrated, ${chunkFailed} failed ` +
        `(total so far: ${migratedCount} ✅ / ${failedCount} ❌)`
      );
    }

    console.log('-------------------------------------------');
    console.log(`🏁 MIGRATION COMPLETE.`);
    console.log(`🟢 Successfully migrated: ${migratedCount}`);
    console.log(`🔴 Failed to migrate: ${failedCount}`);
    console.log(`📄 Details for failed rows written to: ${ERROR_LOG_PATH}`);

  } catch (error) {
    console.error("Critical Database Error:", error);
  } finally {
    // 5. Safely close both connections
    await legacyDb.end();
    await prisma.$disconnect();
    console.log("🔌 All database connections closed.");
  }
}

// Ensure you run `npm install mysql2` before trying to execute this.
// To run: `npx tsx api/src/scripts/migrate.ts`
if (require.main === module) {
  runMigration();
}
