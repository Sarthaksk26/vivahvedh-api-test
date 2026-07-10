import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { maskPrivateDetails } from '../utils/sanitize';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendPasswordChangedEmail } from '../services/mail.service';
import { StorageService } from '../services/storage.service';
import { generateAccessToken, generateRefreshToken, setAuthCookies, clearAuthCookies } from '../config/tokens';
import type { AccessTokenPayload } from '../types';

// ═══════════════════════════════════════════════════════════════════
// Zod schemas — whitelist of ALLOWED fields per sub-model.
// Any field NOT listed here is silently stripped from the payload.
// ═══════════════════════════════════════════════════════════════════

const profileSchema = z.object({
  firstName:     z.string().min(1).max(100).optional(),
  middleName:    z.string().max(100).optional().nullable(),
  lastName:      z.string().min(1).max(100).optional(),
  gender:        z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  maritalStatus: z.enum(['UNMARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED']).optional(),
  birthDateTime: z.string().optional().nullable().transform((val) => {
    if (!val || val.trim() === '') return null;
    const dateStr = val.slice(0, 10);
    const d = new Date(`${dateStr}T12:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }),
  birthPlace:    z.string().max(200).optional().nullable(),
  aboutMe:       z.string().max(2000).optional().nullable(),
  religionId:    z.preprocess((val) => val === '' ? null : val, z.coerce.number().int().positive().optional().nullable()),
  casteId:       z.preprocess((val) => val === '' ? null : val, z.coerce.number().int().positive().optional().nullable()),
  subCasteId:    z.preprocess((val) => val === '' ? null : val, z.coerce.number().int().positive().optional().nullable()),
}).strict();

const familySchema = z.object({
  fatherName:        z.string().max(100).optional().nullable(),
  fatherOccupation:  z.string().max(200).optional().nullable(),
  motherName:        z.string().max(100).optional().nullable(),
  motherOccupation:  z.string().max(200).optional().nullable(),
  motherHometown:    z.string().max(200).optional().nullable(),
  maternalUncleName: z.string().max(100).optional().nullable(),
  brothers:          z.preprocess((val) => val === '' ? 0 : val, z.coerce.number().int().min(0).max(20).optional()),
  marriedBrothers:   z.preprocess((val) => val === '' ? 0 : val, z.coerce.number().int().min(0).max(20).optional()),
  sisters:           z.preprocess((val) => val === '' ? 0 : val, z.coerce.number().int().min(0).max(20).optional()),
  marriedSisters:    z.preprocess((val) => val === '' ? 0 : val, z.coerce.number().int().min(0).max(20).optional()),
  relativesSirnames: z.string().max(1000).optional().nullable(),
  familyBackground:  z.string().max(2000).optional().nullable(),
  familyWealth:      z.string().max(1000).optional().nullable(),
  agricultureLand:   z.string().max(200).optional().nullable(),
  plot:              z.string().max(200).optional().nullable(),
  flat:              z.string().max(200).optional().nullable(),
}).strict();

const educationSchema = z.object({
  qualificationId:    z.preprocess((val) => val === '' ? null : val, z.coerce.number().int().positive().optional().nullable()),
  trade:              z.string().max(200).optional().nullable(),
  college:            z.string().max(300).optional().nullable(),
  jobBusiness:        z.string().max(300).optional().nullable(),
  jobAddress:         z.string().max(500).optional().nullable(),
  annualIncome:       z.string().max(100).optional().nullable(),
  specialAchievement: z.string().max(500).optional().nullable(),
  incomeProofUrl:     z.string().url().optional().nullable(),
}).strict();

const physicalSchema = z.object({
  height:     z.string().max(50).optional().nullable(),
  weight:     z.preprocess((val) => val === '' ? null : val, z.coerce.number().int().min(20).max(300).optional().nullable()),
  bloodGroup: z.string().max(10).optional().nullable(),
  complexion: z.string().max(50).optional().nullable(),
  health:     z.string().max(200).optional().nullable(),
  disease:    z.string().max(200).optional().nullable(),
  diet:       z.string().max(50).optional().nullable(),
  smoke:      z.preprocess((val) => val === 'true' ? true : val === 'false' ? false : val === '' ? null : val, z.boolean().optional().nullable()),
  drink:      z.preprocess((val) => val === 'true' ? true : val === 'false' ? false : val === '' ? null : val, z.boolean().optional().nullable()),
  medicalReportUrl: z.string().url().optional().nullable(),
}).strict();

const astrologySchema = z.object({
  gothra:    z.string().max(100).optional().nullable(),
  rashi:     z.string().max(100).optional().nullable(),
  nakshatra: z.string().max(100).optional().nullable(),
  charan:    z.string().max(50).optional().nullable(),
  nadi:      z.string().max(50).optional().nullable(),
  gan:       z.string().max(50).optional().nullable(),
  mangal:    z.string().max(50).optional().nullable(),
}).strict();

const preferencesSchema = z.object({
  expectations: z.string().max(2000).optional().nullable(),
}).strict();

const addressSchema = z.object({
  city:        z.string().max(100).optional().nullable(),
  district:    z.string().max(100).optional().nullable(),
  state:       z.string().max(100).optional().nullable(),
  addressLine: z.string().max(300).optional().nullable(),
  addressType: z.string().default('PERMANENT'),
  talukaId:    z.preprocess((val) => val === '' ? null : val, z.coerce.number().int().positive().optional().nullable()),
  districtId:  z.preprocess((val) => val === '' ? null : val, z.coerce.number().int().positive().optional().nullable()),
  stateId:     z.preprocess((val) => val === '' ? null : val, z.coerce.number().int().positive().optional().nullable()),
}).strict();

const updateProfileBodySchema = z.object({
  user:        z.object({
                 kycType: z.enum(['AADHAR', 'PAN', 'PASSPORT']).optional().nullable(),
               }).strict().optional(),
  profile:     profileSchema.optional(),
  family:      familySchema.optional(),
  education:   educationSchema.optional(),
  physical:    physicalSchema.optional(),
  astrology:   astrologySchema.optional(),
  preferences: preferencesSchema.optional(),
  addresses:   addressSchema.optional(),
}).strict();

// ═══════════════════════════════════════════════════════════════════
// Safe file-path helper — prevents path-traversal attacks
// ═══════════════════════════════════════════════════════════════════

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

/**
 * Given a stored image URL like `/uploads/img-xxx.webp`, returns
 * the safe absolute path on disk. Returns null if the URL is
 * malformed or attempts traversal.
 */
function safeFilePath(imageUrl: string): string | null {
  // Extract only the basename — path.basename strips any ../ attempts
  const segments = imageUrl.split('/');
  const rawFilename = segments[segments.length - 1];
  if (!rawFilename) return null;

  const basename = path.basename(rawFilename);
  // Double-check: basename must not contain path separators
  if (basename !== rawFilename || basename.includes('..')) return null;

  return path.join(UPLOADS_DIR, basename);
}

// ═══════════════════════════════════════════════════════════════════
// Controllers
// ═══════════════════════════════════════════════════════════════════

export const getMyProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;

  const fullUser = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      family: true,
      physical: true,
      education: true,
      astrology: true,
      preferences: true,
      images: true,
    },
  });

  if (!fullUser) throw new AppError('User not found.', 404);

  // Never leak the password hash
  const { password, ...safeUser } = fullUser;
  res.status(200).json(maskPrivateDetails(safeUser, true));
});

export const uploadPhoto = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError('No image file provided.', 400);

  const userId = req.user.id;
  // req.file.path already contains the full URL or relative path from processImage middleware
  const photoUrl = req.file.path;

  await prisma.$transaction(async (tx) => {
    // Acquire a row-level lock on the parent User record to serialize uploads for this user
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;

    const existingCount = await tx.image.count({ where: { userId } });

    if (existingCount >= 5) {
      throw new AppError('You can upload a maximum of 5 photos.', 400);
    }

    await tx.image.create({
      data: {
        userId,
        url: photoUrl,
        isPrimary: existingCount === 0,
      },
    });
  });

  res.status(200).json({ success: true, photoUrl });
});

export const uploadKyc = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError('No document file provided.', 400);

  const userId = req.user.id;
  const documentUrl = req.file.path;
  const { kycType } = req.body;

  if (!kycType || !['AADHAR', 'PAN', 'PASSPORT'].includes(kycType)) {
    throw new AppError('Invalid or missing kycType. Allowed: AADHAR, PAN, PASSPORT.', 400);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      kycDocumentUrl: documentUrl,
      kycType: kycType as any,
      kycVerified: false,
    },
  });

  res.status(200).json({ success: true, documentUrl, message: 'KYC Document uploaded successfully.' });
});

export const uploadIncomeProof = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError('No document file provided.', 400);

  const userId = req.user.id;
  const documentUrl = req.file.path;

  await prisma.userEducation.upsert({
    where: { userId },
    update: { incomeProofUrl: documentUrl },
    create: { userId, incomeProofUrl: documentUrl },
  });

  res.status(200).json({ success: true, documentUrl, message: 'Income Proof uploaded successfully.' });
});

export const uploadMedicalReport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError('No document file provided.', 400);

  const userId = req.user.id;
  const documentUrl = req.file.path;

  await prisma.userPhysical.upsert({
    where: { userId },
    update: { medicalReportUrl: documentUrl },
    create: { userId, medicalReportUrl: documentUrl },
  });

  res.status(200).json({ success: true, documentUrl, message: 'Medical Report uploaded successfully.' });
});

export const deletePhoto = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const imageId = req.params.imageId as string;

  const image = await prisma.image.findUnique({ where: { id: imageId } });
  if (!image || image.userId !== userId) {
    throw new AppError('Image not found or access denied.', 404);
  }

  await StorageService.deleteImage(image.url);

  await prisma.image.delete({ where: { id: imageId } });

  // Promote next image to primary if needed
  if (image.isPrimary) {
    const nextImage = await prisma.image.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (nextImage) {
      await prisma.image.update({
        where: { id: nextImage.id },
        data: { isPrimary: true },
      });
    }
  }

  res.status(200).json({ success: true, message: 'Photo deleted.' });
});

export const setProfilePhoto = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const imageId = req.params.imageId as string;

  // Verify the image belongs to this user
  const image = await prisma.image.findUnique({ where: { id: imageId } });
  if (!image || image.userId !== userId) {
    throw new AppError('Image not found or access denied.', 404);
  }

  if (image.isPrimary) {
    res.status(200).json({ success: true, message: 'This photo is already your profile photo.' });
    return;
  }

  // Use a transaction: unset current primary, set new primary
  await prisma.$transaction([
    prisma.image.updateMany({
      where: { userId, isPrimary: true },
      data: { isPrimary: false }
    }),
    prisma.image.update({
      where: { id: imageId },
      data: { isPrimary: true }
    })
  ]);

  res.status(200).json({ success: true, message: 'Profile photo updated successfully.' });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;

  // Validate + strip unknown fields via .strict()
  const data = updateProfileBodySchema.parse(req.body);

  // Build the Prisma nested-write dynamically from validated data only
  const prismaData: Record<string, any> = {};

  const subModels = ['profile', 'family', 'education', 'physical', 'astrology', 'preferences'] as const;
  type SubModelKey = typeof subModels[number];

  // Before the Prisma update call, check which sub-models exist
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      profile: { select: { id: true } },
      physical: { select: { id: true } },
      education: { select: { id: true } },
      family: { select: { id: true } },
      astrology: { select: { id: true } },
      preferences: { select: { id: true } },
    }
  });

  // Then for each sub-model, use 'create' if null, 'update' if exists
  for (const key of subModels) {
    const section = data[key];
    if (section && Object.keys(section).length > 0) {
      const exists = existingUser ? existingUser[key] : null;
      prismaData[key] = exists 
        ? { update: section }
        : { create: section };
    }
  }

  if (data.user && Object.keys(data.user).length > 0) {
    Object.assign(prismaData, data.user);
  }

  if (data.addresses && Object.keys(data.addresses).length > 0) {
    prismaData.addresses = {
      deleteMany: {}, // Clear old addresses and replace with new
      create: [data.addresses]
    };
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: prismaData as Prisma.UserUpdateInput,
    include: {
      profile: true,
      family: true,
      education: true,
      physical: true,
      astrology: true,
      preferences: true,
      addresses: true,
    },
  });

  res.status(200).json({
    success: true,
    message: 'Profile data saved successfully.',
    user: updatedUser,
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z.string()
    .min(8, 'New password must be at least 8 characters.')
    .max(100, 'Password too long.'),
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found.', 404);

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) throw new AppError('Current password is incorrect.', 401);

  // Prevent using the same password
  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    throw new AppError('New password must be different from your current password.', 400);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword, requiresPasswordChange: false },
  });

  // Revoke all existing sessions/refresh tokens for this user
  await prisma.refreshToken.deleteMany({ where: { userId } });

  // Re-issue tokens for the current session to prevent logging the user out of their active tab
  const tokenPayload: AccessTokenPayload = {
    id: user.id,
    role: user.role,
    accountStatus: user.accountStatus,
    planType: user.planType,
    requiresPasswordChange: false,
  };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken({ id: tokenPayload.id });

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: tokenPayload.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  setAuthCookies(res, accessToken, refreshToken);

  // Notify user about password change (fire and forget)
  if (user.email) {
    sendPasswordChangedEmail(user.email, user.regId)
      .catch((err: Error) => console.error('[Mail] Password change notification failed:', err.message));
  }

  res.status(200).json({ success: true, message: 'Password changed successfully.' });
});

export const shortlistProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { targetUserId } = req.body;

  if (userId === targetUserId) throw new AppError('Cannot shortlist yourself.', 400);

  const existing = await prisma.shortlist.findFirst({ where: { userId, targetUserId } });

  if (existing) {
    await prisma.shortlist.delete({ where: { id: existing.id } });
    res.status(200).json({ shortlisted: false, message: 'Removed from shortlist.' });
    return;
  }

  await prisma.shortlist.create({ data: { userId, targetUserId } });
  res.status(200).json({ shortlisted: true, message: 'Profile shortlisted.' });
});

export const getMyShortlist = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;

  const shortlisted = await prisma.shortlist.findMany({
    where: { userId },
    include: {
      target: {
        include: { profile: true, images: { where: { isPrimary: true }, take: 1 } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json(shortlisted);
});

export const recordProfileView = asyncHandler(async (req: Request, res: Response) => {
  const viewerId = req.user.id;
  const profileId = req.params.profileId as string;

  if (viewerId === profileId) {
    res.status(200).json({ recorded: false });
    return;
  }

  await prisma.profileView.upsert({
    where: { viewerId_viewedId: { viewerId, viewedId: profileId } },
    update: { viewedAt: new Date() },
    create: { viewerId, viewedId: profileId },
  });

  res.status(200).json({ recorded: true });
});

export const getProfileViewers = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;

  const viewers = await prisma.profileView.findMany({
    where: { viewedId: userId },
    include: {
      viewer: {
        include: { profile: true, images: { where: { isPrimary: true }, take: 1 } },
      },
    },
    orderBy: { viewedAt: 'desc' },
    take: 50,
  });

  res.status(200).json(viewers);
});

export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;
  
  // Verify user exists before attempting to delete
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError('User not found.', 404);
  }

  // Delete all refresh tokens
  await prisma.refreshToken.deleteMany({ where: { userId } });
  
  // Clear auth cookies
  clearAuthCookies(res);
  
  // Delete the user from the database.
  // Because schema.prisma uses `onDelete: Cascade` for all relations 
  // (UserProfile, UserAddress, UserPhysical, etc.), this will safely wipe all PII.
  await prisma.user.delete({ where: { id: userId } });

  res.status(200).json({ success: true, message: 'Account and all associated personal data have been permanently deleted.' });
});

export const reportProfile = asyncHandler(async (req: Request, res: Response) => {
  const reporterId = req.user.id;
  const { targetUserId, reason, description } = req.body;

  if (!targetUserId || !reason) {
    throw new AppError('Target user ID and reason are required.', 400);
  }

  if (reporterId === targetUserId) {
    throw new AppError('You cannot report yourself.', 400);
  }

  // Verify target user exists
  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) {
    throw new AppError('User not found.', 404);
  }

  // Prevent duplicate pending reports from the same user for the same target
  const existingReport = await prisma.report.findFirst({
    where: { reporterId, reportedUserId: targetUserId, status: 'PENDING' }
  });

  if (existingReport) {
    res.status(200).json({ success: true, message: 'You have already reported this profile. Our team is reviewing it.' });
    return;
  }

  await prisma.report.create({
    data: {
      reporterId,
      reportedUserId: targetUserId,
      reason,
      description
    }
  });

  res.status(200).json({ success: true, message: 'Profile has been reported to the admin team.' });
});
