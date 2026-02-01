/**
 * Vector Cache Wrapper
 *
 * Wraps LRUCache with vector-specific functionality
 *
 * @module vector-store/cache
 */

import { LRUCache, DEFAULT_VECTOR_MAX_SIZE } from '../storage/lru-cache.js';

/**
 * Create a vector cache wrapper
 *
 * @param {number} maxVectors - Maximum number of vectors
 * @param {Function} onEvict - Callback when vector is evicted
 * @returns {Object} Cache wrapper
 */
export function createVectorCache(maxVectors = DEFAULT_VECTOR_MAX_SIZE, onEvict = null) {
    const vectors = new LRUCache(maxVectors, {
        onEvict: key => {
            console.log(`[VectorStore] Evicting vector ${key} from LRU cache`);
            if (onEvict) {
                onEvict(key);
            }
        },
    });

    /**
     * Initialize the cache (lazy initialization support)
     */
    function initialize() {
        // Cache is already initialized in constructor
        // This is for API compatibility
    }

    /**
     * Get pending evictions for async cleanup
     *
     * @returns {Array} Array of evicted vector IDs
     */
    function getPendingEvictions() {
        return vectors.getPendingEvictions();
    }

    /**
     * Get cache statistics
     *
     * @returns {Object} Cache statistics
     */
    function getStats() {
        return vectors.getStats();
    }

    /**
     * Pin a vector to prevent eviction
     *
     * @param {string} key - Vector ID
     */
    function pin(key) {
        vectors.pin(key);
    }

    /**
     * Unpin a vector to allow eviction
     *
     * @param {string} key - Vector ID
     */
    function unpin(key) {
        vectors.unpin(key);
    }

    return {
        // Map-like interface
        get: key => vectors.get(key),
        set: (key, value) => vectors.set(key, value),
        has: key => vectors.has(key),
        delete: key => vectors.delete(key),
        clear: () => vectors.clear(),
        get size() {
            return vectors.size;
        },

        // Iterable interface - CRITICAL for search operations
        [Symbol.iterator]: function* () {
            yield* vectors.entries();
        },
        entries: function* () {
            yield* vectors.entries();
        },
        keys: function* () {
            yield* vectors.keys();
        },
        values: function* () {
            yield* vectors.values();
        },

        // LRU-specific interface
        initialize,
        getPendingEvictions,
        getStats,
        pin,
        unpin,
        setMaxSize: size => vectors.setMaxSize(size),
        enableAutoScale: enabled => vectors.enableAutoScale(enabled),
        isPinned: key => vectors.isPinned(key),
        get pinnedCount() {
            return vectors.pinnedCount;
        },
    };
}
