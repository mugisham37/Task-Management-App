import mongoose, { Document, Schema, Model } from 'mongoose';
import { IUser } from './user.model';
import { ITask } from './task.model';

// Define reaction interface
interface IReaction {
  type: string;
  user: mongoose.Types.ObjectId | IUser;
  createdAt: Date;
}

// Comment interface
export interface IComment {
  content: string;
  task: mongoose.Types.ObjectId | ITask;
  user: mongoose.Types.ObjectId | IUser;
  attachments: {
    filename: string;
    path: string;
    mimetype: string;
    size: number;
  }[];
  mentions: (mongoose.Types.ObjectId | IUser)[];
  isEdited: boolean;
  editedAt?: Date;
  parentComment?: mongoose.Types.ObjectId | IComment;
  reactions: {
    type: string;
    user: mongoose.Types.ObjectId | IUser;
    createdAt: Date;
  }[];
}

// Comment document interface
export interface ICommentDocument extends IComment, Document {
  addReaction(userId: mongoose.Types.ObjectId, type: string): Promise<ICommentDocument>;
  removeReaction(userId: mongoose.Types.ObjectId, type: string): Promise<ICommentDocument>;
  addMention(userId: mongoose.Types.ObjectId): Promise<ICommentDocument>;
  removeMention(userId: mongoose.Types.ObjectId): Promise<ICommentDocument>;
  edit(content: string): Promise<ICommentDocument>;
  getReplies(): Promise<ICommentDocument[]>;
}

// Comment model interface
export interface ICommentModel extends Model<ICommentDocument> {
  getTaskComments(taskId: mongoose.Types.ObjectId): Promise<ICommentDocument[]>;
  getUserComments(userId: mongoose.Types.ObjectId): Promise<ICommentDocument[]>;
}

// Comment schema
const commentSchema = new Schema<ICommentDocument>(
  {
    content: {
      type: String,
      required: [true, 'Comment content is required'],
      trim: true,
      maxlength: [2000, 'Comment content cannot be more than 2000 characters'],
    },
    task: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: [true, 'Comment must be associated with a task'],
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Comment must have an author'],
    },
    attachments: [
      {
        filename: String,
        path: String,
        mimetype: String,
        size: Number,
      },
    ],
    mentions: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    parentComment: {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
    },
    reactions: [
      {
        type: {
          type: String,
          required: true,
          enum: ['like', 'love', 'laugh', 'wow', 'sad', 'angry'],
        },
        user: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
commentSchema.index({ task: 1, createdAt: -1 });
commentSchema.index({ user: 1 });
commentSchema.index({ parentComment: 1 });
commentSchema.index({ mentions: 1 });
commentSchema.index({ content: 'text' }); // Text index for search

// Method to add a reaction to the comment
commentSchema.methods.addReaction = async function (
  userId: mongoose.Types.ObjectId,
  type: string,
): Promise<ICommentDocument> {
  // Check if user already reacted with this type
  const existingReaction = this.reactions.find(
    (reaction: IReaction) =>
      reaction.user.toString() === userId.toString() && reaction.type === type,
  );

  if (existingReaction) {
    return this as unknown as ICommentDocument;
  }

  // Remove any existing reactions from this user (one reaction per user)
  this.reactions = this.reactions.filter(
    (reaction: IReaction) => reaction.user.toString() !== userId.toString(),
  );

  // Add new reaction
  this.reactions.push({
    type,
    user: userId,
    createdAt: new Date(),
  });

  await this.save();
  return this as unknown as ICommentDocument;
};

// Method to remove a reaction from the comment
commentSchema.methods.removeReaction = async function (
  userId: mongoose.Types.ObjectId,
  type: string,
): Promise<ICommentDocument> {
  this.reactions = this.reactions.filter(
    (reaction: IReaction) =>
      !(reaction.user.toString() === userId.toString() && reaction.type === type),
  );

  await this.save();
  return this as unknown as ICommentDocument;
};

// Method to add a mention to the comment
commentSchema.methods.addMention = async function (
  userId: mongoose.Types.ObjectId,
): Promise<ICommentDocument> {
  // Check if user is already mentioned
  const isMentioned = this.mentions.some(
    (mention: mongoose.Types.ObjectId) => mention.toString() === userId.toString(),
  );

  if (!isMentioned) {
    this.mentions.push(userId);
    await this.save();
  }

  return this as unknown as ICommentDocument;
};

// Method to remove a mention from the comment
commentSchema.methods.removeMention = async function (
  userId: mongoose.Types.ObjectId,
): Promise<ICommentDocument> {
  this.mentions = this.mentions.filter(
    (mention: mongoose.Types.ObjectId) => mention.toString() !== userId.toString(),
  );

  await this.save();
  return this as unknown as ICommentDocument;
};

// Method to edit the comment
commentSchema.methods.edit = async function (content: string): Promise<ICommentDocument> {
  this.content = content;
  this.isEdited = true;
  this.editedAt = new Date();

  await this.save();
  return this as unknown as ICommentDocument;
};

// Method to get replies to this comment
commentSchema.methods.getReplies = async function (): Promise<ICommentDocument[]> {
  return this.model('Comment')
    .find({ parentComment: this._id })
    .sort({ createdAt: 1 })
    .populate('user', 'name avatar')
    .populate('mentions', 'name avatar');
};

// Static method to get all comments for a task
commentSchema.statics.getTaskComments = async function (
  taskId: mongoose.Types.ObjectId,
): Promise<ICommentDocument[]> {
  return this.find({ task: taskId, parentComment: null })
    .sort({ createdAt: -1 })
    .populate('user', 'name avatar')
    .populate('mentions', 'name avatar');
};

// Static method to get all comments by a user
commentSchema.statics.getUserComments = async function (
  userId: mongoose.Types.ObjectId,
): Promise<ICommentDocument[]> {
  return this.find({ user: userId })
    .sort({ createdAt: -1 })
    .populate('task', 'title')
    .populate('mentions', 'name avatar');
};

// Create and export Comment model
const Comment = mongoose.model<ICommentDocument, ICommentModel>('Comment', commentSchema);

export default Comment;
