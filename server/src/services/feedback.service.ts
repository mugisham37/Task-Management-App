import Feedback, { type IFeedback } from '../models/feedback.model';
import { NotFoundError, ForbiddenError } from '../utils/app-error';
import { sendUserNotification } from './websocket.service';
import { sendEmail } from './email.service';
import logger from '../config/logger';
import { NotificationType } from '../models/notification.model';
import type {
  FeedbackFilterQuery,
  FeedbackPaginationQuery,
  FeedbackStatistics,
  FeedbackStatsByType,
  FeedbackStatsByStatus,
  FeedbackStatsByPriority,
  MonthlyFeedbackStats,
} from '../types/feedback.types';

/**
 * Create a new feedback
 * @param userId User ID
 * @param feedbackData Feedback data
 * @returns Created feedback
 */
export const createFeedback = async (
  userId: string,
  feedbackData: {
    type: 'bug' | 'feature' | 'improvement' | 'other';
    title: string;
    description: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    screenshots?: string[];
    metadata?: {
      browser?: string;
      os?: string;
      device?: string;
      url?: string;
    };
  },
): Promise<IFeedback> => {
  // Create feedback
  const feedback = await Feedback.create({
    user: userId,
    ...feedbackData,
  });

  // Notify admins about new feedback
  try {
    // Send email to admins
    const emailHtml = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<h2 style="color: #4f46e5;">New Feedback Submitted</h2>
<p><strong>Type:</strong> ${feedback.type}</p>
<p><strong>Title:</strong> ${feedback.title}</p>
<p><strong>Description:</strong> ${feedback.description}</p>
<p><strong>Priority:</strong> ${feedback.priority}</p>
</div>`;
    const emailText = `A new feedback has been submitted:\n\nType: ${feedback.type}\nTitle: ${feedback.title}\nDescription: ${feedback.description}\nPriority: ${feedback.priority}`;
    await sendEmail(
      'admin@taskmanagement.com',
      `New Feedback: ${feedback.title}`,
      emailHtml,
      emailText,
    );
  } catch (error) {
    logger.error('Failed to send admin notification email for new feedback:', error);
  }

  return feedback;
};

/**
 * Get feedback by ID
 * @param userId User ID
 * @param feedbackId Feedback ID
 * @returns Feedback
 */
export const getFeedbackById = async (userId: string, feedbackId: string): Promise<IFeedback> => {
  // Find feedback
  const feedback = (await Feedback.findById(feedbackId)) as IFeedback;

  // Check if feedback exists
  if (!feedback) {
    throw new NotFoundError('Feedback not found');
  }

  // Check if user is the owner of the feedback
  if (feedback.user.toString() !== userId) {
    throw new ForbiddenError("You don't have permission to access this feedback");
  }

  return feedback;
};

/**
 * Get all feedbacks for a user
 * @param userId User ID
 * @param filter Filter options
 * @returns Feedbacks and pagination info
 */
export const getUserFeedbacks = async (
  userId: string,
  filter: FeedbackPaginationQuery,
): Promise<{
  feedbacks: IFeedback[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}> => {
  const {
    type,
    status,
    priority,
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = filter;

  // Build query
  const query: FeedbackFilterQuery = { user: userId };

  if (type) {
    query.type = type;
  }

  if (status) {
    query.status = status;
  }

  if (priority) {
    query.priority = priority;
  }

  // Count total results
  const totalResults = await Feedback.countDocuments(query);

  // Calculate total pages
  const totalPages = Math.ceil(totalResults / limit);

  // Get feedbacks
  const feedbacks = await Feedback.find(query)
    .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return {
    feedbacks,
    page,
    limit,
    totalPages,
    totalResults,
  };
};

/**
 * Update feedback
 * @param userId User ID
 * @param feedbackId Feedback ID
 * @param updateData Update data
 * @returns Updated feedback
 */
export const updateFeedback = async (
  userId: string,
  feedbackId: string,
  updateData: {
    type?: 'bug' | 'feature' | 'improvement' | 'other';
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    screenshots?: string[];
    metadata?: {
      browser?: string;
      os?: string;
      device?: string;
      url?: string;
    };
  },
): Promise<IFeedback> => {
  // Find feedback
  const feedback = (await Feedback.findById(feedbackId)) as IFeedback;

  // Check if feedback exists
  if (!feedback) {
    throw new NotFoundError('Feedback not found');
  }

  // Check if user is the owner of the feedback
  if (feedback.user.toString() !== userId) {
    throw new ForbiddenError("You don't have permission to update this feedback");
  }

  // Check if feedback is already resolved or rejected
  if (feedback.status === 'resolved' || feedback.status === 'rejected') {
    throw new ForbiddenError('Cannot update feedback that is already resolved or rejected');
  }

  // Update feedback
  Object.assign(feedback, updateData);
  await feedback.save();

  return feedback;
};

/**
 * Delete feedback
 * @param userId User ID
 * @param feedbackId Feedback ID
 */
export const deleteFeedback = async (userId: string, feedbackId: string): Promise<void> => {
  // Find feedback
  const feedback = (await Feedback.findById(feedbackId)) as IFeedback;

  // Check if feedback exists
  if (!feedback) {
    throw new NotFoundError('Feedback not found');
  }

  // Check if user is the owner of the feedback
  if (feedback.user.toString() !== userId) {
    throw new ForbiddenError("You don't have permission to delete this feedback");
  }

  // Check if feedback is already in progress, resolved or rejected
  if (
    feedback.status === 'in-progress' ||
    feedback.status === 'resolved' ||
    feedback.status === 'rejected'
  ) {
    throw new ForbiddenError(
      'Cannot delete feedback that is already in progress, resolved or rejected',
    );
  }

  // Delete feedback
  await feedback.deleteOne();
};

/**
 * Admin: Get all feedbacks
 * @param filter Filter options
 * @returns Feedbacks and pagination info
 */
export const getAllFeedbacks = async (
  filter: FeedbackPaginationQuery,
): Promise<{
  feedbacks: IFeedback[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}> => {
  const {
    type,
    status,
    priority,
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = filter;

  // Build query
  const query: FeedbackFilterQuery = {};

  if (type) {
    query.type = type;
  }

  if (status) {
    query.status = status;
  }

  if (priority) {
    query.priority = priority;
  }

  // Count total results
  const totalResults = await Feedback.countDocuments(query);

  // Calculate total pages
  const totalPages = Math.ceil(totalResults / limit);

  // Get feedbacks
  const feedbacks = await Feedback.find(query)
    .populate('user', 'name email')
    .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return {
    feedbacks,
    page,
    limit,
    totalPages,
    totalResults,
  };
};

/**
 * Admin: Update feedback status
 * @param feedbackId Feedback ID
 * @param updateData Update data
 * @returns Updated feedback
 */
export const updateFeedbackStatus = async (
  feedbackId: string,
  updateData: {
    status: 'pending' | 'in-progress' | 'resolved' | 'rejected';
    priority?: 'low' | 'medium' | 'high' | 'critical';
    adminResponse?: string;
  },
): Promise<IFeedback> => {
  // Find feedback
  const feedback = (await Feedback.findById(feedbackId)) as IFeedback;

  // Check if feedback exists
  if (!feedback) {
    throw new NotFoundError('Feedback not found');
  }

  // Update feedback
  Object.assign(feedback, updateData);
  await feedback.save();

  // Notify user about feedback status update
  try {
    // Send notification via WebSocket
    sendUserNotification(feedback.user.toString(), {
      type: NotificationType.FEEDBACK_STATUS_UPDATE,
      message: `Your feedback "${feedback.title}" has been updated to ${feedback.status}`,
      feedbackId: feedback.id, // Use the id getter instead of _id
      data: {}, // Add empty data object to satisfy the type
    });

    // Send email notification
    const emailHtml = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<h2 style="color: #4f46e5;">Feedback Status Update</h2>
<p>Your feedback "${feedback.title}" has been updated to ${feedback.status}</p>
${feedback.adminResponse ? `<p><strong>Admin Response:</strong> ${feedback.adminResponse}</p>` : ''}
</div>`;
    const emailText = `Your feedback "${feedback.title}" has been updated to ${feedback.status}${
      feedback.adminResponse ? `\n\nAdmin Response: ${feedback.adminResponse}` : ''
    }`;

    await sendEmail(
      'user@example.com', // Replace with actual user email
      `Feedback Status Update: ${feedback.title}`,
      emailHtml,
      emailText,
    );
  } catch (error) {
    logger.error('Failed to send feedback status update notification:', error);
  }

  return feedback;
};

/**
 * Get feedback statistics
 * @returns Feedback statistics
 */
export const getFeedbackStatistics = async (): Promise<FeedbackStatistics> => {
  // Get feedback counts by type
  const typeStats = await Feedback.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
      },
    },
  ]);

  // Get feedback counts by status
  const statusStats = await Feedback.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  // Get feedback counts by priority
  const priorityStats = await Feedback.aggregate([
    {
      $group: {
        _id: '$priority',
        count: { $sum: 1 },
      },
    },
  ]);

  // Get feedback counts by month
  const monthlyStats = await Feedback.aggregate([
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: {
        '_id.year': 1,
        '_id.month': 1,
      },
    },
  ]);

  // Format monthly stats with proper typing
  const formattedMonthlyStats: MonthlyFeedbackStats[] = monthlyStats.map((stat) => ({
    year: stat._id.year,
    month: stat._id.month,
    count: stat.count,
  }));

  // Create properly typed stat objects
  const byType: FeedbackStatsByType = typeStats.reduce((acc, stat) => {
    acc[stat._id as keyof FeedbackStatsByType] = stat.count;
    return acc;
  }, {} as FeedbackStatsByType);

  const byStatus: FeedbackStatsByStatus = statusStats.reduce((acc, stat) => {
    acc[stat._id as keyof FeedbackStatsByStatus] = stat.count;
    return acc;
  }, {} as FeedbackStatsByStatus);

  const byPriority: FeedbackStatsByPriority = priorityStats.reduce((acc, stat) => {
    acc[stat._id as keyof FeedbackStatsByPriority] = stat.count;
    return acc;
  }, {} as FeedbackStatsByPriority);

  return {
    total: await Feedback.countDocuments(),
    byType,
    byStatus,
    byPriority,
    monthly: formattedMonthlyStats,
  };
};
