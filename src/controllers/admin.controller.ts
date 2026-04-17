import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../config/db';
import { z } from 'zod';
import { sendApprovalEmail, sendOfflineCredentialsEmail } from '../services/mail.service';

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
    const allUsers = await prisma.user.findMany({
      where: { accountStatus: { in: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] } },
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
      sendApprovalEmail(updatedUser.email, updatedUser.profile.firstName);
    }

    res.status(200).json({ message: 'User approved successfully', user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve user' });
  }
};

export const banUser = async (req: Request, res: Response) => {
  try {
    const { targetUserId } = req.body;
    await prisma.user.update({
      where: { id: targetUserId },
      data: { accountStatus: 'SUSPENDED' }
    });
    res.status(200).json({ message: 'User suspended.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to suspend user' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
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

    // Check for existing mobile
    const existingMobile = await prisma.user.findUnique({ where: { mobile: validatedData.mobile } });
    if (existingMobile) {
      res.status(400).json({ error: 'A user with this mobile number already exists.' });
      return;
    }

    // Check for existing email
    const existingEmail = await prisma.user.findUnique({ where: { email: validatedData.email } });
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
        email: validatedData.email,
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
      validatedData.email,
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
