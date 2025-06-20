import mongoose from 'mongoose';
import Task, { TaskStatus } from '../models/task.model';
import Project from '../models/project.model';
import Team from '../models/team.model';
import Activity from '../models/activity.model';
import { NotFoundError, ForbiddenError } from '../utils/app-error';

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
): Promise<any> => {
  // Set default date range if not provided
  if (!startDate || !endDate) {
    endDate = new Date();
    startDate = new Date();

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
): Promise<any[]> => {
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
  const result: any[] = [];
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
    return new Date(a.date).getTime() - new Date(b.date).getTime();
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

  let totalCompletionTime = 0;
  for (const task of completedTasks) {
    if (task.completedAt) {
      const completionTime = task.completedAt.getTime() - task.createdAt.getTime();
      totalCompletionTime += completionTime;
    }
  }

  // Convert to hours
  return totalCompletionTime / (1000 * 60 * 60) / completedTasks.length;
};

/**
 * Get project analytics
 * @param userId User ID
 * @param projectId Project ID (optional)
 * @param startDate Start date
 * @param endDate End date
 * @returns Project analytics
 */
export const getProjectAnalytics = async (
  userId: string,
  projectId?: string,
  startDate?: Date,
  endDate?: Date,
): Promise<any> => {
  // Set default date range if not provided
  if (!startDate || !endDate) {
    endDate = new Date();
    startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
  }

  // Build match criteria
  const matchCriteria: any = {
    user: new mongoose.Types.ObjectId(userId),
    createdAt: { $lte: endDate },
  };

  if (projectId) {
    matchCriteria.project = new mongoose.Types.ObjectId(projectId);
  }

  // Get tasks by project
  const tasksByProject = await Task.aggregate([
    {
      $match: matchCriteria,
    },
    {
      $group: {
        _id: '$project',
        totalTasks: { $sum: 1 },
        completedTasks: {
          $sum: {
            $cond: [{ $eq: ['$status', TaskStatus.DONE] }, 1, 0],
          },
        },
      },
    },
    {
      $lookup: {
        from: 'projects',
        localField: '_id',
        foreignField: '_id',
        as: 'project',
      },
    },
    {
      $unwind: {
        path: '$project',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 1,
        projectName: { $ifNull: ['$project.name', 'No Project'] },
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

  // If specific project is requested, get more detailed analytics
  if (projectId) {
    // Check if project exists and user has access to it
    const project = await Project.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    if (project.user && project.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to access this project');
    }

    // Get tasks by status
    const tasksByStatus = await Task.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
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
          user: new mongoose.Types.ObjectId(userId),
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

    // Get tasks created and completed over time
    const tasksOverTime = await Task.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          project: new mongoose.Types.ObjectId(projectId),
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          created: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $eq: ['$status', TaskStatus.DONE] }, 1, 0],
            },
          },
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
            $dateToString: { format: '%Y-%m-%d', date: '$date' },
          },
          created: 1,
          completed: 1,
        },
      },
    ]);

    return {
      project: {
        id: project._id,
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
  }

  return {
    tasksByProject,
  };
};

/**
 * Get team analytics
 * @param userId User ID
 * @param teamId Team ID
 * @param startDate Start date
 * @param endDate End date
 * @returns Team analytics
 */
export const getTeamAnalytics = async (
  userId: string,
  teamId: string,
  startDate?: Date,
  endDate?: Date,
): Promise<any> => {
  // Set default date range if not provided
  if (!startDate || !endDate) {
    endDate = new Date();
    startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
  }

  // Check if team exists and user is a member
  const team = await Team.findById(teamId);
  if (!team) {
    throw new NotFoundError('Team not found');
  }

  const isMember = team.members.some((member) => member.user && member.user.toString() === userId);
  if (!isMember) {
    throw new ForbiddenError('You do not have permission to access this team');
  }

  // Get team members
  const teamMembers = team.members.map((member) => member.user);

  // Get tasks by member
  const tasksByMember = await Task.aggregate([
    {
      $match: {
        user: { $in: teamMembers },
        createdAt: { $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$user',
        totalTasks: { $sum: 1 },
        completedTasks: {
          $sum: {
            $cond: [{ $eq: ['$status', TaskStatus.DONE] }, 1, 0],
          },
        },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    {
      $unwind: '$user',
    },
    {
      $project: {
        _id: 1,
        userName: '$user.name',
        userEmail: '$user.email',
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
        user: { $in: teamMembers },
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
        user: { $in: teamMembers },
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

  // Get tasks created and completed over time
  const tasksOverTime = await Task.aggregate([
    {
      $match: {
        user: { $in: teamMembers },
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
        },
        created: { $sum: 1 },
        completed: {
          $sum: {
            $cond: [{ $eq: ['$status', TaskStatus.DONE] }, 1, 0],
          },
        },
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
          $dateToString: { format: '%Y-%m-%d', date: '$date' },
        },
        created: 1,
        completed: 1,
      },
    },
  ]);

  // Get team activity
  const teamActivity = await Activity.aggregate([
    {
      $match: {
        user: { $in: teamMembers },
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
          user: '$user',
        },
        count: { $sum: 1 },
        date: { $first: '$createdAt' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id.user',
        foreignField: '_id',
        as: 'user',
      },
    },
    {
      $unwind: '$user',
    },
    {
      $project: {
        _id: 0,
        date: {
          $dateToString: { format: '%Y-%m-%d', date: '$date' },
        },
        userId: '$_id.user',
        userName: '$user.name',
        count: 1,
      },
    },
    {
      $sort: { date: 1 },
    },
  ]);

  return {
    team: {
      id: team._id,
      name: team.name,
      description: team.description,
      memberCount: team.members.length,
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
 * @param startDate Start date
 * @param endDate End date
 * @returns User productivity analytics
 */
export const getUserProductivityAnalytics = async (
  userId: string,
  startDate?: Date,
  endDate?: Date,
): Promise<any> => {
  // Set default date range if not provided
  if (!startDate || !endDate) {
    endDate = new Date();
    startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
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
      $sort: { _id: 1 },
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
      $sort: { _id: 1 },
    },
    {
      $project: {
        _id: 0,
        hour: '$_id',
        count: 1,
      },
    },
  ]);

  // Get task completion streaks
  const taskCompletionDates = await Task.find(
    {
      user: userId,
      status: TaskStatus.DONE,
      completedAt: { $gte: startDate, $lte: endDate },
    },
    { completedAt: 1 },
  ).sort({ completedAt: 1 });

  const streaks = calculateStreaks(taskCompletionDates.map((task) => task.completedAt!));

  return {
    tasksCreated,
    tasksCompleted,
    completionRate: tasksCreated > 0 ? (tasksCompleted / tasksCreated) * 100 : 0,
    averageCompletionTime,
    productivityByDayOfWeek,
    productivityByHourOfDay,
    currentStreak: streaks.currentStreak,
    longestStreak: streaks.longestStreak,
  };
};

/**
 * Calculate streaks from completion dates
 * @param dates Array of completion dates
 * @returns Current and longest streaks
 */
const calculateStreaks = (dates: Date[]): { currentStreak: number; longestStreak: number } => {
  if (dates.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  // Convert dates to day strings (YYYY-MM-DD)
  const dayStrings = dates.map((date) => date.toISOString().split('T')[0]);

  // Remove duplicates (multiple completions on the same day)
  const uniqueDays = [...new Set(dayStrings)].sort();

  let currentStreak = 1;
  let longestStreak = 1;

  for (let i = 1; i < uniqueDays.length; i++) {
    const currentDay = new Date(uniqueDays[i]);
    const previousDay = new Date(uniqueDays[i - 1]);

    // Check if days are consecutive
    previousDay.setDate(previousDay.getDate() + 1);
    if (
      previousDay.getFullYear() === currentDay.getFullYear() &&
      previousDay.getMonth() === currentDay.getMonth() &&
      previousDay.getDate() === currentDay.getDate()
    ) {
      currentStreak++;
    } else {
      // Streak broken, check if it was the longest
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }
      currentStreak = 1;
    }
  }

  // Check if the final streak is the longest
  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
  }

  // Check if the current streak is still active
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastStreakDay = new Date(uniqueDays[uniqueDays.length - 1]);
  lastStreakDay.setHours(0, 0, 0, 0);

  // If the last day in the streak is before yesterday, the streak is broken
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  if (lastStreakDay < yesterday) {
    currentStreak = 0;
  }

  return { currentStreak, longestStreak };
};

/**
 * Get recurring task analytics
 * @param userId User ID
 * @param startDate Start date
 * @param endDate End date
 * @returns Recurring task analytics
 */
export const getRecurringTaskAnalytics = async (
  userId: string,
  startDate?: Date,
  endDate?: Date,
): Promise<any> => {
  // Set default date range if not provided
  if (!startDate || !endDate) {
    endDate = new Date();
    startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
  }

  // Get recurring tasks
  const recurringTasks = await mongoose.model('RecurringTask').find({
    user: userId,
    createdAt: { $lte: endDate },
  });

  // Get tasks created from recurring tasks
  const recurringTaskIds = recurringTasks.map((task) => task._id);
  const tasksFromRecurring = await Task.find({
    user: userId,
    recurringTaskId: { $in: recurringTaskIds },
    createdAt: { $gte: startDate, $lte: endDate },
  });

  // Get completion rate for recurring tasks
  const completedTasksFromRecurring = tasksFromRecurring.filter(
    (task) => task.status === TaskStatus.DONE,
  );
  const completionRate =
    tasksFromRecurring.length > 0
      ? (completedTasksFromRecurring.length / tasksFromRecurring.length) * 100
      : 0;

  // Get recurring tasks by frequency
  const recurringTasksByFrequency = recurringTasks.reduce((acc: Record<string, number>, task) => {
    const frequency = task.frequency;
    acc[frequency] = (acc[frequency] || 0) + 1;
    return acc;
  }, {});

  // Get recurring tasks by status (active/inactive)
  const activeRecurringTasks = recurringTasks.filter((task) => task.active).length;
  const inactiveRecurringTasks = recurringTasks.filter((task) => !task.active).length;

  // Get tasks created from recurring tasks over time
  const tasksCreatedOverTime = await Task.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        recurringTaskId: { $in: recurringTaskIds },
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
        },
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
          $dateToString: { format: '%Y-%m-%d', date: '$date' },
        },
        count: 1,
      },
    },
  ]);

  return {
    totalRecurringTasks: recurringTasks.length,
    activeRecurringTasks,
    inactiveRecurringTasks,
    tasksCreatedFromRecurring: tasksFromRecurring.length,
    tasksCompletedFromRecurring: completedTasksFromRecurring.length,
    completionRate,
    recurringTasksByFrequency,
    tasksCreatedOverTime,
  };
};
