const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const user = await prisma.user.findUnique({
      where: { mobile: '9111111111' },
      include: { pendingPayments: true }
    });
    console.log('User 9111111111 status:', JSON.stringify({
      id: user.id,
      mobile: user.mobile,
      planType: user.planType,
      accountStatus: user.accountStatus,
      paymentDone: user.paymentDone,
      pendingPayments: user.pendingPayments
    }, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
