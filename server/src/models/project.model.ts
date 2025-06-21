import mongoose, { type Document, Schema } from 'mongoose';
import type { IUser } from './user.model';
import type { IWorkspace } from './workspace.model';

// Project document interface
export interface IProject extends Document {
  name: string;
  description: string;
  color: string;
  isArchived: boolean;
  user: IUser['_id'];
  workspace?: IWorkspace['_id'];
  createdAt: Date;
  updatedAt: Date;
}

// Project schema
const projectSchema = new Schema<IProject>(
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
    isArchived: {
      type: Boolean,
      default: false,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Project must belong to a user'],
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
projectSchema.index({ user: 1, name: 1 }, { unique: true });
projectSchema.index({ user: 1, isArchived: 1 });

// Create and export Project model
const Project = mongoose.model<IProject>('Project', projectSchema);

export default Project;
