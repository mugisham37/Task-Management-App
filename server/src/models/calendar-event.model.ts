import mongoose, { Document, Schema, Model } from 'mongoose';
import { IUser } from './user.model';
import { ITask } from './task.model';
import { IProject } from './project.model';
import { IWorkspace } from './workspace.model';
import { ITeam } from './team.model';
import { MongoQuery, DateRangeQuery, AttendeeQuery } from '../types/mongodb.types';

// Event type enum
export enum EventType {
  TASK = 'task',
  MEETING = 'meeting',
  DEADLINE = 'deadline',
  OTHER = 'other',
}

// Attendee status enum
export enum AttendeeStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  TENTATIVE = 'tentative',
}

// Attendee interface
export interface IAttendee {
  user: mongoose.Types.ObjectId | IUser;
  status: AttendeeStatus;
  responseTime?: Date;
  responseMessage?: string;
}

// Reminder interface
export interface IReminder {
  time: number; // Minutes before the event
  sent: boolean;
  sentAt?: Date;
}

// Calendar event interface
export interface ICalendarEvent {
  title: string;
  description?: string;
  type: EventType;
  startDate: Date;
  endDate?: Date;
  allDay: boolean;
  location?: string;
  url?: string;
  color?: string;
  user: mongoose.Types.ObjectId | IUser;
  task?: mongoose.Types.ObjectId | ITask;
  project?: mongoose.Types.ObjectId | IProject;
  workspace?: mongoose.Types.ObjectId | IWorkspace;
  team?: mongoose.Types.ObjectId | ITeam;
  attendees: IAttendee[];
  isRecurring: boolean;
  recurrenceRule?: string; // iCalendar RRULE format
  reminders: IReminder[];
  externalCalendarId?: string;
  externalEventId?: string;
  isPrivate: boolean;
  isCancelled: boolean;
  cancelledAt?: Date;
  cancelReason?: string;
}

// Calendar event document interface
export interface ICalendarEventDocument extends ICalendarEvent, Document {
  addAttendee(
    userId: mongoose.Types.ObjectId,
    status?: AttendeeStatus,
  ): Promise<ICalendarEventDocument>;
  removeAttendee(userId: mongoose.Types.ObjectId): Promise<ICalendarEventDocument>;
  updateAttendeeStatus(
    userId: mongoose.Types.ObjectId,
    status: AttendeeStatus,
    message?: string,
  ): Promise<ICalendarEventDocument>;
  addReminder(time: number): Promise<ICalendarEventDocument>;
  removeReminder(time: number): Promise<ICalendarEventDocument>;
  markReminderAsSent(time: number): Promise<ICalendarEventDocument>;
  cancel(reason?: string): Promise<ICalendarEventDocument>;
  getDuration(): number; // Returns duration in minutes
  isUserAttending(userId: mongoose.Types.ObjectId): boolean;
  getAttendeeStatus(userId: mongoose.Types.ObjectId): AttendeeStatus | null;
  getNextReminder(): IReminder | null;
}

// Calendar query options interface
export interface CalendarQueryOptions {
  startDate?: Date | null;
  endDate?: Date | null;
  type?: EventType | null;
  includeAttending?: boolean;
}

// Calendar event model interface
export interface ICalendarEventModel extends Model<ICalendarEventDocument> {
  getUserEvents(
    userId: mongoose.Types.ObjectId,
    options?: CalendarQueryOptions,
  ): Promise<ICalendarEventDocument[]>;
  getTaskEvents(taskId: mongoose.Types.ObjectId): Promise<ICalendarEventDocument[]>;
  getProjectEvents(projectId: mongoose.Types.ObjectId): Promise<ICalendarEventDocument[]>;
  getTeamEvents(teamId: mongoose.Types.ObjectId): Promise<ICalendarEventDocument[]>;
  getWorkspaceEvents(workspaceId: mongoose.Types.ObjectId): Promise<ICalendarEventDocument[]>;
  getDueReminders(): Promise<{ event: ICalendarEventDocument; reminder: IReminder }[]>;
}

// Calendar event schema
const calendarEventSchema = new Schema<ICalendarEventDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    type: {
      type: String,
      enum: Object.values(EventType),
      default: EventType.OTHER,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      validate: {
        validator: function (this: ICalendarEventDocument, value: Date) {
          // Skip validation if end date is not provided
          if (!value) return true;

          // End date must be after start date
          return value > this.startDate;
        },
        message: 'End date must be after start date',
      },
    },
    allDay: {
      type: Boolean,
      default: false,
    },
    location: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    url: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    color: {
      type: String,
      default: '#4f46e5', // Indigo color
      validate: {
        validator: function (v: string) {
          return /^#[0-9A-F]{6}$/i.test(v);
        },
        message: 'Color must be a valid hex color code (e.g., #4f46e5)',
      },
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    task: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
    },
    team: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
    },
    attendees: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        status: {
          type: String,
          enum: Object.values(AttendeeStatus),
          default: AttendeeStatus.PENDING,
        },
        responseTime: {
          type: Date,
        },
        responseMessage: {
          type: String,
          trim: true,
          maxlength: 500,
        },
      },
    ],
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurrenceRule: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    reminders: [
      {
        time: {
          type: Number,
          required: true,
          min: 0,
        },
        sent: {
          type: Boolean,
          default: false,
        },
        sentAt: {
          type: Date,
        },
      },
    ],
    externalCalendarId: {
      type: String,
    },
    externalEventId: {
      type: String,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    isCancelled: {
      type: Boolean,
      default: false,
    },
    cancelledAt: {
      type: Date,
    },
    cancelReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
calendarEventSchema.index({ user: 1, startDate: 1 });
calendarEventSchema.index({ task: 1 });
calendarEventSchema.index({ project: 1 });
calendarEventSchema.index({ workspace: 1 });
calendarEventSchema.index({ team: 1 });
calendarEventSchema.index({ 'attendees.user': 1 });
calendarEventSchema.index({ startDate: 1, endDate: 1 });
calendarEventSchema.index({ type: 1 });
calendarEventSchema.index({ isRecurring: 1 });
calendarEventSchema.index({ isCancelled: 1 });
calendarEventSchema.index({ title: 'text', description: 'text', location: 'text' });

// Method to add an attendee
calendarEventSchema.methods.addAttendee = async function (
  userId: mongoose.Types.ObjectId,
  status: AttendeeStatus = AttendeeStatus.PENDING,
): Promise<ICalendarEventDocument> {
  // Check if user is already an attendee
  const existingAttendee = this.attendees.find(
    (attendee: IAttendee) => attendee.user.toString() === userId.toString(),
  );

  if (existingAttendee) {
    // Update status if different
    if (existingAttendee.status !== status) {
      existingAttendee.status = status;
      existingAttendee.responseTime = new Date();
      await this.save();
    }
    return this as unknown as ICalendarEventDocument;
  }

  // Add new attendee
  this.attendees.push({
    user: userId,
    status,
    responseTime: status !== AttendeeStatus.PENDING ? new Date() : undefined,
  });

  await this.save();
  return this as unknown as ICalendarEventDocument;
};

// Method to remove an attendee
calendarEventSchema.methods.removeAttendee = async function (
  userId: mongoose.Types.ObjectId,
): Promise<ICalendarEventDocument> {
  this.attendees = this.attendees.filter(
    (attendee: IAttendee) => attendee.user.toString() !== userId.toString(),
  );

  await this.save();
  return this as unknown as ICalendarEventDocument;
};

// Method to update attendee status
calendarEventSchema.methods.updateAttendeeStatus = async function (
  userId: mongoose.Types.ObjectId,
  status: AttendeeStatus,
  message?: string,
): Promise<ICalendarEventDocument> {
  const attendee = this.attendees.find((a: IAttendee) => a.user.toString() === userId.toString());

  if (!attendee) {
    // Add as new attendee if not found
    return this.addAttendee(userId, status);
  }

  attendee.status = status;
  attendee.responseTime = new Date();

  if (message) {
    attendee.responseMessage = message;
  }

  await this.save();
  return this as unknown as ICalendarEventDocument;
};

// Method to add a reminder
calendarEventSchema.methods.addReminder = async function (
  time: number,
): Promise<ICalendarEventDocument> {
  // Check if reminder already exists
  const existingReminder = this.reminders.find((reminder: IReminder) => reminder.time === time);

  if (!existingReminder) {
    this.reminders.push({
      time,
      sent: false,
    });

    // Sort reminders by time
    this.reminders.sort((a: IReminder, b: IReminder) => a.time - b.time);

    await this.save();
  }

  return this as unknown as ICalendarEventDocument;
};

// Method to remove a reminder
calendarEventSchema.methods.removeReminder = async function (
  time: number,
): Promise<ICalendarEventDocument> {
  this.reminders = this.reminders.filter((reminder: IReminder) => reminder.time !== time);
  await this.save();
  return this as unknown as ICalendarEventDocument;
};

// Method to mark a reminder as sent
calendarEventSchema.methods.markReminderAsSent = async function (
  time: number,
): Promise<ICalendarEventDocument> {
  const reminder = this.reminders.find((r: IReminder) => r.time === time);

  if (reminder) {
    reminder.sent = true;
    reminder.sentAt = new Date();
    await this.save();
  }

  return this as unknown as ICalendarEventDocument;
};

// Method to cancel an event
calendarEventSchema.methods.cancel = async function (
  reason?: string,
): Promise<ICalendarEventDocument> {
  this.isCancelled = true;
  this.cancelledAt = new Date();

  if (reason) {
    this.cancelReason = reason;
  }

  await this.save();
  return this as unknown as ICalendarEventDocument;
};

// Method to get event duration in minutes
calendarEventSchema.methods.getDuration = function (): number {
  if (!this.endDate) {
    return 0;
  }

  const durationMs = this.endDate.getTime() - this.startDate.getTime();
  return Math.round(durationMs / (1000 * 60));
};

// Method to check if a user is attending
calendarEventSchema.methods.isUserAttending = function (userId: mongoose.Types.ObjectId): boolean {
  return this.attendees.some(
    (attendee: IAttendee) =>
      attendee.user.toString() === userId.toString() &&
      (attendee.status === AttendeeStatus.ACCEPTED || attendee.status === AttendeeStatus.TENTATIVE),
  );
};

// Method to get attendee status
calendarEventSchema.methods.getAttendeeStatus = function (
  userId: mongoose.Types.ObjectId,
): AttendeeStatus | null {
  const attendee = this.attendees.find((a: IAttendee) => a.user.toString() === userId.toString());

  return attendee ? attendee.status : null;
};

// Method to get the next reminder that hasn't been sent
calendarEventSchema.methods.getNextReminder = function (): IReminder | null {
  const unsent = this.reminders.filter((reminder: IReminder) => !reminder.sent);

  if (unsent.length === 0) {
    return null;
  }

  // Sort by time (ascending) and return the first one
  return unsent.sort((a: IReminder, b: IReminder) => a.time - b.time)[0];
};

// Static method to get user events
calendarEventSchema.statics.getUserEvents = async function (
  userId: mongoose.Types.ObjectId,
  options: CalendarQueryOptions = {},
): Promise<ICalendarEventDocument[]> {
  const { startDate = null, endDate = null, type = null, includeAttending = true } = options;

  // Build query
  const query: MongoQuery = {
    isCancelled: false,
  };

  // Date range filter
  if (startDate || endDate) {
    query.$or = [];

    if (startDate && endDate) {
      // Events that start or end within the range, or span the entire range
      const startDateRange: DateRangeQuery = { $gte: startDate, $lte: endDate };
      const endDateRange: DateRangeQuery = { $gte: startDate, $lte: endDate };

      query.$or.push(
        { startDate: startDateRange },
        { endDate: endDateRange },
        { $and: [{ startDate: { $lte: startDate } }, { endDate: { $gte: endDate } }] },
      );
    } else if (startDate) {
      query.$or.push({ startDate: { $gte: startDate } });
    } else if (endDate) {
      query.$or.push({ endDate: { $lte: endDate } });
    }
  }

  // Type filter
  if (type) {
    query.type = type;
  }

  // User filter (events created by user or where user is an attendee)
  if (includeAttending) {
    query.$or = query.$or || [];
    const attendeeQuery: AttendeeQuery = {
      'attendees.user': userId,
      'attendees.status': { $in: [AttendeeStatus.ACCEPTED, AttendeeStatus.TENTATIVE] },
    };
    query.$or.push({ user: userId }, attendeeQuery);
  } else {
    query.user = userId;
  }

  return this.find(query)
    .sort({ startDate: 1 })
    .populate('user', 'name avatar')
    .populate('task', 'title')
    .populate('project', 'name')
    .populate('workspace', 'name')
    .populate('team', 'name')
    .populate('attendees.user', 'name avatar');
};

// Static method to get task events
calendarEventSchema.statics.getTaskEvents = async function (
  taskId: mongoose.Types.ObjectId,
): Promise<ICalendarEventDocument[]> {
  return this.find({ task: taskId, isCancelled: false })
    .sort({ startDate: 1 })
    .populate('user', 'name avatar')
    .populate('attendees.user', 'name avatar');
};

// Static method to get project events
calendarEventSchema.statics.getProjectEvents = async function (
  projectId: mongoose.Types.ObjectId,
): Promise<ICalendarEventDocument[]> {
  return this.find({ project: projectId, isCancelled: false })
    .sort({ startDate: 1 })
    .populate('user', 'name avatar')
    .populate('task', 'title')
    .populate('attendees.user', 'name avatar');
};

// Static method to get team events
calendarEventSchema.statics.getTeamEvents = async function (
  teamId: mongoose.Types.ObjectId,
): Promise<ICalendarEventDocument[]> {
  return this.find({ team: teamId, isCancelled: false })
    .sort({ startDate: 1 })
    .populate('user', 'name avatar')
    .populate('task', 'title')
    .populate('project', 'name')
    .populate('attendees.user', 'name avatar');
};

// Static method to get workspace events
calendarEventSchema.statics.getWorkspaceEvents = async function (
  workspaceId: mongoose.Types.ObjectId,
): Promise<ICalendarEventDocument[]> {
  return this.find({ workspace: workspaceId, isCancelled: false })
    .sort({ startDate: 1 })
    .populate('user', 'name avatar')
    .populate('task', 'title')
    .populate('project', 'name')
    .populate('attendees.user', 'name avatar');
};

// Static method to get due reminders
calendarEventSchema.statics.getDueReminders = async function (): Promise<
  { event: ICalendarEventDocument; reminder: IReminder }[]
> {
  const now = new Date();
  const events = await this.find({
    isCancelled: false,
    startDate: { $gt: now },
    'reminders.sent': false,
  });

  const dueReminders: { event: ICalendarEventDocument; reminder: IReminder }[] = [];

  events.forEach((event: ICalendarEventDocument) => {
    event.reminders.forEach((reminder: IReminder) => {
      if (!reminder.sent) {
        const reminderTime = new Date(event.startDate.getTime() - reminder.time * 60 * 1000);

        if (reminderTime <= now) {
          dueReminders.push({ event, reminder });
        }
      }
    });
  });

  return dueReminders;
};

// Create and export CalendarEvent model
const CalendarEvent = mongoose.model<ICalendarEventDocument, ICalendarEventModel>(
  'CalendarEvent',
  calendarEventSchema,
);

export default CalendarEvent;
