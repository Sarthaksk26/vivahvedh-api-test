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
    user: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    refreshToken: {
      deleteMany: vi.fn(),
    }
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
    const next = vi.fn();

    await shortlistProfile(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toBe('Cannot shortlist yourself.');
  });

  it('removes the shortlist if it already exists', async () => {
    prismaMock.shortlist.findFirst.mockResolvedValue({ id: 's-1' });
    prismaMock.shortlist.delete.mockResolvedValue({});
    
    const req: any = { user: { id: 'u-1' }, body: { targetUserId: 'u-2' } };
    const res = mockRes();
    const next = vi.fn();

    await shortlistProfile(req, res, next);

    expect(prismaMock.shortlist.delete).toHaveBeenCalledWith({ where: { id: 's-1' } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ shortlisted: false, message: 'Removed from shortlist.' });
  });

  it('creates a shortlist if it does not exist', async () => {
    prismaMock.shortlist.findFirst.mockResolvedValue(null);
    prismaMock.shortlist.create.mockResolvedValue({});
    
    const req: any = { user: { id: 'u-1' }, body: { targetUserId: 'u-2' } };
    const res = mockRes();
    const next = vi.fn();

    await shortlistProfile(req, res, next);

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
    const next = vi.fn();

    await recordProfileView(req, res, next);

    expect(prismaMock.profileView.upsert).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ recorded: false });
  });

  it('records a profile view successfully for another user', async () => {
    const req: any = { user: { id: 'u-1' }, params: { profileId: 'u-2' } };
    const res = mockRes();
    const next = vi.fn();

    await recordProfileView(req, res, next);

    expect(prismaMock.profileView.upsert).toHaveBeenCalledWith({
      where: { viewerId_viewedId: { viewerId: 'u-1', viewedId: 'u-2' } },
      update: { viewedAt: expect.any(Date) },
      create: { viewerId: 'u-1', viewedId: 'u-2' }
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ recorded: true });
  });
});

describe('User Controller - deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws a 404 error if the user to delete does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const req: any = { user: { id: 'non-existent' } };
    const res = mockRes();
    const next = vi.fn();

    const { deleteAccount } = await import('./user.controller');
    await deleteAccount(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].statusCode).toBe(404);
    expect(next.mock.calls[0][0].message).toBe('User not found.');
  });

  it('successfully deletes user and clears auth cookies if user exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-1' });
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.user.delete.mockResolvedValue({ id: 'u-1' });

    const req: any = { user: { id: 'u-1' } };
    const res = mockRes();
    res.clearCookie = vi.fn(); // clearAuthCookies calls this
    const next = vi.fn();

    const { deleteAccount } = await import('./user.controller');
    await deleteAccount(req, res, next);

    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: 'u-1' } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Account and all associated personal data have been permanently deleted.'
    });
  });
});
