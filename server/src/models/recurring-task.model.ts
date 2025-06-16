import mongoose, { Schema, Document, Types } from 'mongoose';

export enum RecurrenceFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export interface ITaskTemplate {
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
  estimatedHours?: number;
  attachments?: {
    filename: string;
    path: string;
    mimetype: string;
    size: number;
  }[];
}

export interface IRecurringTask extends Document {
  title: string;
  description?: string;
  user: Types.ObjectId;
  project?: Types.ObjectId;
  frequency: RecurrenceFrequency;
  interval: number;
  daysOfWeek?: number[]; // 0-6, Sunday to Saturday (for weekly recurrence)
  daysOfMonth?: number[]; // 1-31 (for monthly recurrence)
  monthsOfYear?: number[]; // 0-11, January to December (for yearly recurrence)
  startDate: Date;
  endDate?: Date;
  active: boolean;
  nextRunDate?: Date;
  lastTaskCreated?: Date;
  createdTasks: Types.ObjectId[];
  taskTemplate: ITaskTemplate;
  createdAt: Date;
  updatedAt: Date;
  calculateNextTaskDate(): Date | null;
}

const recurringTaskSchema = new Schema<IRecurringTask>(
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
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
    },
    frequency: {
      type: String,
      enum: Object.values(RecurrenceFrequency),
      required: true,
    },
    interval: {
      type: Number,
      default: 1,
      min: 1,
    },
    daysOfWeek: {
      type: [Number],
      validate: {
        validator: function (values: number[]) {
          if (this.frequency !== RecurrenceFrequency.WEEKLY) return true;
          return values.length > 0 && values.every((day) => day >= 0 && day <= 6);
        },
        message: 'Days of week must be between 0 (Sunday) and 6 (Saturday)',
      },
    },
    daysOfMonth: {
      type: [Number],
      validate: {
        validator: function (values: number[]) {
          if (this.frequency !== RecurrenceFrequency.MONTHLY) return true;
          return values.length > 0 && values.every((day) => day >= 1 && day <= 31);
        },
        message: 'Days of month must be between 1 and 31',
      },
    },
    monthsOfYear: {
      type: [Number],
      validate: {
        validator: function (values: number[]) {
          if (this.frequency !== RecurrenceFrequency.YEARLY) return true;
          return values.length > 0 && values.every((month) => month >= 0 && month <= 11);
        },
        message: 'Months of year must be between 0 (January) and 11 (December)',
      },
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
    },
    active: {
      type: Boolean,
      default: true,
    },
    nextRunDate: {
      type: Date,
    },
    lastTaskCreated: {
      type: Date,
    },
    createdTasks: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Task',
      },
    ],
    taskTemplate: {
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
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium',
      },
      tags: {
        type: [String],
        default: [],
      },
      estimatedHours: {
        type: Number,
        min: 0,
      },
      attachments: {
        type: [
          {
            filename: String,
            path: String,
            mimetype: String,
            size: Number,
          },
        ],
        default: [],
      },
    },
  },
  {
    timestamps: true,
  },
);

// Method to calculate the next task date based on recurrence settings
recurringTaskSchema.methods.calculateNextTaskDate = function (): Date | null {
  const now = new Date();
  let baseDate = this.lastTaskCreated || this.startDate;
  if (baseDate < now && !this.lastTaskCreated) {
    baseDate = now;
  }

  // Clone the base date to avoid modifying it
  const nextDate = new Date(baseDate);

  // Calculate the next task date based on the frequency
  switch (this.frequency) {
    case RecurrenceFrequency.DAILY:
      nextDate.setDate(nextDate.getDate() + this.interval);
      break;

    case RecurrenceFrequency.WEEKLY:
      // For weekly recurrence, find the next day of the week
      if (this.daysOfWeek && this.daysOfWeek.length > 0) {
        // Sort days of week to ensure we find the next one
        const sortedDays = [...this.daysOfWeek].sort((a, b) => a - b);

        // Find the next day of the week
        const currentDayOfWeek = nextDate.getDay();
        const nextDayOfWeek = sortedDays.find((day) => day > currentDayOfWeek);

        if (nextDayOfWeek !== undefined) {
          // Found a day later in the current week
          nextDate.setDate(nextDate.getDate() + (nextDayOfWeek - currentDayOfWeek));
        } else {
          // Move to the first day of the next week
          nextDate.setDate(nextDate.getDate() + (7 - currentDayOfWeek) + sortedDays[0]);
        }
      } else {
        // If no specific days are specified, just add 7 days
        nextDate.setDate(nextDate.getDate() + 7 * this.interval);
      }
      break;

    case RecurrenceFrequency.MONTHLY:
      // For monthly recurrence, find the next day of the month
      if (this.daysOfMonth && this.daysOfMonth.length > 0) {
        // Sort days of month to ensure we find the next one
        const sortedDays = [...this.daysOfMonth].sort((a, b) => a - b);

        // Find the next day of the month
        const currentDayOfMonth = nextDate.getDate();
        const nextDayOfMonth = sortedDays.find((day) => day > currentDayOfMonth);

        if (nextDayOfMonth !== undefined) {
          // Found a day later in the current month
          nextDate.setDate(nextDayOfMonth);
        } else {
          // Move to the first day of the next month
          nextDate.setMonth(nextDate.getMonth() + this.interval);
          nextDate.setDate(sortedDays[0]);
        }
      } else {
        // If no specific days are specified, just add the interval months
        nextDate.setMonth(nextDate.getMonth() + this.interval);
      }
      break;

    case RecurrenceFrequency.YEARLY:
      // For yearly recurrence, find the next month of the year
      if (this.monthsOfYear && this.monthsOfYear.length > 0) {
        // Sort months of year to ensure we find the next one
        const sortedMonths = [...this.monthsOfYear].sort((a, b) => a - b);

        // Find the next month of the year
        const currentMonth = nextDate.getMonth();
        const nextMonth = sortedMonths.find((month) => month > currentMonth);

        if (nextMonth !== undefined) {
          // Found a month later in the current year
          nextDate.setMonth(nextMonth);
        } else {
          // Move to the first month of the next year
          nextDate.setFullYear(nextDate.getFullYear() + this.interval);
          nextDate.setMonth(sortedMonths[0]);
        }
      } else {
        // If no specific months are specified, just add the interval years
        nextDate.setFullYear(nextDate.getFullYear() + this.interval);
      }
      break;
  }

  // If the task has an end date and the next date is after the end date, return null
  if (this.endDate && nextDate > this.endDate) {
    return null;
  }

  return nextDate;
};

// Pre-save hook to set the next run date if not already set
recurringTaskSchema.pre('save', function (next) {
  if (this.active && !this.nextRunDate) {
    const nextDate = this.calculateNextTaskDate();
    if (nextDate) {
      this.nextRunDate = nextDate;
    } else {
      // If no next date is available (e.g., past end date), deactivate the recurring task
      this.active = false;
    }
  }
  next();
});

const RecurringTask = mongoose.model<IRecurringTask>('RecurringTask', recurringTaskSchema);

export default RecurringTask;
