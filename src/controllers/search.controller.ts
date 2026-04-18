import { Request, Response } from 'express';
import prisma from '../config/db';
import { maskPrivateDetails } from '../utils/sanitize';

export const executeSearch = async (req: Request, res: Response) => {
  try {
    // Extract search filters from query parameters
    const { gender, maritalStatus, casteId, q, page = '1', limit = '20' } = req.query;

    let profileFilters: any = {};

    if (gender) profileFilters.gender = String(gender).toUpperCase();
    if (maritalStatus) profileFilters.maritalStatus = String(maritalStatus).toUpperCase();
    if (casteId) profileFilters.casteId = parseInt(String(casteId));

    // Ensure there's a valid object construction for the profile
    let baseWhere: any = {
      accountStatus: 'ACTIVE',
      role: 'USER'
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

    const pageNumber = parseInt(String(page)) || 1;
    const pageSize = parseInt(String(limit)) || 20;
    const skip = (pageNumber - 1) * pageSize;

    // Get total count for pagination
    const totalResults = await prisma.user.count({ where: baseWhere });
    const totalPages = Math.ceil(totalResults / pageSize);

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
      skip,
      take: pageSize
    });

    // Strip out sensitive base user fields before sending
    const safeMatches = matches.map(user => {
      const sameUser = user.id === req.user?.id;
      const safeQuery = maskPrivateDetails(user, sameUser);
      
      // Guest users only see surname
      if (!req.user && safeQuery.profile) {
        safeQuery.profile.firstName = '***';
      }

      return safeQuery;
    });

    res.status(200).json({ 
      results: safeMatches,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalResults,
        pageSize
      }
    });

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
        accountStatus: 'ACTIVE',
        role: 'USER'
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

    // Contact Info Check
    let showContactInfo = false;
    
    if (viewerId && viewerId !== id) {
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
