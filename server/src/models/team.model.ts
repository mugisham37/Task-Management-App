import mongoose, { Document, Schema, Model } from 'mongoose';
import { IUser } from './user.model';

// Helper type for team member document
export type TeamMemberDocument = {
  user: mongoose.Types.ObjectId | IUser;
  role: TeamRole;
  joinedAt: Date;
  invitedBy?: mongoose.Types.ObjectId | IUser;
};

// Team role enum
export enum TeamRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

// Team member interface
export interface ITeamMember {
  user: mongoose.Types.ObjectId | IUser;
  role: TeamRole;
  joinedAt: Date;
  invitedBy?: mongoose.Types.ObjectId | IUser;
}

// Team interface
export interface ITeam {
  name: string;
  description?: string;
  avatar?: string;
  color: string;
  isArchived: boolean;
  members: ITeamMember[];
  createdBy: mongoose.Types.ObjectId | IUser;
  workspace?: mongoose.Types.ObjectId;
  settings: {
    allowMemberInvites: boolean;
    allowPublicProjects: boolean;
    defaultMemberRole: TeamRole;
  };
}

// Team document interface
export interface ITeamDocument extends ITeam, Document {
  addMember(
    userId: mongoose.Types.ObjectId,
    role?: TeamRole,
    invitedBy?: mongoose.Types.ObjectId,
  ): Promise<ITeamDocument>;
  removeMember(userId: mongoose.Types.ObjectId): Promise<ITeamDocument>;
  updateMemberRole(userId: mongoose.Types.ObjectId, role: TeamRole): Promise<ITeamDocument>;
  isMember(userId: mongoose.Types.ObjectId): boolean;
  getMemberRole(userId: mongoose.Types.ObjectId): TeamRole | null;
  getOwners(): ITeamMember[];
  getAdmins(): ITeamMember[];
}

// Define TeamMethods type for better type safety
type TeamMethods = {
  addMember: (
    userId: mongoose.Types.ObjectId,
    role?: TeamRole,
    invitedBy?: mongoose.Types.ObjectId,
  ) => Promise<ITeamDocument>;
  removeMember: (userId: mongoose.Types.ObjectId) => Promise<ITeamDocument>;
  updateMemberRole: (userId: mongoose.Types.ObjectId, role: TeamRole) => Promise<ITeamDocument>;
  isMember: (userId: mongoose.Types.ObjectId) => boolean;
  getMemberRole: (userId: mongoose.Types.ObjectId) => TeamRole | null;
  getOwners: () => ITeamMember[];
  getAdmins: () => ITeamMember[];
};

// Team model interface
export interface ITeamModel extends Model<ITeamDocument> {
  getUserTeams(userId: mongoose.Types.ObjectId): Promise<ITeamDocument[]>;
}

// Team schema
const teamSchema = new Schema<ITeamDocument>(
  {
    name: {
      type: String,
      required: [true, 'Team name is required'],
      trim: true,
      maxlength: [50, 'Team name cannot be more than 50 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Team description cannot be more than 500 characters'],
    },
    avatar: {
      type: String,
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
    members: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: [true, 'Team member must have a user ID'],
        },
        role: {
          type: String,
          enum: Object.values(TeamRole),
          default: TeamRole.MEMBER,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        invitedBy: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Team must have a creator'],
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
    },
    settings: {
      allowMemberInvites: {
        type: Boolean,
        default: false,
      },
      allowPublicProjects: {
        type: Boolean,
        default: false,
      },
      defaultMemberRole: {
        type: String,
        enum: Object.values(TeamRole),
        default: TeamRole.MEMBER,
      },
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
teamSchema.index({ name: 1 });
teamSchema.index({ 'members.user': 1 });
teamSchema.index({ createdBy: 1 });
teamSchema.index({ workspace: 1 });
teamSchema.index({ isArchived: 1 });
teamSchema.index({ name: 'text', description: 'text' }); // Text index for search

// Pre-save middleware to add creator as owner member if members array is empty
teamSchema.pre<ITeamDocument>('save', function (next) {
  // If this is a new team or members array is empty
  if (this.isNew || this.members.length === 0) {
    this.members = [
      {
        user: this.createdBy,
        role: TeamRole.OWNER,
        joinedAt: new Date(),
      },
    ] as TeamMemberDocument[];
  }
  next();
});

// Define methods
teamSchema.methods = {
  // Method to add a member to the team
  addMember: async function (
    this: ITeamDocument,
    userId: mongoose.Types.ObjectId,
    role: TeamRole = TeamRole.MEMBER,
    invitedBy?: mongoose.Types.ObjectId,
  ): Promise<ITeamDocument> {
    // Check if user is already a member
    const existingMember = this.members.find(
      (member: TeamMemberDocument) => member.user.toString() === userId.toString(),
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
      invitedBy,
    } as TeamMemberDocument);

    await this.save();
    return this;
  },

  // Method to remove a member from the team
  removeMember: async function (
    this: ITeamDocument,
    userId: mongoose.Types.ObjectId,
  ): Promise<ITeamDocument> {
    // Check if user is the only owner
    const isOwner = this.members.some(
      (member: TeamMemberDocument) =>
        member.user.toString() === userId.toString() && member.role === TeamRole.OWNER,
    );

    const ownerCount = this.members.filter(
      (member: TeamMemberDocument) => member.role === TeamRole.OWNER,
    ).length;

    // Cannot remove the only owner
    if (isOwner && ownerCount === 1) {
      throw new Error('Cannot remove the only owner of the team');
    }

    // Remove member
    this.members = this.members.filter(
      (member: TeamMemberDocument) => member.user.toString() !== userId.toString(),
    );

    await this.save();
    return this;
  },

  // Method to update a member's role
  updateMemberRole: async function (
    this: ITeamDocument,
    userId: mongoose.Types.ObjectId,
    role: TeamRole,
  ): Promise<ITeamDocument> {
    // Find member
    const member = this.members.find(
      (m: TeamMemberDocument) => m.user.toString() === userId.toString(),
    );

    if (!member) {
      throw new Error('User is not a member of this team');
    }

    // Check if changing the only owner
    if (
      member.role === TeamRole.OWNER &&
      role !== TeamRole.OWNER &&
      this.getOwners().length === 1
    ) {
      throw new Error('Cannot change the role of the only owner');
    }

    // Update role
    member.role = role;
    await this.save();
    return this;
  },

  // Method to check if a user is a member of the team
  isMember: function (this: ITeamDocument, userId: mongoose.Types.ObjectId): boolean {
    return this.members.some(
      (member: TeamMemberDocument) => member.user.toString() === userId.toString(),
    );
  },

  // Method to get a member's role
  getMemberRole: function (this: ITeamDocument, userId: mongoose.Types.ObjectId): TeamRole | null {
    const member = this.members.find(
      (m: TeamMemberDocument) => m.user.toString() === userId.toString(),
    );
    return member ? member.role : null;
  },

  // Method to get all owners
  getOwners: function (this: ITeamDocument): ITeamMember[] {
    return this.members.filter((member: TeamMemberDocument) => member.role === TeamRole.OWNER);
  },

  // Method to get all admins
  getAdmins: function (this: ITeamDocument): ITeamMember[] {
    return this.members.filter((member: TeamMemberDocument) => member.role === TeamRole.ADMIN);
  },
} as {
  [K in keyof TeamMethods]: (
    this: ITeamDocument,
    ...args: Parameters<TeamMethods[K]>
  ) => ReturnType<TeamMethods[K]>;
};

// Static method to get all teams a user is a member of
teamSchema.statics.getUserTeams = async function (
  this: Model<ITeamDocument>,
  userId: mongoose.Types.ObjectId,
): Promise<ITeamDocument[]> {
  return this.find({ 'members.user': userId, isArchived: false }).sort({ createdAt: -1 });
};

// Create and export Team model
const Team = mongoose.model<ITeamDocument, ITeamModel>('Team', teamSchema);

export default Team;
