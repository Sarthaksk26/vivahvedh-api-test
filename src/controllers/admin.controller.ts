import { Request, Response } from 'express';
import prisma from '../config/db';
import { sendApprovalEmail } from '../services/mail.service';

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
      where: { accountStatus: { in: ['ACTIVE', 'INACTIVE'] } },
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
      data: { accountStatus: 'INACTIVE' }
    });
    res.status(200).json({ message: 'User frozen/banned.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to ban user' });
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
