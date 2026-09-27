import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { encryptPII } from '../utils/encryption';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'wedding@vivahvedh.com';
  const mobile = '9999000099';
  const encEmail = encryptPII(email, { deterministic: true });
  const encMobile = encryptPII(mobile, { deterministic: true });
  const password = await bcrypt.hash('VVedh@744', 10);

  await prisma.user.upsert({
    where: { regId: 'VV-ADMIN-LEGACY' },
    update: {
      email: encEmail,
      mobile: encMobile,
      password,
      role: 'ADMIN',
      accountStatus: 'ACTIVE',
    },
    create: {
      regId: 'VV-ADMIN-LEGACY',
      email: encEmail,
      mobile: encMobile,
      password,
      role: 'ADMIN',
      accountStatus: 'ACTIVE',
      planType: 'GOLD',
      profile: {
        create: {
          firstName: 'Vivahvedh',
          lastName: 'Admin',
          gender: 'MALE',
          maritalStatus: 'UNMARRIED',
          aboutMe: 'Legacy Vivahvedh platform administrator.'
        }
      }
    }
  });

  console.log('✅ Legacy admin PII encrypted successfully!');
}

main().then(() => prisma.$disconnect());
