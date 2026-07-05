import { Request, Response } from 'express';
import prisma from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';

export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
  const skip = (page - 1) * limit;

  const [notifications, total] = await Promise.all([
    prisma.userNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.userNotification.count({ where: { userId } }),
  ]);

  res.json({
    notifications,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;

  const unreadCount = await prisma.userNotification.count({
    where: { userId, isRead: false },
  });

  res.json({ unreadCount });
});

export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const id = String(req.params.id);

  const notification = await prisma.userNotification.findUnique({ where: { id } });

  if (!notification) {
    throw new AppError('Notification not found.', 404);
  }

  if (notification.userId !== userId) {
    throw new AppError('Forbidden: You can only mark your own notifications as read.', 403);
  }

  if (notification.isRead) {
    res.json({ message: 'Notification already marked as read.' });
    return;
  }

  await prisma.userNotification.update({
    where: { id },
    data: { isRead: true },
  });

  res.json({ message: 'Notification marked as read.' });
});

export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id;

  const result = await prisma.userNotification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });

  res.json({
    message: 'All notifications marked as read.',
    updatedCount: result.count,
  });
});