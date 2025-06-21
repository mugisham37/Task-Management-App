import { Types, Document } from 'mongoose';

// Enhanced ActivityDataField type that includes all properties used in comment.service.ts
export interface ActivityDataField {
  taskTitle?: string;
  commentId?: string;
  commentContent?: string;
  action?: string;
  originalContent?: string;
  newContent?: string;
  attachmentDetails?: {
    filename: string;
    size: number;
    mimetype: string;
  };
  [key: string]: any; // Allow additional properties
}

// Properly typed attachment interface
export interface AttachmentDocument {
  _id?: Types.ObjectId;
  filename: string;
  path: string;
  mimetype: string;
  size: number;
  uploadedAt?: Date;
  uploadedBy?: Types.ObjectId;
}

// Properly typed comment interface with Mongoose document methods
export interface CommentDocument extends Document {
  _id: Types.ObjectId;
  content: string;
  task: Types.ObjectId;
  user: Types.ObjectId;
  attachments: AttachmentDocument[];
  mentions: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}
