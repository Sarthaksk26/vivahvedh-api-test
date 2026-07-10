import { describe, it, expect, vi, beforeEach } from 'vitest';
import { login, register } from './auth.controller';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
    }
  }
}));

vi.mock('../config/db', () => ({
  default: prismaMock,
}));

vi.mock('../utils/id.util', () => ({
  generateUniqueRegId: vi.fn().mockResolvedValue('REG12345'),
}));

vi.mock('../services/mail.service', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue({}),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({}),
  sendAdminNotification: vi.fn().mockResolvedValue({}),
  escapeHTML: (str: string) => str,
}));

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('auth.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('calls next with a ZodError when required credentials are missing', async () => {
      const req: any = { body: { identifier: '', password: '' } };
      const res = mockRes();
      const next = vi.fn();

      await login(req, res as any, next);

      expect(next).toHaveBeenCalledOnce();
      expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    });
  });

  describe('register age validation', () => {
    it('calls next with error if male user age is under 21', async () => {
      // Set birthDate to 20 years ago
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 20);
      const birthDateStr = dob.toISOString().split('T')[0];

      const req: any = {
        body: {
          mobile: '1234567890',
          password: 'Password123!',
          firstName: 'John',
          middleName: 'M',
          lastName: 'Doe',
          gender: 'MALE',
          maritalStatus: 'UNMARRIED',
          email: 'john@example.com',
          birthDate: birthDateStr,
        }
      };
      const res = mockRes();
      const next = vi.fn();

      await register(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('Legal marriage age in India is 21+ for Men and 18+ for Women');
    });

    it('calls next with error if female user age is under 18', async () => {
      // Set birthDate to 17 years ago
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 17);
      const birthDateStr = dob.toISOString().split('T')[0];

      const req: any = {
        body: {
          mobile: '1234567890',
          password: 'Password123!',
          firstName: 'Jane',
          middleName: 'M',
          lastName: 'Doe',
          gender: 'FEMALE',
          maritalStatus: 'UNMARRIED',
          email: 'jane@example.com',
          birthDate: birthDateStr,
        }
      };
      const res = mockRes();
      const next = vi.fn();

      await register(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('Legal marriage age in India is 21+ for Men and 18+ for Women');
    });

    it('successfully registers user if male age is >= 21', async () => {
      // Set birthDate to 22 years ago
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 22);
      const birthDateStr = dob.toISOString().split('T')[0];

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({ regId: 'REG12345' });

      const req: any = {
        body: {
          mobile: '1234567890',
          password: 'Password123!',
          firstName: 'John',
          middleName: 'M',
          lastName: 'Doe',
          gender: 'MALE',
          maritalStatus: 'UNMARRIED',
          email: 'john@example.com',
          birthDate: birthDateStr,
        }
      };
      const res = mockRes();
      const next = vi.fn();

      await register(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Registration successful! Awaiting admin approval.',
        regId: 'REG12345',
      });
    });
  });
});
