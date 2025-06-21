// We'll use these types in our interfaces
// import mongoose from 'mongoose';
// import { TaskStatus } from '../models/task.model';

/**
 * Daily data point interface for chart data
 */
export interface DailyDataPoint {
  date: string;
  count: number;
}

/**
 * System overview data interface
 */
export interface SystemOverviewData {
  counts: {
    users: number;
    activeUsers: number;
    tasks: number;
    projects: number;
    teams: number;
    workspaces: number;
    feedback: number;
  };
  tasksByStatus: Record<string, number>;
  tasksByPriority: Record<string, number>;
  lastUpdated: Date;
}

/**
 * User activity data interface
 */
export interface UserActivityData {
  newUsers: DailyDataPoint[];
  logins: DailyDataPoint[];
  lastUpdated: Date;
}

/**
 * Task assignee data interface
 */
export interface TaskAssigneeData {
  _id: string;
  count: number;
  name: string;
  email: string;
}

/**
 * Task statistics data interface
 */
export interface TaskStatisticsData {
  newTasks: DailyDataPoint[];
  completedTasks: DailyDataPoint[];
  avgCompletionTime: number;
  tasksByAssignee: TaskAssigneeData[];
  lastUpdated: Date;
}

/**
 * Project task data interface
 */
export interface ProjectTaskData {
  _id: string;
  count: number;
  name: string;
  status: string;
}

/**
 * Project statistics data interface
 */
export interface ProjectStatisticsData {
  newProjects: DailyDataPoint[];
  projectsByStatus: Record<string, number>;
  projectsWithMostTasks: ProjectTaskData[];
  lastUpdated: Date;
}

/**
 * Team member data interface
 */
export interface TeamMemberData {
  name: string;
  memberCount: number;
}

/**
 * Workspace project data interface
 */
export interface WorkspaceProjectData {
  _id: string;
  count: number;
  name: string;
}

/**
 * Team and workspace statistics data interface
 */
export interface TeamWorkspaceStatisticsData {
  teamsWithMostMembers: TeamMemberData[];
  workspacesWithMostProjects: WorkspaceProjectData[];
  lastUpdated: Date;
}

/**
 * Task overview data interface
 */
export interface TaskOverviewData {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  dueTodayTasks: number;
  dueThisWeekTasks: number;
  completionRate: number;
}

/**
 * Tasks by status data interface
 */
export interface TasksByStatusData {
  data: Array<{
    status: string;
    count: number;
  }>;
}

/**
 * Tasks by priority data interface
 */
export interface TasksByPriorityData {
  data: Array<{
    priority: string;
    count: number;
  }>;
}

/**
 * Activity data interface
 */
export interface ActivityData {
  activities: Array<{
    type: string;
    title: string;
    status: string;
    timestamp: Date;
  }>;
}

/**
 * Deadline data interface
 */
export interface DeadlineData {
  deadlines: Array<{
    _id: string;
    title: string;
    dueDate: Date;
    priority: string;
  }>;
}

/**
 * Project progress item interface
 */
export interface ProjectProgressItem {
  projectId: string;
  projectName: string;
  totalTasks: number;
  completedTasks: number;
  progress: number;
}

/**
 * Project progress data interface
 */
export interface ProjectProgressData {
  projects: ProjectProgressItem[];
}

/**
 * Team workload member interface
 */
export interface TeamWorkloadMember {
  userId: string;
  name: string;
  email: string;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  completionRate: number;
}

/**
 * Team workload data interface
 */
export interface TeamWorkloadData {
  teamId: string;
  teamName: string;
  members: TeamWorkloadMember[];
}

/**
 * Productivity chart data interface
 */
export interface ProductivityChartData {
  data: DailyDataPoint[];
  period: string;
}

/**
 * Completion rate data interface
 */
export interface CompletionRateData {
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  period: string;
}

/**
 * Custom widget data interface
 */
export interface CustomWidgetData {
  message: string;
  settings?: Record<string, unknown>;
  userId: string;
}

/**
 * User dashboard data interface
 */
export interface UserDashboardData {
  recentTasks: Array<{
    _id: string;
    title: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  projects: Array<{
    _id: string;
    name: string;
    status: string;
    createdAt: Date;
  }>;
  tasksByStatus: Record<string, number>;
  tasksByPriority: Record<string, number>;
  upcomingDeadlines: Array<{
    _id: string;
    title: string;
    dueDate: Date;
    priority: string;
  }>;
  overdueTasks: Array<{
    _id: string;
    title: string;
    dueDate: Date;
    status: string;
  }>;
  lastUpdated: Date;
}

/**
 * MongoDB aggregation result interfaces
 */
export interface MongoAggregationResult {
  _id: {
    year: number;
    month: number;
    day: number;
  };
  count: number;
}

export interface MongoStatusGroupResult {
  _id: string;
  count: number;
}

/**
 * User with dashboard layout interface
 */
export interface UserWithDashboardLayout {
  _id: string;
  name: string;
  email: string;
  dashboardLayout?: DashboardLayout;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Widget data union type
 */
export type WidgetDataUnion =
  | TaskOverviewData
  | TasksByStatusData
  | TasksByPriorityData
  | ActivityData
  | DeadlineData
  | ProjectProgressData
  | TeamWorkloadData
  | ProductivityChartData
  | CompletionRateData
  | CustomWidgetData
  | { error: string };

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
    settings?: Record<string, unknown>;
  }[];
}
