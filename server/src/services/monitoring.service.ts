import os from 'os';
import { EventEmitter } from 'events';
import mongoose from 'mongoose';
import logger from '../config/logger';
import * as cacheUtils from '../utils/cache';
import { getActiveConnectionsCount } from './websocket.service';

// Create event emitter for system events
const systemEvents = new EventEmitter();

// System metrics
interface SystemMetrics {
  timestamp: number;
  cpu: {
    usage: number;
    loadAvg: number[];
  };
  memory: {
    total: number;
    free: number;
    used: number;
    usedPercent: number;
  };
  uptime: number;
  process: {
    memory: NodeJS.MemoryUsage;
    uptime: number;
  };
  connections: {
    websocket: number;
  };
  database: {
    status: 'connected' | 'disconnected' | 'connecting' | 'disconnecting';
    operations: {
      active: number;
      queued: number;
    };
  };
  cache: {
    hits: number;
    misses: number;
    keys: number;
  };
}

// Store metrics history (last 60 minutes, 1 sample per minute)
const metricsHistory: SystemMetrics[] = [];
const MAX_HISTORY_LENGTH = 60;

// Collect system metrics
const collectMetrics = (): SystemMetrics => {
  // Calculate CPU usage
  const cpus = os.cpus();
  const totalCpu = cpus.reduce(
    (acc, cpu) => {
      acc.idle += cpu.times.idle;
      acc.total += Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
      return acc;
    },
    { idle: 0, total: 0 },
  );

  // Calculate memory usage
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const usedMemPercent = (usedMem / totalMem) * 100;

  // Get database connection status
  const dbConnection = mongoose.connection;
  const dbStatus =
    dbConnection.readyState === 1
      ? 'connected'
      : dbConnection.readyState === 2
        ? 'connecting'
        : dbConnection.readyState === 3
          ? 'disconnecting'
          : 'disconnected';

  // Get cache stats
  const cacheStats = cacheUtils.getStats();

  // Create metrics object
  const metrics: SystemMetrics = {
    timestamp: Date.now(),
    cpu: {
      usage: 100 - (totalCpu.idle / totalCpu.total) * 100,
      loadAvg: os.loadavg(),
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      usedPercent: usedMemPercent,
    },
    uptime: os.uptime(),
    process: {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    },
    connections: {
      websocket: getActiveConnectionsCount(),
    },
    database: {
      status: dbStatus,
      operations: {
        active: (mongoose as any).connections[0]?.activeQueries?.size || 0,
        queued: 0, // Not directly available from mongoose
      },
    },
    cache: {
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      keys: Object.keys(cacheStats.keys || {}).length,
    },
  };

  return metrics;
};

// Start monitoring
let monitoringInterval: NodeJS.Timeout | null = null;

/**
 * Start system monitoring
 * @param interval Interval in milliseconds (default: 60000 = 1 minute)
 */
export const startMonitoring = (interval = 60000): void => {
  if (monitoringInterval) {
    logger.warn('Monitoring already started');
    return;
  }

  logger.info(`Starting system monitoring with interval: ${interval}ms`);

  // Collect metrics immediately
  const initialMetrics = collectMetrics();
  metricsHistory.push(initialMetrics);
  systemEvents.emit('metrics', initialMetrics);

  // Set up interval for collecting metrics
  monitoringInterval = setInterval(() => {
    try {
      const metrics = collectMetrics();

      // Add to history and maintain max length
      metricsHistory.push(metrics);
      if (metricsHistory.length > MAX_HISTORY_LENGTH) {
        metricsHistory.shift();
      }

      // Emit metrics event
      systemEvents.emit('metrics', metrics);

      // Check for high resource usage
      if (metrics.cpu.usage > 80) {
        logger.warn(`High CPU usage: ${metrics.cpu.usage.toFixed(2)}%`);
        systemEvents.emit('high-cpu', metrics.cpu.usage);
      }

      if (metrics.memory.usedPercent > 80) {
        logger.warn(`High memory usage: ${metrics.memory.usedPercent.toFixed(2)}%`);
        systemEvents.emit('high-memory', metrics.memory.usedPercent);
      }

      // Check database connection
      if (metrics.database.status !== 'connected') {
        logger.error(`Database connection issue: ${metrics.database.status}`);
        systemEvents.emit('database-issue', metrics.database.status);
      }
    } catch (error) {
      logger.error('Error collecting system metrics:', error);
    }
  }, interval);
};

/**
 * Stop system monitoring
 */
export const stopMonitoring = (): void => {
  if (!monitoringInterval) {
    logger.warn('Monitoring not started');
    return;
  }

  clearInterval(monitoringInterval);
  monitoringInterval = null;
  logger.info('System monitoring stopped');
};

/**
 * Get current system metrics
 * @returns Current system metrics
 */
export const getCurrentMetrics = (): SystemMetrics => {
  return collectMetrics();
};

/**
 * Get metrics history
 * @returns Array of historical metrics
 */
export const getMetricsHistory = (): SystemMetrics[] => {
  return [...metricsHistory];
};

/**
 * Subscribe to system events
 * @param event Event name
 * @param listener Event listener
 */
export const subscribeToSystemEvents = (
  event: string,
  listener: (...args: any[]) => void,
): void => {
  systemEvents.on(event, listener);
};

/**
 * Unsubscribe from system events
 * @param event Event name
 * @param listener Event listener
 */
export const unsubscribeFromSystemEvents = (
  event: string,
  listener: (...args: any[]) => void,
): void => {
  systemEvents.off(event, listener);
};

/**
 * Check system health
 * @returns Health status object
 */
export const checkHealth = async (): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, { status: 'pass' | 'warn' | 'fail'; message?: string }>;
  timestamp: string;
}> => {
  const metrics = collectMetrics();
  const checks: Record<string, { status: 'pass' | 'warn' | 'fail'; message?: string }> = {};

  // Check CPU
  if (metrics.cpu.usage > 90) {
    checks.cpu = {
      status: 'fail',
      message: `High CPU usage: ${metrics.cpu.usage.toFixed(2)}%`,
    };
  } else if (metrics.cpu.usage > 70) {
    checks.cpu = {
      status: 'warn',
      message: `Elevated CPU usage: ${metrics.cpu.usage.toFixed(2)}%`,
    };
  } else {
    checks.cpu = { status: 'pass' };
  }

  // Check memory
  if (metrics.memory.usedPercent > 90) {
    checks.memory = {
      status: 'fail',
      message: `High memory usage: ${metrics.memory.usedPercent.toFixed(2)}%`,
    };
  } else if (metrics.memory.usedPercent > 70) {
    checks.memory = {
      status: 'warn',
      message: `Elevated memory usage: ${metrics.memory.usedPercent.toFixed(2)}%`,
    };
  } else {
    checks.memory = { status: 'pass' };
  }

  // Check database
  if (metrics.database.status === 'connected') {
    checks.database = { status: 'pass' };
  } else if (metrics.database.status === 'connecting') {
    checks.database = { status: 'warn', message: 'Database is connecting' };
  } else {
    checks.database = { status: 'fail', message: `Database is ${metrics.database.status}` };
  }

  // Check database connectivity by performing a simple query
  try {
    if (mongoose.connection.db) {
      await mongoose.connection.db.admin().ping();
      checks.databasePing = { status: 'pass' };
    } else {
      checks.databasePing = { status: 'fail', message: 'Database connection not established' };
    }
  } catch (error) {
    checks.databasePing = {
      status: 'fail',
      message: `Database ping failed: ${(error as Error).message}`,
    };
  }

  // Determine overall status
  const hasFailures = Object.values(checks).some((check) => check.status === 'fail');
  const hasWarnings = Object.values(checks).some((check) => check.status === 'warn');

  const status = hasFailures ? 'unhealthy' : hasWarnings ? 'degraded' : 'healthy';

  return {
    status,
    checks,
    timestamp: new Date().toISOString(),
  };
};

export default {
  startMonitoring,
  stopMonitoring,
  getCurrentMetrics,
  getMetricsHistory,
  subscribeToSystemEvents,
  unsubscribeFromSystemEvents,
  checkHealth,
};
