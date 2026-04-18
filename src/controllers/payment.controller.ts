import { Request, Response } from 'express';
import prisma from '../config/db';
import { sendPaymentStatusEmail } from '../services/mail.service';

export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { planType, amount, transactionId } = req.body;
    const file = (req as any).file;

    if (!planType || !amount || !transactionId) {
      return res.status(400).json({ error: 'Missing required payment details.' });
    }

    if (!file) {
      return res.status(400).json({ error: 'Payment screenshot is required.' });
    }

    // Prevent duplicate transaction IDs for the same user
    const existingPayment = await prisma.pendingPayment.findFirst({
      where: {
        userId,
        transactionId,
      },
    });

    if (existingPayment) {
      return res.status(400).json({ error: 'This transaction ID has already been submitted.' });
    }

    const pendingPayment = await prisma.pendingPayment.create({
      data: {
        userId,
        planType,
        amount: parseFloat(amount),
        transactionId,
        screenshotUrl: `/uploads/${file.filename}`,
        status: 'PENDING',
      },
    });

    res.status(201).json({
      message: 'Payment submitted successfully. Please wait for admin verification.',
      paymentId: pendingPayment.id
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Internal server error while processing payment.' });
  }
};

export const getPendingPayments = async (req: Request, res: Response) => {
  try {
    const payments = await prisma.pendingPayment.findMany({
      where: { status: 'PENDING' },
      include: { user: { select: { mobile: true, email: true, regId: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending payments.' });
  }
};

export const updatePaymentStatus = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body; // 'APPROVED' or 'REJECTED'

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be APPROVED or REJECTED.' });
    }

    const payment = await prisma.pendingPayment.findUnique({
      where: { id },
      include: { user: { select: { email: true, profile: { select: { firstName: true } } } } }
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found.' });
    }

    if (status === 'APPROVED') {
      // Calculate expiration date
      const durationMonths = payment.planType === 'GOLD' ? 12 : payment.planType === 'SILVER' ? 6 : 0;
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

      // Update User Plan
      await prisma.user.update({
        where: { id: payment.userId },
        data: {
          planType: payment.planType,
          paymentDone: true,
          planExpiresAt: expiresAt,
          lastPaidOn: new Date(),
        },
      });
    }

    await prisma.pendingPayment.update({
      where: { id },
      data: { status },
    });

    // Notify User
    if (payment.user?.email) {
      sendPaymentStatusEmail(
        payment.user.email,
        payment.user.profile?.firstName || 'User',
        payment.planType,
        status as any
      ).catch(e => console.error("Notification Error:", e));
    }

    res.json({ message: `Payment ${status.toLowerCase()} successfully.` });
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({ error: 'Internal server error while updating payment.' });
  }
};
