import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updatePaymentStatus } from './payment.controller';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    pendingPayment: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  }
}));

vi.mock('../config/db', () => ({
  default: prismaMock,
}));

vi.mock('../services/mail.service', () => ({
  sendPaymentStatusEmail: vi.fn().mockResolvedValue(undefined),
}));

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('updatePaymentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects status changes on non-pending payments', async () => {
    prismaMock.pendingPayment.findUnique.mockResolvedValue({
      id: 'pay-1',
      userId: 'user-1',
      planType: 'GOLD',
      status: 'APPROVED',
      user: { email: 'a@example.com', profile: { firstName: 'A' } }
    });

    const req: any = { params: { id: 'pay-1' }, body: { status: 'REJECTED' } };
    const res = mockRes();

    await updatePaymentStatus(req, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('runs user and payment updates in one transaction when approved', async () => {
    prismaMock.pendingPayment.findUnique.mockResolvedValue({
      id: 'pay-2',
      userId: 'user-2',
      planType: 'SILVER',
      status: 'PENDING',
      user: { email: 'b@example.com', profile: { firstName: 'B' } }
    });

    prismaMock.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        user: { update: vi.fn().mockResolvedValue({}) },
        pendingPayment: { update: vi.fn().mockResolvedValue({}) }
      };
      await cb(tx);
    });

    const req: any = { params: { id: 'pay-2' }, body: { status: 'APPROVED' } };
    const res = mockRes();

    await updatePaymentStatus(req, res as any, vi.fn());

    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith({ message: 'Payment approved successfully.' });
  });
});
