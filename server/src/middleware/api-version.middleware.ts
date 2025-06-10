import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../utils/app-error';
import { startTimer } from '../utils/performance-monitor';
import logger from '../config/logger';
import config from '../config/environment';

/**
 * API version configuration
 */
interface ApiVersionConfig {
  supportedVersions: string[];
  defaultVersion: string;
  deprecatedVersions?: string[];
  versionExtractor?: (req: Request) => string | undefined;
}

/**
 * Default API version configuration
 */
const defaultApiVersionConfig: ApiVersionConfig = {
  supportedVersions: ['v1', 'v2'],
  defaultVersion: 'v1',
  deprecatedVersions: [],
};

/**
 * Get API version configuration
 * @returns API version configuration
 */
export const getApiVersionConfig = (): ApiVersionConfig => {
  return {
    supportedVersions:
      config.apiSupportedVersions?.split(',') || defaultApiVersionConfig.supportedVersions,
    defaultVersion: config.apiDefaultVersion || defaultApiVersionConfig.defaultVersion,
    deprecatedVersions:
      config.apiDeprecatedVersions?.split(',') || defaultApiVersionConfig.deprecatedVersions,
  };
};

/**
 * Extract API version from request
 * @param req Express request
 * @param config API version configuration
 * @returns API version
 */
export const extractApiVersion = (
  req: Request,
  config: ApiVersionConfig = getApiVersionConfig(),
): string => {
  // Custom version extractor
  if (config.versionExtractor) {
    const version = config.versionExtractor(req);
    if (version) {
      return version;
    }
  }

  // Check URL path for version
  const urlVersion = req.path.split('/')[1];
  if (urlVersion && urlVersion.match(/^v\d+$/)) {
    return urlVersion;
  }

  // Check Accept header for version
  const acceptHeader = req.get('Accept');
  if (acceptHeader) {
    const versionMatch = acceptHeader.match(/application\/vnd\.taskmanagement\.([^+]+)\+json/);
    if (versionMatch && versionMatch[1]) {
      return versionMatch[1];
    }
  }

  // Check custom header for version
  const versionHeader = req.get('X-API-Version');
  if (versionHeader) {
    return versionHeader;
  }

  // Return default version
  return config.defaultVersion;
};

/**
 * Check if API version is supported
 * @param version API version
 * @param config API version configuration
 * @returns Whether the version is supported
 */
export const isVersionSupported = (
  version: string,
  config: ApiVersionConfig = getApiVersionConfig(),
): boolean => {
  return config.supportedVersions.includes(version);
};

/**
 * Check if API version is deprecated
 * @param version API version
 * @param config API version configuration
 * @returns Whether the version is deprecated
 */
export const isVersionDeprecated = (
  version: string,
  config: ApiVersionConfig = getApiVersionConfig(),
): boolean => {
  return config.deprecatedVersions?.includes(version) || false;
};

/**
 * API version middleware
 * @param options API version configuration
 * @returns Express middleware
 */
export const apiVersionMiddleware = (options: Partial<ApiVersionConfig> = {}) => {
  const config = { ...getApiVersionConfig(), ...options };

  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = startTimer('apiVersion.middleware', {
      path: req.path,
      method: req.method,
    });

    try {
      // Extract API version
      const version = extractApiVersion(req, config);

      // Check if version is supported
      if (!isVersionSupported(version, config)) {
        timer.end();
        return next(
          new BadRequestError(
            `API version ${version} is not supported. Supported versions: ${config.supportedVersions.join(', ')}`,
            'UNSUPPORTED_API_VERSION',
          ),
        );
      }

      // Add version to request
      req.apiVersion = version;

      // Add version to response headers
      res.setHeader('X-API-Version', version);

      // Add deprecation warning if version is deprecated
      if (isVersionDeprecated(version, config)) {
        res.setHeader(
          'Warning',
          `299 - "Deprecated API Version: ${version}. Please upgrade to the latest version."`,
        );
        logger.warn(`Deprecated API version used: ${version}`, {
          path: req.path,
          method: req.method,
          ip: req.ip,
          userId: req.user?.id,
        });
      }

      timer.end();
      next();
    } catch (error) {
      timer.end();
      logger.error('API version middleware error:', error);
      next(error);
    }
  };
};

/**
 * Route handler for specific API version
 * @param version API version
 * @param handler Route handler
 * @returns Versioned route handler
 */
export const versionedHandler = (
  version: string,
  handler: (req: Request, res: Response, next: NextFunction) => void,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.apiVersion === version) {
      return handler(req, res, next);
    }
    next();
  };
};

/**
 * Route handler for multiple API versions
 * @param versions API versions
 * @param handler Route handler
 * @returns Versioned route handler
 */
export const multiVersionHandler = (
  versions: string[],
  handler: (req: Request, res: Response, next: NextFunction) => void,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (versions.includes(req.apiVersion || '')) {
      return handler(req, res, next);
    }
    next();
  };
};

/**
 * Version-specific middleware
 * @param version API version
 * @param middleware Middleware function
 * @returns Versioned middleware
 */
export const versionedMiddleware = (
  version: string,
  middleware: (req: Request, res: Response, next: NextFunction) => void,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.apiVersion === version) {
      return middleware(req, res, next);
    }
    next();
  };
};

/**
 * Version range middleware
 * @param minVersion Minimum API version
 * @param maxVersion Maximum API version
 * @param middleware Middleware function
 * @returns Versioned middleware
 */
export const versionRangeMiddleware = (
  minVersion: string,
  maxVersion: string,
  middleware: (req: Request, res: Response, next: NextFunction) => void,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const version = req.apiVersion || '';

    // Extract version numbers
    const versionNum = parseInt(version.replace(/\D/g, ''), 10);
    const minVersionNum = parseInt(minVersion.replace(/\D/g, ''), 10);
    const maxVersionNum = parseInt(maxVersion.replace(/\D/g, ''), 10);

    if (versionNum >= minVersionNum && versionNum <= maxVersionNum) {
      return middleware(req, res, next);
    }

    next();
  };
};

export default {
  apiVersionMiddleware,
  versionedHandler,
  multiVersionHandler,
  versionedMiddleware,
  versionRangeMiddleware,
  extractApiVersion,
  isVersionSupported,
  isVersionDeprecated,
  getApiVersionConfig,
};
