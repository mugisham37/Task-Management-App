import { ActivityType } from '../models/activity.model';
import type { IUser } from '../models/user.model';
import type { ITask } from '../models/task.model';

// Base interface for common properties
interface BaseActivityData {
  timestamp?: Date;
}

// Task-related activity data
export interface TaskActivityData extends BaseActivityData {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: Date;
  assignees?: string[];
  tags?: string[];
  previousValues?: Partial<TaskActivityData>;
}

// Project-related activity data
export interface ProjectActivityData extends BaseActivityData {
  name?: string;
  description?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  previousValues?: Partial<ProjectActivityData>;
}

// Workspace-related activity data
export interface WorkspaceActivityData extends BaseActivityData {
  name?: string;
  description?: string;
  settings?: Record<string, string | number | boolean>;
  previousValues?: Partial<WorkspaceActivityData>;
}

// Team-related activity data
export interface TeamActivityData extends BaseActivityData {
  name?: string;
  description?: string;
  memberIds?: string[];
  roles?: Record<string, string>;
  permissions?: string[];
  previousValues?: Partial<TeamActivityData>;
}

// Team member activity data
export interface TeamMemberActivityData extends BaseActivityData {
  userId?: string;
  userName?: string;
  role?: string;
  previousRole?: string;
}

// Comment activity data
export interface CommentActivityData extends BaseActivityData {
  content?: string;
  attachments?: string[];
}

// Task template activity data
export interface TaskTemplateActivityData extends BaseActivityData {
  templateName?: string;
  isTemplate?: boolean;
  isPublic?: boolean;
  updates?: string[];
  fromTemplate?: boolean;
  taskTitle?: string;
  clonedFrom?: string;
  sourceTemplateId?: string;
}

// User-related activity data
export interface UserActivityData extends BaseActivityData {
  action?: string; // For user-specific actions like 'user_profile_updated'
  updates?: string[];
  userId?: string;
  userName?: string;
  userEmail?: string;
  oldRole?: string;
  newRole?: string;
}

// Calendar event activity data
export interface CalendarEventActivityData extends BaseActivityData {
  eventTitle?: string;
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
  isCalendarEvent?: boolean;
  attendanceStatus?: string;
  reminderTime?: number;
  location?: string;
  description?: string;
}

// Calendar integration activity data
export interface CalendarIntegrationActivityData extends BaseActivityData {
  provider?: string;
  calendarName?: string;
  isCalendarIntegration?: boolean;
  syncEnabled?: boolean;
  syncDirection?: string;
}

// Discriminated union type for activity data based on activity type
export type ActivityData =
  | {
      type: ActivityType.TASK_CREATED;
      data: TaskActivityData | TaskTemplateActivityData | CalendarEventActivityData;
    }
  | {
      type: ActivityType.TASK_UPDATED;
      data:
        | TaskActivityData
        | TaskTemplateActivityData
        | UserActivityData
        | CalendarEventActivityData
        | CalendarIntegrationActivityData;
    }
  | {
      type: ActivityType.TASK_DELETED;
      data:
        | TaskActivityData
        | TaskTemplateActivityData
        | CalendarEventActivityData
        | CalendarIntegrationActivityData;
    }
  | { type: ActivityType.TASK_COMPLETED; data: TaskActivityData }
  | { type: ActivityType.TASK_ASSIGNED; data: TaskActivityData & { assignedTo: IUser['_id'] } }
  | { type: ActivityType.TASK_COMMENTED; data: CommentActivityData & { taskId: ITask['_id'] } }
  | { type: ActivityType.TASK_ARCHIVED; data: TaskActivityData }
  | { type: ActivityType.TASK_UNARCHIVED; data: TaskActivityData }
  | { type: ActivityType.PROJECT_CREATED; data: ProjectActivityData }
  | { type: ActivityType.PROJECT_UPDATED; data: ProjectActivityData }
  | { type: ActivityType.PROJECT_DELETED; data: ProjectActivityData }
  | { type: ActivityType.WORKSPACE_CREATED; data: WorkspaceActivityData }
  | { type: ActivityType.WORKSPACE_UPDATED; data: WorkspaceActivityData }
  | { type: ActivityType.WORKSPACE_DELETED; data: WorkspaceActivityData }
  | { type: ActivityType.TEAM_CREATED; data: TeamActivityData }
  | { type: ActivityType.TEAM_UPDATED; data: TeamActivityData }
  | { type: ActivityType.TEAM_DELETED; data: TeamActivityData }
  | { type: ActivityType.TEAM_MEMBER_ADDED; data: TeamMemberActivityData }
  | { type: ActivityType.TEAM_MEMBER_REMOVED; data: TeamMemberActivityData }
  | { type: ActivityType.TEAM_MEMBER_ROLE_CHANGED; data: TeamMemberActivityData };

// Type for the data field in IActivity
export type ActivityDataField = {
  [K in ActivityType]?: K extends keyof ActivityData
    ? ActivityData[K]['data'] extends infer U
      ? U extends object
        ? Partial<U>
        : never
      : never
    : never;
} & {
  // Additional fields that can be used across different activity types
  eventTitle?: string;
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
  isCalendarEvent?: boolean;
  attendanceStatus?: string;
  provider?: string;
  calendarName?: string;
  isCalendarIntegration?: boolean;
  updates?: string[];
  description?: string;
  location?: string;
  reminderTime?: number;
  inviterId?: string;
  responderId?: string;
  status?: string;
  cancelledBy?: string;
  // Workspace-related fields
  workspaceName?: string;
  isPersonal?: boolean;
  workspaceId?: string;
  // Project-related fields
  projectName?: string;
  // Team-related fields
  teamName?: string;
  teamId?: string;
  memberName?: string;
  memberEmail?: string;
  memberRole?: string;
  oldRole?: string;
  newRole?: string;
  action?: string;
  role?: string; // Add role field for team member invitations
  // Task template-related fields
  templateName?: string;
  isTemplate?: boolean;
  fromTemplate?: boolean;
  taskTitle?: string;
  clonedFrom?: string;
  sourceTemplateId?: string;
  isPublic?: boolean;
};

// Interface for activity query parameters
export interface ActivityQueryParams {
  page?: number | string;
  limit?: number | string;
  sort?: string;
  task?: string;
  project?: string;
  workspace?: string;
  team?: string;
  type?: ActivityType;
  [key: string]: string | number | boolean | undefined; // For any additional filters
}

// Interface for calendar query parameters
export interface CalendarQueryParams {
  startDate?: string;
  endDate?: string;
  type?: string;
  task?: string;
  project?: string;
  workspace?: string;
  team?: string;
  attendanceStatus?: 'pending' | 'accepted' | 'declined';
  page?: number | string;
  limit?: number | string;
  sort?: string;
  search?: string;
  fields?: string;
  [key: string]: string | number | boolean | undefined; // For any additional filters
}

// Interface for pagination result
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
