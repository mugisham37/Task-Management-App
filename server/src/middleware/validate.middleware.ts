import type { Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import Joi from 'joi';
import { ValidationError } from '../utils/app-error';
import logger from '../config/logger';
import { startTimer } from '../utils/performance-monitor';
import { get, set } from '../utils/cache';

/**
 * Request validation schema interface
 */
interface ValidationSchema {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
  headers?: Joi.ObjectSchema;
}

/**
 * Validation options interface
 */
interface ValidationOptions {
  abortEarly?: boolean;
  stripUnknown?: boolean;
  cacheEnabled?: boolean;
  cacheTTL?: number;
}

/**
 * Validated request data interface
 */
interface ValidatedRequestData {
  body?: Record<string, unknown>;
  query?: ParsedQs;
  params?: ParamsDictionary;
  headers?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Validation result interface
 */
interface ValidationResult {
  value: ValidatedRequestData;
  error?: Joi.ValidationError;
}

/**
 * Format validation errors
 * @param error Joi validation error
 * @returns Formatted validation errors
 */
export const formatValidationErrors = (error: Joi.ValidationError): Record<string, string>[] => {
  const errors: Record<string, string>[] = [];

  if (error.details && error.details.length > 0) {
    error.details.forEach((detail) => {
      const path = detail.path.join('.');
      errors.push({
        field: path,
        message: detail.message.replace(/['"]/g, ''),
        type: detail.type,
      });
    });
  }

  return errors;
};

/**
 * Validate request data against schema
 * @param schema Validation schema
 * @param req Express request
 * @param options Validation options
 * @returns Validation result
 */
export const validateRequest = (
  schema: ValidationSchema,
  req: Request,
  options: ValidationOptions = {},
): ValidationResult => {
  const { abortEarly = false, stripUnknown = true } = options;
  const validationOptions = { abortEarly, stripUnknown };
  const result: ValidationResult = { value: {} };

  // Validate request body
  if (schema.body) {
    const { error, value } = schema.body.validate(req.body, validationOptions);
    if (error) {
      result.error = error;
      return result;
    }
    result.value.body = value;
  }

  // Validate request query
  if (schema.query) {
    const { error, value } = schema.query.validate(req.query, validationOptions);
    if (error) {
      result.error = error;
      return result;
    }
    result.value.query = value;
  }

  // Validate request params
  if (schema.params) {
    const { error, value } = schema.params.validate(req.params, validationOptions);
    if (error) {
      result.error = error;
      return result;
    }
    result.value.params = value;
  }

  // Validate request headers
  if (schema.headers) {
    const { error, value } = schema.headers.validate(req.headers, validationOptions);
    if (error) {
      result.error = error;
      return result;
    }
    result.value.headers = value;
  }

  return result;
};

/**
 * Cache validation schema
 * @param schema Validation schema
 * @returns Cached schema
 */
const cacheSchema = (schema: ValidationSchema): ValidationSchema => {
  // Create a new schema object with cached schemas
  const cachedSchema: ValidationSchema = {};

  if (schema.body) {
    cachedSchema.body = schema.body;
  }

  if (schema.query) {
    cachedSchema.query = schema.query;
  }

  if (schema.params) {
    cachedSchema.params = schema.params;
  }

  if (schema.headers) {
    cachedSchema.headers = schema.headers;
  }

  return cachedSchema;
};

/**
 * Get cached schema
 * @param schemaKey Schema cache key
 * @returns Cached schema or undefined
 */
const getCachedSchema = (schemaKey: string): ValidationSchema | undefined => {
  return get<ValidationSchema>(`schema:${schemaKey}`);
};

/**
 * Set cached schema
 * @param schemaKey Schema cache key
 * @param schema Validation schema
 * @param ttl Cache TTL in seconds
 */
const setCachedSchema = (schemaKey: string, schema: ValidationSchema, ttl: number): void => {
  set(`schema:${schemaKey}`, schema, ttl);
};

/**
 * Generate schema cache key
 * @param schema Validation schema
 * @returns Schema cache key
 */
const generateSchemaKey = (schema: ValidationSchema): string => {
  // Create a simple hash of the schema object
  const schemaStr = JSON.stringify(schema);
  let hash = 0;
  for (let i = 0; i < schemaStr.length; i++) {
    const char = schemaStr.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `validate:${Math.abs(hash)}`;
};

/**
 * Validation middleware
 * @param schema Validation schema
 * @param options Validation options
 * @returns Express middleware
 */
export const validate = (schema: ValidationSchema, options: ValidationOptions = {}) => {
  const {
    abortEarly = false,
    stripUnknown = true,
    cacheEnabled = true,
    cacheTTL = 3600, // 1 hour
  } = options;

  // Generate schema cache key
  const schemaKey = generateSchemaKey(schema);

  // Get or cache schema
  let validationSchema = schema;
  if (cacheEnabled) {
    const cachedSchema = getCachedSchema(schemaKey);
    if (cachedSchema) {
      validationSchema = cachedSchema;
    } else {
      validationSchema = cacheSchema(schema);
      setCachedSchema(schemaKey, validationSchema, cacheTTL);
    }
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = startTimer('validate.middleware', {
      path: req.path,
      method: req.method,
    });

    try {
      // Validate request
      const result = validateRequest(validationSchema, req, { abortEarly, stripUnknown });

      // Handle validation error
      if (result.error) {
        const errors = formatValidationErrors(result.error);
        timer.end();
        return next(new ValidationError('Validation error', errors));
      }

      // Update request with validated data
      if (result.value.body) {
        req.body = result.value.body;
      }

      if (result.value.query) {
        req.query = result.value.query;
      }

      if (result.value.params) {
        req.params = result.value.params;
      }

      timer.end();
      next();
    } catch (error) {
      timer.end();
      logger.error('Validation error:', {
        error,
        path: req.path,
        method: req.method,
      });
      next(error);
    }
  };
};

/**
 * Create validation schema for a specific HTTP method
 * @param schemas Validation schemas by method
 * @returns Validation middleware
 */
export const validateByMethod = (schemas: Record<string, ValidationSchema>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const method = req.method.toLowerCase();
    const schema = schemas[method];

    if (!schema) {
      return next();
    }

    validate(schema)(req, res, next);
  };
};

/**
 * Sanitize request body
 * @param allowedFields Allowed fields
 * @returns Express middleware
 */
export const sanitizeBody = (allowedFields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.body || typeof req.body !== 'object') {
      return next();
    }

    const sanitizedBody: Record<string, unknown> = {};

    // Only keep allowed fields
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        sanitizedBody[field] = req.body[field];
      }
    });

    req.body = sanitizedBody;
    next();
  };
};

export default {
  validate,
  validateByMethod,
  sanitizeBody,
  formatValidationErrors,
  validateRequest,
};
