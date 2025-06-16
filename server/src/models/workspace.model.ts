import mongoose, { type Document, Schema } from 'mongoose';
import type { IUser } from './user.model';
import type { ITeam } from './team.model';

// Workspace document interface
export interface IWorkspace extends Document {
  name: string;
  description: string;
  icon: string;
  color: string;
  isPersonal: boolean;
  owner: IUser['_id'];
  team?: ITeam['_id'];
  createdAt: Date;
  updatedAt: Date;
}

// Workspace schema
const workspaceSchema = new Schema<IWorkspace>(
  {
    name: {
      type: String,
      required: [true, 'Workspace name is required'],
      trim: true,
      maxlength: [50, 'Workspace name cannot be more than 50 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Workspace description cannot be more than 500 characters'],
    },
    icon: {
      type: String,
      default: 'folder',
    },
    color: {
      type: String,
      default: '#4f46e5', // Default color (indigo)
      validate: {
        validator: (value: string) => /^#[0-9A-F]{6}$/i.test(value),
        message: 'Color must be a valid hex color code',
      },
    },
    isPersonal: {
      type: Boolean,
      default: false,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Workspace must have an owner'],
    },
    team: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
workspaceSchema.index({ owner: 1 });
workspaceSchema.index({ team: 1 });
workspaceSchema.index({ isPersonal: 1, owner: 1 });

// Create and export Workspace model
const Workspace = mongoose.model<IWorkspace>('Workspace', workspaceSchema);

export default Workspace;
