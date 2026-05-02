import { Request, Response } from 'express';
import prisma from '../config/db';

export const getAdminNotifications = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      newRegistrations,
      pendingApprovals, 
      pendingPayments,
      unresolvedEnquiries,
      pendingStories,
      recentConnections,
      upcomingBirthdays
    ] = await Promise.all([
      // New registrations in last 24 hours
      prisma.user.count({
        where: { role: 'USER', createdAt: { gte: last24h } }
      }),
      // Users awaiting profile approval
      prisma.user.count({
        where: { role: 'USER', accountStatus: 'INACTIVE' }
      }),
      // Payments awaiting review
      prisma.pendingPayment.count({
        where: { status: 'PENDING' }
      }),
      // Unresolved enquiries
      prisma.enquiry.count({
        where: { isResolved: false }
      }),
      // Stories awaiting approval
      prisma.successStory.count({
        where: { status: 'PENDING' }
      }),
      // Connection requests in last 7 days
      prisma.request.count({
        where: { createdAt: { gte: last7days } }
      }),
      // Birthdays in next 7 days
      prisma.user.findMany({
        where: {
          role: 'USER',
          accountStatus: 'ACTIVE',
          profile: { birthDateTime: { not: null } }
        },
        include: { profile: { select: { birthDateTime: true, firstName: true } } }
      })
    ]);

    // Calculate upcoming birthdays count (next 7 days)
    const birthdayCount = upcomingBirthdays.filter(u => {
      if (!u.profile?.birthDateTime) return false;
      const bday = new Date(u.profile.birthDateTime);
      // Simple check: birthday within next 7 days
      const nextBday = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
      if (nextBday < now) nextBday.setFullYear(nextBday.getFullYear() + 1);
      const daysUntil = Math.ceil((nextBday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntil <= 7;
    }).length;

    const totalUnread = pendingApprovals + pendingPayments + unresolvedEnquiries + pendingStories + recentConnections;

    res.json({
      totalUnread,
      notifications: {
        newRegistrations: { count: newRegistrations, label: 'New registrations (24h)', tab: 'pending' },
        pendingApprovals: { count: pendingApprovals, label: 'Profiles awaiting approval', tab: 'pending', urgent: pendingApprovals > 0 },
        pendingPayments: { count: pendingPayments, label: 'Payments to verify', tab: 'payments', urgent: pendingPayments > 0 },
        unresolvedEnquiries: { count: unresolvedEnquiries, label: 'Unresolved enquiries', tab: 'enquiries', urgent: unresolvedEnquiries > 0 },
        pendingStories: { count: pendingStories, label: 'Stories awaiting review', tab: 'stories', urgent: pendingStories > 0 },
        recentConnections: { count: recentConnections, label: 'Connections this week', tab: 'connections', urgent: recentConnections > 0 },
        upcomingBirthdays: { count: birthdayCount, label: 'Birthdays this week', tab: 'birthdays', urgent: birthdayCount > 0 },
      }
    });
  } catch (error) {
    console.error('Admin Notifications Error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
};
