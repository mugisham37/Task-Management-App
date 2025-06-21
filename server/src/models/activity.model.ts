import mongoose, { type Document, Schema } from 'mongoose';
import type { IUser } from './user.model';
import type { ITask } from './task.model';
import type { IProject } from './project.model';
import type { IWorkspace } from './workspace.model';
import type { ITeam } from './team.model';
import type { ActivityDataField } from '../types/activity.types';

// Activity type enum
export enum ActivityType {
  TASK_CREATED = 'task_created',
  TASK_UPDATED = 'task_updated',
  TASK_DELETED = 'task_deleted',
  TASK_COMPLETED = 'task_completed',
  TASK_ASSIGNED = 'task_assigned',
  TASK_COMMENTED = 'task_commented',
  TASK_ARCHIVED = 'task_archived',
  TASK_UNARCHIVED = 'task_unarchived',
  PROJECT_CREATED = 'project_created',
  PROJECT_UPDATED = 'project_updated',
  PROJECT_DELETED = 'project_deleted',
  WORKSPACE_CREATED = 'workspace_created',
  WORKSPACE_UPDATED = 'workspace_updated',
  WORKSPACE_DELETED = 'workspace_deleted',
  TEAM_CREATED = 'team_created',
  TEAM_UPDATED = 'team_updated',
  TEAM_DELETED = 'team_deleted',
  TEAM_MEMBER_ADDED = 'team_member_added',
  TEAM_MEMBER_REMOVED = 'team_member_removed',
  TEAM_MEMBER_ROLE_CHANGED = 'team_member_role_changed',
}

// Activity document interface
export interface IActivity extends Document {
  type: ActivityType;
  user: IUser['_id'];
  task?: ITask['_id'];
  project?: IProject['_id'];
  workspace?: IWorkspace['_id'];
  team?: ITeam['_id'];
  data: ActivityDataField;
  createdAt: Date;
}

// Activity schema
const activitySchema = new Schema<IActivity>(
  {
    type: {
      type: String,
      enum: Object.values(ActivityType),
      required: [true, 'Activity type is required'],
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Activity must have a user'],
    },
    task: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
    },
    team: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true, // Automatically add createdAt field
  },
);

// Indexes for performance
activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ task: 1, createdAt: -1 });
activitySchema.index({ project: 1, createdAt: -1 });
activitySchema.index({ workspace: 1, createdAt: -1 });
activitySchema.index({ team: 1, createdAt: -1 });
activitySchema.index({ type: 1, createdAt: -1 });

// Create and export Activity model
const Activity = mongoose.model<IActivity>('Activity', activitySchema);

export default Activity;
