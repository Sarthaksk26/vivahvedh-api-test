const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const user = await prisma.user.update({
      where: { mobile: '9111111111' },
      data: {
        accountStatus: 'ACTIVE',
        planType: 'FREE',
        planExpiresAt: null,
        paymentDone: false
      }
    });
    console.log('User 9111111111 prepared for test:', user.id);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
