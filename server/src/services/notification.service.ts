import mongoose from 'mongoose';
import Notification, { type INotification, NotificationType } from '../models/notification.model';
import { NotFoundError } from '../utils/app-error';
import { APIFeatures } from '../utils/api-features';
import * as cache from '../utils/cache';
import { startTimer } from '../utils/performance-monitor';
import logger from '../config/logger';
import * as websocketService from './websocket.service';

/**
 * Create a notification
 * @param userId User ID
 * @param notificationData Notification data
 * @returns Created notification
 */
export const createNotification = async (
  userId: string,
  notificationData: {
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, unknown>;
  },
): Promise<INotification> => {
  const timer = startTimer('notificationService.createNotification');

  try {
    // Create notification
    const notification = await Notification.create({
      user: userId,
      type: notificationData.type,
      title: notificationData.title,
      message: notificationData.message,
      data: notificationData.data || {},
      isRead: false,
    });

    // Send real-time notification if websocket service is available
    try {
      websocketService.sendUserNotification(userId, {
        id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
      });
    } catch (error) {
      logger.warn('Failed to send real-time notification:', error);
    }

    // Invalidate notifications cache
    cache.del(`notifications:${userId}`);

    return notification;
  } catch (error) {
    logger.error('Error creating notification:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Create a task due soon notification
 * @param userId User ID
 * @param taskId Task ID
 * @param taskTitle Task title
 * @param dueDate Due date
 * @returns Created notification
 */
export const createTaskDueSoonNotification = async (
  userId: string,
  taskId: string,
  taskTitle: string,
  dueDate: Date,
): Promise<INotification> => {
  const dueDateTime = new Date(dueDate).toLocaleString();

  return createNotification(userId, {
    type: NotificationType.TASK_DUE_SOON,
    title: 'Task Due Soon',
    message: `Your task "${taskTitle}" is due soon (${dueDateTime})`,
    data: {
      taskId,
      taskTitle,
      dueDate,
    },
  });
};

/**
 * Create a task overdue notification
 * @param userId User ID
 * @param taskId Task ID
 * @param taskTitle Task title
 * @returns Created notification
 */
export const createTaskOverdueNotification = async (
  userId: string,
  taskId: string,
  taskTitle: string,
): Promise<INotification> => {
  return createNotification(userId, {
    type: NotificationType.TASK_OVERDUE,
    title: 'Task Overdue',
    message: `Your task "${taskTitle}" is overdue`,
    data: {
      taskId,
      taskTitle,
    },
  });
};

/**
 * Create a task assigned notification
 * @param userId User ID
 * @param taskId Task ID
 * @param taskTitle Task title
 * @param assignerId Assigner ID
 * @returns Created notification
 */
export const createTaskAssignedNotification = async (
  userId: string,
  taskId: string,
  taskTitle: string,
  assignerId: string,
): Promise<INotification> => {
  return createNotification(userId, {
    type: NotificationType.TASK_ASSIGNED,
    title: 'Task Assigned',
    message: `You have been assigned to the task "${taskTitle}"`,
    data: {
      taskId,
      taskTitle,
      assignerId,
    },
  });
};

/**
 * Get notifications for a user
 * @param userId User ID
 * @param queryParams Query parameters
 * @returns Notifications and pagination metadata
 */
export const getNotifications = async (
  userId: string,
  queryParams: Record<string, unknown> = {},
): Promise<{
  data: INotification[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('notificationService.getNotifications');

  try {
    // Try to get from cache if no filters are applied
    const hasFilters = Object.keys(queryParams).some(
      (key) => !['page', 'limit', 'sort'].includes(key),
    );
    const cacheKey = `notifications:${userId}:${JSON.stringify(queryParams)}`;

    if (!hasFilters) {
      const cachedNotifications = cache.get<{
        data: INotification[];
        total: number;
        page: number;
        limit: number;
        pages: number;
      }>(cacheKey);
      if (cachedNotifications) {
        return cachedNotifications;
      }
    }

    // Create base query for user's notifications
    const query = Notification.find({ user: userId });

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
    logger.error(`Error getting notifications for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Mark notification as read
 * @param notificationId Notification ID
 * @param userId User ID
 * @returns Updated notification
 */
export const markAsRead = async (
  notificationId: string,
  userId: string,
): Promise<INotification> => {
  const timer = startTimer('notificationService.markAsRead');

  try {
    // Find notification by ID
    const notification = await Notification.findById(notificationId);

    // Check if notification exists
    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    // Check if notification belongs to user
    if ((notification.user as mongoose.Types.ObjectId).toString() !== userId) {
      throw new NotFoundError('Notification not found');
    }

    // Check if notification is already read
    if (notification.isRead) {
      return notification;
    }

    // Update notification
    notification.isRead = true;
    await notification.save();

    // Invalidate cache
    cache.delByPattern(`notifications:${userId}`);

    return notification;
  } catch (error) {
    logger.error(`Error marking notification ${notificationId} as read:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Mark all notifications as read
 * @param userId User ID
 * @returns Number of updated notifications
 */
export const markAllAsRead = async (userId: string): Promise<{ count: number }> => {
  const timer = startTimer('notificationService.markAllAsRead');

  try {
    // Update all unread notifications for user
    const result = await Notification.updateMany({ user: userId, isRead: false }, { isRead: true });

    // Invalidate cache
    cache.delByPattern(`notifications:${userId}`);

    return { count: result.modifiedCount };
  } catch (error) {
    logger.error(`Error marking all notifications as read for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Delete a notification
 * @param notificationId Notification ID
 * @param userId User ID
 * @returns Success message
 */
export const deleteNotification = async (
  notificationId: string,
  userId: string,
): Promise<{ message: string }> => {
  const timer = startTimer('notificationService.deleteNotification');

  try {
    // Find notification by ID
    const notification = await Notification.findById(notificationId);

    // Check if notification exists
    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    // Check if notification belongs to user
    if ((notification.user as mongoose.Types.ObjectId).toString() !== userId) {
      throw new NotFoundError('Notification not found');
    }

    // Delete notification
    await notification.deleteOne();

    // Invalidate cache
    cache.delByPattern(`notifications:${userId}`);

    return { message: 'Notification deleted successfully' };
  } catch (error) {
    logger.error(`Error deleting notification ${notificationId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Delete all read notifications
 * @param userId User ID
 * @returns Number of deleted notifications
 */
export const deleteReadNotifications = async (userId: string): Promise<{ count: number }> => {
  const timer = startTimer('notificationService.deleteReadNotifications');

  try {
    // Delete all read notifications for user
    const result = await Notification.deleteMany({ user: userId, isRead: true });

    // Invalidate cache
    cache.delByPattern(`notifications:${userId}`);

    return { count: result.deletedCount };
  } catch (error) {
    logger.error(`Error deleting read notifications for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get unread notifications count
 * @param userId User ID
 * @returns Unread notifications count
 */
export const getUnreadCount = async (userId: string): Promise<{ count: number }> => {
  const timer = startTimer('notificationService.getUnreadCount');

  try {
    // Try to get from cache
    const cacheKey = `notifications:${userId}:unreadCount`;
    const cachedCount = cache.get<{ count: number }>(cacheKey);

    if (cachedCount !== undefined) {
      return cachedCount;
    }

    // Count unread notifications
    const count = await Notification.countDocuments({ user: userId, isRead: false });

    // Cache result
    cache.set(cacheKey, { count }, 60); // Cache for 1 minute

    return { count };
  } catch (error) {
    logger.error(`Error getting unread notifications count for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};
