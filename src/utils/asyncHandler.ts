import { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async Express route handler to automatically catch rejected
 * promises and forward them to the central error-handling middleware.
 *
 * Usage: router.get('/path', asyncHandler(myController));
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
