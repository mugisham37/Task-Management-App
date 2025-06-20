import jwt from 'jsonwebtoken';
// bcrypt is imported by the User model
import crypto from 'crypto';
import User, { IUser, UserRole } from '../models/user.model';
import { UnauthorizedError, NotFoundError, BadRequestError } from '../utils/app-error';
import config from '../config/environment';
import logger from '../config/logger';
import { startTimer } from '../utils/performance-monitor';
import * as emailService from './email.service';
import { JwtPayload } from '../types/jwt.types';

/**
 * Register a new user
 * @param userData User registration data
 * @returns Registered user and tokens
 */
export const register = async (userData: {
  name: string;
  email: string;
  password: string;
}): Promise<{
  user: Partial<IUser>;
  token: string;
  refreshToken: string;
}> => {
  const timer = startTimer('authService.register');

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email: userData.email.toLowerCase() });
    if (existingUser) {
      throw new BadRequestError('Email already in use');
    }

    // Create new user
    const user = new User({
      name: userData.name,
      email: userData.email.toLowerCase(),
      password: userData.password,
      role: UserRole.USER,
      isEmailVerified: false,
    });

    // Generate verification token
    const verificationToken = user.createEmailVerificationToken();

    // Save user
    await user.save();

    // Send verification email
    await emailService.sendVerificationEmail(user.email, verificationToken);

    // Generate tokens
    const token = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();
    await user.save();

    // Return user data and tokens
    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
      token,
      refreshToken,
    };
  } catch (error) {
    logger.error('Error registering user:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Login user
 * @param email User email
 * @param password User password
 * @returns Logged in user and tokens
 */
export const login = async (
  email: string,
  password: string,
): Promise<{
  user: Partial<IUser>;
  token: string;
  refreshToken: string;
}> => {
  const timer = startTimer('authService.login');

  try {
    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedError('Your account has been deactivated');
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Update last login
    user.lastLoginAt = new Date();

    // Generate tokens
    const token = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();
    await user.save();

    // Return user data and tokens
    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
      token,
      refreshToken,
    };
  } catch (error) {
    logger.error('Error logging in user:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Refresh token
 * @param refreshToken Refresh token
 * @returns New tokens
 */
export const refreshToken = async (
  refreshToken: string,
): Promise<{
  token: string;
  refreshToken: string;
}> => {
  const timer = startTimer('authService.refreshToken');

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, config.jwtSecret) as JwtPayload;

    // Find user
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Generate new tokens
    const token = user.generateAuthToken();
    const newRefreshToken = user.generateRefreshToken();
    await user.save();

    // Return new tokens
    return {
      token,
      refreshToken: newRefreshToken,
    };
  } catch (error) {
    logger.error('Error refreshing token:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Verify JWT token
 * @param token JWT token
 * @returns Decoded token payload
 */
export const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token expired', 'TOKEN_EXPIRED');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token', 'INVALID_TOKEN');
    }
    throw new UnauthorizedError('Token verification failed', 'TOKEN_VERIFICATION_FAILED');
  }
};

/**
 * Verify email
 * @param token Verification token
 * @returns Success message
 */
export const verifyEmail = async (token: string): Promise<{ message: string }> => {
  const timer = startTimer('authService.verifyEmail');

  try {
    // Hash token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with token
    const user = await User.findOne({
      verificationToken: hashedToken,
      verificationTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestError('Invalid or expired token');
    }

    // Update user
    user.isEmailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    return { message: 'Email verified successfully' };
  } catch (error) {
    logger.error('Error verifying email:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Request password reset
 * @param email User email
 * @returns Success message
 */
export const requestPasswordReset = async (email: string): Promise<{ message: string }> => {
  const timer = startTimer('authService.requestPasswordReset');

  try {
    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal that the user doesn't exist
      return { message: 'If your email is registered, you will receive a password reset link' };
    }

    // Generate reset token
    const resetToken = user.createPasswordResetToken();
    await user.save();

    // Send password reset email
    await emailService.sendPasswordResetEmail(user.email, resetToken);

    return { message: 'If your email is registered, you will receive a password reset link' };
  } catch (error) {
    logger.error('Error requesting password reset:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Reset password
 * @param token Reset token
 * @param newPassword New password
 * @returns Success message
 */
export const resetPassword = async (
  token: string,
  newPassword: string,
): Promise<{ message: string }> => {
  const timer = startTimer('authService.resetPassword');

  try {
    // Hash token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestError('Invalid or expired token');
    }

    // Update password
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return { message: 'Password reset successfully' };
  } catch (error) {
    logger.error('Error resetting password:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Change password
 * @param userId User ID
 * @param currentPassword Current password
 * @param newPassword New password
 * @returns Success message
 */
export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ message: string }> => {
  const timer = startTimer('authService.changePassword');

  try {
    // Find user by ID
    const user = await User.findById(userId).select('+password');
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      throw new BadRequestError('Current password is incorrect');
    }

    // Update password
    user.password = newPassword;
    await user.save();

    return { message: 'Password changed successfully' };
  } catch (error) {
    logger.error('Error changing password:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Logout user
 * @param userId User ID
 * @returns Success message
 */
export const logout = async (userId: string): Promise<{ message: string }> => {
  const timer = startTimer('authService.logout');

  try {
    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Clear refresh token
    user.refreshToken = undefined;
    await user.save();

    return { message: 'Logged out successfully' };
  } catch (error) {
    logger.error('Error logging out user:', error);
    throw error;
  } finally {
    timer.end();
  }
};
