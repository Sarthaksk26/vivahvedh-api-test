/**
 * Orphaned File Cleanup Cron Job
 * 
 * Scans the uploads directory (images + documents) and cross-references
 * against database records. Files on disk that have no corresponding
 * database entry are removed.
 * 
 * Usage:
 *   npx ts-node src/scripts/cron.ts
 * 
 * Schedule with crontab (Linux) or Task Scheduler (Windows):
 *   0 3 * * 0   cd /path/to/api && npx ts-node src/scripts/cron.ts >> cron.log 2>&1
 */

import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import fs from 'fs';
import prisma from '../config/db';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const DOCS_DIR = path.join(UPLOAD_DIR, 'docs');

interface CleanupStats {
  totalFilesScanned: number;
  orphanedFilesDeleted: number;
  bytesReclaimed: number;
  errors: string[];
}

async function getAllReferencedUrls(): Promise<Set<string>> {
  const urls = new Set<string>();

  // Image URLs from the Image table
  const images = await prisma.image.findMany({ select: { url: true } });
  for (const img of images) {
    if (img.url) {
      // Extract filename from URL (handles both /uploads/filename and full URLs)
      const filename = path.basename(img.url);
      urls.add(filename);
    }
  }

  // KYC document URLs from User table
  const users = await prisma.user.findMany({
    where: { kycDocumentUrl: { not: null } },
    select: { kycDocumentUrl: true }
  });
  for (const u of users) {
    if (u.kycDocumentUrl) urls.add(path.basename(u.kycDocumentUrl));
  }

  // Income Proof URLs from UserEducation table
  const educations = await prisma.userEducation.findMany({
    where: { incomeProofUrl: { not: null } },
    select: { incomeProofUrl: true }
  });
  for (const e of educations) {
    if (e.incomeProofUrl) urls.add(path.basename(e.incomeProofUrl));
  }

  // Medical Report URLs from UserPhysical table
  const physicals = await prisma.userPhysical.findMany({
    where: { medicalReportUrl: { not: null } },
    select: { medicalReportUrl: true }
  });
  for (const p of physicals) {
    if (p.medicalReportUrl) urls.add(path.basename(p.medicalReportUrl));
  }

  // Payment screenshot URLs
  const payments = await prisma.pendingPayment.findMany({
    select: { screenshotUrl: true }
  });
  for (const pay of payments) {
    if (pay.screenshotUrl) urls.add(path.basename(pay.screenshotUrl));
  }

  // Success story photo URLs
  const stories = await prisma.successStory.findMany({
    where: { photoUrl: { not: null } },
    select: { photoUrl: true }
  });
  for (const s of stories) {
    if (s.photoUrl) urls.add(path.basename(s.photoUrl));
  }

  return urls;
}

function scanDirectory(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isFile()) {
      files.push(path.join(dir, entry.name));
    }
    // Note: We do NOT recurse into subdirectories other than 'docs'
    // to avoid accidentally deleting system files.
  }
  
  return files;
}

async function cleanupOrphanedFiles(): Promise<CleanupStats> {
  const stats: CleanupStats = {
    totalFilesScanned: 0,
    orphanedFilesDeleted: 0,
    bytesReclaimed: 0,
    errors: [],
  };

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Vivahvedh — Orphaned File Cleanup');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════');

  // 1. Gather all referenced filenames from DB
  console.log('\n[1/3] Querying database for referenced files...');
  const referencedFiles = await getAllReferencedUrls();
  console.log(`      Found ${referencedFiles.size} referenced files in database.`);

  // 2. Scan local upload directories
  console.log('[2/3] Scanning local upload directories...');
  const imageFiles = scanDirectory(UPLOAD_DIR);
  const docFiles = scanDirectory(DOCS_DIR);
  const allLocalFiles = [...imageFiles, ...docFiles];
  stats.totalFilesScanned = allLocalFiles.length;
  console.log(`      Found ${allLocalFiles.length} files on disk.`);

  // 3. Compare and delete orphans
  console.log('[3/3] Identifying and removing orphaned files...\n');

  for (const filePath of allLocalFiles) {
    const filename = path.basename(filePath);
    
    // Skip dotfiles, system files, and .gitkeep
    if (filename.startsWith('.') || filename === '.gitkeep') continue;

    if (!referencedFiles.has(filename)) {
      try {
        const fileStat = fs.statSync(filePath);
        const sizeKB = (fileStat.size / 1024).toFixed(1);
        
        fs.unlinkSync(filePath);
        
        stats.orphanedFilesDeleted++;
        stats.bytesReclaimed += fileStat.size;
        console.log(`  🗑️  Deleted: ${filename} (${sizeKB} KB)`);
      } catch (err: any) {
        const errorMsg = `Failed to delete ${filename}: ${err.message}`;
        stats.errors.push(errorMsg);
        console.error(`  ❌  ${errorMsg}`);
      }
    }
  }

  return stats;
}

// ── Expired Tokens Cleanup ────────────────────────────────────────
async function cleanupExpiredTokens(): Promise<{ refresh: number, grace: number, reset: number }> {
  console.log('\n[Bonus] Cleaning up expired tokens...');
  
  const refreshResult = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });
  
  const graceResult = await prisma.refreshTokenGrace.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });

  const resetResult = await prisma.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });
  
  console.log(`      Deleted ${refreshResult.count} expired refresh tokens.`);
  console.log(`      Deleted ${graceResult.count} expired grace tokens.`);
  console.log(`      Deleted ${resetResult.count} expired password reset tokens.`);
  
  return {
    refresh: refreshResult.count,
    grace: graceResult.count,
    reset: resetResult.count
  };
}

// ── Main Execution ────────────────────────────────────────────────
async function main() {
  try {
    const stats = await cleanupOrphanedFiles();
    const expiredTokens = await cleanupExpiredTokens();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Cleanup Summary');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Files scanned:      ${stats.totalFilesScanned}`);
    console.log(`  Orphans deleted:    ${stats.orphanedFilesDeleted}`);
    console.log(`  Space reclaimed:    ${(stats.bytesReclaimed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Expired refresh:    ${expiredTokens.refresh}`);
    console.log(`  Expired grace:      ${expiredTokens.grace}`);
    console.log(`  Expired reset:      ${expiredTokens.reset}`);
    
    if (stats.errors.length > 0) {
      console.log(`  Errors:             ${stats.errors.length}`);
      stats.errors.forEach(e => console.log(`    - ${e}`));
    }
    
    console.log(`\n  Completed: ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('Cron job failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
