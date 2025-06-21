import { Document, Types } from 'mongoose';
import { TeamRole } from '../models/team.model';
import type { IUser } from '../models/user.model';

/**
 * Interface for team member
 */
export interface ITeamMember {
  _id?: Types.ObjectId;
  user: Types.ObjectId | IUser | string;
  role: TeamRole;
  joinedAt: Date;
}

/**
 * Team document interface
 */
export interface ITeam extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  avatar?: string;
  members: ITeamMember[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for populated team
 */
export interface IPopulatedTeam extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  avatar?: string;
  members: ITeamMember[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for populated invitation team
 */
export interface IInvitationTeam {
  _id: Types.ObjectId;
  name: string;
  members: ITeamMember[];
}

/**
 * Interface for populated user
 */
export interface IPopulatedUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
}

/**
 * Interface for populated team member
 */
export interface IPopulatedTeamMember {
  _id?: Types.ObjectId;
  user: IPopulatedUser;
  role: TeamRole;
  joinedAt: Date;
}
