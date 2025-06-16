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

// Discriminated union type for activity data based on activity type
export type ActivityData =
  | { type: ActivityType.TASK_CREATED; data: TaskActivityData }
  | { type: ActivityType.TASK_UPDATED; data: TaskActivityData }
  | { type: ActivityType.TASK_DELETED; data: TaskActivityData }
  | { type: ActivityType.TASK_COMPLETED; data: TaskActivityData }
  | { type: ActivityType.TASK_ASSIGNED; data: TaskActivityData & { assignedTo: IUser['_id'] } }
  | { type: ActivityType.TASK_COMMENTED; data: CommentActivityData & { taskId: ITask['_id'] } }
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
  [K in ActivityType]?: K extends keyof ActivityData ? ActivityData[K]['data'] : never;
};
