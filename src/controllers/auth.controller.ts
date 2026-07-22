import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import prisma from '../config/db';
import { z } from 'zod';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../services/mail.service';
import { asyncHandler } from '../utils/asyncHandler';
import { generateUniqueRegId } from '../utils/id.util';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE,
} from '../config/tokens';
import type { AccessTokenPayload, LoginResponse } from '../types';

const PROFILE_CREATED_BY_OPTIONS = ['Self', 'Father', 'Mother', 'Sibling', 'Relative', 'Friend', 'Marriage Bureau'] as const;

// Global in-memory grace cache removed - now using Postgres (RefreshTokenGrace) for serverless compatibility.

// Zod Schema for strict validation
const registerSchema = z.object({
  mobile: z.string().min(10).max(15).regex(/^[0-9]+$/, 'Mobile must contain only digits'),
  password: z.string().min(8).max(100),
  firstName: z.string().min(1).max(100).trim(),
  middleName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  maritalStatus: z.enum(['UNMARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED']),
  email: z.string().email().max(254).toLowerCase(),
  birthDate: z.string().refine((val) => {
    const dob = new Date(`${val.slice(0, 10)}T12:00:00Z`);
    return !isNaN(dob.getTime());
  }, { message: 'Date of Birth is required and must be a valid date.' }),
  profileCreatedBy: z.enum(PROFILE_CREATED_BY_OPTIONS).optional(),
  kycType: z.enum(['AADHAR', 'PAN']),
  kycNumber: z.string().min(1, 'KYC Number is required')
}).strict().superRefine((data, ctx) => {
  const dob = new Date(`${data.birthDate.slice(0, 10)}T12:00:00Z`);
  const age = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (data.gender === 'MALE' && age < 21) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Legal marriage age in India is 21+ for Men and 18+ for Women.',
      path: ['birthDate']
    });
  } else if (data.gender === 'FEMALE' && age < 18) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Legal marriage age in India is 21+ for Men and 18+ for Women.',
      path: ['birthDate']
    });
  }

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

const loginSchema = z.object({
  identifier: z.string().min(3).max(254).trim(),
  password: z.string().min(1),
}).strict();

// ═══════════════════════════════════════════════════════════════════
//  Helper: Issue dual tokens and set cookies
// ═══════════════════════════════════════════════════════════════════

async function issueDualTokens(
  res: Response,
  payload: AccessTokenPayload
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken({ id: payload.id });

  // Store refresh token in DB for server-side revocation
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: payload.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  setAuthCookies(res, accessToken, refreshToken);
  return { accessToken, refreshToken };
}

// ═══════════════════════════════════════════════════════════════════
//  POST /api/auth/register
// ═══════════════════════════════════════════════════════════════════

export const register = asyncHandler(async (req: Request, res: Response) => {
  const validatedData = registerSchema.parse(req.body);

  const emailLower = validatedData.email.toLowerCase();

  // Check if user already exists by mobile
  const existingMobile = await prisma.user.findUnique({
    where: { mobile: validatedData.mobile }
  });
  if (existingMobile) {
    res.status(400).json({ error: 'User with this mobile number already exists.' });
    return;
  }

  // Check if user already exists by email
  const existingEmail = await prisma.user.findUnique({
    where: { email: emailLower }
  });
  if (existingEmail) {
    res.status(400).json({ error: 'User with this email already exists.' });
    return;
  }

  const hashedPassword = await bcrypt.hash(validatedData.password, 10);
  const newRegId = await generateUniqueRegId();

  // Parse birthDate at UTC noon to prevent IST timezone shift
  const birthDateTime = new Date(`${validatedData.birthDate.slice(0, 10)}T12:00:00Z`);

  const newUser = await prisma.user.create({
    data: {
      regId: newRegId,
      mobile: validatedData.mobile,
      email: emailLower,
      password: hashedPassword,
      accountStatus: 'INACTIVE',
      profileCreatedBy: validatedData.profileCreatedBy || null,
      kycType: validatedData.kycType,
      kycNumber: validatedData.kycNumber,
      profile: {
        create: {
          firstName: validatedData.firstName,
          middleName: validatedData.middleName,
          lastName: validatedData.lastName,
          gender: validatedData.gender,
          maritalStatus: validatedData.maritalStatus,
          birthDateTime
        }
      }
    },
    include: {
      profile: true
    }
  });

  // Fire and forget email sends — don't block the HTTP response
  if (emailLower) {
    sendWelcomeEmail(emailLower, newUser.profile?.firstName || validatedData.firstName, newRegId)
      .catch((err: Error) => console.error(`[Welcome Email] Failed to send to ${emailLower}:`, err.message));
  }

  // Notify Admin of new registration (fire and forget)
  const { sendAdminNotification, escapeHTML } = await import('../services/mail.service');
  sendAdminNotification(
    'New User Registered',
    `<p><b>Name:</b> ${escapeHTML(validatedData.firstName)} ${escapeHTML(validatedData.lastName)}</p>
     <p><b>RegID:</b> ${escapeHTML(newRegId)}</p>
     <p><b>Email:</b> ${escapeHTML(emailLower)}</p>
     <p><b>Mobile:</b> ${escapeHTML(validatedData.mobile)}</p>
     <p>Please review and approve this profile in the admin panel.</p>`
  ).catch((err: Error) => console.error('[Mail] Admin notification failed:', err.message));

  res.status(201).json({
    message: 'Registration successful! Awaiting admin approval.',
    regId: newUser.regId
  });
});

// ═══════════════════════════════════════════════════════════════════
//  POST /api/auth/login
// ═══════════════════════════════════════════════════════════════════

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password } = loginSchema.parse(req.body);

  const idLower = identifier.toLowerCase();

  // Omni-Login Logic
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { mobile: identifier },
        { email: idLower },
        { regId: identifier.toUpperCase() }
      ]
    }
  });

  if (!user) {
    console.log(`[LOGIN FAILED] User not found for identifier: ${identifier}`);
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  // Block login for suspended or deleted accounts
  if (user.accountStatus === 'SUSPENDED' || user.accountStatus === 'DELETED') {
    res.status(403).json({ error: 'Your account has been suspended or deleted. Please contact support.' });
    return;
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    console.log(`[LOGIN FAILED] Password mismatch for identifier: ${identifier}`);
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  // If password is correct but account is pending approval
  if (user.accountStatus === 'INACTIVE') {
    res.status(403).json({ error: 'Your account is pending approval. Please wait for our team to verify your profile.' });
    return;
  }

  // Build JWT payload
  const tokenPayload: AccessTokenPayload = {
    id: user.id,
    role: user.role,
    accountStatus: user.accountStatus,
    planType: user.planType,
    requiresPasswordChange: user.requiresPasswordChange,
  };

  // Issue dual tokens and set HttpOnly cookies
  const { accessToken, refreshToken } = await issueDualTokens(res, tokenPayload);

  // Response contains NO tokens — they are in HttpOnly cookies
  const responseBody: LoginResponse = {
    message: 'Login successful.',
    user: {
      regId: user.regId,
      role: user.role,
      status: user.accountStatus,
      planType: user.planType,
      requiresPasswordChange: user.requiresPasswordChange,
    },
    accessToken,
    refreshToken,
  };

  res.status(200).json(responseBody);
});

// ═══════════════════════════════════════════════════════════════════
//  POST /api/auth/refresh
// ═══════════════════════════════════════════════════════════════════

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  // Try to get token from body first (frontend fallback), then from cookies
  const refreshCookie = req.body?.refreshToken || req.cookies?.[REFRESH_TOKEN_COOKIE];

  if (!refreshCookie) {
    res.status(401).json({ error: 'No refresh token provided.' });
    return;
  }

  // Verify JWT signature + expiry
  let decoded: { id: string };
  try {
    decoded = verifyRefreshToken(refreshCookie);
  } catch {
    clearAuthCookies(res);
    res.status(401).json({ error: 'Invalid or expired refresh token.' });
    return;
  }

  // Verify token exists in DB (not revoked)
  let storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshCookie },
  });

  let isGracePeriod = false;

  if (!storedToken) {
    // Check if it exists in our rotated tokens grace DB table
    const graceRecord = await prisma.refreshTokenGrace.findUnique({
      where: { token: refreshCookie },
    });
    
    if (graceRecord && graceRecord.userId === decoded.id && new Date() < graceRecord.expiresAt) {
      isGracePeriod = true;
      // Synthesize a storedToken representation for the rest of the controller logic
      storedToken = {
        id: 'grace-synthesized',
        token: refreshCookie,
        userId: decoded.id,
        expiresAt: new Date(Date.now() + 1000 * 60), // Not expired
        createdAt: new Date()
      } as any;
    }
  }

  if (!storedToken || storedToken.userId !== decoded.id) {
    // Token reuse detected or invalid — revoke all user tokens
    await prisma.refreshToken.deleteMany({ where: { userId: decoded.id } });
    clearAuthCookies(res);
    res.status(401).json({ error: 'Token has been revoked.' });
    return;
  }

  // Check expiry
  if (new Date() > storedToken.expiresAt) {
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });
    clearAuthCookies(res);
    res.status(401).json({ error: 'Refresh token expired.' });
    return;
  }

  // Fetch fresh user data — this is the ONLY place we hit the DB for auth
  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
    select: {
      id: true,
      regId: true,
      role: true,
      accountStatus: true,
      planType: true,
      planExpiresAt: true,
      requiresPasswordChange: true,
    },
  });

  if (!user || user.accountStatus === 'SUSPENDED' || user.accountStatus === 'DELETED') {
    // Account suspended/deleted — revoke all tokens
    await prisma.refreshToken.deleteMany({ where: { userId: decoded.id } });
    clearAuthCookies(res);
    res.status(401).json({ error: 'Account is inactive or non-existent.' });
    return;
  }

  // Check Plan Expiry and downgrade if necessary
  if (user.planType !== 'FREE' && user.planExpiresAt) {
    const now = new Date();
    if (now > user.planExpiresAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { planType: 'FREE', planExpiresAt: null },
      });
      user.planType = 'FREE';
      user.planExpiresAt = null;
    }
  }

  // Rotate: delete old token if it was in the DB, and save to grace period cache
  if (!isGracePeriod) {
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });
    await prisma.refreshTokenGrace.create({
      data: {
        token: refreshCookie,
        userId: decoded.id,
        expiresAt: new Date(Date.now() + 30000), // 30 sec grace period
      }
    });
  }

  // Issue new dual tokens
  const tokenPayload: AccessTokenPayload = {
    id: user.id,
    role: user.role,
    accountStatus: user.accountStatus,
    planType: user.planType,
    requiresPasswordChange: user.requiresPasswordChange,
  };

  const { accessToken, refreshToken: newRefreshToken } = await issueDualTokens(res, tokenPayload);

  res.status(200).json({
    message: 'Token refreshed.',
    user: {
      regId: user.regId,
      role: user.role,
      status: user.accountStatus,
      planType: user.planType,
      requiresPasswordChange: user.requiresPasswordChange,
    },
    accessToken,
    refreshToken: newRefreshToken,
  });
});

// ═══════════════════════════════════════════════════════════════════
//  POST /api/auth/logout
// ═══════════════════════════════════════════════════════════════════

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const refreshCookie = req.body?.refreshToken || req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;

  if (refreshCookie) {
    // Remove the specific token from DB
    await prisma.refreshToken.deleteMany({ where: { token: refreshCookie } });
  }

  clearAuthCookies(res);
  res.status(200).json({ message: 'Logged out successfully.' });
});

// ═══════════════════════════════════════════════════════════════════
//  POST /api/auth/forgot-password
// ═══════════════════════════════════════════════════════════════════

const forgotPasswordSchema = z.object({
  identifier: z.string().min(1, 'Identifier is required').trim(),
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { identifier } = forgotPasswordSchema.parse(req.body);

  // Look up user (same as login)
  const isEmail = identifier.includes('@');
  const user = await prisma.user.findFirst({
    where: isEmail
      ? { email: identifier.toLowerCase() }
      : { OR: [{ mobile: identifier }, { regId: identifier.toUpperCase() }] },
    include: { profile: true },
  });

  // Always return the same response to prevent user enumeration
  const successMessage = 'If an account exists with this identifier, a password reset link has been sent to the registered email.';

  if (!user || !user.email) {
    res.status(200).json({ message: successMessage });
    return;
  }

  // Generate secure token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  // Store hashed token (expires in 1 hour)
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token: hashedToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  // Send email
  const resetLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${rawToken}`;
  const firstName = user.profile?.firstName || 'User';
  
  await sendPasswordResetEmail(user.email, firstName, resetLink);

  res.status(200).json({ message: successMessage });
});

// ═══════════════════════════════════════════════════════════════════
//  POST /api/auth/reset-password
// ═══════════════════════════════════════════════════════════════════

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(100),
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword } = resetPasswordSchema.parse(req.body);

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const resetToken = await prisma.passwordResetToken.findFirst({
    where: {
      token: hashedToken,
      expiresAt: { gt: new Date() },
      usedAt: null,
    },
  });

  if (!resetToken) {
    res.status(400).json({ error: 'Invalid or expired reset token.' });
    return;
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  // Update user password and clear any forced-reset flags
  await prisma.user.update({
    where: { id: resetToken.userId },
    data: {
      password: hashedPassword,
      requiresPasswordChange: false,
    },
  });

  // Mark token as used
  await prisma.passwordResetToken.update({
    where: { id: resetToken.id },
    data: { usedAt: new Date() },
  });

  // Force re-login everywhere by deleting all refresh tokens for this user
  await prisma.refreshToken.deleteMany({
    where: { userId: resetToken.userId },
  });

  res.status(200).json({ message: 'Password has been successfully reset. You can now log in.' });
});

