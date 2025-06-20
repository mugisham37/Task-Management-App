import mongoose from 'mongoose';
import Workspace, { type IWorkspace } from '../models/workspace.model';
import Team, { TeamRole } from '../models/team.model';
import Project from '../models/project.model';
import Task from '../models/task.model';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/app-error';
import { APIFeatures } from '../utils/api-features';
import { createActivity } from './activity.service';
import { ActivityType } from '../models/activity.model';
import * as cache from '../utils/cache';
import { startTimer } from '../utils/performance-monitor';
import logger from '../config/logger';

/**
 * Create a new workspace
 * @param userId User ID
 * @param workspaceData Workspace data
 * @returns Newly created workspace
 */
export const createWorkspace = async (
  userId: string,
  workspaceData: Partial<IWorkspace>,
): Promise<IWorkspace> => {
  const timer = startTimer('workspaceService.createWorkspace');

  try {
    // If team is provided, check if user is a member of the team
    if (workspaceData.team) {
      const team = await Team.findById(workspaceData.team);
      if (!team) {
        throw new NotFoundError('Team not found');
      }

      const isMember = team.members.some((member) => member.user.toString() === userId);
      if (!isMember) {
        throw new ForbiddenError('You do not have permission to create a workspace for this team');
      }

      // Check if user has admin or owner role in the team
      const userRole = team.members.find((member) => member.user.toString() === userId)?.role;
      if (![TeamRole.ADMIN, TeamRole.OWNER].includes(userRole as TeamRole)) {
        throw new ForbiddenError('Only team administrators and owners can create team workspaces');
      }
    }

    // Create workspace
    const workspace = await Workspace.create({
      ...workspaceData,
      owner: userId,
    });

    // Create activity log
    await createActivity({
      type: ActivityType.WORKSPACE_CREATED,
      user: userId,
      workspace: workspace._id,
      team: workspaceData.team,
      data: {
        workspaceName: workspace.name,
        isPersonal: workspace.isPersonal,
      },
    });

    // Invalidate cache
    cache.delByPattern(`userWorkspaces:${userId}`);
    if (workspaceData.team) {
      cache.delByPattern(`teamWorkspaces:${workspaceData.team}`);
    }

    return workspace;
  } catch (error) {
    logger.error('Error creating workspace:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get all workspaces for a user
 * @param userId User ID
 * @param queryParams Query parameters for filtering, sorting, and pagination
 * @returns Workspaces and pagination metadata
 */
export const getWorkspaces = async (
  userId: string,
  queryParams: Record<string, any>,
): Promise<{
  data: IWorkspace[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('workspaceService.getWorkspaces');

  try {
    // Try to get from cache if no filters are applied
    const hasFilters = Object.keys(queryParams).some(
      (key) => !['page', 'limit', 'sort'].includes(key),
    );
    const cacheKey = `userWorkspaces:${userId}:${JSON.stringify(queryParams)}`;

    if (!hasFilters) {
      const cachedWorkspaces = cache.get(cacheKey);
      if (cachedWorkspaces) {
        return cachedWorkspaces;
      }
    }

    // Get teams the user is a member of
    const userTeams = await Team.find({ 'members.user': userId }).select('_id');
    const teamIds = userTeams.map((team) => team._id);

    // Find workspaces where user is the owner or is a member of the team
    const query = Workspace.find({
      $or: [{ owner: userId }, { team: { $in: teamIds } }],
    });

    // Filter by personal workspaces if specified
    if (queryParams.isPersonal !== undefined) {
      query.find({ isPersonal: queryParams.isPersonal === 'true' });
    }

    // Filter by team if specified
    if (queryParams.team) {
      query.find({ team: queryParams.team });
    }

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
    logger.error(`Error getting workspaces for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get a workspace by ID
 * @param workspaceId Workspace ID
 * @param userId User ID
 * @returns Workspace
 */
export const getWorkspaceById = async (
  workspaceId: string,
  userId: string,
): Promise<IWorkspace> => {
  const timer = startTimer('workspaceService.getWorkspaceById');

  try {
    // Try to get from cache
    const cacheKey = `workspace:${workspaceId}`;
    const cachedWorkspace = cache.get<IWorkspace>(cacheKey);
    if (cachedWorkspace) {
      // Check if user has access to the workspace
      if (cachedWorkspace.owner.toString() === userId) {
        return cachedWorkspace;
      } else if (cachedWorkspace.team) {
        // Check if user is a member of the team
        const team = await Team.findById(cachedWorkspace.team);
        if (!team) {
          throw new NotFoundError('Team not found');
        }

        const isMember = team.members.some((member) => member.user.toString() === userId);
        if (!isMember) {
          throw new ForbiddenError('You do not have permission to access this workspace');
        }

        return cachedWorkspace;
      } else {
        throw new ForbiddenError('You do not have permission to access this workspace');
      }
    }

    // Find workspace by ID
    const workspace = await Workspace.findById(workspaceId).populate('team', 'name');

    // Check if workspace exists
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    // Check if user has access to the workspace
    if (workspace.owner.toString() === userId) {
      // User is the owner
    } else if (workspace.team) {
      // Check if user is a member of the team
      const team = await Team.findById(workspace.team);
      if (!team) {
        throw new NotFoundError('Team not found');
      }

      const isMember = team.members.some((member) => member.user.toString() === userId);
      if (!isMember) {
        throw new ForbiddenError('You do not have permission to access this workspace');
      }
    } else {
      throw new ForbiddenError('You do not have permission to access this workspace');
    }

    // Cache workspace
    cache.set(cacheKey, workspace, 300); // Cache for 5 minutes

    return workspace;
  } catch (error) {
    logger.error(`Error getting workspace ${workspaceId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Update a workspace
 * @param workspaceId Workspace ID
 * @param userId User ID
 * @param updateData Update data
 * @returns Updated workspace
 */
export const updateWorkspace = async (
  workspaceId: string,
  userId: string,
  updateData: Partial<IWorkspace>,
): Promise<IWorkspace> => {
  const timer = startTimer('workspaceService.updateWorkspace');

  try {
    // Find workspace by ID
    const workspace = await Workspace.findById(workspaceId);

    // Check if workspace exists
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    // Check if user has permission to update the workspace
    if (workspace.owner.toString() === userId) {
      // User is the owner
    } else if (workspace.team) {
      // Check if user is an admin or owner of the team
      const team = await Team.findById(workspace.team);
      if (!team) {
        throw new NotFoundError('Team not found');
      }

      const userMember = team.members.find((member) => member.user.toString() === userId);
      if (!userMember || ![TeamRole.ADMIN, TeamRole.OWNER].includes(userMember.role as TeamRole)) {
        throw new ForbiddenError('You do not have permission to update this workspace');
      }
    } else {
      throw new ForbiddenError('You do not have permission to update this workspace');
    }

    // Prevent changing the owner or team
    delete updateData.owner;
    delete updateData.team;

    // Update workspace
    Object.assign(workspace, updateData);
    await workspace.save();

    // Create activity log
    await createActivity({
      type: ActivityType.WORKSPACE_UPDATED,
      user: userId,
      workspace: workspace._id,
      team: workspace.team,
      data: {
        workspaceName: workspace.name,
        updates: Object.keys(updateData),
      },
    });

    // Invalidate cache
    cache.del(`workspace:${workspaceId}`);
    cache.delByPattern(`userWorkspaces:${userId}`);
    if (workspace.team) {
      cache.delByPattern(`teamWorkspaces:${workspace.team}`);
    }

    return workspace;
  } catch (error) {
    logger.error(`Error updating workspace ${workspaceId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Delete a workspace
 * @param workspaceId Workspace ID
 * @param userId User ID
 * @returns Success message
 */
export const deleteWorkspace = async (
  workspaceId: string,
  userId: string,
): Promise<{ message: string }> => {
  const timer = startTimer('workspaceService.deleteWorkspace');

  try {
    // Find workspace by ID
    const workspace = await Workspace.findById(workspaceId);

    // Check if workspace exists
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    // Check if user has permission to delete the workspace
    if (workspace.owner.toString() === userId) {
      // User is the owner
    } else if (workspace.team) {
      // Check if user is an admin or owner of the team
      const team = await Team.findById(workspace.team);
      if (!team) {
        throw new NotFoundError('Team not found');
      }

      const userMember = team.members.find((member) => member.user.toString() === userId);
      if (!userMember || ![TeamRole.ADMIN, TeamRole.OWNER].includes(userMember.role as TeamRole)) {
        throw new ForbiddenError('You do not have permission to delete this workspace');
      }
    } else {
      throw new ForbiddenError('You do not have permission to delete this workspace');
    }

    // Get workspace info for activity log
    const workspaceName = workspace.name;
    const teamId = workspace.team;

    // Delete workspace
    await workspace.deleteOne();

    // Create activity log
    await createActivity({
      type: ActivityType.WORKSPACE_DELETED,
      user: userId,
      team: teamId,
      data: {
        workspaceName,
        workspaceId,
      },
    });

    // Invalidate cache
    cache.del(`workspace:${workspaceId}`);
    cache.delByPattern(`userWorkspaces:${userId}`);
    if (teamId) {
      cache.delByPattern(`teamWorkspaces:${teamId}`);
    }

    return {
      message: 'Workspace deleted successfully',
    };
  } catch (error) {
    logger.error(`Error deleting workspace ${workspaceId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get workspace projects
 * @param workspaceId Workspace ID
 * @param userId User ID
 * @param queryParams Query parameters for filtering, sorting, and pagination
 * @returns Projects and pagination metadata
 */
export const getWorkspaceProjects = async (
  workspaceId: string,
  userId: string,
  queryParams: Record<string, any>,
): Promise<{
  data: any[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('workspaceService.getWorkspaceProjects');

  try {
    // Check if user has access to the workspace
    await getWorkspaceById(workspaceId, userId);

    // Try to get from cache if no filters are applied
    const hasFilters = Object.keys(queryParams).some(
      (key) => !['page', 'limit', 'sort'].includes(key),
    );
    const cacheKey = `workspaceProjects:${workspaceId}:${JSON.stringify(queryParams)}`;

    if (!hasFilters) {
      const cachedProjects = cache.get(cacheKey);
      if (cachedProjects) {
        return cachedProjects;
      }
    }

    // Find projects associated with the workspace
    const query = Project.find({ workspace: workspaceId });

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
    logger.error(`Error getting projects for workspace ${workspaceId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get workspace tasks
 * @param workspaceId Workspace ID
 * @param userId User ID
 * @param queryParams Query parameters for filtering, sorting, and pagination
 * @returns Tasks and pagination metadata
 */
export const getWorkspaceTasks = async (
  workspaceId: string,
  userId: string,
  queryParams: Record<string, any>,
): Promise<{
  data: any[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('workspaceService.getWorkspaceTasks');

  try {
    // Check if user has access to the workspace
    await getWorkspaceById(workspaceId, userId);

    // Try to get from cache if no filters are applied
    const hasFilters = Object.keys(queryParams).some(
      (key) => !['page', 'limit', 'sort'].includes(key),
    );
    const cacheKey = `workspaceTasks:${workspaceId}:${JSON.stringify(queryParams)}`;

    if (!hasFilters) {
      const cachedTasks = cache.get(cacheKey);
      if (cachedTasks) {
        return cachedTasks;
      }
    }

    // Find projects associated with the workspace
    const projects = await Project.find({ workspace: workspaceId }).select('_id');
    const projectIds = projects.map((project) => project._id);

    // Find tasks associated with the workspace's projects
    const query = Task.find({ project: { $in: projectIds } });

    // Apply API features (filtering, sorting, pagination)
    const features = new APIFeatures(query, queryParams)
      .filter()
      .search(['title', 'description'])
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
    logger.error(`Error getting tasks for workspace ${workspaceId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Create a personal workspace for a user
 * @param userId User ID
 * @returns Created workspace
 */
export const createPersonalWorkspace = async (userId: string): Promise<IWorkspace> => {
  const timer = startTimer('workspaceService.createPersonalWorkspace');

  try {
    // Check if user already has a personal workspace
    const existingWorkspace = await Workspace.findOne({ owner: userId, isPersonal: true });
    if (existingWorkspace) {
      return existingWorkspace;
    }

    // Create personal workspace
    const workspace = await Workspace.create({
      name: 'Personal Workspace',
      description: 'Your personal workspace for tasks and projects',
      icon: 'user',
      color: '#4f46e5',
      isPersonal: true,
      owner: userId,
    });

    // Create activity log
    await createActivity({
      type: ActivityType.WORKSPACE_CREATED,
      user: userId,
      workspace: workspace._id,
      data: {
        workspaceName: workspace.name,
        isPersonal: true,
      },
    });

    // Invalidate cache
    cache.delByPattern(`userWorkspaces:${userId}`);

    return workspace;
  } catch (error) {
    logger.error(`Error creating personal workspace for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get team workspaces
 * @param teamId Team ID
 * @param userId User ID
 * @param queryParams Query parameters for filtering, sorting, and pagination
 * @returns Workspaces and pagination metadata
 */
export const getTeamWorkspaces = async (
  teamId: string,
  userId: string,
  queryParams: Record<string, any>,
): Promise<{
  data: IWorkspace[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('workspaceService.getTeamWorkspaces');

  try {
    // Check if user is a member of the team
    const team = await Team.findById(teamId);
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    const isMember = team.members.some((member) => member.user.toString() === userId);
    if (!isMember) {
      throw new ForbiddenError('You do not have permission to access this team');
    }

    // Try to get from cache if no filters are applied
    const hasFilters = Object.keys(queryParams).some(
      (key) => !['page', 'limit', 'sort'].includes(key),
    );
    const cacheKey = `teamWorkspaces:${teamId}:${JSON.stringify(queryParams)}`;

    if (!hasFilters) {
      const cachedWorkspaces = cache.get(cacheKey);
      if (cachedWorkspaces) {
        return cachedWorkspaces;
      }
    }

    // Find workspaces for the team
    const query = Workspace.find({ team: teamId });

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
    logger.error(`Error getting workspaces for team ${teamId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Add project to workspace
 * @param workspaceId Workspace ID
 * @param projectId Project ID
 * @param userId User ID
 * @returns Updated project
 */
export const addProjectToWorkspace = async (
  workspaceId: string,
  projectId: string,
  userId: string,
): Promise<any> => {
  const timer = startTimer('workspaceService.addProjectToWorkspace');

  try {
    // Check if user has access to the workspace
    const workspace = await getWorkspaceById(workspaceId, userId);

    // Check if project exists and belongs to the user
    const project = await Project.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    if (project.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to update this project');
    }

    // Update project with workspace
    project.workspace = workspace._id;
    await project.save();

    // Create activity log
    await createActivity({
      type: ActivityType.PROJECT_UPDATED,
      user: userId,
      project: project._id,
      workspace: workspace._id,
      data: {
        projectName: project.name,
        workspaceName: workspace.name,
        action: 'added_to_workspace',
      },
    });

    // Invalidate cache
    cache.delByPattern(`workspaceProjects:${workspaceId}`);
    cache.delByPattern(`project:${projectId}`);

    return project;
  } catch (error) {
    logger.error(`Error adding project ${projectId} to workspace ${workspaceId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Remove project from workspace
 * @param workspaceId Workspace ID
 * @param projectId Project ID
 * @param userId User ID
 * @returns Updated project
 */
export const removeProjectFromWorkspace = async (
  workspaceId: string,
  projectId: string,
  userId: string,
): Promise<any> => {
  const timer = startTimer('workspaceService.removeProjectFromWorkspace');

  try {
    // Check if user has access to the workspace
    const workspace = await getWorkspaceById(workspaceId, userId);

    // Check if project exists, belongs to the user, and is in the workspace
    const project = await Project.findOne({
      _id: projectId,
      user: userId,
      workspace: workspaceId,
    });

    if (!project) {
      throw new NotFoundError('Project not found in this workspace');
    }

    // Remove workspace from project
    project.workspace = undefined;
    await project.save();

    // Create activity log
    await createActivity({
      type: ActivityType.PROJECT_UPDATED,
      user: userId,
      project: project._id,
      workspace: workspace._id,
      data: {
        projectName: project.name,
        workspaceName: workspace.name,
        action: 'removed_from_workspace',
      },
    });

    // Invalidate cache
    cache.delByPattern(`workspaceProjects:${workspaceId}`);
    cache.delByPattern(`project:${projectId}`);

    return project;
  } catch (error) {
    logger.error(`Error removing project ${projectId} from workspace ${workspaceId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get workspace statistics
 * @param workspaceId Workspace ID
 * @param userId User ID
 * @returns Workspace statistics
 */
export const getWorkspaceStatistics = async (workspaceId: string, userId: string): Promise<any> => {
  const timer = startTimer('workspaceService.getWorkspaceStatistics');

  try {
    // Check if user has access to the workspace
    const workspace = await getWorkspaceById(workspaceId, userId);

    // Try to get from cache
    const cacheKey = `workspaceStats:${workspaceId}`;
    const cachedStats = cache.get(cacheKey);
    if (cachedStats) {
      return cachedStats;
    }

    // Find projects associated with the workspace
    const projects = await Project.find({ workspace: workspaceId });
    const projectIds = projects.map((project) => project._id);

    // Get project count
    const projectCount = projects.length;

    // Get task counts
    const taskCount = await Task.countDocuments({
      project: { $in: projectIds },
    });

    // Get task counts by status
    const tasksByStatus = await Task.aggregate([
      {
        $match: {
          project: { $in: projectIds.map((id) => new mongoose.Types.ObjectId(id.toString())) },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get task counts by priority
    const tasksByPriority = await Task.aggregate([
      {
        $match: {
          project: { $in: projectIds.map((id) => new mongoose.Types.ObjectId(id.toString())) },
        },
      },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get recent activities
    const recentActivities = await mongoose
      .model('Activity')
      .find({ workspace: workspaceId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'name email');

    // Format statistics
    const statistics = {
      workspace: {
        id: workspace._id,
        name: workspace.name,
        description: workspace.description,
        isPersonal: workspace.isPersonal,
      },
      projectCount,
      taskCount,
      tasksByStatus: tasksByStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      tasksByPriority: tasksByPriority.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      projects: projects.map((project) => ({
        id: project._id,
        name: project.name,
        description: project.description,
      })),
      recentActivities,
    };

    // Cache statistics
    cache.set(cacheKey, statistics, 300); // Cache for 5 minutes

    return statistics;
  } catch (error) {
    logger.error(`Error getting statistics for workspace ${workspaceId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Search workspaces
 * @param userId User ID
 * @param query Search query
 * @returns Matching workspaces
 */
export const searchWorkspaces = async (userId: string, query: string): Promise<IWorkspace[]> => {
  const timer = startTimer('workspaceService.searchWorkspaces');

  try {
    // Get teams the user is a member of
    const userTeams = await Team.find({ 'members.user': userId }).select('_id');
    const teamIds = userTeams.map((team) => team._id);

    // Find workspaces matching the query where user is the owner or is a member of the team
    const workspaces = await Workspace.find({
      $and: [
        { $or: [{ owner: userId }, { team: { $in: teamIds } }] },
        {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
          ],
        },
      ],
    }).limit(10);

    return workspaces;
  } catch (error) {
    logger.error(`Error searching workspaces for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Check if user has workspace access
 * @param workspaceId Workspace ID
 * @param userId User ID
 * @returns Whether user has access to the workspace
 */
export const hasWorkspaceAccess = async (workspaceId: string, userId: string): Promise<boolean> => {
  const timer = startTimer('workspaceService.hasWorkspaceAccess');

  try {
    // Find workspace
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return false;
    }

    // Check if user is the owner
    if (workspace.owner.toString() === userId) {
      return true;
    }

    // Check if workspace belongs to a team and user is a member
    if (workspace.team) {
      const team = await Team.findById(workspace.team);
      if (!team) {
        return false;
      }

      return team.members.some((member) => member.user.toString() === userId);
    }

    return false;
  } catch (error) {
    logger.error(`Error checking workspace access for user ${userId}:`, error);
    return false;
  } finally {
    timer.end();
  }
};
