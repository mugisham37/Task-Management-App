import mongoose, { type Document, Schema, Types } from 'mongoose';
import type { IUser } from './user.model';

// Team role enum
export enum TeamRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

// Team member interface
export interface ITeamMember {
  _id?: Types.ObjectId;
  user: Types.ObjectId | IUser;
  role: TeamRole;
  joinedAt: Date;
}

// Interface for populated team document
export interface ITeamPopulated extends Omit<ITeam, 'members'> {
  members: Array<{
    _id: Types.ObjectId;
    user: IUser;
    role: TeamRole;
    joinedAt: Date;
  }>;
}

// Team document interface
export interface ITeam extends Document {
  name: string;
  description: string;
  avatar: string;
  members: ITeamMember[];
  createdBy: IUser['_id'];
  createdAt: Date;
  updatedAt: Date;
}

// Team schema
const teamSchema = new Schema<ITeam>(
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
      default: '',
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
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Team must have a creator'],
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
teamSchema.index({ name: 1 });
teamSchema.index({ 'members.user': 1 });

// Create and export Team model
const Team = mongoose.model<ITeam>('Team', teamSchema);

export default Team;
