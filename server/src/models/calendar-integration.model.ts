import mongoose, { Schema, Document, Types } from 'mongoose';

export enum CalendarProvider {
  GOOGLE = 'google',
  MICROSOFT = 'microsoft',
  APPLE = 'apple',
  OTHER = 'other',
}

export enum SyncDirection {
  IMPORT = 'import', // Only import events from external calendar
  EXPORT = 'export', // Only export events to external calendar
  BOTH = 'both', // Sync in both directions
}

export interface ICalendarIntegrationSettings {
  syncDirection: SyncDirection;
  syncTasks: boolean;
  syncMeetings: boolean;
  syncDeadlines: boolean;
  defaultReminders: number[]; // Minutes before event
}

export interface ICalendarIntegration extends Document {
  user: Types.ObjectId;
  provider: CalendarProvider;
  providerAccountId: string;
  calendarId: string;
  calendarName: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiry?: Date;
  syncEnabled: boolean;
  lastSyncedAt?: Date;
  settings: ICalendarIntegrationSettings;
  createdAt: Date;
  updatedAt: Date;
}

const calendarIntegrationSchema = new Schema<ICalendarIntegration>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    provider: {
      type: String,
      enum: Object.values(CalendarProvider),
      required: true,
    },
    providerAccountId: {
      type: String,
      required: true,
    },
    calendarId: {
      type: String,
      required: true,
    },
    calendarName: {
      type: String,
      required: true,
      trim: true,
    },
    accessToken: {
      type: String,
      required: true,
    },
    refreshToken: {
      type: String,
    },
    tokenExpiry: {
      type: Date,
    },
    syncEnabled: {
      type: Boolean,
      default: true,
    },
    lastSyncedAt: {
      type: Date,
    },
    settings: {
      syncDirection: {
        type: String,
        enum: Object.values(SyncDirection),
        default: SyncDirection.BOTH,
      },
      syncTasks: {
        type: Boolean,
        default: true,
      },
      syncMeetings: {
        type: Boolean,
        default: true,
      },
      syncDeadlines: {
        type: Boolean,
        default: true,
      },
      defaultReminders: {
        type: [Number],
        default: [30], // 30 minutes before by default
      },
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for user and calendar
calendarIntegrationSchema.index({ user: 1, provider: 1, calendarId: 1 }, { unique: true });

const CalendarIntegration = mongoose.model<ICalendarIntegration>(
  'CalendarIntegration',
  calendarIntegrationSchema,
);

export default CalendarIntegration;
