import { describe, it, expect, vi } from 'vitest';
import { login } from './auth.controller';

vi.mock('../config/db', () => ({
  default: {
    user: {
      findFirst: vi.fn(),
    }
  }
}));

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('login', () => {
  it('calls next with a ZodError when required credentials are missing', async () => {
    const req: any = { body: { identifier: '', password: '' } };
    const res = mockRes();
    const next = vi.fn();

    await login(req, res as any, next);

    // Zod validation errors are passed to next() by asyncHandler,
    // not directly written to res — the error middleware handles the 400 response.
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
