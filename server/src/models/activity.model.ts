import mongoose, { Document, Schema, Model } from 'mongoose';
import { IUser } from './user.model';
import { ITask } from './task.model';
import { IProject } from './project.model';
import { IWorkspace } from './workspace.model';
import { ITeam } from './team.model';

// Activity type enum
export enum ActivityType {
  // Task related activities
  TASK_CREATED = 'task_created',
  TASK_UPDATED = 'task_updated',
  TASK_DELETED = 'task_deleted',
  TASK_COMPLETED = 'task_completed',
  TASK_REOPENED = 'task_reopened',
  TASK_ASSIGNED = 'task_assigned',
  TASK_UNASSIGNED = 'task_unassigned',
  TASK_MOVED = 'task_moved',
  TASK_COMMENTED = 'task_commented',
  TASK_ATTACHMENT_ADDED = 'task_attachment_added',
  TASK_ATTACHMENT_REMOVED = 'task_attachment_removed',

  // Project related activities
  PROJECT_CREATED = 'project_created',
  PROJECT_UPDATED = 'project_updated',
  PROJECT_DELETED = 'project_deleted',
  PROJECT_ARCHIVED = 'project_archived',
  PROJECT_UNARCHIVED = 'project_unarchived',
  PROJECT_MEMBER_ADDED = 'project_member_added',
  PROJECT_MEMBER_REMOVED = 'project_member_removed',
  PROJECT_MEMBER_ROLE_CHANGED = 'project_member_role_changed',

  // Workspace related activities
  WORKSPACE_CREATED = 'workspace_created',
  WORKSPACE_UPDATED = 'workspace_updated',
  WORKSPACE_DELETED = 'workspace_deleted',
  WORKSPACE_MEMBER_ADDED = 'workspace_member_added',
  WORKSPACE_MEMBER_REMOVED = 'workspace_member_removed',
  WORKSPACE_MEMBER_ROLE_CHANGED = 'workspace_member_role_changed',

  // Team related activities
  TEAM_CREATED = 'team_created',
  TEAM_UPDATED = 'team_updated',
  TEAM_DELETED = 'team_deleted',
  TEAM_MEMBER_ADDED = 'team_member_added',
  TEAM_MEMBER_REMOVED = 'team_member_removed',
  TEAM_MEMBER_ROLE_CHANGED = 'team_member_role_changed',

  // User related activities
  USER_LOGGED_IN = 'user_logged_in',
  USER_LOGGED_OUT = 'user_logged_out',
  USER_PROFILE_UPDATED = 'user_profile_updated',
  USER_PASSWORD_CHANGED = 'user_password_changed',
  USER_EMAIL_CHANGED = 'user_email_changed',

  // System activities
  SYSTEM_NOTIFICATION = 'system_notification',
}

// Activity interface
export interface IActivity {
  type: ActivityType;
  user: mongoose.Types.ObjectId | IUser;
  task?: mongoose.Types.ObjectId | ITask;
  project?: mongoose.Types.ObjectId | IProject;
  workspace?: mongoose.Types.ObjectId | IWorkspace;
  team?: mongoose.Types.ObjectId | ITeam;
  data: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  isSystem: boolean;
}

// Activity document interface
export interface IActivityDocument extends IActivity, Document {
  getRelatedActivities(): Promise<IActivityDocument[]>;
  getEntityUrl(): string;
}

// Activity model interface
export interface IActivityModel extends Model<IActivityDocument> {
  getUserActivities(
    userId: mongoose.Types.ObjectId,
    options?: {
      limit?: number;
      offset?: number;
      type?: ActivityType | ActivityType[];
      entityType?: 'task' | 'project' | 'workspace' | 'team';
      entityId?: mongoose.Types.ObjectId;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<IActivityDocument[]>;

  getEntityActivities(
    entityType: 'task' | 'project' | 'workspace' | 'team',
    entityId: mongoose.Types.ObjectId,
    options?: {
      limit?: number;
      offset?: number;
      type?: ActivityType | ActivityType[];
    },
  ): Promise<IActivityDocument[]>;

  logActivity(
    type: ActivityType,
    user: mongoose.Types.ObjectId,
    data: Record<string, unknown>,
    options?: {
      task?: mongoose.Types.ObjectId;
      project?: mongoose.Types.ObjectId;
      workspace?: mongoose.Types.ObjectId;
      team?: mongoose.Types.ObjectId;
      ipAddress?: string;
      userAgent?: string;
      isSystem?: boolean;
    },
  ): Promise<IActivityDocument>;
}

// Activity schema
const activitySchema = new Schema<IActivityDocument>(
  {
    type: {
      type: String,
      enum: Object.values(ActivityType),
      required: [true, 'Activity type is required'],
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Activity must have a user'],
      index: true,
    },
    task: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      index: true,
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      index: true,
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      index: true,
    },
    team: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      index: true,
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    isSystem: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Compound indexes for performance
activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ task: 1, createdAt: -1 });
activitySchema.index({ project: 1, createdAt: -1 });
activitySchema.index({ workspace: 1, createdAt: -1 });
activitySchema.index({ team: 1, createdAt: -1 });
activitySchema.index({ type: 1, createdAt: -1 });

// Method to get related activities
activitySchema.methods.getRelatedActivities = async function (): Promise<IActivityDocument[]> {
  const query: Record<string, unknown> = { _id: { $ne: this._id } };

  // Add entity filters based on what's available
  if (this.task) {
    query.task = this.task;
  } else if (this.project) {
    query.project = this.project;
  } else if (this.workspace) {
    query.workspace = this.workspace;
  } else if (this.team) {
    query.team = this.team;
  } else {
    // If no entity is specified, return activities by the same user
    query.user = this.user;
  }

  return this.model('Activity').find(query).sort({ createdAt: -1 }).limit(10);
};

// Method to get entity URL
activitySchema.methods.getEntityUrl = function (): string {
  if (this.task) {
    return `/tasks/${this.task}`;
  } else if (this.project) {
    return `/projects/${this.project}`;
  } else if (this.workspace) {
    return `/workspaces/${this.workspace}`;
  } else if (this.team) {
    return `/teams/${this.team}`;
  } else {
    return `/users/${this.user}`;
  }
};

// Static method to get user activities
activitySchema.statics.getUserActivities = async function (
  userId: mongoose.Types.ObjectId,
  options = {},
): Promise<IActivityDocument[]> {
  const {
    limit = 20,
    offset = 0,
    type = null,
    entityType = null,
    entityId = null,
    startDate = null,
    endDate = null,
  } = options;

  const query: Record<string, unknown> = { user: userId };

  // Filter by activity type
  if (type) {
    if (Array.isArray(type)) {
      query.type = { $in: type };
    } else {
      query.type = type;
    }
  }

  // Filter by entity type and ID
  if (entityType && entityId) {
    query[entityType] = entityId;
  }

  // Filter by date range
  if (startDate || endDate) {
    const createdAtQuery: Record<string, Date> = {};
    if (startDate) {
      createdAtQuery.$gte = startDate;
    }
    if (endDate) {
      createdAtQuery.$lte = endDate;
    }
    query.createdAt = createdAtQuery;
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .populate('user', 'name avatar')
    .populate('task', 'title')
    .populate('project', 'name')
    .populate('workspace', 'name')
    .populate('team', 'name');
};

// Static method to get entity activities
activitySchema.statics.getEntityActivities = async function (
  entityType: 'task' | 'project' | 'workspace' | 'team',
  entityId: mongoose.Types.ObjectId,
  options = {},
): Promise<IActivityDocument[]> {
  const { limit = 20, offset = 0, type = null } = options;

  const query: Record<string, unknown> = { [entityType]: entityId };

  // Filter by activity type
  if (type) {
    if (Array.isArray(type)) {
      query.type = { $in: type };
    } else {
      query.type = type;
    }
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .populate('user', 'name avatar');
};

// Static method to log an activity
activitySchema.statics.logActivity = async function (
  type: ActivityType,
  user: mongoose.Types.ObjectId,
  data: Record<string, unknown>,
  options = {},
): Promise<IActivityDocument> {
  const {
    task = null,
    project = null,
    workspace = null,
    team = null,
    ipAddress = null,
    userAgent = null,
    isSystem = false,
  } = options;

  const activity = new this({
    type,
    user,
    task,
    project,
    workspace,
    team,
    data,
    ipAddress,
    userAgent,
    isSystem,
  });

  await activity.save();
  return activity;
};

// Create and export Activity model
const Activity = mongoose.model<IActivityDocument, IActivityModel>('Activity', activitySchema);

export default Activity;
