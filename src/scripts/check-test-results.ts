import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const payments = await prisma.pendingPayment.findMany({
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('Recent Payments:', JSON.stringify(payments, null, 2));
  
  const user = await prisma.user.findUnique({
    where: { mobile: '9999000004' }
  });
  console.log('User 9999000004:', JSON.stringify(user, null, 2));
  process.exit(0);
}

main();
