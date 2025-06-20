import mongoose from 'mongoose';
import User, { type IUser, UserRole } from '../models/user.model';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/app-error';
import { APIFeatures } from '../utils/api-features';
import { startTimer } from '../utils/performance-monitor';
import logger from '../config/logger';
import * as cache from '../utils/cache';
import * as activityService from './activity.service';
import { ActivityType } from '../models/activity.model';

/**
 * Get user by ID
 * @param userId User ID
 * @returns User
 */
export const getUserById = async (userId: string): Promise<IUser> => {
  const timer = startTimer('userService.getUserById');

  try {
    // Try to get from cache
    const cacheKey = `user:${userId}`;
    const cachedUser = cache.get<IUser>(cacheKey);
    if (cachedUser) {
      return cachedUser;
    }

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Cache user
    cache.set(cacheKey, user, 300); // Cache for 5 minutes

    return user;
  } catch (error) {
    logger.error(`Error getting user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get user profile
 * @param userId User ID
 * @returns User profile
 */
export const getUserProfile = async (userId: string): Promise<Partial<IUser>> => {
  const timer = startTimer('userService.getUserProfile');

  try {
    const user = await getUserById(userId);

    // Return only profile fields
    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  } catch (error) {
    logger.error(`Error getting user profile ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Update user profile
 * @param userId User ID
 * @param updateData Update data
 * @returns Updated user profile
 */
export const updateUserProfile = async (
  userId: string,
  updateData: {
    name?: string;
    email?: string;
  },
): Promise<Partial<IUser>> => {
  const timer = startTimer('userService.updateUserProfile');

  try {
    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check if email is being updated and if it's already in use
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await User.findOne({ email: updateData.email.toLowerCase() });
      if (existingUser) {
        throw new ValidationError('Email already in use');
      }
      updateData.email = updateData.email.toLowerCase();
    }

    // Update user
    Object.assign(user, updateData);
    await user.save();

    // Invalidate cache
    cache.del(`user:${userId}`);

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_UPDATED, // Using existing activity type
      data: {
        action: 'user_profile_updated',
        updates: Object.keys(updateData),
      },
    });

    // Return updated profile
    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  } catch (error) {
    logger.error(`Error updating user profile ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Search users
 * @param query Search query
 * @param options Search options
 * @returns Users matching the search query
 */
export const searchUsers = async (
  query: string,
  options: {
    limit?: number;
    excludeIds?: string[];
    teamId?: string;
    workspaceId?: string;
  } = {},
): Promise<Partial<IUser>[]> => {
  const timer = startTimer('userService.searchUsers');

  try {
    const { limit = 10, excludeIds = [] } = options;

    // Build search criteria
    const searchCriteria: mongoose.FilterQuery<IUser> = {
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
      ],
    };

    // Exclude specified user IDs
    if (excludeIds.length > 0) {
      searchCriteria._id = { $nin: excludeIds.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    // Find users matching the search criteria
    const users = await User.find(searchCriteria).select('name email').limit(limit);

    return users.map((user) => ({
      id: user._id,
      name: user.name,
      email: user.email,
    }));
  } catch (error) {
    logger.error('Error searching users:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get users by role
 * @param role User role
 * @returns Users with the specified role
 */
export const getUsersByRole = async (role: UserRole): Promise<Partial<IUser>[]> => {
  const timer = startTimer('userService.getUsersByRole');

  try {
    // Find users by role
    const users = await User.find({ role }).select('name email role');

    return users.map((user) => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    }));
  } catch (error) {
    logger.error(`Error getting users by role ${role}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Update user preferences
 * @param userId User ID
 * @param preferences User preferences
 * @returns Success message
 */
export const updateUserPreferences = async (
  userId: string,
  preferences: Record<string, any>,
): Promise<{ message: string }> => {
  const timer = startTimer('userService.updateUserPreferences');

  try {
    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Update user preferences
    await User.findByIdAndUpdate(userId, {
      $set: { preferences },
    });

    // Invalidate cache
    cache.del(`user:${userId}`);

    return { message: 'User preferences updated successfully' };
  } catch (error) {
    logger.error(`Error updating user preferences ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get all users with pagination
 * @param queryParams Query parameters
 * @returns Users and pagination metadata
 */
export const getUsers = async (
  queryParams: Record<string, any>,
): Promise<{
  data: Partial<IUser>[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('userService.getUsers');

  try {
    // Create base query
    const query = User.find();

    // Apply API features (filtering, sorting, pagination)
    const features = new APIFeatures(query, queryParams)
      .filter()
      .search(['name', 'email'])
      .sort()
      .limitFields()
      .paginate();

    // Execute query with pagination metadata
    const result = await features.execute();

    // Map users to remove sensitive fields
    const users = result.data.map((user) => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    return {
      data: users,
      total: result.total,
      page: result.page,
      limit: result.limit,
      pages: result.pages,
    };
  } catch (error) {
    logger.error('Error getting users:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Deactivate user
 * @param userId User ID
 * @param adminId Admin user ID
 * @returns Success message
 */
export const deactivateUser = async (
  userId: string,
  adminId: string,
): Promise<{ message: string }> => {
  const timer = startTimer('userService.deactivateUser');

  try {
    // Check if admin user exists and has admin role
    const adminUser = await User.findById(adminId);
    if (!adminUser || adminUser.role !== UserRole.ADMIN) {
      throw new ForbiddenError('Only administrators can deactivate users');
    }

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Prevent deactivating an admin user
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenError('Cannot deactivate an administrator');
    }

    // Deactivate user
    user.isActive = false;
    await user.save();

    // Invalidate cache
    cache.del(`user:${userId}`);

    // Create activity log
    await activityService.createActivity(adminId, {
      type: ActivityType.TASK_UPDATED, // Using existing activity type
      data: {
        action: 'user_deactivated',
        userId,
        userName: user.name,
        userEmail: user.email,
      },
    });

    return { message: 'User deactivated successfully' };
  } catch (error) {
    logger.error(`Error deactivating user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Activate user
 * @param userId User ID
 * @param adminId Admin user ID
 * @returns Success message
 */
export const activateUser = async (
  userId: string,
  adminId: string,
): Promise<{ message: string }> => {
  const timer = startTimer('userService.activateUser');

  try {
    // Check if admin user exists and has admin role
    const adminUser = await User.findById(adminId);
    if (!adminUser || adminUser.role !== UserRole.ADMIN) {
      throw new ForbiddenError('Only administrators can activate users');
    }

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Activate user
    user.isActive = true;
    await user.save();

    // Invalidate cache
    cache.del(`user:${userId}`);

    // Create activity log
    await activityService.createActivity(adminId, {
      type: ActivityType.TASK_UPDATED, // Using existing activity type
      data: {
        action: 'user_activated',
        userId,
        userName: user.name,
        userEmail: user.email,
      },
    });

    return { message: 'User activated successfully' };
  } catch (error) {
    logger.error(`Error activating user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Change user role
 * @param userId User ID
 * @param role New role
 * @param adminId Admin user ID
 * @returns Success message
 */
export const changeUserRole = async (
  userId: string,
  role: UserRole,
  adminId: string,
): Promise<{ message: string }> => {
  const timer = startTimer('userService.changeUserRole');

  try {
    // Check if admin user exists and has admin role
    const adminUser = await User.findById(adminId);
    if (!adminUser || adminUser.role !== UserRole.ADMIN) {
      throw new ForbiddenError('Only administrators can change user roles');
    }

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Change user role
    user.role = role;
    await user.save();

    // Invalidate cache
    cache.del(`user:${userId}`);

    // Create activity log
    await activityService.createActivity(adminId, {
      type: ActivityType.TASK_UPDATED, // Using existing activity type
      data: {
        action: 'user_role_changed',
        userId,
        userName: user.name,
        userEmail: user.email,
        oldRole: user.role,
        newRole: role,
      },
    });

    return { message: `User role changed to ${role} successfully` };
  } catch (error) {
    logger.error(`Error changing user role ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Delete user
 * @param userId User ID
 * @param adminId Admin user ID
 * @returns Success message
 */
export const deleteUser = async (userId: string, adminId: string): Promise<{ message: string }> => {
  const timer = startTimer('userService.deleteUser');

  try {
    // Check if admin user exists and has admin role
    const adminUser = await User.findById(adminId);
    if (!adminUser || adminUser.role !== UserRole.ADMIN) {
      throw new ForbiddenError('Only administrators can delete users');
    }

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Prevent deleting an admin user
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenError('Cannot delete an administrator');
    }

    // Get user info for activity log
    const userName = user.name;
    const userEmail = user.email;

    // Delete user
    await user.deleteOne();

    // Invalidate cache
    cache.del(`user:${userId}`);

    // Create activity log
    await activityService.createActivity(adminId, {
      type: ActivityType.TASK_UPDATED, // Using existing activity type
      data: {
        action: 'user_deleted',
        userId,
        userName,
        userEmail,
      },
    });

    return { message: 'User deleted successfully' };
  } catch (error) {
    logger.error(`Error deleting user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get user dashboard data
 * @param userId User ID
 * @returns User dashboard data
 */
export const getUserDashboardData = async (userId: string): Promise<any> => {
  const timer = startTimer('userService.getUserDashboardData');

  try {
    // Try to get from cache
    const cacheKey = `user:${userId}:dashboard`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Get user dashboard data
    // This is a placeholder - in a real implementation, you would get data from various services
    const dashboardData = {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      stats: {
        // Placeholder stats
        tasksTotal: 0,
        tasksCompleted: 0,
        projectsTotal: 0,
        teamsTotal: 0,
      },
      recentActivity: [],
    };

    // Cache dashboard data
    cache.set(cacheKey, dashboardData, 300); // Cache for 5 minutes

    return dashboardData;
  } catch (error) {
    logger.error(`Error getting user dashboard data ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};
