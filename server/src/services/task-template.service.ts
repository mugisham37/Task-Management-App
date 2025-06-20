import { Types } from 'mongoose';
import TaskTemplate, { type ITaskTemplate } from '../models/task-template.model';
import Project from '../models/project.model';
import Workspace from '../models/workspace.model';
import Team from '../models/team.model';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/app-error';
import { APIFeatures } from '../utils/api-features';
import * as activityService from './activity.service';
import * as taskService from './task.service';
import { ActivityType } from '../models/activity.model';
import logger from '../config/logger';
import * as cache from '../utils/cache';
import { startTimer } from '../utils/performance-monitor';

/**
 * Create a new task template
 * @param userId User ID
 * @param templateData Task template data
 * @returns Newly created task template
 */
export const createTaskTemplate = async (
  userId: string,
  templateData: Partial<ITaskTemplate>,
): Promise<ITaskTemplate> => {
  const timer = startTimer('taskTemplateService.createTaskTemplate');

  try {
    // Validate project if specified
    if (templateData.project) {
      const project = await Project.findById(templateData.project);
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Check if project belongs to user
      if (project.user && project.user.toString() !== userId) {
        throw new ForbiddenError('You do not have permission to use this project');
      }
    }

    // Validate workspace if specified
    if (templateData.workspace) {
      const workspace = await Workspace.findById(templateData.workspace);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      // Check if workspace belongs to user or user is a member of the team
      if (workspace.owner.toString() !== userId) {
        if (workspace.team) {
          const team = await Team.findById(workspace.team);
          if (!team || !team.members.some((member) => member.user.toString() === userId)) {
            throw new ForbiddenError('You do not have permission to use this workspace');
          }
        } else {
          throw new ForbiddenError('You do not have permission to use this workspace');
        }
      }
    }

    // Validate team if specified
    if (templateData.team) {
      const team = await Team.findById(templateData.team);
      if (!team) {
        throw new NotFoundError('Team not found');
      }

      // Check if user is a member of the team
      if (!team.members.some((member) => member.user.toString() === userId)) {
        throw new ForbiddenError('You do not have permission to use this team');
      }
    }

    // Set user ID
    templateData.user = new Types.ObjectId(userId);

    // Create task template
    const taskTemplate = await TaskTemplate.create(templateData);

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_CREATED,
      project: templateData.project as Types.ObjectId,
      workspace: templateData.workspace as Types.ObjectId,
      team: templateData.team as Types.ObjectId,
      data: {
        templateName: taskTemplate.name,
        isTemplate: true,
        isPublic: taskTemplate.isPublic,
      },
    });

    return taskTemplate;
  } catch (error) {
    logger.error(`Error creating task template:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get all task templates for a user
 * @param userId User ID
 * @param queryParams Query parameters
 * @returns Task templates and pagination metadata
 */
export const getTaskTemplates = async (
  userId: string,
  queryParams: Record<string, any> = {},
): Promise<{
  data: ITaskTemplate[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('taskTemplateService.getTaskTemplates');

  try {
    // Create base query for user's task templates and public templates
    const query = TaskTemplate.find({
      $or: [{ user: userId }, { isPublic: true }],
    });

    // Filter by project if specified
    if (queryParams.project) {
      if (queryParams.project === 'none') {
        // Find task templates with no project
        query.find({ project: { $exists: false } });
      } else {
        // Find task templates with the specified project
        query.find({ project: queryParams.project });
      }
    }

    // Filter by workspace if specified
    if (queryParams.workspace) {
      if (queryParams.workspace === 'none') {
        // Find task templates with no workspace
        query.find({ workspace: { $exists: false } });
      } else {
        // Find task templates with the specified workspace
        query.find({ workspace: queryParams.workspace });
      }
    }

    // Filter by team if specified
    if (queryParams.team) {
      if (queryParams.team === 'none') {
        // Find task templates with no team
        query.find({ team: { $exists: false } });
      } else {
        // Find task templates with the specified team
        query.find({ team: queryParams.team });
      }
    }

    // Filter by public status if specified
    if (queryParams.isPublic !== undefined) {
      query.find({ isPublic: queryParams.isPublic === 'true' });
    }

    // Filter by ownership if specified
    if (queryParams.ownership === 'mine') {
      query.find({ user: userId });
    } else if (queryParams.ownership === 'public') {
      query.find({ isPublic: true });
    }

    // Apply API features (filtering, sorting, pagination)
    const features = new APIFeatures(query, queryParams)
      .filter()
      .search(['name', 'description', 'taskData.title', 'taskData.description'])
      .sort()
      .limitFields()
      .paginate();

    // Execute query with pagination metadata
    return await features.execute();
  } catch (error) {
    logger.error(`Error getting task templates for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get a task template by ID
 * @param templateId Task template ID
 * @param userId User ID
 * @returns Task template
 */
export const getTaskTemplateById = async (
  templateId: string,
  userId: string,
): Promise<ITaskTemplate> => {
  const timer = startTimer('taskTemplateService.getTaskTemplateById');

  try {
    // Try to get from cache
    const cacheKey = `taskTemplate:${templateId}`;
    const cachedTemplate = cache.get<ITaskTemplate>(cacheKey);
    if (cachedTemplate) {
      return cachedTemplate;
    }

    // Find task template by ID
    const taskTemplate = await TaskTemplate.findById(templateId)
      .populate('project', 'name color')
      .populate('workspace', 'name')
      .populate('team', 'name');

    // Check if task template exists
    if (!taskTemplate) {
      throw new NotFoundError('Task template not found');
    }

    // Check if task template belongs to user or is public
    if (taskTemplate.user.toString() !== userId && !taskTemplate.isPublic) {
      throw new ForbiddenError('You do not have permission to access this task template');
    }

    // Cache task template
    cache.set(cacheKey, taskTemplate, 300); // Cache for 5 minutes

    return taskTemplate;
  } catch (error) {
    logger.error(`Error getting task template ${templateId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Update a task template
 * @param templateId Task template ID
 * @param userId User ID
 * @param updateData Update data
 * @returns Updated task template
 */
export const updateTaskTemplate = async (
  templateId: string,
  userId: string,
  updateData: Partial<ITaskTemplate>,
): Promise<ITaskTemplate> => {
  const timer = startTimer('taskTemplateService.updateTaskTemplate');

  try {
    // Find task template by ID
    const taskTemplate = await TaskTemplate.findById(templateId);

    // Check if task template exists
    if (!taskTemplate) {
      throw new NotFoundError('Task template not found');
    }

    // Check if task template belongs to user
    if (taskTemplate.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to update this task template');
    }

    // Validate project if specified
    if (updateData.project) {
      const project = await Project.findById(updateData.project);
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Check if project belongs to user
      if (project.user && project.user.toString() !== userId) {
        throw new ForbiddenError('You do not have permission to use this project');
      }
    }

    // Validate workspace if specified
    if (updateData.workspace) {
      const workspace = await Workspace.findById(updateData.workspace);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      // Check if workspace belongs to user or user is a member of the team
      if (workspace.owner.toString() !== userId) {
        if (workspace.team) {
          const team = await Team.findById(workspace.team);
          if (!team || !team.members.some((member) => member.user.toString() === userId)) {
            throw new ForbiddenError('You do not have permission to use this workspace');
          }
        } else {
          throw new ForbiddenError('You do not have permission to use this workspace');
        }
      }
    }

    // Validate team if specified
    if (updateData.team) {
      const team = await Team.findById(updateData.team);
      if (!team) {
        throw new NotFoundError('Team not found');
      }

      // Check if user is a member of the team
      if (!team.members.some((member) => member.user.toString() === userId)) {
        throw new ForbiddenError('You do not have permission to use this team');
      }
    }

    // Update task template
    Object.assign(taskTemplate, updateData);
    await taskTemplate.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_UPDATED,
      project: taskTemplate.project,
      workspace: taskTemplate.workspace,
      team: taskTemplate.team,
      data: {
        templateName: taskTemplate.name,
        isTemplate: true,
        updates: Object.keys(updateData),
      },
    });

    // Invalidate cache
    cache.del(`taskTemplate:${templateId}`);

    return taskTemplate;
  } catch (error) {
    logger.error(`Error updating task template ${templateId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Delete a task template
 * @param templateId Task template ID
 * @param userId User ID
 * @returns Success message
 */
export const deleteTaskTemplate = async (
  templateId: string,
  userId: string,
): Promise<{ message: string }> => {
  const timer = startTimer('taskTemplateService.deleteTaskTemplate');

  try {
    // Find task template by ID
    const taskTemplate = await TaskTemplate.findById(templateId);

    // Check if task template exists
    if (!taskTemplate) {
      throw new NotFoundError('Task template not found');
    }

    // Check if task template belongs to user
    if (taskTemplate.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to delete this task template');
    }

    // Get template details for activity log
    const templateName = taskTemplate.name;
    const projectId = taskTemplate.project;
    const workspaceId = taskTemplate.workspace;
    const teamId = taskTemplate.team;

    // Delete task template
    await taskTemplate.deleteOne();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_DELETED,
      project: projectId,
      workspace: workspaceId,
      team: teamId,
      data: {
        templateName,
        isTemplate: true,
      },
    });

    // Invalidate cache
    cache.del(`taskTemplate:${templateId}`);

    return {
      message: 'Task template deleted successfully',
    };
  } catch (error) {
    logger.error(`Error deleting task template ${templateId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Create a task from a template
 * @param templateId Task template ID
 * @param userId User ID
 * @param options Options for creating the task
 * @returns Created task
 */
export const createTaskFromTemplate = async (
  templateId: string,
  userId: string,
  options: {
    project?: string;
    dueDate?: Date;
    assignedTo?: string;
    title?: string;
    description?: string;
    priority?: string;
    tags?: string[];
  } = {},
): Promise<any> => {
  const timer = startTimer('taskTemplateService.createTaskFromTemplate');

  try {
    // Find task template by ID
    const taskTemplate = await TaskTemplate.findById(templateId);

    // Check if task template exists
    if (!taskTemplate) {
      throw new NotFoundError('Task template not found');
    }

    // Check if task template belongs to user or is public
    if (taskTemplate.user.toString() !== userId && !taskTemplate.isPublic) {
      throw new ForbiddenError('You do not have permission to use this task template');
    }

    // Create task data from the template
    const taskData = {
      ...taskTemplate.taskData,
      title: options.title || taskTemplate.taskData.title,
      description: options.description || taskTemplate.taskData.description,
      priority: options.priority || taskTemplate.taskData.priority,
      project: options.project || taskTemplate.project,
      dueDate: options.dueDate,
      assignedTo: options.assignedTo,
      tags: [...(taskTemplate.taskData.tags || []), ...(options.tags || []), 'from-template'],
    };

    // Create the task
    const task = await taskService.createTask(userId, taskData);

    // Increment usage count
    taskTemplate.usageCount += 1;
    await taskTemplate.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_CREATED,
      project: task.project,
      task: task._id,
      data: {
        taskTitle: task.title,
        fromTemplate: true,
        templateName: taskTemplate.name,
      },
    });

    return task;
  } catch (error) {
    logger.error(`Error creating task from template ${templateId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Toggle task template public status
 * @param templateId Task template ID
 * @param userId User ID
 * @param isPublic Public status
 * @returns Updated task template
 */
export const toggleTaskTemplatePublic = async (
  templateId: string,
  userId: string,
  isPublic: boolean,
): Promise<ITaskTemplate> => {
  const timer = startTimer('taskTemplateService.toggleTaskTemplatePublic');

  try {
    // Find task template by ID
    const taskTemplate = await TaskTemplate.findById(templateId);

    // Check if task template exists
    if (!taskTemplate) {
      throw new NotFoundError('Task template not found');
    }

    // Check if task template belongs to user
    if (taskTemplate.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to update this task template');
    }

    // Update public status
    taskTemplate.isPublic = isPublic;
    await taskTemplate.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_UPDATED,
      project: taskTemplate.project,
      workspace: taskTemplate.workspace,
      team: taskTemplate.team,
      data: {
        templateName: taskTemplate.name,
        isTemplate: true,
        updates: ['isPublic'],
        isPublic,
      },
    });

    // Invalidate cache
    cache.del(`taskTemplate:${templateId}`);

    return taskTemplate;
  } catch (error) {
    logger.error(`Error toggling task template public status ${templateId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get popular task templates
 * @param userId User ID
 * @param limit Number of templates to return
 * @returns Popular task templates
 */
export const getPopularTaskTemplates = async (
  userId: string,
  limit: number = 5,
): Promise<ITaskTemplate[]> => {
  const timer = startTimer('taskTemplateService.getPopularTaskTemplates');

  try {
    // Try to get from cache
    const cacheKey = `popularTaskTemplates:${userId}:${limit}`;
    const cachedTemplates = cache.get<ITaskTemplate[]>(cacheKey);
    if (cachedTemplates) {
      return cachedTemplates;
    }

    // Find popular task templates (user's templates and public templates)
    const templates = await TaskTemplate.find({
      $or: [{ user: userId }, { isPublic: true }],
    })
      .sort({ usageCount: -1 })
      .limit(limit)
      .populate('project', 'name color')
      .populate('workspace', 'name')
      .populate('team', 'name');

    // Cache templates
    cache.set(cacheKey, templates, 300); // Cache for 5 minutes

    return templates;
  } catch (error) {
    logger.error(`Error getting popular task templates for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Clone a task template
 * @param templateId Task template ID
 * @param userId User ID
 * @param options Clone options
 * @returns Cloned task template
 */
export const cloneTaskTemplate = async (
  templateId: string,
  userId: string,
  options: {
    name?: string;
    isPublic?: boolean;
    project?: string;
    workspace?: string;
    team?: string;
  } = {},
): Promise<ITaskTemplate> => {
  const timer = startTimer('taskTemplateService.cloneTaskTemplate');

  try {
    // Find task template by ID
    const sourceTemplate = await TaskTemplate.findById(templateId);

    // Check if task template exists
    if (!sourceTemplate) {
      throw new NotFoundError('Task template not found');
    }

    // Check if task template belongs to user or is public
    if (sourceTemplate.user.toString() !== userId && !sourceTemplate.isPublic) {
      throw new ForbiddenError('You do not have permission to clone this task template');
    }

    // Create new template data
    const newTemplateData = {
      name: options.name || `Copy of ${sourceTemplate.name}`,
      description: sourceTemplate.description,
      user: new Types.ObjectId(userId),
      project: options.project ? new Types.ObjectId(options.project) : sourceTemplate.project,
      workspace: options.workspace
        ? new Types.ObjectId(options.workspace)
        : sourceTemplate.workspace,
      team: options.team ? new Types.ObjectId(options.team) : sourceTemplate.team,
      isPublic: options.isPublic !== undefined ? options.isPublic : false,
      taskData: { ...sourceTemplate.taskData },
    };

    // Create new task template
    const newTemplate = await TaskTemplate.create(newTemplateData);

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_CREATED,
      project: newTemplate.project,
      workspace: newTemplate.workspace,
      team: newTemplate.team,
      data: {
        templateName: newTemplate.name,
        isTemplate: true,
        clonedFrom: sourceTemplate.name,
        sourceTemplateId: sourceTemplate._id.toString(),
      },
    });

    return newTemplate;
  } catch (error) {
    logger.error(`Error cloning task template ${templateId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Check if user has access to a workspace
 * @param workspaceId Workspace ID
 * @param userId User ID
 * @returns Whether user has access to the workspace
 */
export const checkWorkspaceAccess = async (
  workspaceId: string,
  userId: string,
): Promise<boolean> => {
  // Find workspace by ID
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return false;
  }

  // Check if workspace belongs to user
  if (workspace.owner.toString() === userId) {
    return true;
  }

  // Check if workspace belongs to a team and user is a member
  if (workspace.team) {
    const team = await Team.findById(workspace.team);
    if (team && team.members.some((member) => member.user.toString() === userId)) {
      return true;
    }
  }

  return false;
};

/**
 * Check if user is a member of a team
 * @param teamId Team ID
 * @param userId User ID
 * @returns Whether user is a member of the team
 */
export const checkTeamMembership = async (teamId: string, userId: string): Promise<boolean> => {
  // Find team by ID
  const team = await Team.findById(teamId);
  if (!team) {
    return false;
  }

  // Check if user is a member of the team
  return team.members.some((member) => member.user.toString() === userId);
};
