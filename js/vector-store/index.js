/**
 * Local Vector Store - Facade
 *
 * Main public API for the vector store. Coordinates all sub-modules.
 *
 * In-memory + IndexedDB vector storage for local semantic search
 * without Qdrant Cloud dependency.
 *
 * Features:
 * - LRU eviction policy to prevent IndexedDB bloat
 * - Configurable max vectors (default: 5000)
 * - Auto-scale option based on storage quota
 * - Web Worker for non-blocking search
 *
 * @module vector-store
 */

import { LRUCache, DEFAULT_VECTOR_MAX_SIZE } from '../storage/lru-cache.js';
import { DB_NAME, DEFAULT_VECTOR_DIMENSIONS } from './config.js';
import { isSharedArrayBufferAvailable, buildSharedVectorData } from './shared-memory.js';
import { cosineSimilarity } from './math.js';
import { createVectorCache } from './cache.js';
import { createPersistenceManager } from './persistence.js';
import { createWorkerManager } from './worker.js';
import { createRetryQueue } from './retry-queue.js';
import { search } from './search.js';
import { createAsyncSearch } from './search-async.js';

// ==========================================
// Module State
// ==========================================

let vectors = null; // Lazy initialized with LRU cache
let persistence = null;
let workerManager = null;
let retryQueue = null;

// Configuration
let currentMaxVectors = DEFAULT_VECTOR_MAX_SIZE;
let autoScaleEnabled = false;

// ==========================================
// Helper Functions
// ==========================================

/**
 * Initialize the LRU cache for vectors (lazy initialization)
 */
function initializeVectorsCache() {
    if (!vectors) {
        vectors = createVectorCache(currentMaxVectors);

        // Initialize retry queue with reference to vectors map
        if (!retryQueue) {
            retryQueue = createRetryQueue(vectors);
        }
    }
}

/**
 * Process pending evictions from LRU cache by deleting from IndexedDB
 */
async function processEvictions() {
    if (!vectors || !persistence) return;

    const evicted = vectors.getPendingEvictions();
    if (evicted.length === 0) return;

    await persistence.processEvictions(evicted);
}

// ==========================================
// Public API
// ==========================================

const LocalVectorStore = {
    /**
     * Initialize the vector store
     * Loads existing vectors from IndexedDB and pre-initializes the search worker
     *
     * @param {Object} options - Configuration options
     * @param {number} options.maxVectors - Maximum vectors before eviction (default: 5000)
     * @param {boolean} options.autoScale - Auto-scale based on storage quota
     * @returns {Promise<number>} Number of vectors loaded
     */
    async init(options = {}) {
        // Apply configuration
        if (options.maxVectors) {
            currentMaxVectors = options.maxVectors;
        }

        // Initialize persistence manager
        if (!persistence) {
            persistence = createPersistenceManager();
        }

        // Initialize LRU cache
        initializeVectorsCache();

        // Initialize retry queue
        if (!retryQueue) {
            retryQueue = createRetryQueue(vectors);
        }

        // Initialize IndexedDB and load vectors
        await persistence.initDB();
        await persistence.loadFromDB(vectors);

        // Enable auto-scale if requested
        if (options.autoScale) {
            await this.enableAutoScale(true);
        }

        // Initialize worker manager
        if (!workerManager) {
            workerManager = createWorkerManager((queryVector, limit, threshold) =>
                search({
                    queryVector,
                    vectors,
                    limit,
                    threshold,
                })
            );
        }

        // Pre-initialize worker to avoid user-facing delays during first search
        const worker = await workerManager.initWorkerAsync();
        if (!worker) {
            console.warn('[LocalVectorStore] Worker pre-init failed, will use sync fallback');
        }

        return this.count();
    },

    /**
     * Add or update a vector
     * May trigger LRU eviction if at capacity
     *
     * @param {number|string} id - Unique identifier for this vector
     * @param {number[]} vector - The embedding vector (e.g., 384 dimensions)
     * @param {Object} payload - Metadata (text, type, etc.)
     * @returns {Promise<boolean>} True if successful
     */
    async upsert(id, vector, payload = {}) {
        if (!vectors) initializeVectorsCache();

        const item = { id, vector, payload };
        const evicted = vectors.set(id, item);

        // Process retry queue
        if (retryQueue.size > 0) {
            await retryQueue.processRetries(item => persistence.persistVector(item));
        }

        // Persist to IndexedDB - track failures for retry
        try {
            await persistence.persistVector(item);
        } catch (e) {
            console.warn('[LocalVectorStore] Persist failed, will retry on next operation:', e);
            retryQueue.addFailure(id, e);
        }

        // Clean up any evicted items from IndexedDB
        if (evicted) {
            processEvictions();
        }

        return true;
    },

    /**
     * Add multiple vectors at once (batch upsert)
     *
     * @param {Array<{id, vector, payload}>} items - Array of vectors to add
     * @returns {Promise<number>} Number of vectors added
     */
    async upsertBatch(items) {
        if (!vectors) initializeVectorsCache();

        for (const item of items) {
            vectors.set(item.id, item);
        }

        await persistence.persistBatch(items, processEvictions);

        return items.length;
    },

    /**
     * Search for similar vectors (synchronous, main thread)
     * Uses brute-force cosine similarity (fast for ~1000 vectors)
     *
     * @param {number[]} queryVector - The query embedding vector
     * @param {number} limit - Maximum results to return
     * @param {number} threshold - Minimum similarity score (0-1)
     * @returns {Array<{id, score, payload}>} Sorted by similarity descending
     */
    search(queryVector, limit = 5, threshold = 0.5) {
        return search({
            queryVector,
            vectors,
            limit,
            threshold,
        });
    },

    /**
     * Search for similar vectors (asynchronous, Web Worker)
     * Offloads cosine similarity computation to background thread
     * Falls back to sync search if worker is unavailable
     *
     * @param {number[]} queryVector - The query embedding vector
     * @param {number} limit - Maximum results to return
     * @param {number} threshold - Minimum similarity score (0-1)
     * @returns {Promise<Array<{id, score, payload}>>} Sorted by similarity descending
     */
    async searchAsync(queryVector, limit = 5, threshold = 0.5) {
        // Initialize on first search if needed
        if (!vectors) {
            console.warn('[LocalVectorStore] Vectors cache not initialized, calling init()');
            await this.init();
        }

        // Create async search function
        const searchAsyncFn = createAsyncSearch(
            workerManager,
            vectors,
            (qv, l, t) => this.search(qv, l, t),
            vectorsMap => buildSharedVectorData(vectorsMap)
        );

        return searchAsyncFn(queryVector, limit, threshold);
    },

    /**
     * Get a specific vector by ID
     *
     * @param {number|string} id - Vector ID
     * @returns {Object|null} The vector item or null
     */
    get(id) {
        return vectors ? vectors.get(id) || null : null;
    },

    /**
     * Delete a vector by ID
     *
     * @param {number|string} id - Vector ID
     */
    async delete(id) {
        if (!vectors) return;

        vectors.delete(id);

        // Clean up retry entries when vectors are deleted
        if (retryQueue) {
            retryQueue.removeEntry(id);
            console.log(`[LocalVectorStore] Cleaned up retry entry for deleted vector ${id}`);
        }

        if (persistence) {
            await persistence.deleteVector(id);
        }
    },

    /**
     * Get total vector count
     *
     * @returns {number} Number of vectors stored
     */
    count() {
        return vectors ? vectors.size : 0;
    },

    /**
     * Clear all vectors
     */
    async clear() {
        // Clear retry queue
        if (retryQueue) {
            retryQueue.clear();
        }

        if (persistence) {
            await persistence.clearDB(() => vectors.clear());
        } else if (vectors) {
            vectors.clear();
        }
    },

    /**
     * Get store statistics including LRU eviction metrics
     *
     * @returns {Object} Statistics object
     */
    getStats() {
        if (!vectors) {
            return {
                count: 0,
                maxVectors: currentMaxVectors,
                dimensions: { min: 0, max: 0, avg: 0 },
                storage: { bytes: 0, megabytes: 0 },
                lru: { evictionCount: 0, hitRate: 0, autoScaleEnabled: false },
                sharedMemory: {
                    available: isSharedArrayBufferAvailable(),
                    enabled: false,
                },
                retryQueue: {
                    size: 0,
                    oldestEntryAge: null,
                    maxRetries: 0,
                },
            };
        }

        let totalDimensions = 0;
        let minDimensions = Infinity;
        let maxDimensions = 0;

        for (const item of vectors.values()) {
            const dims = item.vector?.length || 0;
            totalDimensions += dims;
            minDimensions = Math.min(minDimensions, dims);
            maxDimensions = Math.max(maxDimensions, dims);
        }

        const count = vectors.size;
        const avgDimensions = count > 0 ? Math.round(totalDimensions / count) : 0;

        // Estimate storage size (4 bytes per float32)
        const estimatedBytes = totalDimensions * 4;
        const estimatedMB = (estimatedBytes / (1024 * 1024)).toFixed(2);

        // Get LRU stats
        const lruStats = vectors.getStats();

        // Get retry queue metrics
        const retryMetrics = retryQueue
            ? retryQueue.getMetrics()
            : {
                size: 0,
                oldestEntryAge: null,
                maxRetries: 0,
            };

        return {
            count,
            maxVectors: currentMaxVectors,
            utilization: count / currentMaxVectors,
            dimensions: {
                min: minDimensions === Infinity ? 0 : minDimensions,
                max: maxDimensions,
                avg: avgDimensions,
            },
            storage: {
                bytes: estimatedBytes,
                megabytes: parseFloat(estimatedMB),
            },
            lru: {
                evictionCount: lruStats.evictionCount,
                hitRate: lruStats.hitRate,
                hitCount: lruStats.hitCount,
                missCount: lruStats.missCount,
                autoScaleEnabled: autoScaleEnabled,
            },
            sharedMemory: {
                available: isSharedArrayBufferAvailable(),
                enabled: isSharedArrayBufferAvailable() && count > 0,
            },
            retryQueue: retryMetrics,
        };
    },

    /**
     * Check if store is ready
     * Ready means: DB is open AND vectors cache is initialized
     */
    isReady() {
        return persistence && persistence.isReady() && vectors !== null;
    },

    /**
     * Check if search worker is ready
     *
     * @returns {boolean} True if worker is initialized and ready
     */
    isWorkerReady() {
        return workerManager ? workerManager.isWorkerReady() : false;
    },

    /**
     * Set maximum vectors (triggers eviction if new limit is lower)
     *
     * @param {number} maxVectors - New maximum
     */
    setMaxVectors(maxVectors) {
        currentMaxVectors = Math.max(100, maxVectors); // Minimum 100
        if (vectors) {
            vectors.setMaxSize(currentMaxVectors);
            processEvictions();
        }
        console.log(`[LocalVectorStore] Max vectors set to ${currentMaxVectors}`);
    },

    /**
     * Get current max vectors setting
     *
     * @returns {number}
     */
    getMaxVectors() {
        return currentMaxVectors;
    },

    /**
     * Enable/disable auto-scale based on storage quota
     *
     * @param {boolean} enabled - Whether to enable auto-scale
     * @returns {Promise<number>} The new max vectors value
     */
    async enableAutoScale(enabled = true) {
        autoScaleEnabled = enabled;

        if (enabled && vectors) {
            const newMax = await vectors.enableAutoScale(true);
            currentMaxVectors = newMax;
            return newMax;
        }

        return currentMaxVectors;
    },

    /**
     * Check if auto-scale is enabled
     *
     * @returns {boolean}
     */
    isAutoScaleEnabled() {
        return autoScaleEnabled;
    },
};

// ==========================================
// Export
// ==========================================

// ES Module export
export { LocalVectorStore, isSharedArrayBufferAvailable };

// ES Module export - use ModuleRegistry for access instead of window globals
console.log('[LocalVectorStore] Module loaded. Call LocalVectorStore.init() to initialize.');
