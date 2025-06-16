import mongoose, { type Document, Schema } from 'mongoose';
import type { IUser } from './user.model';
import type { ITask } from './task.model';

// Comment document interface
export interface IComment extends Document {
  content: string;
  task: ITask['_id'];
  user: IUser['_id'];
  attachments: {
    filename: string;
    path: string;
    mimetype: string;
    size: number;
  }[];
  mentions: IUser['_id'][];
  createdAt: Date;
  updatedAt: Date;
}

// Comment schema
const commentSchema = new Schema<IComment>(
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
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
commentSchema.index({ task: 1, createdAt: -1 });
commentSchema.index({ user: 1 });
commentSchema.index({ mentions: 1 });

// Create and export Comment model
const Comment = mongoose.model<IComment>('Comment', commentSchema);

export default Comment;
