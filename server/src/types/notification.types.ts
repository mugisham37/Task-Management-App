/**
 * Custom type for notification data
 */
export type NotificationData = {
  [key: string]: string | number | boolean | object | null | undefined;
};

/**
 * Notification priority type
 */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Notification creation options
 */
export interface NotificationCreateOptions {
  priority?: NotificationPriority;
  expiresAt?: Date;
  actionUrl?: string;
  actionLabel?: string;
  sendRealTime?: boolean;
}

/**
 * Type for notification data that can be sent via websocket
 */
export interface WebSocketNotificationData {
  id?: string;
  type?: string;
  title?: string;
  message?: string;
  createdAt?: Date;
  priority?: string;
  data?: NotificationData;
  actionUrl?: string;
  actionLabel?: string;
  notifications?: WebSocketNotificationData[];
  count?: number;
  [key: string]: unknown;
}
