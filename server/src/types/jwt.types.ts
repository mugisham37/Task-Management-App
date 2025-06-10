/**
 * JWT payload interface
 */
export interface JwtPayload {
  /**
   * User ID
   */
  id: string;

  /**
   * User role
   */
  role: string;

  /**
   * User permissions
   */
  permissions?: string[];

  /**
   * Token issued at timestamp
   */
  iat?: number;

  /**
   * Token expiration timestamp
   */
  exp?: number;

  /**
   * Token issuer
   */
  iss?: string;

  /**
   * Token subject
   */
  sub?: string;

  /**
   * Token audience
   */
  aud?: string;

  /**
   * Token not before timestamp
   */
  nbf?: number;

  /**
   * Token JWT ID
   */
  jti?: string;

  /**
   * Additional custom claims
   */
  [key: string]: unknown;
}

/**
 * Refresh token payload interface
 */
export interface RefreshTokenPayload {
  /**
   * User ID
   */
  id: string;

  /**
   * Token type
   */
  type: 'refresh';

  /**
   * Token version
   */
  version: number;

  /**
   * Token issued at timestamp
   */
  iat?: number;

  /**
   * Token expiration timestamp
   */
  exp?: number;

  /**
   * Token JWT ID
   */
  jti?: string;
}

/**
 * Token response interface
 */
export interface TokenResponse {
  /**
   * Access token
   */
  accessToken: string;

  /**
   * Refresh token
   */
  refreshToken: string;

  /**
   * Token type
   */
  tokenType: string;

  /**
   * Expiration time in seconds
   */
  expiresIn: number;
}

// No default export needed for type definitions
