import { describe, it, expect, vi, beforeEach } from 'vitest';
import { acceptInterest, rejectInterest } from './connection.controller';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    request: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    }
  }
}));

vi.mock('../config/db', () => ({
  default: prismaMock,
}));

vi.mock('../services/mail.service', () => ({
  sendConnectionRequestEmail: vi.fn(),
  sendConnectionAcceptedEmail: vi.fn(),
}));

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('connection transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prevents accepting already decided requests', async () => {
    prismaMock.request.findUnique.mockResolvedValue({
      id: 'req-1',
      receiverId: 'user-2',
      senderId: 'user-1',
      status: 'ACCEPTED'
    });

    const req: any = { user: { id: 'user-2' }, body: { requestId: 'req-1' } };
    const res = mockRes();
    await acceptInterest(req, res as any);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(prismaMock.request.update).not.toHaveBeenCalled();
  });

  it('rejects only pending requests', async () => {
    prismaMock.request.updateMany.mockResolvedValue({ count: 0 });
    const req: any = { user: { id: 'user-2' }, body: { requestId: 'req-2' } };
    const res = mockRes();

    await rejectInterest(req, res as any);

    expect(prismaMock.request.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) })
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
