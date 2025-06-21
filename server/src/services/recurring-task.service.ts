import { Types } from 'mongoose';
import RecurringTask, {
  type IRecurringTask,
  type ITaskTemplate,
  RecurrenceFrequency,
} from '../models/recurring-task.model';
import Task, { TaskPriority, type ITask, type ITaskAttachment } from '../models/task.model';
import Project from '../models/project.model';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/app-error';
import { APIFeatures } from '../utils/api-features';
import * as activityService from './activity.service';
import * as notificationService from './notification.service';
import * as taskService from './task.service';
import { ActivityType } from '../models/activity.model';
import { NotificationType } from '../models/notification.model';
import logger from '../config/logger';
import * as cache from '../utils/cache';
import { startTimer } from '../utils/performance-monitor';

// Define proper types for query parameters
interface QueryParams {
  project?: string;
  active?: string;
  frequency?: RecurrenceFrequency;
  page?: number;
  limit?: number;
  sort?: string;
  fields?: string;
  search?: string;
  [key: string]: string | number | boolean | undefined;
}

// Define proper return type for paginated results
interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/**
 * Create a new recurring task
 * @param userId User ID
 * @param recurringTaskData Recurring task data
 * @returns Newly created recurring task
 */
export const createRecurringTask = async (
  userId: string,
  recurringTaskData: Partial<IRecurringTask>,
): Promise<IRecurringTask> => {
  const timer = startTimer('recurringTaskService.createRecurringTask');

  try {
    // Validate project if provided
    if (recurringTaskData.project) {
      const project = await Project.findById(recurringTaskData.project);
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Check if project belongs to user
      if (project.user && project.user.toString() !== userId) {
        throw new ForbiddenError(
          'You do not have permission to create recurring tasks for this project',
        );
      }
    }

    // Validate required fields
    if (!recurringTaskData.frequency) {
      throw new ValidationError('Recurrence frequency is required');
    }

    if (!recurringTaskData.title && !recurringTaskData.taskTemplate?.title) {
      throw new ValidationError('Task title is required');
    }

    // Validate recurrence pattern
    validateRecurrencePattern(
      recurringTaskData.frequency as RecurrenceFrequency,
      recurringTaskData.daysOfWeek,
      recurringTaskData.daysOfMonth,
      recurringTaskData.monthsOfYear,
    );

    // Validate date range
    if (recurringTaskData.startDate && recurringTaskData.endDate) {
      if (recurringTaskData.startDate >= recurringTaskData.endDate) {
        throw new ValidationError('End date must be after start date');
      }
    }

    // Set user ID
    recurringTaskData.user = new Types.ObjectId(userId);

    // Set default values
    recurringTaskData.interval = recurringTaskData.interval || 1;
    recurringTaskData.active = recurringTaskData.active !== false; // Default to true
    recurringTaskData.createdTasks = [];

    // Set default task template if not provided
    if (!recurringTaskData.taskTemplate) {
      recurringTaskData.taskTemplate = {
        title: recurringTaskData.title || 'Recurring Task',
        priority: TaskPriority.MEDIUM,
        tags: [],
      } as ITaskTemplate;
    }

    // Ensure task template has required fields
    if (!recurringTaskData.taskTemplate.title) {
      recurringTaskData.taskTemplate.title = recurringTaskData.title || 'Recurring Task';
    }

    // Create recurring task
    const recurringTask = await RecurringTask.create(recurringTaskData);

    // Calculate next run date
    const nextRunDate = calculateNextTaskDate(recurringTask);
    if (nextRunDate) {
      recurringTask.nextRunDate = nextRunDate;
      await recurringTask.save();
    } else {
      // If no next run date is available, deactivate the task
      recurringTask.active = false;
      await recurringTask.save();
    }

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_CREATED,
      project: recurringTaskData.project as Types.ObjectId,
      data: {
        templateName: recurringTask.title,
        fromTemplate: true,
        isTemplate: true,
      },
    });

    return recurringTask;
  } catch (error) {
    logger.error(`Error creating recurring task:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get all recurring tasks for a user
 * @param userId User ID
 * @param queryParams Query parameters
 * @returns Recurring tasks and pagination metadata
 */
export const getRecurringTasks = async (
  userId: string,
  queryParams: QueryParams = {},
): Promise<PaginatedResult<IRecurringTask>> => {
  const timer = startTimer('recurringTaskService.getRecurringTasks');

  try {
    // Create base query for user's recurring tasks
    const query = RecurringTask.find({ user: userId });

    // Filter by project if specified
    if (queryParams.project) {
      if (queryParams.project === 'none') {
        // Find recurring tasks with no project
        query.find({ project: { $exists: false } });
      } else {
        // Find recurring tasks with the specified project
        query.find({ project: queryParams.project });
      }
    }

    // Filter by active status if specified
    if (queryParams.active !== undefined) {
      query.find({ active: queryParams.active === 'true' });
    }

    // Filter by frequency if specified
    if (queryParams.frequency) {
      query.find({ frequency: queryParams.frequency });
    }

    // Apply API features (filtering, sorting, pagination)
    const features = new APIFeatures(query, queryParams)
      .filter()
      .search(['title', 'description', 'taskTemplate.title', 'taskTemplate.description'])
      .sort()
      .limitFields()
      .paginate();

    // Execute query with pagination metadata
    return await features.execute();
  } catch (error) {
    logger.error(`Error getting recurring tasks for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get a recurring task by ID
 * @param recurringTaskId Recurring task ID
 * @param userId User ID
 * @returns Recurring task
 */
export const getRecurringTaskById = async (
  recurringTaskId: string,
  userId: string,
): Promise<IRecurringTask> => {
  const timer = startTimer('recurringTaskService.getRecurringTaskById');

  try {
    // Try to get from cache
    const cacheKey = `recurringTask:${recurringTaskId}`;
    const cachedTask = cache.get<IRecurringTask>(cacheKey);
    if (cachedTask) {
      return cachedTask;
    }

    // Find recurring task by ID
    const recurringTask = await RecurringTask.findById(recurringTaskId)
      .populate('project', 'name color')
      .populate('createdTasks', 'title status dueDate');

    // Check if recurring task exists
    if (!recurringTask) {
      throw new NotFoundError('Recurring task not found');
    }

    // Check if recurring task belongs to user
    if (recurringTask.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to access this recurring task');
    }

    // Cache recurring task
    cache.set(cacheKey, recurringTask, 300); // Cache for 5 minutes

    return recurringTask;
  } catch (error) {
    logger.error(`Error getting recurring task ${recurringTaskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Update a recurring task
 * @param recurringTaskId Recurring task ID
 * @param userId User ID
 * @param updateData Update data
 * @returns Updated recurring task
 */
export const updateRecurringTask = async (
  recurringTaskId: string,
  userId: string,
  updateData: Partial<IRecurringTask>,
): Promise<IRecurringTask> => {
  const timer = startTimer('recurringTaskService.updateRecurringTask');

  try {
    // Find recurring task by ID
    const recurringTask = await RecurringTask.findById(recurringTaskId);

    // Check if recurring task exists
    if (!recurringTask) {
      throw new NotFoundError('Recurring task not found');
    }

    // Check if recurring task belongs to user
    if (recurringTask.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to update this recurring task');
    }

    // Validate project if provided
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

    // Validate date range if being updated
    if (updateData.startDate || updateData.endDate) {
      const startDate = updateData.startDate || recurringTask.startDate;
      const endDate = updateData.endDate || recurringTask.endDate;

      if (startDate && endDate && startDate >= endDate) {
        throw new ValidationError('End date must be after start date');
      }
    }

    // Validate recurrence pattern if frequency is being updated
    if (updateData.frequency) {
      validateRecurrencePattern(
        updateData.frequency as RecurrenceFrequency,
        updateData.daysOfWeek || recurringTask.daysOfWeek,
        updateData.daysOfMonth || recurringTask.daysOfMonth,
        updateData.monthsOfYear || recurringTask.monthsOfYear,
      );
    }

    // Check if recurrence pattern is being updated
    const isPatternUpdated =
      updateData.frequency !== undefined ||
      updateData.interval !== undefined ||
      updateData.daysOfWeek !== undefined ||
      updateData.daysOfMonth !== undefined ||
      updateData.monthsOfYear !== undefined ||
      updateData.startDate !== undefined ||
      updateData.endDate !== undefined;

    // Update recurring task
    Object.assign(recurringTask, updateData);

    // Recalculate next run date if pattern is updated
    if (isPatternUpdated) {
      const nextRunDate = calculateNextTaskDate(recurringTask);
      if (nextRunDate) {
        recurringTask.nextRunDate = nextRunDate;
      } else {
        // If no next run date is available (e.g., past end date), deactivate the recurring task
        recurringTask.active = false;
      }
    }

    await recurringTask.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_UPDATED,
      project: recurringTask.project as Types.ObjectId,
      data: {
        templateName: recurringTask.title,
        updates: Object.keys(updateData),
        isTemplate: true,
        fromTemplate: true,
      },
    });

    // Invalidate cache
    cache.del(`recurringTask:${recurringTaskId}`);

    return recurringTask;
  } catch (error) {
    logger.error(`Error updating recurring task ${recurringTaskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Delete a recurring task
 * @param recurringTaskId Recurring task ID
 * @param userId User ID
 * @param options Delete options
 * @returns Success message
 */
export const deleteRecurringTask = async (
  recurringTaskId: string,
  userId: string,
  options: {
    deleteCreatedTasks?: boolean;
  } = {},
): Promise<{ message: string }> => {
  const timer = startTimer('recurringTaskService.deleteRecurringTask');

  try {
    // Find recurring task by ID
    const recurringTask = await RecurringTask.findById(recurringTaskId);

    // Check if recurring task exists
    if (!recurringTask) {
      throw new NotFoundError('Recurring task not found');
    }

    // Check if recurring task belongs to user
    if (recurringTask.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to delete this recurring task');
    }

    // Get task details for activity log
    const taskTitle = recurringTask.title;
    const projectId = recurringTask.project;
    const createdTaskIds = [...recurringTask.createdTasks];

    // Delete recurring task
    await recurringTask.deleteOne();

    // Delete created tasks if specified
    if (options.deleteCreatedTasks && createdTaskIds.length > 0) {
      await Task.deleteMany({ _id: { $in: createdTaskIds } });
    }

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_DELETED,
      project: projectId as Types.ObjectId,
      data: {
        templateName: taskTitle,
        isTemplate: true,
        fromTemplate: true,
      },
    });

    // Invalidate cache
    cache.del(`recurringTask:${recurringTaskId}`);

    return {
      message: `Recurring task deleted successfully${
        options.deleteCreatedTasks ? ' along with all created tasks' : ''
      }`,
    };
  } catch (error) {
    logger.error(`Error deleting recurring task ${recurringTaskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Process recurring tasks
 * This should be run by a scheduled job
 * @returns Processing result
 */
export const processRecurringTasks = async (): Promise<{
  processed: number;
  created: number;
  errors: number;
}> => {
  const timer = startTimer('recurringTaskService.processRecurringTasks');

  let processed = 0;
  let created = 0;
  let errors = 0;

  try {
    // Find active recurring tasks that are due
    const now = new Date();
    const recurringTasks = await RecurringTask.find({
      active: true,
      nextRunDate: { $lte: now },
    });

    logger.info(`Processing ${recurringTasks.length} recurring tasks`);

    // Process each recurring task
    for (const recurringTask of recurringTasks) {
      processed++;

      try {
        // Create task from template
        const taskData: Partial<ITask> = {
          title: recurringTask.taskTemplate.title,
          description: recurringTask.taskTemplate.description,
          priority: recurringTask.taskTemplate.priority as unknown as TaskPriority,
          project: recurringTask.project,
          user: recurringTask.user,
          createdBy: recurringTask.user,
          tags: [...(recurringTask.taskTemplate.tags || []), 'recurring'],
          estimatedHours: recurringTask.taskTemplate.estimatedHours,
          // Handle attachments properly
          attachments: recurringTask.taskTemplate.attachments?.map((attachment) => ({
            ...attachment,
            uploadedAt: new Date(),
            uploadedBy: recurringTask.user,
          })) as ITaskAttachment[],
        };

        // Create the task
        const task = await Task.create(taskData);

        // Update recurring task
        recurringTask.lastTaskCreated = now;
        recurringTask.createdTasks.push(task._id as Types.ObjectId);

        // Calculate next run date
        const nextRunDate = calculateNextTaskDate(recurringTask);
        if (nextRunDate) {
          recurringTask.nextRunDate = nextRunDate;
        } else {
          // If no next run date is available (e.g., past end date), deactivate the recurring task
          recurringTask.active = false;
        }

        await recurringTask.save();

        // Create notification for task owner
        await notificationService.createNotification(recurringTask.user.toString(), {
          type: NotificationType.SYSTEM,
          title: 'Recurring Task Created',
          message: `A new task "${task.title}" was created from your recurring task`,
          data: {
            taskId: task._id ? task._id.toString() : '',
            recurringTaskId: recurringTask._id ? recurringTask._id.toString() : '',
            message: 'A recurring task has been created',
            severity: 'info',
          },
        });

        created++;
      } catch (error) {
        logger.error(`Error processing recurring task ${recurringTask._id}:`, error);
        errors++;
      }
    }

    logger.info(
      `Processed ${processed} recurring tasks, created ${created} tasks, encountered ${errors} errors`,
    );

    return { processed, created, errors };
  } catch (error) {
    logger.error('Error processing recurring tasks:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get upcoming recurring task instances
 * @param userId User ID
 * @param days Number of days to look ahead
 * @returns Upcoming recurring task instances
 */
export const getUpcomingRecurrences = async (
  userId: string,
  days: number = 7,
): Promise<
  {
    date: Date;
    recurringTask: IRecurringTask;
  }[]
> => {
  const timer = startTimer('recurringTaskService.getUpcomingRecurrences');

  try {
    // Find active recurring tasks for the user
    const recurringTasks = await RecurringTask.find({
      user: userId,
      active: true,
    });

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + days);

    const upcomingRecurrences: {
      date: Date;
      recurringTask: IRecurringTask;
    }[] = [];

    // Calculate upcoming recurrences for each recurring task
    for (const recurringTask of recurringTasks) {
      let currentDate = recurringTask.nextRunDate || now;

      while (currentDate && currentDate <= endDate) {
        upcomingRecurrences.push({
          date: new Date(currentDate),
          recurringTask,
        });

        // Calculate next date
        const nextDate = calculateNextDate(
          currentDate,
          recurringTask.frequency,
          recurringTask.interval,
          recurringTask.daysOfWeek,
          recurringTask.daysOfMonth,
          recurringTask.monthsOfYear,
        );

        if (!nextDate || (recurringTask.endDate && nextDate > recurringTask.endDate)) {
          break;
        }

        currentDate = nextDate;
      }
    }

    // Sort by date
    upcomingRecurrences.sort((a, b) => a.date.getTime() - b.date.getTime());

    return upcomingRecurrences;
  } catch (error) {
    logger.error(`Error getting upcoming recurrences for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Toggle recurring task active status
 * @param recurringTaskId Recurring task ID
 * @param userId User ID
 * @param active Active status
 * @returns Updated recurring task
 */
export const toggleRecurringTaskActive = async (
  recurringTaskId: string,
  userId: string,
  active: boolean,
): Promise<IRecurringTask> => {
  const timer = startTimer('recurringTaskService.toggleRecurringTaskActive');

  try {
    // Find recurring task by ID
    const recurringTask = await RecurringTask.findById(recurringTaskId);

    // Check if recurring task exists
    if (!recurringTask) {
      throw new NotFoundError('Recurring task not found');
    }

    // Check if recurring task belongs to user
    if (recurringTask.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to update this recurring task');
    }

    // Update active status
    recurringTask.active = active;

    // If activating, calculate next run date if not set
    if (active && !recurringTask.nextRunDate) {
      const nextRunDate = calculateNextTaskDate(recurringTask);
      if (nextRunDate) {
        recurringTask.nextRunDate = nextRunDate;
      } else {
        throw new ValidationError(
          'Cannot activate recurring task: no future occurrences available',
        );
      }
    }

    await recurringTask.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_UPDATED,
      project: recurringTask.project as Types.ObjectId,
      data: {
        templateName: recurringTask.title,
        updates: ['active'],
        isTemplate: true,
        fromTemplate: true,
      },
    });

    // Invalidate cache
    cache.del(`recurringTask:${recurringTaskId}`);

    return recurringTask;
  } catch (error) {
    logger.error(`Error toggling recurring task active status ${recurringTaskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Create a task from a recurring task immediately
 * @param recurringTaskId Recurring task ID
 * @param userId User ID
 * @returns Created task
 */
export const createTaskFromRecurringTaskNow = async (
  recurringTaskId: string,
  userId: string,
): Promise<ITask> => {
  const timer = startTimer('recurringTaskService.createTaskFromRecurringTaskNow');

  try {
    // Find recurring task by ID
    const recurringTask = await RecurringTask.findById(recurringTaskId);

    // Check if recurring task exists
    if (!recurringTask) {
      throw new NotFoundError('Recurring task not found');
    }

    // Check if recurring task belongs to user
    if (recurringTask.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to use this recurring task');
    }

    // Create task from template
    const taskData: Partial<ITask> = {
      title: recurringTask.taskTemplate.title,
      description: recurringTask.taskTemplate.description,
      priority: recurringTask.taskTemplate.priority as unknown as TaskPriority,
      project: recurringTask.project,
      user: recurringTask.user,
      createdBy: recurringTask.user,
      tags: [...(recurringTask.taskTemplate.tags || []), 'recurring', 'manual-creation'],
      estimatedHours: recurringTask.taskTemplate.estimatedHours,
      // Handle attachments properly - convert to proper ITaskAttachment format
      attachments: recurringTask.taskTemplate.attachments?.map((attachment) => ({
        ...attachment,
        uploadedAt: new Date(),
        uploadedBy: recurringTask.user,
      })) as ITaskAttachment[],
    };

    // Create the task
    const task = await taskService.createTask(userId, taskData);

    // Update recurring task
    recurringTask.createdTasks.push(task._id as Types.ObjectId);
    await recurringTask.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_CREATED,
      project: recurringTask.project as Types.ObjectId,
      task: task._id as Types.ObjectId,
      data: {
        templateName: recurringTask.title,
        taskTitle: task.title,
        fromTemplate: true,
      },
    });

    // Invalidate cache
    cache.del(`recurringTask:${recurringTaskId}`);

    return task;
  } catch (error) {
    logger.error(`Error creating task from recurring task ${recurringTaskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Update recurrence pattern
 * @param recurringTaskId Recurring task ID
 * @param userId User ID
 * @param patternData Pattern data
 * @returns Updated recurring task
 */
export const updateRecurrencePattern = async (
  recurringTaskId: string,
  userId: string,
  patternData: {
    frequency?: RecurrenceFrequency;
    interval?: number;
    daysOfWeek?: number[];
    daysOfMonth?: number[];
    monthsOfYear?: number[];
    startDate?: Date;
    endDate?: Date;
  },
): Promise<IRecurringTask> => {
  const timer = startTimer('recurringTaskService.updateRecurrencePattern');

  try {
    // Find recurring task by ID
    const recurringTask = await RecurringTask.findById(recurringTaskId);

    // Check if recurring task exists
    if (!recurringTask) {
      throw new NotFoundError('Recurring task not found');
    }

    // Check if recurring task belongs to user
    if (recurringTask.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to update this recurring task');
    }

    // Validate recurrence pattern
    validateRecurrencePattern(
      patternData.frequency || recurringTask.frequency,
      patternData.daysOfWeek || recurringTask.daysOfWeek,
      patternData.daysOfMonth || recurringTask.daysOfMonth,
      patternData.monthsOfYear || recurringTask.monthsOfYear,
    );

    // Validate date range
    const startDate = patternData.startDate || recurringTask.startDate;
    const endDate = patternData.endDate || recurringTask.endDate;

    if (startDate && endDate && startDate >= endDate) {
      throw new ValidationError('End date must be after start date');
    }

    // Update pattern
    if (patternData.frequency !== undefined) recurringTask.frequency = patternData.frequency;
    if (patternData.interval !== undefined) recurringTask.interval = patternData.interval;
    if (patternData.daysOfWeek !== undefined) recurringTask.daysOfWeek = patternData.daysOfWeek;
    if (patternData.daysOfMonth !== undefined) recurringTask.daysOfMonth = patternData.daysOfMonth;
    if (patternData.monthsOfYear !== undefined)
      recurringTask.monthsOfYear = patternData.monthsOfYear;
    if (patternData.startDate !== undefined) recurringTask.startDate = patternData.startDate;
    if (patternData.endDate !== undefined) recurringTask.endDate = patternData.endDate;

    // Recalculate next run date
    const nextRunDate = calculateNextTaskDate(recurringTask);
    if (nextRunDate) {
      recurringTask.nextRunDate = nextRunDate;
    } else {
      // If no next run date is available (e.g., past end date), deactivate the recurring task
      recurringTask.active = false;
    }

    await recurringTask.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_UPDATED,
      project: recurringTask.project as Types.ObjectId,
      data: {
        templateName: recurringTask.title,
        updates: ['recurrencePattern', ...Object.keys(patternData)],
        isTemplate: true,
        fromTemplate: true,
      },
    });

    // Invalidate cache
    cache.del(`recurringTask:${recurringTaskId}`);

    return recurringTask;
  } catch (error) {
    logger.error(`Error updating recurrence pattern for ${recurringTaskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get tasks created from a recurring task
 * @param recurringTaskId Recurring task ID
 * @param userId User ID
 * @param queryParams Query parameters
 * @returns Tasks and pagination metadata
 */
export const getTasksFromRecurringTask = async (
  recurringTaskId: string,
  userId: string,
  queryParams: QueryParams = {},
): Promise<PaginatedResult<ITask>> => {
  const timer = startTimer('recurringTaskService.getTasksFromRecurringTask');

  try {
    // Find recurring task by ID
    const recurringTask = await RecurringTask.findById(recurringTaskId);

    // Check if recurring task exists
    if (!recurringTask) {
      throw new NotFoundError('Recurring task not found');
    }

    // Check if recurring task belongs to user
    if (recurringTask.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to access this recurring task');
    }

    // Find tasks created from this recurring task
    const query = Task.find({
      _id: { $in: recurringTask.createdTasks },
    });

    // Apply API features (filtering, sorting, pagination)
    const features = new APIFeatures(query, queryParams)
      .filter()
      .sort('-createdAt') // Default sort by most recent
      .limitFields()
      .paginate();

    // Execute query with pagination metadata
    return await features.execute();
  } catch (error) {
    logger.error(`Error getting tasks from recurring task ${recurringTaskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get recurring task statistics
 * @param userId User ID
 * @returns Statistics about user's recurring tasks
 */
export const getRecurringTaskStats = async (
  userId: string,
): Promise<{
  total: number;
  active: number;
  inactive: number;
  byFrequency: Record<RecurrenceFrequency, number>;
  totalTasksCreated: number;
  upcomingThisWeek: number;
}> => {
  const timer = startTimer('recurringTaskService.getRecurringTaskStats');

  try {
    const recurringTasks = await RecurringTask.find({ user: userId });

    const stats = {
      total: recurringTasks.length,
      active: 0,
      inactive: 0,
      byFrequency: {
        [RecurrenceFrequency.DAILY]: 0,
        [RecurrenceFrequency.WEEKLY]: 0,
        [RecurrenceFrequency.MONTHLY]: 0,
        [RecurrenceFrequency.YEARLY]: 0,
      },
      totalTasksCreated: 0,
      upcomingThisWeek: 0,
    };

    const now = new Date();
    const weekFromNow = new Date(now);
    weekFromNow.setDate(now.getDate() + 7);

    for (const task of recurringTasks) {
      // Count active/inactive
      if (task.active) {
        stats.active++;
      } else {
        stats.inactive++;
      }

      // Count by frequency
      stats.byFrequency[task.frequency]++;

      // Count total tasks created
      stats.totalTasksCreated += task.createdTasks.length;

      // Count upcoming this week
      if (task.active && task.nextRunDate && task.nextRunDate <= weekFromNow) {
        stats.upcomingThisWeek++;
      }
    }

    return stats;
  } catch (error) {
    logger.error(`Error getting recurring task stats for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Bulk update recurring tasks
 * @param userId User ID
 * @param recurringTaskIds Array of recurring task IDs
 * @param updateData Update data
 * @returns Update result
 */
export const bulkUpdateRecurringTasks = async (
  userId: string,
  recurringTaskIds: string[],
  updateData: Partial<IRecurringTask>,
): Promise<{
  updated: number;
  errors: string[];
}> => {
  const timer = startTimer('recurringTaskService.bulkUpdateRecurringTasks');

  const result = {
    updated: 0,
    errors: [] as string[],
  };

  try {
    for (const taskId of recurringTaskIds) {
      try {
        await updateRecurringTask(taskId, userId, updateData);
        result.updated++;
      } catch (error) {
        result.errors.push(
          `Failed to update task ${taskId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return result;
  } catch (error) {
    logger.error(`Error bulk updating recurring tasks:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Validate recurrence pattern
 * @param frequency Recurrence frequency
 * @param daysOfWeek Days of week
 * @param daysOfMonth Days of month
 * @param monthsOfYear Months of year
 */
const validateRecurrencePattern = (
  frequency: RecurrenceFrequency,
  daysOfWeek?: number[],
  daysOfMonth?: number[],
  monthsOfYear?: number[],
): void => {
  switch (frequency) {
    case RecurrenceFrequency.WEEKLY:
      if (!daysOfWeek || daysOfWeek.length === 0) {
        throw new ValidationError('Days of week are required for weekly recurrence');
      }
      if (daysOfWeek.some((day) => day < 0 || day > 6)) {
        throw new ValidationError('Days of week must be between 0 (Sunday) and 6 (Saturday)');
      }
      break;

    case RecurrenceFrequency.MONTHLY:
      if (!daysOfMonth || daysOfMonth.length === 0) {
        throw new ValidationError('Days of month are required for monthly recurrence');
      }
      if (daysOfMonth.some((day) => day < 1 || day > 31)) {
        throw new ValidationError('Days of month must be between 1 and 31');
      }
      break;

    case RecurrenceFrequency.YEARLY:
      if (!monthsOfYear || monthsOfYear.length === 0) {
        throw new ValidationError('Months of year are required for yearly recurrence');
      }
      if (monthsOfYear.some((month) => month < 0 || month > 11)) {
        throw new ValidationError('Months of year must be between 0 (January) and 11 (December)');
      }
      break;

    case RecurrenceFrequency.DAILY:
      // No additional validation needed for daily recurrence
      break;

    default:
      throw new ValidationError('Invalid recurrence frequency');
  }
};

/**
 * Calculate next task date for a recurring task
 * @param recurringTask Recurring task
 * @returns Next task date or null if no next date is available
 */
const calculateNextTaskDate = (recurringTask: IRecurringTask): Date | null => {
  const now = new Date();
  const startDate = recurringTask.startDate || now;

  // If we have a next run date and it's in the future, use it as base
  let baseDate =
    recurringTask.nextRunDate && recurringTask.nextRunDate > now
      ? recurringTask.nextRunDate
      : startDate;

  // If base date is in the past, start from now
  if (baseDate < now) {
    baseDate = now;
  }

  return calculateNextDate(
    baseDate,
    recurringTask.frequency,
    recurringTask.interval,
    recurringTask.daysOfWeek,
    recurringTask.daysOfMonth,
    recurringTask.monthsOfYear,
    recurringTask.endDate,
  );
};

/**
 * Calculate next date based on recurrence pattern
 * @param baseDate Base date
 * @param frequency Recurrence frequency
 * @param interval Recurrence interval
 * @param daysOfWeek Days of week
 * @param daysOfMonth Days of month
 * @param monthsOfYear Months of year
 * @param endDate End date (optional)
 * @returns Next date or null if no next date is available
 */
const calculateNextDate = (
  baseDate: Date,
  frequency: RecurrenceFrequency,
  interval: number = 1,
  daysOfWeek?: number[],
  daysOfMonth?: number[],
  monthsOfYear?: number[],
  endDate?: Date,
): Date | null => {
  // Clone the base date to avoid modifying it
  const nextDate = new Date(baseDate);

  // Calculate the next date based on the frequency
  switch (frequency) {
    case RecurrenceFrequency.DAILY:
      nextDate.setDate(nextDate.getDate() + interval);
      break;

    case RecurrenceFrequency.WEEKLY:
      // For weekly recurrence, find the next day of the week
      if (daysOfWeek && daysOfWeek.length > 0) {
        // Sort days of week to ensure we find the next one
        const sortedDays = [...daysOfWeek].sort((a, b) => a - b);

        // Find the next day of the week
        const currentDayOfWeek = nextDate.getDay();
        const nextDayOfWeek = sortedDays.find((day) => day > currentDayOfWeek);

        if (nextDayOfWeek !== undefined) {
          // Found a day later in the current week
          nextDate.setDate(nextDate.getDate() + (nextDayOfWeek - currentDayOfWeek));
        } else {
          // Move to the first day of the next week interval
          const daysUntilNextWeek = 7 - currentDayOfWeek + sortedDays[0];
          const weeksToAdd = interval - 1; // We're already moving to next week
          nextDate.setDate(nextDate.getDate() + daysUntilNextWeek + weeksToAdd * 7);
        }
      } else {
        // Fallback: just add weeks
        nextDate.setDate(nextDate.getDate() + 7 * interval);
      }
      break;

    case RecurrenceFrequency.MONTHLY:
      // For monthly recurrence, find the next day of the month
      if (daysOfMonth && daysOfMonth.length > 0) {
        const sortedDays = [...daysOfMonth].sort((a, b) => a - b);
        const currentDay = nextDate.getDate();

        // Find next day in current month
        const nextDayInMonth = sortedDays.find((day) => day > currentDay);

        if (nextDayInMonth !== undefined) {
          // Found a day later in the current month
          nextDate.setDate(nextDayInMonth);
        } else {
          // Move to the first day of the next month interval
          nextDate.setMonth(nextDate.getMonth() + interval);
          nextDate.setDate(sortedDays[0]);

          // Handle case where the day doesn't exist in the target month
          if (nextDate.getDate() !== sortedDays[0]) {
            // Day doesn't exist in this month, move to next month
            nextDate.setMonth(nextDate.getMonth() + 1);
            nextDate.setDate(sortedDays[0]);
          }
        }
      } else {
        // Fallback: just add months
        nextDate.setMonth(nextDate.getMonth() + interval);
      }
      break;

    case RecurrenceFrequency.YEARLY:
      // For yearly recurrence, find the next month and day
      if (monthsOfYear && monthsOfYear.length > 0) {
        const sortedMonths = [...monthsOfYear].sort((a, b) => a - b);
        const currentMonth = nextDate.getMonth();
        const currentDay = nextDate.getDate();

        // Find next month in current year
        const nextMonthInYear = sortedMonths.find((month) => {
          if (month > currentMonth) return true;
          if (month === currentMonth && daysOfMonth) {
            // Same month, check if there's a later day
            const sortedDays = [...daysOfMonth].sort((a, b) => a - b);
            return sortedDays.some((day) => day > currentDay);
          }
          return false;
        });

        if (nextMonthInYear !== undefined) {
          // Found a month later in the current year
          nextDate.setMonth(nextMonthInYear);
          if (daysOfMonth && daysOfMonth.length > 0) {
            const sortedDays = [...daysOfMonth].sort((a, b) => a - b);
            if (nextMonthInYear === currentMonth) {
              // Same month, find next day
              const nextDay = sortedDays.find((day) => day > currentDay);
              nextDate.setDate(nextDay || sortedDays[0]);
            } else {
              // Different month, use first day
              nextDate.setDate(sortedDays[0]);
            }
          }
        } else {
          // Move to the first month of the next year interval
          nextDate.setFullYear(nextDate.getFullYear() + interval);
          nextDate.setMonth(sortedMonths[0]);
          if (daysOfMonth && daysOfMonth.length > 0) {
            const sortedDays = [...daysOfMonth].sort((a, b) => a - b);
            nextDate.setDate(sortedDays[0]);
          }
        }
      } else {
        // Fallback: just add years
        nextDate.setFullYear(nextDate.getFullYear() + interval);
      }
      break;

    default:
      return null;
  }

  // Check if the calculated date is beyond the end date
  if (endDate && nextDate > endDate) {
    return null;
  }

  // Ensure the date is in the future
  if (nextDate <= baseDate) {
    // If we somehow calculated a date that's not in the future, try again
    return calculateNextDate(
      nextDate,
      frequency,
      interval,
      daysOfWeek,
      daysOfMonth,
      monthsOfYear,
      endDate,
    );
  }

  return nextDate;
};

/**
 * Clean up expired recurring tasks
 * This should be run by a scheduled job
 * @returns Cleanup result
 */
export const cleanupExpiredRecurringTasks = async (): Promise<{
  deactivated: number;
  errors: number;
}> => {
  const timer = startTimer('recurringTaskService.cleanupExpiredRecurringTasks');

  let deactivated = 0;
  let errors = 0;

  try {
    const now = new Date();

    // Find active recurring tasks that have passed their end date
    const expiredTasks = await RecurringTask.find({
      active: true,
      endDate: { $lt: now },
    });

    logger.info(`Found ${expiredTasks.length} expired recurring tasks to deactivate`);

    for (const task of expiredTasks) {
      try {
        task.active = false;
        await task.save();
        deactivated++;
      } catch (error) {
        logger.error(`Error deactivating expired recurring task ${task._id}:`, error);
        errors++;
      }
    }

    logger.info(`Deactivated ${deactivated} expired recurring tasks, encountered ${errors} errors`);

    return { deactivated, errors };
  } catch (error) {
    logger.error('Error cleaning up expired recurring tasks:', error);
    throw error;
  } finally {
    timer.end();
  }
};
