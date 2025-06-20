import mongoose from 'mongoose';
import Activity, { type IActivity, ActivityType } from '../models/activity.model';
import User from '../models/user.model';
import { NotFoundError } from '../utils/app-error';
import { APIFeatures } from '../utils/api-features';
import * as cache from '../utils/cache';
import { startTimer } from '../utils/performance-monitor';
import logger from '../config/logger';

/**
 * Create a new activity log
 * @param userId User ID
 * @param activityData Activity data
 * @returns Created activity
 */
export const createActivity = async (
  userId: string,
  activityData: {
    type: ActivityType;
    task?: mongoose.Types.ObjectId | string;
    project?: mongoose.Types.ObjectId | string;
    workspace?: mongoose.Types.ObjectId | string;
    team?: mongoose.Types.ObjectId | string;
    data?: Record<string, any>;
  },
): Promise<IActivity> => {
  const timer = startTimer('activityService.createActivity');

  try {
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Create activity
    const activity = await Activity.create({
      ...activityData,
      user: userId,
    });

    // Invalidate cache for related entities
    if (activityData.task) {
      cache.delByPattern(`taskActivities:${activityData.task}`);
    }

    if (activityData.project) {
      cache.delByPattern(`projectActivities:${activityData.project}`);
    }

    if (activityData.workspace) {
      cache.delByPattern(`workspaceActivities:${activityData.workspace}`);
    }

    if (activityData.team) {
      cache.delByPattern(`teamActivities:${activityData.team}`);
    }

    cache.delByPattern(`userActivities:${userId}`);

    return activity;
  } catch (error) {
    logger.error('Error creating activity:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get activities for a user
 * @param userId User ID
 * @param queryParams Query parameters
 * @returns Activities and pagination metadata
 */
export const getUserActivities = async (
  userId: string,
  queryParams: Record<string, any> = {},
): Promise<{
  data: IActivity[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('activityService.getUserActivities');

  try {
    // Try to get from cache if no filters are applied
    const hasFilters = Object.keys(queryParams).some(
      (key) => !['page', 'limit', 'sort'].includes(key),
    );
    const cacheKey = `userActivities:${userId}:${JSON.stringify(queryParams)}`;

    if (!hasFilters) {
      const cachedActivities = cache.get(cacheKey);
      if (cachedActivities) {
        return cachedActivities;
      }
    }

    // Find activities for the user
    const query = Activity.find({ user: userId });

    // Apply filters for specific resources if provided
    if (queryParams.task) {
      query.find({ task: queryParams.task });
    }

    if (queryParams.project) {
      query.find({ project: queryParams.project });
    }

    if (queryParams.workspace) {
      query.find({ workspace: queryParams.workspace });
    }

    if (queryParams.team) {
      query.find({ team: queryParams.team });
    }

    if (queryParams.type) {
      query.find({ type: queryParams.type });
    }

    // Apply API features (filtering, sorting, pagination)
    const features = new APIFeatures(query, queryParams)
      .filter()
      .sort('-createdAt') // Default sort by most recent
      .limitFields()
      .paginate();

    // Execute query with pagination metadata
    const result = await features.execute();

    // Cache result if no filters
    if (!hasFilters) {
      cache.set(cacheKey, result, 300); // Cache for 5 minutes
    }

    return result;
  } catch (error) {
    logger.error(`Error getting activities for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get activities for a task
 * @param taskId Task ID
 * @param queryParams Query parameters
 * @returns Activities and pagination metadata
 */
export const getTaskActivities = async (
  taskId: string,
  queryParams: Record<string, any> = {},
): Promise<{
  data: IActivity[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('activityService.getTaskActivities');

  try {
    // Try to get from cache if no filters are applied
    const hasFilters = Object.keys(queryParams).some(
      (key) => !['page', 'limit', 'sort'].includes(key),
    );
    const cacheKey = `taskActivities:${taskId}:${JSON.stringify(queryParams)}`;

    if (!hasFilters) {
      const cachedActivities = cache.get(cacheKey);
      if (cachedActivities) {
        return cachedActivities;
      }
    }

    // Find activities for the task
    const query = Activity.find({ task: taskId });

    // Apply API features (filtering, sorting, pagination)
    const features = new APIFeatures(query, queryParams)
      .filter()
      .sort('-createdAt') // Default sort by most recent
      .limitFields()
      .paginate();

    // Execute query with pagination metadata
    const result = await features.execute();

    // Cache result if no filters
    if (!hasFilters) {
      cache.set(cacheKey, result, 300); // Cache for 5 minutes
    }

    return result;
  } catch (error) {
    logger.error(`Error getting activities for task ${taskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get activities for a project
 * @param projectId Project ID
 * @param queryParams Query parameters
 * @returns Activities and pagination metadata
 */
export const getProjectActivities = async (
  projectId: string,
  queryParams: Record<string, any> = {},
): Promise<{
  data: IActivity[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('activityService.getProjectActivities');

  try {
    // Try to get from cache if no filters are applied
    const hasFilters = Object.keys(queryParams).some(
      (key) => !['page', 'limit', 'sort'].includes(key),
    );
    const cacheKey = `projectActivities:${projectId}:${JSON.stringify(queryParams)}`;

    if (!hasFilters) {
      const cachedActivities = cache.get(cacheKey);
      if (cachedActivities) {
        return cachedActivities;
      }
    }

    // Find activities for the project
    const query = Activity.find({ project: projectId });

    // Apply API features (filtering, sorting, pagination)
    const features = new APIFeatures(query, queryParams)
      .filter()
      .sort('-createdAt') // Default sort by most recent
      .limitFields()
      .paginate();

    // Execute query with pagination metadata
    const result = await features.execute();

    // Cache result if no filters
    if (!hasFilters) {
      cache.set(cacheKey, result, 300); // Cache for 5 minutes
    }

    return result;
  } catch (error) {
    logger.error(`Error getting activities for project ${projectId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get activities for a team
 * @param teamId Team ID
 * @param queryParams Query parameters
 * @returns Activities and pagination metadata
 */
export const getTeamActivities = async (
  teamId: string,
  queryParams: Record<string, any> = {},
): Promise<{
  data: IActivity[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('activityService.getTeamActivities');

  try {
    // Try to get from cache if no filters are applied
    const hasFilters = Object.keys(queryParams).some(
      (key) => !['page', 'limit', 'sort'].includes(key),
    );
    const cacheKey = `teamActivities:${teamId}:${JSON.stringify(queryParams)}`;

    if (!hasFilters) {
      const cachedActivities = cache.get(cacheKey);
      if (cachedActivities) {
        return cachedActivities;
      }
    }

    // Find activities for the team
    const query = Activity.find({ team: teamId });

    // Apply API features (filtering, sorting, pagination)
    const features = new APIFeatures(query, queryParams)
      .filter()
      .sort('-createdAt') // Default sort by most recent
      .limitFields()
      .paginate();

    // Execute query with pagination metadata
    const result = await features.execute();

    // Cache result if no filters
    if (!hasFilters) {
      cache.set(cacheKey, result, 300); // Cache for 5 minutes
    }

    return result;
  } catch (error) {
    logger.error(`Error getting activities for team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get activities for a workspace
 * @param workspaceId Workspace ID
 * @param queryParams Query parameters
 * @returns Activities and pagination metadata
 */
export const getWorkspaceActivities = async (
  workspaceId: string,
  queryParams: Record<string, any> = {},
): Promise<{
  data: IActivity[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('activityService.getWorkspaceActivities');

  try {
    // Try to get from cache if no filters are applied
    const hasFilters = Object.keys(queryParams).some(
      (key) => !['page', 'limit', 'sort'].includes(key),
    );
    const cacheKey = `workspaceActivities:${workspaceId}:${JSON.stringify(queryParams)}`;

    if (!hasFilters) {
      const cachedActivities = cache.get(cacheKey);
      if (cachedActivities) {
        return cachedActivities;
      }
    }

    // Find activities for the workspace
    const query = Activity.find({ workspace: workspaceId });

    // Apply API features (filtering, sorting, pagination)
    const features = new APIFeatures(query, queryParams)
      .filter()
      .sort('-createdAt') // Default sort by most recent
      .limitFields()
      .paginate();

    // Execute query with pagination metadata
    const result = await features.execute();

    // Cache result if no filters
    if (!hasFilters) {
      cache.set(cacheKey, result, 300); // Cache for 5 minutes
    }

    return result;
  } catch (error) {
    logger.error(`Error getting activities for workspace ${workspaceId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Delete old activities
 * @param days Number of days to keep activities (default: 90)
 * @returns Number of deleted activities
 */
export const deleteOldActivities = async (days = 90): Promise<number> => {
  const timer = startTimer('activityService.deleteOldActivities');

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await Activity.deleteMany({
      createdAt: { $lt: cutoffDate },
    });

    return result.deletedCount;
  } catch (error) {
    logger.error(`Error deleting old activities:`, error);
    throw error;
  } finally {
    timer.end();
  }
};
