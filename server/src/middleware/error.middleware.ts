import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error';
import logger from '../config/logger';
import config from '../config/environment';

/**
 * Error handler middleware
 * @param err Error object
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Default error values
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let stack: string | undefined;
  let errors: any[] = [];
  let isOperational = false;

  // If the error is an instance of AppError, use its properties
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errorCode = err.code;
    isOperational = err.isOperational;
    if ('errors' in err) {
      errors = (err as any).errors || [];
    }
  } else {
    // For other errors, use the error message
    message = err.message;
  }

  // Include stack trace in development
  if (config.nodeEnv === 'development') {
    stack = err.stack;
  }

  // Log the error
  logger.error(`[${req.method}] ${req.path} >> StatusCode:: ${statusCode}, Message:: ${message}`, {
    error: err,
    requestId: req.id,
    userId: req.user?.id,
    path: req.path,
    method: req.method,
    ip: req.ip,
    body: req.body,
    query: req.query,
    params: req.params,
  });

  // Send the error response
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      ...(stack && { stack }),
      ...(errors.length > 0 && { details: errors }),
      isOperational,
    },
  });
};

/**
 * Not found middleware
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 */
export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const err = new AppError(`Not Found - ${req.originalUrl}`, 404, true, 'NOT_FOUND');
  next(err);
};

export default {
  errorHandler,
  notFound,
};
