import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSignedDocumentUrl } from './document.controller';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn() },
    userEducation: { findUnique: vi.fn() },
    userPhysical: { findUnique: vi.fn() },
  }
}));

vi.mock('../config/db', () => ({
  default: prismaMock,
}));

vi.mock('cloudinary', () => ({
  v2: {
    url: vi.fn().mockReturnValue('https://signed-url.example.com/doc'),
  },
}));

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('getSignedDocumentUrl — T1 Document Access Control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when requester is not authenticated', async () => {
    const req: any = { params: { type: 'kyc' }, query: {}, user: undefined };
    const res = mockRes();

    await getSignedDocumentUrl(req, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('returns 403 when non-admin requests another user\'s document', async () => {
    const req: any = {
      params: { type: 'kyc' },
      query: { userId: 'other-user-id' },
      user: { id: 'my-id', role: 'USER' },
    };
    const res = mockRes();

    await getSignedDocumentUrl(req, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('allows admin to view another user\'s document', async () => {
    const req: any = {
      params: { type: 'kyc' },
      query: { userId: 'other-user-id' },
      user: { id: 'admin-id', role: 'ADMIN' },
    };
    const res = mockRes();

    prismaMock.user.findUnique.mockResolvedValue({
      kycDocumentUrl: 'https://res.cloudinary.com/demo/image/authenticated/v1234/vivahvedh/documents/kyc-doc.webp',
    });

    await getSignedDocumentUrl(req, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ url: expect.any(String) });
  });

  it('allows owner to view their own document', async () => {
    const req: any = {
      params: { type: 'kyc' },
      query: {},
      user: { id: 'owner-id', role: 'USER' },
    };
    const res = mockRes();

    prismaMock.user.findUnique.mockResolvedValue({
      kycDocumentUrl: 'https://res.cloudinary.com/demo/image/authenticated/v1234/vivahvedh/documents/my-kyc.webp',
    });

    await getSignedDocumentUrl(req, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ url: expect.any(String) });
  });

  it('returns 404 when document does not exist', async () => {
    const req: any = {
      params: { type: 'kyc' },
      query: {},
      user: { id: 'owner-id', role: 'USER' },
    };
    const res = mockRes();

    prismaMock.user.findUnique.mockResolvedValue({ kycDocumentUrl: null });

    await getSignedDocumentUrl(req, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 for invalid document type', async () => {
    const req: any = {
      params: { type: 'invalid' },
      query: {},
      user: { id: 'owner-id', role: 'USER' },
    };
    const res = mockRes();

    await getSignedDocumentUrl(req, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
