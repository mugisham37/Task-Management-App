/**
 * Cache value types
 */
export type CacheValue = string | number | boolean | object | null | undefined;

/**
 * Cache value object interface
 */
export interface CacheValueObject {
  [key: string]: CacheValue;
}

/**
 * Cache function type
 */
export type CacheFunction<T extends CacheValue> = () => Promise<T>;

/**
 * Cache entry interface
 */
export interface CacheEntry<T extends CacheValue> {
  key: string;
  val: T;
  ttl?: number;
}
