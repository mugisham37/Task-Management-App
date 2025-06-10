import { Response, Request } from 'express';
import { createHash } from 'crypto';
import config from '../config/environment';
import { AppError } from './app-error';

// Define HTTP status code type
type HttpStatusCode = 200 | 201 | 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503;

/**
 * Pagination metadata interface
 */
interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * API response interface
 */
interface APIResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    timestamp: string;
    correlationId?: string;
  };
  meta?: {
    pagination?: PaginationMeta;
    requestId?: string;
    version: string;
    timestamp: string;
    processingTime?: number;
  };
}

/**
 * Error details interface
 */
interface ErrorDetails {
  code?: string;
  message?: string;
  details?: unknown;
  timestamp?: string;
  correlationId?: string;
  errors?: unknown;
  stack?: string;
}

/**
 * Format API response
 * @param res Express response object
 * @param success Whether the request was successful
 * @param message Response message
 * @param data Response data
 * @param statusCode HTTP status code
 * @param meta Response metadata
 * @param error Error object
 * @returns Formatted API response
 */
export const formatResponse = <T = unknown>(
  res: Response,
  success: boolean,
  message: string,
  data?: T,
  statusCode: HttpStatusCode = success ? 200 : 500,
  meta?: Partial<APIResponse['meta']>,
  error?: Partial<APIResponse['error']>,
): Response => {
  const req = res.req as Request;
  const startTime = (req as { startTime?: number }).startTime || Date.now();
  const processingTime = Date.now() - startTime;

  // Build response object
  const response: APIResponse<T> = {
    success,
    message,
    ...(data !== undefined && { data }),
    ...(error && {
      error: {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message || 'An unknown error occurred',
        details: error.details,
        timestamp: error.timestamp || new Date().toISOString(),
        correlationId: error.correlationId || (req.headers['x-correlation-id'] as string),
      },
    }),
    meta: {
      version: config.apiVersion || '1.0.0',
      timestamp: new Date().toISOString(),
      processingTime,
      requestId: req.headers['x-request-id'] as string,
      ...(meta?.pagination && { pagination: meta.pagination }),
    },
  };

  // Set cache headers for GET requests
  if (req.method === 'GET' && success) {
    // Cache successful GET responses for 5 minutes by default
    res.setHeader('Cache-Control', 'public, max-age=300');

    // Set ETag for caching
    if (data) {
      const etag = createHash('md5').update(JSON.stringify(data)).digest('hex');
      res.setHeader('ETag', `"${etag}"`);
    }
  } else {
    // Don't cache non-GET requests or error responses
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }

  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Set performance header
  res.setHeader('X-Response-Time', `${processingTime}ms`);

  return res.status(statusCode).json(response);
};

/**
 * Success response
 * @param res Express response object
 * @param data Response data
 * @param message Success message
 * @param statusCode HTTP status code
 * @param meta Response metadata
 * @returns Formatted success response
 */
export const successResponse = <T = unknown>(
  res: Response,
  data: T = {} as T,
  message = 'Success',
  statusCode: HttpStatusCode = 200,
  meta?: Partial<APIResponse['meta']>,
): Response => {
  return formatResponse(res, true, message, data, statusCode, meta);
};

/**
 * Error response
 * @param res Express response object
 * @param error Error object
 * @param message Error message
 * @param statusCode HTTP status code
 * @returns Formatted error response
 */
export const errorResponse = (
  res: Response,
  error: Error | ErrorDetails | unknown = {},
  message = 'Error',
  statusCode: HttpStatusCode = 500,
): Response => {
  // Process error object
  let errorDetails: Partial<APIResponse['error']> = {};

  if (error instanceof AppError) {
    errorDetails = {
      code: error.errorCode,
      message: error.message,
      timestamp: error.timestamp.toISOString(),
      correlationId: error.correlationId,
    };

    if ('errors' in error && error.errors !== undefined) {
      errorDetails.details = error.errors;
    }

    statusCode = error.statusCode as HttpStatusCode;
  } else if (error instanceof Error) {
    errorDetails = {
      code: 'INTERNAL_ERROR',
      message: error.message,
      ...(process.env.NODE_ENV !== 'production' && { details: error.stack }),
    };
  } else {
    errorDetails = {
      code: 'UNKNOWN_ERROR',
      message: message,
      details: error,
    };
  }

  return formatResponse(res, false, message, undefined, statusCode, undefined, errorDetails);
};

/**
 * Not found response
 * @param res Express response object
 * @param message Error message
 * @returns Formatted not found response
 */
export const notFoundResponse = (res: Response, message = 'Not found'): Response => {
  return errorResponse(res, { code: 'NOT_FOUND' }, message, 404);
};

/**
 * Validation error response
 * @param res Express response object
 * @param errors Validation errors
 * @param message Error message
 * @returns Formatted validation error response
 */
export const validationErrorResponse = (
  res: Response,
  errors: unknown = {},
  message = 'Validation error',
): Response => {
  return errorResponse(res, { code: 'VALIDATION_ERROR', details: errors }, message, 400);
};

/**
 * Unauthorized response
 * @param res Express response object
 * @param message Error message
 * @returns Formatted unauthorized response
 */
export const unauthorizedResponse = (res: Response, message = 'Unauthorized'): Response => {
  return errorResponse(res, { code: 'UNAUTHORIZED' }, message, 401);
};

/**
 * Forbidden response
 * @param res Express response object
 * @param message Error message
 * @returns Formatted forbidden response
 */
export const forbiddenResponse = (res: Response, message = 'Forbidden'): Response => {
  return errorResponse(res, { code: 'FORBIDDEN' }, message, 403);
};

/**
 * Conflict response
 * @param res Express response object
 * @param message Error message
 * @returns Formatted conflict response
 */
export const conflictResponse = (res: Response, message = 'Conflict'): Response => {
  return errorResponse(res, { code: 'CONFLICT' }, message, 409);
};

/**
 * Server error response
 * @param res Express response object
 * @param error Error object
 * @param message Error message
 * @returns Formatted server error response
 */
export const serverErrorResponse = (
  res: Response,
  error: Error | ErrorDetails | unknown = {},
  message = 'Internal server error',
): Response => {
  return errorResponse(res, error, message, 500);
};

/**
 * Service unavailable response
 * @param res Express response object
 * @param message Error message
 * @returns Formatted service unavailable response
 */
export const serviceUnavailableResponse = (
  res: Response,
  message = 'Service unavailable',
): Response => {
  return errorResponse(res, { code: 'SERVICE_UNAVAILABLE' }, message, 503);
};

/**
 * Too many requests response
 * @param res Express response object
 * @param message Error message
 * @returns Formatted too many requests response
 */
export const tooManyRequestsResponse = (res: Response, message = 'Too many requests'): Response => {
  return errorResponse(res, { code: 'RATE_LIMIT_EXCEEDED' }, message, 429);
};

/**
 * Create pagination metadata
 * @param page Current page
 * @param limit Items per page
 * @param total Total number of items
 * @returns Pagination metadata
 */
export const createPaginationMeta = (
  page: number,
  limit: number,
  total: number,
): PaginationMeta => {
  const pages = Math.ceil(total / limit) || 1;

  return {
    page,
    limit,
    total,
    pages,
    hasNextPage: page < pages,
    hasPrevPage: page > 1,
  };
};

export default {
  formatResponse,
  successResponse,
  errorResponse,
  notFoundResponse,
  validationErrorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  conflictResponse,
  serverErrorResponse,
  serviceUnavailableResponse,
  tooManyRequestsResponse,
  createPaginationMeta,
};
