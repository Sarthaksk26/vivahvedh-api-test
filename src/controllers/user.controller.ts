import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../config/db';
import fs from 'fs';
import path from 'path';
import { maskPrivateDetails } from '../utils/sanitize';

export const getMyProfile = async (req: Request, res: Response) => {
  try {
    // The user ID is guaranteed by our requireAuth middleware
    const userId = req.user.id;

    // We pull down the core user account + their deep linked profile and family stats natively.
    const fullUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        family: true,
        physical: true,
        education: true,
        astrology: true,
        preferences: true,
        images: true
      }
    });

    if (!fullUser) {
      res.status(404).json({ error: 'User block not found.' });
      return;
    }

    // Never send the password hash back to the frontend!
    const { password, ...safeUser } = fullUser;

    res.status(200).json(maskPrivateDetails(safeUser, true));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error fetching profile' });
  }
};

export const uploadPhoto = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided.' });
      return;
    }

    const userId = req.user.id;
    // Construct the public URL that the frontend will use to display it
    const photoUrl = `${process.env.API_URL || 'http://localhost:5000'}/uploads/${req.file.filename}`;

    // Check how many photos already exist
    const existingCount = await prisma.image.count({ where: { userId } });
    
    // Update the Prisma database to create a new Image tracking record
    await prisma.image.create({
      data: {
        userId: userId,
        url: photoUrl,
        isPrimary: existingCount === 0 // First photo is automatically primary
      }
    });

    res.status(200).json({ success: true, photoUrl });
  } catch (error) {
    console.error("Photo Upload Error:", error);
    res.status(500).json({ error: 'Failed to upload photo.' });
  }
};

export const deletePhoto = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const imageId = req.params.imageId as string;

    // Find the image and verify ownership
    const image = await prisma.image.findUnique({ where: { id: imageId } });

    if (!image || image.userId !== userId) {
      res.status(404).json({ error: 'Image not found or access denied.' });
      return;
    }

    // Delete from disk
    try {
      const filename = image.url.split('/uploads/')[1];
      if (filename) {
        const filePath = path.join(__dirname, '../../uploads', filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (fsError) {
      console.warn("File deletion warning:", fsError);
    }

    // Delete from database
    await prisma.image.delete({ where: { id: imageId as string } });

    // If deleted image was primary, set the next one as primary
    if (image.isPrimary) {
      const nextImage = await prisma.image.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' }
      });
      if (nextImage) {
        await prisma.image.update({
          where: { id: nextImage.id },
          data: { isPrimary: true }
        });
      }
    }

    res.status(200).json({ success: true, message: 'Photo deleted.' });
  } catch (error) {
    console.error("Photo Delete Error:", error);
    res.status(500).json({ error: 'Failed to delete photo.' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { profile, family, education, physical, astrology, preferences } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(profile && {
          profile: {
            upsert: {
              create: profile,
              update: profile
            }
          }
        }),
        ...(family && {
          family: {
            upsert: {
              create: family,
              update: family
            }
          }
        }),
        ...(education && {
          education: {
            upsert: {
              create: education,
              update: education
            }
          }
        }),
        ...(physical && {
          physical: {
            upsert: {
              create: physical,
              update: physical
            }
          }
        }),
        ...(astrology && {
          astrology: {
            upsert: {
              create: astrology,
              update: astrology
            }
          }
        }),
        ...(preferences && {
          preferences: {
            upsert: {
              create: preferences,
              update: preferences
            }
          }
        })
      },
      include: {
        profile: true,
        family: true,
        education: true,
        physical: true,
        astrology: true,
        preferences: true
      }
    });

    res.status(200).json({ success: true, message: 'Profile data saved successfully.', user: updatedUser });

  } catch (error) {
    console.error("Profile Update Error:", error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Current password and new password (min 6 chars) required.' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        requiresPasswordChange: false
      }
    });

    res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error("Password Change Error:", error);
    res.status(500).json({ error: 'Failed to change password.' });
  }
};

export const shortlistProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { targetUserId } = req.body;

    if (userId === targetUserId) {
      res.status(400).json({ error: 'Cannot shortlist yourself.' });
      return;
    }

    // Check if already shortlisted
    const existing = await prisma.shortlist.findFirst({
      where: { userId, targetUserId }
    });

    if (existing) {
      // Remove from shortlist (toggle)
      await prisma.shortlist.delete({ where: { id: existing.id } });
      res.status(200).json({ shortlisted: false, message: 'Removed from shortlist.' });
      return;
    }

    await prisma.shortlist.create({
      data: { userId, targetUserId }
    });

    res.status(200).json({ shortlisted: true, message: 'Profile shortlisted.' });
  } catch (error) {
    console.error("Shortlist Error:", error);
    res.status(500).json({ error: 'Failed to shortlist profile.' });
  }
};

export const getMyShortlist = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    const shortlisted = await prisma.shortlist.findMany({
      where: { userId },
      include: {
        target: {
          include: { profile: true, images: { where: { isPrimary: true }, take: 1 } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json(shortlisted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shortlist.' });
  }
};

export const recordProfileView = async (req: Request, res: Response) => {
  try {
    const viewerId = req.user.id;
    const profileId = req.params.profileId as string;

    if (viewerId === profileId) {
      res.status(200).json({ recorded: false });
      return;
    }

    // Upsert: update timestamp if already viewed, otherwise create
    await prisma.profileView.upsert({
      where: {
        viewerId_viewedId: { viewerId, viewedId: profileId }
      },
      update: { viewedAt: new Date() },
      create: { viewerId, viewedId: profileId }
    });

    res.status(200).json({ recorded: true });
  } catch (error) {
    console.error("Profile View Error:", error);
    res.status(500).json({ error: 'Failed to record view.' });
  }
};

export const getProfileViewers = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    const viewers = await prisma.profileView.findMany({
      where: { viewedId: userId },
      include: {
        viewer: {
          include: { profile: true, images: { where: { isPrimary: true }, take: 1 } }
        }
      },
      orderBy: { viewedAt: 'desc' },
      take: 50
    });

    res.status(200).json(viewers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile viewers.' });
  }
};
