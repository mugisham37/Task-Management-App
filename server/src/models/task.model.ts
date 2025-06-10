import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { IUser } from './user.model';
import { IProject } from './project.model';
import { IWorkspace } from './workspace.model';

// Task status enum
export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  DONE = 'done',
}

// Task priority enum
export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

// Query interface
interface TaskQuery {
  $or?: Array<{ createdBy: Types.ObjectId } | { assignedTo: Types.ObjectId }>;
  isArchived?: boolean;
  status?: TaskStatus | { $in: TaskStatus[] };
  priority?: TaskPriority | { $in: TaskPriority[] };
  project?: Types.ObjectId;
  workspace?: Types.ObjectId;
  dueDate?: {
    $gte?: Date;
    $lte?: Date;
  };
  tags?: { $in: string[] };
  $text?: { $search: string };
}

// Sort options interface
interface SortOptions {
  [key: string]: 1 | -1;
}

// Checklist item interface
export interface IChecklistItem {
  _id?: Types.ObjectId;
  title: string;
  completed: boolean;
  completedAt?: Date;
  completedBy?: Types.ObjectId | IUser;
}

// Task attachment interface
export interface ITaskAttachment {
  _id?: Types.ObjectId;
  filename: string;
  path: string;
  mimetype: string;
  size: number;
  uploadedAt: Date;
  uploadedBy: Types.ObjectId | IUser;
}

// Task interface
export interface ITask {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date;
  startDate?: Date;
  completedAt?: Date;
  estimatedHours?: number;
  actualHours?: number;
  tags: string[];
  checklist: IChecklistItem[];
  attachments: ITaskAttachment[];
  project?: Types.ObjectId | IProject;
  workspace?: Types.ObjectId | IWorkspace;
  assignedTo?: Types.ObjectId | IUser;
  createdBy: Types.ObjectId | IUser;
  isRecurring: boolean;
  recurringTaskId?: Types.ObjectId;
  parentTask?: Types.ObjectId | ITask;
  subTasks: Types.ObjectId[];
  isArchived: boolean;
  archivedAt?: Date;
  archivedBy?: Types.ObjectId | IUser;
}

// Task document interface
export interface ITaskDocument extends ITask, Document {
  addTag(tag: string): Promise<ITaskDocument>;
  removeTag(tag: string): Promise<ITaskDocument>;
  addChecklistItem(title: string): Promise<ITaskDocument>;
  updateChecklistItem(
    itemId: Types.ObjectId,
    updates: Partial<IChecklistItem>,
  ): Promise<ITaskDocument>;
  removeChecklistItem(itemId: Types.ObjectId): Promise<ITaskDocument>;
  toggleChecklistItem(itemId: Types.ObjectId, userId?: Types.ObjectId): Promise<ITaskDocument>;
  addAttachment(attachment: Omit<ITaskAttachment, 'uploadedAt'>): Promise<ITaskDocument>;
  removeAttachment(attachmentId: Types.ObjectId): Promise<ITaskDocument>;
  assignTo(userId: Types.ObjectId): Promise<ITaskDocument>;
  unassign(): Promise<ITaskDocument>;
  updateStatus(status: TaskStatus): Promise<ITaskDocument>;
  updatePriority(priority: TaskPriority): Promise<ITaskDocument>;
  complete(userId?: Types.ObjectId): Promise<ITaskDocument>;
  reopen(): Promise<ITaskDocument>;
  archive(userId?: Types.ObjectId): Promise<ITaskDocument>;
  unarchive(): Promise<ITaskDocument>;
  addSubTask(taskId: Types.ObjectId): Promise<ITaskDocument>;
  removeSubTask(taskId: Types.ObjectId): Promise<ITaskDocument>;
  logTime(hours: number): Promise<ITaskDocument>;
}

// Task model interface
export interface ITaskModel extends Model<ITaskDocument> {
  getTaskStats(userId: Types.ObjectId): Promise<{
    total: number;
    completed: number;
    overdue: number;
    byStatus: Record<TaskStatus, number>;
    byPriority: Record<TaskPriority, number>;
    byProject: Record<string, { count: number; name: string }>;
  }>;

  getUserTasks(
    userId: Types.ObjectId,
    options?: {
      status?: TaskStatus | TaskStatus[];
      priority?: TaskPriority | TaskPriority[];
      project?: Types.ObjectId;
      workspace?: Types.ObjectId;
      isArchived?: boolean;
      dueDateStart?: Date;
      dueDateEnd?: Date;
      tags?: string[];
      search?: string;
      sortBy?: 'dueDate' | 'priority' | 'status' | 'createdAt' | 'title';
      sortDirection?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    },
  ): Promise<ITaskDocument[]>;

  getOverdueTasks(userId: Types.ObjectId): Promise<ITaskDocument[]>;

  getDueSoonTasks(userId: Types.ObjectId, days?: number): Promise<ITaskDocument[]>;

  getProjectTasks(
    projectId: Types.ObjectId,
    options?: {
      status?: TaskStatus | TaskStatus[];
      isArchived?: boolean;
    },
  ): Promise<ITaskDocument[]>;

  getWorkspaceTasks(
    workspaceId: Types.ObjectId,
    options?: {
      status?: TaskStatus | TaskStatus[];
      isArchived?: boolean;
    },
  ): Promise<ITaskDocument[]>;

  searchTasks(
    query: string,
    userId: Types.ObjectId,
    options?: {
      limit?: number;
      offset?: number;
    },
  ): Promise<ITaskDocument[]>;
}

// Task schema
const taskSchema = new Schema<ITaskDocument>(
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
      maxlength: [2000, 'Task description cannot be more than 2000 characters'],
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
    },
    startDate: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    estimatedHours: {
      type: Number,
      min: 0,
    },
    actualHours: {
      type: Number,
      min: 0,
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
        title: {
          type: String,
          required: true,
          trim: true,
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
        filename: {
          type: String,
          required: true,
        },
        path: {
          type: String,
          required: true,
        },
        mimetype: {
          type: String,
          required: true,
        },
        size: {
          type: Number,
          required: true,
        },
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
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurringTaskId: {
      type: Schema.Types.ObjectId,
      ref: 'RecurringTask',
    },
    parentTask: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
    },
    subTasks: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Task',
      },
    ],
    isArchived: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
      type: Date,
    },
    archivedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
taskSchema.index({ createdBy: 1, status: 1 });
taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ workspace: 1, status: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ isArchived: 1 });
taskSchema.index({ parentTask: 1 });
taskSchema.index({ recurringTaskId: 1 });
taskSchema.index({ tags: 1 });
taskSchema.index({ title: 'text', description: 'text', tags: 'text' });

// Pre-save middleware to set completedAt date when status changes to DONE
taskSchema.pre<ITaskDocument>('save', function (next) {
  if (this.isModified('status')) {
    if (this.status === TaskStatus.DONE && !this.completedAt) {
      this.completedAt = new Date();
    } else if (this.status !== TaskStatus.DONE) {
      this.completedAt = undefined;
    }
  }
  next();
});

// Method implementations
taskSchema.methods = {
  // Method to add a tag
  addTag: async function (this: ITaskDocument, tag: string): Promise<ITaskDocument> {
    const normalizedTag = tag.trim().toLowerCase();
    if (!this.tags.includes(normalizedTag)) {
      this.tags.push(normalizedTag);
      await this.save();
    }
    return this;
  },

  // Method to remove a tag
  removeTag: async function (this: ITaskDocument, tag: string): Promise<ITaskDocument> {
    const normalizedTag = tag.trim().toLowerCase();
    this.tags = this.tags.filter((t: string) => t !== normalizedTag);
    await this.save();
    return this;
  },

  // Method to add a checklist item
  addChecklistItem: async function (this: ITaskDocument, title: string): Promise<ITaskDocument> {
    this.checklist.push({
      title: title.trim(),
      completed: false,
    });
    await this.save();
    return this;
  },

  // Method to update a checklist item
  updateChecklistItem: async function (
    this: ITaskDocument,
    itemId: Types.ObjectId,
    updates: Partial<IChecklistItem>,
  ): Promise<ITaskDocument> {
    const item = this.checklist.find((item) => item._id?.equals(itemId));
    if (!item) {
      throw new Error('Checklist item not found');
    }

    if (updates.title !== undefined) {
      item.title = updates.title;
    }

    if (updates.completed !== undefined) {
      item.completed = updates.completed;
      if (updates.completed) {
        item.completedAt = new Date();
        item.completedBy = updates.completedBy;
      } else {
        item.completedAt = undefined;
        item.completedBy = undefined;
      }
    }

    await this.save();
    return this;
  },

  // Method to remove a checklist item
  removeChecklistItem: async function (
    this: ITaskDocument,
    itemId: Types.ObjectId,
  ): Promise<ITaskDocument> {
    const itemIndex = this.checklist.findIndex((item) => item._id?.equals(itemId));
    if (itemIndex === -1) {
      throw new Error('Checklist item not found');
    }

    this.checklist.splice(itemIndex, 1);
    await this.save();
    return this;
  },

  // Method to toggle a checklist item
  toggleChecklistItem: async function (
    this: ITaskDocument,
    itemId: Types.ObjectId,
    userId?: Types.ObjectId,
  ): Promise<ITaskDocument> {
    const item = this.checklist.find((item) => item._id?.equals(itemId));
    if (!item) {
      throw new Error('Checklist item not found');
    }

    item.completed = !item.completed;
    if (item.completed) {
      item.completedAt = new Date();
      item.completedBy = userId;
    } else {
      item.completedAt = undefined;
      item.completedBy = undefined;
    }

    await this.save();
    return this;
  },

  // Method to add an attachment
  addAttachment: async function (
    this: ITaskDocument,
    attachment: Omit<ITaskAttachment, 'uploadedAt'>,
  ): Promise<ITaskDocument> {
    this.attachments.push({
      ...attachment,
      uploadedAt: new Date(),
    });
    await this.save();
    return this;
  },

  // Method to remove an attachment
  removeAttachment: async function (
    this: ITaskDocument,
    attachmentId: Types.ObjectId,
  ): Promise<ITaskDocument> {
    const attachmentIndex = this.attachments.findIndex((attachment) =>
      attachment._id?.equals(attachmentId),
    );
    if (attachmentIndex === -1) {
      throw new Error('Attachment not found');
    }

    this.attachments.splice(attachmentIndex, 1);
    await this.save();
    return this;
  },

  // Method to assign a task to a user
  assignTo: async function (this: ITaskDocument, userId: Types.ObjectId): Promise<ITaskDocument> {
    this.assignedTo = userId;
    await this.save();
    return this;
  },

  // Method to unassign a task
  unassign: async function (this: ITaskDocument): Promise<ITaskDocument> {
    this.assignedTo = undefined;
    await this.save();
    return this;
  },

  // Method to update task status
  updateStatus: async function (this: ITaskDocument, status: TaskStatus): Promise<ITaskDocument> {
    this.status = status;
    await this.save();
    return this;
  },

  // Method to update task priority
  updatePriority: async function (
    this: ITaskDocument,
    priority: TaskPriority,
  ): Promise<ITaskDocument> {
    this.priority = priority;
    await this.save();
    return this;
  },

  // Method to complete a task
  complete: async function (this: ITaskDocument, userId?: Types.ObjectId): Promise<ITaskDocument> {
    this.status = TaskStatus.DONE;
    this.completedAt = new Date();

    this.checklist.forEach((item: IChecklistItem) => {
      if (!item.completed) {
        item.completed = true;
        item.completedAt = new Date();
        item.completedBy = userId;
      }
    });

    await this.save();
    return this;
  },

  // Method to reopen a task
  reopen: async function (this: ITaskDocument): Promise<ITaskDocument> {
    this.status = TaskStatus.TODO;
    this.completedAt = undefined;
    await this.save();
    return this;
  },

  // Method to archive a task
  archive: async function (this: ITaskDocument, userId?: Types.ObjectId): Promise<ITaskDocument> {
    this.isArchived = true;
    this.archivedAt = new Date();
    this.archivedBy = userId;
    await this.save();
    return this;
  },

  // Method to unarchive a task
  unarchive: async function (this: ITaskDocument): Promise<ITaskDocument> {
    this.isArchived = false;
    this.archivedAt = undefined;
    this.archivedBy = undefined;
    await this.save();
    return this;
  },

  // Method to add a subtask
  addSubTask: async function (this: ITaskDocument, taskId: Types.ObjectId): Promise<ITaskDocument> {
    if (!this.subTasks.some((id) => id.equals(taskId))) {
      this.subTasks.push(taskId);
      await this.save();
    }
    return this;
  },

  // Method to remove a subtask
  removeSubTask: async function (
    this: ITaskDocument,
    taskId: Types.ObjectId,
  ): Promise<ITaskDocument> {
    this.subTasks = this.subTasks.filter((id) => !id.equals(taskId));
    await this.save();
    return this;
  },

  // Method to log time spent on a task
  logTime: async function (this: ITaskDocument, hours: number): Promise<ITaskDocument> {
    this.actualHours = (this.actualHours || 0) + hours;
    await this.save();
    return this;
  },
};

// Static methods
taskSchema.statics = {
  // Static method to get task statistics for a user
  getTaskStats: async function (userId: Types.ObjectId): Promise<{
    total: number;
    completed: number;
    overdue: number;
    byStatus: Record<TaskStatus, number>;
    byPriority: Record<TaskPriority, number>;
    byProject: Record<string, { count: number; name: string }>;
  }> {
    const stats = await this.aggregate([
      {
        $match: {
          $or: [{ createdBy: userId }, { assignedTo: userId }],
          isArchived: false,
        },
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
                dueDate: { $lt: new Date() },
                status: { $ne: TaskStatus.DONE },
              },
            },
            {
              $count: 'count',
            },
          ],
        },
      },
    ]);

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
      (item: { _id: Types.ObjectId | null; count: number; projectName: string }) => {
        const projectId = item._id ? item._id.toString() : 'none';
        const projectName = item.projectName || 'No Project';
        byProject[projectId] = {
          count: item.count,
          name: projectName,
        };
      },
    );

    return {
      total: stats[0].total[0]?.count || 0,
      completed: stats[0].completed[0]?.count || 0,
      overdue: stats[0].overdue[0]?.count || 0,
      byStatus,
      byPriority,
      byProject,
    };
  },

  // Static method to get user tasks
  getUserTasks: async function (
    userId: Types.ObjectId,
    options: {
      status?: TaskStatus | TaskStatus[];
      priority?: TaskPriority | TaskPriority[];
      project?: Types.ObjectId;
      workspace?: Types.ObjectId;
      isArchived?: boolean;
      dueDateStart?: Date;
      dueDateEnd?: Date;
      tags?: string[];
      search?: string;
      sortBy?: 'dueDate' | 'priority' | 'status' | 'createdAt' | 'title';
      sortDirection?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<ITaskDocument[]> {
    const {
      status = null,
      priority = null,
      project = null,
      workspace = null,
      isArchived = false,
      dueDateStart = null,
      dueDateEnd = null,
      tags = null,
      search = null,
      sortBy = 'dueDate',
      sortDirection = 'asc',
      limit = 50,
      offset = 0,
    } = options;

    const query: TaskQuery = {
      $or: [{ createdBy: userId }, { assignedTo: userId }],
      isArchived,
    };

    if (status) {
      query.status = Array.isArray(status) ? { $in: status } : status;
    }

    if (priority) {
      query.priority = Array.isArray(priority) ? { $in: priority } : priority;
    }

    if (project) {
      query.project = project;
    }

    if (workspace) {
      query.workspace = workspace;
    }

    if (dueDateStart || dueDateEnd) {
      query.dueDate = {};

      if (dueDateStart) {
        query.dueDate.$gte = dueDateStart;
      }

      if (dueDateEnd) {
        query.dueDate.$lte = dueDateEnd;
      }
    }

    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }

    if (search) {
      query.$text = { $search: search };
    }

    const sort: SortOptions = {};

    if (sortBy === 'dueDate') {
      sort.dueDate = sortDirection === 'asc' ? 1 : -1;
      sort.createdAt = -1;
    } else if (sortBy === 'priority') {
      sort.priority = sortDirection === 'asc' ? 1 : -1;
      sort.dueDate = 1;
    } else {
      sort[sortBy] = sortDirection === 'asc' ? 1 : -1;
    }

    return this.find(query)
      .sort(sort)
      .skip(offset)
      .limit(limit)
      .populate('project', 'name color')
      .populate('workspace', 'name color')
      .populate('assignedTo', 'name avatar')
      .populate('createdBy', 'name avatar')
      .populate('parentTask', 'title status')
      .populate('checklist.completedBy', 'name avatar');
  },

  // Static method to get overdue tasks
  getOverdueTasks: async function (userId: Types.ObjectId): Promise<ITaskDocument[]> {
    return this.find({
      $or: [{ createdBy: userId }, { assignedTo: userId }],
      dueDate: { $lt: new Date() },
      status: { $ne: TaskStatus.DONE },
      isArchived: false,
    })
      .sort({ dueDate: 1 })
      .populate('project', 'name color')
      .populate('workspace', 'name color')
      .populate('assignedTo', 'name avatar')
      .populate('createdBy', 'name avatar');
  },

  // Static method to get tasks due soon
  getDueSoonTasks: async function (userId: Types.ObjectId, days = 3): Promise<ITaskDocument[]> {
    const today = new Date();
    const future = new Date();
    future.setDate(today.getDate() + days);

    return this.find({
      $or: [{ createdBy: userId }, { assignedTo: userId }],
      dueDate: { $gte: today, $lte: future },
      status: { $ne: TaskStatus.DONE },
      isArchived: false,
    })
      .sort({ dueDate: 1 })
      .populate('project', 'name color')
      .populate('workspace', 'name color')
      .populate('assignedTo', 'name avatar')
      .populate('createdBy', 'name avatar');
  },

  // Static method to get project tasks
  getProjectTasks: async function (
    projectId: Types.ObjectId,
    options: {
      status?: TaskStatus | TaskStatus[];
      isArchived?: boolean;
    } = {},
  ): Promise<ITaskDocument[]> {
    const { status = null, isArchived = false } = options;

    const query: TaskQuery = {
      project: projectId,
      isArchived,
    };

    if (status) {
      query.status = Array.isArray(status) ? { $in: status } : status;
    }

    return this.find(query)
      .sort({ status: 1, priority: -1, dueDate: 1 })
      .populate('assignedTo', 'name avatar')
      .populate('createdBy', 'name avatar');
  },

  // Static method to get workspace tasks
  getWorkspaceTasks: async function (
    workspaceId: Types.ObjectId,
    options: {
      status?: TaskStatus | TaskStatus[];
      isArchived?: boolean;
    } = {},
  ): Promise<ITaskDocument[]> {
    const { status = null, isArchived = false } = options;

    const query: TaskQuery = {
      workspace: workspaceId,
      isArchived,
    };

    if (status) {
      query.status = Array.isArray(status) ? { $in: status } : status;
    }

    return this.find(query)
      .sort({ status: 1, priority: -1, dueDate: 1 })
      .populate('project', 'name color')
      .populate('assignedTo', 'name avatar')
      .populate('createdBy', 'name avatar');
  },

  // Static method to search tasks
  searchTasks: async function (
    query: string,
    userId: Types.ObjectId,
    options: {
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<ITaskDocument[]> {
    const { limit = 20, offset = 0 } = options;

    return this.find({
      $text: { $search: query },
      $or: [{ createdBy: userId }, { assignedTo: userId }],
      isArchived: false,
    })
      .sort({ score: { $meta: 'textScore' } })
      .skip(offset)
      .limit(limit)
      .populate('project', 'name color')
      .populate('workspace', 'name color')
      .populate('assignedTo', 'name avatar')
      .populate('createdBy', 'name avatar');
  },
};

// Create and export Task model
const Task = mongoose.model<ITaskDocument, ITaskModel>('Task', taskSchema);

export default Task;
