import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITaskData {
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
  estimatedHours?: number;
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
}

export interface ITaskTemplate extends Document {
  name: string;
  description?: string;
  user: Types.ObjectId;
  project?: Types.ObjectId;
  workspace?: Types.ObjectId;
  team?: Types.ObjectId;
  isPublic: boolean;
  usageCount: number;
  taskData: ITaskData;
  createdAt: Date;
  updatedAt: Date;
}

const taskTemplateSchema = new Schema<ITaskTemplate>(
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
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium',
      },
      tags: {
        type: [String],
        default: [],
      },
      estimatedHours: {
        type: Number,
        min: 0,
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
    },
  },
  {
    timestamps: true,
  },
);

// Index for faster searches
taskTemplateSchema.index({
  name: 'text',
  'taskData.title': 'text',
  'taskData.description': 'text',
});

const TaskTemplate = mongoose.model<ITaskTemplate>('TaskTemplate', taskTemplateSchema);

export default TaskTemplate;
