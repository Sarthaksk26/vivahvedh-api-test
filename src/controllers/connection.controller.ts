import { Request, Response } from 'express';
import prisma from '../config/db';
import { sendConnectionRequestEmail, sendConnectionAcceptedEmail } from '../services/mail.service';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';

// 1. Send an Interest Request to another user
const sendInterestSchema = z.object({
  receiverId: z.string().uuid().or(z.string().cuid()).or(z.string().min(1)),
}).strict();

export const sendInterest = asyncHandler(async (req: Request, res: Response) => {
  const { receiverId } = sendInterestSchema.parse(req.body);
  const senderId = req.user.id;

  const currentUser = await prisma.user.findUnique({
    where: { id: senderId },
    select: { accountStatus: true, planType: true, regId: true }
  });

  if (!currentUser || currentUser.accountStatus !== 'ACTIVE') {
    res.status(403).json({ error: "Your account is currently pending approval. You cannot send match proposals yet." });
    return;
  }

  if (currentUser.planType === 'FREE') {
    res.status(403).json({ 
      error: "Upgrade to Silver or Gold plan to send match proposals.",
      code: "PLAN_UPGRADE_REQUIRED"
    });
    return;
  }

  if (senderId === receiverId) {
    res.status(400).json({ error: "You cannot send an interest to yourself." });
    return;
  }

  const existing = await prisma.request.findFirst({
    where: {
      OR: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId }
      ]
    }
  });

  if (existing) {
    res.status(400).json({ error: "A connection history already exists with this user." });
    return;
  }

  const receiverData = await prisma.user.findUnique({
    where: { id: receiverId },
    include: { profile: true }
  });

  if (!receiverData || receiverData.role !== 'USER' || receiverData.accountStatus !== 'ACTIVE') {
    res.status(404).json({ error: 'Target user is unavailable.' });
    return;
  }

  const newRequest = await prisma.request.create({
    data: {
      senderId,
      receiverId,
      status: 'PENDING'
    }
  });

  const senderData = await prisma.user.findUnique({
    where: { id: senderId },
    include: { profile: true }
  });

  if (receiverData?.email && senderData?.profile) {
    sendConnectionRequestEmail(
      receiverData.email, 
      receiverData.profile?.firstName || 'Member', 
      `${senderData.profile?.firstName} ${senderData.profile?.lastName}`
    ).catch((err: Error) => console.error('[Mail] Interest email failed:', err.message));

    const { sendAdminNotification } = await import('../services/mail.service');
    sendAdminNotification(
      'New Match Proposal Sent',
      `<p><b>Sender:</b> ${senderData.profile?.firstName} ${senderData.profile?.lastName} (${senderData.regId})</p>
       <p><b>Receiver:</b> ${receiverData.profile?.firstName} ${receiverData.profile?.lastName} (${receiverData.regId})</p>`
    ).catch((err: Error) => console.error('[Mail] Admin interest notification failed:', err.message));
  }

  res.status(200).json({ message: "Interest expressed successfully!", request: newRequest });
});

const acceptInterestSchema = z.object({
  requestId: z.string().min(1),
}).strict();

export const acceptInterest = asyncHandler(async (req: Request, res: Response) => {
  const { requestId } = acceptInterestSchema.parse(req.body);
  const receiverId = req.user.id;

  const request = await prisma.request.findUnique({ where: { id: requestId } });
  if (!request || request.receiverId !== receiverId) {
    res.status(403).json({ error: "Invalid request." });
    return;
  }

  if (request.status !== 'PENDING') {
    res.status(409).json({ error: `Request is already ${request.status.toLowerCase()}.` });
    return;
  }

  const updatedRequest = await prisma.request.update({
    where: { id: requestId },
    data: { status: 'ACCEPTED' }
  });

  const senderData = await prisma.user.findUnique({
    where: { id: request.senderId },
    include: { profile: true }
  });
  const receiverData = await prisma.user.findUnique({
    where: { id: receiverId },
    include: { profile: true }
  });

  if (senderData?.email && receiverData?.profile) {
    sendConnectionAcceptedEmail(
      senderData.email,
      senderData.profile?.firstName || 'Member',
      `${receiverData.profile?.firstName} ${receiverData.profile?.lastName}`
    ).catch((err: Error) => console.error('[Mail] Accept email failed:', err.message));

    const { sendAdminNotification } = await import('../services/mail.service');
    sendAdminNotification(
      'Match Proposal Accepted',
      `<p><b>Accepter:</b> ${receiverData.profile?.firstName} ${receiverData.profile?.lastName} (${receiverData.regId})</p>
       <p><b>Original Sender:</b> ${senderData.profile?.firstName} ${senderData.profile?.lastName} (${senderData.regId})</p>`
    ).catch((err: Error) => console.error('[Mail] Admin accept notification failed:', err.message));
  }

  res.status(200).json({ message: "Request accepted! You are now connected.", request: updatedRequest });
});

export const rejectInterest = asyncHandler(async (req: Request, res: Response) => {
  const { requestId } = acceptInterestSchema.parse(req.body); // reuse same schema
  const receiverId = req.user.id;

  const request = await prisma.request.findUnique({ where: { id: requestId } });
  
  const updateResult = await prisma.request.updateMany({
    where: { id: requestId, receiverId, status: 'PENDING' },
    data: { status: 'REJECTED' }
  });

  if (updateResult.count === 0) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  if (request) {
    const { sendAdminNotification } = await import('../services/mail.service');
    sendAdminNotification(
      'Match Proposal Declined',
      `<p>Connection ID: ${requestId} was declined by the receiver.</p>`
    ).catch(() => {});
  }

  res.status(200).json({ message: "Request rejected." });
});

export const getMyConnections = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;

  const [incoming, outgoing] = await Promise.all([
    prisma.request.findMany({
      where: { receiverId: userId },
      include: { sender: { include: { profile: true, images: { where: { isPrimary: true }, take: 1 } } } },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.request.findMany({
      where: { senderId: userId },
      include: { receiver: { include: { profile: true, images: { where: { isPrimary: true }, take: 1 } } } },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  res.status(200).json({ incoming, outgoing });
});

export const withdrawInterest = asyncHandler(async (req: Request, res: Response) => {
  const { requestId } = acceptInterestSchema.parse(req.body);
  const senderId = req.user.id;

  const result = await prisma.request.deleteMany({
    where: {
      id: requestId,
      senderId,
      status: 'PENDING'
    }
  });

  if (result.count === 0) {
    res.status(404).json({ error: 'Request not found, not yours, or already actioned.' });
    return;
  }

  res.status(200).json({ message: 'Match proposal withdrawn successfully.' });
});

export const getStatusBetweenUsers = asyncHandler(async (req: Request, res: Response) => {
  const currentUserId = req.user.id;
  const targetUserId = req.params.id as string;

  if (currentUserId === targetUserId) {
    res.status(200).json({ status: 'SELF' });
    return;
  }

  const request = await prisma.request.findFirst({
    where: {
      OR: [
        { senderId: currentUserId, receiverId: targetUserId },
        { senderId: targetUserId, receiverId: currentUserId }
      ]
    }
  });

  if (!request) {
    res.status(200).json({ status: 'NONE' });
    return;
  }

  let displayStatus = request.status as string;
  if (request.status === 'PENDING') {
    displayStatus = request.senderId === currentUserId ? 'PENDING_SENT' : 'PENDING_RECEIVED';
  }

  res.status(200).json({ 
    status: displayStatus,
    requestId: request.id
  });
});

