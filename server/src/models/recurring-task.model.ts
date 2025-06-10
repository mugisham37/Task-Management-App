import mongoose, { Document, Schema, Model } from 'mongoose';
import { IUser } from './user.model';
import { IProject } from './project.model';
import { IWorkspace } from './workspace.model';
import { ITask, TaskPriority } from './task.model';

// Recurrence frequency enum
export enum RecurrenceFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

// Recurrence end type enum
export enum RecurrenceEndType {
  NEVER = 'never',
  ON_DATE = 'on_date',
  AFTER_OCCURRENCES = 'after_occurrences',
}

// Task template interface
export interface ITaskTemplate {
  title: string;
  description?: string;
  priority: TaskPriority;
  estimatedHours?: number;
  tags?: string[];
  checklist?: {
    title: string;
    completed: boolean;
  }[];
  attachments?: {
    filename: string;
    path: string;
    mimetype: string;
    size: number;
  }[];
}

// Recurring task interface
export interface IRecurringTask {
  title: string;
  description?: string;
  user: mongoose.Types.ObjectId | IUser;
  project?: mongoose.Types.ObjectId | IProject;
  workspace?: mongoose.Types.ObjectId | IWorkspace;
  frequency: RecurrenceFrequency;
  interval: number; // Every X days/weeks/months/years
  daysOfWeek?: number[]; // 0-6, Sunday to Saturday (for weekly recurrence)
  daysOfMonth?: number[]; // 1-31 (for monthly recurrence)
  monthsOfYear?: number[]; // 0-11, January to December (for yearly recurrence)
  startDate: Date;
  endType: RecurrenceEndType;
  endDate?: Date; // For ON_DATE end type
  occurrences?: number; // For AFTER_OCCURRENCES end type
  active: boolean;
  nextRunDate?: Date | null; // Updated to accept null values
  lastTaskCreated?: Date;
  createdTasks: (mongoose.Types.ObjectId | ITask)[];
  taskTemplate: ITaskTemplate;
}

// Recurring task document interface
export interface IRecurringTaskDocument extends IRecurringTask, Document {
  calculateNextTaskDate(): Date | null;
  createTask(): Promise<mongoose.Types.ObjectId>;
  pause(): Promise<IRecurringTaskDocument>;
  resume(): Promise<IRecurringTaskDocument>;
  updateNextRunDate(): Promise<IRecurringTaskDocument>;
  hasReachedEndCondition(): boolean;
}

// Recurring task model interface
export interface IRecurringTaskModel extends Model<IRecurringTaskDocument> {
  getDueRecurringTasks(): Promise<IRecurringTaskDocument[]>;
  getUserRecurringTasks(userId: mongoose.Types.ObjectId): Promise<IRecurringTaskDocument[]>;
}

// Recurring task schema
const recurringTaskSchema = new Schema<IRecurringTaskDocument>(
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
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
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
      max: 365,
    },
    daysOfWeek: {
      type: [Number],
      validate: {
        validator: function (this: IRecurringTaskDocument, values: number[]) {
          if (this.frequency !== RecurrenceFrequency.WEEKLY) return true;
          return values.length > 0 && values.every((day) => day >= 0 && day <= 6);
        },
        message: 'Days of week must be between 0 (Sunday) and 6 (Saturday)',
      },
    },
    daysOfMonth: {
      type: [Number],
      validate: {
        validator: function (this: IRecurringTaskDocument, values: number[]) {
          if (this.frequency !== RecurrenceFrequency.MONTHLY) return true;
          return values.length > 0 && values.every((day) => day >= 1 && day <= 31);
        },
        message: 'Days of month must be between 1 and 31',
      },
    },
    monthsOfYear: {
      type: [Number],
      validate: {
        validator: function (this: IRecurringTaskDocument, values: number[]) {
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
    endType: {
      type: String,
      enum: Object.values(RecurrenceEndType),
      default: RecurrenceEndType.NEVER,
    },
    endDate: {
      type: Date,
      validate: {
        validator: function (this: IRecurringTaskDocument, value: Date) {
          if (this.endType !== RecurrenceEndType.ON_DATE) return true;
          return value > this.startDate;
        },
        message: 'End date must be after start date',
      },
    },
    occurrences: {
      type: Number,
      min: 1,
      validate: {
        validator: function (this: IRecurringTaskDocument, value: number) {
          if (this.endType !== RecurrenceEndType.AFTER_OCCURRENCES) return true;
          return value > 0;
        },
        message: 'Occurrences must be greater than 0',
      },
    },
    active: {
      type: Boolean,
      default: true,
    },
    nextRunDate: {
      type: Date,
      default: null, // Set default to null
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
        enum: Object.values(TaskPriority),
        default: TaskPriority.MEDIUM,
      },
      estimatedHours: {
        type: Number,
        min: 0,
      },
      tags: {
        type: [String],
        default: [],
      },
      checklist: {
        type: [
          {
            title: {
              type: String,
              required: true,
              trim: true,
              maxlength: 100,
            },
            completed: {
              type: Boolean,
              default: false,
            },
          },
        ],
        default: [],
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
    timestamps: true, // Automatically add createdAt and updatedAt fields
  },
);

// Indexes for performance
recurringTaskSchema.index({ user: 1 });
recurringTaskSchema.index({ project: 1 });
recurringTaskSchema.index({ workspace: 1 });
recurringTaskSchema.index({ active: 1, nextRunDate: 1 });
recurringTaskSchema.index({ frequency: 1 });

// Helper function to check if a date is valid
function isValidDate(date: Date | null): date is Date {
  return date !== null && date instanceof Date && !isNaN(date.getTime());
}

// Define all methods with proper typing
recurringTaskSchema.methods = {
  // Method to calculate the next task date based on recurrence settings
  calculateNextTaskDate: function (this: IRecurringTaskDocument): Date | null {
    const now = new Date();
    let baseDate = this.lastTaskCreated || this.startDate;

    // If the base date is in the past and no task has been created yet,
    // use the current date as the base date
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
            nextDate.setDate(
              nextDate.getDate() + (7 - currentDayOfWeek) + sortedDays[0] + (this.interval - 1) * 7,
            );
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

    // Check if the task has reached its end condition
    if (this.hasReachedEndCondition()) {
      return null;
    }

    // Check if the calculated next date is after the end date (if specified)
    if (this.endType === RecurrenceEndType.ON_DATE && this.endDate && nextDate > this.endDate) {
      return null;
    }

    return nextDate;
  },

  // Method to check if the recurring task has reached its end condition
  hasReachedEndCondition: function (this: IRecurringTaskDocument): boolean {
    // If the task is not active, it has reached its end condition
    if (!this.active) {
      return true;
    }

    // Check end conditions based on end type
    switch (this.endType) {
      case RecurrenceEndType.NEVER:
        return false;

      case RecurrenceEndType.ON_DATE:
        return this.endDate ? new Date() > this.endDate : false;

      case RecurrenceEndType.AFTER_OCCURRENCES:
        return this.occurrences ? this.createdTasks.length >= this.occurrences : false;

      default:
        return false;
    }
  },

  // Method to create a task from the recurring task template
  createTask: async function (this: IRecurringTaskDocument): Promise<mongoose.Types.ObjectId> {
    const Task = mongoose.model('Task');

    // Create a new task based on the template
    const task = new Task({
      title: this.taskTemplate.title,
      description: this.taskTemplate.description,
      priority: this.taskTemplate.priority,
      estimatedHours: this.taskTemplate.estimatedHours,
      tags: this.taskTemplate.tags,
      checklist: this.taskTemplate.checklist,
      attachments: this.taskTemplate.attachments,
      project: this.project,
      workspace: this.workspace,
      createdBy: this.user,
      isRecurring: true,
      recurringTaskId: this._id,
    });

    await task.save();

    // Update the recurring task
    this.lastTaskCreated = new Date();
    this.createdTasks.push(task._id);

    // Calculate the next run date
    this.nextRunDate = this.calculateNextTaskDate();

    // If there's no next run date, mark the recurring task as inactive
    if (!this.nextRunDate) {
      this.active = false;
    }

    await this.save();

    return task._id;
  },

  // Method to pause the recurring task
  pause: async function (this: IRecurringTaskDocument): Promise<IRecurringTaskDocument> {
    this.active = false;
    await this.save();
    return this;
  },

  // Method to resume the recurring task
  resume: async function (this: IRecurringTaskDocument): Promise<IRecurringTaskDocument> {
    this.active = true;

    // If the next run date is in the past or not set, calculate a new one
    const now = new Date();
    if (!this.nextRunDate || this.nextRunDate < now) {
      this.nextRunDate = this.calculateNextTaskDate();
    }

    await this.save();
    return this;
  },

  // Method to update the next run date
  updateNextRunDate: async function (
    this: IRecurringTaskDocument,
  ): Promise<IRecurringTaskDocument> {
    const nextDate = this.calculateNextTaskDate();

    if (!isValidDate(nextDate)) {
      this.active = false;
      this.nextRunDate = null;
    } else {
      this.nextRunDate = nextDate;
    }

    await this.save();
    return this;
  },
};

// Pre-save hook to set the next run date if not already set
recurringTaskSchema.pre<IRecurringTaskDocument>('save', function (next) {
  if (this.active && !this.nextRunDate) {
    const nextDate = this.calculateNextTaskDate();
    this.nextRunDate = nextDate;
  }
  next();
});

// Static method to get due recurring tasks
recurringTaskSchema.statics.getDueRecurringTasks = async function (): Promise<
  IRecurringTaskDocument[]
> {
  const now = new Date();
  return this.find({
    active: true,
    nextRunDate: { $lte: now },
  });
};

// Static method to get user's recurring tasks
recurringTaskSchema.statics.getUserRecurringTasks = async function (
  userId: mongoose.Types.ObjectId,
): Promise<IRecurringTaskDocument[]> {
  return this.find({ user: userId })
    .sort({ active: -1, nextRunDate: 1 })
    .populate('project', 'name')
    .populate('workspace', 'name')
    .populate('createdTasks', 'title status');
};

// Create and export RecurringTask model
const RecurringTask = mongoose.model<IRecurringTaskDocument, IRecurringTaskModel>(
  'RecurringTask',
  recurringTaskSchema,
);

export default RecurringTask;
