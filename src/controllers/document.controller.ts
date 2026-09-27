import { Request, Response } from 'express';
import prisma from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { StorageService } from '../services/storage.service';

export const getSignedDocumentUrl = asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.params;
  const userId = req.query.userId as string | undefined;
  const viewerId = req.user?.id;
  const viewerRole = req.user?.role;

  if (!viewerId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const targetUserId = userId || viewerId;

  // Access control
  if (targetUserId !== viewerId && viewerRole !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden. You do not have permission to view this document.' });
    return;
  }

  // Look up document URL
  let docUrl: string | null = null;

  if (type === 'kyc') {
    const user = await prisma.user.findUnique({ where: { id: targetUserId }, select: { kycDocumentUrl: true } });
    docUrl = user?.kycDocumentUrl || null;
  } else if (type === 'income') {
    const edu = await prisma.userEducation.findUnique({ where: { userId: targetUserId }, select: { incomeProofUrl: true } });
    docUrl = edu?.incomeProofUrl || null;
  } else if (type === 'medical') {
    const phys = await prisma.userPhysical.findUnique({ where: { userId: targetUserId }, select: { medicalReportUrl: true } });
    docUrl = phys?.medicalReportUrl || null;
  } else {
    res.status(400).json({ error: 'Invalid document type. Must be kyc, income, or medical.' });
    return;
  }

  if (!docUrl) {
    res.status(404).json({ error: 'Document not found.' });
    return;
  }

  res.status(200).json({ url: StorageService.getSignedAuthenticatedUrl(docUrl) });
});
