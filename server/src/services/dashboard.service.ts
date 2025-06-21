import Task from '../models/task.model';
import Project from '../models/project.model';
import User from '../models/user.model';
import Team from '../models/team.model';
import Workspace from '../models/workspace.model';
import Feedback from '../models/feedback.model';
import mongoose from 'mongoose';
import cache from '../utils/cache';
import logger from '../config/logger';

// Import all types from the new types file
import {
  type DailyDataPoint,
  SystemOverviewData,
  UserActivityData,
  TaskStatisticsData,
  ProjectStatisticsData,
  TeamWorkspaceStatisticsData,
  UserDashboardData,
  DashboardLayout,
  WidgetType,
  type MongoAggregationResult,
  type MongoStatusGroupResult,
  type UserWithDashboardLayout,
  type TaskOverviewData,
  type TasksByStatusData,
  type TasksByPriorityData,
  type ActivityData,
  type DeadlineData,
  type ProjectProgressData,
  type TeamWorkloadData,
  type ProductivityChartData,
  type CompletionRateData,
  type CustomWidgetData,
  type WidgetDataUnion,
  type ProjectProgressItem,
  type TeamWorkloadMember,
  type TaskAssigneeData,
  type ProjectTaskData,
  type TeamMemberData,
  type WorkspaceProjectData,
} from '../types/dashboard.types';

// Cache TTL for dashboard data (5 minutes)
const DASHBOARD_CACHE_TTL = 5 * 60;

// Re-export types for external use
export {
  WidgetType,
  DashboardLayout,
  SystemOverviewData,
  UserActivityData,
  TaskStatisticsData,
  ProjectStatisticsData,
  TeamWorkspaceStatisticsData,
  UserDashboardData,
};

/**
 * Format daily data for charts
 * @param data Aggregated data from MongoDB
 * @param days Number of days to format
 * @returns Formatted daily data
 */
const formatDailyData = (data: MongoAggregationResult[], days: number): DailyDataPoint[] => {
  const result: DailyDataPoint[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const dayData = data.find((item) => {
      const itemDate = new Date(item._id.year, item._id.month - 1, item._id.day);
      return itemDate.getTime() === date.getTime();
    });

    result.push({
      date: date.toISOString().split('T')[0],
      count: dayData ? dayData.count : 0,
    });
  }

  return result;
};

/**
 * Get system overview statistics
 * @returns System overview statistics
 */
export const getSystemOverview = async (): Promise<SystemOverviewData> => {
  // Try to get from cache
  const cacheKey = 'dashboard:system-overview';
  const cachedData = cache.get(cacheKey) as SystemOverviewData | null;
  if (cachedData) {
    return cachedData;
  }

  try {
    // Get counts
    const [userCount, taskCount, projectCount, teamCount, workspaceCount, feedbackCount] =
      await Promise.all([
        User.countDocuments(),
        Task.countDocuments(),
        Project.countDocuments(),
        Team.countDocuments(),
        Workspace.countDocuments(),
        Feedback.countDocuments(),
      ]);

    // Get active users (users who have logged in within the last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeUserCount = await User.countDocuments({
      lastLoginAt: { $gte: thirtyDaysAgo },
    });

    // Get tasks by status
    const tasksByStatus = await Task.aggregate<MongoStatusGroupResult>([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get tasks by priority
    const tasksByPriority = await Task.aggregate<MongoStatusGroupResult>([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 },
        },
      },
    ]);

    // Format data
    const result: SystemOverviewData = {
      counts: {
        users: userCount,
        activeUsers: activeUserCount,
        tasks: taskCount,
        projects: projectCount,
        teams: teamCount,
        workspaces: workspaceCount,
        feedback: feedbackCount,
      },
      tasksByStatus: tasksByStatus.reduce(
        (acc, item) => {
          acc[item._id] = item.count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      tasksByPriority: tasksByPriority.reduce(
        (acc, item) => {
          acc[item._id] = item.count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      lastUpdated: new Date(),
    };

    // Cache the result
    cache.set(cacheKey, result, DASHBOARD_CACHE_TTL);

    return result;
  } catch (error) {
    logger.error('Error getting system overview:', error);
    throw error;
  }
};

/**
 * Get user activity statistics
 * @param days Number of days to look back
 * @returns User activity statistics
 */
export const getUserActivity = async (days = 30): Promise<UserActivityData> => {
  // Try to get from cache
  const cacheKey = `dashboard:user-activity:${days}`;
  const cachedData = cache.get(cacheKey) as UserActivityData | null;
  if (cachedData) {
    return cachedData;
  }

  try {
    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get new user registrations by day
    const newUsersByDay = await User.aggregate<MongoAggregationResult>([
      {
        $match: {
          createdAt: { $gte: startDate },
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
        },
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
          '_id.day': 1,
        },
      },
    ]);

    // Get user logins by day
    const loginsByDay = await User.aggregate<MongoAggregationResult>([
      {
        $match: {
          lastLoginAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$lastLoginAt' },
            month: { $month: '$lastLoginAt' },
            day: { $dayOfMonth: '$lastLoginAt' },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
          '_id.day': 1,
        },
      },
    ]);

    // Format data
    const result: UserActivityData = {
      newUsers: formatDailyData(newUsersByDay, days),
      logins: formatDailyData(loginsByDay, days),
      lastUpdated: new Date(),
    };

    // Cache the result
    cache.set(cacheKey, result, DASHBOARD_CACHE_TTL);

    return result;
  } catch (error) {
    logger.error('Error getting user activity:', error);
    throw error;
  }
};

/**
 * Get task statistics
 * @param days Number of days to look back
 * @returns Task statistics
 */
export const getTaskStatistics = async (days = 30): Promise<TaskStatisticsData> => {
  // Try to get from cache
  const cacheKey = `dashboard:task-statistics:${days}`;
  const cachedData = cache.get(cacheKey) as TaskStatisticsData | null;
  if (cachedData) {
    return cachedData;
  }

  try {
    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get new tasks by day
    const newTasksByDay = await Task.aggregate<MongoAggregationResult>([
      {
        $match: {
          createdAt: { $gte: startDate },
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
        },
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
          '_id.day': 1,
        },
      },
    ]);

    // Get completed tasks by day
    const completedTasksByDay = await Task.aggregate<MongoAggregationResult>([
      {
        $match: {
          status: 'done',
          completedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$completedAt' },
            month: { $month: '$completedAt' },
            day: { $dayOfMonth: '$completedAt' },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
          '_id.day': 1,
        },
      },
    ]);

    // Get average task completion time
    const avgCompletionTime = await Task.aggregate<{ _id: null; avgTime: number }>([
      {
        $match: {
          status: 'done',
          completedAt: { $gte: startDate },
          createdAt: { $gte: startDate },
        },
      },
      {
        $project: {
          completionTime: {
            $subtract: ['$completedAt', '$createdAt'],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgTime: { $avg: '$completionTime' },
        },
      },
    ]);

    // Get tasks by assignee
    const tasksByAssignee = await Task.aggregate<TaskAssigneeData>([
      {
        $match: {
          assignedTo: { $exists: true, $ne: null },
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$assignedTo',
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          count: -1,
        },
      },
      {
        $limit: 10,
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
          count: 1,
          name: '$user.name',
          email: '$user.email',
        },
      },
    ]);

    // Format data
    const result: TaskStatisticsData = {
      newTasks: formatDailyData(newTasksByDay, days),
      completedTasks: formatDailyData(completedTasksByDay, days),
      avgCompletionTime:
        avgCompletionTime.length > 0 ? avgCompletionTime[0].avgTime / (1000 * 60 * 60) : 0, // Convert to hours
      tasksByAssignee: tasksByAssignee,
      lastUpdated: new Date(),
    };

    // Cache the result
    cache.set(cacheKey, result, DASHBOARD_CACHE_TTL);

    return result;
  } catch (error) {
    logger.error('Error getting task statistics:', error);
    throw error;
  }
};

/**
 * Get project statistics
 * @param days Number of days to look back
 * @returns Project statistics
 */
export const getProjectStatistics = async (days = 30): Promise<ProjectStatisticsData> => {
  // Try to get from cache
  const cacheKey = `dashboard:project-statistics:${days}`;
  const cachedData = cache.get(cacheKey) as ProjectStatisticsData | null;
  if (cachedData) {
    return cachedData;
  }

  try {
    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get new projects by day
    const newProjectsByDay = await Project.aggregate<MongoAggregationResult>([
      {
        $match: {
          createdAt: { $gte: startDate },
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
        },
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
          '_id.day': 1,
        },
      },
    ]);

    // Get projects by status
    const projectsByStatus = await Project.aggregate<MongoStatusGroupResult>([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get projects with most tasks
    const projectsWithMostTasks = await Task.aggregate<ProjectTaskData>([
      {
        $match: {
          project: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$project',
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          count: -1,
        },
      },
      {
        $limit: 10,
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
        $unwind: '$project',
      },
      {
        $project: {
          _id: 1,
          count: 1,
          name: '$project.name',
          status: '$project.status',
        },
      },
    ]);

    // Format data
    const result: ProjectStatisticsData = {
      newProjects: formatDailyData(newProjectsByDay, days),
      projectsByStatus: projectsByStatus.reduce(
        (acc, item) => {
          acc[item._id] = item.count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      projectsWithMostTasks,
      lastUpdated: new Date(),
    };

    // Cache the result
    cache.set(cacheKey, result, DASHBOARD_CACHE_TTL);

    return result;
  } catch (error) {
    logger.error('Error getting project statistics:', error);
    throw error;
  }
};

/**
 * Get team and workspace statistics
 * @returns Team and workspace statistics
 */
export const getTeamWorkspaceStatistics = async (): Promise<TeamWorkspaceStatisticsData> => {
  // Try to get from cache
  const cacheKey = 'dashboard:team-workspace-statistics';
  const cachedData = cache.get(cacheKey) as TeamWorkspaceStatisticsData | null;
  if (cachedData) {
    return cachedData;
  }

  try {
    // Get teams with most members
    const teamsWithMostMembers = await Team.aggregate<TeamMemberData>([
      {
        $project: {
          name: 1,
          memberCount: { $size: '$members' },
        },
      },
      {
        $sort: {
          memberCount: -1,
        },
      },
      {
        $limit: 10,
      },
    ]);

    // Get workspaces with most projects
    const workspacesWithMostProjects = await Project.aggregate<WorkspaceProjectData>([
      {
        $match: {
          workspace: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$workspace',
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          count: -1,
        },
      },
      {
        $limit: 10,
      },
      {
        $lookup: {
          from: 'workspaces',
          localField: '_id',
          foreignField: '_id',
          as: 'workspace',
        },
      },
      {
        $unwind: '$workspace',
      },
      {
        $project: {
          _id: 1,
          count: 1,
          name: '$workspace.name',
        },
      },
    ]);

    // Format data
    const result: TeamWorkspaceStatisticsData = {
      teamsWithMostMembers,
      workspacesWithMostProjects,
      lastUpdated: new Date(),
    };

    // Cache the result
    cache.set(cacheKey, result, DASHBOARD_CACHE_TTL);

    return result;
  } catch (error) {
    logger.error('Error getting team and workspace statistics:', error);
    throw error;
  }
};

/**
 * Get user dashboard data
 * @param userId User ID
 * @returns User dashboard data
 */
export const getUserDashboard = async (userId: string): Promise<UserDashboardData> => {
  // Try to get from cache
  const cacheKey = `dashboard:user:${userId}`;
  const cachedData = cache.get(cacheKey) as UserDashboardData | null;
  if (cachedData) {
    return cachedData;
  }

  try {
    // Get user's tasks
    const tasks = await Task.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
      .then((tasks) =>
        tasks.map((task) => ({
          _id: task._id.toString(),
          title: task.title,
          status: task.status,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        })),
      );

    // Get user's projects
    const projects = await Project.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
      .then((projects) =>
        projects.map((project) => ({
          _id: project._id.toString(),
          name: project.name,
          status: project.isArchived ? 'archived' : 'active', // Derive status from isArchived property
          createdAt: project.createdAt,
        })),
      );

    // Get user's tasks by status
    const tasksByStatus = await Task.aggregate<MongoStatusGroupResult>([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get user's tasks by priority
    const tasksByPriority = await Task.aggregate<MongoStatusGroupResult>([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get user's upcoming deadlines
    const now = new Date();
    const upcomingDeadlines = await Task.find({
      user: userId,
      dueDate: { $gte: now, $exists: true, $ne: null },
      status: { $ne: 'done' },
    })
      .sort({ dueDate: 1 })
      .limit(5)
      .lean()
      .then((tasks) =>
        tasks
          .filter((task) => task.dueDate) // Filter out tasks without dueDate
          .map((task) => ({
            _id: task._id.toString(),
            title: task.title,
            dueDate: task.dueDate!,
            priority: task.priority.toString(),
          })),
      );

    // Get user's overdue tasks
    const overdueTasks = await Task.find({
      user: userId,
      dueDate: { $lt: now, $exists: true, $ne: null },
      status: { $ne: 'done' },
    })
      .sort({ dueDate: 1 })
      .limit(5)
      .lean()
      .then((tasks) =>
        tasks
          .filter((task) => task.dueDate) // Filter out tasks without dueDate
          .map((task) => ({
            _id: task._id.toString(),
            title: task.title,
            dueDate: task.dueDate!,
            status: task.status.toString(),
          })),
      );

    // Format data
    const result: UserDashboardData = {
      recentTasks: tasks,
      projects,
      tasksByStatus: tasksByStatus.reduce(
        (acc, item) => {
          acc[item._id] = item.count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      tasksByPriority: tasksByPriority.reduce(
        (acc, item) => {
          acc[item._id] = item.count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      upcomingDeadlines,
      overdueTasks,
      lastUpdated: new Date(),
    };

    // Cache the result
    cache.set(cacheKey, result, DASHBOARD_CACHE_TTL);

    return result;
  } catch (error) {
    logger.error(`Error getting user dashboard for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Get user dashboard layout
 * @param userId User ID
 * @returns User dashboard layout
 */
export const getUserDashboardLayout = async (userId: string): Promise<DashboardLayout> => {
  // Try to get from cache
  const cacheKey = `dashboard:layout:${userId}`;
  const cachedLayout = cache.get(cacheKey) as DashboardLayout | null;
  if (cachedLayout) {
    return cachedLayout;
  }

  try {
    // Get user from database
    const user = (await User.findById(userId).lean()) as UserWithDashboardLayout | null;
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user has a dashboard layout
    if (user.dashboardLayout) {
      return user.dashboardLayout;
    }

    // Create default dashboard layout
    const defaultLayout: DashboardLayout = {
      columns: 3,
      widgets: [
        {
          id: 'tasks-overview',
          type: WidgetType.TASKS_OVERVIEW,
          title: 'Tasks Overview',
          size: 'medium',
          position: { x: 0, y: 0, width: 1, height: 1 },
        },
        {
          id: 'tasks-by-status',
          type: WidgetType.TASKS_BY_STATUS,
          title: 'Tasks by Status',
          size: 'medium',
          position: { x: 1, y: 0, width: 1, height: 1 },
        },
        {
          id: 'upcoming-deadlines',
          type: WidgetType.UPCOMING_DEADLINES,
          title: 'Upcoming Deadlines',
          size: 'medium',
          position: { x: 2, y: 0, width: 1, height: 1 },
        },
        {
          id: 'project-progress',
          type: WidgetType.PROJECT_PROGRESS,
          title: 'Project Progress',
          size: 'large',
          position: { x: 0, y: 1, width: 2, height: 1 },
        },
        {
          id: 'recent-activity',
          type: WidgetType.RECENT_ACTIVITY,
          title: 'Recent Activity',
          size: 'medium',
          position: { x: 2, y: 1, width: 1, height: 1 },
        },
      ],
    };

    // Save default layout to user
    await User.findByIdAndUpdate(userId, { dashboardLayout: defaultLayout });

    // Cache the layout
    cache.set(cacheKey, defaultLayout, DASHBOARD_CACHE_TTL);

    return defaultLayout;
  } catch (error) {
    logger.error(`Error getting dashboard layout for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Update user dashboard layout
 * @param userId User ID
 * @param layout Dashboard layout
 * @returns Updated dashboard layout
 */
export const updateUserDashboardLayout = async (
  userId: string,
  layout: DashboardLayout,
): Promise<DashboardLayout> => {
  try {
    // Update user's dashboard layout
    await User.findByIdAndUpdate(userId, { dashboardLayout: layout });

    // Update cache
    const cacheKey = `dashboard:layout:${userId}`;
    cache.set(cacheKey, layout, DASHBOARD_CACHE_TTL);

    return layout;
  } catch (error) {
    logger.error(`Error updating dashboard layout for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Get tasks overview data
 * @param userId User ID
 * @returns Tasks overview data
 */
const getTasksOverviewData = async (userId: string): Promise<TaskOverviewData> => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [totalTasks, completedTasks, overdueTasks, dueTodayTasks, dueThisWeekTasks] =
    await Promise.all([
      Task.countDocuments({ user: userId }),
      Task.countDocuments({ user: userId, status: 'done' }),
      Task.countDocuments({
        user: userId,
        dueDate: { $lt: now, $exists: true, $ne: null },
        status: { $ne: 'done' },
      }),
      Task.countDocuments({
        user: userId,
        dueDate: { $gte: today, $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) },
        status: { $ne: 'done' },
      }),
      Task.countDocuments({
        user: userId,
        dueDate: { $gte: now, $lte: weekFromNow },
        status: { $ne: 'done' },
      }),
    ]);

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    totalTasks,
    completedTasks,
    overdueTasks,
    dueTodayTasks,
    dueThisWeekTasks,
    completionRate,
  };
};

/**
 * Get tasks by status data
 * @param userId User ID
 * @returns Tasks by status data
 */
const getTasksByStatusData = async (userId: string): Promise<TasksByStatusData> => {
  const tasksByStatus = await Task.aggregate<MongoStatusGroupResult>([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    data: tasksByStatus.map((item) => ({
      status: item._id,
      count: item.count,
    })),
  };
};

/**
 * Get tasks by priority data
 * @param userId User ID
 * @returns Tasks by priority data
 */
const getTasksByPriorityData = async (userId: string): Promise<TasksByPriorityData> => {
  const tasksByPriority = await Task.aggregate<MongoStatusGroupResult>([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
      },
    },
    {
      $group: {
        _id: '$priority',
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    data: tasksByPriority.map((item) => ({
      priority: item._id,
      count: item.count,
    })),
  };
};

/**
 * Get recent activity data
 * @param userId User ID
 * @returns Recent activity data
 */
const getRecentActivityData = async (userId: string): Promise<ActivityData> => {
  const recentTasks = await Task.find({ user: userId }).sort({ updatedAt: -1 }).limit(10).lean();

  const activities = recentTasks.map((task) => ({
    type: 'task',
    title: task.title,
    status: task.status.toString(),
    timestamp: task.updatedAt,
  }));

  return { activities };
};

/**
 * Get upcoming deadlines data
 * @param userId User ID
 * @returns Upcoming deadlines data
 */
const getUpcomingDeadlinesData = async (userId: string): Promise<DeadlineData> => {
  const now = new Date();
  const upcomingTasks = await Task.find({
    user: userId,
    dueDate: { $gte: now, $exists: true, $ne: null },
    status: { $ne: 'done' },
  })
    .sort({ dueDate: 1 })
    .limit(10)
    .lean();

  const deadlines = upcomingTasks
    .filter((task) => task.dueDate)
    .map((task) => ({
      _id: task._id.toString(),
      title: task.title,
      dueDate: task.dueDate!,
      priority: task.priority.toString(),
    }));

  return { deadlines };
};

/**
 * Get project progress data
 * @param userId User ID
 * @returns Project progress data
 */
const getProjectProgressData = async (userId: string): Promise<ProjectProgressData> => {
  const userProjects = await Project.find({ user: userId }).lean();

  const projects: ProjectProgressItem[] = await Promise.all(
    userProjects.map(async (project) => {
      const totalTasks = await Task.countDocuments({ project: project._id });
      const completedTasks = await Task.countDocuments({
        project: project._id,
        status: 'done',
      });

      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      return {
        projectId: project._id.toString(),
        projectName: project.name,
        totalTasks,
        completedTasks,
        progress,
      };
    }),
  );

  return { projects };
};

/**
 * Get team workload data
 * @param userId User ID
 * @param teamId Team ID
 * @returns Team workload data
 */
const getTeamWorkloadData = async (userId: string, teamId?: string): Promise<TeamWorkloadData> => {
  if (!teamId) {
    return {
      teamId: '',
      teamName: 'No team specified',
      members: [],
    };
  }

  const team = await Team.findById(teamId).lean();
  if (!team) {
    return {
      teamId,
      teamName: 'Team not found',
      members: [],
    };
  }

  // Use a more specific type for the intermediate array that might contain nulls
  const membersWithNulls = await Promise.all(
    team.members.map(async (member) => {
      // Extract the user ID from the team member
      const userId = member.user instanceof mongoose.Types.ObjectId ? member.user : member.user._id;

      const user = await User.findById(userId).lean();
      if (!user) {
        return null;
      }

      const now = new Date();
      const [totalTasks, completedTasks, overdueTasks] = await Promise.all([
        Task.countDocuments({ user: userId }),
        Task.countDocuments({ user: userId, status: 'done' }),
        Task.countDocuments({
          user: userId,
          dueDate: { $lt: now, $exists: true, $ne: null },
          status: { $ne: 'done' },
        }),
      ]);

      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      return {
        userId: user._id.toString(),
        name: user.name,
        email: user.email,
        totalTasks,
        completedTasks,
        overdueTasks,
        completionRate,
      };
    }),
  );

  // Use type predicate to filter out nulls
  const members = membersWithNulls.filter(
    (member): member is TeamWorkloadMember => member !== null,
  );

  return {
    teamId,
    teamName: team.name,
    members,
  };
};

/**
 * Get productivity chart data
 * @param userId User ID
 * @param period Time period (week, month, year)
 * @returns Productivity chart data
 */
const getProductivityChartData = async (
  userId: string,
  period = 'month',
): Promise<ProductivityChartData> => {
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 365;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const productivityData = await Task.aggregate<MongoAggregationResult>([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        completedAt: { $gte: startDate },
        status: 'done',
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$completedAt' },
          month: { $month: '$completedAt' },
          day: { $dayOfMonth: '$completedAt' },
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: {
        '_id.year': 1,
        '_id.month': 1,
        '_id.day': 1,
      },
    },
  ]);

  return {
    data: formatDailyData(productivityData, days),
    period,
  };
};

/**
 * Get completion rate data
 * @param userId User ID
 * @param period Time period (week, month, year)
 * @returns Completion rate data
 */
const getCompletionRateData = async (
  userId: string,
  period = 'month',
): Promise<CompletionRateData> => {
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 365;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const [totalTasks, completedTasks] = await Promise.all([
    Task.countDocuments({
      user: userId,
      createdAt: { $gte: startDate },
    }),
    Task.countDocuments({
      user: userId,
      createdAt: { $gte: startDate },
      status: 'done',
    }),
  ]);

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    totalTasks,
    completedTasks,
    completionRate,
    period,
  };
};

/**
 * Get custom widget data
 * @param userId User ID
 * @param settings Widget settings
 * @returns Custom widget data
 */
const getCustomWidgetData = async (
  userId: string,
  settings?: Record<string, unknown>,
): Promise<CustomWidgetData> => {
  // This would be implemented based on specific custom widget requirements
  // For now, return a placeholder
  return {
    message: 'Custom widget data would be implemented based on specific requirements',
    settings,
    userId,
  };
};

/**
 * Get widget data
 * @param userId User ID
 * @param widgetType Widget type
 * @param settings Widget settings
 * @returns Widget data
 */
export const getWidgetData = async (
  userId: string,
  widgetType: WidgetType,
  settings?: Record<string, unknown>,
): Promise<WidgetDataUnion> => {
  // Try to get from cache
  const settingsHash = settings ? JSON.stringify(settings) : '';
  const cacheKey = `dashboard:widget:${userId}:${widgetType}:${settingsHash}`;
  const cachedData = cache.get(cacheKey) as WidgetDataUnion | null;
  if (cachedData) {
    return cachedData;
  }

  try {
    let data: WidgetDataUnion;

    switch (widgetType) {
      case WidgetType.TASKS_OVERVIEW:
        data = await getTasksOverviewData(userId);
        break;
      case WidgetType.TASKS_BY_STATUS:
        data = await getTasksByStatusData(userId);
        break;
      case WidgetType.TASKS_BY_PRIORITY:
        data = await getTasksByPriorityData(userId);
        break;
      case WidgetType.RECENT_ACTIVITY:
        data = await getRecentActivityData(userId);
        break;
      case WidgetType.UPCOMING_DEADLINES:
        data = await getUpcomingDeadlinesData(userId);
        break;
      case WidgetType.PROJECT_PROGRESS:
        data = await getProjectProgressData(userId);
        break;
      case WidgetType.TEAM_WORKLOAD:
        data = await getTeamWorkloadData(userId, settings?.teamId as string);
        break;
      case WidgetType.PRODUCTIVITY_CHART:
        data = await getProductivityChartData(userId, settings?.period as string);
        break;
      case WidgetType.COMPLETION_RATE:
        data = await getCompletionRateData(userId, settings?.period as string);
        break;
      case WidgetType.CUSTOM:
        data = await getCustomWidgetData(userId, settings);
        break;
      default:
        data = { error: 'Unknown widget type' };
    }

    // Cache the result
    cache.set(cacheKey, data, DASHBOARD_CACHE_TTL);

    return data;
  } catch (error) {
    logger.error(`Error getting widget data for user ${userId}, widget ${widgetType}:`, error);
    return { error: 'Failed to load widget data' };
  }
};

/**
 * Clear dashboard cache for a user
 * @param userId User ID
 */
export const clearUserDashboardCache = (userId: string): void => {
  const patterns = [
    `dashboard:user:${userId}`,
    `dashboard:layout:${userId}`,
    `dashboard:widget:${userId}:*`,
  ];

  patterns.forEach((pattern) => {
    if (pattern.includes('*')) {
      // For patterns with wildcards, we'd need to implement cache key scanning
      // This is a simplified version - in production, you might want to use Redis SCAN
      Object.values(WidgetType).forEach((widgetType) => {
        cache.del(`dashboard:widget:${userId}:${widgetType}:`);
      });
    } else {
      cache.del(pattern);
    }
  });
};

/**
 * Clear all dashboard cache
 */
export const clearAllDashboardCache = (): void => {
  const patterns = [
    'dashboard:system-overview',
    'dashboard:user-activity:*',
    'dashboard:task-statistics:*',
    'dashboard:project-statistics:*',
    'dashboard:team-workspace-statistics',
  ];

  patterns.forEach((pattern) => {
    if (pattern.includes('*')) {
      // This is a simplified version - in production, you'd implement proper cache scanning
      [7, 30, 365].forEach((days) => {
        cache.del(`dashboard:user-activity:${days}`);
        cache.del(`dashboard:task-statistics:${days}`);
        cache.del(`dashboard:project-statistics:${days}`);
      });
    } else {
      cache.del(pattern);
    }
  });
};
