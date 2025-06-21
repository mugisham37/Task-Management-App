import mongoose from 'mongoose';
import type {
  IChecklistItem,
  ITaskAttachment,
  TaskStatus,
  TaskPriority,
} from '../models/task.model';
import type { NotificationData, NotificationType } from '../models/notification.model';

/**
 * Task data sent over websocket (subset of ITask)
 */
export interface TaskUpdateData {
  id: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date;
  startDate?: Date;
  completedAt?: Date;
  estimatedHours?: number;
  actualHours?: number;
  progress?: number;
  tags?: string[];
  checklist?: IChecklistItem[];
  attachments?: ITaskAttachment[];
  project?: string;
  assignedTo?: string;
  updatedBy?: string;
  updatedAt?: Date;
}

/**
 * Project data sent over websocket (subset of IProject)
 */
export interface ProjectUpdateData {
  id: string;
  name?: string;
  description?: string;
  color?: string;
  isArchived?: boolean;
  updatedBy?: string;
  updatedAt?: Date;
}

/**
 * Workspace data sent over websocket (subset of IWorkspace)
 */
export interface WorkspaceUpdateData {
  id: string;
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  updatedBy?: string;
  updatedAt?: Date;
}

/**
 * Notification data sent over websocket
 */
export interface NotificationUpdateData {
  id?: string;
  type: NotificationType;
  title?: string;
  message: string;
  data?: NotificationData;
  isRead?: boolean;
  createdAt?: Date;
  feedbackId?: string | mongoose.Types.ObjectId;
  taskId?: string | mongoose.Types.ObjectId;
  projectId?: string | mongoose.Types.ObjectId;
}

/**
 * Generic message data for broadcast events
 */
export interface BroadcastData {
  type: string;
  message?: string;
  data?: unknown;
  timestamp: Date;
}
