import mongoose from 'mongoose';
import { TaskStatus } from '../models/task.model';

/**
 * Task completion analytics interfaces
 */
export interface TaskCompletionAnalytics {
  tasksCreated: number;
  tasksCompleted: number;
  completionRate: number;
  tasksByStatus: Record<TaskStatus, number>;
  tasksByPriority: Record<string, number>;
  completionRateOverTime: CompletionRateDataPoint[];
  averageCompletionTime: number;
}

export interface CompletionRateDataPoint {
  date: string;
  created: number;
  completed: number;
  rate: number;
}

/**
 * Project analytics interfaces
 */
export interface ProjectAnalytics {
  tasksByProject?: ProjectTaskSummary[];
  project?: ProjectDetails;
  tasksByStatus?: Record<TaskStatus, number>;
  tasksByPriority?: Record<string, number>;
  tasksOverTime?: TasksOverTimeDataPoint[];
}

export interface ProjectTaskSummary {
  _id: string;
  projectName: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
}

export interface ProjectDetails {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
}

export interface TasksOverTimeDataPoint {
  date: string;
  created: number;
  completed: number;
}

/**
 * Team analytics interfaces
 */
export interface TeamAnalytics {
  team: TeamDetails;
  tasksByMember: TeamMemberTaskSummary[];
  tasksByStatus: Record<TaskStatus, number>;
  tasksByPriority: Record<string, number>;
  tasksOverTime: TasksOverTimeDataPoint[];
  teamActivity: TeamActivityDataPoint[];
}

export interface TeamDetails {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
}

export interface TeamMemberTaskSummary {
  _id: string;
  userName: string;
  userEmail: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
}

export interface TeamActivityDataPoint {
  date: string;
  userId: string;
  userName: string;
  count: number;
}

/**
 * User productivity analytics interfaces
 */
export interface UserProductivityAnalytics {
  tasksCreated: number;
  tasksCompleted: number;
  completionRate: number;
  averageCompletionTime: number;
  productivityByDayOfWeek: DayOfWeekProductivity[];
  productivityByHourOfDay: HourOfDayProductivity[];
  currentStreak: number;
  longestStreak: number;
}

export interface DayOfWeekProductivity {
  dayOfWeek: string;
  count: number;
}

export interface HourOfDayProductivity {
  hour: number;
  count: number;
}

/**
 * Recurring task analytics interfaces
 */
export interface RecurringTaskAnalytics {
  totalRecurringTasks: number;
  activeRecurringTasks: number;
  inactiveRecurringTasks: number;
  tasksCreatedFromRecurring: number;
  tasksCompletedFromRecurring: number;
  completionRate: number;
  recurringTasksByFrequency: Record<string, number>;
  tasksCreatedOverTime: TasksCreatedOverTimeDataPoint[];
}

export interface TasksCreatedOverTimeDataPoint {
  date: string;
  count: number;
}

/**
 * MongoDB query criteria interface
 */
export interface MongoQueryCriteria {
  [key: string]:
    | mongoose.Types.ObjectId
    | string
    | number
    | boolean
    | Date
    | RegExp
    | Record<string, unknown>
    | Array<unknown>
    | undefined
    | null;
}

/**
 * MongoDB aggregation result interfaces
 */
export interface TeamActivityItem {
  date: string;
  userId: string;
  userName: string;
  count: number;
}

export interface RecurringTaskItem {
  _id: {
    frequency: string;
    active: boolean;
  };
  count: number;
}

/**
 * Streak calculation result interface
 */
export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
}
