import { Request, Response } from 'express';
import prisma from '../config/db';

export const executeSearch = async (req: Request, res: Response) => {
  try {
    // Extract search filters from query parameters
    const { gender, maritalStatus, casteId, q } = req.query;

    let profileFilters: any = {};

    if (gender) profileFilters.gender = String(gender).toUpperCase();
    if (maritalStatus) profileFilters.maritalStatus = String(maritalStatus).toUpperCase();
    if (casteId) profileFilters.casteId = parseInt(String(casteId));

    // Ensure there's a valid object construction for the profile
    let baseWhere: any = {
      accountStatus: 'ACTIVE'
    };

    if (Object.keys(profileFilters).length > 0) {
      baseWhere.profile = { is: profileFilters };
    } else {
      baseWhere.profile = { isNot: null };
    }

    if (q) {
      const qStr = String(q);
      baseWhere.OR = [
        { regId: { contains: qStr.toUpperCase() } },
        { profile: { is: { firstName: { contains: qStr, mode: 'insensitive' } } } },
        { profile: { is: { lastName: { contains: qStr, mode: 'insensitive' } } } }
      ];
    }

    // Gold users appear first (priority listing)
    const matches = await prisma.user.findMany({
      where: baseWhere,
      include: {
        profile: true,
        images: {
          where: { isPrimary: true },
          take: 1
        },
        education: true,
        physical: true
      },
      orderBy: [
        { planType: 'desc' }, // GOLD > SILVER > FREE
        { createdAt: 'desc' }
      ],
      take: 50
    });

    // Strip out sensitive base user fields before sending
    const safeMatches = matches.map(user => {
      const { password, role, ...safeQuery } = user;
      return safeQuery;
    });

    res.status(200).json({ results: safeMatches });

  } catch (error) {
    console.error("Matchmaking Error:", error);
    res.status(500).json({ error: 'Failed to execute query.' });
  }
};

export const getPublicProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const viewerId = req.user?.id;

    const userProfile = await prisma.user.findUnique({
      where: { 
        id: id as string,
        accountStatus: 'ACTIVE'
      },
      include: {
        profile: true,
        family: true,
        education: true,
        physical: true,
        astrology: true,
        images: true
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

    const { password, role, ...safeQuery } = userProfile;
    res.status(200).json(safeQuery);

  } catch (error) {
    console.error("Public Profile Error:", error);
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
};
