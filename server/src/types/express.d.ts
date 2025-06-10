// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Request, Response } from 'express';

// Define user interface to replace 'any' type
interface RequestUser {
  id?: string | number;
  [key: string]: unknown;
}

// Define logger interface
interface RequestScopedLogger {
  info: (message: string, metadata?: Record<string, unknown>) => void;
}

// Define validation error interface
interface ValidationError {
  field: string;
  message: string;
  [key: string]: unknown;
}

declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: RequestUser;
      startTime?: number;
      validationErrors?: ValidationError[];
      logger?: RequestScopedLogger;
    }
  }
}

// Extend the Request interface to include common properties
declare module 'express' {
  interface Request {
    id?: string;
    user?: RequestUser;
    startTime?: number;
    validationErrors?: ValidationError[];
    logger?: RequestScopedLogger;
  }
}

// Declare uuid module
declare module 'uuid';
