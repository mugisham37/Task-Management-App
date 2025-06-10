import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError, NotFoundError } from '../utils/app-error';
import logger from '../config/logger';
import config from '../config/environment';
import { errorResponse } from '../utils/response-formatter';
import { startTimer } from '../utils/performance-monitor';
import { v4 as uuidv4 } from 'uuid';
import httpStatus from 'http-status';
import { HttpStatusCode } from '../types/http.types';
import {
  ErrorDetails,
  MongooseValidationError,
  MongoError,
  ValidationErrorType,
  RequestErrorProps,
  TypedAppError,
} from '../types/error.types';

/**
 * Error handler middleware
 * Converts different types of errors to standardized responses
 * @param err Error object
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Start performance timer
  const timer = startTimer('error.handler', {
    path: req.originalUrl,
    method: req.method,
    errorType: err.constructor.name,
  });

  // Generate correlation ID if not present
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();

  // Default error values
  let statusCode: HttpStatusCode = httpStatus.INTERNAL_SERVER_ERROR;
  let message = 'Internal Server Error';
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let stack: string | undefined;
  let errors: ValidationErrorType[] = [];
  let isOperational = false;
  let errorDetails: Record<string, unknown> = {};

  // Process different error types
  if (err instanceof AppError) {
    // Handle AppError and its subclasses
    statusCode = err.statusCode as HttpStatusCode;
    message = err.message;
    errorCode = err.errorCode;
    isOperational = err.isOperational;

    if ('errors' in err && Array.isArray((err as TypedAppError).errors)) {
      errors = (err as TypedAppError).errors || [];
    }

    if ('details' in err && (err as TypedAppError).details) {
      errorDetails = (err as TypedAppError).details || {};
    }
  } else if (err.name === 'ValidationError' && 'errors' in err) {
    // Handle Mongoose validation errors
    statusCode = httpStatus.BAD_REQUEST;
    message = 'Validation Error';
    errorCode = 'VALIDATION_ERROR';
    isOperational = true;

    // Extract validation errors
    const mongooseErrors = err as MongooseValidationError;
    Object.keys(mongooseErrors.errors).forEach((key) => {
      errors.push({
        field: key,
        message: mongooseErrors.errors[key].message,
        value: mongooseErrors.errors[key].value,
      });
    });
  } else if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    // Handle MongoDB errors
    statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    message = 'Database Error';
    errorCode = 'DATABASE_ERROR';
    isOperational = false;

    // Handle duplicate key error
    const mongoError = err as unknown as MongoError;
    if (mongoError.code === 11000) {
      statusCode = httpStatus.CONFLICT;
      message = 'Duplicate Key Error';
      errorCode = 'DUPLICATE_KEY';
      isOperational = true;

      // Extract duplicate key field
      const keyValue = mongoError.keyValue;
      if (keyValue) {
        const field = Object.keys(keyValue)[0];
        const value = keyValue[field];
        errors.push({
          field,
          message: `${field} '${value}' already exists`,
          value,
        });
      }
    }
  } else if (err.name === 'JsonWebTokenError') {
    // Handle JWT errors
    statusCode = httpStatus.UNAUTHORIZED;
    message = 'Invalid Token';
    errorCode = 'INVALID_TOKEN';
    isOperational = true;
  } else if (err.name === 'TokenExpiredError') {
    // Handle JWT expiration
    statusCode = httpStatus.UNAUTHORIZED;
    message = 'Token Expired';
    errorCode = 'TOKEN_EXPIRED';
    isOperational = true;
  } else if (
    err.name === 'SyntaxError' &&
    'status' in err &&
    (err as { status: number }).status === 400
  ) {
    // Handle JSON parsing errors
    statusCode = httpStatus.BAD_REQUEST;
    message = 'Invalid JSON';
    errorCode = 'INVALID_JSON';
    isOperational = true;
  } else {
    // For other errors, use the error message
    message = err.message || 'Internal Server Error';
  }

  // Include stack trace in development
  if (config.nodeEnv === 'development') {
    stack = err.stack;
  }

  // Log the error with appropriate level
  const logMethod = isOperational ? logger.warn : logger.error;
  logMethod(
    `[${req.method}] ${req.originalUrl} >> StatusCode:: ${statusCode}, Message:: ${message}`,
    {
      error: err,
      errorType: err.constructor.name,
      errorCode,
      statusCode,
      correlationId,
      requestId: (req as unknown as RequestErrorProps).id,
      userId: (req as unknown as RequestErrorProps).user?.id,
      path: req.originalUrl,
      method: req.method,
      ip: req.ip,
      body: req.body,
      query: req.query,
      params: req.params,
      headers: req.headers,
      timestamp: new Date().toISOString(),
    },
  );

  // End performance timer
  timer.end();

  // Prepare error object
  const errorObj: ErrorDetails = {
    code: errorCode,
    message,
    ...(stack && { stack }),
    ...(errors.length > 0 && { details: errors }),
    ...(Object.keys(errorDetails).length > 0 && { details: errorDetails }),
    isOperational,
    correlationId,
    timestamp: new Date().toISOString(),
  };

  // Send the error response using the response formatter
  // Ensure statusCode is compatible with the response-formatter's expected type
  const compatibleStatusCode =
    statusCode === 200 ||
    statusCode === 201 ||
    statusCode === 400 ||
    statusCode === 401 ||
    statusCode === 403 ||
    statusCode === 404 ||
    statusCode === 409 ||
    statusCode === 429 ||
    statusCode === 500 ||
    statusCode === 503
      ? statusCode
      : 500;

  errorResponse(res, errorObj, message, compatibleStatusCode);
};

/**
 * Not found middleware
 * Handles 404 errors for undefined routes
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 */
export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const err = new NotFoundError(`Not Found - ${req.originalUrl}`);
  next(err);
};

/**
 * Validation error middleware
 * Handles validation errors from express-validator
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 */
export const validationError = (req: Request, res: Response, next: NextFunction): void => {
  const validationErrors = (req as unknown as RequestErrorProps).validationErrors;

  if (validationErrors && validationErrors.length > 0) {
    const err = new ValidationError(
      'Validation Error',
      validationErrors as unknown as Record<string, string>[],
    );
    return next(err);
  }

  next();
};

/**
 * Error converter middleware
 * Converts non-AppError errors to AppError
 * @param err Error object
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 */
export const errorConverter = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  let convertedError = err;

  if (!(err instanceof AppError)) {
    const statusCode =
      err.name === 'ValidationError' ? httpStatus.BAD_REQUEST : httpStatus.INTERNAL_SERVER_ERROR;
    const isOperational = err.name === 'ValidationError';
    convertedError = new AppError(err.message, statusCode, isOperational, err.name);

    convertedError.stack = err.stack;
  }

  next(convertedError);
};

export default {
  errorHandler,
  notFound,
  validationError,
  errorConverter,
};
