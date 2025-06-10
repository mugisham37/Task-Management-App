import mongoose, { Document, Schema, Model } from 'mongoose';
import { IUser } from './user.model';
import { ActivityType } from './activity.model';

// Activity document interface for project's getRecentActivity method
interface IActivityDocument {
  _id: mongoose.Types.ObjectId;
  type: ActivityType;
  user: {
    _id: mongoose.Types.ObjectId;
    name: string;
    avatar: string;
  };
  task?: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  workspace?: mongoose.Types.ObjectId;
  team?: mongoose.Types.ObjectId;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  __v: number;
}

// Project interface
export interface IProject {
  name: string;
  description: string;
  color: string;
  icon?: string;
  isArchived: boolean;
  isPublic: boolean;
  startDate?: Date;
  endDate?: Date;
  completedAt?: Date;
  progress: number;
  user: mongoose.Types.ObjectId | IUser;
  team?: mongoose.Types.ObjectId;
  workspace?: mongoose.Types.ObjectId;
  members: {
    user: mongoose.Types.ObjectId | IUser;
    role: 'owner' | 'admin' | 'member' | 'viewer';
    joinedAt: Date;
  }[];
  settings: {
    taskDefaultPriority?: string;
    taskDefaultStatus?: string;
    enableTimeTracking: boolean;
    enableTaskDependencies: boolean;
    enableGanttView: boolean;
  };
}

// Project document interface
export interface IProjectDocument extends IProject, Document {
  calculateProgress(): Promise<number>;
  getTotalTasks(): Promise<number>;
  getCompletedTasks(): Promise<number>;
  getOverdueTasks(): Promise<number>;
  getTasksByStatus(): Promise<Record<string, number>>;
  getTasksByPriority(): Promise<Record<string, number>>;
  getRecentActivity(limit?: number): Promise<IActivityDocument[]>;
}

// Project model interface
export interface IProjectModel extends Model<IProjectDocument> {
  getProjectStats(userId: mongoose.Types.ObjectId): Promise<{
    total: number;
    active: number;
    archived: number;
    completed: number;
    overdue: number;
  }>;
}

// Project schema
const projectSchema = new Schema<IProjectDocument>(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      maxlength: [50, 'Project name cannot be more than 50 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Project description cannot be more than 500 characters'],
    },
    color: {
      type: String,
      default: '#4f46e5', // Default color (indigo)
      validate: {
        validator: (value: string) => /^#[0-9A-F]{6}$/i.test(value),
        message: 'Color must be a valid hex color code',
      },
    },
    icon: {
      type: String,
      default: 'project',
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
      validate: {
        validator: function (this: IProjectDocument, value: Date) {
          // Skip validation if the end date is not being modified or is being removed
          if (!this.isModified('endDate') || !value) return true;

          // If start date exists, end date must be after start date
          if (this.startDate) {
            return value > this.startDate;
          }

          return true;
        },
        message: 'End date must be after start date',
      },
    },
    completedAt: {
      type: Date,
    },
    progress: {
      type: Number,
      default: 0,
      min: [0, 'Progress cannot be less than 0'],
      max: [100, 'Progress cannot be more than 100'],
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Project must belong to a user'],
    },
    team: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
    },
    members: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        role: {
          type: String,
          enum: ['owner', 'admin', 'member', 'viewer'],
          default: 'member',
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    settings: {
      taskDefaultPriority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium',
      },
      taskDefaultStatus: {
        type: String,
        enum: ['todo', 'in_progress', 'review', 'done'],
        default: 'todo',
      },
      enableTimeTracking: {
        type: Boolean,
        default: true,
      },
      enableTaskDependencies: {
        type: Boolean,
        default: false,
      },
      enableGanttView: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
projectSchema.index({ user: 1, name: 1 }, { unique: true });
projectSchema.index({ user: 1, isArchived: 1 });
projectSchema.index({ team: 1 });
projectSchema.index({ workspace: 1 });
projectSchema.index({ 'members.user': 1 });
projectSchema.index({ name: 'text', description: 'text' }); // Text index for search

// Pre-save middleware to add creator as owner member if members array is empty
projectSchema.pre<IProjectDocument>('save', function (next) {
  // If this is a new project or members array is empty
  if (this.isNew || this.members.length === 0) {
    this.members = [
      {
        user: this.user,
        role: 'owner',
        joinedAt: new Date(),
      },
    ];
  }
  next();
});

// Method to calculate project progress based on tasks
projectSchema.methods.calculateProgress = async function (): Promise<number> {
  const Task = mongoose.model('Task');

  const [totalTasks, completedTasks] = await Promise.all([
    Task.countDocuments({ project: this._id }),
    Task.countDocuments({ project: this._id, status: 'done' }),
  ]);

  if (totalTasks === 0) return 0;

  const progress = Math.round((completedTasks / totalTasks) * 100);

  // Update the progress field
  this.progress = progress;
  await this.save();

  return progress;
};

// Method to get total tasks count
projectSchema.methods.getTotalTasks = async function (): Promise<number> {
  const Task = mongoose.model('Task');
  return Task.countDocuments({ project: this._id });
};

// Method to get completed tasks count
projectSchema.methods.getCompletedTasks = async function (): Promise<number> {
  const Task = mongoose.model('Task');
  return Task.countDocuments({ project: this._id, status: 'done' });
};

// Method to get overdue tasks count
projectSchema.methods.getOverdueTasks = async function (): Promise<number> {
  const Task = mongoose.model('Task');
  return Task.countDocuments({
    project: this._id,
    dueDate: { $lt: new Date() },
    status: { $ne: 'done' },
  });
};

// Method to get tasks by status
projectSchema.methods.getTasksByStatus = async function (): Promise<Record<string, number>> {
  const Task = mongoose.model('Task');

  const statusCounts = await Task.aggregate([
    { $match: { project: this._id } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const result: Record<string, number> = {
    todo: 0,
    in_progress: 0,
    review: 0,
    done: 0,
  };

  statusCounts.forEach((status: { _id: string; count: number }) => {
    result[status._id] = status.count;
  });

  return result;
};

// Method to get tasks by priority
projectSchema.methods.getTasksByPriority = async function (): Promise<Record<string, number>> {
  const Task = mongoose.model('Task');

  const priorityCounts = await Task.aggregate([
    { $match: { project: this._id } },
    { $group: { _id: '$priority', count: { $sum: 1 } } },
  ]);

  const result: Record<string, number> = {
    low: 0,
    medium: 0,
    high: 0,
    urgent: 0,
  };

  priorityCounts.forEach((priority: { _id: string; count: number }) => {
    result[priority._id] = priority.count;
  });

  return result;
};

// Method to get recent activity
projectSchema.methods.getRecentActivity = async function (
  limit = 10,
): Promise<IActivityDocument[]> {
  const Activity = mongoose.model('Activity');
  const activities = await Activity.find({ project: this._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('user', 'name avatar')
    .lean();
  return activities as unknown as IActivityDocument[];
};

// Static method to get project statistics for a user
projectSchema.statics.getProjectStats = async function (userId: mongoose.Types.ObjectId) {
  const stats = await this.aggregate([
    {
      $match: { user: userId },
    },
    {
      $facet: {
        // Count total projects
        total: [
          {
            $count: 'count',
          },
        ],
        // Count active projects
        active: [
          {
            $match: { isArchived: false, completedAt: null },
          },
          {
            $count: 'count',
          },
        ],
        // Count archived projects
        archived: [
          {
            $match: { isArchived: true },
          },
          {
            $count: 'count',
          },
        ],
        // Count completed projects
        completed: [
          {
            $match: { completedAt: { $ne: null } },
          },
          {
            $count: 'count',
          },
        ],
        // Count overdue projects
        overdue: [
          {
            $match: {
              endDate: { $lt: new Date() },
              completedAt: null,
              isArchived: false,
            },
          },
          {
            $count: 'count',
          },
        ],
      },
    },
  ]);

  return {
    total: stats[0].total[0]?.count || 0,
    active: stats[0].active[0]?.count || 0,
    archived: stats[0].archived[0]?.count || 0,
    completed: stats[0].completed[0]?.count || 0,
    overdue: stats[0].overdue[0]?.count || 0,
  };
};

// Create and export Project model
const Project = mongoose.model<IProjectDocument, IProjectModel>('Project', projectSchema);

export default Project;
