import mongoose from 'mongoose';
import { ITaskDocument } from '../models/task.model';

/**
 * Extended task interface with assignees for notification purposes
 */
export interface ITaskWithAssignees extends ITaskDocument {
  assignees?: Array<{
    user: mongoose.Types.ObjectId;
    _id: mongoose.Types.ObjectId;
  }>;
}
