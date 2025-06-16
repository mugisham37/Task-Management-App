import { NotificationPreferences } from '../services/notification.service';
import { IUser } from '../models/user.model';
import mongoose from 'mongoose';

/**
 * Extended user interface with notification preferences
 */
export interface IUserWithNotificationPreferences extends IUser {
  notificationPreferences?: NotificationPreferences;
  _id: mongoose.Types.ObjectId;
}

/**
 * Type for task assignee with _id
 */
export interface ITaskAssignee {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  [key: string]: unknown;
}
