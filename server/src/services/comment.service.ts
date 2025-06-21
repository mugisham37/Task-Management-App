import { Types } from 'mongoose';
import Comment, { type IComment } from '../models/comment.model';
import Task, { type ITask } from '../models/task.model';
import User, { type IUser } from '../models/user.model';
import { NotFoundError, ForbiddenError } from '../utils/app-error';
import { APIFeatures } from '../utils/api-features';
import * as activityService from './activity.service';
import * as notificationService from './notification.service';
import { ActivityType } from '../models/activity.model';
import { NotificationType } from '../models/notification.model';
import logger from '../config/logger';
import * as cache from '../utils/cache';
import { startTimer } from '../utils/performance-monitor';
import { ActivityDataField, AttachmentDocument, CommentDocument } from '../types';

// Type for task with required _id
interface TaskWithId extends ITask {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  project?: Types.ObjectId;
  assignedTo?: Types.ObjectId;
}

// Type for user with required _id
interface UserWithId extends IUser {
  _id: Types.ObjectId;
}

/**
 * Create a new comment
 * @param userId User ID
 * @param taskId Task ID
 * @param commentData Comment data
 * @returns Newly created comment
 */
export const createComment = async (
  userId: string,
  taskId: string,
  commentData: {
    content: string;
    attachments?: AttachmentDocument[];
    mentions?: string[];
  },
): Promise<IComment> => {
  const timer = startTimer('commentService.createComment');

  try {
    // Find task by ID
    const task = await Task.findById(taskId).lean();
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Cast task to TaskWithId
    const typedTask = task as unknown as TaskWithId;

    // Check if user has access to the task
    if (
      typedTask.user.toString() !== userId &&
      (!typedTask.assignedTo || typedTask.assignedTo.toString() !== userId)
    ) {
      throw new ForbiddenError('You do not have permission to comment on this task');
    }

    // Validate mentions if provided
    const validatedMentions: Types.ObjectId[] = [];
    if (commentData.mentions && commentData.mentions.length > 0) {
      // Find users by IDs
      const mentionedUsers = await User.find({
        _id: { $in: commentData.mentions },
      }).lean();

      // Add valid user IDs to mentions
      for (const user of mentionedUsers) {
        const typedUser = user as unknown as UserWithId;
        validatedMentions.push(new Types.ObjectId(typedUser._id.toString()));
      }
    }

    // Create comment
    const comment = await Comment.create({
      content: commentData.content,
      task: new Types.ObjectId(taskId),
      user: new Types.ObjectId(userId),
      attachments: commentData.attachments || [],
      mentions: validatedMentions,
    });

    // Get the created comment as a proper document
    const createdComment = (await Comment.findById(
      comment._id,
    ).exec()) as unknown as CommentDocument;
    if (!createdComment) {
      throw new Error('Failed to retrieve created comment');
    }

    // Create activity log with proper typing
    const activityData: ActivityDataField = {
      taskTitle: typedTask.title,
      commentId: createdComment._id.toString(),
      commentContent:
        createdComment.content.substring(0, 100) +
        (createdComment.content.length > 100 ? '...' : ''),
    };

    await activityService.createActivity(userId, {
      type: ActivityType.TASK_COMMENTED,
      task: new Types.ObjectId(taskId),
      project: typedTask.project,
      data: activityData,
    });

    // Create notification for task owner if different from commenter
    if (typedTask.user.toString() !== userId) {
      await notificationService.createNotification(typedTask.user.toString(), {
        type: NotificationType.TASK_COMMENTED,
        title: 'New Comment on Task',
        message: `Someone commented on your task "${typedTask.title}"`,
        data: {
          taskId: taskId,
          commentId: createdComment._id.toString(),
          commenterId: userId,
        },
      });
    }

    // Create notifications for mentioned users
    if (validatedMentions.length > 0) {
      for (const mentionId of validatedMentions) {
        // Skip notification for the commenter
        if (mentionId.toString() === userId) continue;

        await notificationService.createNotification(mentionId.toString(), {
          type: NotificationType.TASK_COMMENTED,
          title: 'You were mentioned in a comment',
          message: `You were mentioned in a comment on task "${typedTask.title}"`,
          data: {
            taskId: taskId,
            commentId: createdComment._id.toString(),
            commenterId: userId,
          },
        });
      }
    }

    // Invalidate task comments cache
    cache.del(`taskComments:${taskId}`);

    return createdComment;
  } catch (error) {
    logger.error(`Error creating comment for task ${taskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get comments for a task
 * @param taskId Task ID
 * @param userId User ID
 * @param queryParams Query parameters
 * @returns Comments and pagination metadata
 */
export const getTaskComments = async (
  taskId: string,
  userId: string,
  queryParams: Record<string, unknown> = {},
): Promise<{
  data: IComment[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('commentService.getTaskComments');

  try {
    // Find task by ID
    const task = await Task.findById(taskId).lean();
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Cast task to TaskWithId
    const typedTask = task as unknown as TaskWithId;

    // Check if user has access to the task
    if (
      typedTask.user.toString() !== userId &&
      (!typedTask.assignedTo || typedTask.assignedTo.toString() !== userId)
    ) {
      throw new ForbiddenError('You do not have permission to view comments on this task');
    }

    // Try to get from cache if no specific filters
    const isDefaultQuery =
      Object.keys(queryParams).length === 0 ||
      (Object.keys(queryParams).length === 2 && queryParams.page === 1 && queryParams.limit === 10);

    if (isDefaultQuery) {
      const cacheKey = `taskComments:${taskId}`;
      const cachedComments = cache.get<{
        data: IComment[];
        total: number;
        page: number;
        limit: number;
        pages: number;
      }>(cacheKey);
      if (cachedComments) {
        return cachedComments;
      }
    }

    // Create base query for task comments
    const query = Comment.find({ task: taskId }).populate('user', 'name email');

    // Apply API features (filtering, sorting, pagination)
    const features = new APIFeatures(query, queryParams)
      .filter()
      .sort('-createdAt') // Default sort by most recent
      .limitFields()
      .paginate();

    // Execute query with pagination metadata
    const result = await features.execute();

    // Cache result if default query
    if (isDefaultQuery) {
      cache.set(`taskComments:${taskId}`, result, 300); // Cache for 5 minutes
    }

    return result;
  } catch (error) {
    logger.error(`Error getting comments for task ${taskId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get a comment by ID
 * @param commentId Comment ID
 * @param userId User ID
 * @returns Comment
 */
export const getCommentById = async (commentId: string, userId: string): Promise<IComment> => {
  const timer = startTimer('commentService.getCommentById');

  try {
    // Find comment by ID
    const comment = (await Comment.findById(commentId)
      .populate('user', 'name email')
      .exec()) as unknown as CommentDocument;
    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Find task to check permissions
    const task = await Task.findById(comment.task).lean();
    if (!task) {
      throw new NotFoundError('Associated task not found');
    }

    // Cast task to TaskWithId
    const typedTask = task as unknown as TaskWithId;

    // Check if user has access to the task
    if (
      typedTask.user.toString() !== userId &&
      (!typedTask.assignedTo || typedTask.assignedTo.toString() !== userId)
    ) {
      throw new ForbiddenError('You do not have permission to view this comment');
    }

    return comment;
  } catch (error) {
    logger.error(`Error getting comment ${commentId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Update a comment
 * @param commentId Comment ID
 * @param userId User ID
 * @param updateData Update data
 * @returns Updated comment
 */
export const updateComment = async (
  commentId: string,
  userId: string,
  updateData: {
    content?: string;
    attachments?: AttachmentDocument[];
    mentions?: string[];
  },
): Promise<IComment> => {
  const timer = startTimer('commentService.updateComment');

  try {
    // Find comment by ID
    const comment = (await Comment.findById(commentId).exec()) as unknown as CommentDocument;
    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Check if user is the author of the comment
    if (comment.user.toString() !== userId) {
      throw new ForbiddenError('You can only update your own comments');
    }

    // Validate mentions if provided
    if (updateData.mentions && updateData.mentions.length > 0) {
      // Find users by IDs
      const mentionedUsers = await User.find({
        _id: { $in: updateData.mentions },
      }).lean();

      // Replace mentions with valid user IDs
      const validUserIds: string[] = [];
      for (const user of mentionedUsers) {
        const typedUser = user as unknown as UserWithId;
        validUserIds.push(typedUser._id.toString());
      }
      updateData.mentions = validUserIds;
    }

    // Get original content for activity log
    const originalContent = comment.content;

    // Update comment
    if (updateData.content !== undefined) {
      comment.content = updateData.content;
    }

    if (updateData.attachments !== undefined) {
      comment.attachments = updateData.attachments;
    }

    if (updateData.mentions !== undefined) {
      comment.mentions = updateData.mentions.map((id) => new Types.ObjectId(id));
    }

    await comment.save();

    // Find task for activity log and notifications
    const task = await Task.findById(comment.task).lean();
    const typedTask = task ? (task as unknown as TaskWithId) : null;

    // Create activity log with proper typing
    const activityData: ActivityDataField = {
      taskTitle: typedTask?.title || 'Unknown Task',
      commentId: comment._id.toString(),
      action: 'updated',
      originalContent,
      newContent: comment.content.substring(0, 100) + (comment.content.length > 100 ? '...' : ''),
    };

    await activityService.createActivity(userId, {
      type: ActivityType.TASK_COMMENTED,
      task: comment.task as Types.ObjectId,
      project: typedTask?.project,
      data: activityData,
    });

    // Create notifications for newly mentioned users
    const previousMentions = new Set(comment.mentions.map((id) => id.toString()));
    const newMentions = new Set(updateData.mentions || []);

    // Find users who are newly mentioned
    const newlyMentioned = [...newMentions].filter((id) => !previousMentions.has(id));

    if (newlyMentioned.length > 0 && typedTask) {
      for (const mentionId of newlyMentioned) {
        // Skip notification for the commenter
        if (mentionId === userId) continue;

        await notificationService.createNotification(mentionId, {
          type: NotificationType.TASK_COMMENTED,
          title: 'You were mentioned in a comment',
          message: `You were mentioned in a comment on task "${typedTask.title}"`,
          data: {
            taskId: typedTask._id.toString(),
            commentId: comment._id.toString(),
            commenterId: userId,
          },
        });
      }
    }

    // Invalidate task comments cache
    cache.del(`taskComments:${comment.task.toString()}`);

    return comment;
  } catch (error) {
    logger.error(`Error updating comment ${commentId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Delete a comment
 * @param commentId Comment ID
 * @param userId User ID
 * @returns Success message
 */
export const deleteComment = async (
  commentId: string,
  userId: string,
): Promise<{ message: string }> => {
  const timer = startTimer('commentService.deleteComment');

  try {
    // Find comment by ID
    const comment = (await Comment.findById(commentId).exec()) as unknown as CommentDocument;
    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Check if user is the author of the comment or the task owner
    const task = await Task.findById(comment.task).lean();
    if (!task) {
      throw new NotFoundError('Associated task not found');
    }

    // Cast task to TaskWithId
    const typedTask = task as unknown as TaskWithId;

    const isCommentAuthor = comment.user.toString() === userId;
    const isTaskOwner = typedTask.user.toString() === userId;

    if (!isCommentAuthor && !isTaskOwner) {
      throw new ForbiddenError('You do not have permission to delete this comment');
    }

    // Get comment details for activity log
    const commentContent = comment.content;
    const taskId = comment.task.toString();

    // Delete comment
    await comment.deleteOne();

    // Create activity log with proper typing
    const activityData: ActivityDataField = {
      taskTitle: typedTask.title,
      action: 'deleted',
      commentContent: commentContent.substring(0, 100) + (commentContent.length > 100 ? '...' : ''),
    };

    await activityService.createActivity(userId, {
      type: ActivityType.TASK_COMMENTED,
      task: new Types.ObjectId(typedTask._id.toString()),
      project: typedTask.project,
      data: activityData,
    });

    // Invalidate task comments cache
    cache.del(`taskComments:${taskId}`);

    return {
      message: 'Comment deleted successfully',
    };
  } catch (error) {
    logger.error(`Error deleting comment ${commentId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Add attachment to a comment
 * @param commentId Comment ID
 * @param userId User ID
 * @param attachment Attachment data
 * @returns Updated comment
 */
export const addCommentAttachment = async (
  commentId: string,
  userId: string,
  attachment: AttachmentDocument,
): Promise<IComment> => {
  const timer = startTimer('commentService.addCommentAttachment');

  try {
    // Find comment by ID
    const comment = (await Comment.findById(commentId).exec()) as unknown as CommentDocument;
    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Check if user is the author of the comment
    if (comment.user.toString() !== userId) {
      throw new ForbiddenError('You can only add attachments to your own comments');
    }

    // Add attachment to comment with _id
    const attachmentWithId: AttachmentDocument = {
      ...attachment,
      _id: new Types.ObjectId(),
    };

    comment.attachments.push(attachmentWithId);
    await comment.save();

    // Find task for activity log
    const task = await Task.findById(comment.task).lean();
    const typedTask = task ? (task as unknown as TaskWithId) : null;

    // Create activity log with proper typing
    const activityData: ActivityDataField = {
      taskTitle: typedTask?.title || 'Unknown Task',
      commentId: comment._id.toString(),
      action: 'attachment_added',
      attachmentDetails: {
        filename: attachment.filename,
        size: attachment.size,
        mimetype: attachment.mimetype,
      },
    };

    await activityService.createActivity(userId, {
      type: ActivityType.TASK_COMMENTED,
      task: comment.task as Types.ObjectId,
      project: typedTask?.project,
      data: activityData,
    });

    // Invalidate task comments cache
    cache.del(`taskComments:${comment.task.toString()}`);

    return comment;
  } catch (error) {
    logger.error(`Error adding attachment to comment ${commentId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Remove attachment from a comment
 * @param commentId Comment ID
 * @param userId User ID
 * @param attachmentId Attachment ID
 * @returns Updated comment
 */
export const removeCommentAttachment = async (
  commentId: string,
  userId: string,
  attachmentId: string,
): Promise<IComment> => {
  const timer = startTimer('commentService.removeCommentAttachment');

  try {
    // Find comment by ID
    const comment = (await Comment.findById(commentId).exec()) as unknown as CommentDocument;
    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Check if user is the author of the comment
    if (comment.user.toString() !== userId) {
      throw new ForbiddenError('You can only remove attachments from your own comments');
    }

    // Find attachment index
    const attachmentIndex = comment.attachments.findIndex(
      (attachment) => attachment._id && attachment._id.toString() === attachmentId,
    );

    // Check if attachment exists
    if (attachmentIndex === -1) {
      throw new NotFoundError('Attachment not found');
    }

    // Get attachment details for activity log
    const attachmentDetails = {
      filename: comment.attachments[attachmentIndex].filename,
      mimetype: comment.attachments[attachmentIndex].mimetype,
      size: comment.attachments[attachmentIndex].size,
    };

    // Remove attachment from comment
    comment.attachments.splice(attachmentIndex, 1);
    await comment.save();

    // Find task for activity log
    const task = await Task.findById(comment.task).lean();
    const typedTask = task ? (task as unknown as TaskWithId) : null;

    // Create activity log with proper typing
    const activityData: ActivityDataField = {
      taskTitle: typedTask?.title || 'Unknown Task',
      commentId: comment._id.toString(),
      action: 'attachment_removed',
      attachmentDetails,
    };

    await activityService.createActivity(userId, {
      type: ActivityType.TASK_COMMENTED,
      task: comment.task as Types.ObjectId,
      project: typedTask?.project,
      data: activityData,
    });

    // Invalidate task comments cache
    cache.del(`taskComments:${comment.task.toString()}`);

    return comment;
  } catch (error) {
    logger.error(`Error removing attachment from comment ${commentId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get user comments
 * @param userId User ID
 * @param queryParams Query parameters
 * @returns Comments and pagination metadata
 */
export const getUserComments = async (
  userId: string,
  queryParams: Record<string, unknown> = {},
): Promise<{
  data: IComment[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('commentService.getUserComments');

  try {
    // Create base query for user's comments
    const query = Comment.find({ user: userId })
      .populate('task', 'title status')
      .populate('user', 'name email');

    // Apply API features (filtering, sorting, pagination)
    const features = new APIFeatures(query, queryParams)
      .filter()
      .sort('-createdAt') // Default sort by most recent
      .limitFields()
      .paginate();

    // Execute query with pagination metadata
    return await features.execute();
  } catch (error) {
    logger.error(`Error getting comments for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};
