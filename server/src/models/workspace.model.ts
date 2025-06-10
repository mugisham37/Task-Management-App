import mongoose, { Document, Schema, Model } from 'mongoose';
import { IUser } from './user.model';
import { ITeam } from './team.model';

// Define explicit types for better type safety
export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';
export type TaskView = 'list' | 'board' | 'calendar' | 'gantt';

export interface WorkspaceMember {
  user: mongoose.Types.ObjectId | IUser;
  role: WorkspaceRole;
  joinedAt: Date;
}

export interface WorkspaceSettings {
  defaultTaskView: TaskView;
  allowGuestAccess: boolean;
  allowMemberInvites: boolean;
  enableActivityLog: boolean;
}

// Workspace interface
export interface IWorkspace {
  name: string;
  description?: string;
  icon: string;
  color: string;
  isPersonal: boolean;
  isArchived: boolean;
  owner: mongoose.Types.ObjectId | IUser;
  team?: mongoose.Types.ObjectId | ITeam;
  members: WorkspaceMember[];
  settings: WorkspaceSettings;
}

// Workspace document interface
export interface IWorkspaceDocument extends IWorkspace, Document {
  addMember(userId: mongoose.Types.ObjectId, role?: WorkspaceRole): Promise<IWorkspaceDocument>;
  removeMember(userId: mongoose.Types.ObjectId): Promise<IWorkspaceDocument>;
  updateMemberRole(
    userId: mongoose.Types.ObjectId,
    role: WorkspaceRole,
  ): Promise<IWorkspaceDocument>;
  isMember(userId: mongoose.Types.ObjectId): boolean;
  getMemberRole(userId: mongoose.Types.ObjectId): WorkspaceRole | null;
  getProjectCount(): Promise<number>;
  getTaskCount(): Promise<number>;
  getMemberCount(): number;
}

// Workspace model interface
export interface IWorkspaceModel extends Model<IWorkspaceDocument> {
  getUserWorkspaces(userId: mongoose.Types.ObjectId): Promise<IWorkspaceDocument[]>;
  createPersonalWorkspace(
    userId: mongoose.Types.ObjectId,
    name?: string,
  ): Promise<IWorkspaceDocument>;
}

// Define schema with methods interface
export interface IWorkspaceSchema extends Schema<IWorkspaceDocument> {
  methods: {
    addMember(userId: mongoose.Types.ObjectId, role?: WorkspaceRole): Promise<IWorkspaceDocument>;
    removeMember(userId: mongoose.Types.ObjectId): Promise<IWorkspaceDocument>;
    updateMemberRole(
      userId: mongoose.Types.ObjectId,
      role: WorkspaceRole,
    ): Promise<IWorkspaceDocument>;
    isMember(userId: mongoose.Types.ObjectId): boolean;
    getMemberRole(userId: mongoose.Types.ObjectId): WorkspaceRole | null;
    getProjectCount(): Promise<number>;
    getTaskCount(): Promise<number>;
    getMemberCount(): number;
  };
  statics: {
    getUserWorkspaces(userId: mongoose.Types.ObjectId): Promise<IWorkspaceDocument[]>;
    createPersonalWorkspace(
      userId: mongoose.Types.ObjectId,
      name?: string,
    ): Promise<IWorkspaceDocument>;
  };
}

// Workspace schema
const workspaceSchema = new Schema<IWorkspaceDocument, IWorkspaceModel>(
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
    isArchived: {
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
      defaultTaskView: {
        type: String,
        enum: ['list', 'board', 'calendar', 'gantt'],
        default: 'board',
      },
      allowGuestAccess: {
        type: Boolean,
        default: false,
      },
      allowMemberInvites: {
        type: Boolean,
        default: false,
      },
      enableActivityLog: {
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
workspaceSchema.index({ owner: 1 });
workspaceSchema.index({ team: 1 });
workspaceSchema.index({ isPersonal: 1, owner: 1 });
workspaceSchema.index({ isArchived: 1 });
workspaceSchema.index({ 'members.user': 1 });
workspaceSchema.index({ name: 'text', description: 'text' }); // Text index for search

// Pre-save middleware to add owner as member if members array is empty
workspaceSchema.pre<IWorkspaceDocument>('save', function (next) {
  // If this is a new workspace or members array is empty
  if (this.isNew || this.members.length === 0) {
    this.members = [
      {
        user: this.owner,
        role: 'owner' as WorkspaceRole,
        joinedAt: new Date(),
      },
    ];
  }
  next();
});

// Method to add a member to the workspace
workspaceSchema.methods.addMember = async function (
  this: IWorkspaceDocument,
  userId: mongoose.Types.ObjectId,
  role: WorkspaceRole = 'member',
): Promise<IWorkspaceDocument> {
  // Check if user is already a member
  const existingMember = this.members.find(
    (member: WorkspaceMember) => member.user.toString() === userId.toString(),
  );

  if (existingMember) {
    // Update role if different
    if (existingMember.role !== role) {
      existingMember.role = role;
      await this.save();
    }
    return this;
  }

  // Add new member
  this.members.push({
    user: userId,
    role,
    joinedAt: new Date(),
  });

  await this.save();
  return this;
};

// Method to remove a member from the workspace
workspaceSchema.methods.removeMember = async function (
  this: IWorkspaceDocument,
  userId: mongoose.Types.ObjectId,
): Promise<IWorkspaceDocument> {
  // Check if user is the owner
  if (this.owner.toString() === userId.toString()) {
    throw new Error('Cannot remove the owner from the workspace');
  }

  // Remove member
  this.members = this.members.filter(
    (member: WorkspaceMember) => member.user.toString() !== userId.toString(),
  );

  await this.save();
  return this;
};

// Method to update a member's role
workspaceSchema.methods.updateMemberRole = async function (
  this: IWorkspaceDocument,
  userId: mongoose.Types.ObjectId,
  role: WorkspaceRole,
): Promise<IWorkspaceDocument> {
  // Cannot change owner's role
  if (this.owner.toString() === userId.toString() && role !== 'owner') {
    throw new Error('Cannot change the role of the workspace owner');
  }

  // Find member
  const member = this.members.find((m: WorkspaceMember) => m.user.toString() === userId.toString());

  if (!member) {
    throw new Error('User is not a member of this workspace');
  }

  // Update role
  member.role = role;
  await this.save();
  return this;
};

// Method to check if a user is a member of the workspace
workspaceSchema.methods.isMember = function (
  this: IWorkspaceDocument,
  userId: mongoose.Types.ObjectId,
): boolean {
  return this.members.some(
    (member: WorkspaceMember) => member.user.toString() === userId.toString(),
  );
};

// Method to get a member's role
workspaceSchema.methods.getMemberRole = function (
  this: IWorkspaceDocument,
  userId: mongoose.Types.ObjectId,
): WorkspaceRole | null {
  const member = this.members.find((m: WorkspaceMember) => m.user.toString() === userId.toString());
  return member ? member.role : null;
};

// Method to get project count
workspaceSchema.methods.getProjectCount = async function (
  this: IWorkspaceDocument,
): Promise<number> {
  const Project = mongoose.model('Project');
  return Project.countDocuments({ workspace: this._id });
};

// Method to get task count
workspaceSchema.methods.getTaskCount = async function (this: IWorkspaceDocument): Promise<number> {
  const Task = mongoose.model('Task');
  return Task.countDocuments({ workspace: this._id });
};

// Method to get member count
workspaceSchema.methods.getMemberCount = function (this: IWorkspaceDocument): number {
  return this.members.length;
};

// Static method to get all workspaces a user is a member of
workspaceSchema.statics.getUserWorkspaces = async function (
  userId: mongoose.Types.ObjectId,
): Promise<IWorkspaceDocument[]> {
  return this.find({ 'members.user': userId, isArchived: false }).sort({
    isPersonal: -1,
    createdAt: -1,
  });
};

// Static method to create a personal workspace for a user
workspaceSchema.statics.createPersonalWorkspace = async function (
  userId: mongoose.Types.ObjectId,
  name = 'Personal Workspace',
): Promise<IWorkspaceDocument> {
  // Check if user already has a personal workspace
  const existingWorkspace = await this.findOne({
    owner: userId,
    isPersonal: true,
  });

  if (existingWorkspace) {
    return existingWorkspace;
  }

  // Create new personal workspace
  const workspace = new this({
    name,
    owner: userId,
    isPersonal: true,
    members: [
      {
        user: userId,
        role: 'owner' as WorkspaceRole,
        joinedAt: new Date(),
      },
    ],
  });

  await workspace.save();
  return workspace;
};

// Create and export Workspace model
const Workspace = mongoose.model<IWorkspaceDocument, IWorkspaceModel>('Workspace', workspaceSchema);

export default Workspace;
