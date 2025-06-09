import { Request, Response, NextFunction } from 'express';

/**
 * Async handler to wrap async route handlers
 * This eliminates the need for try/catch blocks in route handlers
 * @param fn Async function to wrap
 * @returns Express middleware function
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export default asyncHandler;
