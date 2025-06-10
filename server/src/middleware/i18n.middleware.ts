import { Request, Response, NextFunction } from 'express';
import i18next from 'i18next';
import { startTimer } from '../utils/performance-monitor';
import logger from '../config/logger';
import { TranslationOptions, I18nInitOptions } from '../types/i18n.types';

/**
 * Supported languages
 */
export const SUPPORTED_LANGUAGES = ['en', 'fr', 'es', 'de', 'ja', 'zh'];

/**
 * Default language
 */
export const DEFAULT_LANGUAGE = 'en';

/**
 * Language detection options
 */
interface LanguageDetectionOptions {
  supportedLanguages?: string[];
  defaultLanguage?: string;
  cookieName?: string;
  queryParameter?: string;
  headerName?: string;
  lookupOrder?: ('query' | 'cookie' | 'header' | 'path')[];
  setCookie?: boolean;
  cookieOptions?: {
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
  };
}

/**
 * Default language detection options
 */
const defaultLanguageDetectionOptions: LanguageDetectionOptions = {
  supportedLanguages: SUPPORTED_LANGUAGES,
  defaultLanguage: DEFAULT_LANGUAGE,
  cookieName: 'i18next',
  queryParameter: 'lang',
  headerName: 'accept-language',
  lookupOrder: ['query', 'cookie', 'header'],
  setCookie: true,
  cookieOptions: {
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  },
};

/**
 * Detect language from request
 * @param req Express request
 * @param options Language detection options
 * @returns Detected language
 */
export const detectLanguage = (
  req: Request,
  options: LanguageDetectionOptions = defaultLanguageDetectionOptions,
): string => {
  const mergedOptions = { ...defaultLanguageDetectionOptions, ...options };
  const supportedLanguages = mergedOptions.supportedLanguages || SUPPORTED_LANGUAGES;
  const defaultLanguage = mergedOptions.defaultLanguage || DEFAULT_LANGUAGE;
  let detectedLanguage: string | undefined;

  // Check in the specified order
  for (const lookup of mergedOptions.lookupOrder || []) {
    if (detectedLanguage) break;

    switch (lookup) {
      case 'query':
        // Check query parameter
        if (req.query[mergedOptions.queryParameter || 'lang']) {
          detectedLanguage = req.query[mergedOptions.queryParameter || 'lang'] as string;
        }
        break;

      case 'cookie':
        // Check cookie
        if (req.cookies && req.cookies[mergedOptions.cookieName || 'i18next']) {
          detectedLanguage = req.cookies[mergedOptions.cookieName || 'i18next'];
        }
        break;

      case 'header':
        // Check Accept-Language header
        if (req.headers[mergedOptions.headerName || 'accept-language']) {
          const acceptLanguage = req.headers[
            mergedOptions.headerName || 'accept-language'
          ] as string;
          if (acceptLanguage) {
            // Parse Accept-Language header
            const languages = acceptLanguage.split(',').map((lang) => {
              const [langCode, qValue] = lang.trim().split(';q=');
              return {
                code: langCode.split('-')[0].toLowerCase(),
                quality: qValue ? parseFloat(qValue) : 1.0,
              };
            });

            // Sort by quality value
            languages.sort((a, b) => b.quality - a.quality);

            // Find first supported language
            const supportedLang = languages.find((lang) => supportedLanguages.includes(lang.code));
            if (supportedLang) {
              detectedLanguage = supportedLang.code;
            }
          }
        }
        break;

      case 'path':
        // Check URL path for language code
        const pathParts = req.path.split('/').filter(Boolean);
        if (pathParts.length > 0 && supportedLanguages.includes(pathParts[0])) {
          detectedLanguage = pathParts[0];
        }
        break;
    }
  }

  // Validate detected language
  if (!detectedLanguage || !supportedLanguages.includes(detectedLanguage)) {
    detectedLanguage = defaultLanguage;
  }

  return detectedLanguage;
};

/**
 * Language middleware
 * @param options Language detection options
 * @returns Express middleware
 */
export const languageMiddleware = (options: LanguageDetectionOptions = {}) => {
  const mergedOptions = { ...defaultLanguageDetectionOptions, ...options };

  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = startTimer('i18n.language', {
      path: req.path,
      method: req.method,
    });

    try {
      // Detect language
      const language = detectLanguage(req, mergedOptions);

      // Set language for the request
      req.language = language;

      // Change i18next language
      if (i18next.isInitialized) {
        i18next.changeLanguage(language);
      }

      // Set language cookie if enabled
      if (mergedOptions.setCookie && mergedOptions.cookieName) {
        res.cookie(mergedOptions.cookieName, language, {
          maxAge: mergedOptions.cookieOptions?.maxAge,
          httpOnly: mergedOptions.cookieOptions?.httpOnly,
          secure:
            mergedOptions.cookieOptions?.secure ||
            req.secure ||
            req.headers['x-forwarded-proto'] === 'https',
          sameSite: mergedOptions.cookieOptions?.sameSite,
        });
      }

      // Set language header
      res.setHeader('Content-Language', language);

      timer.end();
      next();
    } catch (error) {
      timer.end();
      logger.error('Language middleware error:', error);
      next(error);
    }
  };
};

/**
 * Get translation function for the current request
 * @param req Express request
 * @returns Translation function
 */
export const getTranslation = (req: Request) => {
  return (key: string, options?: TranslationOptions) => {
    return i18next.t(key, { lng: req.language, ...options });
  };
};

/**
 * Translation middleware
 * @returns Express middleware
 */
export const translationMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = startTimer('i18n.translation', {
      path: req.path,
      method: req.method,
    });

    // Add translation function to request
    req.t = (key: string, options?: TranslationOptions) => {
      const translation = i18next.t(key, { lng: req.language, ...options });
      // Ensure we return a string
      return typeof translation === 'string' ? translation : JSON.stringify(translation);
    };

    timer.end();
    next();
  };
};

/**
 * Initialize i18next
 * @param options i18next options
 */
export const initializeI18n = async (options: I18nInitOptions = {}): Promise<void> => {
  try {
    // Initialize i18next
    await i18next.init({
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: SUPPORTED_LANGUAGES,
      load: 'languageOnly',
      ns: ['translation'],
      defaultNS: 'translation',
      interpolation: {
        escapeValue: false,
      },
      ...options,
    });

    logger.info('i18next initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize i18next:', error);
  }
};

/**
 * i18n middleware
 * @param options Language detection options
 * @returns Express middleware
 */
export const i18nMiddleware = (options: LanguageDetectionOptions = {}) => {
  return [languageMiddleware(options), translationMiddleware()];
};

export default {
  i18nMiddleware,
  languageMiddleware,
  translationMiddleware,
  detectLanguage,
  getTranslation,
  initializeI18n,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
};
