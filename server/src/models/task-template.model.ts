import mongoose, { Document, Schema, Model } from 'mongoose';
import { IUser } from './user.model';
import { IProject } from './project.model';
import { IWorkspace } from './workspace.model';
import { ITeam } from './team.model';
import { TaskPriority } from './task.model';

// Task data interface
export interface ITaskData {
  title: string;
  description?: string;
  priority: TaskPriority;
  estimatedHours?: number;
  tags?: string[];
  checklist?: {
    title: string;
    completed: boolean;
  }[];
  attachments?: {
    filename: string;
    path: string;
    mimetype: string;
    size: number;
  }[];
  dueDate?: Date | null;
  assignee?: mongoose.Types.ObjectId | null;
}

// Task template interface
export interface ITaskTemplate {
  name: string;
  description?: string;
  user: mongoose.Types.ObjectId | IUser;
  project?: mongoose.Types.ObjectId | IProject;
  workspace?: mongoose.Types.ObjectId | IWorkspace;
  team?: mongoose.Types.ObjectId | ITeam;
  isPublic: boolean;
  usageCount: number;
  taskData: ITaskData;
  category?: string;
  tags?: string[];
}

// Create task options interface
export interface CreateTaskOptions {
  user?: mongoose.Types.ObjectId;
  project?: mongoose.Types.ObjectId;
  workspace?: mongoose.Types.ObjectId;
  dueDate?: Date | null;
  assignee?: mongoose.Types.ObjectId | null;
  overrides?: Partial<ITaskData>;
}

// Task template document interface
export interface ITaskTemplateDocument extends ITaskTemplate, Document {
  incrementUsageCount(): Promise<ITaskTemplateDocument>;
  createTaskFromTemplate(options?: CreateTaskOptions): Promise<mongoose.Types.ObjectId>;
}

// Task template model interface
export interface ITaskTemplateModel extends Model<ITaskTemplateDocument> {
  getUserTemplates(userId: mongoose.Types.ObjectId): Promise<ITaskTemplateDocument[]>;
  getPublicTemplates(): Promise<ITaskTemplateDocument[]>;
  getProjectTemplates(projectId: mongoose.Types.ObjectId): Promise<ITaskTemplateDocument[]>;
  getTeamTemplates(teamId: mongoose.Types.ObjectId): Promise<ITaskTemplateDocument[]>;
  getWorkspaceTemplates(workspaceId: mongoose.Types.ObjectId): Promise<ITaskTemplateDocument[]>;
  searchTemplates(
    query: string,
    options?: {
      userId?: mongoose.Types.ObjectId;
      includePublic?: boolean;
      projectId?: mongoose.Types.ObjectId;
      teamId?: mongoose.Types.ObjectId;
      workspaceId?: mongoose.Types.ObjectId;
    },
  ): Promise<ITaskTemplateDocument[]>;
}

// Search query interface for templates
export interface TemplateSearchQuery {
  $text?: { $search: string };
  $or?: Array<{ user: mongoose.Types.ObjectId } | { isPublic: boolean }>;
  user?: mongoose.Types.ObjectId;
  isPublic?: boolean;
  project?: mongoose.Types.ObjectId;
  team?: mongoose.Types.ObjectId;
  workspace?: mongoose.Types.ObjectId;
  score?: { $meta: 'textScore' };
}

// Task template schema
const taskTemplateSchema = new Schema<ITaskTemplateDocument, ITaskTemplateModel>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
    isPublic: {
      type: Boolean,
      default: false,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    category: {
      type: String,
      trim: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    taskData: {
      title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },
      description: {
        type: String,
        trim: true,
        maxlength: 1000,
      },
      priority: {
        type: String,
        enum: Object.values(TaskPriority),
        default: TaskPriority.MEDIUM,
      },
      estimatedHours: {
        type: Number,
        min: 0,
      },
      tags: {
        type: [String],
        default: [],
      },
      checklist: {
        type: [
          {
            title: {
              type: String,
              required: true,
              trim: true,
              maxlength: 100,
            },
            completed: {
              type: Boolean,
              default: false,
            },
          },
        ],
        default: [],
      },
      attachments: {
        type: [
          {
            filename: String,
            path: String,
            mimetype: String,
            size: Number,
          },
        ],
        default: [],
      },
      dueDate: {
        type: Date,
        default: null,
      },
      assignee: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
taskTemplateSchema.index({ user: 1 });
taskTemplateSchema.index({ project: 1 });
taskTemplateSchema.index({ workspace: 1 });
taskTemplateSchema.index({ team: 1 });
taskTemplateSchema.index({ isPublic: 1 });
taskTemplateSchema.index({ usageCount: -1 });
taskTemplateSchema.index({ category: 1 });
taskTemplateSchema.index({ tags: 1 });
taskTemplateSchema.index({
  name: 'text',
  description: 'text',
  'taskData.title': 'text',
  'taskData.description': 'text',
});

// Define methods
taskTemplateSchema.methods = {
  // Method to increment usage count
  incrementUsageCount: async function (
    this: ITaskTemplateDocument,
  ): Promise<ITaskTemplateDocument> {
    this.usageCount += 1;
    await this.save();
    return this;
  },

  // Method to create a task from the template
  createTaskFromTemplate: async function (
    this: ITaskTemplateDocument,
    options: CreateTaskOptions = {},
  ): Promise<mongoose.Types.ObjectId> {
    const Task = mongoose.model('Task');

    const {
      user = this.user,
      project = this.project,
      workspace = this.workspace,
      dueDate = this.taskData.dueDate,
      assignee = this.taskData.assignee,
      overrides = {},
    } = options;

    // Create a new task based on the template
    const task = new Task({
      title: overrides.title || this.taskData.title,
      description: overrides.description || this.taskData.description,
      priority: overrides.priority || this.taskData.priority,
      estimatedHours: overrides.estimatedHours || this.taskData.estimatedHours,
      tags: overrides.tags || this.taskData.tags,
      checklist: overrides.checklist || this.taskData.checklist,
      attachments: overrides.attachments || this.taskData.attachments,
      dueDate,
      assignee,
      project,
      workspace,
      user,
      createdFromTemplate: this._id,
    });

    await task.save();

    // Increment the usage count
    await this.incrementUsageCount();

    return task._id;
  },
};

// Define statics
taskTemplateSchema.statics = {
  // Static method to get user templates
  getUserTemplates: async function (
    this: ITaskTemplateModel,
    userId: mongoose.Types.ObjectId,
  ): Promise<ITaskTemplateDocument[]> {
    return this.find({ user: userId })
      .sort({ usageCount: -1 })
      .populate('project', 'name')
      .populate('workspace', 'name')
      .populate('team', 'name');
  },

  // Static method to get public templates
  getPublicTemplates: async function (this: ITaskTemplateModel): Promise<ITaskTemplateDocument[]> {
    return this.find({ isPublic: true })
      .sort({ usageCount: -1 })
      .populate('user', 'name')
      .populate('project', 'name')
      .populate('workspace', 'name')
      .populate('team', 'name');
  },

  // Static method to get project templates
  getProjectTemplates: async function (
    this: ITaskTemplateModel,
    projectId: mongoose.Types.ObjectId,
  ): Promise<ITaskTemplateDocument[]> {
    return this.find({ project: projectId }).sort({ usageCount: -1 }).populate('user', 'name');
  },

  // Static method to get team templates
  getTeamTemplates: async function (
    this: ITaskTemplateModel,
    teamId: mongoose.Types.ObjectId,
  ): Promise<ITaskTemplateDocument[]> {
    return this.find({ team: teamId })
      .sort({ usageCount: -1 })
      .populate('user', 'name')
      .populate('project', 'name');
  },

  // Static method to get workspace templates
  getWorkspaceTemplates: async function (
    this: ITaskTemplateModel,
    workspaceId: mongoose.Types.ObjectId,
  ): Promise<ITaskTemplateDocument[]> {
    return this.find({ workspace: workspaceId })
      .sort({ usageCount: -1 })
      .populate('user', 'name')
      .populate('project', 'name');
  },

  // Static method to search templates
  searchTemplates: async function (
    this: ITaskTemplateModel,
    query: string,
    options: {
      userId?: mongoose.Types.ObjectId | null;
      includePublic?: boolean;
      projectId?: mongoose.Types.ObjectId | null;
      teamId?: mongoose.Types.ObjectId | null;
      workspaceId?: mongoose.Types.ObjectId | null;
    } = {},
  ): Promise<ITaskTemplateDocument[]> {
    const {
      userId = null,
      includePublic = true,
      projectId = null,
      teamId = null,
      workspaceId = null,
    } = options;

    // Build the search query
    const searchQuery: TemplateSearchQuery = {
      $text: { $search: query },
    };

    // Filter by user or public templates
    if (userId) {
      if (includePublic) {
        searchQuery.$or = [{ user: userId }, { isPublic: true }];
      } else {
        searchQuery.user = userId;
      }
    } else if (!includePublic) {
      // If no user specified and not including public, return empty array
      return [];
    } else {
      searchQuery.isPublic = true;
    }

    // Filter by project, team, or workspace
    if (projectId) {
      searchQuery.project = projectId;
    }

    if (teamId) {
      searchQuery.team = teamId;
    }

    if (workspaceId) {
      searchQuery.workspace = workspaceId;
    }

    return this.find(searchQuery)
      .sort({ score: { $meta: 'textScore' }, usageCount: -1 })
      .populate('user', 'name')
      .populate('project', 'name')
      .populate('workspace', 'name')
      .populate('team', 'name');
  },
};

// Create and export TaskTemplate model
const TaskTemplate = mongoose.model<ITaskTemplateDocument, ITaskTemplateModel>(
  'TaskTemplate',
  taskTemplateSchema,
);

export default TaskTemplate;
