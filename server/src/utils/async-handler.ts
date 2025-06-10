import { Request, Response, NextFunction } from 'express';
import { AppError, InternalServerError } from './app-error';
import logger from '../config/logger';

/**
 * Type definition for Express request with user data
 */
interface RequestWithUser extends Request {
  user?: {
    id?: string | number;
    [key: string]: unknown;
  };
}

/**
 * Type definition for async functions that can be wrapped
 */
type AsyncFunction<T extends unknown[], R> = (...args: T) => Promise<R>;

/**
 * Type definition for Express middleware functions
 */
type MiddlewareFunction = (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => Promise<void>;

/**
 * Async handler to wrap async route handlers
 * This eliminates the need for try/catch blocks in route handlers
 * @param fn Async function to wrap
 * @returns Express middleware function
 */
export const asyncHandler = <T extends unknown[], R>(
  fn: AsyncFunction<T, R>,
): ((...args: T) => Promise<R | void>) => {
  return async (...args: T): Promise<R | void> => {
    try {
      // Start performance tracking
      const startTime = process.hrtime.bigint();

      // Execute the function
      const result = await fn(...args);

      // End performance tracking
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      // Log slow operations (over 500ms)
      if (duration > 500) {
        // Safe cast to Request - first argument in Express middleware is always Request
        const req = args[0] as RequestWithUser;
        logger.warn(
          `Slow operation detected: ${req.method} ${req.originalUrl} - ${duration.toFixed(2)}ms`,
          {
            method: req.method,
            path: req.originalUrl,
            duration,
            userId: req.user?.id,
            correlationId: req.headers?.['x-correlation-id'],
          },
        );
      }

      return result;
    } catch (error) {
      // Safe cast to Request - first argument in Express middleware is always Request
      const req = args[0] as RequestWithUser;
      const correlationId = req.headers?.['x-correlation-id'] as string | undefined;

      // Enhance error with request context
      const enhancedError =
        error instanceof AppError
          ? error
          : new InternalServerError(
              error instanceof Error ? error.message : 'Internal server error',
              'INTERNAL_SERVER_ERROR',
              correlationId,
            );

      // Log the error
      logger.error(`Error in async handler: ${enhancedError.message}`, {
        error: enhancedError,
        method: req.method,
        path: req.originalUrl,
        query: req.query,
        params: req.params,
        body: req.body,
        userId: req.user?.id,
        correlationId,
      });

      // Forward to error middleware
      const next = args[2] as NextFunction;
      next(enhancedError);
    }
  };
};

/**
 * Specialized async handler for controller methods
 * Provides additional type safety for controller methods
 * @param fn Controller method to wrap
 * @returns Wrapped controller method
 */
export const controllerHandler = (fn: MiddlewareFunction): MiddlewareFunction => {
  return asyncHandler<[RequestWithUser, Response, NextFunction], void>(fn);
};

export default asyncHandler;
