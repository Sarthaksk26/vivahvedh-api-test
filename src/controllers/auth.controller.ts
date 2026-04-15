import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { z } from 'zod/v4';
import { sendWelcomeEmail } from '../services/mail.service';

// Zod Schema for strict validation
const registerSchema = z.object({
  mobile: z.string().min(10).max(15),
  password: z.string().min(6),
  firstName: z.string(),
  lastName: z.string(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  maritalStatus: z.enum(['UNMARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED']),
  email: z.string().email()
});

export const register = async (req: Request, res: Response) => {
  try {
    const validatedData = registerSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { mobile: validatedData.mobile }
    });

    if (existingUser) {
      res.status(400).json({ error: 'User with this mobile number already exists.' });
      return;
    }

    // Generate extremely fast hash
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);
    
    // Auto-generate a beautiful distinct RegID (e.g. VV-123456)
    const newRegId = `VV-${Math.floor(100000 + Math.random() * 900000)}`;

    // Create User & Profile inside a Prisma Transaction for safety
    const newUser = await prisma.user.create({
      data: {
        regId: newRegId,
        mobile: validatedData.mobile,
        email: validatedData.email,
        password: hashedPassword,
        accountStatus: 'INACTIVE', // Safe default workflow
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
        profile: true // Return the profile data we just created
      }
    });

    if (validatedData.email) {
      sendWelcomeEmail(validatedData.email, validatedData.firstName);
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

    // Omni-Login Logic
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { mobile: identifier },
          { email: identifier },
          { regId: identifier }
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

    // Generate JWT specific to the user
    const token = jwt.sign(
      { id: user.id, role: user.role, accountStatus: user.accountStatus, planType: user.planType },
      process.env.JWT_SECRET || 'vivahvedh_super_secret_jwt_key_2026',
      { expiresIn: '7d' }
    );

    res.status(200).json({
      token,
      user: {
        regId: user.regId,
        role: user.role,
        status: user.accountStatus,
        planType: user.planType
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
