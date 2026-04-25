import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();
  const storyCount = await prisma.successStory.count();
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

  console.log('--- DATABASE STATUS ---');
  console.log(`Total Users: ${userCount}`);
  console.log(`Total Stories: ${storyCount}`);
  console.log(`Admin User: ${adminUser ? adminUser.regId : 'NONE'}`);
  if (adminUser) {
    console.log(`Admin Email: ${adminUser.email}`);
  }
}

main().catch(e => console.error(e));
