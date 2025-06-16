import { Types } from 'mongoose';
import { TaskStatus, TaskPriority } from '../models/task.model';

export interface TaskCreateData {
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: Date;
  startDate?: Date;
  estimatedHours?: number;
  tags?: string[];
  project?: string | Types.ObjectId;
  assignedTo?: string | Types.ObjectId;
  parentTask?: string | Types.ObjectId;
  checklist?: Array<{
    text: string;
    completed?: boolean;
  }>;
}

export interface TaskUpdateData {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date;
  startDate?: Date;
  estimatedHours?: number;
  actualHours?: number;
  progress?: number;
  tags?: string[];
  project?: string | Types.ObjectId;
  assignedTo?: string | Types.ObjectId;
  parentTask?: string | Types.ObjectId;
  checklist?: Array<{
    _id?: Types.ObjectId;
    text: string;
    completed?: boolean;
    completedAt?: Date;
    completedBy?: Types.ObjectId;
  }>;
  isArchived?: boolean;
}

export interface TaskQueryParams {
  page?: number;
  limit?: number;
  project?: string | 'none';
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  assignedTo?: string | 'none' | 'me';
  parentTask?: string | 'none';
  tags?: string | string[];
  dueDateStart?: string;
  dueDateEnd?: string;
  isArchived?: boolean;
  search?: string;
  sort?: string;
  fields?: string;
}

export interface TaskStats {
  total: number;
  completed: number;
  overdue: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  byProject: Record<string, { count: number; name: string }>;
  completionRate: number;
  tasksDueToday: number;
  tasksDueThisWeek: number;
  tasksCreatedLast30Days: number;
  tasksCompletedLast30Days: number;
  averageCompletionTimeHours: number;
  onTimeCompletionRate: number;
}

export interface ProductivityMetrics {
  tasksCreatedLast30Days: number;
  tasksCompletedLast30Days: number;
  averageCompletionTimeHours: number;
  onTimeCompletionRate: number;
}

export interface BulkUpdateResult {
  updated: number;
  errors: string[];
}

export interface TaskListResponse {
  data: any[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  uncompletedCount?: number;
  overdueCount?: number;
}
