import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { BadRequestError } from '../utils/app-error';
import logger from '../config/logger';
import { startTimer } from '../utils/performance-monitor';
import config from '../config/environment';

/**
 * Upload options interface
 */
interface UploadOptions {
  destination?: string;
  limits?: {
    fileSize?: number;
    files?: number;
  };
  allowedTypes?: string[];
  generateFilename?: (file: Express.Multer.File) => string;
  storage?: 'disk' | 's3' | 'memory';
  fileFilter?: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => void;
}

/**
 * Default upload options
 */
const defaultUploadOptions: UploadOptions = {
  destination: config.uploadDir,
  limits: {
    fileSize: config.maxFileSize,
    files: 5,
  },
  allowedTypes: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
  ],
  storage: 'disk',
  generateFilename: (file) => {
    const uniqueId = uuidv4();
    const extension = path.extname(file.originalname);
    const sanitizedName = path
      .basename(file.originalname, extension)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');
    return `${sanitizedName}-${uniqueId}${extension}`;
  },
};

/**
 * Create file filter function
 * @param allowedTypes Allowed file types
 * @returns File filter function
 */
export const createFileFilter = (allowedTypes: string[] = defaultUploadOptions.allowedTypes!) => {
  return (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const timer = startTimer('upload.fileFilter', {
      mimetype: file.mimetype,
      originalname: file.originalname,
    });

    if (!allowedTypes.includes(file.mimetype)) {
      timer.end();
      return cb(
        new BadRequestError(
          `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
          'FILE_TYPE_NOT_ALLOWED',
        ),
      );
    }

    timer.end();
    cb(null, true);
  };
};

/**
 * Configure disk storage
 * @param options Upload options
 * @returns Multer disk storage
 */
export const configureDiskStorage = (options: UploadOptions = {}): multer.StorageEngine => {
  // Get options with defaults
  const destination = options.destination || defaultUploadOptions.destination!;
  const generateFilename = options.generateFilename || defaultUploadOptions.generateFilename!;

  // Create destination directory if it doesn't exist
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
    logger.info(`Created upload directory: ${destination}`);
  }

  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, destination);
    },
    filename: (req, file, cb) => {
      const filename = generateFilename(file);
      cb(null, filename);
    },
  });
};

/**
 * Configure memory storage
 * @returns Multer memory storage
 */
export const configureMemoryStorage = (): multer.StorageEngine => {
  return multer.memoryStorage();
};

/**
 * Configure S3 storage
 * @returns Multer storage engine
 */
export const configureS3Storage = (): multer.StorageEngine => {
  // This is a placeholder for S3 storage configuration
  // In a real implementation, you would use a package like multer-s3
  logger.warn('S3 storage is not fully implemented. Using disk storage instead.');
  return configureDiskStorage();
};

/**
 * Configure storage based on options
 * @param options Upload options
 * @returns Multer storage engine
 */
export const configureStorage = (options: UploadOptions = {}): multer.StorageEngine => {
  // Merge default options with provided options
  const storage = options.storage || defaultUploadOptions.storage;

  switch (storage) {
    case 's3':
      return configureS3Storage();
    case 'memory':
      return configureMemoryStorage();
    case 'disk':
    default:
      return configureDiskStorage(options);
  }
};

/**
 * Create upload middleware
 * @param options Upload options
 * @returns Multer middleware
 */
export const createUploadMiddleware = (options: UploadOptions = {}) => {
  const storage = configureStorage(options);
  const fileFilter =
    options.fileFilter ||
    createFileFilter(options.allowedTypes || defaultUploadOptions.allowedTypes);

  return multer({
    storage,
    limits: options.limits || defaultUploadOptions.limits,
    fileFilter,
  });
};

/**
 * Single file upload middleware
 * @param fieldName Field name
 * @param options Upload options
 * @returns Express middleware
 */
export const uploadSingleFile = (fieldName: string, options: UploadOptions = {}) => {
  const upload = createUploadMiddleware(options);

  return (req: Request, res: Response, next: NextFunction) => {
    const timer = startTimer('upload.single', {
      fieldName,
      path: req.path,
    });

    upload.single(fieldName)(req, res, (err) => {
      timer.end();

      if (err) {
        if (err instanceof multer.MulterError) {
          // Multer error
          logger.error('Multer error:', err);
          return next(new BadRequestError(err.message, 'UPLOAD_ERROR'));
        }

        // Other error
        return next(err);
      }

      next();
    });
  };
};

/**
 * Multiple files upload middleware
 * @param fieldName Field name
 * @param maxCount Maximum number of files
 * @param options Upload options
 * @returns Express middleware
 */
export const uploadMultipleFiles = (
  fieldName: string,
  maxCount: number = 5,
  options: UploadOptions = {},
) => {
  const upload = createUploadMiddleware(options);

  return (req: Request, res: Response, next: NextFunction) => {
    const timer = startTimer('upload.array', {
      fieldName,
      maxCount,
      path: req.path,
    });

    upload.array(fieldName, maxCount)(req, res, (err) => {
      timer.end();

      if (err) {
        if (err instanceof multer.MulterError) {
          // Multer error
          logger.error('Multer error:', err);
          return next(new BadRequestError(err.message, 'UPLOAD_ERROR'));
        }

        // Other error
        return next(err);
      }

      next();
    });
  };
};

/**
 * Multiple fields upload middleware
 * @param fields Fields configuration
 * @param options Upload options
 * @returns Express middleware
 */
export const uploadFields = (
  fields: { name: string; maxCount: number }[],
  options: UploadOptions = {},
) => {
  const upload = createUploadMiddleware(options);

  return (req: Request, res: Response, next: NextFunction) => {
    const timer = startTimer('upload.fields', {
      fields: fields.map((f) => f.name).join(','),
      path: req.path,
    });

    upload.fields(fields)(req, res, (err) => {
      timer.end();

      if (err) {
        if (err instanceof multer.MulterError) {
          // Multer error
          logger.error('Multer error:', err);
          return next(new BadRequestError(err.message, 'UPLOAD_ERROR'));
        }

        // Other error
        return next(err);
      }

      next();
    });
  };
};

/**
 * Process uploaded image
 * @param _options Processing options (currently unused)
 * @returns Express middleware
 */
export const processImage = (
  _options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'jpeg' | 'png' | 'webp';
  } = {},
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if no file
    if (!req.file && (!req.files || Object.keys(req.files).length === 0)) {
      return next();
    }

    // This is a placeholder for image processing
    // In a real implementation, you would use a package like sharp
    logger.info('Image processing is not fully implemented.');
    next();
  };
};

/**
 * Clean up temporary files
 * @returns Express middleware
 */
export const cleanupTempFiles = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original end method
    const originalEnd = res.end;

    // Override end method
    res.end = function (this: Response, ...args: unknown[]): Response {
      // Call original end method
      // @ts-expect-error - Type checking for this call is complex due to multiple signatures
      originalEnd.apply(this, args);

      // Clean up temporary files
      if (req.file?.path) {
        fs.unlink(req.file.path, (err) => {
          if (err) {
            logger.error(`Failed to delete temporary file: ${req.file?.path}`, err);
          }
        });
      }

      // Handle req.files which can be an array or an object of arrays
      if (req.files) {
        if (Array.isArray(req.files)) {
          // Array of files
          req.files.forEach((file: Express.MulterFile) => {
            if (file?.path) {
              fs.unlink(file.path, (err) => {
                if (err) {
                  logger.error(`Failed to delete temporary file: ${file.path}`, err);
                }
              });
            }
          });
        } else {
          // Object of files
          Object.entries(req.files as Express.MulterFiles).forEach(([_, fieldFiles]) => {
            if (Array.isArray(fieldFiles)) {
              fieldFiles.forEach((file: Express.MulterFile) => {
                if (file?.path) {
                  fs.unlink(file.path, (err) => {
                    if (err) {
                      logger.error(`Failed to delete temporary file: ${file.path}`, err);
                    }
                  });
                }
              });
            }
          });
        }
      }

      // Return this to maintain chainability
      return this;
    };

    next();
  };
};

export default {
  uploadSingleFile,
  uploadMultipleFiles,
  uploadFields,
  processImage,
  cleanupTempFiles,
  createUploadMiddleware,
  createFileFilter,
  configureStorage,
};
