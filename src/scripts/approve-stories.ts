import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const stories = await prisma.successStory.findMany();
  console.log('--- STORIES STATUS ---');
  stories.forEach(s => {
    console.log(`Story: ${s.groomName} & ${s.brideName} | Status: ${s.status}`);
  });

  const count = await prisma.successStory.updateMany({
    where: { status: 'PENDING' },
    data: { status: 'APPROVED' }
  });
  console.log(`Approved ${count.count} pending stories.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
  });
