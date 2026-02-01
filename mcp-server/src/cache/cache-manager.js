/**
 * LRU Cache for module analysis results
 */

import { LRUCache } from 'lru-cache';

export class CacheManager {
  constructor(options = {}) {
    this.cache = new LRUCache({
      max: options.max || 500,
      ttl: options.ttl || 1000 * 60 * 5, // 5 minutes
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });
  }

  /**
   * Get value from cache
   */
  get(key) {
    return this.cache.get(key);
  }

  /**
   * Set value in cache
   */
  set(key, value) {
    this.cache.set(key, value);
  }

  /**
   * Check if key exists
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Delete key from cache
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      calculatedSize: this.cache.calculatedSize,
      maxSize: this.cache.max,
    };
  }

  /**
   * Generate cache key from file path and options
   */
  generateKey(filePath, options = {}) {
    const optionsStr = Object.keys(options)
      .sort()
      .map(k => `${k}:${options[k]}`)
      .join('|');

    return `${filePath}:${optionsStr}`;
  }
}
