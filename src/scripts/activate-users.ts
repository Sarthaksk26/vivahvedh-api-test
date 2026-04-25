import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.user.updateMany({
    where: { accountStatus: 'INACTIVE' },
    data: { accountStatus: 'ACTIVE' }
  });
  console.log(`Activated ${count.count} inactive users.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
  });
