import mongoose from 'mongoose';
import { AttendeeStatus } from '../models/calendar-event.model';

/**
 * MongoDB Aggregation Pipeline Stage
 * This type represents a stage in a MongoDB aggregation pipeline
 */
export type PipelineStage =
  | { $match: Record<string, unknown> }
  | { $group: Record<string, unknown> }
  | { $sort: Record<string, unknown> | string }
  | { $project: Record<string, unknown> }
  | { $limit: number }
  | { $skip: number }
  | { $unwind: string | Record<string, unknown> }
  | { $lookup: Record<string, unknown> }
  | { $addFields: Record<string, unknown> }
  | { $count: string }
  | { $replaceRoot: Record<string, unknown> }
  | { $sample: Record<string, unknown> }
  | { $facet: Record<string, unknown> }
  | { $bucket: Record<string, unknown> }
  | { $bucketAuto: Record<string, unknown> }
  | { $sortByCount: Record<string, unknown> | string }
  | { $unionWith: Record<string, unknown> }
  | { $setWindowFields: Record<string, unknown> }
  | { $densify: Record<string, unknown> }
  | { $documents: unknown[] }
  | Record<string, unknown>;

/**
 * Interface for documents with timestamp fields added by Mongoose
 */
export interface TimestampedDocument {
  createdAt: Date;
  updatedAt: Date;
}

export interface MongoQuery {
  $or?: Array<Record<string, unknown>>;
  $and?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface DateRangeQuery {
  $gte?: Date;
  $lte?: Date;
}

export interface AttendeeQuery extends Record<string, unknown> {
  'attendees.user': mongoose.Types.ObjectId;
  'attendees.status': { $in: AttendeeStatus[] };
}

export interface DateRange {
  $gte: Date;
  $lte: Date;
}
