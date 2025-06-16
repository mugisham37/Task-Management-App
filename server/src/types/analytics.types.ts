import type mongoose from 'mongoose';

// Enhanced type definitions for analytics
export interface ProjectAnalyticsResult {
  _id: mongoose.Types.ObjectId | null;
  projectName: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
}

export interface TaskStatusCount {
  _id: string;
  count: number;
}

export interface TaskPriorityCount {
  _id: string;
  count: number;
}

export interface TasksOverTimeResult {
  _id: {
    year: number;
    month: number;
    day: number;
  };
  created: number;
  completed: number;
  date: Date;
}

export interface TeamMemberTaskResult {
  _id: mongoose.Types.ObjectId;
  userName: string;
  userEmail: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
}

export interface StatusCountMap {
  [key: string]: number;
}

export interface PriorityCountMap {
  [key: string]: number;
}
