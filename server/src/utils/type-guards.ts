import mongoose from 'mongoose';
import { ITask } from '../models/task.model';
import { TaskActivityData } from '../types/activity.types';

/**
 * Type guard to check if an object is a valid ITask
 * @param obj Object to check
 * @returns True if the object is a valid ITask
 */
export function isTask(obj: unknown): obj is ITask {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '_id' in obj &&
    'title' in obj &&
    'status' in obj &&
    'priority' in obj
  );
}

/**
 * Type guard to check if an object is a valid TaskActivityData
 * @param obj Object to check
 * @returns True if the object is a valid TaskActivityData
 */
export function isTaskActivityData(obj: unknown): obj is TaskActivityData {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (('title' in obj && typeof (obj as { title: unknown }).title === 'string') ||
      ('status' in obj && typeof (obj as { status: unknown }).status === 'string') ||
      ('priority' in obj && typeof (obj as { priority: unknown }).priority === 'string'))
  );
}

/**
 * Type guard to check if an array contains valid ITask objects
 * @param arr Array to check
 * @returns True if the array contains valid ITask objects
 */
export function isTaskArray(arr: unknown): arr is ITask[] {
  return Array.isArray(arr) && arr.every(isTask);
}

/**
 * Safe type assertion for ITask
 * @param obj Object to assert
 * @returns Object as ITask or throws an error if invalid
 */
export function assertTask(obj: unknown): ITask {
  if (!isTask(obj)) {
    throw new Error('Invalid task object');
  }
  // Ensure _id is properly typed as mongoose.Types.ObjectId
  return obj as ITask & { _id: mongoose.Types.ObjectId };
}

/**
 * Safe type assertion for ITask array
 * @param arr Array to assert
 * @returns Array as ITask[] or throws an error if invalid
 */
export function assertTaskArray(arr: unknown): ITask[] {
  if (!isTaskArray(arr)) {
    throw new Error('Invalid task array');
  }
  return arr as ITask[];
}
