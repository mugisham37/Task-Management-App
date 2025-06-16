import { ActivityData } from './activity.types';
import { InvitationStatus, InvitationType } from '../models/invitation.model';
import mongoose, { Model } from 'mongoose';
import { TeamRole, ITeamDocument } from '../models/team.model';
import { IWorkspaceDocument } from '../models/workspace.model';
import { IProjectDocument } from '../models/project.model';

/**
 * Invitation activity data interface
 */
export interface InvitationActivityData extends ActivityData {
  teamName?: string;
  workspaceName?: string;
  projectName?: string;
  memberName?: string;
  memberEmail?: string;
  role?: TeamRole | string;
  action: 'invited' | 'joined' | 'declined' | 'invitation_cancelled' | 'invitation_resent';
}

/**
 * Invitation document interface with additional properties
 */
export interface InvitationDocument {
  email: string;
  type: string;
  role: string;
  invitedBy: string;
  status: string;
  message?: string;
  expiresAt: Date;
  team?: string;
  workspace?: string;
  project?: string;
}

/**
 * Type for entity models that can be used with invitations
 */
export type EntityModel = Model<ITeamDocument | IWorkspaceDocument | IProjectDocument>;

/**
 * Interface for invitation query parameters
 */
export interface InvitationQuery {
  email?: string;
  type?: InvitationType | { $in: InvitationType[] };
  status?: InvitationStatus | { $in: InvitationStatus[] };
  team?: mongoose.Types.ObjectId;
  workspace?: mongoose.Types.ObjectId;
  project?: mongoose.Types.ObjectId;
  expiresAt?: { $gt: Date };
  $or?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}
