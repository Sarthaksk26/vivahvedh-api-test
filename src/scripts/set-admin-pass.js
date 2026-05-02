const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const adminRegId = 'VV-ADMIN1';
  const password = 'Admin@123';
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const updatedAdmin = await prisma.user.update({
      where: { regId: adminRegId },
      data: { 
        password: hashedPassword,
        accountStatus: 'ACTIVE'
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
