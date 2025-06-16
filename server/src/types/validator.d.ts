declare module 'validator' {
  /**
   * Checks if the string is an email.
   */
  export function isEmail(str: string, options?: object): boolean;

  /**
   * Checks if the string is a URL.
   */
  export function isURL(str: string, options?: object): boolean;

  /**
   * Checks if the string contains only letters.
   */
  export function isAlpha(str: string, locale?: string): boolean;

  /**
   * Checks if the string contains only letters and numbers.
   */
  export function isAlphanumeric(str: string, locale?: string): boolean;

  /**
   * Checks if the string contains only numbers.
   */
  export function isNumeric(str: string, options?: object): boolean;

  /**
   * Checks if the string is a date.
   */
  export function isDate(str: string): boolean;

  /**
   * Checks if the string is a credit card.
   */
  export function isCreditCard(str: string): boolean;

  /**
   * Checks if the string is a UUID.
   */
  export function isUUID(str: string, version?: number): boolean;

  /**
   * Checks if the string is a MongoDB ObjectId.
   */
  export function isMongoId(str: string): boolean;

  /**
   * Checks if the string is a JSON.
   */
  export function isJSON(str: string): boolean;

  /**
   * Checks if the string is empty.
   */
  export function isEmpty(str: string, options?: object): boolean;

  /**
   * Checks if the string's length falls in a range.
   */
  export function isLength(str: string, options: { min?: number; max?: number }): boolean;

  /**
   * Trims characters from the beginning and end of the string.
   */
  export function trim(str: string, chars?: string): string;

  /**
   * Escapes HTML special characters.
   */
  export function escape(str: string): string;

  /**
   * Normalizes email addresses.
   */
  export function normalizeEmail(str: string, options?: object): string | false;

  // Add other validator functions as needed

  // Default export
  const validator: {
    isEmail: typeof isEmail;
    isURL: typeof isURL;
    isAlpha: typeof isAlpha;
    isAlphanumeric: typeof isAlphanumeric;
    isNumeric: typeof isNumeric;
    isDate: typeof isDate;
    isCreditCard: typeof isCreditCard;
    isUUID: typeof isUUID;
    isMongoId: typeof isMongoId;
    isJSON: typeof isJSON;
    isEmpty: typeof isEmpty;
    isLength: typeof isLength;
    trim: typeof trim;
    escape: typeof escape;
    normalizeEmail: typeof normalizeEmail;
    // Include other functions
  };

  export default validator;
}
