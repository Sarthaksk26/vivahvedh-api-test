import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../config/db';
import { z } from 'zod';
import { sendApprovalEmail, sendOfflineCredentialsEmail, sendEnquiryReplyEmail } from '../services/mail.service';

/**
 * Generate a collision-safe RegID with retry logic.
 */
async function generateUniqueRegId(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const regId = `VV-${Math.floor(100000 + Math.random() * 900000)}`;
    const existing = await prisma.user.findUnique({ where: { regId } });
    if (!existing) return regId;
  }
  throw new Error('Failed to generate a unique RegID after 5 attempts.');
}

export const getPendingApprovals = async (req: Request, res: Response) => {
  try {
    const pendingUsers = await prisma.user.findMany({
      where: { accountStatus: 'INACTIVE' },
      include: { profile: true, images: true },
      orderBy: { createdAt: 'asc' }
    });
    res.status(200).json(pendingUsers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { q, gender, ageMin, ageMax, accountStatus } = req.query;

    let baseWhere: any = {
      role: 'USER',
    };

    if (accountStatus) {
      baseWhere.accountStatus = String(accountStatus).toUpperCase();
    } else {
      baseWhere.accountStatus = { in: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] };
    }

    let profileFilters: any = {};
    if (gender) profileFilters.gender = String(gender).toUpperCase();

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

    if (Object.keys(profileFilters).length > 0) {
      baseWhere.profile = { is: profileFilters };
    }

    if (q) {
      const qStr = String(q);
      baseWhere.OR = [
        { regId: { contains: qStr, mode: 'insensitive' } },
        { profile: { is: { firstName: { contains: qStr, mode: 'insensitive' } } } },
        { profile: { is: { lastName: { contains: qStr, mode: 'insensitive' } } } },
      ];
    }

    const allUsers = await prisma.user.findMany({
      where: baseWhere,
      include: { profile: true },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(allUsers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch all network users' });
  }
};

export const approveUser = async (req: Request, res: Response) => {
  try {
    const { targetUserId } = req.body;

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { accountStatus: 'ACTIVE' },
      include: { profile: true }
    });

    if (updatedUser.email && updatedUser.profile) {
      sendApprovalEmail(updatedUser.email, updatedUser.profile.firstName, updatedUser.regId);
    }

    res.status(200).json({ message: 'User approved successfully', user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve user' });
  }
};

export const banUser = async (req: Request, res: Response) => {
  try {
    const { targetUserId, action } = req.body;

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    // Prevent admin from banning themselves
    if (req.user?.id === targetUserId) {
      res.status(400).json({ error: 'You cannot suspend your own account.' });
      return;
    }

    // Support toggle: ban or unban
    const newStatus = action === 'unban' ? 'ACTIVE' : 'SUSPENDED';
    await prisma.user.update({
      where: { id: targetUserId },
      data: { accountStatus: newStatus }
    });

    res.status(200).json({ message: newStatus === 'ACTIVE' ? 'User reactivated.' : 'User suspended.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user status' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (req.user?.id === id) {
      res.status(400).json({ error: 'You cannot delete your own account.' });
      return;
    }

    const targetUser = await prisma.user.findUnique({ where: { id: String(id) } });
    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    await prisma.user.delete({
      where: { id: String(id) }
    });
    res.status(200).json({ message: 'User permanently deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

export const getEnquiries = async (req: Request, res: Response) => {
  try {
    const enquiries = await prisma.enquiry.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(enquiries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch enquiries' });
  }
};

export const replyToEnquiry = async (req: Request, res: Response) => {
  try {
    const { enquiryId, replyMessage } = req.body;
    if (!enquiryId || !replyMessage) {
      res.status(400).json({ error: 'enquiryId and replyMessage are required' });
      return;
    }

    const enquiry = await prisma.enquiry.findUnique({ where: { id: enquiryId } });
    if (!enquiry) {
      res.status(404).json({ error: 'Enquiry not found' });
      return;
    }

    // Send the email
    await sendEnquiryReplyEmail(enquiry.email, enquiry.firstName, enquiry.message, replyMessage);

    // Mark as resolved
    await prisma.enquiry.update({
      where: { id: enquiryId },
      data: { isResolved: true }
    });

    res.status(200).json({ message: 'Reply sent successfully and enquiry marked as resolved.' });
  } catch (error) {
    console.error('Reply Enquiry Error:', error);
    res.status(500).json({ error: 'Failed to reply to enquiry' });
  }
};

export const markEnquiryResolved = async (req: Request, res: Response) => {
  try {
    const { enquiryId, isResolved } = req.body;
    if (!enquiryId) {
      res.status(400).json({ error: 'enquiryId is required' });
      return;
    }

    await prisma.enquiry.update({
      where: { id: enquiryId },
      data: { isResolved: !!isResolved }
    });

    res.status(200).json({ message: 'Enquiry status updated successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update enquiry status' });
  }
};

export const setUserPlan = async (req: Request, res: Response) => {
  try {
    const { targetUserId, planType, durationMonths } = req.body;

    if (!['FREE', 'SILVER', 'GOLD'].includes(planType)) {
      res.status(400).json({ error: 'Invalid plan type. Must be FREE, SILVER, or GOLD.' });
      return;
    }

    const planExpiresAt = planType === 'FREE' 
      ? null 
      : new Date(Date.now() + (durationMonths || 6) * 30 * 24 * 60 * 60 * 1000);

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { 
        planType,
        planExpiresAt,
        paymentDone: planType !== 'FREE'
      },
      include: { profile: true }
    });

    res.status(200).json({ 
      message: `Plan set to ${planType} successfully.`, 
      user: updatedUser 
    });
  } catch (error) {
    console.error("Set Plan Error:", error);
    res.status(500).json({ error: 'Failed to set user plan' });
  }
};

// ===========================
// NEW: Admin creates offline user
// ===========================
const createOfflineUserSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  mobile: z.string().min(10).max(15),
  email: z.string().email(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  maritalStatus: z.enum(['UNMARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED']),
  profileCreatedBy: z.enum(['Self', 'Father', 'Mother', 'Sibling', 'Relative', 'Friend', 'Marriage Bureau']).optional()
});

export const createOfflineUser = async (req: Request, res: Response) => {
  try {
    const validatedData = createOfflineUserSchema.parse(req.body);
    const emailLower = validatedData.email.toLowerCase();

    // Check for existing mobile
    const existingMobile = await prisma.user.findUnique({ where: { mobile: validatedData.mobile } });
    if (existingMobile) {
      res.status(400).json({ error: 'A user with this mobile number already exists.' });
      return;
    }

    // Check for existing email
    const existingEmail = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existingEmail) {
      res.status(400).json({ error: 'A user with this email already exists.' });
      return;
    }

    // Generate secure temporary password (12 chars, alphanumeric)
    const tempPassword = crypto.randomBytes(8).toString('base64url').slice(0, 12);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Generate collision-safe RegID
    const newRegId = await generateUniqueRegId();

    // Create the user — bypasses OTP, auto-activated, flagged for password change
    const newUser = await prisma.user.create({
      data: {
        regId: newRegId,
        mobile: validatedData.mobile,
        email: emailLower,
        password: hashedPassword,
        accountStatus: 'ACTIVE',
        requiresPasswordChange: true,
        profileCreatedBy: validatedData.profileCreatedBy || 'Marriage Bureau',
        profile: {
          create: {
            firstName: validatedData.firstName,
            lastName: validatedData.lastName,
            gender: validatedData.gender,
            maritalStatus: validatedData.maritalStatus
          }
        }
      },
      include: { profile: true }
    });

    // Send credentials email — password is NEVER returned in the API response
    sendOfflineCredentialsEmail(
      emailLower,
      validatedData.firstName,
      newRegId,
      tempPassword
    );

    res.status(201).json({
      message: `Profile created successfully. Login credentials have been sent to ${validatedData.email}.`,
      regId: newUser.regId,
      userName: `${validatedData.firstName} ${validatedData.lastName}`
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error("Create Offline User Error:", error);
    res.status(500).json({ error: 'Failed to create offline user profile.' });
  }
};

export const getAdminStats = async (req: Request, res: Response) => {
  try {
    const [totalUsers, activeUsers, pendingApprovals, pendingPayments, totalConnections, thisMonthRegs] = await Promise.all([
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.user.count({ where: { role: 'USER', accountStatus: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'USER', accountStatus: 'INACTIVE' } }),
      prisma.pendingPayment.count({ where: { status: 'PENDING' } }),
      prisma.request.count(),
      prisma.user.count({ where: { role: 'USER', createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } })
    ]);
    res.json({ totalUsers, activeUsers, pendingApprovals, pendingPayments, totalConnections, thisMonthRegs });
  } catch (error) { res.status(500).json({ error: 'Failed to fetch stats' }); }
};

const updateUserByAdminSchema = z.object({
  email: z.string().email().optional(),
  mobile: z.string().min(10).max(15).optional(),
  profile: z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    maritalStatus: z.enum(['UNMARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED']).optional(),
    birthDateTime: z.string().optional().nullable(),
    birthPlace: z.string().max(200).optional().nullable(),
    aboutMe: z.string().max(2000).optional().nullable(),
  }).optional(),
  physical: z.object({
    height: z.string().max(50).optional().nullable(),
    weight: z.number().int().min(20).max(300).optional().nullable(),
    bloodGroup: z.string().max(10).optional().nullable(),
    complexion: z.string().max(50).optional().nullable(),
    diet: z.string().max(50).optional().nullable(),
  }).optional(),
  education: z.object({
    trade: z.string().max(200).optional().nullable(),
    college: z.string().max(300).optional().nullable(),
    jobBusiness: z.string().max(300).optional().nullable(),
    annualIncome: z.string().max(100).optional().nullable(),
  }).optional(),
  family: z.object({
    fatherName: z.string().max(100).optional().nullable(),
    motherName: z.string().max(100).optional().nullable(),
    familyBackground: z.string().max(1000).optional().nullable(),
    motherHometown: z.string().max(200).optional().nullable(),
  }).optional(),
  astrology: z.object({
    gothra: z.string().max(100).optional().nullable(),
    rashi: z.string().max(100).optional().nullable(),
    nakshatra: z.string().max(100).optional().nullable(),
    mangal: z.string().max(50).optional().nullable(),
  }).optional(),
}).strict();

export const updateUserByAdmin = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const validated = updateUserByAdminSchema.parse(req.body);
    const { email, mobile, profile, physical, education, family, astrology } = validated;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) { res.status(404).json({ error: 'User not found.' }); return; }

    // Update account-level fields
    const accountUpdate: any = {};
    if (email) accountUpdate.email = email.toLowerCase();
    if (mobile) accountUpdate.mobile = mobile;

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...accountUpdate,
        ...(profile && { profile: { upsert: { create: profile, update: profile } } }),
        ...(physical && { physical: { upsert: { create: physical, update: physical } } }),
        ...(education && { education: { upsert: { create: education, update: education } } }),
        ...(family && { family: { upsert: { create: family, update: family } } }),
        ...(astrology && { astrology: { upsert: { create: astrology, update: astrology } } }),
      },
      include: { profile: true, physical: true, education: true, family: true, astrology: true }
    });
    res.json({ message: 'User updated successfully.', user: updatedUser });
  } catch (error: any) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: error.issues }); return; }
    if (error.code === 'P2002') { res.status(400).json({ error: 'Email or mobile already in use.' }); return; }
    console.error('Admin Update User Error:', error);
    res.status(500).json({ error: 'Failed to update user.' });
  }
};

export const getUpcomingBirthdays = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'USER', accountStatus: 'ACTIVE', profile: { birthDateTime: { not: null } } },
      include: { profile: { select: { firstName: true, lastName: true, birthDateTime: true } } },
      orderBy: { createdAt: 'desc' }
    });

    const today = new Date();
    const upcoming = users
      .filter(u => u.profile?.birthDateTime)
      .map(u => {
        const bday = new Date(u.profile!.birthDateTime!);
        const nextBday = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
        if (nextBday < today) nextBday.setFullYear(nextBday.getFullYear() + 1);
        const daysUntil = Math.ceil((nextBday.getTime() - today.getTime()) / (1000*60*60*24));
        return { id: u.id, regId: u.regId, email: u.email, mobile: u.mobile, firstName: u.profile!.firstName, lastName: u.profile!.lastName, birthDate: u.profile!.birthDateTime, daysUntil };
      })
      .filter(u => u.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    res.json(upcoming);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch birthdays' }); }
};

export const sendBirthdayWish = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = await prisma.user.findUnique({ where: { id }, include: { profile: true } });
    if (!user || !user.email) { res.status(404).json({ error: 'User not found or no email.' }); return; }
    const { sendBirthdayWishEmail } = await import('../services/mail.service');
    await sendBirthdayWishEmail(user.email, (user as any).profile?.firstName || 'Member');
    res.json({ message: 'Birthday wishes sent!' });
  } catch (error) { res.status(500).json({ error: 'Failed to send wishes' }); }
};

export const getConnectionLogs = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const where: any = {};
    if (status && ['PENDING','ACCEPTED','REJECTED'].includes(status)) where.status = status;
    const connections = await prisma.request.findMany({
      where,
      include: {
        sender: { include: { profile: { select: { firstName: true, lastName: true } } } },
        receiver: { include: { profile: { select: { firstName: true, lastName: true } } } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(connections);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch connections' }); }
};

export const getProfitStats = async (req: Request, res: Response) => {
  try {
    // Total revenue from APPROVED payments
    const approvedPayments = await prisma.pendingPayment.findMany({
      where: { status: 'APPROVED' },
      include: {
        user: {
          select: {
            regId: true,
            profileCreatedBy: true,
            createdAt: true,
            profile: { select: { firstName: true, lastName: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const totalRevenue = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
    
    const silverRevenue = approvedPayments
      .filter(p => p.planType === 'SILVER')
      .reduce((sum, p) => sum + p.amount, 0);
    
    const goldRevenue = approvedPayments
      .filter(p => p.planType === 'GOLD')
      .reduce((sum, p) => sum + p.amount, 0);

    // Monthly revenue breakdown (last 12 months)
    const monthlyRevenue: Record<string, number> = {};
    approvedPayments.forEach(p => {
      const month = new Date(p.createdAt).toISOString().slice(0, 7); // YYYY-MM
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + p.amount;
    });

    // Online vs Offline user counts
    // Offline = profileCreatedBy not null and not 'Self' (admin-created)
    const [onlineUsers, offlineUsers] = await Promise.all([
      prisma.user.count({ 
        where: { 
          role: 'USER',
          OR: [
            { profileCreatedBy: null },
            { profileCreatedBy: 'Self' },
            { profileCreatedBy: 'Father' },
            { profileCreatedBy: 'Mother' },
            { profileCreatedBy: 'Sibling' },
            { profileCreatedBy: 'Relative' },
            { profileCreatedBy: 'Friend' },
          ]
        } 
      }),
      prisma.user.count({ 
        where: { 
          role: 'USER',
          profileCreatedBy: 'Marriage Bureau'  // Admin-created via offline form
        } 
      }),
    ]);

    // Plan distribution
    const planDistribution = await prisma.user.groupBy({
      by: ['planType'],
      where: { role: 'USER' },
      _count: { planType: true }
    });

    // Recent payments (last 10)
    const recentPayments = approvedPayments.slice(0, 10).map(p => ({
      id: p.id,
      regId: p.user.regId,
      name: `${p.user.profile?.firstName || ''} ${p.user.profile?.lastName || ''}`.trim(),
      planType: p.planType,
      amount: p.amount,
      createdAt: p.createdAt,
      isOffline: p.user.profileCreatedBy === 'Marriage Bureau'
    }));

    res.json({
      totalRevenue,
      silverRevenue,
      goldRevenue,
      totalTransactions: approvedPayments.length,
      monthlyRevenue,
      onlineUsers,
      offlineUsers,
      planDistribution: planDistribution.map(p => ({
        plan: p.planType,
        count: p._count.planType
      })),
      recentPayments
    });
  } catch (error) {
    console.error('Profit Stats Error:', error);
    res.status(500).json({ error: 'Failed to fetch profit statistics.' });
  }
};

export const getAllUsersWithLocation = async (req: Request, res: Response) => {
  try {
    const { city, district, state, gender, planType, accountStatus } = req.query;

    const where: any = { role: 'USER' };
    
    if (accountStatus) where.accountStatus = String(accountStatus);
    if (planType) where.planType = String(planType);
    if (gender) where.profile = { ...where.profile, gender: String(gender).toUpperCase() };

    // Location filter - search in family.motherHometown and education.jobAddress
    if (city || district) {
      const locationSearch = String(city || district);
      where.OR = [
        { family: { motherHometown: { contains: locationSearch, mode: 'insensitive' } } },
        { education: { jobAddress: { contains: locationSearch, mode: 'insensitive' } } },
        { profile: { birthPlace: { contains: locationSearch, mode: 'insensitive' } } }
      ];
    }

    const users = await prisma.user.findMany({
      where,
      include: {
        profile: { select: { firstName: true, lastName: true, gender: true, maritalStatus: true, birthPlace: true } },
        family: { select: { motherHometown: true } },
        education: { select: { jobBusiness: true, jobAddress: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users by location.' });
  }
};
