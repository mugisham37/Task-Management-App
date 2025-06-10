import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../utils/app-error';
import config from '../config/environment';
import User, { IUserDocument } from '../models/user.model';
import logger from '../config/logger';
import { get, set } from '../utils/cache';
import { startTimer } from '../utils/performance-monitor';
import { JwtPayload } from '../types/jwt.types';

/**
 * Extended request interface with user property
 */
export interface AuthRequest extends Omit<Request, 'user'> {
  user?: IUserDocument;
  accessToken?: string;
  refreshToken?: string;
}

/**
 * Token payload interface
 */
interface TokenPayload extends JwtPayload {
  id: string;
  role: string;
}

/**
 * Authentication options interface
 */
interface AuthOptions {
  optional?: boolean;
  roles?: string[];
  cacheEnabled?: boolean;
  cacheTTL?: number;
}

/**
 * Extract token from request
 * @param req Express request
 * @returns Token string or null
 */
export const extractToken = (req: Request | AuthRequest): string | null => {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check cookies
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  // Check query parameter (not recommended for production)
  if (req.query && req.query.token && typeof req.query.token === 'string') {
    return req.query.token;
  }

  return null;
};

/**
 * Verify JWT token
 * @param token JWT token
 * @returns Decoded token payload
 */
export const verifyToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token expired', 'TOKEN_EXPIRED');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token', 'INVALID_TOKEN');
    }
    throw new UnauthorizedError('Token verification failed', 'TOKEN_VERIFICATION_FAILED');
  }
};

/**
 * Get user from token payload
 * @param payload Token payload
 * @param options Authentication options
 * @returns User document
 */
export const getUserFromToken = async (
  payload: TokenPayload,
  options: AuthOptions = {},
): Promise<IUserDocument> => {
  const { cacheEnabled = true, cacheTTL = 300 } = options;
  const cacheKey = `user:${payload.id}`;

  // Try to get user from cache
  if (cacheEnabled) {
    const cachedUser = get(cacheKey);
    if (cachedUser) {
      return cachedUser as IUserDocument;
    }
  }

  // Get user from database
  const user = await User.findById(payload.id);

  if (!user) {
    throw new UnauthorizedError('User not found', 'USER_NOT_FOUND');
  }

  // Cache user
  if (cacheEnabled) {
    set(cacheKey, user, cacheTTL);
  }

  return user;
};

/**
 * Authentication middleware
 * @param options Authentication options
 * @returns Express middleware
 */
export const auth = (options: AuthOptions = {}) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const timer = startTimer('auth.middleware', {
      path: req.path,
      method: req.method,
      optional: options.optional,
    });

    try {
      // Extract token
      const token = extractToken(req);

      // Handle missing token
      if (!token) {
        if (options.optional) {
          return next();
        }
        throw new UnauthorizedError('Authentication token is required', 'TOKEN_REQUIRED');
      }

      // Verify token
      const decoded = verifyToken(token);

      // Get user
      const user = await getUserFromToken(decoded, options);

      // Check roles if specified
      if (options.roles && options.roles.length > 0) {
        if (!options.roles.includes(user.role)) {
          throw new UnauthorizedError('Insufficient permissions', 'INSUFFICIENT_PERMISSIONS');
        }
      }

      // Attach user to request
      req.user = user;

      // Update last login time if needed
      if (req.path === '/api/auth/login' || req.path === '/api/auth/refresh') {
        await User.findByIdAndUpdate(user.id, { lastLogin: new Date() });
      }

      // Add token info to response headers
      res.setHeader('X-User-Id', user.id);

      timer.end();
      next();
    } catch (error) {
      timer.end();
      logger.warn('Authentication error:', {
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
 * Optional authentication middleware
 * Same as auth middleware but doesn't require authentication
 * @returns Express middleware
 */
export const optionalAuth = () => {
  return auth({ optional: true });
};

/**
 * Role-based authentication middleware
 * @param roles Allowed roles
 * @returns Express middleware
 */
export const requireRoles = (roles: string | string[]) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return auth({ roles: allowedRoles });
};

/**
 * Refresh token middleware
 * @returns Express middleware
 */
export const refreshToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const refreshToken = req.body.refreshToken || req.cookies.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token is required', 'REFRESH_TOKEN_REQUIRED');
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, config.jwtSecret) as TokenPayload;

    // Get user
    const user = await User.findById(decoded.id).select('+refreshToken');

    if (!user || user.refreshToken !== refreshToken) {
      throw new UnauthorizedError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }

    // Generate new tokens
    const accessToken = user.generateAuthToken();
    const newRefreshToken = user.generateRefreshToken();

    // Save new refresh token
    await user.save();

    // Set tokens in response
    res.cookie('token', accessToken, {
      httpOnly: true,
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Attach tokens to request for controllers
    req.accessToken = accessToken;
    req.refreshToken = newRefreshToken;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Refresh token expired', 'REFRESH_TOKEN_EXPIRED'));
    } else {
      next(error);
    }
  }
};

export default {
  auth,
  optionalAuth,
  requireRoles,
  refreshToken,
  extractToken,
  verifyToken,
  getUserFromToken,
};
