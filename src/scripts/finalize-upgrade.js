const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const user = await prisma.user.update({
      where: { mobile: '9111111111' },
      data: {
        planType: 'GOLD',
        paymentDone: true,
        planExpiresAt: expiresAt,
        lastPaidOn: new Date(),
        accountStatus: 'ACTIVE'
      }
    });
    console.log('User 9111111111 upgraded to GOLD successfully.');
    console.log('Expiry:', user.planExpiresAt);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
