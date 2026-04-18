import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { z } from 'zod';
import { getJwtSecret } from '../config/env';
import { sendWelcomeEmail } from '../services/mail.service';

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

export const register = async (req: Request, res: Response) => {
  try {
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
            maritalStatus: validatedData.maritalStatus
          }
        }
      },
      include: {
        profile: true
      }
    });

    if (emailLower) {
      sendWelcomeEmail(emailLower, validatedData.firstName, newRegId);
    }

    res.status(201).json({
      message: 'Registration successful! Awaiting admin approval.',
      regId: newUser.regId
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
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

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
