import type { Types } from 'mongoose';
import type {
  IWorkspaceDocument,
  WorkspaceRole,
  WorkspaceSettings,
} from '../models/workspace.model';
import type { IUser } from '../models/user.model';
import type { ITeamWithId } from '../models/team.model';

// Extended workspace document with proper typing
export interface IWorkspaceDocumentExtended extends IWorkspaceDocument {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  owner: Types.ObjectId | IUser;
  team?: Types.ObjectId | ITeamWithId;
  members: Array<{
    user: Types.ObjectId | IUser;
    role: WorkspaceRole;
    joinedAt: Date;
    _id?: Types.ObjectId;
  }>;
}

// Helper types for type conversion
export type MongooseDocument<T> = T & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  __v: number;
  toObject?: () => T & { _id: Types.ObjectId };
  save?: () => Promise<MongooseDocument<T>>;
  deleteOne?: () => Promise<{ deletedCount: number }>;
};

// Type for MongoDB document with unknown _id
export type MongooseDocumentWithUnknownId<T> = T & {
  _id: unknown;
  createdAt: Date;
  updatedAt: Date;
  __v: number;
};

// Project settings interface
export interface IProjectSettings {
  allowPublicAccess: boolean;
  allowComments: boolean;
  allowAttachments: boolean;
  defaultTaskStatus: string;
  defaultTaskPriority: string;
  notifications: {
    taskCreated: boolean;
    taskUpdated: boolean;
    taskCompleted: boolean;
    memberAdded: boolean;
    memberRemoved: boolean;
  };
}

// Extended project document with proper typing
export interface IProjectDocumentExtended {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  workspace: Types.ObjectId;
  owner: Types.ObjectId;
  taskStatuses: string[];
  settings?: IProjectSettings;
  createdAt: Date;
  updatedAt: Date;
}

// Template types
export interface WorkspaceTemplate {
  name: string;
  description: string;
  creator: Types.ObjectId;
  isPublic: boolean;
  settings: WorkspaceSettings;
  projects: Array<{
    name: string;
    description: string;
    taskStatuses: string[];
  }>;
}

// Predefined template structure
export interface PredefinedTemplate {
  settings: WorkspaceSettings;
  projects: Array<{
    name: string;
    description: string;
    taskStatuses: string[];
  }>;
}

// API Features result type
export interface APIFeaturesResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// Member performance type
export interface MemberPerformance {
  userId: string;
  name: string;
  tasksAssigned: number;
  tasksCompleted: number;
  completionRate: number;
}

// Activity trend type
export interface ActivityTrend {
  date: string;
  count: number;
}

// Activity record type with proper structure
export interface ActivityRecord {
  _id: Types.ObjectId;
  user: Types.ObjectId | IUser;
  type: string; // Changed from 'action' to 'type' to match actual schema
  workspace?: Types.ObjectId;
  project?: Types.ObjectId;
  team?: Types.ObjectId;
  createdAt: Date; // Changed from 'timestamp' to 'createdAt' to match actual schema
  data?: Record<string, string | number | boolean | string[] | number[] | Record<string, unknown>>;
}

// Workspace statistics type
export interface WorkspaceStatistics {
  projectCount: number;
  taskCount: number;
  completedTaskCount: number;
  memberCount: number;
  activityCount: number;
  recentActivity: Array<ActivityRecord>;
}

// Performance metrics type
export interface PerformanceMetrics {
  taskCompletionRate: number;
  tasksByStatus: Record<string, number>;
  memberPerformance: MemberPerformance[];
  activityTrend: ActivityTrend[];
}

// Invitation result type
export interface InvitationResult {
  email: string;
  status: 'sent' | 'already_member' | 'error';
  message?: string;
}

// Export data workspace type
export interface ExportWorkspaceData {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
  isPersonal: boolean;
  isArchived: boolean;
  owner: string;
  team?: string;
  memberCount: number;
  settings: WorkspaceSettings;
  createdAt: string;
  updatedAt: string;
}

// Export data project type
export interface ExportProjectData {
  _id: string;
  name: string;
  description?: string;
  workspace: string;
  owner: string;
  taskStatuses: string[];
  isArchived: boolean;
  isPublic: boolean;
  progress: number;
  settings?: IProjectSettings;
  createdAt: string;
  updatedAt: string;
}

// Export data task type
export interface ExportTaskData {
  _id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  dueDate?: string;
  startDate?: string;
  completedAt?: string;
  project: string;
  workspace?: string;
  assignedTo?: string;
  createdBy: string;
  tags: string[];
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

// Export data activity log type
export interface ExportActivityLogData {
  _id: string;
  user: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

// Export data type
export interface ExportData {
  workspace: ExportWorkspaceData;
  projects?: Array<ExportProjectData>;
  tasks?: Array<ExportTaskData>;
  activityLog?: Array<ExportActivityLogData>;
}

// Clone options type
export interface CloneOptions {
  name: string;
  description?: string;
  team?: string;
  cloneProjects: boolean;
  cloneMembers: boolean;
}

// Export options type
export interface ExportOptions {
  includeProjects: boolean;
  includeTasks: boolean;
  includeActivityLog: boolean;
  format: 'json' | 'csv';
}

// Search options type
export interface SearchOptions {
  includeArchived?: boolean;
  includeTeamWorkspaces?: boolean;
  limit?: number;
}

// Template save data type
export interface TemplateSaveData {
  name: string;
  description: string;
  isPublic?: boolean;
}

// Task interface for type safety
export interface ITaskDocument {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  dueDate?: Date;
  project: Types.ObjectId;
  assignedTo?: Types.ObjectId;
  createdBy: Types.ObjectId;
  tags: string[];
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}
