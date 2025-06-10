import NodeCache from 'node-cache';
import logger from '../config/logger';
import config from '../config/environment';
import { performance } from 'perf_hooks';
import { recordMetric } from './performance-monitor';
import { CacheValue, CacheFunction } from '../types/cache.types';

/**
 * Cache options interface
 */
interface CacheOptions {
  stdTTL?: number;
  checkperiod?: number;
  useClones?: boolean;
  deleteOnExpire?: boolean;
  enableLogs?: boolean;
}

/**
 * Cache statistics interface
 */
interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
  ksize: number;
  vsize: number;
  hitRate: number;
}

/**
 * Cache strategy enum
 */
enum CacheStrategy {
  MEMORY = 'memory',
  NONE = 'none',
}

/**
 * Cache class
 * Multi-layer caching system for improved performance
 */
class Cache {
  private static instance: Cache;
  private cache: NodeCache;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    keys: 0,
    ksize: 0,
    vsize: 0,
    hitRate: 0,
  };
  private readonly defaultTTL: number = 300; // 5 minutes
  private readonly enableLogs: boolean;
  private readonly strategy: CacheStrategy;

  /**
   * Private constructor to enforce singleton pattern
   * @param options Cache options
   */
  private constructor(options: CacheOptions = {}) {
    const {
      stdTTL = this.defaultTTL,
      checkperiod = 120,
      useClones = false,
      deleteOnExpire = true,
      enableLogs = true,
    } = options;

    this.enableLogs = enableLogs;
    this.strategy = this.determineStrategy();

    // Create cache instance
    this.cache = new NodeCache({
      stdTTL,
      checkperiod,
      useClones,
      deleteOnExpire,
    });

    // Set up cache events
    this.setupEvents();

    if (this.enableLogs) {
      logger.info(`Cache initialized with strategy: ${this.strategy}`);
    }
  }

  /**
   * Determine cache strategy based on configuration
   * @returns Cache strategy
   */
  private determineStrategy(): CacheStrategy {
    if (config.disableCache === 'true') {
      return CacheStrategy.NONE;
    }
    return CacheStrategy.MEMORY;
  }

  /**
   * Set up cache events
   */
  private setupEvents(): void {
    this.cache.on('set', (key: string, value: CacheValue) => {
      this.stats.keys = this.cache.keys().length;
      this.stats.ksize += key.length;
      this.stats.vsize += this.estimateSize(value);

      if (this.enableLogs) {
        logger.debug(`Cache set: ${key}`);
      }
    });

    this.cache.on('del', (key: string) => {
      this.stats.keys = this.cache.keys().length;

      if (this.enableLogs) {
        logger.debug(`Cache delete: ${key}`);
      }
    });

    this.cache.on('expired', (key: string) => {
      if (this.enableLogs) {
        logger.debug(`Cache expired: ${key}`);
      }
    });

    this.cache.on('flush', () => {
      this.stats.keys = 0;
      this.stats.ksize = 0;
      this.stats.vsize = 0;

      if (this.enableLogs) {
        logger.debug('Cache flushed');
      }
    });
  }

  /**
   * Estimate size of value in bytes
   * @param value Value to estimate size of
   * @returns Estimated size in bytes
   */
  private estimateSize(value: CacheValue): number {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === 'boolean') {
      return 4;
    }

    if (typeof value === 'number') {
      return 8;
    }

    if (typeof value === 'string') {
      return value.length * 2;
    }

    if (typeof value === 'object') {
      try {
        const json = JSON.stringify(value);
        return json.length * 2;
      } catch (error) {
        return 1000; // Arbitrary size for objects that can't be stringified
      }
    }

    return 8; // Default size
  }

  /**
   * Get singleton instance
   * @param options Cache options
   * @returns Cache instance
   */
  public static getInstance(options: CacheOptions = {}): Cache {
    if (!Cache.instance) {
      Cache.instance = new Cache(options);
    }
    return Cache.instance;
  }

  /**
   * Get value from cache
   * @param key Cache key
   * @returns Cached value or undefined if not found
   */
  public get<T extends CacheValue = CacheValue>(key: string): T | undefined {
    if (this.strategy === CacheStrategy.NONE) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    const startTime = performance.now();
    const value = this.cache.get<T>(key);
    const duration = performance.now() - startTime;

    // Record metric
    recordMetric('cache.get', duration, { key, hit: value !== undefined });

    // Update stats
    if (value !== undefined) {
      this.stats.hits++;
    } else {
      this.stats.misses++;
    }
    this.updateHitRate();

    return value;
  }

  /**
   * Set value in cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in seconds (optional)
   * @returns true if successful, false otherwise
   */
  public set<T extends CacheValue = CacheValue>(key: string, value: T, ttl?: number): boolean {
    if (this.strategy === CacheStrategy.NONE) {
      return false;
    }

    const startTime = performance.now();
    const result = this.cache.set(key, value, ttl || this.defaultTTL);
    const duration = performance.now() - startTime;

    // Record metric
    recordMetric('cache.set', duration, { key });

    return result;
  }

  /**
   * Delete value from cache
   * @param key Cache key
   * @returns true if successful, false if key doesn't exist
   */
  public del(key: string): boolean {
    if (this.strategy === CacheStrategy.NONE) {
      return false;
    }

    const startTime = performance.now();
    const result = this.cache.del(key) > 0;
    const duration = performance.now() - startTime;

    // Record metric
    recordMetric('cache.del', duration, { key });

    return result;
  }

  /**
   * Check if key exists in cache
   * @param key Cache key
   * @returns true if key exists, false otherwise
   */
  public has(key: string): boolean {
    if (this.strategy === CacheStrategy.NONE) {
      return false;
    }

    return this.cache.has(key);
  }

  /**
   * Get multiple values from cache
   * @param keys Array of cache keys
   * @returns Object with key-value pairs
   */
  public mget<T extends CacheValue = CacheValue>(keys: string[]): Record<string, T> {
    if (this.strategy === CacheStrategy.NONE) {
      return {};
    }

    const startTime = performance.now();
    const values = this.cache.mget<T>(keys);
    const duration = performance.now() - startTime;

    // Record metric
    recordMetric('cache.mget', duration, { keys: keys.length });

    // Update stats
    const hits = Object.keys(values).length;
    this.stats.hits += hits;
    this.stats.misses += keys.length - hits;
    this.updateHitRate();

    return values;
  }

  /**
   * Set multiple values in cache
   * @param keyValuePairs Object with key-value pairs
   * @param ttl Time to live in seconds (optional)
   * @returns true if successful, false otherwise
   */
  public mset<T extends CacheValue = CacheValue>(
    keyValuePairs: Record<string, T>,
    ttl?: number,
  ): boolean {
    if (this.strategy === CacheStrategy.NONE) {
      return false;
    }

    const startTime = performance.now();
    const result = this.cache.mset(
      Object.entries(keyValuePairs).map(([key, value]) => ({
        key,
        val: value,
        ttl: ttl || this.defaultTTL,
      })),
    );
    const duration = performance.now() - startTime;

    // Record metric
    recordMetric('cache.mset', duration, { keys: Object.keys(keyValuePairs).length });

    return result;
  }

  /**
   * Get or set cache value with a function
   * @param key Cache key
   * @param fn Function to execute if cache miss
   * @param ttl Time to live in seconds (optional)
   * @returns Cached or computed value
   */
  public async getOrSet<T extends CacheValue = CacheValue>(
    key: string,
    fn: CacheFunction<T>,
    ttl?: number,
  ): Promise<T> {
    // Check cache first
    const cachedValue = this.get<T>(key);
    if (cachedValue !== undefined) {
      return cachedValue;
    }

    // Execute function
    const startTime = performance.now();
    try {
      const value = await fn();
      const duration = performance.now() - startTime;

      // Record metric
      recordMetric('cache.compute', duration, { key });

      // Cache result
      this.set(key, value, ttl);

      return value;
    } catch (error) {
      const duration = performance.now() - startTime;

      // Record metric
      recordMetric('cache.compute.error', duration, { key, error: (error as Error).message });

      // Log error
      logger.error(`Error computing value for cache key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Clear all cache
   */
  public flush(): void {
    if (this.strategy === CacheStrategy.NONE) {
      return;
    }

    const startTime = performance.now();
    this.cache.flushAll();
    const duration = performance.now() - startTime;

    // Record metric
    recordMetric('cache.flush', duration);
  }

  /**
   * Get cache keys
   * @returns Array of cache keys
   */
  public keys(): string[] {
    if (this.strategy === CacheStrategy.NONE) {
      return [];
    }

    return this.cache.keys();
  }

  /**
   * Get cache statistics
   * @returns Cache statistics
   */
  public getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }
}

// Create default cache instance
const defaultCache = Cache.getInstance();

/**
 * Get value from cache
 * @param key Cache key
 * @returns Cached value or undefined if not found
 */
export const get = <T extends CacheValue = CacheValue>(key: string): T | undefined => {
  return defaultCache.get<T>(key);
};

/**
 * Set value in cache
 * @param key Cache key
 * @param value Value to cache
 * @param ttl Time to live in seconds (optional)
 * @returns true if successful, false otherwise
 */
export const set = <T extends CacheValue = CacheValue>(
  key: string,
  value: T,
  ttl?: number,
): boolean => {
  return defaultCache.set<T>(key, value, ttl);
};

/**
 * Delete value from cache
 * @param key Cache key
 * @returns true if successful, false if key doesn't exist
 */
export const del = (key: string): boolean => {
  return defaultCache.del(key);
};

/**
 * Check if key exists in cache
 * @param key Cache key
 * @returns true if key exists, false otherwise
 */
export const has = (key: string): boolean => {
  return defaultCache.has(key);
};

/**
 * Get multiple values from cache
 * @param keys Array of cache keys
 * @returns Object with key-value pairs
 */
export const mget = <T extends CacheValue = CacheValue>(keys: string[]): Record<string, T> => {
  return defaultCache.mget<T>(keys);
};

/**
 * Set multiple values in cache
 * @param keyValuePairs Object with key-value pairs
 * @param ttl Time to live in seconds (optional)
 * @returns true if successful, false otherwise
 */
export const mset = <T extends CacheValue = CacheValue>(
  keyValuePairs: Record<string, T>,
  ttl?: number,
): boolean => {
  return defaultCache.mset<T>(keyValuePairs, ttl);
};

/**
 * Get or set cache value with a function
 * @param key Cache key
 * @param fn Function to execute if cache miss
 * @param ttl Time to live in seconds (optional)
 * @returns Cached or computed value
 */
export const getOrSet = async <T extends CacheValue = CacheValue>(
  key: string,
  fn: CacheFunction<T>,
  ttl?: number,
): Promise<T> => {
  return defaultCache.getOrSet<T>(key, fn, ttl);
};

/**
 * Clear all cache
 */
export const flush = (): void => {
  defaultCache.flush();
};

/**
 * Get cache keys
 * @returns Array of cache keys
 */
export const keys = (): string[] => {
  return defaultCache.keys();
};

/**
 * Get cache statistics
 * @returns Cache statistics
 */
export const getStats = (): CacheStats => {
  return defaultCache.getStats();
};

/**
 * Create a new cache instance
 * @param options Cache options
 * @returns Cache instance
 */
export const createCache = (options: CacheOptions = {}): Cache => {
  return Cache.getInstance(options);
};

export default {
  get,
  set,
  del,
  has,
  mget,
  mset,
  getOrSet,
  flush,
  keys,
  getStats,
  createCache,
  Cache,
};
