import mongoose, { Schema, type Document } from 'mongoose';

export interface IFeedback extends Document {
  user: mongoose.Types.ObjectId;
  type: 'bug' | 'feature' | 'improvement' | 'other';
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'resolved' | 'rejected';
  priority: 'low' | 'medium' | 'high' | 'critical';
  screenshots: string[];
  metadata: {
    browser?: string;
    os?: string;
    device?: string;
    url?: string;
  };
  adminResponse?: string;
  createdAt: Date;
  updatedAt: Date;
}

const feedbackSchema = new Schema<IFeedback>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['bug', 'feature', 'improvement', 'other'],
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
      enum: ['pending', 'in-progress', 'resolved', 'rejected'],
      default: 'pending',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
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
    },
    adminResponse: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
feedbackSchema.index({ user: 1, createdAt: -1 });
feedbackSchema.index({ status: 1 });
feedbackSchema.index({ type: 1 });
feedbackSchema.index({ priority: 1 });

const Feedback = mongoose.model<IFeedback>('Feedback', feedbackSchema);

export default Feedback;
