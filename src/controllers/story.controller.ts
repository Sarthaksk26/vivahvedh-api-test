import { Request, Response } from 'express';
import prisma from '../config/db';
import { z } from 'zod';
import { sendStoryApprovedEmail } from '../services/mail.service';
import { asyncHandler } from '../utils/asyncHandler';

// ==============================
// PUBLIC: Get all approved stories
// ==============================
export const getApprovedStories = asyncHandler(async (req: Request, res: Response) => {
  const stories = await prisma.successStory.findMany({
    where: { status: 'APPROVED' },
    orderBy: { createdAt: 'desc' }
  });
  res.status(200).json(stories);
});

// ==============================
// USER: Submit a story (requires approval)
// ==============================
const submitStorySchema = z.object({
  groomName: z.string().min(2, 'Groom name is required').max(100),
  brideName: z.string().min(2, 'Bride name is required').max(100),
  message: z.string().min(10, 'Please write at least 10 characters').max(1000, 'Message too long (max 1000 chars)')
}).strict();

export const submitStory = asyncHandler(async (req: Request, res: Response) => {
  const validatedData = submitStorySchema.parse(req.body);
  const userId = req.user?.id;

  const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

  const story = await prisma.successStory.create({
    data: {
      groomName: validatedData.groomName,
      brideName: validatedData.brideName,
      message: validatedData.message,
      photoUrl,
      status: 'PENDING',
      submittedBy: userId || null
    }
  });

  const { sendAdminNotification } = await import('../services/mail.service');
  sendAdminNotification(
    'New Success Story Submitted',
    `<p>A new success story has been submitted by a user and is awaiting review.</p>
     <p><b>Couple:</b> ${validatedData.groomName} & ${validatedData.brideName}</p>`
  ).catch((err: Error) => console.error('[Mail] Admin story notification failed:', err.message));

  res.status(201).json({
    message: 'Your success story has been submitted for review! It will appear publicly once approved by our team.',
    storyId: story.id
  });
});

// ==============================
// ADMIN: Get pending stories
// ==============================
export const getPendingStories = asyncHandler(async (req: Request, res: Response) => {
  const stories = await prisma.successStory.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' }
  });
  res.status(200).json(stories);
});

// ==============================
// ADMIN: Get ALL stories (for management)
// ==============================
export const getAllStories = asyncHandler(async (req: Request, res: Response) => {
  const stories = await prisma.successStory.findMany({
    orderBy: { createdAt: 'desc' }
  });
  res.status(200).json(stories);
});

// ==============================
// ADMIN: Review (approve/reject) a story
// ==============================
const reviewStorySchema = z.object({
  storyId: z.string().min(1),
  status: z.enum(['APPROVED', 'REJECTED']),
}).strict();

export const reviewStory = asyncHandler(async (req: Request, res: Response) => {
  const { storyId, status } = reviewStorySchema.parse(req.body);

  const story = await prisma.successStory.findUnique({ where: { id: storyId } });
  if (!story) {
    res.status(404).json({ error: 'Story not found.' });
    return;
  }

  await prisma.successStory.update({
    where: { id: storyId },
    data: { status }
  });

  if (status === 'APPROVED' && story.submittedBy) {
    const user = await prisma.user.findUnique({
      where: { id: story.submittedBy },
      include: { profile: true }
    });
    if (user?.email) {
      sendStoryApprovedEmail(user.email, story.groomName, story.brideName)
        .catch((err: Error) => console.error('[Mail] Story approval email failed:', err.message));
    }
  }

  res.status(200).json({ message: `Story ${status.toLowerCase()} successfully.` });
});

// ==============================
// ADMIN: Create a story directly (auto-approved)
// ==============================
export const createStory = asyncHandler(async (req: Request, res: Response) => {
  const validatedData = submitStorySchema.parse(req.body); // Reusing schema
  const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

  const story = await prisma.successStory.create({
    data: {
      groomName: validatedData.groomName,
      brideName: validatedData.brideName,
      message: validatedData.message,
      photoUrl,
      status: 'APPROVED',
      submittedBy: null
    }
  });

  res.status(201).json({
    message: 'Success story published!',
    story
  });
});

// ==============================
// ADMIN: Delete a story
// ==============================
export const deleteStory = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const story = await prisma.successStory.findUnique({ where: { id } });
  if (!story) {
    res.status(404).json({ error: 'Story not found.' });
    return;
  }

  await prisma.successStory.delete({ where: { id } });

  res.status(200).json({ message: 'Story deleted permanently.' });
});
