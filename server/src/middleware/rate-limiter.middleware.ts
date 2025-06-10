import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
// @ts-expect-error - Missing type declarations
import RedisStore from 'rate-limit-redis';
// @ts-expect-error - Missing type declarations
import { createClient } from 'redis';
import { RateLimitError } from '../utils/app-error';
import config from '../config/environment';
import logger from '../config/logger';
import { startTimer } from '../utils/performance-monitor';

/**
 * Redis client interface
 */
interface RedisClient {
  sendCommand: (args: string[]) => Promise<unknown>;
  connect: () => Promise<void>;
  on: (event: string, callback: (arg: unknown) => void) => void;
  url?: string;
  socket?: {
    reconnectStrategy?: (retries: number) => number;
  };
}

/**
 * Redis store interface
 */
interface RedisStoreType {
  sendCommand: (...args: string[]) => Promise<unknown>;
}

/**
 * Rate limit options interface
 */
interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  statusCode?: number;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  requestPropertyName?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  store?: RedisStoreType | unknown;
}

/**
 * Express application interface
 */
interface ExpressApp {
  use: (
    path: string | ((req: Request, res: Response, next: NextFunction) => void),
    middleware?: (req: Request, res: Response, next: NextFunction) => void,
  ) => void;
}

// Initialize Redis client for rate limiting if Redis URL is provided
let redisClient: RedisClient | null = null;
let redisStore: RedisStoreType | null = null;

// Create Redis client for rate limiting if Redis URL is provided
if (config.redisUrl && config.useRedis) {
  try {
    redisClient = createClient({
      url: config.redisUrl,
      socket: {
        reconnectStrategy: (retries: number) => Math.min(retries * 50, 1000),
      },
    });

    if (redisClient) {
      redisClient.on('error', (arg: unknown) => {
        const err = arg as Error;
        logger.error('Redis client error:', err);
      });

      redisClient.on('connect', () => {
        logger.info('Redis client connected for rate limiting');
      });

      // Connect to Redis
      redisClient.connect().catch((err: Error) => {
        logger.error('Failed to connect to Redis:', err);
      });

      // Create Redis store for rate limiting
      redisStore = new RedisStore({
        sendCommand: async (...args: string[]) =>
          redisClient?.sendCommand(args) || Promise.resolve(null),
      });

      logger.info('Redis store initialized for rate limiting');
    }
  } catch (error) {
    logger.error('Failed to initialize Redis for rate limiting:', error);
  }
}

/**
 * Default rate limit options
 */
const defaultOptions: RateLimitOptions = {
  windowMs: config.rateLimitWindowMs || 15 * 60 * 1000, // 15 minutes by default
  max: config.rateLimitMax || 100, // 100 requests per window by default
  message: 'Too many requests, please try again later',
  statusCode: 429,
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
};

/**
 * Create rate limiter middleware
 * @param options Rate limit options
 * @returns Express middleware
 */
export const createRateLimiter = (options: RateLimitOptions = {}) => {
  const mergedOptions = { ...defaultOptions, ...options };

  // Use Redis store if available
  if (redisStore && config.useRedis) {
    mergedOptions.store = redisStore;
  }

  // Create rate limiter
  return rateLimit({
    windowMs: mergedOptions.windowMs!,
    max: mergedOptions.max!,
    message: {
      success: false,
      message: mergedOptions.message,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: mergedOptions.message,
      },
    },
    statusCode: mergedOptions.statusCode,
    skipSuccessfulRequests: mergedOptions.skipSuccessfulRequests,
    keyGenerator: mergedOptions.keyGenerator || ((req) => req.ip || 'unknown'),
    skip: mergedOptions.skip || ((_req) => false),
    requestPropertyName: mergedOptions.requestPropertyName,
    standardHeaders: mergedOptions.standardHeaders,
    legacyHeaders: mergedOptions.legacyHeaders,
    handler: (req: Request, res: Response, next: NextFunction) => {
      next(new RateLimitError(mergedOptions.message));
    },
  });
};

/**
 * Default rate limiter middleware
 * Uses default options
 */
export const rateLimiter = createRateLimiter();

/**
 * API rate limiter middleware
 * More strict limits for API endpoints
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per window
  message: 'Too many API requests, please try again later',
  skip: (req) => {
    // Skip health check endpoints
    return req.path === '/health' || req.path === '/api/health';
  },
});

/**
 * Authentication rate limiter middleware
 * More strict limits for authentication endpoints
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: 'Too many authentication attempts, please try again later',
});

/**
 * User-specific rate limiter middleware
 * Limits requests based on user ID
 */
export const userRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many requests from this user, please try again later',
  keyGenerator: (req) => {
    // Use user ID if available, otherwise fall back to IP, with a fallback to ensure string return
    return req.user?.id ? `user:${req.user.id}` : req.ip || 'unknown';
  },
});

/**
 * IP-based rate limiter middleware
 * Limits requests based on IP address
 */
export const ipRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 500, // 500 requests per 5 minutes
  message: 'Too many requests from this IP, please try again later',
  keyGenerator: (req) => req.ip || 'unknown',
});

/**
 * Dynamic rate limiter middleware
 * Creates a rate limiter with dynamic options based on the request
 * @param getOptions Function to get rate limit options from request
 * @returns Express middleware
 */
export const dynamicRateLimiter = (getOptions: (req: Request) => RateLimitOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timer = startTimer('rate-limiter.dynamic', {
      path: req.path,
      method: req.method,
    });

    try {
      // Get options from request
      const options = getOptions(req);

      // Create rate limiter
      const limiter = createRateLimiter(options);

      // Apply rate limiter
      timer.end();
      limiter(req, res, next);
    } catch (error) {
      timer.end();
      logger.error('Dynamic rate limiter error:', {
        error,
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      next(error);
    }
  };
};

/**
 * Configure rate limiting for an Express application
 * @param app Express application
 */
export const configureRateLimiting = (app: ExpressApp) => {
  // Apply global rate limiter
  app.use(rateLimiter);

  // Apply API rate limiter to API routes
  app.use('/api', apiRateLimiter);

  // Apply authentication rate limiter to auth routes
  app.use('/api/auth', authRateLimiter);

  logger.info('Rate limiting configured');
};

export default {
  rateLimiter,
  apiRateLimiter,
  authRateLimiter,
  userRateLimiter,
  ipRateLimiter,
  dynamicRateLimiter,
  createRateLimiter,
  configureRateLimiting,
};
