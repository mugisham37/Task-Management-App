import Task from "../models/task.model";
import Project from "../models/project.model";
import User from "../models/user.model";
import Team from "../models/team.model";
import Workspace from "../models/workspace.model";
import Feedback from "../models/feedback.model";
import { cache } from "../utils/cache";
import logger from "../config/logger";

// Cache TTL for dashboard data (5 minutes)
const DASHBOARD_CACHE_TTL = 5 * 60;

/**
 * Dashboard widget type enum
 */
export enum WidgetType {
  TASKS_OVERVIEW = 'tasks_overview',
  TASKS_BY_STATUS = 'tasks_by_status',
  TASKS_BY_PRIORITY = 'tasks_by_priority',
  RECENT_ACTIVITY = 'recent_activity',
  UPCOMING_DEADLINES = 'upcoming_deadlines',
  PROJECT_PROGRESS = 'project_progress',
  TEAM_WORKLOAD = 'team_workload',
  PRODUCTIVITY_CHART = 'productivity_chart',
  COMPLETION_RATE = 'completion_rate',
  CUSTOM = 'custom',
}

/**
 * Dashboard layout interface
 */
export interface DashboardLayout {
  columns: number;
  widgets: {
    id: string;
    type: WidgetType;
    title: string;
    size: 'small' | 'medium' | 'large';
    position: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    settings?: Record<string, any>;
  }[];
}

/**
 * Get system overview statistics
 * @returns System overview statistics
 */
export const getSystemOverview = async (): Promise<any> => {
  // Try to get from cache
  const cacheKey = "dashboard:system-overview";
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  try {
    // Get counts
    const [userCount, taskCount, projectCount, teamCount, workspaceCount, feedbackCount] = await Promise.all([
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
    const tasksByStatus = await Task.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get tasks by priority
    const tasksByPriority = await Task.aggregate([
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ]);

    // Format data
    const result = {
      counts: {
        users: userCount,
        activeUsers: activeUserCount,
        tasks: taskCount,
        projects: projectCount,
        teams: teamCount,
        workspaces: workspaceCount,
        feedback: feedbackCount,
      },
      tasksByStatus: tasksByStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      tasksByPriority: tasksByPriority.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      lastUpdated: new Date(),
    };

    // Cache the result
    cache.set(cacheKey, result, DASHBOARD_CACHE_TTL);

    return result;
  } catch (error) {
    logger.error("Error getting system overview:", error);
    throw error;
  }
};

/**
 * Get user activity statistics
 * @param days Number of days to look back
 * @returns User activity statistics
 */
export const getUserActivity = async (days = 30): Promise<any> => {
  // Try to get from cache
  const cacheKey = `dashboard:user-activity:${days}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  try {
    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get new user registrations by day
    const newUsersByDay = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
          "_id.day": 1,
        },
      },
    ]);

    // Get user logins by day
    const loginsByDay = await User.aggregate([
      {
        $match: {
          lastLoginAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$lastLoginAt" },
            month: { $month: "$lastLoginAt" },
            day: { $dayOfMonth: "$lastLoginAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
          "_id.day": 1,
        },
      },
    ]);

    // Format data
    const result = {
      newUsers: formatDailyData(newUsersByDay, days),
      logins: formatDailyData(loginsByDay, days),
      lastUpdated: new Date(),
    };

    // Cache the result
    cache.set(cacheKey, result, DASHBOARD_CACHE_TTL);

    return result;
  } catch (error) {
    logger.error("Error getting user activity:", error);
    throw error;
  }
};

/**
 * Get task statistics
 * @param days Number of days to look back
 * @returns Task statistics
 */
export const getTaskStatistics = async (days = 30): Promise<any> => {
  // Try to get from cache
  const cacheKey = `dashboard:task-statistics:${days}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  try {
    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get new tasks by day
    const newTasksByDay = await Task.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
          "_id.day": 1,
        },
      },
    ]);

    // Get completed tasks by day
    const completedTasksByDay = await Task.aggregate([
      {
        $match: {
          status: "done",
          completedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$completedAt" },
            month: { $month: "$completedAt" },
            day: { $dayOfMonth: "$completedAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
          "_id.day": 1,
        },
      },
    ]);

    // Get average task completion time
    const avgCompletionTime = await Task.aggregate([
      {
        $match: {
          status: "done",
          completedAt: { $gte: startDate },
          createdAt: { $gte: startDate },
        },
      },
      {
        $project: {
          completionTime: {
            $subtract: ["$completedAt", "$createdAt"],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgTime: { $avg: "$completionTime" },
        },
      },
    ]);

    // Get tasks by assignee
    const tasksByAssignee = await Task.aggregate([
      {
        $match: {
          assignedTo: { $exists: true, $ne: null },
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$assignedTo",
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
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      {
        $project: {
          _id: 1,
          count: 1,
          name: "$user.name",
          email: "$user.email",
        },
      },
    ]);

    // Format data
    const result = {
      newTasks: formatDailyData(newTasksByDay, days),
      completedTasks: formatDailyData(completedTasksByDay, days),
      avgCompletionTime: avgCompletionTime.length > 0 ? avgCompletionTime[0].avgTime / (1000 * 60 * 60) : 0, // Convert to hours
      tasksByAssignee: tasksByAssignee,
      lastUpdated: new Date(),
    };

    // Cache the result
    cache.set(cacheKey, result, DASHBOARD_CACHE_TTL);

    return result;
  } catch (error) {
    logger.error("Error getting task statistics:", error);
    throw error;
  }
};

/**
 * Get project statistics
 * @param days Number of days to look back
 * @returns Project statistics
 */
export const getProjectStatistics = async (days = 30): Promise<any> => {
  // Try to get from cache
  const cacheKey = `dashboard:project-statistics:${days}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  try {
    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get new projects by day
    const newProjectsByDay = await Project.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
          "_id.day": 1,
        },
      },
    ]);

    // Get projects by status
    const projectsByStatus = await Project.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get projects with most tasks
    const projectsWithMostTasks = await Task.aggregate([
      {
        $match: {
          project: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$project",
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
          from: "projects",
          localField: "_id",
          foreignField: "_id",
          as: "project",
        },
      },
      {
        $unwind: "$project",
      },
      {
        $project: {
          _id: 1,
          count: 1,
          name: "$project.name",
          status: "$project.status",
        },
      },
    ]);

    // Format data
    const result = {
      newProjects: formatDailyData(newProjectsByDay, days),
      projectsByStatus: projectsByStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      projectsWithMostTasks,
      lastUpdated: new Date(),
    };

    // Cache the result
    cache.set(cacheKey, result, DASHBOARD_CACHE_TTL);

    return result;
  } catch (error) {
    logger.error("Error getting project statistics:", error);
    throw error;
  }
};

/**
 * Get team and workspace statistics
 * @returns Team and workspace statistics
 */
export const getTeamWorkspaceStatistics = async (): Promise<any> => {
  // Try to get from cache
  const cacheKey = "dashboard:team-workspace-statistics";
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  try {
    // Get teams with most members
    const teamsWithMostMembers = await Team.aggregate([
      {
        $project: {
          name: 1,
          memberCount: { $size: "$members" },
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
    const workspacesWithMostProjects = await Project.aggregate([
      {
        $match: {
          workspace: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$workspace",
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
          from: "workspaces",
          localField: "_id",
          foreignField: "_id",
          as: "workspace",
        },
      },
      {
        $unwind: "$workspace",
      },
      {
        $project: {
          _id: 1,
          count: 1,
          name: "$workspace.name",
        },
      },
    ]);

    // Format data
    const result = {
      teamsWithMostMembers,
      workspacesWithMostProjects,
      lastUpdated: new Date(),
    };

    // Cache the result
    cache.set(cacheKey, result, DASHBOARD_CACHE_TTL);

    return result;
  } catch (error) {
    logger.error("Error getting team and workspace statistics:", error);
    throw error;
  }
};

/**
 * Get user dashboard data
 * @param userId User ID
 * @returns User dashboard data
 */
export const getUserDashboard = async (userId: string): Promise<any> => {
  // Try to get from cache
  const cacheKey = `dashboard:user:${userId}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  try {
    // Get user's tasks
    const tasks = await Task.find({ user: userId }).sort({ createdAt: -1 }).limit(10);

    // Get user's projects
    const projects = await Project.find({ user: userId }).sort({ createdAt: -1 }).limit(5);

    // Get user's tasks by status
    const tasksByStatus = await Task.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get user's tasks by priority
    const tasksByPriority = await Task.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get user's upcoming deadlines
    const now = new Date();
    const upcomingDeadlines = await Task.find({
      user: userId,
      dueDate: { $gte: now },
      status: { $ne: "done" },
    })
      .sort({ dueDate: 1 })
      .limit(5);

    // Get user's overdue tasks
    const overdueTasks = await Task.find({
      user: userId,
      dueDate: { $lt: now },
      status: { $ne: "done" },
    })
      .sort({ dueDate: 1 })
      .limit(5);

    // Format data
    const result = {
      recentTasks: tasks,
      projects,
      tasksByStatus: tasksByStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      tasksByPriority: tasksByPriority.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
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
  const cachedLayout = cache.get(cacheKey);
  if (cachedLayout) {
    return cachedLayout as DashboardLayout;
  }

  try {
    // Get user from database
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if user has a dashboard layout
    if (user.dashboardLayout) {
      return user.dashboardLayout as unknown as DashboardLayout;
    }

    // Create default dashboard layout
    const defaultLayout: DashboardLayout = {
      columns: 3,
      widgets: [
        {
          id: "tasks-overview",
          type: WidgetType.TASKS_OVERVIEW,
          title: "Tasks Overview",
          size: "medium",
          position: { x: 0, y: 0, width: 1, height: 1 },
        },
        {
          id: "tasks-by-status",
          type: WidgetType.TASKS_BY_STATUS,
          title: "Tasks by Status",
          size: "medium",
          position: { x: 1, y: 0, width: 1, height: 1 },
        },
        {
          id: "upcoming-deadlines",
          type: WidgetType.UPCOMING_DEADLINES,
          title: "Upcoming Deadlines",
          size: "medium",
          position: { x: 2, y: 0, width: 1, height: 1 },
        },
        {
          id: "project-progress",
          type: WidgetType.PROJECT_PROGRESS,
          title: "Project Progress",
          size: "large",
          position: { x: 0, y: 1, width: 2, height: 1 },
        },
        {
          id: "recent-activity",
          type: WidgetType.RECENT_ACTIVITY,
          title: "Recent Activity",
          size: "medium",
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
 * Get widget data
 * @param userId User ID
 * @param widgetType Widget type
 * @param settings Widget settings
 * @returns Widget data
 */
export const getWidgetData = async (
  userId: string,
  widgetType: WidgetType,
  settings?: Record<string, any>,
): Promise<any> => {
  // Try to get from cache
  const settingsHash = settings ? JSON.stringify(settings) : "";
  const cacheKey = `dashboard:widget:${userId}:${widgetType}:${settingsHash}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  try {
    let data;

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
        data = await getTeamWorkloadData(userId, settings?.teamId);
        break;
      case WidgetType.PRODUCTIVITY_CHART:
        data = await getProductivityChartData(userId, settings?.period || "month");
        break;
      case WidgetType.COMPLETION_RATE:
        data = await getCompletionRateData(userId, settings?.period || "month");
        break;
      case WidgetType.CUSTOM:
        data = await getCustomWidgetData(userId, settings);
        break;
      default:
        data = { error: "Unknown widget type" };
    }

    // Cache the data
    cache.set(cacheKey, data, DASHBOARD_CACHE_TTL);

    return data;
  } catch (error) {
    logger.error(`Error getting widget data for user ${userId}, widget ${widgetType}:`, error);
    throw error;
  }
};

/**
 * Get tasks overview data
 * @param userId User ID
 * @returns Tasks overview data
 */
const getTasksOverviewData = async (userId: string): Promise<any> => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const [totalTasks, completedTasks, overdueTasks, dueTodayTasks, dueThisWeekTasks] = await Promise.all([
    Task.countDocuments({ user: userId }),
    Task.countDocuments({ user: userId, status: "done" }),
    Task.countDocuments({
      user: userId,
      dueDate: { $lt: today },
      status: { $ne: "done" },
    }),
    Task.countDocuments({
      user: userId,
      dueDate: { $gte: today, $lt: tomorrow },
      status: { $ne: "done" },
    }),
    Task.countDocuments({
      user: userId,
      dueDate: { $gte: today, $lt: nextWeek },
      status: { $ne: "done" },
    }),
  ]);

  return {
    totalTasks,
    completedTasks,
    overdueTasks,
    dueTodayTasks,
    dueThisWeekTasks,
    completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
  };
};

/**
 * Get tasks by status data
 * @param userId User ID
 * @returns Tasks by status data
 */
const getTasksByStatusData = async (userId: string): Promise<any> => {
  const tasksByStatus = await Task.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
      },
    },
    {
      $group: {
        _id: "$status",
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
const getTasksByPriorityData = async (userId: string): Promise<any> => {
  const tasksByPriority = await Task.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
      },
    },
    {
      $group: {
        _id: "$priority",
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
const getRecentActivityData = async (userId: string): Promise<any> => {
  // This would typically come from an activity service
  // For now, we'll simulate it with recent tasks
  const recentTasks = await Task.find({ user: userId })
    .sort({ updatedAt: -1 })
    .limit(10)
    .select("title status updatedAt");

  return {
    activities: recentTasks.map((task) => ({
      type: "task_updated",
      title: task.title,
      status: task.status,
      timestamp: task.updatedAt,
    })),
  };
};

/**
 * Get upcoming deadlines data
 * @param userId User ID
 * @returns Upcoming deadlines data
 */
const getUpcomingDeadlinesData = async (userId: string): Promise<any> => {
  const now = new Date();
  const upcomingDeadlines = await Task.find({
    user: userId,
    dueDate: { $gte: now },
    status: { $ne: "done" },
  })
    .sort({ dueDate: 1 })
    .limit(5)
    .select("title dueDate priority");

  return {
    deadlines: upcomingDeadlines,
  };
};

/**
 * Get project progress data
 * @param userId User ID
 * @returns Project progress data
 */
const getProjectProgressData = async (userId: string): Promise<any> => {
  // Get user's projects
  const projects = await Project.find({ user: userId }).select("_id name");

  // Get task counts for each project
  const projectProgress = await Promise.all(
    projects.map(async (project) => {
      const [totalTasks, completedTasks] = await Promise.all([
        Task.countDocuments({ user: userId, project: project._id }),
        Task.countDocuments({ user: userId, project: project._id, status: "done" }),
      ]);

      return {
        projectId: project._id,
        projectName: project.name,
        totalTasks,
        completedTasks,
        progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      };
    }),
  );

  return {
    projects: projectProgress,
  };
};

/**
 * Get team workload data
 * @param userId User ID
 * @param teamId Team ID
 * @returns Team workload data
 */
const getTeamWorkloadData = async (userId: string, teamId?: string): Promise<any> => {
  if (!teamId) {
    // Get user's teams
    const teams = await Team.find({ "members.user": userId }).select("_id");
    if (teams.length === 0) {
      return { error: "No teams found" };
    }
    teamId = teams[0]._id.toString();
  }

  // Get team members
  const team = await Team.findById(teamId).populate("members.user", "name email");
