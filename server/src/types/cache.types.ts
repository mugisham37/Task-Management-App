/**
 * Cache value type
 * Represents the types of values that can be stored in the cache
 */
export type CacheValue = string | number | boolean | object | null | undefined;

/**
 * Cache function type
 * Represents a function that returns a value to be cached
 */
export type CacheFunction<T extends CacheValue = CacheValue> = () => Promise<T> | T;
