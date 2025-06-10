import type { StringValue } from 'ms';

/**
 * Type definition for JWT expiration values
 * Can be either a number (seconds) or a string in the format expected by the ms package
 * Examples: "2 days", "10h", "7d", "1y", etc.
 */
export type JWTExpiration = StringValue | number;

/**
 * Type alias for JWT expiration that's compatible with jsonwebtoken's SignOptions.expiresIn
 */
export type JWTExpiresIn = StringValue | number;

/**
 * Validates if a value is a valid JWT expiration format
 * @param value - The value to validate
 * @returns boolean indicating if the value is a valid JWT expiration
 */
export function isValidJWTExpiration(value: JWTExpiration): boolean {
  if (typeof value === 'number') {
    return value > 0;
  }
  if (typeof value === 'string') {
    // Check for numeric string (e.g., "60")
    if (/^\d+$/.test(value)) {
      return true;
    }
    // Check for format like "60s", "2h", "7d", etc.
    if (/^\d+[smhdwy]$/i.test(value)) {
      return true;
    }
    // Check for format like "60 seconds", "2 hours", "7 days", etc.
    const fullUnitPattern = /^\d+\s+(seconds?|minutes?|hours?|days?|weeks?|years?)$/i;
    if (fullUnitPattern.test(value)) {
      return true;
    }
    // Check for abbreviated units with space (e.g., "60 s", "2 h", "7 d")
    const abbrevUnitPattern = /^\d+\s+[smhdwy]$/i;
    return abbrevUnitPattern.test(value);
  }
  return false;
}
