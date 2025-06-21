import mongoose from 'mongoose';
import type { ITeamMember } from '../models/team.model';

/**
 * Safely convert a potentially undefined date to a Date object
 * @param date Date value that might be undefined
 * @returns Date object or null if input is undefined/null
 */
export function safeDate(date: Date | string | number | undefined | null): Date | null {
  return date ? new Date(date) : null;
}

/**
 * Safely convert a string or ObjectId to an ObjectId
 * @param id String ID or ObjectId
 * @returns ObjectId or null if invalid
 */
export function toObjectId(
  id: string | mongoose.Types.ObjectId | null | undefined,
): mongoose.Types.ObjectId | null {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
  return null;
}

/**
 * Check if a user is a member of a team
 * @param members Array of team members
 * @param userId User ID to check
 * @returns Boolean indicating if user is a team member
 */
export function isUserTeamMember(members: ITeamMember[], userId: string): boolean {
  if (!members || !Array.isArray(members)) return false;
  return members.some((member) => {
    // Handle both direct IDs and objects with user property
    const memberId = member.user;
    return memberId && memberId.toString() === userId;
  });
}
