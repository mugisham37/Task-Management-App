import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { IUser } from './user.model';

// Feedback type enum
export enum FeedbackType {
  BUG = 'bug',
  FEATURE = 'feature',
  IMPROVEMENT = 'improvement',
  QUESTION = 'question',
  OTHER = 'other',
}

// Feedback status enum
export enum FeedbackStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
  DUPLICATE = 'duplicate',
}

// Feedback priority enum
export enum FeedbackPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Feedback interface
export interface IFeedback {
  user: mongoose.Types.ObjectId | IUser;
  type: FeedbackType;
  title: string;
  description: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  screenshots: string[];
  metadata: {
    browser?: string;
    os?: string;
    device?: string;
    url?: string;
    appVersion?: string;
  };
  adminResponse?: string;
  adminResponseDate?: Date;
  respondedBy?: mongoose.Types.ObjectId | IUser;
  isPublic: boolean;
  upvotes: number;
  upvotedBy: (mongoose.Types.ObjectId | IUser)[];
  tags: string[];
  relatedFeedback?: mongoose.Types.ObjectId[];
  plannedForVersion?: string;
}

// Feedback document interface
export interface IFeedbackDocument extends IFeedback, Document {
  updateStatus(
    status: FeedbackStatus,
    adminResponse?: string,
    respondedBy?: mongoose.Types.ObjectId,
  ): Promise<IFeedbackDocument>;
  updatePriority(priority: FeedbackPriority): Promise<IFeedbackDocument>;
  addUpvote(userId: mongoose.Types.ObjectId): Promise<IFeedbackDocument>;
  removeUpvote(userId: mongoose.Types.ObjectId): Promise<IFeedbackDocument>;
  addTag(tag: string): Promise<IFeedbackDocument>;
  removeTag(tag: string): Promise<IFeedbackDocument>;
  addRelatedFeedback(feedbackId: mongoose.Types.ObjectId): Promise<IFeedbackDocument>;
  removeRelatedFeedback(feedbackId: mongoose.Types.ObjectId): Promise<IFeedbackDocument>;
  addScreenshot(url: string): Promise<IFeedbackDocument>;
  removeScreenshot(url: string): Promise<IFeedbackDocument>;
}

// Define query types to avoid using 'any'
export interface SearchQuery {
  $text?: { $search: string };
  isPublic?: boolean;
  type?: FeedbackType;
  status?: FeedbackStatus;
}

export interface SortOptions {
  createdAt?: 1 | -1;
  upvotes?: 1 | -1;
  priority?: 1 | -1;
  score?: { $meta: 'textScore' };
}

export interface PublicFeedbackOptions {
  limit?: number;
  offset?: number;
  type?: FeedbackType | null;
  status?: FeedbackStatus | null;
  sortBy?: 'newest' | 'oldest' | 'upvotes' | 'priority';
}

export interface SearchFeedbackOptions {
  limit?: number;
  offset?: number;
  type?: FeedbackType | null;
  status?: FeedbackStatus | null;
  includePrivate?: boolean;
}

// Feedback model interface
export interface IFeedbackModel extends Model<IFeedbackDocument> {
  getUserFeedback(userId: mongoose.Types.ObjectId): Promise<IFeedbackDocument[]>;
  getPublicFeedback(options?: PublicFeedbackOptions): Promise<IFeedbackDocument[]>;
  searchFeedback(query: string, options?: SearchFeedbackOptions): Promise<IFeedbackDocument[]>;
  getFeedbackStats(): Promise<{
    total: number;
    byType: Record<FeedbackType, number>;
    byStatus: Record<FeedbackStatus, number>;
    byPriority: Record<FeedbackPriority, number>;
  }>;
}

// Feedback schema
const feedbackSchema = new Schema<IFeedbackDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(FeedbackType),
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: Object.values(FeedbackStatus),
      default: FeedbackStatus.PENDING,
    },
    priority: {
      type: String,
      enum: Object.values(FeedbackPriority),
      default: FeedbackPriority.MEDIUM,
    },
    screenshots: [
      {
        type: String,
      },
    ],
    metadata: {
      browser: String,
      os: String,
      device: String,
      url: String,
      appVersion: String,
    },
    adminResponse: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    adminResponseDate: {
      type: Date,
    },
    respondedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    upvotes: {
      type: Number,
      default: 0,
    },
    upvotedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    relatedFeedback: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Feedback',
      },
    ],
    plannedForVersion: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
feedbackSchema.index({ user: 1, createdAt: -1 });
feedbackSchema.index({ status: 1 });
feedbackSchema.index({ type: 1 });
feedbackSchema.index({ priority: 1 });
feedbackSchema.index({ isPublic: 1 });
feedbackSchema.index({ upvotes: -1 });
feedbackSchema.index({ tags: 1 });
feedbackSchema.index({ title: 'text', description: 'text', tags: 'text' });

// Method to update status
feedbackSchema.methods.updateStatus = async function (
  status: FeedbackStatus,
  adminResponse?: string,
  respondedBy?: mongoose.Types.ObjectId,
): Promise<IFeedbackDocument> {
  this.status = status;

  if (adminResponse) {
    this.adminResponse = adminResponse;
    this.adminResponseDate = new Date();
  }

  if (respondedBy) {
    this.respondedBy = respondedBy;
  }

  await this.save();
  return this as unknown as IFeedbackDocument;
};

// Method to update priority
feedbackSchema.methods.updatePriority = async function (
  priority: FeedbackPriority,
): Promise<IFeedbackDocument> {
  this.priority = priority;
  await this.save();
  return this as unknown as IFeedbackDocument;
};

// Method to add upvote
feedbackSchema.methods.addUpvote = async function (
  userId: mongoose.Types.ObjectId,
): Promise<IFeedbackDocument> {
  // Check if user already upvoted
  const alreadyUpvoted = this.upvotedBy.some(
    (id: mongoose.Types.ObjectId) => id.toString() === userId.toString(),
  );

  if (!alreadyUpvoted) {
    this.upvotedBy.push(userId);
    this.upvotes = this.upvotedBy.length;
    await this.save();
  }

  return this as unknown as IFeedbackDocument;
};

// Method to remove upvote
feedbackSchema.methods.removeUpvote = async function (
  userId: mongoose.Types.ObjectId,
): Promise<IFeedbackDocument> {
  this.upvotedBy = this.upvotedBy.filter(
    (id: mongoose.Types.ObjectId) => id.toString() !== userId.toString(),
  );

  this.upvotes = this.upvotedBy.length;
  await this.save();
  return this as unknown as IFeedbackDocument;
};

// Method to add tag
feedbackSchema.methods.addTag = async function (tag: string): Promise<IFeedbackDocument> {
  const normalizedTag = tag.trim().toLowerCase();

  if (!this.tags.includes(normalizedTag)) {
    this.tags.push(normalizedTag);
    await this.save();
  }

  return this as unknown as IFeedbackDocument;
};

// Method to remove tag
feedbackSchema.methods.removeTag = async function (tag: string): Promise<IFeedbackDocument> {
  const normalizedTag = tag.trim().toLowerCase();
  this.tags = this.tags.filter((t: string) => t !== normalizedTag);
  await this.save();
  return this as unknown as IFeedbackDocument;
};

// Method to add related feedback
feedbackSchema.methods.addRelatedFeedback = async function (
  feedbackId: mongoose.Types.ObjectId,
): Promise<IFeedbackDocument> {
  // Check if already related
  const alreadyRelated = this.relatedFeedback.some(
    (id: mongoose.Types.ObjectId) => id.toString() === feedbackId.toString(),
  );

  if (!alreadyRelated && !feedbackId.equals(this._id)) {
    this.relatedFeedback.push(feedbackId);
    await this.save();
  }

  return this as unknown as IFeedbackDocument;
};

// Method to remove related feedback
feedbackSchema.methods.removeRelatedFeedback = async function (
  feedbackId: mongoose.Types.ObjectId,
): Promise<IFeedbackDocument> {
  this.relatedFeedback = this.relatedFeedback.filter(
    (id: mongoose.Types.ObjectId) => id.toString() !== feedbackId.toString(),
  );

  await this.save();
  return this as unknown as IFeedbackDocument;
};

// Method to add screenshot
feedbackSchema.methods.addScreenshot = async function (url: string): Promise<IFeedbackDocument> {
  if (!this.screenshots.includes(url)) {
    this.screenshots.push(url);
    await this.save();
  }

  return this as unknown as IFeedbackDocument;
};

// Method to remove screenshot
feedbackSchema.methods.removeScreenshot = async function (url: string): Promise<IFeedbackDocument> {
  this.screenshots = this.screenshots.filter((s: string) => s !== url);
  await this.save();
  return this as unknown as IFeedbackDocument;
};

// Static method to get user feedback
feedbackSchema.statics.getUserFeedback = async function (
  userId: mongoose.Types.ObjectId,
): Promise<IFeedbackDocument[]> {
  return this.find({ user: userId }).sort({ createdAt: -1 }).populate('respondedBy', 'name avatar');
};

// Static method to get public feedback
feedbackSchema.statics.getPublicFeedback = async function (
  options: PublicFeedbackOptions = {},
): Promise<IFeedbackDocument[]> {
  const { limit = 20, offset = 0, type = null, status = null, sortBy = 'newest' } = options;

  const query: Record<string, unknown> = { isPublic: true };

  if (type) {
    query.type = type;
  }

  if (status) {
    query.status = status;
  }

  let sort: SortOptions = {};
  switch (sortBy) {
    case 'newest':
      sort = { createdAt: -1 };
      break;
    case 'oldest':
      sort = { createdAt: 1 };
      break;
    case 'upvotes':
      sort = { upvotes: -1, createdAt: -1 };
      break;
    case 'priority':
      // Custom sort order for priority
      sort = {
        priority: -1, // CRITICAL > HIGH > MEDIUM > LOW
        upvotes: -1,
        createdAt: -1,
      };
      break;
  }

  return this.find(query)
    .sort(sort)
    .skip(offset)
    .limit(limit)
    .populate('user', 'name avatar')
    .populate('respondedBy', 'name avatar');
};

// Static method to search feedback
feedbackSchema.statics.searchFeedback = async function (
  query: string,
  options: SearchFeedbackOptions = {},
): Promise<IFeedbackDocument[]> {
  const { limit = 20, offset = 0, type = null, status = null, includePrivate = false } = options;

  const searchQuery: SearchQuery = {
    $text: { $search: query },
  };

  if (!includePrivate) {
    searchQuery.isPublic = true;
  }

  if (type) {
    searchQuery.type = type;
  }

  if (status) {
    searchQuery.status = status;
  }

  return this.find(searchQuery)
    .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .populate('user', 'name avatar')
    .populate('respondedBy', 'name avatar');
};

// Static method to get feedback stats
feedbackSchema.statics.getFeedbackStats = async function (): Promise<{
  total: number;
  byType: Record<FeedbackType, number>;
  byStatus: Record<FeedbackStatus, number>;
  byPriority: Record<FeedbackPriority, number>;
}> {
  const stats = await this.aggregate([
    {
      $facet: {
        // Count by type
        byType: [
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 },
            },
          },
        ],
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
        // Count total
        total: [
          {
            $count: 'count',
          },
        ],
      },
    },
  ]);

  // Format the results
  const byType: Record<FeedbackType, number> = {
    [FeedbackType.BUG]: 0,
    [FeedbackType.FEATURE]: 0,
    [FeedbackType.IMPROVEMENT]: 0,
    [FeedbackType.QUESTION]: 0,
    [FeedbackType.OTHER]: 0,
  };

  const byStatus: Record<FeedbackStatus, number> = {
    [FeedbackStatus.PENDING]: 0,
    [FeedbackStatus.IN_PROGRESS]: 0,
    [FeedbackStatus.RESOLVED]: 0,
    [FeedbackStatus.REJECTED]: 0,
    [FeedbackStatus.DUPLICATE]: 0,
  };

  const byPriority: Record<FeedbackPriority, number> = {
    [FeedbackPriority.LOW]: 0,
    [FeedbackPriority.MEDIUM]: 0,
    [FeedbackPriority.HIGH]: 0,
    [FeedbackPriority.CRITICAL]: 0,
  };

  // Process type counts
  stats[0].byType.forEach((item: { _id: FeedbackType; count: number }) => {
    byType[item._id] = item.count;
  });

  // Process status counts
  stats[0].byStatus.forEach((item: { _id: FeedbackStatus; count: number }) => {
    byStatus[item._id] = item.count;
  });

  // Process priority counts
  stats[0].byPriority.forEach((item: { _id: FeedbackPriority; count: number }) => {
    byPriority[item._id] = item.count;
  });

  return {
    total: stats[0].total[0]?.count || 0,
    byType,
    byStatus,
    byPriority,
  };
};

// Create and export Feedback model
const Feedback = mongoose.model<IFeedbackDocument, IFeedbackModel>('Feedback', feedbackSchema);

export default Feedback;
