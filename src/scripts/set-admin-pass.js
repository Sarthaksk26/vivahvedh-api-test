require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const adminRegId = 'VV-ADMIN1';
  const password = 'REMOVED';
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const updatedAdmin = await prisma.user.upsert({
      where: { regId: adminRegId },
      update: {
        password: hashedPassword,
        accountStatus: 'ACTIVE'
      },
      create: {
        regId: adminRegId,
        mobile: '9999000001',
        email: 'admin@vivahvedh.test',
        password: hashedPassword,
        role: 'ADMIN',
        accountStatus: 'ACTIVE',
        planType: 'GOLD'
      }
    });

    console.log('--- ADMIN LOGIN CREDENTIALS ---');
    console.log(`Registration ID: ${updatedAdmin.regId}`);
    console.log(`Mobile: ${updatedAdmin.mobile}`);
    console.log(`Password: ${password}`);
    console.log('-------------------------------');
  } catch (e) {
    console.error('Error updating admin:', e.message);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
