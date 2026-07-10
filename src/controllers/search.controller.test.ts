import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPublicProfile } from './search.controller';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    request: {
      findFirst: vi.fn(),
    },
    profileView: {
      upsert: vi.fn().mockResolvedValue({}),
    }
  }
}));

vi.mock('../config/db', () => ({
  default: prismaMock,
}));

vi.mock('../utils/sanitize', () => ({
  maskPrivateDetails: vi.fn((user) => user),
}));

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('getPublicProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 for inactive users to non-admin viewers', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const req: any = { params: { id: 'u-1' }, user: { id: 'u-2', role: 'USER' } };
    const res = mockRes();

    await getPublicProfile(req, res as any);

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'u-1', role: 'USER', accountStatus: 'ACTIVE' })
      })
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  // T2 Test cases:
  const mockImages = [
    { id: 'img-1', url: 'img-1.jpg', isPrimary: true },
    { id: 'img-2', url: 'img-2.jpg', isPrimary: false },
    { id: 'img-3', url: 'img-3.jpg', isPrimary: false },
  ];

  it('returns only primary photo for guests', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'target-id',
      images: mockImages,
    });
    
    const req: any = { params: { id: 'target-id' }, user: undefined };
    const res = mockRes();

    await getPublicProfile(req, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [mockImages[0]]
      })
    );
  });

  it('returns only primary photo for FREE plan viewer', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'target-id',
      images: mockImages,
    });
    prismaMock.request.findFirst.mockResolvedValue(null); // No connection
    prismaMock.user.findUnique.mockResolvedValue({ planType: 'FREE' });

    const req: any = { params: { id: 'target-id' }, user: { id: 'viewer-id', role: 'USER' } };
    const res = mockRes();

    await getPublicProfile(req, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [mockImages[0]]
      })
    );
  });

  it('returns full photo gallery for SILVER plan viewer', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'target-id',
      images: mockImages,
    });
    prismaMock.request.findFirst.mockResolvedValue(null); // No connection
    prismaMock.user.findUnique.mockResolvedValue({ planType: 'SILVER' });

    const req: any = { params: { id: 'target-id' }, user: { id: 'viewer-id', role: 'USER' } };
    const res = mockRes();

    await getPublicProfile(req, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        images: mockImages
      })
    );
  });

  it('returns full photo gallery for GOLD plan viewer', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'target-id',
      images: mockImages,
    });
    prismaMock.request.findFirst.mockResolvedValue(null); // No connection
    prismaMock.user.findUnique.mockResolvedValue({ planType: 'GOLD' });

    const req: any = { params: { id: 'target-id' }, user: { id: 'viewer-id', role: 'USER' } };
    const res = mockRes();

    await getPublicProfile(req, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        images: mockImages
      })
    );
  });

  it('returns full photo gallery for user looking at their own profile', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'my-id',
      images: mockImages,
    });

    const req: any = { params: { id: 'my-id' }, user: { id: 'my-id', role: 'USER' } };
    const res = mockRes();

    await getPublicProfile(req, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        images: mockImages
      })
    );
  });

  it('returns full photo gallery for ACCEPTED connections', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'target-id',
      images: mockImages,
    });
    prismaMock.request.findFirst.mockResolvedValue({ status: 'ACCEPTED' });

    const req: any = { params: { id: 'target-id' }, user: { id: 'viewer-id', role: 'USER' } };
    const res = mockRes();

    await getPublicProfile(req, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        images: mockImages
      })
    );
  });

  it('returns full photo gallery for admin viewer', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'target-id',
      images: mockImages,
    });

    const req: any = { params: { id: 'target-id' }, user: { id: 'admin-id', role: 'ADMIN' } };
    const res = mockRes();

    await getPublicProfile(req, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        images: mockImages
      })
    );
  });
});
