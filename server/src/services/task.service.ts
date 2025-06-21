import mongoose from 'mongoose';
import Task, { type ITask, TaskStatus, type TaskPriority } from '../models/task.model';
import Project from '../models/project.model';
import User from '../models/user.model';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/app-error';
import { APIFeatures } from '../utils/api-features';
import * as notificationService from './notification.service';
import * as activityService from './activity.service';
import { NotificationType } from '../models/notification.model';
import { ActivityType, type IActivity } from '../models/activity.model';
import logger from '../config/logger';
import * as cache from '../utils/cache';
import { startTimer } from '../utils/performance-monitor';
import { createTaskActivityData, type ExtendedTaskActivityData } from '../utils/activity-helpers';
import { assertTask } from '../utils/type-guards';

/**
 * Task filter interface
 */
export interface TaskFilters {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  dueDate?: {
    from?: Date;
    to?: Date;
  };
  project?: string;
  assignedTo?: string;
  tags?: string[];
  search?: string;
  isArchived?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Task statistics interface
 */
export interface TaskStatistics {
  total: number;
  completed: number;
  overdue: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  completionRate: number;
  averageCompletionTimeHours: number;
  onTimeCompletionRate: number;
}

/**
 * Task timeline event data interface
 */
export interface TaskTimelineEventData {
  title?: string;
  status?: string;
  priority?: string;
  dueDate?: Date;
  assignedTo?: string;
  previousValues?: {
    status?: string;
    priority?: string;
    dueDate?: Date;
    assignedTo?: string;
    title?: string;
    description?: string;
  };
  [key: string]: unknown;
}

/**
 * Task timeline event interface
 */
export interface TaskTimelineEvent {
  type: string;
  timestamp: Date;
  user?: {
    id: string;
    name: string;
  };
  data?: TaskTimelineEventData;
}

/**
 * Bulk update DTO interface
 */
export interface BulkUpdateDto {
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date;
  assignedTo?: string;
  tags?: string[];
  isArchived?: boolean;
}

/**
 * Create a new task
 * @param userId User ID
 * @param taskData Task data
 * @returns Newly created task
 */
export const createTask = async (userId: string, taskData: Partial<ITask>): Promise<ITask> => {
  const timer = startTimer('taskService.createTask');

  try {
    // Validate project if provided
    if (taskData.project) {
      const project = await Project.findById(taskData.project);
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Check if project belongs to user
      if (project.user && project.user.toString() !== userId) {
        throw new ForbiddenError('You do not have permission to create tasks in this project');
      }
    }

    // Validate assignee if provided
    if (taskData.assignedTo) {
      const assignee = await User.findById(taskData.assignedTo);
      if (!assignee) {
        throw new NotFoundError('Assignee not found');
      }
    }

    // Set creator and owner
    taskData.createdBy = userId;
    taskData.user = userId;

    // Create task
    const task = assertTask(await Task.create(taskData));

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_CREATED,
      task: (task._id as mongoose.Types.ObjectId).toString(),
      project: task.project ? task.project.toString() : undefined,
      data: createTaskActivityData(ActivityType.TASK_CREATED, {
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
      }),
    });

    // Create notification if due date is set
    if (task.dueDate) {
      const now = new Date();
      const dueDateValue = new Date(task.dueDate);
      const daysDifference = Math.ceil(
        (dueDateValue.getTime() - now.getTime()) / (1000 * 3600 * 24),
      );

      // If due date is within 3 days, create a notification
      if (daysDifference <= 3 && daysDifference > 0) {
        await notificationService.createTaskDueSoonNotification(
          userId,
          (task._id as mongoose.Types.ObjectId).toString(),
          task.title,
          task.dueDate,
        );
      }
    }

    // Create notification if task is assigned to someone else
    if (task.assignedTo && task.assignedTo.toString() !== userId) {
      await notificationService.createTaskAssignedNotification(
        task.assignedTo.toString(),
        (task._id as mongoose.Types.ObjectId).toString(),
        task.title,
        userId,
      );
    }

    return task;
  } catch (error) {
    logger.error('Error creating task:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get all tasks for a user with filtering, sorting, and pagination
 * @param userId User ID
 * @param filters Task filters
 * @returns Tasks and pagination metadata
 */
export const getTasks = async (
  userId: string,
  filters: TaskFilters = {},
): Promise<{
  data: ITask[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('taskService.getTasks');

  try {
    // Create base query for user's tasks
    const query = Task.find({ user: userId });

    // Apply status filter
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query.find({ status: { $in: filters.status } });
      } else {
        query.find({ status: filters.status });
      }
    }

    // Apply priority filter
    if (filters.priority) {
      if (Array.isArray(filters.priority)) {
        query.find({ priority: { $in: filters.priority } });
      } else {
        query.find({ priority: filters.priority });
      }
    }

    // Apply due date filter
    if (filters.dueDate) {
      const dateFilter: Record<string, Date> = {};
      if (filters.dueDate.from) {
        dateFilter.$gte = new Date(filters.dueDate.from);
      }
      if (filters.dueDate.to) {
        dateFilter.$lte = new Date(filters.dueDate.to);
      }
      if (Object.keys(dateFilter).length > 0) {
        query.find({ dueDate: dateFilter });
      }
    }

    // Apply project filter
    if (filters.project) {
      if (filters.project === 'none') {
        // Find tasks with no project
        query.find({ project: { $exists: false } });
      } else {
        // Find tasks with the specified project
        query.find({ project: filters.project });
      }
    }

    // Apply assignee filter
    if (filters.assignedTo) {
      if (filters.assignedTo === 'none') {
        // Find unassigned tasks
        query.find({ assignedTo: { $exists: false } });
      } else if (filters.assignedTo === 'me') {
        // Find tasks assigned to the current user
        query.find({ assignedTo: userId });
      } else {
        // Find tasks assigned to the specified user
        query.find({ assignedTo: filters.assignedTo });
      }
    }

    // Apply tags filter
    if (filters.tags && filters.tags.length > 0) {
      query.find({ tags: { $in: filters.tags } });
    }

    // Apply archived filter
    if (filters.isArchived !== undefined) {
      query.find({ isArchived: filters.isArchived });
    } else {
      // By default, exclude archived tasks
      query.find({ isArchived: false });
    }

    // Define a type for query parameters
    type TaskQueryParams = TaskFilters & {
      page: number;
      limit: number;
      sort: string;
      search?: string;
    };

    // Convert filters to query params for APIFeatures
    const queryParams: TaskQueryParams = {
      ...filters,
      page: filters.page || 1,
      limit: filters.limit || 10,
      sort: filters.sortBy
        ? `${filters.sortOrder === 'desc' ? '-' : ''}${filters.sortBy}`
        : '-createdAt',
    };

    if (filters.search) {
      queryParams.search = filters.search;
    }

    // Apply API features (filtering, sorting, pagination)
    const features = new APIFeatures(query, queryParams)
      .filter()
      .search(['title', 'description'])
      .sort()
      .limitFields()
      .paginate();

    // Execute query with pagination metadata
    return await features.execute();
  } catch (error) {
    logger.error('Error getting tasks:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get a task by ID
 * @param taskId Task ID
 * @param userId User ID
 * @returns Task
 */
export const getTaskById = async (taskId: string, userId: string): Promise<ITask> => {
  const timer = startTimer('taskService.getTaskById');

  try {
    // Try to get task from cache
    const cacheKey = `task:${taskId}:${userId}`;
    const cachedTask = cache.get<ITask>(cacheKey);

    if (cachedTask) {
      return cachedTask;
    }

    // Find task by ID
    const taskResult = await Task.findById(taskId)
      .populate('project', 'name color')
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email');

    // Check if task exists
    if (!taskResult) {
      throw new NotFoundError('Task not found');
    }

    const task = assertTask(taskResult);

    // Check if task belongs to user
    if (task.user && task.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to access this task');
    }

    // Cache task for 5 minutes
    cache.set(cacheKey, task, 300);

    return task;
  } catch (error) {
    logger.error(`Error getting task ${taskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Update a task
 * @param taskId Task ID
 * @param userId User ID
 * @param updateData Update data
 * @returns Updated task
 */
export const updateTask = async (
  taskId: string,
  userId: string,
  updateData: Partial<ITask>,
): Promise<ITask> => {
  const timer = startTimer('taskService.updateTask');

  try {
    // Find task by ID
    const taskResult = await Task.findById(taskId);

    // Check if task exists
    if (!taskResult) {
      throw new NotFoundError('Task not found');
    }

    const task = assertTask(taskResult);

    // Check if task belongs to user
    if (task.user && task.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to update this task');
    }

    // Validate project if being updated
    if (updateData.project) {
      const project = await Project.findById(updateData.project);
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Check if project belongs to user
      if (project.user && project.user.toString() !== userId) {
        throw new ForbiddenError('You do not have permission to use this project');
      }
    }

    // Validate assignee if being updated
    if (updateData.assignedTo) {
      const assignee = await User.findById(updateData.assignedTo);
      if (!assignee) {
        throw new NotFoundError('Assignee not found');
      }
    }

    // Check if status is being updated to DONE
    const isCompletingTask =
      updateData.status === TaskStatus.DONE && task.status !== TaskStatus.DONE;

    // Check if due date is being updated
    const isUpdatingDueDate =
      updateData.dueDate !== undefined &&
      (!task.dueDate || updateData.dueDate.toString() !== task.dueDate.toString());

    // Check if assignee is being updated
    const isChangingAssignee =
      updateData.assignedTo !== undefined &&
      updateData.assignedTo !== null &&
      (!task.assignedTo || updateData.assignedTo.toString() !== task.assignedTo.toString());

    // Track original values for activity log
    const originalValues = {
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      assignedTo: task.assignedTo,
      title: task.title,
      description: task.description,
    };

    // Update task
    Object.assign(task, updateData);
    await task.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_UPDATED,
      task: (task._id as mongoose.Types.ObjectId).toString(),
      project: task.project ? task.project.toString() : undefined,
      data: createTaskActivityData(ActivityType.TASK_UPDATED, {
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        previousValues: originalValues,
      }),
    });

    // Create notification if task is completed
    if (isCompletingTask) {
      await notificationService.createNotification(userId, {
        type: NotificationType.TASK_COMPLETED,
        title: 'Task Completed',
        message: `You've completed the task "${task.title}"`,
        data: {
          taskId: (task._id as mongoose.Types.ObjectId).toString(),
        },
      });
    }

    // Create notification if due date is updated and within 3 days
    if (isUpdatingDueDate && task.dueDate) {
      const now = new Date();
      const taskDueDate = new Date(task.dueDate);
      const daysDifference = Math.ceil(
        (taskDueDate.getTime() - now.getTime()) / (1000 * 3600 * 24),
      );

      if (daysDifference <= 3 && daysDifference > 0) {
        await notificationService.createTaskDueSoonNotification(
          userId,
          (task._id as mongoose.Types.ObjectId).toString(),
          task.title,
          task.dueDate,
        );
      }
    }

    // Create notification if task is assigned to someone else
    if (isChangingAssignee && task.assignedTo && task.assignedTo.toString() !== userId) {
      await notificationService.createTaskAssignedNotification(
        task.assignedTo.toString(),
        (task._id as mongoose.Types.ObjectId).toString(),
        task.title,
        userId,
      );
    }

    // Invalidate cache
    cache.del(`task:${taskId}:${userId}`);

    return task;
  } catch (error) {
    logger.error(`Error updating task ${taskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Delete a task
 * @param taskId Task ID
 * @param userId User ID
 * @returns Success message
 */
export const deleteTask = async (taskId: string, userId: string): Promise<{ message: string }> => {
  const timer = startTimer('taskService.deleteTask');

  try {
    // Find task by ID
    const taskResult = await Task.findById(taskId);

    // Check if task exists
    if (!taskResult) {
      throw new NotFoundError('Task not found');
    }

    const task = assertTask(taskResult);

    // Check if task belongs to user
    if (task.user && task.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to delete this task');
    }

    // Get task details for activity log
    const taskDetails = {
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      project: task.project,
    };

    // Delete task
    await task.deleteOne();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_DELETED,
      project: task.project ? task.project.toString() : undefined,
      data: createTaskActivityData(ActivityType.TASK_DELETED, {
        title: task.title,
        status: taskDetails.status,
        priority: taskDetails.priority,
        dueDate: taskDetails.dueDate,
      }),
    });

    // Invalidate cache
    cache.del(`task:${taskId}:${userId}`);

    return {
      message: 'Task deleted successfully',
    };
  } catch (error) {
    logger.error(`Error deleting task ${taskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get task statistics for a user
 * @param userId User ID
 * @returns Task statistics
 */
export const getTaskStats = async (userId: string): Promise<TaskStatistics> => {
  const timer = startTimer('taskService.getTaskStats');

  try {
    // Try to get stats from cache
    const cacheKey = `taskStats:${userId}`;
    const cachedStats = cache.get<TaskStatistics>(cacheKey);

    if (cachedStats) {
      return cachedStats;
    }

    // Get task statistics from database
    const stats = await Task.getTaskStats(new mongoose.Types.ObjectId(userId));

    // Cache stats for 5 minutes
    cache.set(cacheKey, stats, 300);

    return stats;
  } catch (error) {
    logger.error(`Error getting task stats for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Add attachment to a task
 * @param taskId Task ID
 * @param userId User ID
 * @param attachment Attachment data
 * @returns Updated task
 */
export const addTaskAttachment = async (
  taskId: string,
  userId: string,
  attachment: {
    filename: string;
    path: string;
    mimetype: string;
    size: number;
  },
): Promise<ITask> => {
  const timer = startTimer('taskService.addTaskAttachment');

  try {
    // Find task by ID
    const taskResult = await Task.findById(taskId);

    // Check if task exists
    if (!taskResult) {
      throw new NotFoundError('Task not found');
    }

    const task = assertTask(taskResult);

    // Check if task belongs to user
    if (task.user && task.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to update this task');
    }

    // Add attachment to task with upload metadata
    task.attachments.push({
      ...attachment,
      uploadedAt: new Date(),
      uploadedBy: new mongoose.Types.ObjectId(userId),
    });

    await task.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_UPDATED,
      task: (task._id as mongoose.Types.ObjectId).toString(),
      project: task.project ? task.project.toString() : undefined,
      data: createTaskActivityData(ActivityType.TASK_UPDATED, {
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
      }),
    });

    // Invalidate cache
    cache.del(`task:${taskId}:${userId}`);

    return task;
  } catch (error) {
    logger.error(`Error adding attachment to task ${taskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Remove attachment from a task
 * @param taskId Task ID
 * @param userId User ID
 * @param attachmentId Attachment ID
 * @returns Updated task
 */
export const removeTaskAttachment = async (
  taskId: string,
  userId: string,
  attachmentId: string,
): Promise<ITask> => {
  const timer = startTimer('taskService.removeTaskAttachment');

  try {
    // Find task by ID
    const taskResult = await Task.findById(taskId);

    // Check if task exists
    if (!taskResult) {
      throw new NotFoundError('Task not found');
    }

    const task = assertTask(taskResult);

    // Check if task belongs to user
    if (task.user && task.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to update this task');
    }

    // Find attachment index
    const attachmentIndex = task.attachments.findIndex(
      (attachment) => attachment._id?.toString() === attachmentId,
    );

    // Check if attachment exists
    if (attachmentIndex === -1) {
      throw new NotFoundError('Attachment not found');
    }

    // Log attachment removal for debugging purposes
    logger.debug(`Removing attachment ${attachmentId} from task ${taskId}`);

    // Remove attachment from task
    task.attachments.splice(attachmentIndex, 1);
    await task.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_UPDATED,
      task: (task._id as mongoose.Types.ObjectId).toString(),
      project: task.project ? task.project.toString() : undefined,
      data: createTaskActivityData(ActivityType.TASK_UPDATED, {
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
      }),
    });

    // Invalidate cache
    cache.del(`task:${taskId}:${userId}`);

    return task;
  } catch (error) {
    logger.error(`Error removing attachment from task ${taskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Bulk update task status
 * @param taskIds Array of task IDs
 * @param userId User ID
 * @param updates Update data
 * @returns Updated tasks count
 */
export const bulkUpdateTasks = async (
  taskIds: string[],
  userId: string,
  updates: BulkUpdateDto,
): Promise<{ updatedCount: number }> => {
  const timer = startTimer('taskService.bulkUpdateTasks');

  try {
    // Validate task IDs
    if (!taskIds.length) {
      throw new ValidationError('No task IDs provided');
    }

    // Convert string IDs to ObjectIds
    const objectIds = taskIds.map((id) => new mongoose.Types.ObjectId(id));

    // Define a type for task update fields
    type TaskUpdateFields = {
      status?: TaskStatus;
      priority?: TaskPriority;
      dueDate?: Date | null;
      completedAt?: Date | null;
      progress?: number;
      assignedTo?: mongoose.Types.ObjectId | null;
      tags?: string[];
      isArchived?: boolean;
    };

    // Prepare update data
    const updateData: TaskUpdateFields = {};

    if (updates.status !== undefined) {
      updateData.status = updates.status;

      // Set completedAt if status is DONE
      if (updates.status === TaskStatus.DONE) {
        updateData.completedAt = new Date();
        updateData.progress = 100;
      } else if (updateData.completedAt) {
        // Remove completedAt if status is not DONE
        updateData.completedAt = null;
      }
    }

    if (updates.priority !== undefined) {
      updateData.priority = updates.priority;
    }

    if (updates.dueDate !== undefined) {
      updateData.dueDate = updates.dueDate;
    }

    if (updates.assignedTo !== undefined) {
      // Validate assignee if provided
      if (updates.assignedTo) {
        const assignee = await User.findById(updates.assignedTo);
        if (!assignee) {
          throw new NotFoundError('Assignee not found');
        }
      }

      updateData.assignedTo = updates.assignedTo
        ? new mongoose.Types.ObjectId(updates.assignedTo)
        : null;
    }

    if (updates.tags !== undefined) {
      updateData.tags = updates.tags;
    }

    if (updates.isArchived !== undefined) {
      updateData.isArchived = updates.isArchived;
    }

    // Update tasks that belong to the user
    const result = await Task.updateMany(
      {
        _id: { $in: objectIds },
        user: userId,
      },
      { $set: updateData },
    );

    // Get the tasks that were updated for notifications and activity logs
    if (result.modifiedCount > 0) {
      const updatedTasksResult = await Task.find({
        _id: { $in: objectIds },
        user: userId,
      });

      const updatedTasks = updatedTasksResult.map((task) => assertTask(task));

      // Create activity logs for each updated task
      for (const updatedTask of updatedTasks) {
        await activityService.createActivity(userId, {
          type: ActivityType.TASK_UPDATED,
          task: (updatedTask._id as mongoose.Types.ObjectId).toString(),
          project: updatedTask.project ? updatedTask.project.toString() : undefined,
          data: createTaskActivityData(ActivityType.TASK_UPDATED, {
            title: updatedTask.title,
            status: updatedTask.status,
            priority: updatedTask.priority,
            dueDate: updatedTask.dueDate,
          }),
        });

        // Invalidate cache for each task
        cache.del(`task:${(updatedTask._id as mongoose.Types.ObjectId).toString()}:${userId}`);
      }

      // Create notifications for completed tasks
      if (updates.status === TaskStatus.DONE && updatedTasks.length > 0) {
        await notificationService.createNotification(userId, {
          type: NotificationType.TASK_COMPLETED,
          title: 'Tasks Completed',
          message: `You've completed ${updatedTasks.length} tasks`,
          data: {
            taskIds: updatedTasks.map((task) => (task._id as mongoose.Types.ObjectId).toString()),
          },
        });
      }

      // Create notifications for assigned tasks
      if (updates.assignedTo && updates.assignedTo !== userId) {
        for (const updatedTask of updatedTasks) {
          await notificationService.createTaskAssignedNotification(
            updates.assignedTo,
            (updatedTask._id as mongoose.Types.ObjectId).toString(),
            updatedTask.title,
            userId,
          );
        }
      }
    }

    // Invalidate task stats cache
    cache.del(`taskStats:${userId}`);

    return {
      updatedCount: result.modifiedCount,
    };
  } catch (error) {
    logger.error('Error bulk updating tasks:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Assign a task to a user
 * @param taskId Task ID
 * @param assigneeId Assignee ID
 * @param assignerId Assigner ID
 * @returns Updated task
 */
export const assignTask = async (
  taskId: string,
  assigneeId: string,
  assignerId: string,
): Promise<ITask> => {
  const timer = startTimer('taskService.assignTask');

  try {
    // Find task by ID
    const taskResult = await Task.findById(taskId);

    // Check if task exists
    if (!taskResult) {
      throw new NotFoundError('Task not found');
    }

    const task = assertTask(taskResult);

    // Check if task belongs to assigner
    if (task.user && task.user.toString() !== assignerId) {
      throw new ForbiddenError('You do not have permission to assign this task');
    }

    // Validate assignee
    const assignee = await User.findById(assigneeId);
    if (!assignee) {
      throw new NotFoundError('Assignee not found');
    }

    // Update task
    task.assignedTo = new mongoose.Types.ObjectId(assigneeId);
    await task.save();

    // Create activity log
    await activityService.createActivity(assignerId, {
      type: ActivityType.TASK_ASSIGNED,
      task: (task._id as mongoose.Types.ObjectId).toString(),
      project: task.project ? task.project.toString() : undefined,
      data: createTaskActivityData(ActivityType.TASK_ASSIGNED, {
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        assignedTo: assigneeId,
      } as ExtendedTaskActivityData),
    });

    // Create notification for assignee
    if (assigneeId !== assignerId) {
      await notificationService.createTaskAssignedNotification(
        assigneeId,
        (task._id as mongoose.Types.ObjectId).toString(),
        task.title,
        assignerId,
      );
    }

    // Invalidate cache
    cache.del(`task:${taskId}:${assignerId}`);

    return task;
  } catch (error) {
    logger.error(`Error assigning task ${taskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Change task status
 * @param taskId Task ID
 * @param status New status
 * @param userId User ID
 * @returns Updated task
 */
export const changeTaskStatus = async (
  taskId: string,
  status: TaskStatus,
  userId: string,
): Promise<ITask> => {
  const timer = startTimer('taskService.changeTaskStatus');

  try {
    // Find task by ID
    const taskResult = await Task.findById(taskId);

    // Check if task exists
    if (!taskResult) {
      throw new NotFoundError('Task not found');
    }

    const task = assertTask(taskResult);

    // Check if task belongs to user
    if (task.user && task.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to update this task');
    }

    // Check if status is actually changing
    if (task.status === status) {
      return task;
    }

    // Track original status for activity log
    const originalStatus = task.status;

    // Update task status
    task.status = status;

    // Set completedAt if status is DONE
    if (status === TaskStatus.DONE) {
      task.completedAt = new Date();
      task.progress = 100;
    } else if (task.completedAt) {
      // Remove completedAt if status is not DONE
      task.completedAt = undefined;

      // Recalculate progress based on checklist
      if (task.checklist && task.checklist.length > 0) {
        // Default to 0 progress if calculateProgress method is not available
        task.progress = 0;
      }
    }

    await task.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_UPDATED,
      task: (task._id as mongoose.Types.ObjectId).toString(),
      project: task.project ? task.project.toString() : undefined,
      data: createTaskActivityData(ActivityType.TASK_UPDATED, {
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        previousValues: {
          status: originalStatus,
        },
      }),
    });

    // Create notification if task is completed
    if (status === TaskStatus.DONE) {
      await notificationService.createNotification(userId, {
        type: NotificationType.TASK_COMPLETED,
        title: 'Task Completed',
        message: `You've completed the task "${task.title}"`,
        data: {
          taskId: (task._id as mongoose.Types.ObjectId).toString(),
        },
      });
    }

    // Invalidate cache
    cache.del(`task:${taskId}:${userId}`);

    return task;
  } catch (error) {
    logger.error(`Error changing task status ${taskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get task timeline/history
 * @param taskId Task ID
 * @param userId User ID
 * @returns Task timeline events
 */
export const getTaskTimeline = async (
  taskId: string,
  userId: string,
): Promise<TaskTimelineEvent[]> => {
  const timer = startTimer('taskService.getTaskTimeline');

  try {
    // Find task by ID to verify access
    const taskResult = await Task.findById(taskId);

    // Check if task exists
    if (!taskResult) {
      throw new NotFoundError('Task not found');
    }

    const task = assertTask(taskResult);

    // Check if task belongs to user
    if (task.user && task.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to access this task');
    }

    // Get activities related to this task
    const activitiesResult = await activityService.getTaskActivities(taskId);
    const activities = activitiesResult.data;

    // Convert activities to timeline events
    const timeline: TaskTimelineEvent[] = activities.map((activity: IActivity) => {
      // Handle user information safely
      let userInfo: TaskTimelineEvent['user'] | undefined = undefined;

      if (activity.user) {
        // Just use the ID as a string
        const userId =
          typeof activity.user === 'object'
            ? (activity.user as mongoose.Types.ObjectId).toString()
            : activity.user.toString();

        userInfo = {
          id: userId,
          name: 'User', // Generic name since we can't safely access the name property
        };
      }

      return {
        type: activity.type,
        timestamp: activity.createdAt,
        user: userInfo,
        data: activity.data,
      };
    });

    return timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  } catch (error) {
    logger.error(`Error getting task timeline ${taskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Archive/Unarchive a task
 * @param taskId Task ID
 * @param userId User ID
 * @param isArchived Archive status
 * @returns Updated task
 */
export const archiveTask = async (
  taskId: string,
  userId: string,
  isArchived: boolean,
): Promise<ITask> => {
  const timer = startTimer('taskService.archiveTask');

  try {
    // Find task by ID
    const taskResult = await Task.findById(taskId);

    // Check if task exists
    if (!taskResult) {
      throw new NotFoundError('Task not found');
    }

    const task = assertTask(taskResult);

    // Check if task belongs to user
    if (task.user && task.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to update this task');
    }

    // Update archive status
    task.isArchived = isArchived;
    await task.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: isArchived ? ActivityType.TASK_ARCHIVED : ActivityType.TASK_UNARCHIVED,
      task: (task._id as mongoose.Types.ObjectId).toString(),
      project: task.project ? task.project.toString() : undefined,
      data: createTaskActivityData(
        isArchived ? ActivityType.TASK_ARCHIVED : ActivityType.TASK_UNARCHIVED,
        {
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate,
        },
      ),
    });

    // Invalidate cache
    cache.del(`task:${taskId}:${userId}`);
    cache.del(`taskStats:${userId}`);

    return task;
  } catch (error) {
    logger.error(`Error archiving task ${taskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};
