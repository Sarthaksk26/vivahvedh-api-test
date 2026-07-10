import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forgotPassword, resetPassword } from './auth.controller';

const { prismaMock, bcryptMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn(), update: vi.fn() },
    passwordResetToken: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
  },
  bcryptMock: {
    genSalt: vi.fn().mockResolvedValue('salt'),
    hash: vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn(),
  }
}));

vi.mock('../config/db', () => ({
  default: prismaMock,
}));

vi.mock('bcrypt', () => ({
  default: bcryptMock,
  ...bcryptMock,
}));

vi.mock('../services/mail.service', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendApprovalEmail: vi.fn().mockResolvedValue(undefined),
  sendOfflineCredentialsEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
}));

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
};

describe('forgotPassword — T4 Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns generic success even for unknown identifier (no user enumeration)', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    const req: any = { body: { identifier: 'nonexistent@mail.com' } };
    const res = mockRes();

    await forgotPassword(req, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: expect.stringContaining('If an account exists'),
    });
    // Should NOT have created a token
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('creates a reset token and returns success for valid user', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'valid@example.com',
      profile: { firstName: 'Test' },
    });
    prismaMock.passwordResetToken.create.mockResolvedValue({ id: 'token-1' });

    const req: any = { body: { identifier: 'valid@example.com' } };
    const res = mockRes();

    await forgotPassword(req, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(prismaMock.passwordResetToken.create).toHaveBeenCalledOnce();
  });

  it('passes validation error to next() for empty identifier', async () => {
    const req: any = { body: { identifier: '' } };
    const res = mockRes();
    const next = vi.fn();

    await forgotPassword(req, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});

describe('resetPassword — T4 Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid/expired token with 400', async () => {
    prismaMock.passwordResetToken.findFirst.mockResolvedValue(null);

    const req: any = { body: { token: 'bad-token', newPassword: 'newPass123!' } };
    const res = mockRes();

    await resetPassword(req, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired reset token.' });
  });

  it('resets password, marks token as used, and revokes refresh tokens', async () => {
    prismaMock.passwordResetToken.findFirst.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      token: 'hashed',
      expiresAt: new Date(Date.now() + 3600000),
      usedAt: null,
    });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.passwordResetToken.update.mockResolvedValue({});
    prismaMock.refreshToken.deleteMany.mockResolvedValue({});

    const req: any = { body: { token: 'valid-raw-token', newPassword: 'secureNewPass123!' } };
    const res = mockRes();

    await resetPassword(req, res as any, vi.fn());

    // Password updated
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          password: 'hashed-password',
          requiresPasswordChange: false,
        }),
      })
    );
    // Token marked used
    expect(prismaMock.passwordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'reset-1' },
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      })
    );
    // All refresh tokens revoked
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    // Success response
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('passes validation error for short password', async () => {
    const req: any = { body: { token: 'some-token', newPassword: 'short' } };
    const res = mockRes();
    const next = vi.fn();

    await resetPassword(req, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
