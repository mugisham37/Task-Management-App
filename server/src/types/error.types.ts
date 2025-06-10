import { HttpStatusCode } from './http.types';

/**
 * Validation error type
 * Used for field-level validation errors
 */
export interface ValidationErrorType {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Error details interface
 * Used for standardized error responses
 */
export interface ErrorDetails {
  code: string;
  message: string;
  details?: ValidationErrorType[] | Record<string, unknown>;
  stack?: string;
  isOperational?: boolean;
  correlationId?: string;
  timestamp?: string;
}

/**
 * Mongoose validation error interface
 * Used for handling Mongoose validation errors
 */
export interface MongooseValidationError {
  errors: {
    [key: string]: {
      message: string;
      value: unknown;
    };
  };
}

/**
 * MongoDB error interface
 * Used for handling MongoDB errors
 */
export interface MongoError {
  code: number;
  keyValue?: Record<string, unknown>;
}

/**
 * Request error properties interface
 * Used for accessing custom properties on Express request objects
 */
export interface RequestErrorProps {
  id?: string;
  user?: {
    id: string;
    [key: string]: unknown;
  };
  validationErrors?: ValidationErrorType[];
}

/**
 * Typed AppError interface
 * Used for handling typed errors with additional properties
 */
export interface TypedAppError {
  statusCode: HttpStatusCode;
  message: string;
  errorCode: string;
  isOperational: boolean;
  errors?: ValidationErrorType[];
  details?: Record<string, unknown>;
}
