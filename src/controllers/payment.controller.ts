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

    if (!['SILVER', 'GOLD'].includes(planType)) {
      return res.status(400).json({ error: 'Invalid plan type for payment.' });
    }

    const expectedAmount = planType === 'GOLD' ? 5000 : 2000;
    if (parseFloat(amount) !== expectedAmount) {
      return res.status(400).json({ error: `Amount must be ₹${expectedAmount} for the ${planType} plan.` });
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
      include: {
        user: { select: { regId: true, mobile: true } }
      }
    });

    // Notify Admin
    const { sendAdminNotification } = await import('../services/mail.service');
    sendAdminNotification(
      'New Payment Submitted',
      `<p>A new payment proof has been submitted for verification.</p>
       <p><b>Member ID:</b> ${pendingPayment.user.regId}</p>
       <p><b>Plan:</b> ${planType}</p>
       <p><b>Amount:</b> ₹${amount}</p>
       <p><b>TXN ID:</b> ${transactionId}</p>`
    ).catch(() => {});

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
    const statusFilter = req.query.status as string | undefined;
    const where: any = {};
    if (statusFilter && ['PENDING','APPROVED','REJECTED'].includes(statusFilter)) {
      where.status = statusFilter;
    }
    const payments = await prisma.pendingPayment.findMany({
      where,
      include: { user: { select: { mobile: true, email: true, regId: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payments.' });
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

    if (payment.status !== 'PENDING') {
      return res.status(409).json({ error: `Payment is already ${payment.status.toLowerCase()}.` });
    }

    await prisma.$transaction(async (tx) => {
      if (status === 'APPROVED') {
        // Calculate expiration date
        const durationMonths = payment.planType === 'GOLD' ? 12 : payment.planType === 'SILVER' ? 6 : 0;
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

        // Update user plan atomically with payment status update.
        await tx.user.update({
          where: { id: payment.userId },
          data: {
            planType: payment.planType,
            paymentDone: true,
            planExpiresAt: expiresAt,
            lastPaidOn: new Date(),
          },
        });
      }

      await tx.pendingPayment.update({
        where: { id },
        data: { status },
      });
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
