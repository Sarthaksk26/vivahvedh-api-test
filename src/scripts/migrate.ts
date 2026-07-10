import { PrismaClient } from '@prisma/client';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { appendFile } from 'fs/promises';
import path from 'path';
import { StorageService } from '../services/storage.service';

/**
 * VIVAHVEDH GLOBAL MIGRATION SCRIPT (HARDENED)
 * ---------------------------------
 * Safely migrates legacy WordPress/MySQL data to PostgreSQL.
 * 
 * Features:
 * - Dry-run mode (--dry-run)
 * - Resumability (skips existing users)
 * - Secure Password resets (discards unusable legacy hashes)
 * - Photo migration via Cloudinary
 */

const prisma = new PrismaClient();
const CHUNK_SIZE = 20; // Reduced for image processing
const ERROR_LOG_PATH = path.resolve(__dirname, '../../migration_errors.log');

const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');

async function logError(regId: string, reason: string) {
  const line = `[${new Date().toISOString()}] RegID: ${regId} — ${reason}\n`;
  await appendFile(ERROR_LOG_PATH, line, 'utf-8');
}

async function migrateMember(member: any, images: any[]): Promise<'migrated' | 'skipped' | 'failed'> {
  const regId = member.regId || `VV-MIGRATE-${member.id}`;
  const mobile = member.mobile || `MIGRATE-${member.id}`;
  const email = member.email || null;

  try {
    // 1. Resumability: Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { regId: regId },
          { mobile: mobile },
          ...(email ? [{ email: email }] : [])
        ]
      }
    });

    if (existingUser) {
      return 'skipped';
    }

    if (IS_DRY_RUN) {
      return 'migrated';
    }

    // 2. Password Handling: Create a random secure hash
    // We do NOT use the old password hash as it's likely a WP Phpass or bcrypt that might not match our exact salt setup,
    // plus it's safer to force a reset via the Forgot Password flow.
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    // 3. Taxonomy & Field Mappings
    let mappedGender: 'MALE' | 'FEMALE' | 'OTHER' = 'OTHER';
    if (member.gender) {
      const g = String(member.gender).toUpperCase();
      if (g === 'M' || g === 'MALE') mappedGender = 'MALE';
      else if (g === 'F' || g === 'FEMALE') mappedGender = 'FEMALE';
    }
    
    let mappedStatus: 'UNMARRIED' | 'DIVORCED' | 'WIDOWED' | 'SEPARATED' = 'UNMARRIED';
    if (member.maritalStatus) {
      const ms = String(member.maritalStatus).toLowerCase();
      if (ms.includes('divorc')) mappedStatus = 'DIVORCED';
      else if (ms.includes('widow')) mappedStatus = 'WIDOWED';
      else if (ms.includes('separat')) mappedStatus = 'SEPARATED';
      else if (ms.includes('unmarried') || ms.includes('single')) mappedStatus = 'UNMARRIED';
    }

    const religionId = member.religionId ? parseInt(member.religionId) : null;
    const casteId = member.casteId ? parseInt(member.casteId) : null;
    const subCasteId = member.subCasteId ? parseInt(member.subCasteId) : null;

    let parsedBirthDateTime: Date | null = null;
    if (member.birthDateTime) {
      const d = new Date(member.birthDateTime);
      if (!isNaN(d.getTime())) parsedBirthDateTime = d;
    }

    const smoke = member.smoke === 'Yes' || member.smoke === 'Y' || member.smoke === '1';
    const drink = member.drink === 'Yes' || member.drink === 'Y' || member.drink === '1';

    // 4. Photo & KYC Migration
    const uploadedImages = [];
    const baseUrl = process.env.LEGACY_IMAGE_BASE_URL || 'https://vivahvedh.com/uploads/';
    for (const img of images) {
      if (img.FileName) {
        try {
          const imgUrl = img.FileName.startsWith('http') ? img.FileName : `${baseUrl}${img.FileName}`;
          const response = await fetch(imgUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const cloudinaryUrl = await StorageService.uploadImage(buffer, img.FileName);
            
            uploadedImages.push({
              url: cloudinaryUrl,
              isPrimary: uploadedImages.length === 0, // First image is primary
            });
          } else {
             await logError(regId, `Failed to download image ${img.FileName}: HTTP ${response.status}`);
          }
        } catch (e: any) {
           await logError(regId, `Failed to upload image ${img.FileName} to Cloudinary: ${e.message}`);
        }
      }
    }

    let kycDocumentUrl: string | null = null;
    let kycType: 'AADHAR' | 'PAN' | 'PASSPORT' | null = null;
    if (member.idProof) {
      try {
        const docUrl = member.idProof.startsWith('http') ? member.idProof : `${baseUrl}${member.idProof}`;
        const response = await fetch(docUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const ext = member.idProof.split('.').pop()?.toLowerCase();
          const mimeType = ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
          
          const uploadedUrl = await StorageService.uploadDocument(buffer, member.idProof, mimeType);
          kycDocumentUrl = uploadedUrl;
          
          const lowerProof = member.idProof.toLowerCase();
          if (lowerProof.includes('pan')) kycType = 'PAN';
          else if (lowerProof.includes('passport')) kycType = 'PASSPORT';
          else kycType = 'AADHAR';
        } else {
          await logError(regId, `Failed to download KYC doc ${member.idProof}: HTTP ${response.status}`);
        }
      } catch (e: any) {
        await logError(regId, `Failed to upload KYC doc ${member.idProof} to Cloudinary: ${e.message}`);
      }
    }

    const addresses = [];
    if (member.permanentAddress) {
      addresses.push({
        addressType: 'PERMANENT',
        addressLine: member.permanentAddress,
        talukaId: member.talukaId ? parseInt(member.talukaId) : null,
        districtId: member.districtId ? parseInt(member.districtId) : null,
        stateId: member.stateId ? parseInt(member.stateId) : null,
      });
    }
    if (member.currentAddress && member.currentAddress !== member.permanentAddress) {
      addresses.push({
        addressType: 'CURRENT',
        addressLine: member.currentAddress,
      });
    }

    // 5. Transaction: Safely insert into PostgreSQL
    await prisma.user.create({
      data: {
        regId: regId,
        email: email,
        mobile: mobile,
        password: hashedPassword,
        accountStatus: member.regStatus === 'Active' ? 'ACTIVE' : 'INACTIVE',
        paymentDone: member.paymentDone === 'Yes',
        profileCreatedBy: member.createdBy || null,
        requiresPasswordChange: true, // Force password reset on first login
        kycDocumentUrl,
        kycType,

        profile: {
          create: {
            firstName: member.firstName || 'Unknown',
            lastName: member.lastName || '',
            middleName: member.middleName || '',
            gender: mappedGender,
            maritalStatus: mappedStatus,
            birthDateTime: parsedBirthDateTime,
            birthPlace: member.birthPlace || null,
            aboutMe: member.aboutMe || null,
            religionId: religionId && !isNaN(religionId) ? religionId : null,
            casteId: casteId && !isNaN(casteId) ? casteId : null,
            subCasteId: subCasteId && !isNaN(subCasteId) ? subCasteId : null,
          }
        },

        family: {
          create: {
            fatherName: member.fatherFullName || null,
            fatherOccupation: member.fatherOccupation || null,
            motherName: member.motherFullName || null,
            motherOccupation: member.motherOccupation || null,
            motherHometown: member.motherHometown || null,
            maternalUncleName: member.maternalUncleName || null,
            brothers: parseInt(member.brothers) || 0,
            marriedBrothers: parseInt(member.marriedBrothers) || 0,
            sisters: parseInt(member.sisters) || 0,
            marriedSisters: parseInt(member.marriedSisters) || 0,
            relativesSirnames: member.relativesSirnames || null,
            familyBackground: member.familyBackground || null,
            familyWealth: member.family_wealth || null,
            agricultureLand: member.agricultureLand || null,
            plot: member.plot || null,
            flat: member.flat || null,
          }
        },

        physical: {
           create: {
             height: member.height ? String(member.height) : null,
             weight: member.weight ? parseInt(member.weight) : null,
             bloodGroup: member.bloodGroup || null,
             complexion: member.complexion || null,
             health: member.health || null,
             diet: member.diet || null,
             smoke,
             drink,
           }
        },

        education: {
          create: {
            qualificationId: member.qualification ? parseInt(member.qualification) : null,
            trade: member.trade || null,
            college: member.collegeuniversity || null,
            jobBusiness: member.job_business || null,
            jobAddress: member.job_businessAddress || null,
            annualIncome: member.annualincome || null,
            specialAchievement: member.specialAchievement || null,
          }
        },

        astrology: {
          create: {
            gothra: member.gothra || null,
            rashi: member.rashi || null,
            nakshatra: member.nakshatra || null,
            charan: member.charan || null,
            nadi: member.nadi || null,
            gan: member.gan || null,
            mangal: member.mangal || null,
          }
        },

        preferences: {
          create: {
            expectations: member.expectations || null,
          }
        },

        addresses: {
          create: addresses,
        },

        images: {
          create: uploadedImages
        }
      }
    });

    return 'migrated';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ FAILED to migrate RegID [${regId}]:`, err);
    await logError(regId, message).catch(e =>
      console.error(`⚠️  Failed to write error log for [${regId}]:`, e)
    );
    return 'failed';
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
  if (IS_DRY_RUN) {
    console.log("⚠️ DRY RUN MODE ENABLED. No changes will be written to Postgres.");
  }

  // 1. Setup connection to the OLD MySQL Database
  const legacyDb = await mysql.createConnection({
    host: process.env.LEGACY_DB_HOST || 'localhost',
    user: process.env.LEGACY_DB_USER || 'root',
    password: process.env.LEGACY_DB_PASSWORD || '',
    database: process.env.LEGACY_DB_NAME || 'vivahbrr_vivahvedh744'
  });

  try {
    console.log("✅ Attached to legacy MySQL database.");

    // 2. Fetch all legacy members
    const [memberRows] = await legacyDb.execute('SELECT * FROM members');
    const members = memberRows as any[];
    console.log(`📦 Found ${members.length} legacy profiles.`);

    // 3. Fetch all legacy images
    const [imageRows] = await legacyDb.execute('SELECT * FROM images');
    const legacyImages = imageRows as any[];
    console.log(`🖼️ Found ${legacyImages.length} legacy images.`);
    
    // Group images by UserRegId
    const imagesByRegId = new Map<string, any[]>();
    for (const img of legacyImages) {
      if (!img.UserRegId) continue;
      if (!imagesByRegId.has(img.UserRegId)) {
        imagesByRegId.set(img.UserRegId, []);
      }
      imagesByRegId.get(img.UserRegId)!.push(img);
    }

    let migratedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    
    const chunks = chunkArray(members, CHUNK_SIZE);
    console.log(`📎 Split into ${chunks.length} chunks of ${CHUNK_SIZE} each.`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      const results = await Promise.all(
        chunk.map(member => migrateMember(member, imagesByRegId.get(member.regId) || []))
      );

      const chunkMigrated = results.filter(r => r === 'migrated').length;
      const chunkSkipped = results.filter(r => r === 'skipped').length;
      const chunkFailed = results.filter(r => r === 'failed').length;
      
      migratedCount += chunkMigrated;
      skippedCount += chunkSkipped;
      failedCount += chunkFailed;

      console.log(
        `  Chunk ${i + 1}/${chunks.length}: ${chunkMigrated} migrated, ${chunkSkipped} skipped, ${chunkFailed} failed ` +
        `(Total: ${migratedCount} ✅ / ${skippedCount} ⏭️ / ${failedCount} ❌)`
      );
    }

    console.log('-------------------------------------------');
    console.log(`🏁 MIGRATION COMPLETE. ${IS_DRY_RUN ? '(DRY RUN)' : ''}`);
    console.log(`🟢 Successfully migrated: ${migratedCount}`);
    console.log(`⏭️ Skipped (already exist): ${skippedCount}`);
    console.log(`🔴 Failed to migrate: ${failedCount}`);
    console.log(`📄 Details for failed rows written to: ${ERROR_LOG_PATH}`);

  } catch (error) {
    console.error("Critical Database Error:", error);
  } finally {
    await legacyDb.end();
    await prisma.$disconnect();
    console.log("🔌 All database connections closed.");
  }
}

if (require.main === module) {
  runMigration();
}
