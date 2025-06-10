declare global {
  namespace Express {
    /**
     * Extended Multer File interface with additional properties
     */
    interface MulterFile extends Multer.File {
      path?: string;
    }

    /**
     * Type for files object in multipart/form-data requests
     */
    type MulterFiles = {
      [fieldname: string]: MulterFile[];
    };

    interface Request {
      /**
       * Authenticated user
       */
      user?: {
        id: string;
        role: string;
        permissions?: string[];
        // Removed [key: string]: any; and replaced with specific properties
        // that might be added by the application
      };

      /**
       * API version
       */
      apiVersion?: string;

      /**
       * Current language
       */
      language?: string;

      /**
       * Translation function
       */
      t?: (key: string, options?: import('./i18n.types').TranslationOptions) => string;

      /**
       * Validation errors
       */
      validationErrors?: Record<string, string>[];

      /**
       * Request ID
       */
      id?: string;

      /**
       * Validated data - replaced any with a more specific type
       */
      validatedData?: {
        body?: Record<string, unknown>;
        query?: Record<string, unknown>;
        params?: Record<string, unknown>;
        headers?: Record<string, unknown>;
      };

      /**
       * Original URL before rewrite
       */
      originalUrl?: string;

      /**
       * Request start time
       */
      startTime?: number;

      /**
       * Request correlation ID
       */
      correlationId?: string;

      /**
       * File uploaded via multer (single file upload)
       */
      file?: MulterFile;

      /**
       * Files uploaded via multer (multiple files upload)
       * Can be an array of files or an object of arrays of files
       */
      files?: MulterFile[] | MulterFiles;
    }
  }
}

export {};
