export interface FeedbackFilterQuery {
  user?: string;
  type?: 'bug' | 'feature' | 'improvement' | 'other';
  status?: 'pending' | 'in-progress' | 'resolved' | 'rejected';
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface FeedbackPaginationQuery extends FeedbackFilterQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FeedbackStatsByType {
  bug?: number;
  feature?: number;
  improvement?: number;
  other?: number;
}

export interface FeedbackStatsByStatus {
  pending?: number;
  'in-progress'?: number;
  resolved?: number;
  rejected?: number;
}

export interface FeedbackStatsByPriority {
  low?: number;
  medium?: number;
  high?: number;
  critical?: number;
}

export interface MonthlyFeedbackStats {
  year: number;
  month: number;
  count: number;
}

export interface FeedbackStatistics {
  total: number;
  byType: FeedbackStatsByType;
  byStatus: FeedbackStatsByStatus;
  byPriority: FeedbackStatsByPriority;
  monthly: MonthlyFeedbackStats[];
}
