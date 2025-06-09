import { Response } from 'express';
import httpStatus from 'http-status';

/**
 * Success response
 * @param res Express response object
 * @param data Response data
 * @param message Success message
 * @param statusCode HTTP status code
 * @returns Formatted success response
 */
export const successResponse = (
  res: Response,
  data: any = {},
  message = 'Success',
  statusCode = httpStatus.OK,
): Response => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
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
  error: any = {},
  message = 'Error',
  statusCode = httpStatus.INTERNAL_SERVER_ERROR,
): Response => {
  // If error is an instance of Error, extract the message and stack
  const errorObj = error instanceof Error ? { message: error.message, stack: error.stack } : error;

  return res.status(statusCode).json({
    success: false,
    message,
    error: errorObj,
  });
};

/**
 * Not found response
 * @param res Express response object
 * @param message Error message
 * @returns Formatted not found response
 */
export const notFoundResponse = (res: Response, message = 'Not found'): Response => {
  return errorResponse(res, {}, message, httpStatus.NOT_FOUND);
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
  errors: any = {},
  message = 'Validation error',
): Response => {
  return errorResponse(res, { details: errors }, message, httpStatus.BAD_REQUEST);
};

/**
 * Unauthorized response
 * @param res Express response object
 * @param message Error message
 * @returns Formatted unauthorized response
 */
export const unauthorizedResponse = (res: Response, message = 'Unauthorized'): Response => {
  return errorResponse(res, {}, message, httpStatus.UNAUTHORIZED);
};

/**
 * Forbidden response
 * @param res Express response object
 * @param message Error message
 * @returns Formatted forbidden response
 */
export const forbiddenResponse = (res: Response, message = 'Forbidden'): Response => {
  return errorResponse(res, {}, message, httpStatus.FORBIDDEN);
};

/**
 * Conflict response
 * @param res Express response object
 * @param message Error message
 * @returns Formatted conflict response
 */
export const conflictResponse = (res: Response, message = 'Conflict'): Response => {
  return errorResponse(res, {}, message, httpStatus.CONFLICT);
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
  error: any = {},
  message = 'Internal server error',
): Response => {
  return errorResponse(res, error, message, httpStatus.INTERNAL_SERVER_ERROR);
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
  return errorResponse(res, {}, message, httpStatus.SERVICE_UNAVAILABLE);
};

export default {
  successResponse,
  errorResponse,
  notFoundResponse,
  validationErrorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  conflictResponse,
  serverErrorResponse,
  serviceUnavailableResponse,
};
