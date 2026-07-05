import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';

// Check for Cloudinary config
const REQUIRED_CLOUDINARY_VARS = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;

for (const key of REQUIRED_CLOUDINARY_VARS) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing ${key} in environment variables.`);
    process.exit(1);
  }
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

async function migrateDocs() {
  console.log(`🚀 Starting Document Migration to 'authenticated' type...`);
  if (DRY_RUN) console.log(`⚠️ RUNNING IN DRY-RUN MODE (No changes will be made)`);

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  const processUrl = async (url: string | null, label: string) => {
    if (!url || !url.includes('cloudinary.com')) return;

    // Example URL: https://res.cloudinary.com/demo/image/upload/v1234/folder/file.ext
    // If it already contains '/authenticated/', skip it
    if (url.includes('/authenticated/')) {
      skipCount++;
      return;
    }

    try {
      const isRaw = url.includes('/raw/');
      const resourceType = isRaw ? 'raw' : 'image';
      
      const versionMatch = url.match(/\/v\d+\/(.+)$/);
      if (!versionMatch) {
        throw new Error('Invalid URL format');
      }
      
      let publicIdWithExt = versionMatch[1];
      let publicId = publicIdWithExt;
      
      if (!isRaw) {
        publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.')) || publicIdWithExt;
      }

      console.log(`Processing [${label}]: ${publicId} (type: ${resourceType})`);

      if (!DRY_RUN) {
        // We use Cloudinary's rename API to change the delivery type to authenticated.
        // It requires the new public_id, which can be the same, and we change the type.
        // The rename API can move it from upload -> authenticated.
        await cloudinary.uploader.rename(publicId, publicId, {
          resource_type: resourceType,
          type: 'upload', // from
          to_type: 'authenticated', // to
          overwrite: true
        });
      }
      successCount++;
    } catch (err: any) {
      console.error(`❌ Failed to migrate ${label} URL: ${url}`, err.message);
      failCount++;
    }
  };

  try {
    // 1. Users (KYC Documents)
    const users = await prisma.user.findMany({
      where: { kycDocumentUrl: { not: null } },
      select: { id: true, kycDocumentUrl: true }
    });
    for (const user of users) {
      await processUrl(user.kycDocumentUrl, `User ${user.id} KYC`);
    }

    // 2. UserEducation (Income Proofs)
    const educations = await prisma.userEducation.findMany({
      where: { incomeProofUrl: { not: null } },
      select: { userId: true, incomeProofUrl: true }
    });
    for (const edu of educations) {
      await processUrl(edu.incomeProofUrl, `User ${edu.userId} Income`);
    }

    // 3. UserPhysical (Medical Reports)
    const physicals = await prisma.userPhysical.findMany({
      where: { medicalReportUrl: { not: null } },
      select: { userId: true, medicalReportUrl: true }
    });
    for (const phys of physicals) {
      await processUrl(phys.medicalReportUrl, `User ${phys.userId} Medical`);
    }

    console.log(`\n🏁 Migration Complete!`);
    console.log(`✅ Successfully migrated: ${successCount}`);
    console.log(`⚠️ Skipped (already authenticated): ${skipCount}`);
    console.log(`❌ Failed: ${failCount}`);

  } catch (error) {
    console.error("Critical error during migration:", error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  migrateDocs();
}
