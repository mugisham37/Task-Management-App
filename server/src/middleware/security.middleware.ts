import { Express, Request, Response, NextFunction } from 'express';
import helmet, { HelmetOptions } from 'helmet';
import cors from 'cors';
import { startTimer } from '../utils/performance-monitor';
import logger from '../config/logger';
import config from '../config/environment';
import { BadRequestError } from '../utils/app-error';

/**
 * Security options interface
 */
interface SecurityOptions {
  corsOptions?: cors.CorsOptions;
  helmetOptions?: HelmetOptions;
  contentSecurityPolicy?: boolean;
  xssProtection?: boolean;
  noSniff?: boolean;
  frameOptions?: boolean;
  referrerPolicy?: boolean;
  permissionsPolicy?: boolean;
  maxBodySize?: number;
  allowedContentTypes?: string[];
}

/**
 * Default security options
 */
const defaultSecurityOptions: SecurityOptions = {
  corsOptions: {
    origin: config.corsOrigin || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'X-API-Version',
    ],
    exposedHeaders: ['X-Total-Count', 'X-Pagination-Pages', 'X-API-Version'],
    credentials: true,
    maxAge: 86400, // 24 hours
  },
  helmetOptions: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https:'],
      },
    },
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: 'deny' },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  },
  contentSecurityPolicy: true,
  xssProtection: true,
  noSniff: true,
  frameOptions: true,
  referrerPolicy: true,
  permissionsPolicy: true,
  maxBodySize: 10 * 1024 * 1024, // 10MB
  allowedContentTypes: [
    'application/json',
    'multipart/form-data',
    'application/x-www-form-urlencoded',
  ],
};

/**
 * Configure security middleware for Express application
 * @param app Express application
 * @param options Security options
 */
export const configureSecurityMiddleware = (app: Express, options: SecurityOptions = {}): void => {
  const mergedOptions = { ...defaultSecurityOptions, ...options };
  const timer = startTimer('security.configure');

  // Configure CORS
  app.use(cors(mergedOptions.corsOptions));

  // Configure Helmet
  if (mergedOptions.helmetOptions) {
    app.use(helmet(mergedOptions.helmetOptions));
  } else {
    app.use(helmet());
  }

  // Add custom security headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Frame-Options', 'DENY');

    // Add permissions policy
    if (mergedOptions.permissionsPolicy) {
      res.setHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), interest-cohort=()',
      );
    }

    next();
  });

  // Log security middleware configuration
  logger.info('Security middleware configured');
  timer.end();
};

/**
 * Validate request body size
 * @param maxSize Maximum request body size in bytes
 * @returns Express middleware
 */
export const validateBodySize = (
  maxSize: number = 1024 * 1024,
): ((req: Request, res: Response, next: NextFunction) => void) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = startTimer('security.validateBodySize', {
      path: req.path,
      method: req.method,
    });

    const contentLength = Number.parseInt(req.headers['content-length'] || '0', 10);

    if (contentLength > maxSize) {
      timer.end();
      return next(
        new BadRequestError(
          `Request body too large. Maximum size is ${maxSize} bytes.`,
          'PAYLOAD_TOO_LARGE',
        ),
      );
    }

    timer.end();
    next();
  };
};

/**
 * Validate content type
 * @param allowedTypes Allowed content types
 * @returns Express middleware
 */
export const validateContentType = (
  allowedTypes: string[] = ['application/json'],
): ((req: Request, res: Response, next: NextFunction) => void) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = startTimer('security.validateContentType', {
      path: req.path,
      method: req.method,
    });

    // Skip for GET, HEAD, and OPTIONS requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      timer.end();
      return next();
    }

    // Skip if no content
    if (!req.headers['content-length'] || req.headers['content-length'] === '0') {
      timer.end();
      return next();
    }

    const contentType = req.headers['content-type'];

    if (!contentType) {
      timer.end();
      return next(new BadRequestError('Content-Type header is required', 'CONTENT_TYPE_REQUIRED'));
    }

    // Check if content type is allowed
    const isAllowed = allowedTypes.some((type) => contentType.includes(type));

    if (!isAllowed) {
      timer.end();
      return next(
        new BadRequestError(
          `Unsupported content type. Allowed types: ${allowedTypes.join(', ')}`,
          'UNSUPPORTED_CONTENT_TYPE',
        ),
      );
    }

    timer.end();
    next();
  };
};

/**
 * Prevent clickjacking
 * @returns Express middleware
 */
export const preventClickjacking = (): ((
  req: Request,
  res: Response,
  next: NextFunction,
) => void) => {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  };
};

/**
 * Set secure headers
 * @returns Express middleware
 */
export const setSecureHeaders = (): ((req: Request, res: Response, next: NextFunction) => void) => {
  return (_req: Request, res: Response, next: NextFunction): void => {
    // Set strict transport security header
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

    // Set content type options header
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Set XSS protection header
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Set referrer policy header
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    next();
  };
};

/**
 * Set content security policy
 * @param directives CSP directives
 * @returns Express middleware
 */
export const setContentSecurityPolicy = (
  directives: Record<string, string[]> = {},
): ((req: Request, res: Response, next: NextFunction) => void) => {
  const defaultDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
  };

  const mergedDirectives = { ...defaultDirectives, ...directives };
  const cspString = Object.entries(mergedDirectives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');

  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Content-Security-Policy', cspString);
    next();
  };
};

/**
 * Sanitize request headers
 * @returns Express middleware
 */
export const sanitizeHeaders = (): ((req: Request, res: Response, next: NextFunction) => void) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Remove potentially dangerous headers
    const dangerousHeaders = ['x-powered-by', 'server'];

    dangerousHeaders.forEach((header) => {
      delete req.headers[header];
    });

    next();
  };
};

export default {
  configureSecurityMiddleware,
  validateBodySize,
  validateContentType,
  preventClickjacking,
  setSecureHeaders,
  setContentSecurityPolicy,
  sanitizeHeaders,
};
