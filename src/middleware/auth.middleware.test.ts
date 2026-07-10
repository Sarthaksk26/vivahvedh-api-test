import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAuth, requireActiveAccount, requireAdmin, requireActivePassword } from './auth.middleware';

const { prismaMock, tokensMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    }
  },
  tokensMock: {
    verifyAccessToken: vi.fn(),
    ACCESS_TOKEN_COOKIE: 'access_token',
  }
}));

vi.mock('../config/db', () => ({
  default: prismaMock,
}));

vi.mock('../config/tokens', () => tokensMock);

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('auth.middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireAuth', () => {
    it('returns 401 when no token is present', () => {
      const req: any = { cookies: {}, headers: {} };
      const res = mockRes();
      const next = vi.fn();

      requireAuth(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('populates req.user and calls next when a valid token is present in cookies', () => {
      const payload = {
        id: 'u-123',
        role: 'USER',
        accountStatus: 'ACTIVE',
        planType: 'GOLD',
        requiresPasswordChange: false
      };
      tokensMock.verifyAccessToken.mockReturnValue(payload);

      const req: any = {
        cookies: { access_token: 'valid-token' },
        headers: {}
      };
      const res = mockRes();
      const next = vi.fn();

      requireAuth(req, res as any, next);

      expect(tokensMock.verifyAccessToken).toHaveBeenCalledWith('valid-token');
      expect(req.user).toEqual({
        id: 'u-123',
        role: 'USER',
        accountStatus: 'ACTIVE',
        planType: 'GOLD',
        planExpiresAt: null,
        requiresPasswordChange: false
      });
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('requireAdmin', () => {
    it('returns 401 if req.user is missing', () => {
      const req: any = { user: undefined };
      const res = mockRes();
      const next = vi.fn();

      requireAdmin(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 if user is not an admin', () => {
      const req: any = { user: { role: 'USER' } };
      const res = mockRes();
      const next = vi.fn();

      requireAdmin(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next if user is admin', () => {
      const req: any = { user: { role: 'ADMIN' } };
      const res = mockRes();
      const next = vi.fn();

      requireAdmin(req, res as any, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('requireActivePassword', () => {
    it('returns 403 if password change is required and path is not allowed', () => {
      const req: any = {
        user: { requiresPasswordChange: true },
        originalUrl: '/api/search/matches'
      };
      const res = mockRes();
      const next = vi.fn();

      requireActivePassword(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'PASSWORD_CHANGE_REQUIRED'
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('allows allowed paths even when password change is required', () => {
      const req: any = {
        user: { requiresPasswordChange: true },
        originalUrl: '/api/user/change-password'
      };
      const res = mockRes();
      const next = vi.fn();

      requireActivePassword(req, res as any, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('requireActiveAccount', () => {
    it('passes directly if req.user is missing', async () => {
      const req: any = { user: undefined };
      const res = mockRes();
      const next = vi.fn();

      await requireActiveAccount(req, res as any, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('returns 403 if account status is SUSPENDED', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        accountStatus: 'SUSPENDED',
        planType: 'FREE',
        planExpiresAt: null
      });

      const req: any = { user: { id: 'u-123' } };
      const res = mockRes();
      const next = vi.fn();

      await requireActiveAccount(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'ACCOUNT_SUSPENDED'
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 if account is INACTIVE and requesting a restricted path', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        accountStatus: 'INACTIVE',
        planType: 'FREE',
        planExpiresAt: null
      });

      const req: any = { user: { id: 'u-123' }, originalUrl: '/api/search/matches' };
      const res = mockRes();
      const next = vi.fn();

      await requireActiveAccount(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'ACCOUNT_INACTIVE'
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('automatically downgrades expired plan to FREE and calls next', async () => {
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      prismaMock.user.findUnique.mockResolvedValue({
        accountStatus: 'ACTIVE',
        planType: 'GOLD',
        planExpiresAt: expiredDate
      });
      prismaMock.user.update.mockResolvedValue({});

      const req: any = { user: { id: 'u-123', planType: 'GOLD', planExpiresAt: expiredDate }, originalUrl: '/api/search/matches' };
      const res = mockRes();
      const next = vi.fn();

      await requireActiveAccount(req, res as any, next);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u-123' },
        data: { planType: 'FREE', planExpiresAt: null }
      });
      expect(req.user.planType).toBe('FREE');
      expect(req.user.planExpiresAt).toBeNull();
      expect(next).toHaveBeenCalledOnce();
    });
  });
});
