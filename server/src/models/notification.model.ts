import mongoose, { type Document, Schema } from 'mongoose';
import type { IUser } from './user.model';

// Notification type enum
export enum NotificationType {
  TASK_DUE_SOON = 'task_due_soon',
  TASK_OVERDUE = 'task_overdue',
  TASK_ASSIGNED = 'task_assigned',
  TASK_COMPLETED = 'task_completed',
  TASK_COMMENTED = 'task_commented',
  SYSTEM = 'system',
  FEEDBACK_STATUS_UPDATE = 'feedback_status_update',
}

// Define specific data types for each notification type
export interface TaskDueSoonData {
  taskId: mongoose.Types.ObjectId;
  taskTitle: string;
  dueDate: Date;
}

export interface TaskOverdueData {
  taskId: mongoose.Types.ObjectId;
  taskTitle: string;
  dueDate: Date;
  daysOverdue?: number;
}

export interface TaskAssignedData {
  taskId: mongoose.Types.ObjectId;
  taskTitle: string;
  assignerId: mongoose.Types.ObjectId;
  assignerName?: string;
}

export interface TaskCompletedData {
  taskId: mongoose.Types.ObjectId;
  taskTitle: string;
  completerId: mongoose.Types.ObjectId;
  completerName?: string;
  completedAt: Date;
}

export interface TaskCommentedData {
  taskId: mongoose.Types.ObjectId;
  taskTitle: string;
  commentId: mongoose.Types.ObjectId;
  commenterId: mongoose.Types.ObjectId;
  commenterName?: string;
  commentPreview?: string;
}

export interface SystemData {
  message: string;
  severity?: 'info' | 'warning' | 'error';
  actionUrl?: string;
  actionLabel?: string;
}

// Union type for notification data
export type NotificationData =
  | TaskDueSoonData
  | TaskOverdueData
  | TaskAssignedData
  | TaskCompletedData
  | TaskCommentedData
  | SystemData
  | Record<string, unknown>;

// Notification document interface
export interface INotification extends Document {
  user: IUser['_id'];
  type: NotificationType;
  title: string;
  message: string;
  data: NotificationData;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Notification schema
const notificationSchema = new Schema<INotification>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Notification must belong to a user'],
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: [true, 'Notification type is required'],
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, type: 1 });

// Create and export Notification model
const Notification = mongoose.model<INotification>('Notification', notificationSchema);

export default Notification;
