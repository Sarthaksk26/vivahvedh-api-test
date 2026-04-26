import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.update({
    where: { mobile: '9999000004' },
    data: {
      accountStatus: 'ACTIVE',
      planType: 'FREE',
      planExpiresAt: null
    }
  });
  console.log('User 9999000004 activated and set to FREE:', user.id);
  process.exit(0);
}

main();
