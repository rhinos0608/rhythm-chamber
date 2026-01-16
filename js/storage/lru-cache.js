/**
 * LRU Cache for Vector Store
 * 
 * Implements Least Recently Used (LRU) eviction policy to prevent
 * IndexedDB bloat when storing many embedding vectors.
 * 
 * Features:
 * - Configurable max size
 * - Access-based usage tracking (get() updates recency)
 * - Automatic eviction when at capacity
 * - Eviction statistics for monitoring
 * - Auto-scale option based on storage quota
 * 
 * @module storage/lru-cache
 */

// ==========================================
// Constants
// ==========================================

const DEFAULT_MAX_SIZE = 5000;

// ==========================================
// LRU Cache Implementation
// ==========================================

/**
 * LRU (Least Recently Used) Cache
 * Uses ES6 Map which maintains insertion order
 */
export class LRUCache {
    /**
     * Create an LRU cache
     * @param {number} maxSize - Maximum number of items before eviction
     * @param {Object} options - Configuration options
     * @param {boolean} options.autoScale - Whether to auto-scale based on quota
     * @param {function} options.onEvict - Callback when item is evicted (for IndexedDB cleanup)
     */
    constructor(maxSize = DEFAULT_MAX_SIZE, options = {}) {
        this.maxSize = maxSize;
        this.autoScaleEnabled = false;
        this.onEvict = options.onEvict || null;

        // Internal storage - Map maintains insertion order
        this._cache = new Map();

        // Statistics
        this._evictionCount = 0;
        this._hitCount = 0;
        this._missCount = 0;

        // Pending evictions for async cleanup
        this._pendingEvictions = [];
    }

    /**
     * Get an item from the cache
     * Updates access recency (moves to most recent)
     * @param {string|number} key - Cache key
     * @returns {any} The cached value or undefined
     */
    get(key) {
        if (!this._cache.has(key)) {
            this._missCount++;
            return undefined;
        }

        this._hitCount++;

        // Move to end (most recently used) by delete + re-insert
        const value = this._cache.get(key);
        this._cache.delete(key);
        this._cache.set(key, value);

        return value;
    }

    /**
     * Set an item in the cache
     * May trigger eviction if at capacity
     * @param {string|number} key - Cache key
     * @param {any} value - Value to cache
     * @returns {boolean} True if eviction occurred
     */
    set(key, value) {
        let evicted = false;

        // If key exists, remove it first (to update position)
        if (this._cache.has(key)) {
            this._cache.delete(key);
        } else if (this._cache.size >= this.maxSize) {
            // At capacity - evict oldest (first item in Map)
            evicted = this._evictOldest();
        }

        // Insert at end (most recent)
        this._cache.set(key, value);

        return evicted;
    }

    /**
     * Check if key exists in cache (does NOT update recency)
     * @param {string|number} key - Cache key
     * @returns {boolean}
     */
    has(key) {
        return this._cache.has(key);
    }

    /**
     * Delete an item from the cache
     * @param {string|number} key - Cache key
     * @returns {boolean} True if item existed
     */
    delete(key) {
        return this._cache.delete(key);
    }

    /**
     * Clear all items from the cache
     */
    clear() {
        this._cache.clear();
        this._pendingEvictions = [];
    }

    /**
     * Get current cache size
     * @returns {number}
     */
    get size() {
        return this._cache.size;
    }

    /**
     * Iterate over all cached items
     * @yields {[key, value]}
     */
    *entries() {
        yield* this._cache.entries();
    }

    /**
     * Iterate over all keys
     * @yields {key}
     */
    *keys() {
        yield* this._cache.keys();
    }

    /**
     * Iterate over all values
     * @yields {value}
     */
    *values() {
        yield* this._cache.values();
    }

    /**
     * Evict oldest item(s) from cache
     * @param {number} count - Number of items to evict (default 1)
     * @returns {boolean} True if any items were evicted
     */
    _evictOldest(count = 1) {
        if (this._cache.size === 0) return false;

        let evicted = 0;
        for (const key of this._cache.keys()) {
            if (evicted >= count) break;

            // Call eviction callback if set (for IndexedDB cleanup)
            if (this.onEvict) {
                this._pendingEvictions.push(key);
            }

            this._cache.delete(key);
            this._evictionCount++;
            evicted++;
        }

        return evicted > 0;
    }

    /**
     * Get pending evictions (for async IndexedDB cleanup)
     * Clears the pending list after returning
     * @returns {Array<string|number>} Keys that were evicted
     */
    getPendingEvictions() {
        const pending = this._pendingEvictions;
        this._pendingEvictions = [];
        return pending;
    }

    /**
     * Update max size (triggers eviction if new size is smaller)
     * @param {number} newMaxSize - New maximum size
     */
    setMaxSize(newMaxSize) {
        this.maxSize = Math.max(1, newMaxSize);

        // Evict if we're now over capacity
        while (this._cache.size > this.maxSize) {
            this._evictOldest();
        }
    }

    /**
     * Enable/disable auto-scale based on storage quota
     * @param {boolean} enabled - Whether to enable auto-scale
     */
    async enableAutoScale(enabled = true) {
        this.autoScaleEnabled = enabled;

        if (enabled && typeof navigator !== 'undefined' && navigator.storage?.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                const availableBytes = (estimate.quota || 0) - (estimate.usage || 0);

                // Assume ~2KB per vector entry (384 dims × 4 bytes + overhead)
                const BYTES_PER_VECTOR = 2048;

                // Use at most 10% of available quota, minimum 1000
                const maxBasedOnQuota = Math.floor((availableBytes * 0.1) / BYTES_PER_VECTOR);
                const newMax = Math.max(1000, Math.min(maxBasedOnQuota, 50000)); // Cap at 50k

                console.log(`[LRUCache] Auto-scaled max size to ${newMax} based on ${Math.round(availableBytes / 1024 / 1024)}MB available`);
                this.setMaxSize(newMax);

                return newMax;
            } catch (e) {
                console.warn('[LRUCache] Failed to estimate storage quota:', e);
            }
        }

        return this.maxSize;
    }

    /**
     * Get cache statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        const hitRate = (this._hitCount + this._missCount) > 0
            ? (this._hitCount / (this._hitCount + this._missCount))
            : 0;

        return {
            size: this._cache.size,
            maxSize: this.maxSize,
            utilization: this._cache.size / this.maxSize,
            evictionCount: this._evictionCount,
            hitCount: this._hitCount,
            missCount: this._missCount,
            hitRate: Math.round(hitRate * 100) / 100, // 2 decimal places
            autoScaleEnabled: this.autoScaleEnabled,
            pendingEvictions: this._pendingEvictions.length
        };
    }

    /**
     * Reset statistics (useful for monitoring windows)
     */
    resetStats() {
        this._evictionCount = 0;
        this._hitCount = 0;
        this._missCount = 0;
    }
}

// ==========================================
// Default Export
// ==========================================

export const DEFAULT_VECTOR_MAX_SIZE = DEFAULT_MAX_SIZE;
