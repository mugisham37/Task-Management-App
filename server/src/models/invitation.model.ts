import mongoose, { type Document, Schema } from 'mongoose';
import type { IUser } from './user.model';
import { TeamRole, type ITeam } from './team.model';
import crypto from 'crypto';

// Invitation status enum
export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  EXPIRED = 'expired',
}

// Invitation document interface
export interface IInvitation extends Document {
  email: string;
  team: ITeam['_id'];
  role: TeamRole;
  invitedBy: IUser['_id'];
  status: InvitationStatus;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  generateToken: () => string;
  isExpired: () => boolean;
}

// Invitation schema
const invitationSchema = new Schema<IInvitation>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
    },
    team: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      required: [true, 'Invitation must be associated with a team'],
    },
    role: {
      type: String,
      enum: Object.values(TeamRole),
      default: TeamRole.MEMBER,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Invitation must have an inviter'],
    },
    status: {
      type: String,
      enum: Object.values(InvitationStatus),
      default: InvitationStatus.PENDING,
    },
    token: {
      type: String,
      required: [true, 'Invitation must have a token'],
    },
    expiresAt: {
      type: Date,
      required: [true, 'Invitation must have an expiration date'],
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
invitationSchema.index({ email: 1, team: 1 }, { unique: true });
invitationSchema.index({ token: 1 }, { unique: true });
invitationSchema.index({ expiresAt: 1 });
invitationSchema.index({ status: 1 });

// Generate invitation token
invitationSchema.methods.generateToken = function (): string {
  const token = crypto.randomBytes(32).toString('hex');
  this.token = token;
  return token;
};

// Check if invitation is expired
invitationSchema.methods.isExpired = function (): boolean {
  return this.expiresAt < new Date();
};

// Pre-save middleware to generate token if not provided
invitationSchema.pre<IInvitation>('save', function (next) {
  if (!this.token) {
    this.generateToken();
  }
  next();
});

// Create and export Invitation model
const Invitation = mongoose.model<IInvitation>('Invitation', invitationSchema);

export default Invitation;
