import prisma from '../config/db';

/**
 * Generate a collision-safe RegID with retry logic.
 * Attempts up to 5 times before throwing.
 */
export async function generateUniqueRegId(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const regId = `VV-${Math.floor(100000 + Math.random() * 900000)}`;
    const existing = await prisma.user.findUnique({ where: { regId } });
    if (!existing) return regId;
  }
  throw new Error('Failed to generate a unique RegID after 5 attempts.');
}
