import mongoose, { Schema, Document, Types } from 'mongoose';

export enum EventType {
  TASK = 'task',
  MEETING = 'meeting',
  DEADLINE = 'deadline',
  OTHER = 'other',
}

export interface IAttendee {
  user: Types.ObjectId;
  status: 'pending' | 'accepted' | 'declined';
}

export interface IReminder {
  time: number; // Minutes before the event
  sent: boolean;
}

export interface ICalendarEvent extends Document {
  title: string;
  description?: string;
  type: EventType;
  startDate: Date;
  endDate?: Date;
  allDay: boolean;
  location?: string;
  url?: string;
  color?: string;
  user: Types.ObjectId;
  task?: Types.ObjectId;
  project?: Types.ObjectId;
  workspace?: Types.ObjectId;
  team?: Types.ObjectId;
  attendees: IAttendee[];
  isRecurring: boolean;
  recurrenceRule?: string;
  reminders: IReminder[];
  externalCalendarId?: string;
  externalEventId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const calendarEventSchema = new Schema<ICalendarEvent>(
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
    attendees: {
      type: [
        {
          user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
          },
          status: {
            type: String,
            enum: ['pending', 'accepted', 'declined'],
            default: 'pending',
          },
        },
      ],
      default: [],
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurrenceRule: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    reminders: {
      type: [
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
        },
      ],
      default: [],
    },
    externalCalendarId: {
      type: String,
    },
    externalEventId: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

// Index for faster searches
calendarEventSchema.index({ title: 'text', description: 'text', location: 'text' });

// Index for date range queries
calendarEventSchema.index({ startDate: 1, endDate: 1 });

// Index for user and attendee queries
calendarEventSchema.index({ user: 1 });
calendarEventSchema.index({ 'attendees.user': 1 });

const CalendarEvent = mongoose.model<ICalendarEvent>('CalendarEvent', calendarEventSchema);

export default CalendarEvent;
