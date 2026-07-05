import { describe, it, expect, vi } from 'vitest';
import { errorHandler } from './error.middleware';

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('errorHandler', () => {
  it('handles "Invalid document type" errors as 400 with the original message', () => {
    const req = {} as any;
    const res = mockRes();
    const next = vi.fn();

    const err = new Error('Invalid document type. Only PDF allowed.');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid document type. Only PDF allowed.',
    });
  });

  it('handles "Invalid image type" errors as 400 with the original message', () => {
    const req = {} as any;
    const res = mockRes();
    const next = vi.fn();

    const err = new Error('Invalid image type. Only JPEG, PNG, and WEBP allowed.');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid image type. Only JPEG, PNG, and WEBP allowed.',
    });
  });
});
