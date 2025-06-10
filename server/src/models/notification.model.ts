import mongoose, { Document, Schema, Model } from 'mongoose';
import { IUser } from './user.model';

// Custom type for notification data to avoid using 'any'
export type NotificationData = {
  [key: string]: string | number | boolean | null | undefined | object;
};

// Notification type enum
export enum NotificationType {
  TASK_ASSIGNED = 'task_assigned',
  TASK_COMPLETED = 'task_completed',
  TASK_DUE_SOON = 'task_due_soon',
  TASK_OVERDUE = 'task_overdue',
  TASK_COMMENTED = 'task_commented',
  TASK_MENTIONED = 'task_mentioned',
  PROJECT_ADDED = 'project_added',
  PROJECT_REMOVED = 'project_removed',
  TEAM_INVITED = 'team_invited',
  TEAM_JOINED = 'team_joined',
  TEAM_ROLE_CHANGED = 'team_role_changed',
  WORKSPACE_INVITED = 'workspace_invited',
  WORKSPACE_JOINED = 'workspace_joined',
  SYSTEM = 'system',
}

// Notification interface
export interface INotification {
  user: mongoose.Types.ObjectId | IUser;
  type: NotificationType;
  title: string;
  message: string;
  data: NotificationData;
  isRead: boolean;
  isArchived: boolean;
  readAt?: Date;
  archivedAt?: Date;
  expiresAt?: Date;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  actionUrl?: string;
  actionLabel?: string;
}

// Notification document interface
export interface INotificationDocument extends INotification, Document {
  markAsRead(): Promise<INotificationDocument>;
  markAsUnread(): Promise<INotificationDocument>;
  archive(): Promise<INotificationDocument>;
  unarchive(): Promise<INotificationDocument>;
  isExpired(): boolean;
}

// Query type for notification queries
export type NotificationQueryType = {
  user: mongoose.Types.ObjectId;
  isRead?: boolean;
  isArchived?: boolean;
  type?: NotificationType;
  $or?: Array<{
    expiresAt?: { $exists?: boolean; $gt?: Date } | null;
  }>;
};

// Notification model interface
export interface INotificationModel extends Model<INotificationDocument> {
  getUserNotifications(
    userId: mongoose.Types.ObjectId,
    options?: {
      limit?: number;
      offset?: number;
      includeRead?: boolean;
      includeArchived?: boolean;
      type?: NotificationType;
    },
  ): Promise<INotificationDocument[]>;
  markAllAsRead(userId: mongoose.Types.ObjectId): Promise<void>;
  createNotification(
    userId: mongoose.Types.ObjectId,
    type: NotificationType,
    title: string,
    message: string,
    data?: NotificationData,
    options?: {
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      expiresAt?: Date;
      actionUrl?: string;
      actionLabel?: string;
    },
  ): Promise<INotificationDocument>;
  getUnreadCount(userId: mongoose.Types.ObjectId): Promise<number>;
}

// Notification schema
const notificationSchema = new Schema<INotificationDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Notification must belong to a user'],
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: [true, 'Notification type is required'],
      index: true,
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
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    archivedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
      index: true,
    },
    actionUrl: {
      type: String,
      trim: true,
    },
    actionLabel: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Compound indexes for performance
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isArchived: 1, createdAt: -1 });
notificationSchema.index({ user: 1, type: 1, createdAt: -1 });

// Method to mark notification as read
notificationSchema.methods.markAsRead = async function (
  this: INotificationDocument,
): Promise<INotificationDocument> {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    await this.save();
  }
  return this;
};

// Method to mark notification as unread
notificationSchema.methods.markAsUnread = async function (
  this: INotificationDocument,
): Promise<INotificationDocument> {
  if (this.isRead) {
    this.isRead = false;
    this.readAt = undefined;
    await this.save();
  }
  return this;
};

// Method to archive notification
notificationSchema.methods.archive = async function (
  this: INotificationDocument,
): Promise<INotificationDocument> {
  if (!this.isArchived) {
    this.isArchived = true;
    this.archivedAt = new Date();
    await this.save();
  }
  return this;
};

// Method to unarchive notification
notificationSchema.methods.unarchive = async function (
  this: INotificationDocument,
): Promise<INotificationDocument> {
  if (this.isArchived) {
    this.isArchived = false;
    this.archivedAt = undefined;
    await this.save();
  }
  return this;
};

// Method to check if notification is expired
notificationSchema.methods.isExpired = function (this: INotificationDocument): boolean {
  if (!this.expiresAt) {
    return false;
  }
  return new Date() > this.expiresAt;
};

// Static method to get user notifications
notificationSchema.statics.getUserNotifications = async function (
  userId: mongoose.Types.ObjectId,
  options = {},
): Promise<INotificationDocument[]> {
  const {
    limit = 20,
    offset = 0,
    includeRead = false,
    includeArchived = false,
    type = null,
  } = options;

  const query: NotificationQueryType = { user: userId };

  // Filter by read status
  if (!includeRead) {
    query.isRead = false;
  }

  // Filter by archived status
  if (!includeArchived) {
    query.isArchived = false;
  }

  // Filter by type
  if (type) {
    query.type = type;
  }

  // Filter out expired notifications
  query.$or = [
    { expiresAt: { $exists: false } },
    { expiresAt: null },
    { expiresAt: { $gt: new Date() } },
  ];

  return this.find(query).sort({ priority: -1, createdAt: -1 }).skip(offset).limit(limit);
};

// Static method to mark all notifications as read
notificationSchema.statics.markAllAsRead = async function (
  userId: mongoose.Types.ObjectId,
): Promise<void> {
  const now = new Date();
  await this.updateMany({ user: userId, isRead: false }, { $set: { isRead: true, readAt: now } });
};

// Static method to create a notification
notificationSchema.statics.createNotification = async function (
  userId: mongoose.Types.ObjectId,
  type: NotificationType,
  title: string,
  message: string,
  data = {},
  options = {},
): Promise<INotificationDocument> {
  const { priority = 'normal', expiresAt = null, actionUrl = null, actionLabel = null } = options;

  const notification = new this({
    user: userId,
    type,
    title,
    message,
    data,
    priority,
    expiresAt,
    actionUrl,
    actionLabel,
  });

  await notification.save();
  return notification;
};

// Static method to get unread notification count
notificationSchema.statics.getUnreadCount = async function (
  userId: mongoose.Types.ObjectId,
): Promise<number> {
  return this.countDocuments({
    user: userId,
    isRead: false,
    isArchived: false,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  });
};

// Create and export Notification model
const Notification = mongoose.model<INotificationDocument, INotificationModel>(
  'Notification',
  notificationSchema,
);

export default Notification;
