import mongoose from 'mongoose';
import Team, { type ITeam, TeamRole } from '../models/team.model';
import User from '../models/user.model';
import Workspace from '../models/workspace.model';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/app-error';
import { APIFeatures } from '../utils/api-features';
import { createActivity } from './activity.service';
import { ActivityType } from '../models/activity.model';
import * as cache from '../utils/cache';
import { startTimer } from '../utils/performance-monitor';
import logger from '../config/logger';

/**
 * Create a new team
 * @param userId User ID of the creator
 * @param teamData Team data
 * @returns Newly created team
 */
export const createTeam = async (userId: string, teamData: Partial<ITeam>): Promise<ITeam> => {
  const timer = startTimer('teamService.createTeam');

  try {
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Create team with creator as owner
    const team = await Team.create({
      ...teamData,
      createdBy: userId,
      members: [
        {
          user: userId,
          role: TeamRole.OWNER,
          joinedAt: new Date(),
        },
      ],
    });

    // Create activity log
    await createActivity({
      type: ActivityType.TEAM_CREATED,
      user: userId,
      team: team._id,
      data: {
        teamName: team.name,
      },
    });

    // Invalidate cache
    cache.delByPattern(`userTeams:${userId}`);

    return team;
  } catch (error) {
    logger.error('Error creating team:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get all teams for a user
 * @param userId User ID
 * @param queryParams Query parameters for filtering, sorting, and pagination
 * @returns Teams and pagination metadata
 */
export const getTeams = async (
  userId: string,
  queryParams: Record<string, any>,
): Promise<{
  data: ITeam[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('teamService.getTeams');

  try {
    // Try to get from cache if no filters are applied
    const hasFilters = Object.keys(queryParams).some(
      (key) => !['page', 'limit', 'sort'].includes(key),
    );
    const cacheKey = `userTeams:${userId}:${JSON.stringify(queryParams)}`;

    if (!hasFilters) {
      const cachedTeams = cache.get(cacheKey);
      if (cachedTeams) {
        return cachedTeams;
      }
    }

    // Find teams where user is a member
    const query = Team.find({
      'members.user': userId,
    });

    // Apply API features (filtering, sorting, pagination)
    const features = new APIFeatures(query, queryParams)
      .filter()
      .search(['name', 'description'])
      .sort()
      .limitFields()
      .paginate();

    // Execute query with pagination metadata
    const result = await features.execute();

    // Cache result if no filters
    if (!hasFilters) {
      cache.set(cacheKey, result, 300); // Cache for 5 minutes
    }

    return result;
  } catch (error) {
    logger.error(`Error getting teams for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get a team by ID
 * @param teamId Team ID
 * @param userId User ID
 * @returns Team
 */
export const getTeamById = async (teamId: string, userId: string): Promise<ITeam> => {
  const timer = startTimer('teamService.getTeamById');

  try {
    // Try to get from cache
    const cacheKey = `team:${teamId}`;
    const cachedTeam = cache.get<ITeam>(cacheKey);
    if (cachedTeam) {
      // Check if user is a member of the team
      const isMember = cachedTeam.members.some((member) => member.user.toString() === userId);
      if (!isMember) {
        throw new ForbiddenError('You do not have permission to access this team');
      }
      return cachedTeam;
    }

    // Find team by ID
    const team = await Team.findById(teamId).populate('members.user', 'name email');

    // Check if team exists
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    // Check if user is a member of the team
    const isMember = team.members.some((member) => member.user.toString() === userId);
    if (!isMember) {
      throw new ForbiddenError('You do not have permission to access this team');
    }

    // Cache team
    cache.set(cacheKey, team, 300); // Cache for 5 minutes

    return team;
  } catch (error) {
    logger.error(`Error getting team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Update a team
 * @param teamId Team ID
 * @param userId User ID
 * @param updateData Update data
 * @returns Updated team
 */
export const updateTeam = async (
  teamId: string,
  userId: string,
  updateData: Partial<ITeam>,
): Promise<ITeam> => {
  const timer = startTimer('teamService.updateTeam');

  try {
    // Find team by ID
    const team = await Team.findById(teamId);

    // Check if team exists
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    // Check if user is an admin or owner of the team
    const userMember = team.members.find((member) => member.user.toString() === userId);
    if (!userMember || ![TeamRole.ADMIN, TeamRole.OWNER].includes(userMember.role as TeamRole)) {
      throw new ForbiddenError('You do not have permission to update this team');
    }

    // Prevent updating members through this endpoint
    if (updateData.members) {
      delete updateData.members;
    }

    // Update team
    Object.assign(team, updateData);
    await team.save();

    // Create activity log
    await createActivity({
      type: ActivityType.TEAM_UPDATED,
      user: userId,
      team: team._id,
      data: {
        teamName: team.name,
        updates: Object.keys(updateData),
      },
    });

    // Invalidate cache
    cache.del(`team:${teamId}`);
    cache.delByPattern(`userTeams:*`);

    return team;
  } catch (error) {
    logger.error(`Error updating team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Delete a team
 * @param teamId Team ID
 * @param userId User ID
 * @returns Success message
 */
export const deleteTeam = async (teamId: string, userId: string): Promise<{ message: string }> => {
  const timer = startTimer('teamService.deleteTeam');

  try {
    // Find team by ID
    const team = await Team.findById(teamId);

    // Check if team exists
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    // Check if user is the owner of the team
    const userMember = team.members.find((member) => member.user.toString() === userId);
    if (!userMember || userMember.role !== TeamRole.OWNER) {
      throw new ForbiddenError('Only the team owner can delete the team');
    }

    // Get team name for activity log
    const teamName = team.name;

    // Delete team
    await team.deleteOne();

    // Delete associated workspaces
    await Workspace.deleteMany({ team: teamId });

    // Create activity log
    await createActivity({
      type: ActivityType.TEAM_DELETED,
      user: userId,
      data: {
        teamName,
        teamId,
      },
    });

    // Invalidate cache
    cache.del(`team:${teamId}`);
    cache.delByPattern(`userTeams:*`);
    cache.delByPattern(`teamMembers:${teamId}`);

    return {
      message: 'Team deleted successfully',
    };
  } catch (error) {
    logger.error(`Error deleting team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Add a member to a team
 * @param teamId Team ID
 * @param userId User ID of the admin/owner
 * @param memberData Member data
 * @returns Updated team
 */
export const addTeamMember = async (
  teamId: string,
  userId: string,
  memberData: {
    email: string;
    role?: TeamRole;
  },
): Promise<ITeam> => {
  const timer = startTimer('teamService.addTeamMember');

  try {
    // Find team by ID
    const team = await Team.findById(teamId);

    // Check if team exists
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    // Check if user is an admin or owner of the team
    const userMember = team.members.find((member) => member.user.toString() === userId);
    if (!userMember || ![TeamRole.ADMIN, TeamRole.OWNER].includes(userMember.role as TeamRole)) {
      throw new ForbiddenError('You do not have permission to add members to this team');
    }

    // Check if user with the provided email exists
    const newMember = await User.findOne({ email: memberData.email });
    if (!newMember) {
      throw new NotFoundError('User with this email not found');
    }

    // Check if user is already a member of the team
    const isAlreadyMember = team.members.some(
      (member) => member.user.toString() === newMember._id.toString(),
    );
    if (isAlreadyMember) {
      throw new ValidationError('User is already a member of this team');
    }

    // Determine role (only owner can add admins)
    let role = memberData.role || TeamRole.MEMBER;
    if (role === TeamRole.ADMIN && userMember.role !== TeamRole.OWNER) {
      throw new ForbiddenError('Only the team owner can add administrators');
    }

    // Prevent adding another owner
    if (role === TeamRole.OWNER) {
      role = TeamRole.ADMIN;
    }

    // Add member to team
    team.members.push({
      user: newMember._id,
      role,
      joinedAt: new Date(),
    });

    await team.save();

    // Create activity log
    await createActivity({
      type: ActivityType.TEAM_MEMBER_ADDED,
      user: userId,
      team: team._id,
      data: {
        teamName: team.name,
        memberName: newMember.name,
        memberEmail: newMember.email,
        memberRole: role,
      },
    });

    // Invalidate cache
    cache.del(`team:${teamId}`);
    cache.delByPattern(`teamMembers:${teamId}`);
    cache.delByPattern(`userTeams:${newMember._id}`);

    return team;
  } catch (error) {
    logger.error(`Error adding member to team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Remove a member from a team
 * @param teamId Team ID
 * @param userId User ID of the admin/owner
 * @param memberId User ID of the member to remove
 * @returns Updated team
 */
export const removeTeamMember = async (
  teamId: string,
  userId: string,
  memberId: string,
): Promise<ITeam> => {
  const timer = startTimer('teamService.removeTeamMember');

  try {
    // Find team by ID
    const team = await Team.findById(teamId);

    // Check if team exists
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    // Check if user is an admin or owner of the team
    const userMember = team.members.find((member) => member.user.toString() === userId);
    if (!userMember || ![TeamRole.ADMIN, TeamRole.OWNER].includes(userMember.role as TeamRole)) {
      throw new ForbiddenError('You do not have permission to remove members from this team');
    }

    // Find the member to remove
    const memberToRemove = team.members.find((member) => member.user.toString() === memberId);
    if (!memberToRemove) {
      throw new NotFoundError('Member not found in this team');
    }

    // Check if trying to remove the owner
    if (memberToRemove.role === TeamRole.OWNER) {
      throw new ForbiddenError('Cannot remove the team owner');
    }

    // Check if admin is trying to remove another admin
    if (userMember.role === TeamRole.ADMIN && memberToRemove.role === TeamRole.ADMIN) {
      throw new ForbiddenError('Administrators cannot remove other administrators');
    }

    // Get member info for activity log
    const memberUser = await User.findById(memberId).select('name email');

    // Remove member from team
    team.members = team.members.filter((member) => member.user.toString() !== memberId);
    await team.save();

    // Create activity log
    await createActivity({
      type: ActivityType.TEAM_MEMBER_REMOVED,
      user: userId,
      team: team._id,
      data: {
        teamName: team.name,
        memberName: memberUser?.name,
        memberEmail: memberUser?.email,
      },
    });

    // Invalidate cache
    cache.del(`team:${teamId}`);
    cache.delByPattern(`teamMembers:${teamId}`);
    cache.delByPattern(`userTeams:${memberId}`);

    return team;
  } catch (error) {
    logger.error(`Error removing member from team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Update a team member's role
 * @param teamId Team ID
 * @param userId User ID of the owner
 * @param memberId User ID of the member to update
 * @param role New role
 * @returns Updated team
 */
export const updateTeamMemberRole = async (
  teamId: string,
  userId: string,
  memberId: string,
  role: TeamRole,
): Promise<ITeam> => {
  const timer = startTimer('teamService.updateTeamMemberRole');

  try {
    // Find team by ID
    const team = await Team.findById(teamId);

    // Check if team exists
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    // Check if user is the owner of the team
    const userMember = team.members.find((member) => member.user.toString() === userId);
    if (!userMember || userMember.role !== TeamRole.OWNER) {
      throw new ForbiddenError('Only the team owner can change member roles');
    }

    // Find the member to update
    const memberIndex = team.members.findIndex((member) => member.user.toString() === memberId);
    if (memberIndex === -1) {
      throw new NotFoundError('Member not found in this team');
    }

    // Check if trying to change the owner's role
    if (team.members[memberIndex].role === TeamRole.OWNER) {
      throw new ForbiddenError("Cannot change the team owner's role");
    }

    // Check if trying to set another member as owner
    if (role === TeamRole.OWNER) {
      throw new ForbiddenError('Cannot set another member as owner');
    }

    // Get member info for activity log
    const memberUser = await User.findById(memberId).select('name email');
    const oldRole = team.members[memberIndex].role;

    // Update member's role
    team.members[memberIndex].role = role;
    await team.save();

    // Create activity log
    await createActivity({
      type: ActivityType.TEAM_MEMBER_ROLE_CHANGED,
      user: userId,
      team: team._id,
      data: {
        teamName: team.name,
        memberName: memberUser?.name,
        memberEmail: memberUser?.email,
        oldRole,
        newRole: role,
      },
    });

    // Invalidate cache
    cache.del(`team:${teamId}`);
    cache.delByPattern(`teamMembers:${teamId}`);

    return team;
  } catch (error) {
    logger.error(`Error updating member role in team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get team members
 * @param teamId Team ID
 * @param userId User ID
 * @returns Team members
 */
export const getTeamMembers = async (teamId: string, userId: string): Promise<any[]> => {
  const timer = startTimer('teamService.getTeamMembers');

  try {
    // Try to get from cache
    const cacheKey = `teamMembers:${teamId}`;
    const cachedMembers = cache.get(cacheKey);
    if (cachedMembers) {
      return cachedMembers;
    }

    // Find team by ID
    const team = await Team.findById(teamId).populate('members.user', 'name email');

    // Check if team exists
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    // Check if user is a member of the team
    const isMember = team.members.some((member) => member.user.toString() === userId);
    if (!isMember) {
      throw new ForbiddenError('You do not have permission to access this team');
    }

    // Format members data
    const members = team.members.map((member) => ({
      id: member._id,
      user: member.user,
      role: member.role,
      joinedAt: member.joinedAt,
    }));

    // Cache members
    cache.set(cacheKey, members, 300); // Cache for 5 minutes

    return members;
  } catch (error) {
    logger.error(`Error getting members for team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Leave a team
 * @param teamId Team ID
 * @param userId User ID
 * @returns Success message
 */
export const leaveTeam = async (teamId: string, userId: string): Promise<{ message: string }> => {
  const timer = startTimer('teamService.leaveTeam');

  try {
    // Find team by ID
    const team = await Team.findById(teamId);

    // Check if team exists
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    // Check if user is a member of the team
    const memberIndex = team.members.findIndex((member) => member.user.toString() === userId);
    if (memberIndex === -1) {
      throw new NotFoundError('You are not a member of this team');
    }

    // Check if user is the owner
    if (team.members[memberIndex].role === TeamRole.OWNER) {
      throw new ForbiddenError(
        'The team owner cannot leave the team. Transfer ownership or delete the team instead.',
      );
    }

    // Get user info for activity log
    const user = await User.findById(userId).select('name email');

    // Remove user from team
    team.members.splice(memberIndex, 1);
    await team.save();

    // Create activity log
    await createActivity({
      type: ActivityType.TEAM_MEMBER_REMOVED,
      user: userId,
      team: team._id,
      data: {
        teamName: team.name,
        memberName: user?.name,
        memberEmail: user?.email,
        action: 'left',
      },
    });

    // Invalidate cache
    cache.del(`team:${teamId}`);
    cache.delByPattern(`teamMembers:${teamId}`);
    cache.delByPattern(`userTeams:${userId}`);

    return {
      message: 'You have left the team successfully',
    };
  } catch (error) {
    logger.error(`Error leaving team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Transfer team ownership
 * @param teamId Team ID
 * @param userId Current owner ID
 * @param newOwnerId New owner ID
 * @returns Updated team
 */
export const transferTeamOwnership = async (
  teamId: string,
  userId: string,
  newOwnerId: string,
): Promise<ITeam> => {
  const timer = startTimer('teamService.transferTeamOwnership');

  try {
    // Find team by ID
    const team = await Team.findById(teamId);

    // Check if team exists
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    // Check if user is the owner of the team
    const currentOwnerIndex = team.members.findIndex(
      (member) => member.user.toString() === userId && member.role === TeamRole.OWNER,
    );
    if (currentOwnerIndex === -1) {
      throw new ForbiddenError('Only the team owner can transfer ownership');
    }

    // Find the new owner in the team members
    const newOwnerIndex = team.members.findIndex((member) => member.user.toString() === newOwnerId);
    if (newOwnerIndex === -1) {
      throw new NotFoundError('New owner must be a member of the team');
    }

    // Get user info for activity log
    const newOwnerUser = await User.findById(newOwnerId).select('name email');

    // Update roles
    team.members[currentOwnerIndex].role = TeamRole.ADMIN;
    team.members[newOwnerIndex].role = TeamRole.OWNER;

    await team.save();

    // Create activity log
    await createActivity({
      type: ActivityType.TEAM_UPDATED,
      user: userId,
      team: team._id,
      data: {
        teamName: team.name,
        action: 'ownership_transferred',
        newOwnerName: newOwnerUser?.name,
        newOwnerEmail: newOwnerUser?.email,
      },
    });

    // Invalidate cache
    cache.del(`team:${teamId}`);
    cache.delByPattern(`teamMembers:${teamId}`);
    cache.delByPattern(`userTeams:*`);

    return team;
  } catch (error) {
    logger.error(`Error transferring ownership of team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get team statistics
 * @param teamId Team ID
 * @param userId User ID
 * @returns Team statistics
 */
export const getTeamStatistics = async (teamId: string, userId: string): Promise<any> => {
  const timer = startTimer('teamService.getTeamStatistics');

  try {
    // Check if team exists and user is a member
    const team = await getTeamById(teamId, userId);

    // Get team members
    const members = team.members.map((member) => member.user);

    // Get member count by role
    const memberCountByRole = team.members.reduce(
      (acc, member) => {
        const role = member.role as string;
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Get active projects count
    const projectCount = await mongoose.model('Project').countDocuments({
      team: teamId,
    });

    // Get active tasks count
    const taskCount = await mongoose.model('Task').countDocuments({
      team: teamId,
      status: { $ne: 'done' },
    });

    // Get completed tasks count
    const completedTaskCount = await mongoose.model('Task').countDocuments({
      team: teamId,
      status: 'done',
    });

    // Get recent activities
    const recentActivities = await mongoose
      .model('Activity')
      .find({ team: teamId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'name email');

    return {
      team: {
        id: team._id,
        name: team.name,
        description: team.description,
        memberCount: team.members.length,
      },
      memberCountByRole,
      projectCount,
      taskCount,
      completedTaskCount,
      completionRate:
        taskCount + completedTaskCount > 0
          ? (completedTaskCount / (taskCount + completedTaskCount)) * 100
          : 0,
      recentActivities,
    };
  } catch (error) {
    logger.error(`Error getting statistics for team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Search for team members
 * @param teamId Team ID
 * @param userId User ID
 * @param query Search query
 * @returns Matching team members
 */
export const searchTeamMembers = async (
  teamId: string,
  userId: string,
  query: string,
): Promise<any[]> => {
  const timer = startTimer('teamService.searchTeamMembers');

  try {
    // Check if team exists and user is a member
    await getTeamById(teamId, userId);

    // Find team members matching the query
    const team = await Team.findById(teamId).populate({
      path: 'members.user',
      match: {
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
        ],
      },
      select: 'name email',
    });

    if (!team) {
      throw new NotFoundError('Team not found');
    }

    // Filter out members with null user (didn't match the query)
    const members = team.members
      .filter((member) => member.user)
      .map((member) => ({
        id: member._id,
        user: member.user,
        role: member.role,
        joinedAt: member.joinedAt,
      }));

    return members;
  } catch (error) {
    logger.error(`Error searching members in team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get teams by user role
 * @param userId User ID
 * @param role Team role
 * @returns Teams where user has the specified role
 */
export const getTeamsByUserRole = async (userId: string, role: TeamRole): Promise<ITeam[]> => {
  const timer = startTimer('teamService.getTeamsByUserRole');

  try {
    // Try to get from cache
    const cacheKey = `userTeams:${userId}:role:${role}`;
    const cachedTeams = cache.get<ITeam[]>(cacheKey);
    if (cachedTeams) {
      return cachedTeams;
    }

    // Find teams where user has the specified role
    const teams = await Team.find({
      members: {
        $elemMatch: {
          user: userId,
          role,
        },
      },
    });

    // Cache teams
    cache.set(cacheKey, teams, 300); // Cache for 5 minutes

    return teams;
  } catch (error) {
    logger.error(`Error getting teams for user ${userId} with role ${role}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Check if user is team member
 * @param teamId Team ID
 * @param userId User ID
 * @returns Whether user is a team member
 */
export const isTeamMember = async (teamId: string, userId: string): Promise<boolean> => {
  const timer = startTimer('teamService.isTeamMember');

  try {
    const team = await Team.findOne({
      _id: teamId,
      'members.user': userId,
    });

    return !!team;
  } catch (error) {
    logger.error(`Error checking if user ${userId} is member of team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Check if user has team role
 * @param teamId Team ID
 * @param userId User ID
 * @param roles Roles to check
 * @returns Whether user has any of the specified roles
 */
export const hasTeamRole = async (
  teamId: string,
  userId: string,
  roles: TeamRole[],
): Promise<boolean> => {
  const timer = startTimer('teamService.hasTeamRole');

  try {
    const team = await Team.findOne({
      _id: teamId,
      members: {
        $elemMatch: {
          user: userId,
          role: { $in: roles },
        },
      },
    });

    return !!team;
  } catch (error) {
    logger.error(`Error checking if user ${userId} has roles ${roles} in team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get user's role in team
 * @param teamId Team ID
 * @param userId User ID
 * @returns User's role in the team or null if not a member
 */
export const getUserTeamRole = async (teamId: string, userId: string): Promise<TeamRole | null> => {
  const timer = startTimer('teamService.getUserTeamRole');

  try {
    const team = await Team.findById(teamId);

    if (!team) {
      throw new NotFoundError('Team not found');
    }

    const member = team.members.find((m) => m.user.toString() === userId);

    return member ? member.role : null;
  } catch (error) {
    logger.error(`Error getting role for user ${userId} in team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};
