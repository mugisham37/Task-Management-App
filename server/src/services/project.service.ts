import mongoose from 'mongoose';
import Project, { type IProject } from '../models/project.model';
import Task from '../models/task.model';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/app-error';
import { APIFeatures } from '../utils/api-features';

// Define proper interface for query parameters
interface ProjectQueryParams {
  includeArchived?: string;
  search?: string;
  sort?: string;
  fields?: string;
  page?: string;
  limit?: string;
  [key: string]: string | undefined;
}

// Define interface for project statistics
interface ProjectStats {
  project: {
    id: string;
    name: string;
    description?: string;
    color?: string;
    isArchived: boolean;
  };
  stats: {
    total: number;
    completed: number;
    overdue: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    recentTasks: Array<{
      _id: string;
      title: string;
      status: string;
      priority: string;
      dueDate?: Date;
      createdAt: Date;
    }>;
  };
}

/**
 * Create a new project
 * @param userId User ID
 * @param projectData Project data
 * @returns Newly created project
 */
export const createProject = async (
  userId: string,
  projectData: Partial<IProject>,
): Promise<IProject> => {
  // Check if project with same name already exists for this user
  const existingProject = await Project.findOne({
    user: userId,
    name: projectData.name,
  });

  if (existingProject) {
    throw new ValidationError(`Project with name "${projectData.name}" already exists`);
  }

  // Create project with user ID
  const project = await Project.create({
    ...projectData,
    user: userId,
  });

  return project;
};

/**
 * Get all projects for a user with filtering, sorting, and pagination
 * @param userId User ID
 * @param queryParams Query parameters for filtering, sorting, and pagination
 * @returns Projects and pagination metadata
 */
export const getProjects = async (
  userId: string,
  queryParams: ProjectQueryParams,
): Promise<{
  data: IProject[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  // Create base query for user's projects
  const query = Project.find({ user: userId });

  // Handle archived projects
  if (queryParams.includeArchived !== 'true') {
    query.find({ isArchived: false });
  }

  // Apply API features (filtering, sorting, pagination)
  const features = new APIFeatures(query, queryParams)
    .filter()
    .search(['name', 'description'])
    .sort()
    .limitFields()
    .paginate();

  // Execute query with pagination metadata
  return await features.execute();
};

/**
 * Get a project by ID
 * @param projectId Project ID
 * @param userId User ID
 * @returns Project
 */
export const getProjectById = async (projectId: string, userId: string): Promise<IProject> => {
  // Find project by ID
  const project = await Project.findById(projectId);

  // Check if project exists
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Check if project belongs to user
  if ((project.user as mongoose.Types.ObjectId).toString() !== userId) {
    throw new ForbiddenError('You do not have permission to access this project');
  }

  return project;
};

/**
 * Update a project
 * @param projectId Project ID
 * @param userId User ID
 * @param updateData Update data
 * @returns Updated project
 */
export const updateProject = async (
  projectId: string,
  userId: string,
  updateData: Partial<IProject>,
): Promise<IProject> => {
  // Find project by ID
  const project = await Project.findById(projectId);

  // Check if project exists
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Check if project belongs to user
  if ((project.user as mongoose.Types.ObjectId).toString() !== userId) {
    throw new ForbiddenError('You do not have permission to update this project');
  }

  // Check if name is being updated and if it already exists
  if (updateData.name && updateData.name !== project.name) {
    const existingProject = await Project.findOne({
      user: userId,
      name: updateData.name,
      _id: { $ne: projectId }, // Exclude current project
    });

    if (existingProject) {
      throw new ValidationError(`Project with name "${updateData.name}" already exists`);
    }
  }

  // Update project
  Object.assign(project, updateData);
  await project.save();

  return project;
};

/**
 * Delete a project
 * @param projectId Project ID
 * @param userId User ID
 * @returns Success message
 */
export const deleteProject = async (
  projectId: string,
  userId: string,
): Promise<{ message: string }> => {
  // Find project by ID
  const project = await Project.findById(projectId);

  // Check if project exists
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Check if project belongs to user
  if ((project.user as mongoose.Types.ObjectId).toString() !== userId) {
    throw new ForbiddenError('You do not have permission to delete this project');
  }

  // Remove project from all associated tasks
  await Task.updateMany({ project: projectId }, { $unset: { project: '' } });

  // Delete project
  await project.deleteOne();

  return {
    message: 'Project deleted successfully',
  };
};

/**
 * Get project statistics
 * @param projectId Project ID
 * @param userId User ID
 * @returns Project statistics
 */
export const getProjectStats = async (projectId: string, userId: string): Promise<ProjectStats> => {
  // Find project by ID
  const project = await Project.findById(projectId);

  // Check if project exists
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Check if project belongs to user
  if ((project.user as mongoose.Types.ObjectId).toString() !== userId) {
    throw new ForbiddenError('You do not have permission to access this project');
  }

  // Get task statistics for this project
  const stats = await Task.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        project: new mongoose.Types.ObjectId(projectId),
      },
    },
    {
      $facet: {
        // Count by status
        byStatus: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
        ],
        // Count by priority
        byPriority: [
          {
            $group: {
              _id: '$priority',
              count: { $sum: 1 },
            },
          },
        ],
        // Count total tasks
        total: [
          {
            $count: 'count',
          },
        ],
        // Count completed tasks
        completed: [
          {
            $match: { status: 'done' },
          },
          {
            $count: 'count',
          },
        ],
        // Count overdue tasks
        overdue: [
          {
            $match: {
              dueDate: { $lt: new Date() },
              status: { $ne: 'done' },
            },
          },
          {
            $count: 'count',
          },
        ],
        // Get recent tasks
        recentTasks: [
          {
            $sort: { createdAt: -1 },
          },
          {
            $limit: 5,
          },
          {
            $project: {
              _id: 1,
              title: 1,
              status: 1,
              priority: 1,
              dueDate: 1,
              createdAt: 1,
            },
          },
        ],
      },
    },
  ]);

  // Format the results
  return {
    project: {
      id: (project._id as mongoose.Types.ObjectId).toString(),
      name: project.name,
      description: project.description,
      color: project.color,
      isArchived: project.isArchived,
    },
    stats: {
      total: stats[0].total[0]?.count || 0,
      completed: stats[0].completed[0]?.count || 0,
      overdue: stats[0].overdue[0]?.count || 0,
      byStatus: stats[0].byStatus.reduce(
        (acc: Record<string, number>, curr: { _id: string; count: number }) => {
          acc[curr._id] = curr.count;
          return acc;
        },
        {},
      ),
      byPriority: stats[0].byPriority.reduce(
        (acc: Record<string, number>, curr: { _id: string; count: number }) => {
          acc[curr._id] = curr.count;
          return acc;
        },
        {},
      ),
      recentTasks: stats[0].recentTasks,
    },
  };
};
