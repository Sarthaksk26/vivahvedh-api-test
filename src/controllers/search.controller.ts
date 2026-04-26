import { Request, Response } from 'express';
import prisma from '../config/db';
import { maskPrivateDetails } from '../utils/sanitize';

export const executeSearch = async (req: Request, res: Response) => {
  try {
    const { gender, maritalStatus, casteId, q, ageMin, ageMax, height, trade, occupation, location, diet, page = '1', limit = '20' } = req.query;

    let profileFilters: any = {};

    if (gender) profileFilters.gender = String(gender).toUpperCase();
    if (maritalStatus) profileFilters.maritalStatus = String(maritalStatus).toUpperCase();
    if (casteId) profileFilters.casteId = parseInt(String(casteId));

    if (ageMin || ageMax) {
      profileFilters.birthDateTime = {};
      const today = new Date();
      if (ageMax) {
         const minDate = new Date(today.getFullYear() - parseInt(String(ageMax)) - 1, today.getMonth(), today.getDate());
         profileFilters.birthDateTime.gte = minDate;
      }
      if (ageMin) {
         const maxDate = new Date(today.getFullYear() - parseInt(String(ageMin)), today.getMonth(), today.getDate());
         profileFilters.birthDateTime.lte = maxDate;
      }
    }

    // Build conditions array for consistent AND logic
    const conditions: any[] = [
      { accountStatus: 'ACTIVE' },
      { role: 'USER' }
    ];

    // Security: Never show the current user in their own search results
    if (req.user?.id) {
      conditions.push({ id: { not: req.user.id } });
    }

    // Profile Filters - Merging them into the AND stack
    if (Object.keys(profileFilters).length > 0) {
      conditions.push({ profile: { is: profileFilters } });
    } else {
      // Ensure we only show users who have at least a basic profile
      conditions.push({ profile: { isNot: null } });
    }


    // Physical Filters
    if (height || diet) {
      const physicalFilter: any = {};
      if (height) physicalFilter.height = { contains: String(height), mode: 'insensitive' };
      if (diet) physicalFilter.diet = { contains: String(diet), mode: 'insensitive' };
      conditions.push({ physical: { is: physicalFilter } });
    }

    // Education Filters
    if (trade || occupation) {
      const educationFilter: any = {};
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

    // Keyword Search (q) - Applied as an OR within the filtered results
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

    const baseWhere = { AND: conditions };

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

    const isAdmin = req.user?.role === 'ADMIN';

    const whereClause: any = {
      id: id as string,
      role: 'USER'
    };
    
    if (!isAdmin) {
      whereClause.accountStatus = 'ACTIVE';
    }

    const userProfile = await prisma.user.findUnique({
      where: whereClause,
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
