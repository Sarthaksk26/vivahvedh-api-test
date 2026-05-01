import { Request, Response } from 'express';
import prisma from '../config/db';
import { sendConnectionRequestEmail, sendConnectionAcceptedEmail } from '../services/mail.service';

// 1. Send an Interest Request to another user
export const sendInterest = async (req: Request, res: Response) => {
  try {
    const senderId = req.user.id;
    const { receiverId } = req.body;

    // Security Check: Verify CURRENT account status from DB (not stale JWT)
    const currentUser = await prisma.user.findUnique({
      where: { id: senderId },
      select: { accountStatus: true, planType: true }
    });

    if (!currentUser || currentUser.accountStatus !== 'ACTIVE') {
      res.status(403).json({ error: "Your account is currently pending approval. You cannot send match proposals yet." });
      return;
    }

    // Plan Check: Only SILVER and GOLD users can send proposals
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

    // Check if request already exists in either direction
    const existing = await prisma.request.findFirst({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId } // Reciprocal
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

    // Trigger Email to Receiver safely
    const senderData = await prisma.user.findUnique({
      where: { id: senderId },
      include: { profile: true }
    });

    if (receiverData?.email && senderData?.profile) {
      // Async mail dispatch
      sendConnectionRequestEmail(
        receiverData.email, 
        receiverData.profile?.firstName || 'Member', 
        `${senderData.profile?.firstName} ${senderData.profile?.lastName}`
      );

      // Notify Admin
      const { sendAdminNotification } = await import('../services/mail.service');
      sendAdminNotification(
        'New Match Proposal Sent',
        `<p><b>Sender:</b> ${senderData.profile?.firstName} ${senderData.profile?.lastName} (${senderData.regId})</p>
         <p><b>Receiver:</b> ${receiverData.profile?.firstName} ${receiverData.profile?.lastName} (${receiverData.regId})</p>`
      ).catch(() => {});
    }

    res.status(200).json({ message: "Interest expressed successfully!", request: newRequest });
  } catch (error) {
    console.error("Express Interest Error:", error);
    res.status(500).json({ error: "Failed to send request." });
  }
};

// 2. Accept a Pending Interest Request
export const acceptInterest = async (req: Request, res: Response) => {
  try {
    const receiverId = req.user.id;
    const { requestId } = req.body;

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

    // Trigger Acceptance Email to Original Sender
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
      );

      // Notify Admin
      const { sendAdminNotification } = await import('../services/mail.service');
      sendAdminNotification(
        'Match Proposal Accepted',
        `<p><b>Accepter:</b> ${receiverData.profile?.firstName} ${receiverData.profile?.lastName} (${receiverData.regId})</p>
         <p><b>Original Sender:</b> ${senderData.profile?.firstName} ${senderData.profile?.lastName} (${senderData.regId})</p>`
      ).catch(() => {});
    }

    res.status(200).json({ message: "Request accepted! You are now connected.", request: updatedRequest });
  } catch (error) {
    res.status(500).json({ error: "Failed to accept request." });
  }
};

// 3. Reject a Pending Request
export const rejectInterest = async (req: Request, res: Response) => {
  try {
    const receiverId = req.user.id;
    const { requestId } = req.body;

    const request = await prisma.request.findUnique({ where: { id: requestId } });
    
    const updateResult = await prisma.request.updateMany({
      where: { id: requestId, receiverId, status: 'PENDING' },
      data: { status: 'REJECTED' }
    });

    if (updateResult.count === 0) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    // Notify Admin of rejection
    if (request) {
      const { sendAdminNotification } = await import('../services/mail.service');
      sendAdminNotification(
        'Match Proposal Declined',
        `<p>Connection ID: ${requestId} was declined by the receiver.</p>`
      ).catch(() => {});
    }

    res.status(200).json({ message: "Request rejected." });
  } catch (error) {
    res.status(500).json({ error: "Failed to reject." });
  }
};

// 4. Fetch My Dashboard Connections (Incoming & Outgoing logic)
export const getMyConnections = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    // Everything sent to me (Incoming)
    const incoming = await prisma.request.findMany({
      where: { receiverId: userId },
      include: {
        sender: {
          include: { profile: true, images: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Everything I sent (Outgoing)
    const outgoing = await prisma.request.findMany({
      where: { senderId: userId },
      include: {
        receiver: {
          include: { profile: true, images: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ incoming, outgoing });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch connections." });
  }
};

// 5. Withdraw a Pending Request
export const withdrawInterest = async (req: Request, res: Response) => {
  try {
    const senderId = req.user.id;
    const { requestId } = req.body;

    const result = await prisma.request.deleteMany({
      where: {
        id: requestId,
        senderId,        // only the original sender can withdraw
        status: 'PENDING' // can only withdraw pending requests
      }
    });

    if (result.count === 0) {
      res.status(404).json({ error: 'Request not found, not yours, or already actioned.' });
      return;
    }

    res.status(200).json({ message: 'Match proposal withdrawn successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to withdraw request.' });
  }
};

