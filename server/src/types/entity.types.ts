import mongoose from 'mongoose';
import { TeamRole } from '../models/team.model';
import { WorkspaceRole } from '../models/workspace.model';

/**
 * Common interface for entity members (team, workspace, project)
 */
export interface EntityMember {
  user: mongoose.Types.ObjectId;
  role: TeamRole | WorkspaceRole | string;
  joinedAt: Date;
  invitedBy?: mongoose.Types.ObjectId;
}

/**
 * Common interface for entities (team, workspace, project)
 */
export interface Entity {
  _id: mongoose.Types.ObjectId;
  name: string;
  members: EntityMember[];
  [key: string]: any; // Allow additional properties
}

/**
 * Interface for team entity
 */
export interface TeamEntity extends Entity {
  members: {
    user: mongoose.Types.ObjectId;
    role: TeamRole;
    joinedAt: Date;
    invitedBy?: mongoose.Types.ObjectId;
  }[];
}

/**
 * Interface for workspace entity
 */
export interface WorkspaceEntity extends Entity {
  members: {
    user: mongoose.Types.ObjectId;
    role: WorkspaceRole;
    joinedAt: Date;
    invitedBy?: mongoose.Types.ObjectId;
  }[];
}

/**
 * Interface for project entity
 */
export interface ProjectEntity extends Entity {
  members: {
    user: mongoose.Types.ObjectId;
    role: 'owner' | 'admin' | 'member' | 'viewer';
    joinedAt: Date;
    invitedBy?: mongoose.Types.ObjectId;
  }[];
}

/**
 * Interface for user entity
 */
export interface UserEntity {
  _id?: mongoose.Types.ObjectId;
  name?: string;
  email?: string;
  avatar?: string;
}

/**
 * Interface for error response
 */
export interface ErrorResponse {
  email: string;
  error: string;
}
