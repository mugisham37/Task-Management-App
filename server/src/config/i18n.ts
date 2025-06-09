import i18next from 'i18next';
import i18nextBackend from 'i18next-fs-backend';
import i18nextMiddleware from 'i18next-http-middleware';
import path from 'path';
import fs from 'fs';
import logger from './logger';
import config from './environment';

// Supported languages
export const SUPPORTED_LANGUAGES = ['en', 'fr', 'es', 'de', 'zh'];

// Default language
export const DEFAULT_LANGUAGE = 'en';

// Ensure locales directory exists
const localesDir = path.join(__dirname, '../locales');
if (!fs.existsSync(localesDir)) {
  fs.mkdirSync(localesDir, { recursive: true });

  // Create default locale files if they don't exist
  SUPPORTED_LANGUAGES.forEach((lang) => {
    const langDir = path.join(localesDir, lang);
    if (!fs.existsSync(langDir)) {
      fs.mkdirSync(langDir, { recursive: true });
    }

    // Create translation.json if it doesn't exist
    const translationFile = path.join(langDir, 'translation.json');
    if (!fs.existsSync(translationFile)) {
      fs.writeFileSync(translationFile, '{}');
    }
  });
}

/**
 * Initialize i18next
 */
export const initI18n = async (): Promise<void> => {
  try {
    await i18next
      .use(i18nextBackend)
      .use(i18nextMiddleware.LanguageDetector)
      .init({
        backend: {
          loadPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.json'),
          addPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.missing.json'),
        },
        fallbackLng: DEFAULT_LANGUAGE,
        preload: SUPPORTED_LANGUAGES,
        saveMissing: config.nodeEnv === 'development',
        debug: config.nodeEnv === 'development',
        detection: {
          order: ['querystring', 'cookie', 'header'],
          lookupQuerystring: 'lang',
          lookupCookie: 'i18next',
          lookupHeader: 'accept-language',
          caches: ['cookie'],
        },
        ns: ['translation'],
        defaultNS: 'translation',
      });

    logger.info(`i18n initialized with languages: ${SUPPORTED_LANGUAGES.join(', ')}`);
  } catch (error) {
    logger.error('Failed to initialize i18n:', error);
    throw error;
  }
};

// Export i18next middleware
export const i18nMiddleware = i18nextMiddleware.handle(i18next);

// Export i18next instance
export default i18next;
