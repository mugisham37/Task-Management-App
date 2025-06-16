import type mongoose from 'mongoose';

/**
 * Generic type for Mongoose document
 */
export interface MongooseDocument<T = Record<string, unknown>> extends mongoose.Document {
  toObject(): T;
}

/**
 * Generic type for Mongoose model
 */
export type MongooseModel<T = Record<string, unknown>> = mongoose.Model<MongooseDocument<T>>;

/**
 * Type for database record with ID
 */
export interface DatabaseRecord {
  _id: mongoose.Types.ObjectId | string;
  [key: string]: unknown;
}

/**
 * Type for member in team
 */
export interface TeamMember {
  user: mongoose.Types.ObjectId | string;
  role: string;
  joinedAt: Date;
  [key: string]: unknown;
}
