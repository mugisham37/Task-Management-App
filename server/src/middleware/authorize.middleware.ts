import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/app-error';
import logger from '../config/logger';
import { startTimer } from '../utils/performance-monitor';

/**
 * Request with user property
 */
interface RequestWithUser extends Request {
  user?: {
    id: string;
    role: string;
    permissions?: string[];
    [key: string]: unknown;
  };
}

/**
 * Resource ownership check function type
 */
type OwnershipCheckFn = (req: RequestWithUser, resourceId: string) => Promise<boolean>;

/**
 * Check if user has required role
 * @param user User object
 * @param roles Required roles
 * @returns Whether user has required role
 */
export const hasRole = (user: RequestWithUser['user'], roles: string | string[]): boolean => {
  if (!user || !user.role) {
    return false;
  }

  const requiredRoles = Array.isArray(roles) ? roles : [roles];
  // Special case: 'admin' role has access to everything
  if (user.role === 'admin') {
    return true;
  }

  return requiredRoles.includes(user.role);
};

/**
 * Check if user has required permission
 * @param user User object
 * @param permissions Required permissions
 * @returns Whether user has required permission
 */
export const hasPermission = (
  user: RequestWithUser['user'],
  permissions: string | string[],
): boolean => {
  if (!user || !user.permissions) {
    return false;
  }

  // Special case: 'admin' role has all permissions
  if (user.role === 'admin') {
    return true;
  }

  const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
  return requiredPermissions.some((permission) => user.permissions?.includes(permission));
};

/**
 * Check if user is resource owner
 * @param req Request object
 * @param resourceId Resource ID
 * @param options Ownership check options
 * @returns Whether user is resource owner
 */
export const isResourceOwner = async (
  req: RequestWithUser,
  resourceId: string,
  ownershipCheckFn?: OwnershipCheckFn,
): Promise<boolean> => {
  if (!req.user || !req.user.id) {
    return false;
  }

  // If custom ownership check function is provided, use it
  if (ownershipCheckFn) {
    return ownershipCheckFn(req, resourceId);
  }

  // Default ownership check (user ID matches resource owner ID)
  return req.user.id === resourceId;
};

/**
 * Get resource ID from request
 * @param req Request object
 * @param resourceField Resource field name
 * @returns Resource ID
 */
export const getResourceId = (
  req: RequestWithUser,
  resourceField: string = 'id',
): string | undefined => {
  // Check params first
  if (req.params && req.params[resourceField]) {
    return req.params[resourceField];
  }

  // Check body
  if (req.body && req.body[resourceField]) {
    return req.body[resourceField];
  }

  // Check query
  if (req.query && req.query[resourceField]) {
    return req.query[resourceField] as string;
  }

  return undefined;
};

/**
 * Role-based authorization middleware
 * @param roles Allowed roles
 * @returns Express middleware
 */
export const authorize = (roles: string | string[]) => {
  return (req: RequestWithUser, res: Response, next: NextFunction): void => {
    const timer = startTimer('authorize.middleware', {
      path: req.path,
      method: req.method,
      roles: Array.isArray(roles) ? roles : [roles],
    });

    try {
      // Check if user exists in request
      if (!req.user) {
        timer.end();
        return next(new ForbiddenError('User not authenticated'));
      }

      // Check if user has required role
      if (!hasRole(req.user, roles)) {
        timer.end();
        return next(new ForbiddenError('Insufficient permissions'));
      }

      timer.end();
      next();
    } catch (error) {
      timer.end();
      logger.error('Authorization error:', {
        error,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
        roles: Array.isArray(roles) ? roles : [roles],
      });
      next(error);
    }
  };
};

/**
 * Permission-based authorization middleware
 * @param permissions Required permissions
 * @returns Express middleware
 */
export const requirePermissions = (permissions: string | string[]) => {
  return (req: RequestWithUser, res: Response, next: NextFunction): void => {
    const timer = startTimer('authorize.permissions', {
      path: req.path,
      method: req.method,
      permissions: Array.isArray(permissions) ? permissions : [permissions],
    });

    try {
      // Check if user exists in request
      if (!req.user) {
        timer.end();
        return next(new ForbiddenError('User not authenticated'));
      }

      // Check if user has required permissions
      if (!hasPermission(req.user, permissions)) {
        timer.end();
        return next(new ForbiddenError('Insufficient permissions'));
      }

      timer.end();
      next();
    } catch (error) {
      timer.end();
      logger.error('Permission check error:', {
        error,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
        permissions: Array.isArray(permissions) ? permissions : [permissions],
      });
      next(error);
    }
  };
};

/**
 * Resource ownership authorization middleware
 * @param options Ownership check options
 * @returns Express middleware
 */
export const requireOwnership = (
  options: {
    resourceField?: string;
    ownershipCheckFn?: OwnershipCheckFn;
    allowedRoles?: string[];
  } = {},
) => {
  const { resourceField = 'id', ownershipCheckFn, allowedRoles = ['admin'] } = options;

  return async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    const timer = startTimer('authorize.ownership', {
      path: req.path,
      method: req.method,
      resourceField,
    });

    try {
      // Check if user exists in request
      if (!req.user) {
        timer.end();
        return next(new ForbiddenError('User not authenticated'));
      }

      // Check if user has bypass roles
      if (allowedRoles.length > 0 && hasRole(req.user, allowedRoles)) {
        timer.end();
        return next();
      }

      // Get resource ID
      const resourceId = getResourceId(req, resourceField);
      if (!resourceId) {
        timer.end();
        return next(new ForbiddenError(`Resource ID not found in request (${resourceField})`));
      }

      // Check ownership
      const isOwner = await isResourceOwner(req, resourceId, ownershipCheckFn);
      if (!isOwner) {
        timer.end();
        return next(new ForbiddenError('You do not have permission to access this resource'));
      }

      timer.end();
      next();
    } catch (error) {
      timer.end();
      logger.error('Ownership check error:', {
        error,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
        resourceField,
      });
      next(error);
    }
  };
};

/**
 * Combined authorization middleware
 * Checks roles, permissions, and ownership
 * @param options Authorization options
 * @returns Express middleware
 */
export const authorizeResource = (options: {
  roles?: string[];
  permissions?: string[];
  resourceField?: string;
  ownershipCheckFn?: OwnershipCheckFn;
  requireAllPermissions?: boolean;
}) => {
  const {
    roles,
    permissions,
    resourceField = 'id',
    ownershipCheckFn,
    requireAllPermissions = false,
  } = options;

  return async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    const timer = startTimer('authorize.resource', {
      path: req.path,
      method: req.method,
      roles,
      permissions,
      resourceField,
    });

    try {
      // Check if user exists in request
      if (!req.user) {
        timer.end();
        return next(new ForbiddenError('User not authenticated'));
      }

      // Check roles if specified
      if (roles && roles.length > 0) {
        if (!hasRole(req.user, roles)) {
          timer.end();
          return next(new ForbiddenError('Insufficient role permissions'));
        }
      }

      // Check permissions if specified
      if (permissions && permissions.length > 0) {
        const hasRequiredPermissions = requireAllPermissions
          ? permissions.every((permission) => hasPermission(req.user!, permission))
          : permissions.some((permission) => hasPermission(req.user!, permission));

        if (!hasRequiredPermissions) {
          timer.end();
          return next(new ForbiddenError('Insufficient permissions'));
        }
      }

      // Check ownership if resourceField is specified
      if (resourceField) {
        const resourceId = getResourceId(req, resourceField);
        if (resourceId) {
          const isOwner = await isResourceOwner(req, resourceId, ownershipCheckFn);
          if (!isOwner && !hasRole(req.user, 'admin')) {
            timer.end();
            return next(new ForbiddenError('You do not have permission to access this resource'));
          }
        }
      }

      timer.end();
      next();
    } catch (error) {
      timer.end();
      logger.error('Resource authorization error:', {
        error,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
        roles,
        permissions,
        resourceField,
      });
      next(error);
    }
  };
};

export default {
  authorize,
  requirePermissions,
  requireOwnership,
  authorizeResource,
  hasRole,
  hasPermission,
  isResourceOwner,
  getResourceId,
};
