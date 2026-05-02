import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting User Cleanup...');

  // 1. Reset Admin Password
  const adminId = "f13b584b-744d-428c-aece-296feda5b3e4";
  const newPassword = "Admin@2026";
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: adminId },
    data: { 
      password: hashedPassword,
      accountStatus: 'ACTIVE'
    }
  });

  console.log('✅ Admin password reset to: Admin@2026');

  // 2. Delete all non-admin users
  // Cascade delete is handled by Prisma schema (onDelete: Cascade)
  const deleteResult = await prisma.user.deleteMany({
    where: {
      role: { not: 'ADMIN' }
    }
  });

  console.log(`🗑️ Deleted ${deleteResult.count} non-admin users.`);
  console.log('✨ Cleanup complete!');
}

main()
  .catch((e) => {
    console.error('❌ Error during cleanup:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
