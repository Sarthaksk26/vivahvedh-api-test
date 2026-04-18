import { Request, Response } from 'express';
import prisma from '../config/db';
import { z } from 'zod';
import { sendStoryApprovedEmail } from '../services/mail.service';

// ==============================
// PUBLIC: Get all approved stories
// ==============================
export const getApprovedStories = async (req: Request, res: Response) => {
  try {
    const stories = await prisma.successStory.findMany({
      where: { status: 'APPROVED' },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(stories);
  } catch (error) {
    console.error('Get Stories Error:', error);
    res.status(500).json({ error: 'Failed to fetch success stories.' });
  }
};

// ==============================
// USER: Submit a story (requires approval)
// ==============================
const submitStorySchema = z.object({
  groomName: z.string().min(2, 'Groom name is required'),
  brideName: z.string().min(2, 'Bride name is required'),
  message: z.string().min(10, 'Please write at least 10 characters').max(1000, 'Message too long (max 1000 chars)')
});

export const submitStory = async (req: Request, res: Response) => {
  try {
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

    res.status(201).json({
      message: 'Your success story has been submitted for review! It will appear publicly once approved by our team.',
      storyId: story.id
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Submit Story Error:', error);
    res.status(500).json({ error: 'Failed to submit story.' });
  }
};

// ==============================
// ADMIN: Get pending stories
// ==============================
export const getPendingStories = async (req: Request, res: Response) => {
  try {
    const stories = await prisma.successStory.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' }
    });
    res.status(200).json(stories);
  } catch (error) {
    console.error('Get Pending Stories Error:', error);
    res.status(500).json({ error: 'Failed to fetch pending stories.' });
  }
};

// ==============================
// ADMIN: Get ALL stories (for management)
// ==============================
export const getAllStories = async (req: Request, res: Response) => {
  try {
    const stories = await prisma.successStory.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(stories);
  } catch (error) {
    console.error('Get All Stories Error:', error);
    res.status(500).json({ error: 'Failed to fetch stories.' });
  }
};

// ==============================
// ADMIN: Review (approve/reject) a story
// ==============================
export const reviewStory = async (req: Request, res: Response) => {
  try {
    const { storyId, status } = req.body;

    if (!storyId || !['APPROVED', 'REJECTED'].includes(status)) {
      res.status(400).json({ error: 'Valid storyId and status (APPROVED/REJECTED) required.' });
      return;
    }

    const story = await prisma.successStory.findUnique({ where: { id: storyId } });
    if (!story) {
      res.status(404).json({ error: 'Story not found.' });
      return;
    }

    await prisma.successStory.update({
      where: { id: storyId },
      data: { status }
    });

    // Notify the submitter if approved
    if (status === 'APPROVED' && story.submittedBy) {
      const user = await prisma.user.findUnique({
        where: { id: story.submittedBy },
        include: { profile: true }
      });
      if (user?.email) {
        sendStoryApprovedEmail(user.email, story.groomName, story.brideName);
      }
    }

    res.status(200).json({ message: `Story ${status.toLowerCase()} successfully.` });
  } catch (error) {
    console.error('Review Story Error:', error);
    res.status(500).json({ error: 'Failed to review story.' });
  }
};

// ==============================
// ADMIN: Create a story directly (auto-approved)
// ==============================
const createStorySchema = z.object({
  groomName: z.string().min(2),
  brideName: z.string().min(2),
  message: z.string().min(10).max(1000)
});

export const createStory = async (req: Request, res: Response) => {
  try {
    const validatedData = createStorySchema.parse(req.body);
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const story = await prisma.successStory.create({
      data: {
        groomName: validatedData.groomName,
        brideName: validatedData.brideName,
        message: validatedData.message,
        photoUrl,
        status: 'APPROVED',
        submittedBy: null // Admin-created
      }
    });

    res.status(201).json({
      message: 'Success story published!',
      story
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Create Story Error:', error);
    res.status(500).json({ error: 'Failed to create story.' });
  }
};

// ==============================
// ADMIN: Delete a story
// ==============================
export const deleteStory = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const story = await prisma.successStory.findUnique({ where: { id } });
    if (!story) {
      res.status(404).json({ error: 'Story not found.' });
      return;
    }

    await prisma.successStory.delete({ where: { id } });

    res.status(200).json({ message: 'Story deleted permanently.' });
  } catch (error) {
    console.error('Delete Story Error:', error);
    res.status(500).json({ error: 'Failed to delete story.' });
  }
};
