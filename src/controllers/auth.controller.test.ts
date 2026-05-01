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
  it('returns 400 when required credentials are missing', async () => {
    const req: any = { body: { identifier: '', password: '' } };
    const res = mockRes();

    await login(req, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
