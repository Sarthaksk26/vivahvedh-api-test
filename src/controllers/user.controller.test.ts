import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shortlistProfile, recordProfileView } from './user.controller';
import { AppError } from '../utils/AppError';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    shortlist: {
      findFirst: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
    profileView: {
      upsert: vi.fn(),
    },
  }
}));

vi.mock('../config/db', () => ({
  default: prismaMock,
}));

vi.mock('../services/storage.service', () => ({
  StorageService: {
    uploadImage: vi.fn(),
    deleteImage: vi.fn(),
  }
}));

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('User Controller - shortlistProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws an error if user tries to shortlist themselves', async () => {
    const req: any = { user: { id: 'u-1' }, body: { targetUserId: 'u-1' } };
    const res = mockRes();

    await expect(shortlistProfile(req, res)).rejects.toThrow(AppError);
    await expect(shortlistProfile(req, res)).rejects.toThrow('Cannot shortlist yourself.');
  });

  it('removes the shortlist if it already exists', async () => {
    prismaMock.shortlist.findFirst.mockResolvedValue({ id: 's-1' });
    prismaMock.shortlist.delete.mockResolvedValue({});
    
    const req: any = { user: { id: 'u-1' }, body: { targetUserId: 'u-2' } };
    const res = mockRes();

    await shortlistProfile(req, res);

    expect(prismaMock.shortlist.delete).toHaveBeenCalledWith({ where: { id: 's-1' } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ shortlisted: false, message: 'Removed from shortlist.' });
  });

  it('creates a shortlist if it does not exist', async () => {
    prismaMock.shortlist.findFirst.mockResolvedValue(null);
    prismaMock.shortlist.create.mockResolvedValue({});
    
    const req: any = { user: { id: 'u-1' }, body: { targetUserId: 'u-2' } };
    const res = mockRes();

    await shortlistProfile(req, res);

    expect(prismaMock.shortlist.create).toHaveBeenCalledWith({ data: { userId: 'u-1', targetUserId: 'u-2' } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ shortlisted: true, message: 'Profile shortlisted.' });
  });
});

describe('User Controller - recordProfileView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early and does not record if user views their own profile', async () => {
    const req: any = { user: { id: 'u-1' }, params: { profileId: 'u-1' } };
    const res = mockRes();

    await recordProfileView(req, res);

    expect(prismaMock.profileView.upsert).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ recorded: false });
  });

  it('records a profile view successfully for another user', async () => {
    const req: any = { user: { id: 'u-1' }, params: { profileId: 'u-2' } };
    const res = mockRes();

    await recordProfileView(req, res);

    expect(prismaMock.profileView.upsert).toHaveBeenCalledWith({
      where: { viewerId_viewedId: { viewerId: 'u-1', viewedId: 'u-2' } },
      update: { viewedAt: expect.any(Date) },
      create: { viewerId: 'u-1', viewedId: 'u-2' }
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ recorded: true });
  });
});
