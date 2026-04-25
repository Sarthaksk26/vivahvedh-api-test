import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
const prisma = new PrismaClient();

async function main() {
  const adminRegId = 'VV-ADMIN1';
  const newPassword = 'password123';
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const updatedAdmin = await prisma.user.update({
    where: { regId: adminRegId },
    data: { 
      password: hashedPassword,
      accountStatus: 'ACTIVE' // Ensure admin is active
    }
  });

  console.log(`Successfully updated admin user: ${updatedAdmin.regId}`);
  console.log(`Email: ${updatedAdmin.email}`);
  console.log(`New password hash: ${hashedPassword}`);
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
