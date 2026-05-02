import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../config/db';
import { z } from 'zod';
import { sendWelcomeEmail } from '../services/mail.service';
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

// Zod Schema for strict validation
const registerSchema = z.object({
  mobile: z.string().min(10).max(15).regex(/^[0-9]+$/, 'Mobile must contain only digits'),
  password: z.string().min(8).max(100),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  maritalStatus: z.enum(['UNMARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED']),
  email: z.string().email().max(254).toLowerCase(),
  birthDate: z.string().refine((val) => {
    const dob = new Date(`${val.slice(0, 10)}T12:00:00Z`);
    if (isNaN(dob.getTime())) return false;
    const age = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return age >= 18;
  }, { message: 'Date of Birth is required and must be at least 18 years old.' }),
  profileCreatedBy: z.enum(PROFILE_CREATED_BY_OPTIONS).optional()
}).strict();

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
): Promise<void> {
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
      profile: {
        create: {
          firstName: validatedData.firstName,
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

  // Fire and forget with visible error logging — but now AWAITED to ensure connection stability
  if (emailLower) {
    try {
      await sendWelcomeEmail(emailLower, newUser.profile?.firstName || validatedData.firstName, newRegId);
    } catch (err: any) {
      console.error(`[Welcome Email] Failed to send to ${emailLower}:`, err.message);
    }
  }

  // Notify Admin of new registration
  try {
    const { sendAdminNotification } = await import('../services/mail.service');
    await sendAdminNotification(
      'New User Registered',
      `<p><b>Name:</b> ${validatedData.firstName} ${validatedData.lastName}</p>
       <p><b>RegID:</b> ${newRegId}</p>
       <p><b>Email:</b> ${emailLower}</p>
       <p><b>Mobile:</b> ${validatedData.mobile}</p>
       <p>Please review and approve this profile in the admin panel.</p>`
    );
  } catch (e: any) {
    console.error("Admin Notify Error:", e.message);
  }

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
    res.status(401).json({ error: 'Invalid credentials.' });
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
  await issueDualTokens(res, tokenPayload);

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
  };

  res.status(200).json(responseBody);
});

// ═══════════════════════════════════════════════════════════════════
//  POST /api/auth/refresh
// ═══════════════════════════════════════════════════════════════════

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const refreshCookie = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;

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
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshCookie },
  });

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

  // Rotate: delete old token
  await prisma.refreshToken.delete({ where: { id: storedToken.id } });

  // Issue new dual tokens
  const tokenPayload: AccessTokenPayload = {
    id: user.id,
    role: user.role,
    accountStatus: user.accountStatus,
    planType: user.planType,
    requiresPasswordChange: user.requiresPasswordChange,
  };

  await issueDualTokens(res, tokenPayload);

  res.status(200).json({
    message: 'Tokens refreshed.',
    user: {
      regId: user.regId,
      role: user.role,
      status: user.accountStatus,
      planType: user.planType,
      requiresPasswordChange: user.requiresPasswordChange,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════
//  POST /api/auth/logout
// ═══════════════════════════════════════════════════════════════════

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const refreshCookie = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;

  if (refreshCookie) {
    // Remove the specific token from DB
    await prisma.refreshToken.deleteMany({ where: { token: refreshCookie } });
  }

  clearAuthCookies(res);
  res.status(200).json({ message: 'Logged out successfully.' });
});
