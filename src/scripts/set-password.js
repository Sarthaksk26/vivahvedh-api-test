const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  try {
    const password = process.env.SET_PASSWORD_VALUE;
    if (!password) {
      throw new Error('SET_PASSWORD_VALUE is required.');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.update({
      where: { mobile: '9111111111' },
      data: {
        password: hashedPassword
      }
    });
    console.log('Password set for 9111111111');
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
