import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { z } from 'zod';
import { getJwtSecret } from '../config/env';
import { sendWelcomeEmail } from '../services/mail.service';
import { asyncHandler } from '../utils/asyncHandler';

const PROFILE_CREATED_BY_OPTIONS = ['Self', 'Father', 'Mother', 'Sibling', 'Relative', 'Friend', 'Marriage Bureau'] as const;

// Zod Schema for strict validation
const registerSchema = z.object({
  mobile: z.string().min(10).max(15),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  maritalStatus: z.enum(['UNMARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED']),
  email: z.string().email(),
  birthDate: z.string().refine((val) => {
    const dob = new Date(`${val.slice(0, 10)}T12:00:00Z`);
    if (isNaN(dob.getTime())) return false;
    const age = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return age >= 18;
  }, { message: 'Date of Birth is required and must be at least 18 years old.' }),
  profileCreatedBy: z.enum(PROFILE_CREATED_BY_OPTIONS).optional()
});

/**
 * Generate a collision-safe RegID with retry logic.
 * Attempts up to 5 times before throwing.
 */
async function generateUniqueRegId(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const regId = `VV-${Math.floor(100000 + Math.random() * 900000)}`;
    const existing = await prisma.user.findUnique({ where: { regId } });
    if (!existing) return regId;
  }
  throw new Error('Failed to generate a unique RegID after 5 attempts.');
}

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

  // Fire and forget with visible error logging
  if (emailLower) {
    sendWelcomeEmail(emailLower, validatedData.firstName, newRegId)
      .catch(err => console.error(`[Welcome Email] Failed to send to ${emailLower}:`, err.message));
  }

  // Notify Admin of new registration
  const { sendAdminNotification } = await import('../services/mail.service');
  sendAdminNotification(
    'New User Registered',
    `<p><b>Name:</b> ${validatedData.firstName} ${validatedData.lastName}</p>
     <p><b>RegID:</b> ${newRegId}</p>
     <p><b>Email:</b> ${emailLower}</p>
     <p><b>Mobile:</b> ${validatedData.mobile}</p>
     <p>Please review and approve this profile in the admin panel.</p>`
  ).catch(e => console.error("Admin Notify Error:", e));

  res.status(201).json({
    message: 'Registration successful! Awaiting admin approval.',
    regId: newUser.regId
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    res.status(400).json({ error: 'Provide username (Email, Mobile, or RegID) and password' });
    return;
  }

  const idLower = identifier.trim().toLowerCase();

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

  // Generate JWT — includes requiresPasswordChange so frontend can redirect
  const token = jwt.sign(
    {
      id: user.id,
      role: user.role,
      accountStatus: user.accountStatus,
      planType: user.planType,
      requiresPasswordChange: user.requiresPasswordChange
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );

  res.status(200).json({
    token,
    user: {
      regId: user.regId,
      role: user.role,
      status: user.accountStatus,
      planType: user.planType,
      requiresPasswordChange: user.requiresPasswordChange
    }
  });
});
