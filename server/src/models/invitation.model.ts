import mongoose, { Document, Schema, Model } from 'mongoose';
import { IUser } from './user.model';
import { ITeam } from './team.model';
import { IWorkspace } from './workspace.model';
import crypto from 'crypto';

// Invitation status enum
export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

// Invitation type enum
export enum InvitationType {
  TEAM = 'team',
  WORKSPACE = 'workspace',
  PROJECT = 'project',
}

// Invitation interface
export interface IInvitation {
  email: string;
  type: InvitationType;
  team?: mongoose.Types.ObjectId | ITeam;
  workspace?: mongoose.Types.ObjectId | IWorkspace;
  project?: mongoose.Types.ObjectId;
  role: string;
  invitedBy: mongoose.Types.ObjectId | IUser;
  status: InvitationStatus;
  token: string;
  message?: string;
  expiresAt: Date;
}

// Invitation document interface
export interface IInvitationDocument extends IInvitation, Document {
  generateToken(): string;
  isExpired(): boolean;
  accept(): Promise<IInvitationDocument>;
  decline(): Promise<IInvitationDocument>;
  revoke(): Promise<IInvitationDocument>;
}

// Query interface for invitation queries
interface InvitationQuery {
  email: string;
  type: InvitationType;
  status?: InvitationStatus;
  team?: mongoose.Types.ObjectId;
  workspace?: mongoose.Types.ObjectId;
  project?: mongoose.Types.ObjectId;
}

// Invitation model interface
export interface IInvitationModel extends Model<IInvitationDocument> {
  findByToken(token: string): Promise<IInvitationDocument | null>;
  findByEmail(
    email: string,
    type: InvitationType,
    entityId: mongoose.Types.ObjectId,
  ): Promise<IInvitationDocument | null>;
  createInvitation(
    email: string,
    type: InvitationType,
    invitedBy: mongoose.Types.ObjectId,
    role: string,
    options?: {
      team?: mongoose.Types.ObjectId;
      workspace?: mongoose.Types.ObjectId;
      project?: mongoose.Types.ObjectId;
      message?: string;
      expiresIn?: number; // In days
    },
  ): Promise<IInvitationDocument>;
  getPendingInvitations(email: string): Promise<IInvitationDocument[]>;
}

// Invitation schema
const invitationSchema = new Schema<IInvitationDocument>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    type: {
      type: String,
      enum: Object.values(InvitationType),
      required: [true, 'Invitation type is required'],
    },
    team: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
    },
    role: {
      type: String,
      required: [true, 'Role is required'],
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
      unique: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: [500, 'Message cannot be more than 500 characters'],
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
invitationSchema.index({ email: 1, type: 1 });
invitationSchema.index({ token: 1 }, { unique: true });
invitationSchema.index({ status: 1 });
invitationSchema.index({ expiresAt: 1 });
invitationSchema.index({ team: 1, email: 1 }, { sparse: true });
invitationSchema.index({ workspace: 1, email: 1 }, { sparse: true });
invitationSchema.index({ project: 1, email: 1 }, { sparse: true });

// Generate invitation token
invitationSchema.methods.generateToken = function (): string {
  const token = crypto.randomBytes(32).toString('hex');
  this.token = token;
  return token;
};

// Check if invitation is expired
invitationSchema.methods.isExpired = function (): boolean {
  return this.expiresAt < new Date() || this.status === InvitationStatus.EXPIRED;
};

// Accept invitation
invitationSchema.methods.accept = async function (): Promise<IInvitationDocument> {
  if (this.status !== InvitationStatus.PENDING) {
    throw new Error(`Invitation cannot be accepted because it is ${this.status}`);
  }

  if (this.isExpired()) {
    this.status = InvitationStatus.EXPIRED;
    await this.save();
    throw new Error('Invitation has expired');
  }

  this.status = InvitationStatus.ACCEPTED;
  await this.save();
  return this as unknown as IInvitationDocument;
};

// Decline invitation
invitationSchema.methods.decline = async function (): Promise<IInvitationDocument> {
  if (this.status !== InvitationStatus.PENDING) {
    throw new Error(`Invitation cannot be declined because it is ${this.status}`);
  }

  this.status = InvitationStatus.DECLINED;
  await this.save();
  return this as unknown as IInvitationDocument;
};

// Revoke invitation
invitationSchema.methods.revoke = async function (): Promise<IInvitationDocument> {
  if (this.status !== InvitationStatus.PENDING) {
    throw new Error(`Invitation cannot be revoked because it is ${this.status}`);
  }

  this.status = InvitationStatus.REVOKED;
  await this.save();
  return this as unknown as IInvitationDocument;
};

// Pre-save middleware to generate token if not provided
invitationSchema.pre<IInvitationDocument>('save', function (next) {
  if (!this.token) {
    this.generateToken();
  }
  next();
});

// Pre-save middleware to validate entity based on type
invitationSchema.pre<IInvitationDocument>('save', function (next) {
  if (this.type === InvitationType.TEAM && !this.team) {
    return next(new Error('Team ID is required for team invitations'));
  }

  if (this.type === InvitationType.WORKSPACE && !this.workspace) {
    return next(new Error('Workspace ID is required for workspace invitations'));
  }

  if (this.type === InvitationType.PROJECT && !this.project) {
    return next(new Error('Project ID is required for project invitations'));
  }

  next();
});

// Static method to find invitation by token
invitationSchema.statics.findByToken = async function (
  token: string,
): Promise<IInvitationDocument | null> {
  return this.findOne({ token });
};

// Static method to find invitation by email and entity
invitationSchema.statics.findByEmail = async function (
  email: string,
  type: InvitationType,
  entityId: mongoose.Types.ObjectId,
): Promise<IInvitationDocument | null> {
  const query: InvitationQuery = {
    email: email.toLowerCase(),
    type,
    status: InvitationStatus.PENDING,
  };

  if (type === InvitationType.TEAM) {
    query.team = entityId;
  } else if (type === InvitationType.WORKSPACE) {
    query.workspace = entityId;
  } else if (type === InvitationType.PROJECT) {
    query.project = entityId;
  }

  return this.findOne(query);
};

// Static method to create an invitation
invitationSchema.statics.createInvitation = async function (
  email: string,
  type: InvitationType,
  invitedBy: mongoose.Types.ObjectId,
  role: string,
  options = {},
): Promise<IInvitationDocument> {
  const {
    team = null,
    workspace = null,
    project = null,
    message = '',
    expiresIn = 7, // Default 7 days
  } = options;

  // Check if there's already a pending invitation
  const existingInvitation = await (this as IInvitationModel).findByEmail(
    email,
    type,
    team || workspace || project,
  );

  if (existingInvitation) {
    // Update existing invitation
    existingInvitation.role = role;
    existingInvitation.message = message;
    existingInvitation.expiresAt = new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000);
    existingInvitation.generateToken(); // Generate a new token
    await existingInvitation.save();
    return existingInvitation;
  }

  // Create new invitation
  const invitation = new this({
    email: email.toLowerCase(),
    type,
    team,
    workspace,
    project,
    role,
    invitedBy,
    message,
    expiresAt: new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000),
  });

  await invitation.save();
  return invitation;
};

// Static method to get pending invitations for an email
invitationSchema.statics.getPendingInvitations = async function (
  email: string,
): Promise<IInvitationDocument[]> {
  return this.find({
    email: email.toLowerCase(),
    status: InvitationStatus.PENDING,
    expiresAt: { $gt: new Date() },
  })
    .populate('invitedBy', 'name avatar')
    .populate('team', 'name')
    .populate('workspace', 'name')
    .populate('project', 'name')
    .sort({ createdAt: -1 });
};

// Create and export Invitation model
const Invitation = mongoose.model<IInvitationDocument, IInvitationModel>(
  'Invitation',
  invitationSchema,
);

export default Invitation;
