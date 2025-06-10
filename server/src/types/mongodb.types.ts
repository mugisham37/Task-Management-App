import mongoose from 'mongoose';
import { AttendeeStatus } from '../models/calendar-event.model';

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
