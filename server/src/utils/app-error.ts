/**
 * Base application error class
 * @extends Error
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;

  /**
   * Create an AppError
   * @param message Error message
   * @param statusCode HTTP status code
   * @param isOperational Whether the error is operational
   * @param code Error code
   */
  constructor(
    message: string,
    statusCode = 500,
    isOperational = true,
    code = 'INTERNAL_SERVER_ERROR',
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * API error class
 * @extends AppError
 */
export class ApiError extends AppError {
  /**
   * Create an ApiError
   * @param message Error message
   * @param statusCode HTTP status code
   * @param code Error code
   */
  constructor(message: string, statusCode = 400, code = 'API_ERROR') {
    super(message, statusCode, true, code);
  }
}

/**
 * Not found error class
 * @extends AppError
 */
export class NotFoundError extends AppError {
  /**
   * Create a NotFoundError
   * @param message Error message
   * @param code Error code
   */
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(message, 404, true, code);
  }
}

/**
 * Bad request error class
 * @extends AppError
 */
export class BadRequestError extends AppError {
  /**
   * Create a BadRequestError
   * @param message Error message
   * @param code Error code
   */
  constructor(message = 'Bad request', code = 'BAD_REQUEST') {
    super(message, 400, true, code);
  }
}

/**
 * Validation error class
 * @extends AppError
 */
export class ValidationError extends AppError {
  public readonly errors: Record<string, string>[];

  /**
   * Create a ValidationError
   * @param message Error message
   * @param errors Validation errors
   * @param code Error code
   */
  constructor(
    message = 'Validation error',
    errors: Record<string, string>[] = [],
    code = 'VALIDATION_ERROR',
  ) {
    super(message, 400, true, code);
    this.errors = errors;
  }
}

/**
 * Unauthorized error class
 * @extends AppError
 */
export class UnauthorizedError extends AppError {
  /**
   * Create an UnauthorizedError
   * @param message Error message
   * @param code Error code
   */
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    super(message, 401, true, code);
  }
}

/**
 * Forbidden error class
 * @extends AppError
 */
export class ForbiddenError extends AppError {
  /**
   * Create a ForbiddenError
   * @param message Error message
   * @param code Error code
   */
  constructor(message = 'Forbidden', code = 'FORBIDDEN') {
    super(message, 403, true, code);
  }
}

/**
 * Conflict error class
 * @extends AppError
 */
export class ConflictError extends AppError {
  /**
   * Create a ConflictError
   * @param message Error message
   * @param code Error code
   */
  constructor(message = 'Conflict', code = 'CONFLICT') {
    super(message, 409, true, code);
  }
}

/**
 * Internal server error class
 * @extends AppError
 */
export class InternalServerError extends AppError {
  /**
   * Create an InternalServerError
   * @param message Error message
   * @param code Error code
   */
  constructor(message = 'Internal server error', code = 'INTERNAL_SERVER_ERROR') {
    super(message, 500, true, code);
  }
}

/**
 * Service unavailable error class
 * @extends AppError
 */
export class ServiceUnavailableError extends AppError {
  /**
   * Create a ServiceUnavailableError
   * @param message Error message
   * @param code Error code
   */
  constructor(message = 'Service unavailable', code = 'SERVICE_UNAVAILABLE') {
    super(message, 503, true, code);
  }
}

/**
 * Database error class
 * @extends AppError
 */
export class DatabaseError extends AppError {
  /**
   * Create a DatabaseError
   * @param message Error message
   * @param code Error code
   */
  constructor(message = 'Database error', code = 'DATABASE_ERROR') {
    super(message, 500, true, code);
  }
}
