import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import config from './environment';

// Define the structure of the request-scoped logger if not already defined in express.d.ts
interface RequestScopedLogger {
  info: (message: string, metadata?: Record<string, unknown>) => void;
}

// Use the Request interface from express which already has the user and logger properties
interface ExtendedRequest extends Request {
  ip: string;
  method: string;
  originalUrl: string;
}

// Create logs directory if it doesn't exist
const logDir = config.logDir || 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

// Define console format (more readable for development)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} ${level}: ${message} ${metaString}`;
  }),
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logLevel || 'info',
  format: logFormat,
  defaultMeta: { service: 'task-management-api' },
  transports: [
    // Write logs to files
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  ],
});

// Add console transport in development
if (config.nodeEnv !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    }),
  );
}

// Create a stream object for Morgan
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Add request context middleware
export const requestLogger = (req: ExtendedRequest, res: Response, next: NextFunction) => {
  // Generate a unique request ID
  const requestId =
    req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);

  // Create a request-scoped logger
  const requestScopedLogger: RequestScopedLogger = {
    info: (message: string, metadata?: Record<string, unknown>) => {
      return logger.info(message, {
        requestId,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userId: req.user?.id,
        ...(metadata || {}),
      });
    },
  };

  // Attach the request-scoped logger to the request object
  req.logger = requestScopedLogger;

  next();
};

export default logger;
