/**
 * Interfaces for serialized error objects
 */
interface SerializedError {
  message: string;
  statusCode: number;
  errorCode: string;
  isOperational: boolean;
  timestamp: Date;
  correlationId?: string;
  recoveryInstructions?: string;
  stack?: string;
}

interface SerializedValidationError extends SerializedError {
  errors: Record<string, string>[];
}

interface SerializedExternalError extends SerializedError {
  serviceName: string;
  originalError?: {
    message: string;
    stack?: string;
  };
}

/**
 * Base application error class
 * @extends Error
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errorCode: string;
  public readonly timestamp: Date;
  public readonly correlationId?: string;
  public readonly recoveryInstructions?: string;

  /**
   * Create an AppError
   * @param message Error message
   * @param statusCode HTTP status code
   * @param isOperational Whether the error is operational
   * @param errorCode Error code
   * @param correlationId Correlation ID for distributed tracing
   * @param recoveryInstructions Instructions for error recovery
   */
  constructor(
    message: string,
    statusCode = 500,
    isOperational = true,
    errorCode = 'INTERNAL_SERVER_ERROR',
    correlationId?: string,
    recoveryInstructions?: string,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errorCode = errorCode;
    this.timestamp = new Date();
    this.correlationId = correlationId;
    this.recoveryInstructions = recoveryInstructions;

    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serialize error for logging
   * @returns Serialized error object
   */
  toJSON(): SerializedError {
    return {
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      isOperational: this.isOperational,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
      recoveryInstructions: this.recoveryInstructions,
      stack: this.stack,
    };
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
   * @param errorCode Error code
   * @param correlationId Correlation ID for distributed tracing
   */
  constructor(message: string, statusCode = 400, errorCode = 'API_ERROR', correlationId?: string) {
    super(message, statusCode, true, errorCode, correlationId);
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
   * @param errorCode Error code
   * @param correlationId Correlation ID for distributed tracing
   */
  constructor(message = 'Resource not found', errorCode = 'NOT_FOUND', correlationId?: string) {
    super(
      message,
      404,
      true,
      errorCode,
      correlationId,
      'Check the resource identifier and ensure it exists',
    );
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
   * @param errorCode Error code
   * @param correlationId Correlation ID for distributed tracing
   */
  constructor(message = 'Bad request', errorCode = 'BAD_REQUEST', correlationId?: string) {
    super(message, 400, true, errorCode, correlationId, 'Verify the request format and parameters');
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
   * @param errorCode Error code
   * @param correlationId Correlation ID for distributed tracing
   */
  constructor(
    message = 'Validation error',
    errors: Record<string, string>[] = [],
    errorCode = 'VALIDATION_ERROR',
    correlationId?: string,
  ) {
    super(
      message,
      400,
      true,
      errorCode,
      correlationId,
      'Check the validation errors and correct the input data',
    );
    this.errors = errors;
  }

  /**
   * Override toJSON to include validation errors
   * @returns Serialized error object
   */
  toJSON(): SerializedValidationError {
    return {
      ...super.toJSON(),
      errors: this.errors,
    };
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
   * @param errorCode Error code
   * @param correlationId Correlation ID for distributed tracing
   */
  constructor(message = 'Unauthorized', errorCode = 'UNAUTHORIZED', correlationId?: string) {
    super(message, 401, true, errorCode, correlationId, 'Provide valid authentication credentials');
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
   * @param errorCode Error code
   * @param correlationId Correlation ID for distributed tracing
   */
  constructor(message = 'Forbidden', errorCode = 'FORBIDDEN', correlationId?: string) {
    super(
      message,
      403,
      true,
      errorCode,
      correlationId,
      'Request access to this resource from an administrator',
    );
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
   * @param errorCode Error code
   * @param correlationId Correlation ID for distributed tracing
   */
  constructor(message = 'Conflict', errorCode = 'CONFLICT', correlationId?: string) {
    super(message, 409, true, errorCode, correlationId, 'Resolve the conflict and try again');
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
   * @param errorCode Error code
   * @param correlationId Correlation ID for distributed tracing
   */
  constructor(
    message = 'Internal server error',
    errorCode = 'INTERNAL_SERVER_ERROR',
    correlationId?: string,
  ) {
    super(message, 500, false, errorCode, correlationId);
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
   * @param errorCode Error code
   * @param correlationId Correlation ID for distributed tracing
   */
  constructor(
    message = 'Service unavailable',
    errorCode = 'SERVICE_UNAVAILABLE',
    correlationId?: string,
  ) {
    super(
      message,
      503,
      true,
      errorCode,
      correlationId,
      'Try again later or contact support if the issue persists',
    );
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
   * @param errorCode Error code
   * @param correlationId Correlation ID for distributed tracing
   */
  constructor(message = 'Database error', errorCode = 'DATABASE_ERROR', correlationId?: string) {
    super(message, 500, false, errorCode, correlationId);
  }
}

/**
 * Rate limit error class
 * @extends AppError
 */
export class RateLimitError extends AppError {
  /**
   * Create a RateLimitError
   * @param message Error message
   * @param errorCode Error code
   * @param correlationId Correlation ID for distributed tracing
   */
  constructor(
    message = 'Too many requests',
    errorCode = 'RATE_LIMIT_EXCEEDED',
    correlationId?: string,
  ) {
    super(
      message,
      429,
      true,
      errorCode,
      correlationId,
      'Reduce request frequency and try again later',
    );
  }
}

/**
 * External service error class
 * @extends AppError
 */
export class ExternalServiceError extends AppError {
  public readonly serviceName: string;
  public readonly originalError?: Error;

  /**
   * Create an ExternalServiceError
   * @param message Error message
   * @param serviceName Name of the external service
   * @param originalError Original error from the external service
   * @param statusCode HTTP status code
   * @param errorCode Error code
   * @param correlationId Correlation ID for distributed tracing
   */
  constructor(
    message = 'External service error',
    serviceName = 'unknown',
    originalError?: Error,
    statusCode = 502,
    errorCode = 'EXTERNAL_SERVICE_ERROR',
    correlationId?: string,
  ) {
    super(
      message,
      statusCode,
      true,
      errorCode,
      correlationId,
      'The issue is with an external service and not with your request',
    );
    this.serviceName = serviceName;
    this.originalError = originalError;
  }

  /**
   * Override toJSON to include service name and original error
   * @returns Serialized error object
   */
  toJSON(): SerializedExternalError {
    return {
      ...super.toJSON(),
      serviceName: this.serviceName,
      originalError: this.originalError
        ? {
            message: this.originalError.message,
            stack: this.originalError.stack,
          }
        : undefined,
    };
  }
}

/**
 * Timeout error class
 * @extends AppError
 */
export class TimeoutError extends AppError {
  /**
   * Create a TimeoutError
   * @param message Error message
   * @param errorCode Error code
   * @param correlationId Correlation ID for distributed tracing
   */
  constructor(message = 'Request timeout', errorCode = 'REQUEST_TIMEOUT', correlationId?: string) {
    super(
      message,
      408,
      true,
      errorCode,
      correlationId,
      'Try again with a simpler request or contact support',
    );
  }
}
