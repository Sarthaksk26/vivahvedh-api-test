import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const total = await prisma.user.count();
  const active = await prisma.user.count({ where: { accountStatus: 'ACTIVE' } });
  const users = await prisma.user.count({ where: { role: 'USER' } });
  const admins = await prisma.user.count({ where: { role: 'ADMIN' } });
  const activeUsers = await prisma.user.count({ where: { accountStatus: 'ACTIVE', role: 'USER' } });
  const activeUsersWithProfile = await prisma.user.count({ where: { accountStatus: 'ACTIVE', role: 'USER', profile: { isNot: null } } });
  
  console.log('--- DATABASE STATUS ---');
  console.log(`Total Users: ${total}`);
  console.log(`Active Users: ${active}`);
  console.log(`Role USER: ${users}`);
  console.log(`Role ADMIN: ${admins}`);
  console.log(`Active Role USER (Total): ${activeUsers}`);
  console.log(`Active Role USER (With Profile): ${activeUsersWithProfile}`);
  
  const sample = await prisma.user.findMany({ 
    take: 10, 
    select: { regId: true, role: true, accountStatus: true, profile: { select: { id: true } } } 
  });
  console.log('--- SAMPLE ---');
  console.log(JSON.stringify(sample, null, 2));
}

main().catch(console.error);
