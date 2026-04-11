import { PrismaClient } from '@prisma/client';
import mysql from 'mysql2/promise';

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

async function runMigration() {
  console.log("🚀 Starting Vivahvedh Data Migration Engine...");

  // 1. Setup connection to the OLD MySQL Database (READ ONLY)
  // Ensure you have this running locally before executing the final script.
  const legacyDb = await mysql.createConnection({
    host: 'localhost',
    user: 'root', // Add your local mysql username
    password: '', // Add your local mysql password
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

    for (const member of members) {
      try {
        // 3. The Mapping Engine: Translate old sloppy data into new strict data
        const mappedGender = String(member.gender).toUpperCase() === 'M' ? 'MALE' : 'FEMALE';
        const mappedStatus = member.maritalStatus === 'Unmarried' ? 'UNMARRIED' : 
                             member.maritalStatus === 'Divorced' ? 'DIVORCED' : 'UNMARRIED';

        // 4. Prisma Transaction: Safely insert into the new Normalized tables
        await prisma.user.create({
          data: {
            regId: member.regId || `VV-MIGRATE-${member.id}`,
            email: member.email || null,
            mobile: member.mobile || `MIGRATE-${Date.now()}-${member.id}`,
            password: member.password || 'migrated_temp_password', // Ideally hashed
            accountStatus: member.regStatus === 'Active' ? 'ACTIVE' : 'INACTIVE',
            paymentDone: member.paymentDone === 'Yes',
            
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
        migratedCount++;
      } catch (err) {
        console.error(`❌ FAILED to migrate RegID [${member.regId}]:`, err);
        failedCount++;
      }
    }

    console.log('-------------------------------------------');
    console.log(`🏁 MIGRATION COMPLETE.`);
    console.log(`🟢 Successfully migrated: ${migratedCount}`);
    console.log(`🔴 Failed to migrate: ${failedCount}`);

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
// To run: `npx tsx src/scripts/migrate.ts`
if (require.main === module) {
  runMigration();
}
