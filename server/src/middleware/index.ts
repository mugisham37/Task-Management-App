/**
 * Middleware index file
 * Exports all middleware components
 */
import { Express } from 'express';

// Authentication middleware
export * from './auth.middleware';

// Authorization middleware
export * from './authorize.middleware';

// Validation middleware
export * from './validate.middleware';

// Rate limiting middleware
export * from './rate-limiter.middleware';

// Security middleware
export * from './security.middleware';

// File upload middleware
export * from './upload.middleware';

// Audit logging middleware
export * from './audit-log.middleware';

// API versioning middleware
export * from './api-version.middleware';

// Internationalization middleware
export * from './i18n.middleware';

// Error handling middleware
export * from './error.middleware';

// Default exports
import auth from './auth.middleware';
import authorize from './authorize.middleware';
import validate from './validate.middleware';
import rateLimiter from './rate-limiter.middleware';
import security from './security.middleware';
import upload from './upload.middleware';
import auditLog from './audit-log.middleware';
import apiVersion from './api-version.middleware';
import i18n from './i18n.middleware';
import error from './error.middleware';

/**
 * Apply all middleware to an Express application
 * @param app Express application
 */
export const applyMiddleware = (app: Express): void => {
  // Apply security middleware
  security.configureSecurityMiddleware(app);

  // Apply rate limiting middleware

  // Apply API versioning middleware
  app.use(apiVersion.apiVersionMiddleware());

  // Apply internationalization middleware
  app.use(i18n.languageMiddleware());
  app.use(i18n.translationMiddleware());

  // Apply error handling middleware (should be last)
  app.use(error.errorConverter);
  app.use(error.errorHandler);
  app.use(error.notFound);
};

export default {
  auth,
  authorize,
  validate,
  rateLimiter,
  security,
  upload,
  auditLog,
  apiVersion,
  i18n,
  error,
  applyMiddleware,
};
