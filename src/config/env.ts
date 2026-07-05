export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('FATAL ERROR: JWT_SECRET is not defined in environment variables.');
  }
  return secret;
};

/**
 * Daily proposal limit for SILVER-plan users.
 * Override via env var SILVER_DAILY_PROPOSAL_LIMIT; defaults to 4.
 */
export const getSilverDailyProposalLimit = (): number => {
  const raw = process.env.SILVER_DAILY_PROPOSAL_LIMIT;
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 4;
};
