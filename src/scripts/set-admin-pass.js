require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const adminRegId = 'VV-ADMIN1';
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 6) {
    console.error('Error: set the ADMIN_PASSWORD env var (>= 6 chars) instead of hardcoding. Usage: ADMIN_PASSWORD=xxxx node src/scripts/set-admin-pass.js');
    process.exit(1);
  }
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
