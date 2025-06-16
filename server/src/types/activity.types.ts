// Activity data types for different activity types
import { WorkspaceSettings } from '../models/workspace.model';

// Define a type for custom activity data values
export type ActivityDataValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | Record<string, string | number | boolean | string[] | number[]>
  | WorkspaceSettings
  | null
  | undefined;

export interface ActivityData {
  // Task related data
  taskTitle?: string;
  taskDescription?: string;
  taskStatus?: string;
  taskPriority?: string;
  assignedTo?: string;
  assignedBy?: string;
  oldStatus?: string;
  newStatus?: string;
  oldPriority?: string;
  newPriority?: string;
  oldAssignee?: string;
  newAssignee?: string;
  commentText?: string;
  attachmentName?: string;
  attachmentUrl?: string;
  attachmentSize?: number;
  attachmentType?: string;

  // Project related data
  projectName?: string;
  projectDescription?: string;
  memberName?: string;
  memberEmail?: string;
  memberId?: string;
  role?: string;
  oldRole?: string;
  newRole?: string;
  addedBy?: string;
  removedBy?: string;
  updatedBy?: string;
  updatedFields?: string[];
  clonedFrom?: string;
  sourceProjectName?: string;
  createdFromTemplate?: boolean;
  templateId?: string;
  templateName?: string;

  // Workspace related data
  workspaceName?: string;
  workspaceDescription?: string;
  workspaceSettings?: WorkspaceSettings;
  templateCreated?: boolean;
  clonedWorkspace?: string;
  exportFormat?: string;
  exportSize?: number;
  invitationEmail?: string;
  invitationRole?: string;
  oldOwner?: string;
  newOwner?: string;

  // Team related data
  teamName?: string;
  teamDescription?: string;

  // User related data
  oldEmail?: string;
  newEmail?: string;
  profileFields?: string[];
  loginMethod?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: string;

  // System data
  notificationTitle?: string;
  notificationMessage?: string;
  systemMessage?: string;
  errorMessage?: string;
  warningMessage?: string;

  // Bulk operation data
  updatedCount?: number;
  totalCount?: number;
  projectIds?: string[];
  taskIds?: string[];
  userIds?: string[];

  // Generic data for custom activities
  [key: string]: ActivityDataValue;
}

// Activity search options
export interface ActivitySearchOptions {
  entityType?: 'task' | 'project' | 'workspace' | 'team';
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  page?: number;
}

// Activity analytics period
export type ActivityAnalyticsPeriod = 'day' | 'week' | 'month' | 'year';

// Activity analytics result
export interface ActivityAnalyticsResult {
  activityCountByType: Record<string, number>;
  activityCountByDay: Array<{ date: string; count: number }>;
  mostActiveProjects: Array<{ project: { _id: string; name: string }; count: number }>;
  mostActiveTasks: Array<{ task: { _id: string; title: string }; count: number }>;
  totalActivities: number;
}

// Activity stats result
export interface ActivityStatsResult {
  totalActivities: number;
  activitiesToday: number;
  activitiesThisWeek: number;
  activitiesThisMonth: number;
  mostActiveDay: string;
  averageActivitiesPerDay: number;
}
