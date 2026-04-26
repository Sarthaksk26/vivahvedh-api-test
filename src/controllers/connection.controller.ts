import { Request, Response } from 'express';
import prisma from '../config/db';
import { sendConnectionRequestEmail, sendConnectionAcceptedEmail } from '../services/mail.service';

// 1. Send an Interest Request to another user
export const sendInterest = async (req: Request, res: Response) => {
  try {
    const senderId = req.user.id;
    const { receiverId } = req.body;

    // Security Check: Only ACTIVE users can send proposals
    if (req.user.accountStatus !== 'ACTIVE') {
      res.status(403).json({ error: "Your account is currently pending approval. You cannot send match proposals yet." });
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

    const newRequest = await prisma.request.create({
      data: {
        senderId,
        receiverId,
        status: 'PENDING'
      }
    });

    // Trigger Email to Receiver safely
    const receiverData = await prisma.user.findUnique({
      where: { id: receiverId },
      include: { profile: true }
    });
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

    const request = await prisma.request.updateMany({
      where: { id: requestId, receiverId },
      data: { status: 'REJECTED' }
    });

    if (request.count === 0) {
      res.status(404).json({ error: "Request not found" });
      return;
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

