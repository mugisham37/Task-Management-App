import mongoose, { Schema, Model, HydratedDocument } from 'mongoose';
import { IUser } from './user.model';

// Calendar provider enum
export enum CalendarProvider {
  GOOGLE = 'google',
  MICROSOFT = 'microsoft',
  APPLE = 'apple',
  OUTLOOK = 'outlook',
  YAHOO = 'yahoo',
  CALDAV = 'caldav',
  OTHER = 'other',
}

// Sync direction enum
export enum SyncDirection {
  IMPORT = 'import', // Only import events from external calendar
  EXPORT = 'export', // Only export events to external calendar
  BOTH = 'both', // Sync in both directions
}

// Calendar integration settings interface
export interface ICalendarIntegrationSettings {
  syncDirection: SyncDirection;
  syncTasks: boolean;
  syncMeetings: boolean;
  syncDeadlines: boolean;
  defaultReminders: number[]; // Minutes before event
  defaultColor?: string;
  syncAttendees: boolean;
  syncAttachments: boolean;
  syncPrivateEvents: boolean;
  syncRecurringEvents: boolean;
  syncPastEvents: boolean;
  pastEventsSyncPeriod?: number; // Days in the past to sync
  futureEventsSyncPeriod?: number; // Days in the future to sync
}

// Calendar integration interface
export interface ICalendarIntegration {
  user: mongoose.Types.ObjectId | IUser;
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
  error?: string;
  errorCount: number;
  lastErrorAt?: Date;
}

// Define methods interface for type safety
export interface ICalendarIntegrationMethods {
  isTokenExpired(): boolean;
  updateTokens(
    accessToken: string,
    refreshToken?: string,
    expiresIn?: number,
  ): Promise<ICalendarIntegrationDocument>;
  enableSync(): Promise<ICalendarIntegrationDocument>;
  disableSync(): Promise<ICalendarIntegrationDocument>;
  updateSettings(
    settings: Partial<ICalendarIntegrationSettings>,
  ): Promise<ICalendarIntegrationDocument>;
  recordSyncSuccess(): Promise<ICalendarIntegrationDocument>;
  recordSyncError(error: string): Promise<ICalendarIntegrationDocument>;
  resetErrorCount(): Promise<ICalendarIntegrationDocument>;
}

// Calendar integration document interface
export type ICalendarIntegrationDocument = HydratedDocument<
  ICalendarIntegration,
  ICalendarIntegrationMethods
>;

// Calendar integration model interface
export interface ICalendarIntegrationModel
  extends Model<ICalendarIntegration, Record<string, never>, ICalendarIntegrationMethods> {
  getUserIntegrations(userId: mongoose.Types.ObjectId): Promise<ICalendarIntegrationDocument[]>;
  getIntegrationByProviderAndCalendarId(
    userId: mongoose.Types.ObjectId,
    provider: CalendarProvider,
    calendarId: string,
  ): Promise<ICalendarIntegrationDocument | null>;
  getIntegrationsForSync(options?: {
    limit?: number;
    provider?: CalendarProvider;
    minSyncInterval?: number; // Minimum minutes since last sync
  }): Promise<ICalendarIntegrationDocument[]>;
}

// Calendar integration schema
const calendarIntegrationSchema = new Schema<
  ICalendarIntegration,
  ICalendarIntegrationModel,
  ICalendarIntegrationMethods
>(
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
      defaultColor: {
        type: String,
        validate: {
          validator: function (v: string) {
            return !v || /^#[0-9A-F]{6}$/i.test(v);
          },
          message: 'Color must be a valid hex color code (e.g., #4f46e5)',
        },
      },
      syncAttendees: {
        type: Boolean,
        default: true,
      },
      syncAttachments: {
        type: Boolean,
        default: false,
      },
      syncPrivateEvents: {
        type: Boolean,
        default: false,
      },
      syncRecurringEvents: {
        type: Boolean,
        default: true,
      },
      syncPastEvents: {
        type: Boolean,
        default: false,
      },
      pastEventsSyncPeriod: {
        type: Number,
        default: 30, // 30 days in the past
        min: 0,
        max: 365,
      },
      futureEventsSyncPeriod: {
        type: Number,
        default: 90, // 90 days in the future
        min: 1,
        max: 365,
      },
    },
    error: {
      type: String,
    },
    errorCount: {
      type: Number,
      default: 0,
    },
    lastErrorAt: {
      type: Date,
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
calendarIntegrationSchema.index({ user: 1, provider: 1 });
calendarIntegrationSchema.index({ user: 1, provider: 1, calendarId: 1 }, { unique: true });
calendarIntegrationSchema.index({ syncEnabled: 1, lastSyncedAt: 1 });
calendarIntegrationSchema.index({ errorCount: 1 });

// Method to check if token is expired
calendarIntegrationSchema.methods.isTokenExpired = function (): boolean {
  if (!this.tokenExpiry) {
    return false;
  }

  // Consider token expired 5 minutes before actual expiry to allow for refresh
  const expiryWithBuffer = new Date(this.tokenExpiry.getTime() - 5 * 60 * 1000);
  return new Date() > expiryWithBuffer;
};

// Method to update tokens
calendarIntegrationSchema.methods.updateTokens = async function (
  accessToken: string,
  refreshToken?: string,
  expiresIn?: number,
): Promise<ICalendarIntegrationDocument> {
  this.accessToken = accessToken;

  if (refreshToken) {
    this.refreshToken = refreshToken;
  }

  if (expiresIn) {
    this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);
  }

  await this.save();
  return this;
};

// Method to enable sync
calendarIntegrationSchema.methods.enableSync =
  async function (): Promise<ICalendarIntegrationDocument> {
    this.syncEnabled = true;
    await this.save();
    return this;
  };

// Method to disable sync
calendarIntegrationSchema.methods.disableSync =
  async function (): Promise<ICalendarIntegrationDocument> {
    this.syncEnabled = false;
    await this.save();
    return this;
  };

// Method to update settings
calendarIntegrationSchema.methods.updateSettings = async function (
  settings: Partial<ICalendarIntegrationSettings>,
): Promise<ICalendarIntegrationDocument> {
  // Update only the provided settings in a type-safe way
  Object.entries(settings).forEach(([key, value]) => {
    if (value !== undefined && key in this.settings) {
      // Type assertion to avoid index signature error
      (this.settings as unknown as Record<string, unknown>)[key] = value;
    }
  });

  await this.save();
  return this;
};

// Method to record sync success
calendarIntegrationSchema.methods.recordSyncSuccess =
  async function (): Promise<ICalendarIntegrationDocument> {
    this.lastSyncedAt = new Date();
    this.error = undefined;
    this.errorCount = 0;
    this.lastErrorAt = undefined;

    await this.save();
    return this;
  };

// Method to record sync error
calendarIntegrationSchema.methods.recordSyncError = async function (
  error: string,
): Promise<ICalendarIntegrationDocument> {
  this.error = error;
  this.errorCount += 1;
  this.lastErrorAt = new Date();

  // Disable sync after 5 consecutive errors
  if (this.errorCount >= 5) {
    this.syncEnabled = false;
  }

  await this.save();
  return this;
};

// Method to reset error count
calendarIntegrationSchema.methods.resetErrorCount =
  async function (): Promise<ICalendarIntegrationDocument> {
    this.error = undefined;
    this.errorCount = 0;
    this.lastErrorAt = undefined;

    await this.save();
    return this;
  };

// Static method to get user integrations
calendarIntegrationSchema.statics.getUserIntegrations = async function (
  userId: mongoose.Types.ObjectId,
): Promise<ICalendarIntegrationDocument[]> {
  return this.find({ user: userId }).sort({ provider: 1, calendarName: 1 });
};

// Static method to get integration by provider and calendar ID
calendarIntegrationSchema.statics.getIntegrationByProviderAndCalendarId = async function (
  userId: mongoose.Types.ObjectId,
  provider: CalendarProvider,
  calendarId: string,
): Promise<ICalendarIntegrationDocument | null> {
  return this.findOne({
    user: userId,
    provider,
    calendarId,
  });
};

// Static method to get integrations for sync
calendarIntegrationSchema.statics.getIntegrationsForSync = async function (
  options = {},
): Promise<ICalendarIntegrationDocument[]> {
  const {
    limit = 10,
    provider = null,
    minSyncInterval = 15, // 15 minutes
  } = options;

  const query: Record<string, unknown> = {
    syncEnabled: true,
  };

  // Filter by provider if specified
  if (provider) {
    query.provider = provider;
  }

  // Filter by last sync time
  if (minSyncInterval) {
    const minSyncTime = new Date(Date.now() - minSyncInterval * 60 * 1000);
    query.$or = [
      { lastSyncedAt: { $exists: false } },
      { lastSyncedAt: null },
      { lastSyncedAt: { $lt: minSyncTime } },
    ];
  }

  return this.find(query)
    .sort({ lastSyncedAt: 1 }) // Sync oldest first
    .limit(limit);
};

// Create and export CalendarIntegration model
const CalendarIntegration = mongoose.model<ICalendarIntegration, ICalendarIntegrationModel>(
  'CalendarIntegration',
  calendarIntegrationSchema,
);

export default CalendarIntegration;
