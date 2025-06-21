import { ActivityType } from '../models/activity.model';
import {
  ActivityDataField,
  TaskActivityData,
  TaskTemplateActivityData,
  UserActivityData,
} from '../types/activity.types';

/**
 * Extended TaskActivityData interface that includes assignedTo property
 * This is needed for TASK_ASSIGNED activities
 */
export interface ExtendedTaskActivityData extends TaskActivityData {
  assignedTo?: string;
}

/**
 * Creates a properly typed ActivityDataField object for task-related activities
 * @param type Activity type
 * @param data Task activity data with optional extended properties
 * @returns Properly typed ActivityDataField object
 */
export function createTaskActivityData(
  type: ActivityType,
  data: ExtendedTaskActivityData,
): ActivityDataField {
  const activityData: ActivityDataField = {};
  // Use a type assertion with unknown as an intermediate step
  activityData[type] = data as unknown as ActivityDataField[keyof ActivityDataField];
  return activityData;
}

/**
 * Creates a properly typed ActivityDataField object for task template-related activities
 * @param type Activity type
 * @param data Task template activity data
 * @returns Properly typed ActivityDataField object
 */
export function createTemplateActivityData(
  type: ActivityType,
  data: TaskTemplateActivityData,
): ActivityDataField {
  const activityData: ActivityDataField = {};
  // Use a type assertion with unknown as an intermediate step
  activityData[type] = data as unknown as ActivityDataField[keyof ActivityDataField];
  return activityData;
}

/**
 * Type guard to check if an object is a valid TaskActivityData
 * @param data Object to check
 * @returns True if the object is a valid TaskActivityData
 */
export function isTaskActivityData(data: unknown): data is TaskActivityData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (('title' in data && typeof (data as { title: unknown }).title === 'string') ||
      ('status' in data && typeof (data as { status: unknown }).status === 'string') ||
      ('priority' in data && typeof (data as { priority: unknown }).priority === 'string'))
  );
}

/**
 * Type guard to check if an object is a valid TaskTemplateActivityData
 * @param data Object to check
 * @returns True if the object is a valid TaskTemplateActivityData
 */
export function isTaskTemplateActivityData(data: unknown): data is TaskTemplateActivityData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (('templateName' in data &&
      typeof (data as { templateName: unknown }).templateName === 'string') ||
      ('isTemplate' in data && typeof (data as { isTemplate: unknown }).isTemplate === 'boolean'))
  );
}

/**
 * Creates a properly typed ActivityDataField object for user-related activities
 * @param type Activity type
 * @param data User activity data
 * @returns Properly typed ActivityDataField object
 */
export function createUserActivityData(
  type: ActivityType,
  data: UserActivityData,
): ActivityDataField {
  const activityData: ActivityDataField = {};
  // Use a type assertion with unknown as an intermediate step
  activityData[type] = data as unknown as ActivityDataField[keyof ActivityDataField];
  return activityData;
}

/**
 * Type guard to check if an object is a valid UserActivityData
 * @param data Object to check
 * @returns True if the object is a valid UserActivityData
 */
export function isUserActivityData(data: unknown): data is UserActivityData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (('action' in data && typeof (data as { action: unknown }).action === 'string') ||
      ('userId' in data && typeof (data as { userId: unknown }).userId === 'string') ||
      ('userName' in data && typeof (data as { userName: unknown }).userName === 'string'))
  );
}
