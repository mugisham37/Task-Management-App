import mongoose, { type Document, Schema, type Model } from 'mongoose';
import type { IUser } from './user.model';
import type { IProject } from './project.model';

// Task priority enum
export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

// Task status enum
export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  DONE = 'done',
}

// Checklist item interface
export interface IChecklistItem {
  text: string;
  completed: boolean;
  completedAt?: Date;
  completedBy?: mongoose.Types.ObjectId;
  _id?: mongoose.Types.ObjectId;
}

// Task attachment interface
export interface ITaskAttachment {
  filename: string;
  path: string;
  mimetype: string;
  size: number;
  uploadedAt: Date;
  uploadedBy: mongoose.Types.ObjectId;
  _id?: mongoose.Types.ObjectId;
}

// Task document interface
export interface ITask extends Document {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date;
  startDate?: Date;
  completedAt?: Date;
  estimatedHours?: number;
  actualHours?: number;
  progress?: number;
  tags: string[];
  checklist: IChecklistItem[];
  attachments: ITaskAttachment[];
  project?: IProject['_id'];
  assignedTo?: IUser['_id'];
  createdBy: IUser['_id'];
  parentTask?: ITask['_id'];
  subtasks?: ITask['_id'][];
  isArchived: boolean;
  user: IUser['_id']; // Owner of the task
  createdAt: Date;
  updatedAt: Date;
}

// Task methods interface
export interface ITaskMethods {
  isOverdue(): boolean;
  calculateProgress(): number;
  addChecklistItem(text: string): void;
  completeChecklistItem(itemId: mongoose.Types.ObjectId, userId: mongoose.Types.ObjectId): void;
}

// Task model interface
export interface ITaskModel extends Model<ITask, Record<string, never>, ITaskMethods> {
  getTaskStats(userId: mongoose.Types.ObjectId): Promise<{
    total: number;
    completed: number;
    overdue: number;
    byStatus: Record<TaskStatus, number>;
    byPriority: Record<TaskPriority, number>;
    byProject: Record<string, { count: number; name: string }>;
    completionRate: number;
    tasksDueToday: number;
    tasksDueThisWeek: number;
    tasksCreatedLast30Days: number;
    tasksCompletedLast30Days: number;
    averageCompletionTimeHours: number;
    onTimeCompletionRate: number;
  }>;
}

// Combined document interface with methods
export interface ITaskDocument extends ITask, ITaskMethods {}

// Task schema
const taskSchema = new Schema<ITask, ITaskModel, ITaskMethods>(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: [100, 'Task title cannot be more than 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Task description cannot be more than 1000 characters'],
    },
    status: {
      type: String,
      enum: Object.values(TaskStatus),
      default: TaskStatus.TODO,
    },
    priority: {
      type: String,
      enum: Object.values(TaskPriority),
      default: TaskPriority.MEDIUM,
    },
    dueDate: {
      type: Date,
      validate: {
        validator: function (this: ITask, value: Date) {
          // Skip validation if the due date is not being modified
          if (!this.isModified('dueDate')) return true;
          // Allow removing the due date
          if (!value) return true;
          // Due date must be in the future when first set or when modified
          return value > new Date();
        },
        message: 'Due date must be in the future',
      },
    },
    startDate: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    estimatedHours: {
      type: Number,
      min: [0, 'Estimated hours cannot be negative'],
    },
    actualHours: {
      type: Number,
      min: [0, 'Actual hours cannot be negative'],
    },
    progress: {
      type: Number,
      min: [0, 'Progress cannot be less than 0'],
      max: [100, 'Progress cannot be more than 100'],
      default: 0,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    checklist: [
      {
        text: {
          type: String,
          required: true,
          trim: true,
          maxlength: [100, 'Checklist item cannot be more than 100 characters'],
        },
        completed: {
          type: Boolean,
          default: false,
        },
        completedAt: {
          type: Date,
        },
        completedBy: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
      },
    ],
    attachments: [
      {
        filename: String,
        path: String,
        mimetype: String,
        size: Number,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        uploadedBy: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
      },
    ],
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Task must have a creator'],
    },
    parentTask: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Task must belong to a user'],
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual field for subtasks
taskSchema.virtual('subtasks', {
  ref: 'Task',
  localField: '_id',
  foreignField: 'parentTask',
});

// Indexes for performance
taskSchema.index({ user: 1, status: 1 });
taskSchema.index({ user: 1, dueDate: 1 });
taskSchema.index({ user: 1, priority: 1 });
taskSchema.index({ user: 1, tags: 1 });
taskSchema.index({ user: 1, project: 1 });
taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ parentTask: 1 });
taskSchema.index({ title: 'text', description: 'text' }); // Text index for search
taskSchema.index({ isArchived: 1 });

// Pre-save middleware to set completedAt date when status changes to DONE
taskSchema.pre<ITaskDocument>('save', function (next) {
  if (this.isModified('status')) {
    if (this.status === TaskStatus.DONE && !this.completedAt) {
      this.completedAt = new Date();
      this.progress = 100;
    } else if (this.status !== TaskStatus.DONE) {
      this.completedAt = undefined;
    }
  }

  // Update progress based on checklist if available
  if (this.checklist && this.checklist.length > 0) {
    this.progress = this.calculateProgress();
  }

  next();
});

// Method to check if task is overdue
taskSchema.methods.isOverdue = function (): boolean {
  if (!this.dueDate) return false;
  if (this.status === TaskStatus.DONE) return false;
  return this.dueDate < new Date();
};

// Method to calculate progress based on checklist
taskSchema.methods.calculateProgress = function (): number {
  if (!this.checklist || this.checklist.length === 0) return this.progress || 0;
  const completedItems = this.checklist.filter((item) => item.completed).length;
  return Math.round((completedItems / this.checklist.length) * 100);
};

// Method to add checklist item
taskSchema.methods.addChecklistItem = function (text: string): void {
  if (!this.checklist) this.checklist = [];
  this.checklist.push({ text, completed: false });
};

// Method to complete checklist item
taskSchema.methods.completeChecklistItem = function (
  itemId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
): void {
  // Find the item by its ID
  const item = this.checklist.find((item) => item._id && item._id.equals(itemId));
  if (item) {
    item.completed = true;
    item.completedAt = new Date();
    item.completedBy = userId;
  }
};

// Static method to get task statistics for a user
taskSchema.static('getTaskStats', async function (userId: mongoose.Types.ObjectId) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const stats = await this.aggregate([
    {
      $match: { user: userId },
    },
    {
      $facet: {
        // Count by status
        byStatus: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
        ],
        // Count by priority
        byPriority: [
          {
            $group: {
              _id: '$priority',
              count: { $sum: 1 },
            },
          },
        ],
        // Count by project
        byProject: [
          {
            $group: {
              _id: '$project',
              count: { $sum: 1 },
            },
          },
          {
            $lookup: {
              from: 'projects',
              localField: '_id',
              foreignField: '_id',
              as: 'projectInfo',
            },
          },
          {
            $project: {
              _id: 1,
              count: 1,
              projectName: { $arrayElemAt: ['$projectInfo.name', 0] },
            },
          },
        ],
        // Count total tasks
        total: [
          {
            $count: 'count',
          },
        ],
        // Count completed tasks
        completed: [
          {
            $match: { status: TaskStatus.DONE },
          },
          {
            $count: 'count',
          },
        ],
        // Count overdue tasks
        overdue: [
          {
            $match: {
              dueDate: { $lt: now },
              status: { $ne: TaskStatus.DONE },
            },
          },
          {
            $count: 'count',
          },
        ],
        // Count tasks due today
        dueToday: [
          {
            $match: {
              dueDate: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
              },
              status: { $ne: TaskStatus.DONE },
            },
          },
          {
            $count: 'count',
          },
        ],
        // Count tasks due this week
        dueThisWeek: [
          {
            $match: {
              dueDate: {
                $gte: weekStart,
                $lte: weekEnd,
              },
              status: { $ne: TaskStatus.DONE },
            },
          },
          {
            $count: 'count',
          },
        ],
        // Count tasks created in last 30 days
        createdLast30Days: [
          {
            $match: {
              createdAt: { $gte: thirtyDaysAgo },
            },
          },
          {
            $count: 'count',
          },
        ],
        // Count tasks completed in last 30 days
        completedLast30Days: [
          {
            $match: {
              completedAt: { $gte: thirtyDaysAgo },
              status: TaskStatus.DONE,
            },
          },
          {
            $count: 'count',
          },
        ],
        // Calculate average completion time
        completionTime: [
          {
            $match: {
              completedAt: { $exists: true },
              createdAt: { $exists: true },
            },
          },
          {
            $project: {
              completionTimeHours: {
                $divide: [
                  { $subtract: ['$completedAt', '$createdAt'] },
                  3600000, // Convert ms to hours
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              average: { $avg: '$completionTimeHours' },
            },
          },
        ],
        // Calculate on-time completion rate
        onTimeCompletion: [
          {
            $match: {
              completedAt: { $exists: true },
              dueDate: { $exists: true },
            },
          },
          {
            $project: {
              onTime: {
                $cond: [{ $lte: ['$completedAt', '$dueDate'] }, 1, 0],
              },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              onTime: { $sum: '$onTime' },
            },
          },
          {
            $project: {
              rate: {
                $cond: [
                  { $eq: ['$total', 0] },
                  0,
                  { $multiply: [{ $divide: ['$onTime', '$total'] }, 100] },
                ],
              },
            },
          },
        ],
      },
    },
  ]);

  // Format the results
  const byStatus: Record<TaskStatus, number> = {
    [TaskStatus.TODO]: 0,
    [TaskStatus.IN_PROGRESS]: 0,
    [TaskStatus.REVIEW]: 0,
    [TaskStatus.DONE]: 0,
  };

  const byPriority: Record<TaskPriority, number> = {
    [TaskPriority.LOW]: 0,
    [TaskPriority.MEDIUM]: 0,
    [TaskPriority.HIGH]: 0,
    [TaskPriority.URGENT]: 0,
  };

  const byProject: Record<string, { count: number; name: string }> = {};

  // Process status counts
  stats[0].byStatus.forEach((item: { _id: TaskStatus; count: number }) => {
    byStatus[item._id] = item.count;
  });

  // Process priority counts
  stats[0].byPriority.forEach((item: { _id: TaskPriority; count: number }) => {
    byPriority[item._id] = item.count;
  });

  // Process project counts
  stats[0].byProject.forEach(
    (item: { _id: mongoose.Types.ObjectId | null; count: number; projectName: string }) => {
      const projectId = item._id ? item._id.toString() : 'none';
      const projectName = item.projectName || 'No Project';
      byProject[projectId] = {
        count: item.count,
        name: projectName,
      };
    },
  );

  const total = stats[0].total[0]?.count || 0;
  const completed = stats[0].completed[0]?.count || 0;
  const completionRate = total > 0 ? (completed / total) * 100 : 0;

  return {
    total,
    completed,
    overdue: stats[0].overdue[0]?.count || 0,
    byStatus,
    byPriority,
    byProject,
    completionRate,
    tasksDueToday: stats[0].dueToday[0]?.count || 0,
    tasksDueThisWeek: stats[0].dueThisWeek[0]?.count || 0,
    tasksCreatedLast30Days: stats[0].createdLast30Days[0]?.count || 0,
    tasksCompletedLast30Days: stats[0].completedLast30Days[0]?.count || 0,
    averageCompletionTimeHours: stats[0].completionTime[0]?.average || 0,
    onTimeCompletionRate: stats[0].onTimeCompletion[0]?.rate || 0,
  };
});

// Create and export Task model
const Task = mongoose.model<ITask, ITaskModel>('Task', taskSchema);

export default Task;
