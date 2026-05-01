import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPublicProfile } from './search.controller';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findFirst: vi.fn(),
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
});
