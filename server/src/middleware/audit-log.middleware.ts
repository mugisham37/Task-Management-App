import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { startTimer } from '../utils/performance-monitor';
import logger from '../config/logger';
import config from '../config/environment';
import { Buffer } from 'buffer';

/**
 * Type for the original Response.end method
 */
type ResponseEndFunction = (
  chunk?: Buffer | string | undefined,
  encoding?: BufferEncoding | undefined,
  callback?: (() => void) | undefined,
) => Response;

/**
 * Custom TimerHandle interface for audit log middleware
 * Provides compatibility with the timer from performance-monitor
 */
interface CustomTimerHandle {
  end: () => number;
  getDuration: () => number;
}

/**
 * Adapter for timer handle to provide getDuration method
 */
const adaptTimerHandle = (timer: { end: () => number }): CustomTimerHandle => {
  return {
    end: timer.end,
    getDuration: () => timer.end(),
  };
};

/**
 * Audit log schema
 */
const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    action: {
      type: String,
      required: true,
    },
    resource: {
      type: String,
      required: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
    },
    ipAddress: String,
    userAgent: String,
    status: {
      type: String,
      enum: ['success', 'failure'],
      default: 'success',
    },
    requestMethod: String,
    requestUrl: String,
    responseStatus: Number,
    duration: Number,
  },
  {
    timestamps: true,
  },
);

/**
 * Audit log model
 */
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

/**
 * Audit log data interface
 */
interface AuditLogData {
  user?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  status?: 'success' | 'failure';
  requestMethod?: string;
  requestUrl?: string;
  responseStatus?: number;
  duration?: number;
}

/**
 * Audit log options interface
 */
interface AuditLogOptions {
  action: string;
  resource: string;
  getResourceId?: (req: Request) => string | undefined;
  getDetails?: (req: Request, res: Response) => Record<string, unknown>;
  includeRequestBody?: boolean;
  includeResponseBody?: boolean;
  excludeFields?: string[];
  enabled?: boolean;
}

/**
 * Create audit log entry
 * @param data Audit log data
 */
export const createAuditLog = async (data: AuditLogData): Promise<void> => {
  try {
    await AuditLog.create(data);
  } catch (error) {
    logger.error('Failed to create audit log:', error);
  }
};

/**
 * Get user ID from request
 * @param req Request object
 * @returns User ID or undefined
 */
const getUserId = (req: Request): string | undefined => {
  if (req.user && req.user.id) {
    return req.user.id;
  }
  return undefined;
};

/**
 * Get resource ID from request
 * @param req Request object
 * @param getResourceId Function to get resource ID
 * @returns Resource ID or undefined
 */
const getResourceIdFromRequest = (
  req: Request,
  getResourceId?: (req: Request) => string | undefined,
): string | undefined => {
  if (getResourceId) {
    return getResourceId(req);
  }

  // Try to get resource ID from params
  if (req.params && req.params.id) {
    return req.params.id;
  }

  // Try to get resource ID from body
  if (req.body && req.body.id) {
    return req.body.id;
  }

  return undefined;
};

/**
 * Filter sensitive data from object
 * @param obj Object to filter
 * @param excludeFields Fields to exclude
 * @returns Filtered object
 */
const filterSensitiveData = (
  obj: Record<string, unknown>,
  excludeFields: string[] = [],
): Record<string, unknown> => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const defaultExcludeFields = ['password', 'token', 'refreshToken', 'secret', 'apiKey'];
  const fieldsToExclude = [...defaultExcludeFields, ...excludeFields];

  const filtered: Record<string, unknown> = {};

  Object.keys(obj).forEach((key) => {
    if (fieldsToExclude.includes(key)) {
      filtered[key] = '[REDACTED]';
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      filtered[key] = filterSensitiveData(obj[key] as Record<string, unknown>, excludeFields);
    } else {
      filtered[key] = obj[key];
    }
  });

  return filtered;
};

/**
 * Audit log middleware
 * @param options Audit log options
 * @returns Express middleware
 */
export const auditLogMiddleware = (options: AuditLogOptions) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip if disabled
    if (options.enabled === false || config.disableAuditLog === 'true') {
      return next();
    }

    const originalTimer = startTimer('auditLog.middleware', {
      action: options.action,
      resource: options.resource,
      path: req.path,
      method: req.method,
    });

    const timer = adaptTimerHandle(originalTimer);

    // Store original end method with proper typing
    const originalEnd = res.end as ResponseEndFunction;
    const chunks: Buffer[] = [];

    // Override end method to capture response
    // Using type assertion to handle the complex function signature
    res.end = function (
      this: Response,
      chunk?: Buffer | string | (() => void),
      encoding?: BufferEncoding | (() => void),
      callback?: () => void,
    ): Response {
      // Handle overloaded function signatures
      if (typeof chunk === 'function') {
        callback = chunk;
        chunk = undefined;
        encoding = undefined;
      } else if (typeof encoding === 'function') {
        callback = encoding;
        encoding = undefined;
      }

      // Add chunk to buffer if it exists and is not a function
      if (chunk && typeof chunk !== 'function') {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
      }

      // Call original end method with proper type casting
      originalEnd.call(
        this,
        chunk as Buffer | string | undefined,
        encoding as BufferEncoding | undefined,
        callback,
      );

      // Create audit log after response is sent
      (async () => {
        try {
          const userId = getUserId(req);
          const resourceId = getResourceIdFromRequest(req, options.getResourceId);
          const status = res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'failure';

          // Get request details
          let details: Record<string, unknown> = {};

          // Include request body if enabled
          if (options.includeRequestBody && req.body) {
            details.requestBody = filterSensitiveData(req.body, options.excludeFields);
          }

          // Include response body if enabled
          if (options.includeResponseBody && chunks.length > 0) {
            try {
              const responseBody = Buffer.concat(chunks).toString('utf8');
              if (responseBody) {
                try {
                  details.responseBody = JSON.parse(responseBody);
                } catch (e) {
                  details.responseBody = responseBody;
                }
              }
            } catch (error) {
              logger.error('Error parsing response body for audit log:', error);
            }
          }

          // Get custom details if provided
          if (options.getDetails) {
            const customDetails = options.getDetails(req, res);
            details = { ...details, ...customDetails };
          }

          // Create audit log
          await createAuditLog({
            user: userId,
            action: options.action,
            resource: options.resource,
            resourceId,
            details,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'] as string,
            status,
            requestMethod: req.method,
            requestUrl: req.originalUrl,
            responseStatus: res.statusCode,
            duration: timer.getDuration(),
          });
        } catch (error) {
          logger.error('Error in audit log middleware:', error);
          timer.end();
        }
      })();

      return this;
    };

    next();
  };
};

/**
 * Create audit log middleware for CRUD operations
 * @param resource Resource name
 * @returns Object with CRUD middleware
 */
export const createCrudAuditMiddleware = (resource: string) => {
  return {
    create: auditLogMiddleware({
      action: 'create',
      resource,
      getResourceId: (req) => req.body?.id || req.params?.id,
    }),
    read: auditLogMiddleware({
      action: 'read',
      resource,
      getResourceId: (req) => req.params?.id,
    }),
    update: auditLogMiddleware({
      action: 'update',
      resource,
      getResourceId: (req) => req.params?.id,
    }),
    delete: auditLogMiddleware({
      action: 'delete',
      resource,
      getResourceId: (req) => req.params?.id,
    }),
    list: auditLogMiddleware({
      action: 'list',
      resource,
    }),
  };
};

/**
 * Audit log middleware for authentication actions
 * @returns Object with authentication middleware
 */
export const authAuditMiddleware = {
  login: auditLogMiddleware({
    action: 'login',
    resource: 'auth',
    getDetails: (req) => ({
      username: req.body?.username || req.body?.email,
    }),
    includeRequestBody: false,
  }),
  logout: auditLogMiddleware({
    action: 'logout',
    resource: 'auth',
  }),
  register: auditLogMiddleware({
    action: 'register',
    resource: 'user',
    getDetails: (req) => ({
      username: req.body?.username || req.body?.email,
    }),
    includeRequestBody: false,
  }),
  resetPassword: auditLogMiddleware({
    action: 'resetPassword',
    resource: 'auth',
    includeRequestBody: false,
  }),
};

export default {
  auditLogMiddleware,
  createAuditLog,
  createCrudAuditMiddleware,
  authAuditMiddleware,
  AuditLog,
};
