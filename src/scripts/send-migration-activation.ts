import 'dotenv/config';
import crypto from 'crypto';
import prisma from '../config/db';
import { sendMigrationNotificationEmail } from '../services/mail.service';

/**
 * Sends migration notifications to migrated ACTIVE members.
 *
 * Safe by default: without --send, this reports the eligible count and sends
 * no email or database updates. Run the real send only after reviewing the
 * dry-run output and SMTP delivery configuration.
 */
const SEND = process.argv.includes('--send');
const clientUrl = process.env.CLIENT_URL?.replace(/\/$/, '');

if (!clientUrl) {
  throw new Error('CLIENT_URL must be configured before running the activation campaign.');
}

function isDeliverableFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function main() {
  const users = await prisma.user.findMany({
    where: {
      role: 'USER',
      accountStatus: 'ACTIVE',
      requiresPasswordChange: true,
      email: { not: null },
    },
    select: {
      id: true,
      regId: true,
      email: true,
      profile: { select: { firstName: true } },
    },
  });

  const eligible = users.filter((user) => user.email && isDeliverableFormat(user.email));
  const supportQueue = users.filter((user) => !user.email || !isDeliverableFormat(user.email));

  console.log(`Eligible activation emails: ${eligible.length}`);
  console.log(`Support activation queue (missing/malformed email): ${supportQueue.length}`);

  if (!SEND) {
    console.log('DRY RUN: no emails sent. Re-run with --send after approval.');
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const user of eligible) {
    try {
      await sendMigrationNotificationEmail(
        user.email!,
        user.profile?.firstName || 'Member'
      );
      sent++;
      console.log(`Sent migration notification for ${user.regId}`);
    } catch (error) {
      failed++;
      console.error(`Failed activation delivery for ${user.regId}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`Activation campaign completed: ${sent} sent, ${failed} failed.`);
}

main()
  .catch((error) => {
    console.error('Activation campaign failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
