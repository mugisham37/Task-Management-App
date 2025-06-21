import mongoose from 'mongoose';
import Task, { TaskStatus } from '../models/task.model';
import Project from '../models/project.model';
import Team from '../models/team.model';
import Activity from '../models/activity.model';
import { NotFoundError, ForbiddenError } from '../utils/app-error';
import { safeDate, toObjectId, isUserTeamMember } from '../utils/mongodb-helpers';
import {
  TaskCompletionAnalytics,
  CompletionRateDataPoint,
  ProjectAnalytics,
  MongoQueryCriteria,
  TeamAnalytics,
  UserProductivityAnalytics,
  StreakResult,
  RecurringTaskAnalytics,
  TeamActivityItem,
  RecurringTaskItem,
  TasksCreatedOverTimeDataPoint,
} from '../types/analytics.types';

// Define interfaces for Project and Team with owner and members properties
interface ProjectWithAccess extends mongoose.Document {
  name: string;
  description?: string;
  createdAt: Date;
  owner?: mongoose.Types.ObjectId;
  members?: mongoose.Types.ObjectId[];
}

interface TeamWithAccess extends mongoose.Document {
  name: string;
  description?: string;
  members: import('../models/team.model').ITeamMember[]; // Using proper type
  owner?: mongoose.Types.ObjectId | string;
}

/**
 * Get task completion analytics
 * @param userId User ID
 * @param period Period (day, week, month, year)
 * @param startDate Start date
 * @param endDate End date
 * @returns Task completion analytics
 */
export const getTaskCompletionAnalytics = async (
  userId: string,
  period: 'day' | 'week' | 'month' | 'year' = 'month',
  startDate?: Date,
  endDate?: Date,
): Promise<TaskCompletionAnalytics> => {
  // Set default date range if not provided
  if (!startDate || !endDate) {
    const now = new Date();
    endDate = now;
    startDate = new Date(now.getTime()); // Create a new date by passing a timestamp

    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }
  }

  // Get tasks created and completed in the date range
  const tasksCreated = await Task.countDocuments({
    user: userId,
    createdAt: { $gte: startDate, $lte: endDate },
  });

  const tasksCompleted = await Task.countDocuments({
    user: userId,
    status: TaskStatus.DONE,
    completedAt: { $gte: startDate, $lte: endDate },
  });

  // Get tasks by status
  const tasksByStatus = await Task.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        createdAt: { $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  // Get tasks by priority
  const tasksByPriority = await Task.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        createdAt: { $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$priority',
        count: { $sum: 1 },
      },
    },
  ]);

  // Get completion rate over time
  const completionRateOverTime = await getCompletionRateOverTime(
    userId,
    period,
    startDate,
    endDate,
  );

  // Get average completion time
  const averageCompletionTime = await getAverageCompletionTime(userId, startDate, endDate);

  return {
    tasksCreated,
    tasksCompleted,
    completionRate: tasksCreated > 0 ? (tasksCompleted / tasksCreated) * 100 : 0,
    tasksByStatus: tasksByStatus.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    tasksByPriority: tasksByPriority.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    completionRateOverTime,
    averageCompletionTime,
  };
};

/**
 * Get completion rate over time
 * @param userId User ID
 * @param period Period (day, week, month, year)
 * @param startDate Start date
 * @param endDate End date
 * @returns Completion rate over time
 */
const getCompletionRateOverTime = async (
  userId: string,
  period: 'day' | 'week' | 'month' | 'year',
  startDate: Date,
  endDate: Date,
): Promise<CompletionRateDataPoint[]> => {
  let groupByFormat;
  let dateFormat;

  switch (period) {
    case 'day':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
        hour: { $hour: '$createdAt' },
      };
      dateFormat = '%Y-%m-%d %H:00';
      break;
    case 'week':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
      };
      dateFormat = '%Y-%m-%d';
      break;
    case 'month':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        week: { $week: '$createdAt' },
      };
      dateFormat = '%Y-%m Week %U';
      break;
    case 'year':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
      };
      dateFormat = '%Y-%m';
      break;
  }

  // Get tasks created over time
  const tasksCreatedOverTime = await Task.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: groupByFormat,
        count: { $sum: 1 },
        date: { $first: '$createdAt' },
      },
    },
    {
      $sort: { date: 1 },
    },
    {
      $project: {
        _id: 0,
        date: {
          $dateToString: { format: dateFormat, date: '$date' },
        },
        count: 1,
      },
    },
  ]);

  // Get tasks completed over time
  const tasksCompletedOverTime = await Task.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        status: TaskStatus.DONE,
        completedAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: groupByFormat,
        count: { $sum: 1 },
        date: { $first: '$completedAt' },
      },
    },
    {
      $sort: { date: 1 },
    },
    {
      $project: {
        _id: 0,
        date: {
          $dateToString: { format: dateFormat, date: '$date' },
        },
        count: 1,
      },
    },
  ]);

  // Combine the results
  const result: CompletionRateDataPoint[] = [];
  const dateMap = new Map();

  // Initialize with created tasks
  tasksCreatedOverTime.forEach((item) => {
    dateMap.set(item.date, {
      date: item.date,
      created: item.count,
      completed: 0,
      rate: 0,
    });
  });

  // Add completed tasks
  tasksCompletedOverTime.forEach((item) => {
    if (dateMap.has(item.date)) {
      const entry = dateMap.get(item.date);
      entry.completed = item.count;
      entry.rate = (entry.completed / entry.created) * 100;
    } else {
      dateMap.set(item.date, {
        date: item.date,
        created: 0,
        completed: item.count,
        rate: 0,
      });
    }
  });

  // Convert map to array
  dateMap.forEach((value) => {
    result.push(value);
  });

  // Sort by date
  result.sort((a, b) => {
    // Safely handle potential undefined dates
    const dateA = typeof a.date === 'string' ? new Date(a.date).getTime() : 0;
    const dateB = typeof b.date === 'string' ? new Date(b.date).getTime() : 0;
    return dateA - dateB;
  });

  return result;
};

/**
 * Get average completion time
 * @param userId User ID
 * @param startDate Start date
 * @param endDate End date
 * @returns Average completion time in hours
 */
const getAverageCompletionTime = async (
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<number> => {
  const completedTasks = await Task.find({
    user: userId,
    status: TaskStatus.DONE,
    completedAt: { $gte: startDate, $lte: endDate },
    createdAt: { $gte: startDate, $lte: endDate },
  });

  if (completedTasks.length === 0) {
    return 0;
  }

  // Calculate the average completion time in hours
  const totalCompletionTime = completedTasks.reduce((total, task) => {
    const createdAt = new Date(task.createdAt).getTime();
    // Safely handle potentially undefined completedAt
    const completedDate = safeDate(task.completedAt);
    if (!completedDate) return total; // Skip tasks without completion date
    const completedAt = completedDate.getTime();
    return total + (completedAt - createdAt);
  }, 0);

  // Convert from milliseconds to hours
  return totalCompletionTime / completedTasks.length / (1000 * 60 * 60);
};

/**
 * Get project analytics
 * @param projectId Project ID
 * @param userId User ID (optional, for authorization)
 * @param period Period (day, week, month, year)
 * @param startDate Start date
 * @param endDate End date
 * @returns Project analytics
 */
export const getProjectAnalytics = async (
  projectId: string,
  userId?: string,
  period: 'day' | 'week' | 'month' | 'year' = 'month',
  startDate?: Date,
  endDate?: Date,
): Promise<ProjectAnalytics> => {
  // Set default date range if not provided
  if (!startDate || !endDate) {
    const now = new Date();
    endDate = now;
    startDate = new Date(now.getTime()); // Create a new date by passing a timestamp

    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }
  }

  // Get project details
  const project = await Project.findById(projectId);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Check if user has access to the project
  if (userId && project) {
    const isOwner = (project as ProjectWithAccess).owner?.toString() === userId;
    const userObjectId = toObjectId(userId);
    const isMember =
      userObjectId &&
      (project as ProjectWithAccess).members?.some((memberId) => memberId.equals(userObjectId));
    if (!isOwner && !isMember) {
      throw new ForbiddenError('You do not have access to this project');
    }
  }

  // Get tasks by status
  const tasksByStatus = await Task.aggregate([
    {
      $match: {
        project: new mongoose.Types.ObjectId(projectId),
        createdAt: { $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  // Get tasks by priority
  const tasksByPriority = await Task.aggregate([
    {
      $match: {
        project: new mongoose.Types.ObjectId(projectId),
        createdAt: { $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$priority',
        count: { $sum: 1 },
      },
    },
  ]);

  // Get tasks over time
  const tasksOverTime = await getTasksOverTime(
    { project: new mongoose.Types.ObjectId(projectId) },
    period,
    startDate,
    endDate,
  );

  return {
    project: {
      id: project._id ? project._id.toString() : '',
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
    },
    tasksByStatus: tasksByStatus.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    tasksByPriority: tasksByPriority.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    tasksOverTime,
  };
};

/**
 * Get team analytics
 * @param teamId Team ID
 * @param userId User ID (for authorization)
 * @param period Period (day, week, month, year)
 * @param startDate Start date
 * @param endDate End date
 * @returns Team analytics
 */
export const getTeamAnalytics = async (
  teamId: string,
  userId: string,
  period: 'day' | 'week' | 'month' | 'year' = 'month',
  startDate?: Date,
  endDate?: Date,
): Promise<TeamAnalytics> => {
  // Set default date range if not provided
  if (!startDate || !endDate) {
    const now = new Date();
    endDate = now;
    startDate = new Date(now.getTime()); // Create a new date by passing a timestamp

    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }
  }

  // Get team details
  const team = await Team.findById(teamId);
  if (!team) {
    throw new NotFoundError('Team not found');
  }

  // Check if user has access to the team
  const isOwner = (team as TeamWithAccess).owner?.toString() === userId;
  const isMember = isUserTeamMember((team as TeamWithAccess).members || [], userId);
  if (team && !isOwner && !isMember) {
    throw new ForbiddenError('You do not have access to this team');
  }

  // Get tasks by member
  const tasksByMember = await Task.aggregate([
    {
      $match: {
        team: new mongoose.Types.ObjectId(teamId),
        createdAt: { $lte: endDate },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDetails',
      },
    },
    {
      $unwind: '$userDetails',
    },
    {
      $group: {
        _id: '$user',
        userName: { $first: '$userDetails.name' },
        userEmail: { $first: '$userDetails.email' },
        totalTasks: { $sum: 1 },
        completedTasks: {
          $sum: {
            $cond: [{ $eq: ['$status', TaskStatus.DONE] }, 1, 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        userName: 1,
        userEmail: 1,
        totalTasks: 1,
        completedTasks: 1,
        completionRate: {
          $cond: [
            { $gt: ['$totalTasks', 0] },
            { $multiply: [{ $divide: ['$completedTasks', '$totalTasks'] }, 100] },
            0,
          ],
        },
      },
    },
  ]);

  // Get tasks by status
  const tasksByStatus = await Task.aggregate([
    {
      $match: {
        team: new mongoose.Types.ObjectId(teamId),
        createdAt: { $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  // Get tasks by priority
  const tasksByPriority = await Task.aggregate([
    {
      $match: {
        team: new mongoose.Types.ObjectId(teamId),
        createdAt: { $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$priority',
        count: { $sum: 1 },
      },
    },
  ]);

  // Get tasks over time
  const tasksOverTime = await getTasksOverTime(
    { team: new mongoose.Types.ObjectId(teamId) },
    period,
    startDate,
    endDate,
  );

  // Get team activity
  const teamActivity = await getTeamActivity(teamId, period, startDate, endDate);

  return {
    team: {
      id: team._id ? team._id.toString() : '',
      name: team.name,
      description: team.description,
      memberCount: team.members.length + 1, // +1 for the owner
    },
    tasksByMember,
    tasksByStatus: tasksByStatus.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    tasksByPriority: tasksByPriority.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    tasksOverTime,
    teamActivity,
  };
};

/**
 * Get user productivity analytics
 * @param userId User ID
 * @param period Period (day, week, month, year)
 * @param startDate Start date
 * @param endDate End date
 * @returns User productivity analytics
 */
export const getUserProductivityAnalytics = async (
  userId: string,
  period: 'day' | 'week' | 'month' | 'year' = 'month',
  startDate?: Date,
  endDate?: Date,
): Promise<UserProductivityAnalytics> => {
  // Set default date range if not provided
  if (!startDate || !endDate) {
    const now = new Date();
    endDate = now;
    startDate = new Date(now.getTime()); // Create a new date by passing a timestamp

    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }
  }

  // Get tasks created and completed in the date range
  const tasksCreated = await Task.countDocuments({
    user: userId,
    createdAt: { $gte: startDate, $lte: endDate },
  });

  const tasksCompleted = await Task.countDocuments({
    user: userId,
    status: TaskStatus.DONE,
    completedAt: { $gte: startDate, $lte: endDate },
  });

  // Get average completion time
  const averageCompletionTime = await getAverageCompletionTime(userId, startDate, endDate);

  // Get productivity by day of week
  const productivityByDayOfWeek = await Task.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        status: TaskStatus.DONE,
        completedAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: { $dayOfWeek: '$completedAt' },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        dayOfWeek: {
          $switch: {
            branches: [
              { case: { $eq: ['$_id', 1] }, then: 'Sunday' },
              { case: { $eq: ['$_id', 2] }, then: 'Monday' },
              { case: { $eq: ['$_id', 3] }, then: 'Tuesday' },
              { case: { $eq: ['$_id', 4] }, then: 'Wednesday' },
              { case: { $eq: ['$_id', 5] }, then: 'Thursday' },
              { case: { $eq: ['$_id', 6] }, then: 'Friday' },
              { case: { $eq: ['$_id', 7] }, then: 'Saturday' },
            ],
            default: 'Unknown',
          },
        },
        count: 1,
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  // Get productivity by hour of day
  const productivityByHourOfDay = await Task.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        status: TaskStatus.DONE,
        completedAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: { $hour: '$completedAt' },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        hour: '$_id',
        count: 1,
      },
    },
    {
      $sort: { hour: 1 },
    },
  ]);

  // Calculate streaks
  const streakResult = await calculateStreaks(userId);

  return {
    tasksCreated,
    tasksCompleted,
    completionRate: tasksCreated > 0 ? (tasksCompleted / tasksCreated) * 100 : 0,
    averageCompletionTime,
    productivityByDayOfWeek,
    productivityByHourOfDay,
    currentStreak: streakResult.currentStreak,
    longestStreak: streakResult.longestStreak,
  };
};

/**
 * Get recurring task analytics
 * @param userId User ID
 * @param period Period (day, week, month, year)
 * @param startDate Start date
 * @param endDate End date
 * @returns Recurring task analytics
 */
export const getRecurringTaskAnalytics = async (
  userId: string,
  period: 'day' | 'week' | 'month' | 'year' = 'month',
  startDate?: Date,
  endDate?: Date,
): Promise<RecurringTaskAnalytics> => {
  // Set default date range if not provided
  if (!startDate || !endDate) {
    const now = new Date();
    endDate = now;
    startDate = new Date(now.getTime()); // Create a new date by passing a timestamp

    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }
  }

  // Get recurring tasks
  const recurringTasks = (await Task.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        isRecurring: true,
      },
    },
    {
      $group: {
        _id: {
          frequency: '$recurringFrequency',
          active: '$isActive',
        },
        count: { $sum: 1 },
      },
    },
  ])) as RecurringTaskItem[];

  // Calculate total, active, and inactive recurring tasks
  const totalRecurringTasks = recurringTasks.reduce((total, item) => total + item.count, 0);
  const activeRecurringTasks = recurringTasks
    .filter((item) => item._id.active)
    .reduce((total, item) => total + item.count, 0);
  const inactiveRecurringTasks = totalRecurringTasks - activeRecurringTasks;

  // Get tasks created from recurring tasks
  const tasksCreatedFromRecurring = await Task.countDocuments({
    user: userId,
    parentRecurringTaskId: { $exists: true, $ne: null },
    createdAt: { $gte: startDate, $lte: endDate },
  });

  // Get tasks completed from recurring tasks
  const tasksCompletedFromRecurring = await Task.countDocuments({
    user: userId,
    parentRecurringTaskId: { $exists: true, $ne: null },
    status: TaskStatus.DONE,
    completedAt: { $gte: startDate, $lte: endDate },
  });

  // Get recurring tasks by frequency
  const recurringTasksByFrequency = recurringTasks.reduce<Record<string, number>>(
    (acc, item) => {
      const frequency = item._id.frequency || 'unknown';
      acc[frequency] = (acc[frequency] || 0) + item.count;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Get tasks created over time
  const tasksCreatedOverTime = await getTasksCreatedOverTime(
    {
      user: new mongoose.Types.ObjectId(userId),
      parentRecurringTaskId: { $exists: true, $ne: null },
    },
    period,
    startDate,
    endDate,
  );

  return {
    totalRecurringTasks,
    activeRecurringTasks,
    inactiveRecurringTasks,
    tasksCreatedFromRecurring,
    tasksCompletedFromRecurring,
    completionRate:
      tasksCreatedFromRecurring > 0
        ? (tasksCompletedFromRecurring / tasksCreatedFromRecurring) * 100
        : 0,
    recurringTasksByFrequency,
    tasksCreatedOverTime,
  };
};

/**
 * Helper function to get tasks over time
 * @param matchCriteria MongoDB match criteria
 * @param period Period (day, week, month, year)
 * @param startDate Start date
 * @param endDate End date
 * @returns Tasks over time data points
 */
const getTasksOverTime = async (
  matchCriteria: MongoQueryCriteria,
  period: 'day' | 'week' | 'month' | 'year',
  startDate: Date,
  endDate: Date,
): Promise<import('../types/analytics.types').TasksOverTimeDataPoint[]> => {
  let groupByFormat;
  let dateFormat;

  switch (period) {
    case 'day':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
        hour: { $hour: '$createdAt' },
      };
      dateFormat = '%Y-%m-%d %H:00';
      break;
    case 'week':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
      };
      dateFormat = '%Y-%m-%d';
      break;
    case 'month':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        week: { $week: '$createdAt' },
      };
      dateFormat = '%Y-%m Week %U';
      break;
    case 'year':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
      };
      dateFormat = '%Y-%m';
      break;
  }

  // Get tasks created over time
  const tasksCreatedOverTime = await Task.aggregate([
    {
      $match: {
        ...matchCriteria,
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: groupByFormat,
        count: { $sum: 1 },
        date: { $first: '$createdAt' },
      },
    },
    {
      $sort: { date: 1 },
    },
    {
      $project: {
        _id: 0,
        date: {
          $dateToString: { format: dateFormat, date: '$date' },
        },
        created: '$count',
      },
    },
  ]);

  // Get tasks completed over time
  const tasksCompletedOverTime = await Task.aggregate([
    {
      $match: {
        ...matchCriteria,
        status: TaskStatus.DONE,
        completedAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: groupByFormat,
        count: { $sum: 1 },
        date: { $first: '$completedAt' },
      },
    },
    {
      $sort: { date: 1 },
    },
    {
      $project: {
        _id: 0,
        date: {
          $dateToString: { format: dateFormat, date: '$date' },
        },
        completed: '$count',
      },
    },
  ]);

  // Combine the results
  const result: import('../types/analytics.types').TasksOverTimeDataPoint[] = [];
  const dateMap = new Map();

  // Initialize with created tasks
  tasksCreatedOverTime.forEach((item) => {
    dateMap.set(item.date, {
      date: item.date,
      created: item.created,
      completed: 0,
    });
  });

  // Add completed tasks
  tasksCompletedOverTime.forEach((item) => {
    if (dateMap.has(item.date)) {
      const entry = dateMap.get(item.date);
      entry.completed = item.completed;
    } else {
      dateMap.set(item.date, {
        date: item.date,
        created: 0,
        completed: item.completed,
      });
    }
  });

  // Convert map to array
  dateMap.forEach((value) => {
    result.push(value);
  });

  // Sort by date
  result.sort((a, b) => {
    // Safely handle potential undefined dates
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateA - dateB;
  });

  return result;
};

/**
 * Helper function to get tasks created over time
 * @param matchCriteria MongoDB match criteria
 * @param period Period (day, week, month, year)
 * @param startDate Start date
 * @param endDate End date
 * @returns Tasks created over time data points
 */
const getTasksCreatedOverTime = async (
  matchCriteria: MongoQueryCriteria,
  period: 'day' | 'week' | 'month' | 'year',
  startDate: Date,
  endDate: Date,
): Promise<TasksCreatedOverTimeDataPoint[]> => {
  let groupByFormat;
  let dateFormat;

  switch (period) {
    case 'day':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
        hour: { $hour: '$createdAt' },
      };
      dateFormat = '%Y-%m-%d %H:00';
      break;
    case 'week':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
      };
      dateFormat = '%Y-%m-%d';
      break;
    case 'month':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        week: { $week: '$createdAt' },
      };
      dateFormat = '%Y-%m Week %U';
      break;
    case 'year':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
      };
      dateFormat = '%Y-%m';
      break;
  }

  // Get tasks created over time
  const tasksCreatedOverTime = await Task.aggregate([
    {
      $match: {
        ...matchCriteria,
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: groupByFormat,
        count: { $sum: 1 },
        date: { $first: '$createdAt' },
      },
    },
    {
      $sort: { date: 1 },
    },
    {
      $project: {
        _id: 0,
        date: {
          $dateToString: { format: dateFormat, date: '$date' },
        },
        count: 1,
      },
    },
  ]);

  // Sort by date
  tasksCreatedOverTime.sort((a, b) => {
    // Safely handle potential undefined dates
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateA - dateB;
  });

  return tasksCreatedOverTime;
};

/**
 * Helper function to get team activity
 * @param teamId Team ID
 * @param period Period (day, week, month, year)
 * @param startDate Start date
 * @param endDate End date
 * @returns Team activity data points
 */
const getTeamActivity = async (
  teamId: string,
  period: 'day' | 'week' | 'month' | 'year',
  startDate: Date,
  endDate: Date,
): Promise<TeamActivityItem[]> => {
  let groupByFormat;
  let dateFormat;

  switch (period) {
    case 'day':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
        hour: { $hour: '$createdAt' },
      };
      dateFormat = '%Y-%m-%d %H:00';
      break;
    case 'week':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
      };
      dateFormat = '%Y-%m-%d';
      break;
    case 'month':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        week: { $week: '$createdAt' },
      };
      dateFormat = '%Y-%m Week %U';
      break;
    case 'year':
      groupByFormat = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
      };
      dateFormat = '%Y-%m';
      break;
  }

  // Get team activity
  const teamObjectId = toObjectId(teamId);
  if (!teamObjectId) {
    throw new NotFoundError('Invalid team ID format');
  }
  const teamActivity = await Activity.aggregate([
    {
      $match: {
        team: teamObjectId,
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDetails',
      },
    },
    {
      $unwind: '$userDetails',
    },
    {
      $group: {
        _id: {
          ...groupByFormat,
          userId: '$user',
        },
        userName: { $first: '$userDetails.name' },
        count: { $sum: 1 },
        date: { $first: '$createdAt' },
      },
    },
    {
      $sort: { date: 1 },
    },
    {
      $project: {
        _id: 0,
        date: {
          $dateToString: { format: dateFormat, date: '$date' },
        },
        userId: '$_id.userId',
        userName: 1,
        count: 1,
      },
    },
  ]);

  return teamActivity;
};

/**
 * Calculate user streaks
 * @param userId User ID
 * @returns Streak result
 */
const calculateStreaks = async (userId: string): Promise<StreakResult> => {
  // Get all days where the user completed at least one task
  const completedDays = await Task.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        status: TaskStatus.DONE,
        completedAt: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$completedAt' },
          month: { $month: '$completedAt' },
          day: { $dayOfMonth: '$completedAt' },
        },
        date: { $first: '$completedAt' },
      },
    },
    {
      $project: {
        _id: 0,
        date: {
          $dateToString: { format: '%Y-%m-%d', date: '$date' },
        },
      },
    },
    {
      $sort: { date: 1 },
    },
  ]);

  if (completedDays.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  // Convert to array of dates
  const dates = completedDays.map((day) => day.date);

  // Calculate streaks
  let currentStreak = 0;
  let longestStreak = 0;

  // Check if today has a completed task
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const hasCompletedToday = dates.includes(todayStr);

  // Check if yesterday has a completed task
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const hasCompletedYesterday = dates.includes(yesterdayStr);

  // If completed today, start counting from today
  if (hasCompletedToday) {
    currentStreak = 1;
  }

  // Sort dates in descending order
  const sortedDates = [...dates].sort((a, b) => {
    // Safely handle potential undefined dates
    const dateA = a ? new Date(a).getTime() : 0;
    const dateB = b ? new Date(b).getTime() : 0;
    return dateB - dateA;
  });

  // Calculate current streak
  if (hasCompletedToday) {
    // Start from yesterday (since today is already counted)
    let currentDate = yesterdayStr;
    let dayOffset = 1;

    // Count consecutive days
    while (dates.includes(currentDate)) {
      currentStreak++;
      dayOffset++;
      const prevDate = new Date(today);
      prevDate.setDate(prevDate.getDate() - dayOffset);
      currentDate = prevDate.toISOString().split('T')[0];
    }
  } else if (hasCompletedYesterday) {
    // Start from yesterday
    currentStreak = 1;
    let currentDate = yesterdayStr;
    let dayOffset = 2;

    // Count consecutive days
    while (true) {
      const prevDate = new Date(today);
      prevDate.setDate(prevDate.getDate() - dayOffset);
      currentDate = prevDate.toISOString().split('T')[0];

      if (dates.includes(currentDate)) {
        currentStreak++;
        dayOffset++;
      } else {
        break;
      }
    }
  }

  // Calculate longest streak
  let tempStreak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const currentDate = sortedDates[i] ? new Date(sortedDates[i]) : new Date();
    const prevDate = sortedDates[i - 1] ? new Date(sortedDates[i - 1]) : new Date();

    // Check if dates are consecutive
    const diffTime = Math.abs(prevDate.getTime() - currentDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      tempStreak++;
    } else {
      // Reset streak if days are not consecutive
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
      tempStreak = 1;
    }
  }

  // Check if the last streak is the longest
  if (tempStreak > longestStreak) {
    longestStreak = tempStreak;
  }

  // If current streak is longer than the calculated longest streak, update it
  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
  }

  return { currentStreak, longestStreak };
};
