import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../config/db';
import { z } from 'zod';
import { sendApprovalEmail, sendOfflineCredentialsEmail, sendEnquiryReplyEmail } from '../services/mail.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';

import { generateUniqueRegId } from '../utils/id.util';

export const getPendingApprovals = asyncHandler(async (req: Request, res: Response) => {
  const pendingUsers = await prisma.user.findMany({
    where: { accountStatus: 'INACTIVE' },
    include: { profile: true, images: { orderBy: { isPrimary: 'desc' } } },
    orderBy: { createdAt: 'asc' }
  });
  res.status(200).json(pendingUsers);
});

export const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
  const { q, gender, ageMin, ageMax, accountStatus, planType } = req.query;

  let baseWhere: any = {
    role: 'USER',
  };

  if (planType) {
    if (planType === 'PAID') {
      baseWhere.planType = { in: ['SILVER', 'GOLD'] };
    } else {
      baseWhere.planType = 'FREE';
    }
  }

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

  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
  const limit = Math.max(1, parseInt(String(req.query.limit || '50'), 10));
  const skip = (page - 1) * limit;

  const [allUsers, total] = await prisma.$transaction([
    prisma.user.findMany({
      where: baseWhere,
      include: { profile: true, images: { orderBy: { isPrimary: 'desc' } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.user.count({ where: baseWhere }),
  ]);

  res.status(200).json({
    users: allUsers,
    pagination: {
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export const approveUser = asyncHandler(async (req: Request, res: Response) => {
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
    sendApprovalEmail(updatedUser.email, updatedUser.profile.firstName, updatedUser.regId)
      .catch((err: Error) => console.error(`[Mail] Approval email failed for ${updatedUser.email}:`, err.message));
  }

  // Create in-app notification for the approved user
  await prisma.userNotification.create({
    data: {
      userId: targetUserId,
      type: 'PROFILE_APPROVED',
      message: 'Your profile has been approved! You can now browse matches and send proposals.',
    },
  }).catch((err: Error) => console.error('[Notification] PROFILE_APPROVED failed:', err.message));

  res.status(200).json({ message: 'User approved successfully', user: updatedUser });
});

export const banUser = asyncHandler(async (req: Request, res: Response) => {
  const { targetUserId, action } = req.body;

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (req.user?.id === targetUserId) {
    res.status(400).json({ error: 'You cannot suspend your own account.' });
    return;
  }

  const newStatus = action === 'unban' ? 'ACTIVE' : 'SUSPENDED';
  await prisma.user.update({
    where: { id: targetUserId },
    data: { accountStatus: newStatus }
  });

  res.status(200).json({ message: newStatus === 'ACTIVE' ? 'User reactivated.' : 'User suspended.' });
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

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
});

export const getEnquiries = asyncHandler(async (req: Request, res: Response) => {
  const enquiries = await prisma.enquiry.findMany({
    orderBy: { createdAt: 'desc' }
  });
  res.status(200).json(enquiries);
});

export const replyToEnquiry = asyncHandler(async (req: Request, res: Response) => {
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

  await sendEnquiryReplyEmail(enquiry.email, enquiry.firstName, enquiry.message, replyMessage)
    .catch((err: Error) => console.error(`[Mail] Enquiry reply email failed for ${enquiry.email}:`, err.message));

  await prisma.enquiry.update({
    where: { id: enquiryId },
    data: { isResolved: true }
  });

  res.status(200).json({ message: 'Reply sent successfully and enquiry marked as resolved.' });
});

export const markEnquiryResolved = asyncHandler(async (req: Request, res: Response) => {
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
});

export const setUserPlan = asyncHandler(async (req: Request, res: Response) => {
  const { targetUserId, planType } = req.body;

  if (!['FREE', 'SILVER', 'GOLD'].includes(planType)) {
    res.status(400).json({ error: 'Invalid plan type. Must be FREE, SILVER, or GOLD.' });
    return;
  }

  // Both SILVER and GOLD plans have a standardized 12-month duration
  let planExpiresAt: Date | null = null;
  if (planType !== 'FREE') {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 12);
    planExpiresAt = expiresAt;
  }

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
});

// ===========================
// NEW: Admin creates offline user
// ===========================
const createOfflineUserSchema = z.object({
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  mobile: z.string().min(10).max(15).regex(/^[0-9]+$/),
  email: z.string().email().max(254).toLowerCase(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  maritalStatus: z.enum(['UNMARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED']),
  profileCreatedBy: z.enum(['Self', 'Father', 'Mother', 'Sibling', 'Relative', 'Friend', 'Marriage Bureau']).optional(),
  kycType: z.enum(['AADHAR', 'PAN']),
  kycNumber: z.string().min(1, 'KYC Number is required')
}).strict().superRefine((data, ctx) => {
  if (data.kycType === 'AADHAR') {
    if (!/^\d{12}$/.test(data.kycNumber.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Aadhaar number must be exactly 12 digits (numbers only).',
        path: ['kycNumber']
      });
    }
  } else if (data.kycType === 'PAN') {
    if (!/^[A-Za-z0-9]{10}$/.test(data.kycNumber.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'PAN number must be exactly 10 characters (e.g. ABCDE1234F).',
        path: ['kycNumber']
      });
    }
  }
});

export const createOfflineUser = asyncHandler(async (req: Request, res: Response) => {
  const validatedData = createOfflineUserSchema.parse(req.body);
  const emailLower = validatedData.email;

  const existingMobile = await prisma.user.findUnique({ where: { mobile: validatedData.mobile } });
  if (existingMobile) {
    res.status(400).json({ error: 'A user with this mobile number already exists.' });
    return;
  }

  const existingEmail = await prisma.user.findUnique({ where: { email: emailLower } });
  if (existingEmail) {
    res.status(400).json({ error: 'A user with this email already exists.' });
    return;
  }

  const tempPassword = crypto.randomBytes(8).toString('base64url').slice(0, 12);
  const hashedPassword = await bcrypt.hash(tempPassword, 10);
  const newRegId = await generateUniqueRegId();

  const newUser = await prisma.user.create({
    data: {
      regId: newRegId,
      mobile: validatedData.mobile,
      email: emailLower,
      password: hashedPassword,
      accountStatus: 'ACTIVE',
      planType: 'FREE',
      requiresPasswordChange: false,
      profileCreatedBy: validatedData.profileCreatedBy || 'Marriage Bureau',
      kycType: validatedData.kycType,
      kycNumber: validatedData.kycNumber,
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

  sendOfflineCredentialsEmail(emailLower, validatedData.firstName, newRegId, tempPassword)
    .catch((err: Error) => console.error(`[Mail] Offline credentials failed for ${emailLower}:`, err.message));

  const adminId = req.user?.id;
  if (adminId) {
    await prisma.adminAuditLog.create({
      data: {
        adminId,
        targetUserId: newUser.id,
        action: 'OFFLINE_USER_CREATED',
        details: 'Admin created an offline profile'
      }
    });
  }

  res.status(201).json({
    message: `Profile created successfully. Login credentials have been sent to ${validatedData.email}.`,
    regId: newUser.regId,
    userName: `${validatedData.firstName} ${validatedData.lastName}`,
    tempPassword
  });
});

export const resetUserPassword = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user?.id;
  const targetUserId = String(req.params.id);

  if (!adminId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (targetUser.role === 'ADMIN') {
    res.status(403).json({ error: 'Cannot reset password for an admin.' });
    return;
  }

  const tempPassword = crypto.randomBytes(8).toString('base64url').slice(0, 12);
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      password: hashedPassword,
      requiresPasswordChange: false
    }
  });

  await prisma.refreshToken.deleteMany({
    where: { userId: targetUserId }
  });

  await prisma.adminAuditLog.create({
    data: {
      adminId,
      targetUserId,
      action: 'PASSWORD_RESET',
      details: 'Admin generated a temporary password'
    }
  });

  res.status(200).json({
    message: 'Temporary password generated successfully.',
    tempPassword
  });
});

export const getAdminAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const logs = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  // Fetch admin and target user details for the logs
  const adminIds = [...new Set(logs.map(log => log.adminId))];
  const targetUserIds = [...new Set(logs.map(log => log.targetUserId))];
  
  const [admins, targetUsers] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, profile: { select: { firstName: true, lastName: true } } } }),
    prisma.user.findMany({ where: { id: { in: targetUserIds } }, select: { id: true, profile: { select: { firstName: true, lastName: true } } } })
  ]);

  const adminMap = new Map(admins.map(a => [a.id, a.profile ? `${a.profile.firstName} ${a.profile.lastName}` : 'Admin']));
  const targetUserMap = new Map(targetUsers.map(u => [u.id, u.profile ? `${u.profile.firstName} ${u.profile.lastName}` : 'User']));

  const enrichedLogs = logs.map(log => ({
    ...log,
    adminName: adminMap.get(log.adminId) || 'Unknown Admin',
    targetUserName: targetUserMap.get(log.targetUserId) || 'Unknown User'
  }));

  res.status(200).json(enrichedLogs);
});

export const getAdminStats = asyncHandler(async (req: Request, res: Response) => {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalUsers, activeUsers, pendingApprovals, totalConnections, pendingPayments, thisMonthRegs] = await Promise.all([
    prisma.user.count({ where: { role: 'USER' } }),
    prisma.user.count({ where: { role: 'USER', accountStatus: 'ACTIVE' } }),
    prisma.user.count({ where: { role: 'USER', accountStatus: 'INACTIVE' } }),
    prisma.request.count(),
    prisma.pendingPayment.count({ where: { status: 'PENDING' } }),
    prisma.user.count({ where: { role: 'USER', createdAt: { gte: firstDayOfMonth } } })
  ]);

  res.status(200).json({
    totalUsers,
    activeUsers,
    pendingApprovals,
    pendingPayments,
    totalConnections,
    thisMonthRegs
  });
});

const updateUserByAdminSchema = z.object({
  // Account-level fields
  email: z.string().email().optional().nullable(),
  mobile: z.string().min(10).max(15).optional(),
  accountStatus: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED']).optional(),
  planType: z.enum(['FREE', 'SILVER', 'GOLD']).optional(),
  paymentDone: z.boolean().optional(),

  // Profile
  profile: z.object({
    firstName: z.string().min(1).max(100).optional(),
    middleName: z.string().max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    maritalStatus: z.enum(['UNMARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED']).optional(),
    birthDateTime: z.string().optional().nullable(),
    birthPlace: z.string().max(200).optional().nullable(),
    aboutMe: z.string().max(2000).optional().nullable(),
  }).optional(),

  // Physical — ALL fields
  physical: z.object({
    height: z.string().max(50).optional().nullable(),
    weight: z.number().int().min(20).max(300).optional().nullable(),
    bloodGroup: z.string().max(10).optional().nullable(),
    complexion: z.string().max(50).optional().nullable(),
    health: z.string().max(200).optional().nullable(),
    disease: z.string().max(200).optional().nullable(),
    diet: z.string().max(50).optional().nullable(),
    smoke: z.boolean().optional().nullable(),
    drink: z.boolean().optional().nullable(),
  }).optional(),

  // Education — ALL fields
  education: z.object({
    trade: z.string().max(200).optional().nullable(),
    college: z.string().max(300).optional().nullable(),
    jobBusiness: z.string().max(300).optional().nullable(),
    jobAddress: z.string().max(500).optional().nullable(),
    annualIncome: z.string().max(100).optional().nullable(),
    specialAchievement: z.string().max(500).optional().nullable(),
  }).optional(),

  // Family — ALL fields
  family: z.object({
    fatherName: z.string().max(100).optional().nullable(),
    fatherOccupation: z.string().max(200).optional().nullable(),
    motherName: z.string().max(100).optional().nullable(),
    motherOccupation: z.string().max(200).optional().nullable(),
    motherHometown: z.string().max(200).optional().nullable(),
    maternalUncleName: z.string().max(100).optional().nullable(),
    brothers: z.number().int().min(0).max(20).optional(),
    marriedBrothers: z.number().int().min(0).max(20).optional(),
    sisters: z.number().int().min(0).max(20).optional(),
    marriedSisters: z.number().int().min(0).max(20).optional(),
    relativesSirnames: z.string().max(500).optional().nullable(),
    familyBackground: z.string().max(1000).optional().nullable(),
    familyWealth: z.string().max(1000).optional().nullable(),
    agricultureLand: z.string().max(500).optional().nullable(),
    plot: z.string().max(500).optional().nullable(),
    flat: z.string().max(500).optional().nullable(),
  }).optional(),

  // Astrology — ALL fields
  astrology: z.object({
    gothra: z.string().max(100).optional().nullable(),
    rashi: z.string().max(100).optional().nullable(),
    nakshatra: z.string().max(100).optional().nullable(),
    charan: z.string().max(50).optional().nullable(),
    nadi: z.string().max(50).optional().nullable(),
    gan: z.string().max(50).optional().nullable(),
    mangal: z.string().max(50).optional().nullable(),
  }).optional(),

  // Address
  address: z.object({
    addressLine: z.string().max(500).optional().nullable(),
    city: z.string().max(100).optional().nullable(),
    district: z.string().max(100).optional().nullable(),
    state: z.string().max(100).optional().nullable(),
  }).optional(),

  // Preferences
  preferences: z.object({
    expectations: z.string().max(2000).optional().nullable(),
  }).optional(),
});

export const updateUserByAdmin = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const validated = updateUserByAdminSchema.parse(req.body);
  const { email, mobile, accountStatus, planType, paymentDone, profile, physical, education, family, astrology, address, preferences } = validated;

  const targetUser = await prisma.user.findUnique({ where: { id } });
  if (!targetUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const accountUpdate: any = {};
  if (email !== undefined) accountUpdate.email = email ? email.toLowerCase() : null;
  if (mobile) accountUpdate.mobile = mobile;
  if (accountStatus) accountUpdate.accountStatus = accountStatus;
  if (planType) accountUpdate.planType = planType;
  if (paymentDone !== undefined) accountUpdate.paymentDone = paymentDone;

  // Build profile upsert — must include required fields for create
  const profileCreate = profile ? {
    firstName: profile.firstName || targetUser.regId,
    middleName: profile.middleName || '',
    lastName: profile.lastName || '',
    gender: profile.gender || 'MALE' as const,
    maritalStatus: profile.maritalStatus || 'UNMARRIED' as const,
    ...profile,
  } : undefined;

  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      ...accountUpdate,
      ...(profile && { profile: { upsert: { create: profileCreate!, update: profile } } }),
      ...(physical && { physical: { upsert: { create: physical, update: physical } } }),
      ...(education && { education: { upsert: { create: education, update: education } } }),
      ...(family && { family: { upsert: { create: family, update: family } } }),
      ...(astrology && { astrology: { upsert: { create: astrology, update: astrology } } }),
      ...(preferences && { preferences: { upsert: { create: preferences, update: preferences } } }),
      ...(address && { addresses: {
        upsert: {
          where: { id: (await prisma.userAddress.findFirst({ where: { userId: id } }))?.id || '00000000-0000-0000-0000-000000000000' },
          create: { addressType: 'PRIMARY', ...address },
          update: address,
        }
      }}),
    },
    include: { profile: true, physical: true, education: true, family: true, astrology: true, addresses: true, preferences: true }
  });

  res.status(200).json({ message: 'User updated successfully.', user: updatedUser });
});

export const getUpcomingBirthdays = asyncHandler(async (req: Request, res: Response) => {
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
      const daysUntil = Math.ceil((nextBday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return { 
        id: u.id, 
        regId: u.regId, 
        email: u.email, 
        mobile: u.mobile, 
        firstName: u.profile!.firstName, 
        lastName: u.profile!.lastName, 
        birthDate: u.profile!.birthDateTime, 
        daysUntil 
      };
    })
    .filter(u => u.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  res.status(200).json(upcoming);
});

export const getBirthdayPreview = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const user = await prisma.user.findUnique({ 
    where: { id }, 
    include: { profile: true } 
  });
  
  if (!user || !user.email) {
    res.status(404).json({ error: 'User not found or no email.' });
    return;
  }

  const name = user.profile?.firstName || 'Member';
  
  // Return the raw text for editing in the frontend textarea
  const defaultMessage = `Namaste ${name},\n\nWishing you a wonderful birthday filled with joy and happiness.\n\nMay this year bring you your perfect life partner!\n\nBest regards,\nVivahvedh Team`;

  res.status(200).json({ 
    email: user.email,
    name,
    defaultMessage,
    subject: `🎂 Happy Birthday ${name}! | Vivahvedh`
  });
});

export const sendBirthdayWish = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { message } = req.body;

  const user = await prisma.user.findUnique({ where: { id }, include: { profile: true } });
  
  if (!user || !user.email) {
    res.status(404).json({ error: 'User not found or no email.' });
    return;
  }

  const { sendBirthdayWishEmail } = await import('../services/mail.service');
  await sendBirthdayWishEmail(user.email, user.profile?.firstName || 'Member', message);

  // Log the wish
  await prisma.birthdayWishLog.create({
    data: {
      userId: user.id,
      emailSentTo: user.email,
      message: message || 'Default Birthday Wish'
    }
  });

  res.status(200).json({ message: 'Birthday wishes sent!' });
});

export const getBirthdayWishLogs = asyncHandler(async (req: Request, res: Response) => {
  const logs = await prisma.birthdayWishLog.findMany({
    include: {
      user: {
        include: {
          profile: { select: { firstName: true, lastName: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  res.status(200).json(logs);
});

export const getConnectionLogs = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as string;
  const where: any = {};
  if (status && ['PENDING', 'ACCEPTED', 'REJECTED'].includes(status)) {
    where.status = status;
  }

  const connections = await prisma.request.findMany({
    where,
    include: {
      sender: { include: { profile: { select: { firstName: true, lastName: true } } } },
      receiver: { include: { profile: { select: { firstName: true, lastName: true } } } }
    },
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  res.status(200).json(connections);
});

export const getProfitStats = asyncHandler(async (req: Request, res: Response) => {
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
  const silverRevenue = approvedPayments.filter(p => p.planType === 'SILVER').reduce((sum, p) => sum + p.amount, 0);
  const goldRevenue = approvedPayments.filter(p => p.planType === 'GOLD').reduce((sum, p) => sum + p.amount, 0);

  const monthlyRevenue: Record<string, number> = {};
  approvedPayments.forEach(p => {
    const month = new Date(p.createdAt).toISOString().slice(0, 7);
    monthlyRevenue[month] = (monthlyRevenue[month] || 0) + p.amount;
  });

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
      where: { role: 'USER', profileCreatedBy: 'Marriage Bureau' } 
    }),
  ]);

  const planDistribution = await prisma.user.groupBy({
    by: ['planType'],
    where: { role: 'USER' },
    _count: { planType: true }
  });

  const recentPayments = approvedPayments.slice(0, 10).map(p => ({
    id: p.id,
    regId: p.user.regId,
    name: `${p.user.profile?.firstName || ''} ${p.user.profile?.lastName || ''}`.trim(),
    planType: p.planType,
    amount: p.amount,
    createdAt: p.createdAt,
    isOffline: p.user.profileCreatedBy === 'Marriage Bureau'
  }));

  res.status(200).json({
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
});

export const getAllUsersWithLocation = asyncHandler(async (req: Request, res: Response) => {
  const { city, district, state, gender, planType, accountStatus } = req.query;

  const where: any = { role: 'USER' };
  if (accountStatus) where.accountStatus = String(accountStatus);
  if (planType) where.planType = String(planType);
  if (gender) where.profile = { ...where.profile, gender: String(gender).toUpperCase() };

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

  res.status(200).json(users);
});

export const updateKycStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { kycVerified } = req.body;
  
  if (typeof kycVerified !== 'boolean') {
    res.status(400).json({ error: 'kycVerified must be a boolean' });
    return;
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: { kycVerified },
    include: { profile: true }
  });

  res.status(200).json({ message: 'KYC status updated successfully.', user: updatedUser });
});
export const getReports = asyncHandler(async (req: Request, res: Response) => {
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      reporter: {
        select: { id: true, regId: true, mobile: true, profile: { select: { firstName: true, lastName: true } } }
      },
      reportedUser: {
        select: { id: true, regId: true, mobile: true, accountStatus: true, profile: { select: { firstName: true, lastName: true } } }
      }
    }
  });
  res.status(200).json(reports);
});

export const updateReportStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { status } = req.body;
  
  if (!['PENDING', 'REVIEWED', 'RESOLVED'].includes(status)) {
    throw new AppError('Invalid report status.', 400);
  }

  const report = await prisma.report.update({
    where: { id },
    data: { status: status as any }
  });
  res.status(200).json(report);
});
