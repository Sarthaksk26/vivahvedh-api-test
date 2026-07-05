import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { maskPrivateDetails } from '../utils/sanitize';

// ═══════════════════════════════════════════════════════════════════
//  Weighted Match Scoring Engine
// ═══════════════════════════════════════════════════════════════════

interface ScoringContext {
  querierGender?: string;
  querierCasteId?: number | null;
  querierDiet?: string | null;
  querierCity?: string | null;
  querierDistrict?: string | null;
  querierState?: string | null;
  querierTrade?: string | null;
  querierRashi?: string | null;
  querierNadi?: string | null;
  querierExpectations?: string | null;
}

const PLAN_WEIGHT: Record<string, number> = {
  GOLD: 30,
  SILVER: 15,
  FREE: 0,
};

/**
 * Computes a weighted match score (0–100) for a candidate relative to the querier.
 * 
 * Scoring Breakdown:
 *   - Plan Tier Boost:       0–30 pts
 *   - Caste Match:           0–20 pts
 *   - Location Proximity:    0–15 pts  (same city > same district > same state)
 *   - Diet Compatibility:    0–10 pts
 *   - Education Field Match: 0–10 pts
 *   - Astrology (Nadi):      0–10 pts  (nadi mismatch is preferred in matchmaking)
 *   - Profile Completeness:  0–5 pts
 */
function computeMatchScore(
  candidate: Record<string, any>,
  ctx: ScoringContext
): number {
  let score = 0;

  // 1. Plan Tier Boost (0-30)
  score += PLAN_WEIGHT[candidate.planType] ?? 0;

  // 2. Caste Match (0-20)
  if (ctx.querierCasteId && candidate.profile?.casteId) {
    if (candidate.profile.casteId === ctx.querierCasteId) {
      score += 20;
    }
  }

  // 3. Location Proximity (0-15)
  const candidateAddr = candidate.addresses?.[0];
  if (candidateAddr) {
    if (ctx.querierCity && candidateAddr.city?.toLowerCase() === ctx.querierCity.toLowerCase()) {
      score += 15;
    } else if (ctx.querierDistrict && candidateAddr.district?.toLowerCase() === ctx.querierDistrict.toLowerCase()) {
      score += 10;
    } else if (ctx.querierState && candidateAddr.state?.toLowerCase() === ctx.querierState.toLowerCase()) {
      score += 5;
    }
  }

  // 4. Diet Compatibility (0-10)
  if (ctx.querierDiet && candidate.physical?.diet) {
    if (candidate.physical.diet.toLowerCase() === ctx.querierDiet.toLowerCase()) {
      score += 10;
    }
  }

  // 5. Education/Trade similarity (0-10)
  if (ctx.querierTrade && candidate.education?.trade) {
    const qTokens = ctx.querierTrade.toLowerCase().split(/[\s,./]+/);
    const cTokens = candidate.education.trade.toLowerCase().split(/[\s,./]+/);
    const overlap = qTokens.filter((t: string) => cTokens.includes(t)).length;
    if (overlap > 0) {
      score += Math.min(10, overlap * 5);
    }
  }

  // 6. Nadi Compatibility (0-10) — different nadi is traditionally preferred
  if (ctx.querierNadi && candidate.astrology?.nadi) {
    if (candidate.astrology.nadi !== ctx.querierNadi) {
      score += 10;
    }
  }

  // 7. Profile Completeness (0-5)
  let completeness = 0;
  if (candidate.profile?.aboutMe) completeness++;
  if (candidate.physical?.height) completeness++;
  if (candidate.education?.trade) completeness++;
  if (candidate.family?.fatherName) completeness++;
  if (candidate.images?.length > 0) completeness++;
  score += completeness;

  return Math.min(100, score);
}

// ═══════════════════════════════════════════════════════════════════
//  GET /api/search — Scored Matchmaking Search
// ═══════════════════════════════════════════════════════════════════

export const executeSearch = async (req: Request, res: Response) => {
  try {
    const {
      gender, maritalStatus, casteId, q,
      ageMin, ageMax, height, trade, occupation,
      location, diet, cursor, limit = '20'
    } = req.query;

    const profileFilters: Prisma.UserProfileWhereInput = {};

    if (gender) profileFilters.gender = String(gender).toUpperCase() as Prisma.EnumGenderFilter['equals'];
    if (maritalStatus) profileFilters.maritalStatus = String(maritalStatus).toUpperCase() as Prisma.EnumMaritalStatusFilter['equals'];
    if (casteId) profileFilters.casteId = parseInt(String(casteId));

    if (ageMin || ageMax) {
      profileFilters.birthDateTime = {};
      const today = new Date();
      if (ageMax) {
         const minDate = new Date(today.getFullYear() - parseInt(String(ageMax)) - 1, today.getMonth(), today.getDate());
         (profileFilters.birthDateTime as Prisma.DateTimeNullableFilter).gte = minDate;
      }
      if (ageMin) {
         const maxDate = new Date(today.getFullYear() - parseInt(String(ageMin)), today.getMonth(), today.getDate());
         (profileFilters.birthDateTime as Prisma.DateTimeNullableFilter).lte = maxDate;
      }
    }

    // Build conditions array for consistent AND logic
    const conditions: Prisma.UserWhereInput[] = [
      { accountStatus: 'ACTIVE' },
      { role: 'USER' }
    ];

    // Security: Never show the current user in their own search results
    if (req.user?.id) {
      conditions.push({ id: { not: req.user.id } });
    }

    // Profile Filters
    if (Object.keys(profileFilters).length > 0) {
      conditions.push({ profile: { is: profileFilters } });
    } else {
      conditions.push({ profile: { isNot: null } });
    }

    // Physical Filters
    if (height || diet) {
      const physicalFilter: Prisma.UserPhysicalWhereInput = {};
      if (height) physicalFilter.height = { contains: String(height), mode: 'insensitive' };
      if (diet) physicalFilter.diet = { contains: String(diet), mode: 'insensitive' };
      conditions.push({ physical: { is: physicalFilter } });
    }

    // Education Filters
    if (trade || occupation) {
      const educationFilter: Prisma.UserEducationWhereInput = {};
      if (trade) educationFilter.trade = { contains: String(trade), mode: 'insensitive' };
      if (occupation) educationFilter.jobBusiness = { contains: String(occupation), mode: 'insensitive' };
      conditions.push({ education: { is: educationFilter } });
    }

    // Location Filters
    if (location) {
       const locStr = String(location);
       conditions.push({
         addresses: {
           some: {
             OR: [
               { city: { contains: locStr, mode: 'insensitive' } },
               { district: { contains: locStr, mode: 'insensitive' } },
               { state: { contains: locStr, mode: 'insensitive' } }
             ]
           }
         }
       });
    }

    // Keyword Search (q)
    if (q) {
      const qStr = String(q);
      conditions.push({
        OR: [
          { regId: { contains: qStr.toUpperCase() } },
          { profile: { is: { firstName: { contains: qStr, mode: 'insensitive' } } } },
          { profile: { is: { lastName: { contains: qStr, mode: 'insensitive' } } } }
        ]
      });
    }

    const baseWhere: Prisma.UserWhereInput = { AND: conditions };
    const pageSize = Math.min(parseInt(String(limit)) || 20, 50); // Cap at 50

    // ── Pagination strategy ──────────────────────────────────────────
    // Authenticated searches use personalized matchScore which diverges from
    // DB order (planType/createdAt/id). Cursor pagination would produce
    // duplicates/skips because the display order != cursor order.
    // For small-to-medium datasets, offset pagination is performant and correct.
    // Guest searches (no matchScore) keep efficient cursor pagination.
    const isAuthenticated = !!req.user?.id;
    const page = isAuthenticated ? Math.max(0, parseInt(String(req.query.page || '0'))) : 0;
    const skip = isAuthenticated ? page * pageSize : 0;

    // ── Fetch candidates with enriched data for scoring ──────────
    const matches = await prisma.user.findMany({
      where: baseWhere,
      include: {
        profile: true,
        images: {
          where: { isPrimary: true },
          take: 1
        },
        education: true,
        physical: true,
        family: { select: { fatherName: true } },
        astrology: { select: { nadi: true, rashi: true } },
        addresses: { take: 1 },
      },
      orderBy: [
        { planType: 'desc' },
        { createdAt: 'desc' },
        { id: 'asc' }
      ],
      take: isAuthenticated ? pageSize + 1 : pageSize + 1,
      cursor: isAuthenticated ? undefined : (cursor ? { id: String(cursor) } : undefined),
      skip: isAuthenticated ? skip : (cursor ? 1 : 0),
    });

    // ── Build scoring context from the querier's own profile ─────
    let scoringCtx: ScoringContext = {};

    if (req.user?.id) {
      const querierData = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          profile: { select: { gender: true, casteId: true } },
          physical: { select: { diet: true } },
          education: { select: { trade: true } },
          astrology: { select: { nadi: true, rashi: true } },
          addresses: { take: 1, select: { city: true, district: true, state: true } },
          preferences: { select: { expectations: true } },
        }
      });

      if (querierData) {
        scoringCtx = {
          querierGender: querierData.profile?.gender ?? undefined,
          querierCasteId: querierData.profile?.casteId,
          querierDiet: querierData.physical?.diet,
          querierCity: querierData.addresses?.[0]?.city,
          querierDistrict: querierData.addresses?.[0]?.district,
          querierState: querierData.addresses?.[0]?.state,
          querierTrade: querierData.education?.trade,
          querierNadi: querierData.astrology?.nadi,
          querierExpectations: querierData.preferences?.expectations,
        };
      }
    }

    // ── Determine pagination ─────────────────────────────────────
    let pageResults: typeof matches;
    let nextCursor: string | null = null;
    let hasMore = false;

    if (isAuthenticated) {
      // Offset pagination: score & sort ALL fetched rows, then slice the requested page
      const scoredAll = matches.map(user => {
        const matchScore = computeMatchScore(user as any, scoringCtx);
        return { user, matchScore };
      });
      scoredAll.sort((a, b) => b.matchScore - a.matchScore);

      hasMore = scoredAll.length > pageSize;
      const pageScored = hasMore ? scoredAll.slice(0, pageSize) : scoredAll;
      pageResults = pageScored.map(({ user }) => user);
      // Cursor not meaningful for offset pagination; clients use page number
    } else {
      // Guest: cursor pagination (no personalized scoring, just planWeight)
      hasMore = matches.length > pageSize;
      pageResults = hasMore ? matches.slice(0, pageSize) : matches;
      const lastMatch = pageResults[pageResults.length - 1];
      nextCursor = hasMore ? lastMatch?.id ?? null : null;
    }

    // ── Score and sort page results (guest path needs this too) ───────────────────────────────────────────
    const scoredResults = pageResults.map(user => {
      const matchScore = req.user?.id
        ? computeMatchScore(user as any, scoringCtx)
        : PLAN_WEIGHT[user.planType] ?? 0;

      return { user, matchScore };
    });

    // Sort by matchScore descending (stable sort preserves plan+date ordering for ties)
    scoredResults.sort((a, b) => b.matchScore - a.matchScore);

    // ── Sanitize output ──────────────────────────────────────────
    const safeMatches = scoredResults.map(({ user, matchScore }) => {
      const sameUser = user.id === req.user?.id;
      const safeQuery = maskPrivateDetails(user as any, sameUser) as Record<string, any>;

      // Guest users only see surname
      if (!req.user && safeQuery.profile) {
        safeQuery.profile.firstName = '***';
      }

      // Attach match score for authenticated users
      if (req.user?.id) {
        safeQuery.matchScore = matchScore;
      }

      // Strip scoring-only fields from response
      delete safeQuery.family;
      delete safeQuery.astrology;
      delete safeQuery.addresses;

      return safeQuery;
    });

    // Build pagination response
    const pagination: Record<string, any> = { hasMore, pageSize };
    if (isAuthenticated) {
      pagination.page = page;
      pagination.nextCursor = null; // offset pagination uses page number
    } else {
      pagination.nextCursor = nextCursor;
    }

    res.status(200).json({
      results: safeMatches,
      pagination,
    });

  } catch (error) {
    console.error("Matchmaking Error:", error);
    res.status(500).json({ error: 'Failed to execute query.' });
  }
};

// ═══════════════════════════════════════════════════════════════════
//  GET /api/search/public/:id — Public Profile View
// ═══════════════════════════════════════════════════════════════════

export const getPublicProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const viewerId = req.user?.id;

    const isAdmin = req.user?.role === 'ADMIN';

    const whereClause: Prisma.UserWhereInput = {
      id: id as string,
      role: 'USER'
    };

    if (!isAdmin) {
      whereClause.accountStatus = 'ACTIVE';
    }

    const userProfile = await prisma.user.findFirst({
      where: whereClause,
      include: {
        profile: true,
        family: true,
        education: true,
        physical: true,
        astrology: true,
        images: {
          orderBy: { isPrimary: 'desc' }
        }
      }
    });

    if (!userProfile) {
      res.status(404).json({ error: 'Target profile not found or is currently private.' });
      return;
    }

    // Record profile view (fire and forget)
    if (viewerId && viewerId !== id) {
      prisma.profileView.upsert({
        where: { viewerId_viewedId: { viewerId, viewedId: id as string } },
        update: { viewedAt: new Date() },
        create: { viewerId, viewedId: id as string }
      }).catch(() => {});
    }

    // Contact Info Check
    let showContactInfo = false;
    
    if (isAdmin) {
      showContactInfo = true;
    } else if (viewerId && viewerId !== id) {
      // Check if there is an ACCEPTED request between them
      const connection = await prisma.request.findFirst({
        where: {
          OR: [
            { senderId: viewerId as string, receiverId: id as string, status: 'ACCEPTED' },
            { senderId: id as string, receiverId: viewerId as string, status: 'ACCEPTED' }
          ]
        }
      });
      if (connection) {
        showContactInfo = true;
      }
    } else if (viewerId === id) {
      showContactInfo = true;
    }

    // ── Photo Gallery Gating ────────────────────────────────────────
    // Full gallery is only visible to: admin, profile owner, ACCEPTED
    // connections, or SILVER/GOLD plan viewers. Everyone else sees only
    // the primary photo. This enforces the paywall server-side — the
    // frontend rendering restriction alone is bypassable via direct API call.
    let showFullGallery = false;

    if (isAdmin) {
      showFullGallery = true;
    } else if (viewerId === id) {
      showFullGallery = true; // own profile
    } else if (showContactInfo) {
      // showContactInfo is true for ACCEPTED connections — reuse that result
      showFullGallery = true;
    } else if (viewerId) {
      // Check viewer's plan type
      const viewer = await prisma.user.findUnique({
        where: { id: viewerId },
        select: { planType: true }
      });
      if (viewer?.planType === 'SILVER' || viewer?.planType === 'GOLD') {
        showFullGallery = true;
      }
    }

    // Truncate images array if viewer is not eligible for full gallery
    if (!showFullGallery && userProfile.images) {
      const primaryImage = userProfile.images.find(img => img.isPrimary) || userProfile.images[0];
      userProfile.images = primaryImage ? [primaryImage] : [];
    }

    const safeQuery = maskPrivateDetails(userProfile, showContactInfo);

    if (!req.user && safeQuery.profile) {
        safeQuery.profile.firstName = '***';
    }

    res.status(200).json(safeQuery);

  } catch (error) {
    console.error("Public Profile Error:", error);
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
};
