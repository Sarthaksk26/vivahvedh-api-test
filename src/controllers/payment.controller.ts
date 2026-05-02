import { Request, Response } from 'express';
import prisma from '../config/db';
import { sendPaymentStatusEmail } from '../services/mail.service';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';

const verifyPaymentSchema = z.object({
  planType: z.enum(['SILVER', 'GOLD']),
  amount: z.string().or(z.number()).transform(val => parseFloat(String(val))),
  transactionId: z.string().min(5).max(100).trim(),
}).strict();

export const verifyPayment = asyncHandler(async (req: Request, res: Response) => {
  const { planType, amount, transactionId } = verifyPaymentSchema.parse(req.body);
  const userId = req.user.id;
  const file = req.file;

  const expectedAmount = planType === 'GOLD' ? 5000 : 2000;
  if (amount !== expectedAmount) {
    res.status(400).json({ error: `Amount must be ₹${expectedAmount} for the ${planType} plan.` });
    return;
  }

  if (!file) {
    res.status(400).json({ error: 'Payment screenshot is required.' });
    return;
  }

  const existingPayment = await prisma.pendingPayment.findFirst({
    where: { userId, transactionId },
  });

  if (existingPayment) {
    res.status(400).json({ error: 'This transaction ID has already been submitted.' });
    return;
  }

  const pendingPayment = await prisma.pendingPayment.create({
    data: {
      userId,
      planType,
      amount,
      transactionId,
      screenshotUrl: file.path,
      status: 'PENDING',
    },
    include: {
      user: { select: { regId: true, mobile: true } }
    }
  });

  const { sendAdminNotification } = await import('../services/mail.service');
  sendAdminNotification(
    'New Payment Submitted',
    `<p>A new payment proof has been submitted for verification.</p>
     <p><b>Member ID:</b> ${pendingPayment.user.regId}</p>
     <p><b>Plan:</b> ${planType}</p>
     <p><b>Amount:</b> ₹${amount}</p>
     <p><b>TXN ID:</b> ${transactionId}</p>`
  ).catch((err: Error) => console.error('[Mail] Admin payment notification failed:', err.message));

  res.status(201).json({
    message: 'Payment submitted successfully. Please wait for admin verification.',
    paymentId: pendingPayment.id
  });
});

export const getPendingPayments = asyncHandler(async (req: Request, res: Response) => {
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
});

const updatePaymentStatusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
}).strict();

export const updatePaymentStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { status } = updatePaymentStatusSchema.parse(req.body);

  const payment = await prisma.pendingPayment.findUnique({
    where: { id },
    include: { user: { select: { email: true, profile: { select: { firstName: true } } } } }
  });

  if (!payment) {
    res.status(404).json({ error: 'Payment record not found.' });
    return;
  }

  if (payment.status !== 'PENDING') {
    res.status(409).json({ error: `Payment is already ${payment.status.toLowerCase()}.` });
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (status === 'APPROVED') {
      const durationMonths = payment.planType === 'GOLD' ? 12 : payment.planType === 'SILVER' ? 6 : 0;
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

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

  if (payment.user?.email) {
    sendPaymentStatusEmail(
      payment.user.email,
      payment.user.profile?.firstName || 'User',
      payment.planType,
      status
    ).catch((err: Error) => console.error('[Mail] Payment status email failed:', err.message));
  }

  res.json({ message: `Payment ${status.toLowerCase()} successfully.` });
});
