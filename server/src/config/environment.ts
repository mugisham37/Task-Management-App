import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

/**
 * Environment configuration interface
 */
export interface EnvironmentConfig {
  // Server
  nodeEnv: string;
  port: number;
  apiVersion: string;
  apiUrl: string;
  frontendUrl: string;

  // API Version
  apiSupportedVersions?: string;
  apiDefaultVersion?: string;
  apiDeprecatedVersions?: string;

  // Database
  mongodbUri: string;

  // JWT
  jwtSecret: string;
  jwtAccessExpiration: string | number;
  jwtRefreshExpiration: string | number;

  // Email
  emailService: string;
  emailUser: string;
  emailPassword: string;
  emailFrom: string;

  // Rate limiting
  rateLimitWindowMs: number;
  rateLimitMax: number;

  // Logging
  logLevel: string;
  logDir: string;

  // Jobs
  enableJobs: boolean;

  // Cache
  disableCache: string;
  disableAuditLog?: string;

  // File uploads
  uploadDir: string;
  maxFileSize: number;

  // Monitoring
  enableMonitoring: boolean;
  monitoringInterval: number;

  // Security
  corsOrigin: string;

  // Redis
  redisUrl: string;
  useRedis: boolean;

  // Internationalization
  defaultLanguage: string;
  supportedLanguages: string[];
}

// Environment variables
const environment: EnvironmentConfig = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number.parseInt(process.env.PORT || '3000', 10),
  apiVersion: process.env.API_VERSION || 'v1',
  apiUrl:
    process.env.API_URL ||
    `http://localhost:${process.env.PORT || 3000}/api/${process.env.API_VERSION || 'v1'}`,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // API Version
  apiSupportedVersions: process.env.API_SUPPORTED_VERSIONS || 'v1,v2',
  apiDefaultVersion: process.env.API_DEFAULT_VERSION || 'v1',
  apiDeprecatedVersions: process.env.API_DEPRECATED_VERSIONS || '',

  // Database
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/task-management',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtAccessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
  jwtRefreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',

  // Email
  emailService: process.env.EMAIL_SERVICE || 'gmail',
  emailUser: process.env.EMAIL_USER || '',
  emailPassword: process.env.EMAIL_PASSWORD || '',
  emailFrom: process.env.EMAIL_FROM || 'noreply@taskmanagement.com',

  // Rate limiting
  rateLimitWindowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '15000', 10),
  rateLimitMax: Number.parseInt(process.env.RATE_LIMIT_MAX || '100', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR || path.join(process.cwd(), 'logs'),

  // Jobs
  enableJobs: process.env.ENABLE_JOBS === 'true',

  // Cache
  disableCache: process.env.DISABLE_CACHE || 'false',

  // File uploads
  uploadDir: process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
  maxFileSize: Number.parseInt(process.env.MAX_FILE_SIZE || '5242880', 10), // 5MB

  // Monitoring
  enableMonitoring: process.env.ENABLE_MONITORING !== 'false',
  monitoringInterval: Number.parseInt(process.env.MONITORING_INTERVAL || '60000', 10), // 1 minute

  // Security
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Redis (for distributed caching and rate limiting)
  redisUrl: process.env.REDIS_URL || '',
  useRedis: process.env.USE_REDIS === 'true',

  // Internationalization
  defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en',
  supportedLanguages: (process.env.SUPPORTED_LANGUAGES || 'en,fr,es,de,zh').split(','),
};

export default environment;
