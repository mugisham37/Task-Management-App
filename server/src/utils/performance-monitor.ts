import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

/**
 * Interface for metric tags
 */
interface MetricTags {
  method?: string;
  path?: string;
  query?: Record<string, unknown>;
  userId?: string;
  requestId?: string;
  checkpoints?: Record<string, number>;
  id?: string;
  [key: string]: unknown;
}

/**
 * Performance metric type
 */
interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  tags?: MetricTags;
}

/**
 * Timer handle for measuring operation duration
 */
interface TimerHandle {
  end: () => number;
  checkpoint: (checkpointName: string) => TimerHandle;
}

/**
 * Performance monitor class
 * Singleton class for tracking and logging performance metrics
 */
class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Metric[] = [];
  private readonly maxMetricsCount = 1000;
  private readonly flushInterval = 60000; // 1 minute
  private readonly slowThreshold = 500; // 500ms
  private flushTimer: NodeJS.Timeout | null = null;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    // Start flush timer
    this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
  }

  /**
   * Get singleton instance
   * @returns PerformanceMonitor instance
   */
  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start a timer for measuring operation duration
   * @param operation Operation name
   * @param context Additional context
   * @returns Timer handle
   */
  public startTimer(operation: string, context?: MetricTags): TimerHandle {
    const startTime = process.hrtime.bigint();
    const checkpoints: Record<string, number> = {};
    const id = uuidv4();

    const end = (): number => {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      this.recordMetric(operation, duration, {
        ...context,
        checkpoints,
        id,
      });

      return duration;
    };

    const checkpoint = (checkpointName: string): TimerHandle => {
      const checkpointTime = process.hrtime.bigint();
      const checkpointDuration = Number(checkpointTime - startTime) / 1000000;
      checkpoints[checkpointName] = checkpointDuration;
      return { end, checkpoint };
    };

    return { end, checkpoint };
  }

  /**
   * Record a metric
   * @param name Metric name
   * @param value Metric value
   * @param tags Additional tags
   */
  public recordMetric(name: string, value: number, tags?: MetricTags): void {
    this.metrics.push({
      name,
      value,
      timestamp: new Date(),
      tags,
    });

    // Log slow operations
    if (name.includes('request') && value > this.slowThreshold) {
      logger.warn(`Slow operation detected: ${name} - ${value.toFixed(2)}ms`, {
        operation: name,
        duration: value,
        ...tags,
      });
    }

    // Flush if we have too many metrics
    if (this.metrics.length >= this.maxMetricsCount) {
      this.flush();
    }
  }

  /**
   * Flush metrics to log
   */
  public flush(): void {
    if (this.metrics.length === 0) {
      return;
    }

    // Calculate statistics
    const metricsByName = this.groupBy(this.metrics, 'name');
    const stats = Object.entries(metricsByName).map(([name, metrics]) => {
      const values = metrics.map((m) => m.value);
      const count = values.length;
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / count;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const p95 = this.percentile(values, 95);

      return {
        name,
        count,
        avg,
        min,
        max,
        p95,
      };
    });

    // Log statistics
    logger.info('Performance metrics', { stats });

    // Clear metrics
    this.metrics = [];
  }

  /**
   * Get system metrics
   * @returns System metrics
   */
  public getSystemMetrics(): Record<string, unknown> {
    const loadAvg = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = process.memoryUsage();

    return {
      cpu: {
        loadAvg1m: loadAvg[0],
        loadAvg5m: loadAvg[1],
        loadAvg15m: loadAvg[2],
        cores: os.cpus().length,
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usedPercentage: (usedMem / totalMem) * 100,
        process: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
        },
      },
      uptime: os.uptime(),
      processUptime: process.uptime(),
    };
  }

  /**
   * Group array by key
   * @param array Array to group
   * @param key Key to group by
   * @returns Grouped array
   */
  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce(
      (result, item) => {
        const groupKey = String(item[key]);
        if (!result[groupKey]) {
          result[groupKey] = [];
        }
        result[groupKey].push(item);
        return result;
      },
      {} as Record<string, T[]>,
    );
  }

  /**
   * Calculate percentile
   * @param values Array of values
   * @param p Percentile (0-100)
   * @returns Percentile value
   */
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;

    // Sort values
    const sorted = [...values].sort((a, b) => a - b);

    // Calculate index
    const index = Math.ceil((p / 100) * sorted.length) - 1;

    return sorted[index];
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}

/**
 * Express middleware for monitoring request performance
 * @param options Middleware options
 * @returns Express middleware
 */
export const performanceMonitorMiddleware = (
  options: {
    excludePaths?: string[];
    slowThreshold?: number;
  } = {},
) => {
  const { excludePaths = ['/health', '/api/health'], slowThreshold = 500 } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip excluded paths
    if (excludePaths.some((path) => req.path.startsWith(path))) {
      return next();
    }

    // Add request ID if not present
    if (!req.headers['x-request-id']) {
      req.headers['x-request-id'] = uuidv4();
    }

    // Store start time on request object
    const reqWithStartTime = req as Request & { startTime: number };
    reqWithStartTime.startTime = Date.now();

    // Create operation name
    const operation = `request:${req.method}:${req.path}`;

    // Start timer
    const timer = PerformanceMonitor.getInstance().startTimer(operation, {
      method: req.method,
      path: req.path,
      query: req.query,
      userId: (req as { user?: { id: string } }).user?.id,
      requestId:
        typeof req.headers['x-request-id'] === 'string'
          ? req.headers['x-request-id']
          : Array.isArray(req.headers['x-request-id'])
            ? req.headers['x-request-id'][0]
            : undefined,
    });

    // Add response finish listener
    res.on('finish', () => {
      // End timer
      const duration = timer.end();

      // Add performance header
      res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);

      // Log slow requests
      if (duration > slowThreshold) {
        logger.warn(`Slow request: ${req.method} ${req.path} - ${duration.toFixed(2)}ms`);
      }
    });

    next();
  };
};

/**
 * Get performance monitor instance
 * @returns PerformanceMonitor instance
 */
export const getPerformanceMonitor = (): PerformanceMonitor => {
  return PerformanceMonitor.getInstance();
};

/**
 * Start a timer for measuring operation duration
 * @param operation Operation name
 * @param context Additional context
 * @returns Timer handle
 */
export const startTimer = (operation: string, context?: MetricTags): TimerHandle => {
  return PerformanceMonitor.getInstance().startTimer(operation, context);
};

/**
 * Record a metric
 * @param name Metric name
 * @param value Metric value
 * @param tags Additional tags
 */
export const recordMetric = (name: string, value: number, tags?: MetricTags): void => {
  PerformanceMonitor.getInstance().recordMetric(name, value, tags);
};

/**
 * Get system metrics
 * @returns System metrics
 */
export const getSystemMetrics = (): Record<string, unknown> => {
  return PerformanceMonitor.getInstance().getSystemMetrics();
};

/**
 * Flush metrics to log
 */
export const flushMetrics = (): void => {
  PerformanceMonitor.getInstance().flush();
};

/**
 * Clean up resources
 */
export const cleanup = (): void => {
  PerformanceMonitor.getInstance().cleanup();
};

export default {
  performanceMonitorMiddleware,
  getPerformanceMonitor,
  startTimer,
  recordMetric,
  getSystemMetrics,
  flushMetrics,
  cleanup,
};
