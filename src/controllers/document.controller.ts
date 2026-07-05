import { Request, Response } from 'express';
import prisma from '../config/db';
import { v2 as cloudinary } from 'cloudinary';
import { asyncHandler } from '../utils/asyncHandler';

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

  // Extract public ID from Cloudinary URL
  // Typical URL: https://res.cloudinary.com/cloud_name/image/authenticated/v1234/vivahvedh/documents/xyz.webp
  // For raw: https://res.cloudinary.com/cloud_name/raw/authenticated/v1234/vivahvedh/documents/xyz.pdf
  
  const isRaw = docUrl.includes('/raw/');
  const resourceType = isRaw ? 'raw' : 'image';
  
  // Extract everything after /v[digits]/
  const versionMatch = docUrl.match(/\/v\d+\/(.+)$/);
  if (!versionMatch) {
    res.status(500).json({ error: 'Invalid Cloudinary URL format stored in database.' });
    return;
  }
  
  let publicIdWithExt = versionMatch[1];
  let publicId = publicIdWithExt;
  
  // For images, the public ID usually excludes the extension (unless it was explicitly included).
  // Cloudinary's cloudinary.url works best with the exact public ID.
  // The storage service doesn't specify public_id, so Cloudinary auto-generates it.
  // For images, the extension is often appended by Cloudinary's delivery URL, but the public ID itself doesn't have it.
  if (!isRaw) {
    // Strip the extension for image public IDs
    publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.')) || publicIdWithExt;
  }

  // Generate signed URL
  const signedUrl = cloudinary.url(publicId, {
    sign_url: true,
    type: 'authenticated',
    secure: true,
    resource_type: resourceType,
  });

  res.status(200).json({ url: signedUrl });
});
