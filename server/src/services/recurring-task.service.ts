import { Types } from 'mongoose';
import RecurringTask, {
  type IRecurringTask,
  type ITaskTemplate,
  RecurrenceFrequency,
} from '../models/recurring-task.model';
import Task, { TaskStatus, TaskPriority } from '../models/task.model';
import User from '../models/user.model';
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
      if (project.user.toString() !== userId) {
        throw new ForbiddenError(
          'You do not have permission to create recurring tasks for this project',
        );
      }
    }

    // Validate recurrence pattern
    validateRecurrencePattern(
      recurringTaskData.frequency as RecurrenceFrequency,
      recurringTaskData.daysOfWeek,
      recurringTaskData.daysOfMonth,
      recurringTaskData.monthsOfYear,
    );

    // Set user ID
    recurringTaskData.user = new Types.ObjectId(userId);

    // Set default task template if not provided
    if (!recurringTaskData.taskTemplate) {
      recurringTaskData.taskTemplate = {
        title: recurringTaskData.title || 'Recurring Task',
        priority: TaskPriority.MEDIUM,
      } as ITaskTemplate;
    }

    // Create recurring task
    const recurringTask = await RecurringTask.create(recurringTaskData);

    // Calculate next run date
    const nextRunDate = recurringTask.calculateNextTaskDate();
    if (nextRunDate) {
      recurringTask.nextRunDate = nextRunDate;
      await recurringTask.save();
    }

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_CREATED,
      project: recurringTaskData.project as Types.ObjectId,
      data: {
        taskTitle: recurringTask.title,
        isRecurring: true,
        frequency: recurringTask.frequency,
        interval: recurringTask.interval,
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
  queryParams: Record<string, any> = {},
): Promise<{
  data: IRecurringTask[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
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
      if (project.user.toString() !== userId) {
        throw new ForbiddenError('You do not have permission to use this project');
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
      const nextRunDate = recurringTask.calculateNextTaskDate();
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
      project: recurringTask.project,
      data: {
        taskTitle: recurringTask.title,
        isRecurring: true,
        updates: Object.keys(updateData),
        patternUpdated: isPatternUpdated,
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
      project: projectId,
      data: {
        taskTitle,
        isRecurring: true,
        createdTasksDeleted: options.deleteCreatedTasks,
        createdTaskCount: createdTaskIds.length,
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
        const taskData = {
          ...recurringTask.taskTemplate,
          title: recurringTask.taskTemplate.title,
          description: recurringTask.taskTemplate.description,
          priority: recurringTask.taskTemplate.priority,
          project: recurringTask.project,
          user: recurringTask.user,
          createdBy: recurringTask.user,
          tags: [...(recurringTask.taskTemplate.tags || []), 'recurring'],
        };

        // Create the task
        const task = await Task.create(taskData);

        // Update recurring task
        recurringTask.lastTaskCreated = now;
        recurringTask.createdTasks.push(task._id);

        // Calculate next run date
        const nextRunDate = recurringTask.calculateNextTaskDate();
        if (nextRunDate) {
          recurringTask.nextRunDate = nextRunDate;
        } else {
          // If no next run date is available (e.g., past end date), deactivate the recurring task
          recurringTask.active = false;
        }

        await recurringTask.save();

        // Create notification for task owner
        await notificationService.createNotification(recurringTask.user.toString(), {
          type: NotificationType.TASK_CREATED,
          title: 'Recurring Task Created',
          message: `A new task "${task.title}" was created from your recurring task`,
          data: {
            taskId: task._id.toString(),
            recurringTaskId: recurringTask._id.toString(),
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
      const nextRunDate = recurringTask.calculateNextTaskDate();
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
      project: recurringTask.project,
      data: {
        taskTitle: recurringTask.title,
        isRecurring: true,
        updates: ['active'],
        active,
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
): Promise<any> => {
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
    const taskData = {
      ...recurringTask.taskTemplate,
      title: recurringTask.taskTemplate.title,
      description: recurringTask.taskTemplate.description,
      priority: recurringTask.taskTemplate.priority,
      project: recurringTask.project,
      user: recurringTask.user,
      createdBy: recurringTask.user,
      tags: [...(recurringTask.taskTemplate.tags || []), 'recurring', 'manual-creation'],
    };

    // Create the task
    const task = await taskService.createTask(userId, taskData);

    // Update recurring task
    recurringTask.createdTasks.push(task._id);
    await recurringTask.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_CREATED,
      project: recurringTask.project,
      task: task._id,
      data: {
        taskTitle: task.title,
        isRecurring: true,
        manualCreation: true,
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
    const nextRunDate = recurringTask.calculateNextTaskDate();
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
      project: recurringTask.project,
      data: {
        taskTitle: recurringTask.title,
        isRecurring: true,
        updates: ['recurrencePattern'],
        patternUpdates: Object.keys(patternData),
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
  queryParams: Record<string, any> = {},
): Promise<{
  data: any[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
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
  }
};

/**
 * Calculate next date based on recurrence pattern
 * @param baseDate Base date
 * @param frequency Recurrence frequency
 * @param interval Recurrence interval
 * @param daysOfWeek Days of week
 * @param daysOfMonth Days of month
 * @param monthsOfYear Months of year
 * @returns Next date or null if no next date is available
 */
const calculateNextDate = (
  baseDate: Date,
  frequency: RecurrenceFrequency,
  interval: number = 1,
  daysOfWeek?: number[],
  daysOfMonth?: number[],
  monthsOfYear?: number[],
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
          // Move to the first day of the next week
          nextDate.setDate(
            nextDate.getDate() + (7 - currentDayOfWeek) + sortedDays[0] + (interval - 1) * 7,
          );
        }
      } else {
        // If no specific days are specified, just add 7 days
        nextDate.setDate(nextDate.getDate() + 7 * interval);
      }
      break;

    case RecurrenceFrequency.MONTHLY:
      // For monthly recurrence, find the next day of the month
      if (daysOfMonth && daysOfMonth.length > 0) {
        // Sort days of month to ensure we find the next one
        const sortedDays = [...daysOfMonth].sort((a, b) => a - b);

        // Find the next day of the month
        const currentDayOfMonth = nextDate.getDate();
        const nextDayOfMonth = sortedDays.find((day) => day > currentDayOfMonth);

        if (nextDayOfMonth !== undefined) {
          // Found a day later in the current month
          nextDate.setDate(nextDayOfMonth);
        } else {
          // Move to the first day of the next month
          nextDate.setMonth(nextDate.getMonth() + interval);
          nextDate.setDate(sortedDays[0]);
        }
      } else {
        // If no specific days are specified, just add the interval months
        nextDate.setMonth(nextDate.getMonth() + interval);
      }
      break;

    case RecurrenceFrequency.YEARLY:
      // For yearly recurrence, find the next month of the year
      if (monthsOfYear && monthsOfYear.length > 0) {
        // Sort months of year to ensure we find the next one
        const sortedMonths = [...monthsOfYear].sort((a, b) => a - b);

        // Find the next month of the year
        const currentMonth = nextDate.getMonth();
        const nextMonth = sortedMonths.find((month) => month > currentMonth);

        if (nextMonth !== undefined) {
          // Found a month later in the current year
          nextDate.setMonth(nextMonth);
        } else {
          // Move to the first month of the next year
          nextDate.setFullYear(nextDate.getFullYear() + interval);
          nextDate.setMonth(sortedMonths[0]);
        }
      } else {
        // If no specific months are specified, just add the interval years
        nextDate.setFullYear(nextDate.getFullYear() + interval);
      }
      break;
  }

  return nextDate;
};
