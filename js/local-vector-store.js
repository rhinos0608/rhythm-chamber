/**
 * Local Vector Store for Rhythm Chamber
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
 * HNW Considerations:
 * - Hierarchy: LocalVectorStore is the authority for local mode
 * - Network: Isolated from cloud Qdrant - no accidental mixing
 * - Wave: Persistence is async, search is sync for responsiveness
 */

import { LRUCache, DEFAULT_VECTOR_MAX_SIZE } from './storage/lru-cache.js';

// ==========================================
// Constants
// ==========================================

const DB_NAME = 'rhythm_chamber_vectors';
const DB_VERSION = 1;
const STORE_NAME = 'vectors';
const SETTINGS_KEY = 'vector_store_settings';

// Priority 3: SharedArrayBuffer availability detection
// Requires COOP/COEP headers for cross-origin isolation
const SHARED_MEMORY_AVAILABLE = (() => {
    try {
        if (typeof SharedArrayBuffer === 'undefined') return false;
        const test = new SharedArrayBuffer(8);
        return test.byteLength === 8;
    } catch (e) {
        return false;
    }
})();

/**
 * Check if SharedArrayBuffer is available (exported for stats/debugging)
 * @returns {boolean} True if SharedArrayBuffer can be used
 */
function isSharedArrayBufferAvailable() {
    return SHARED_MEMORY_AVAILABLE;
}

/**
 * Build shared vector data for zero-copy worker transfer
 * Priority 3: Prepares vectors in SharedArrayBuffer format
 * @returns {{sharedVectors: SharedArrayBuffer, payloads: Array, dimensions: number}|null}
 */
function buildSharedVectorData() {
    if (!SHARED_MEMORY_AVAILABLE || !vectors || vectors.size === 0) return null;

    const vectorArray = Array.from(vectors.values());
    if (vectorArray.length === 0) return null;

    // Defensive validation: verify all vectors have consistent dimensionality
    let expectedDimensions = null;

    for (let i = 0; i < vectorArray.length; i++) {
        const item = vectorArray[i];

        // Check if vector exists and is an array
        if (!item.vector || !Array.isArray(item.vector)) {
            console.warn(`[LocalVectorStore] Invalid vector at index ${i}: missing or not an array`);
            return null;
        }

        // Check vector dimensions
        const currentDimensions = item.vector.length;
        if (currentDimensions === 0) {
            console.warn(`[LocalVectorStore] Empty vector at index ${i}`);
            return null;
        }

        // Validate consistent dimensions across all vectors
        if (expectedDimensions === null) {
            expectedDimensions = currentDimensions;
        } else if (currentDimensions !== expectedDimensions) {
            console.error(`[LocalVectorStore] Dimension mismatch at index ${i}: expected ${expectedDimensions}, got ${currentDimensions}`);
            return null;
        }

        // Validate all elements are numbers
        for (let j = 0; j < currentDimensions; j++) {
            if (typeof item.vector[j] !== 'number' || isNaN(item.vector[j])) {
                console.warn(`[LocalVectorStore] Non-numeric value at vector ${i}, index ${j}`);
                return null;
            }
        }
    }

    const dimensions = expectedDimensions;
    const totalFloats = vectorArray.length * dimensions;

    try {
        const sharedBuffer = new SharedArrayBuffer(totalFloats * 4); // Float32 = 4 bytes
        const sharedView = new Float32Array(sharedBuffer);

        // Copy vectors into shared buffer (one-time cost)
        for (let i = 0; i < vectorArray.length; i++) {
            sharedView.set(vectorArray[i].vector, i * dimensions);
        }

        // Payloads still use structured clone (small relative to vectors)
        const payloads = vectorArray.map(v => ({ id: v.id, payload: v.payload }));

        return { sharedVectors: sharedBuffer, payloads, dimensions };
    } catch (e) {
        console.warn('[LocalVectorStore] SharedArrayBuffer build failed:', e.message);
        return null;
    }
}

// ==========================================
// In-Memory Vector Storage (LRU Cache)
// ==========================================

// Create LRU cache with eviction callback for IndexedDB cleanup
let vectors = null; // Lazy initialized with LRU cache
let dbReady = false;
let db = null;

// Configuration
let currentMaxVectors = DEFAULT_VECTOR_MAX_SIZE;
let autoScaleEnabled = false;

// Web Worker for async search (performance optimization)
let searchWorker = null;
let pendingSearches = new Map(); // id -> { resolve, reject }
let requestIdCounter = 0;

// Race condition fix: Single initialization promise ensures only one worker is created
let workerInitPromise = null;
let workerReady = false;


// ==========================================
// Web Worker Management
// ==========================================

/**
 * Initialize the search worker asynchronously
 * Uses promise-based initialization to prevent race condition when
 * multiple concurrent calls try to create the worker simultaneously.
 * 
 * Handles offline/network errors gracefully:
 * - Detects network failures (script fetch errors)
 * - Prevents retry loops on persistent network issues
 * - Falls back to sync search without breaking the app
 * 
 * @returns {Promise<Worker|null>} The worker instance or null if unavailable
 */
async function initWorkerAsync() {
    // Already initialized
    if (searchWorker && workerReady) return searchWorker;

    // Initialization in progress - wait for it
    if (workerInitPromise) return workerInitPromise;

    // Start initialization - create single promise that all callers will share
    workerInitPromise = new Promise((resolve) => {
        try {
            // Check if we're in a context where workers can be created
            if (typeof Worker === 'undefined') {
                console.warn('[LocalVectorStore] Web Workers not supported, using sync fallback');
                // Don't set workerInitPromise = null here - it causes a race condition
                // The promise will resolve with null and callers can handle it
                resolve(null);
                return;
            }

            const worker = new Worker('js/workers/vector-search-worker.js');

            // Track if worker successfully initialized (received a message)
            let workerStarted = false;

            worker.onmessage = (event) => {
                workerStarted = true;
                const { type, id, results, stats, message } = event.data;

                const pending = pendingSearches.get(id);
                if (!pending) {
                    console.warn('[LocalVectorStore] Received response for unknown request:', id);
                    return;
                }

                pendingSearches.delete(id);

                if (type === 'results') {
                    if (stats) {
                        console.log(`[LocalVectorStore] Worker search: ${stats.vectorCount} vectors in ${stats.elapsedMs}ms`);
                    }
                    pending.resolve(results);
                } else if (type === 'error') {
                    console.error('[LocalVectorStore] Worker error:', message);
                    pending.reject(new Error(message));
                }
            };

            worker.onerror = (error) => {
                // Determine if this is a network/loading error vs runtime error
                const isNetworkError = !workerStarted ||
                    (error.message && (
                        error.message.includes('NetworkError') ||
                        error.message.includes('Failed to fetch') ||
                        error.message.includes('Failed to load') ||
                        error.message.includes('Script error')
                    ));

                if (isNetworkError) {
                    console.warn('[LocalVectorStore] Worker failed to load (offline or network error). Using sync fallback.');
                    console.warn('[LocalVectorStore] This is expected when offline - vector search will use main thread.');
                } else {
                    console.error('[LocalVectorStore] Worker runtime error:', error);
                }

                // Reject all pending searches
                for (const [id, pending] of pendingSearches) {
                    pending.reject(new Error('Worker unavailable'));
                }
                pendingSearches.clear();

                searchWorker = null;
                workerReady = false;

                // Only clear workerInitPromise for non-network errors to prevent retry loops
                if (!isNetworkError) {
                    workerInitPromise = null;
                }

                // For network errors, don't retry immediately
                // The sync fallback will handle all searches
                resolve(null);
            };

            searchWorker = worker;
            workerReady = true;
            console.log('[LocalVectorStore] Search worker initialized');
            resolve(worker);
        } catch (e) {
            // Handle synchronous errors (e.g., CSP blocking Worker creation)
            const isSecurityError = e.name === 'SecurityError' ||
                e.message?.includes('Content Security Policy');

            if (isSecurityError) {
                console.warn('[LocalVectorStore] Worker blocked by security policy, using sync fallback');
            } else {
                console.warn('[LocalVectorStore] Failed to initialize worker, using sync fallback:', e.message);
            }

            workerInitPromise = null; // Allow retry
            resolve(null);
        }
    });

    return workerInitPromise;
}

/**
 * Synchronous worker getter for backward compatibility
 * @returns {Worker|null} The worker if already initialized, null otherwise
 */
function getWorkerSync() {
    return workerReady ? searchWorker : null;
}

/**
 * Generate unique request ID for worker correlation
 */
function generateRequestId() {
    return `search-${++requestIdCounter}-${Date.now()}`;
}

/**
 * Initialize the IndexedDB database
 */
async function initDB() {
    if (dbReady && db) return db;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('[LocalVectorStore] IndexedDB error:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            dbReady = true;
            console.log('[LocalVectorStore] IndexedDB ready');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // Create vectors store
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('type', 'payload.type', { unique: false });
                console.log('[LocalVectorStore] Created vectors store');
            }
        };
    });
}

/**
 * Load all vectors from IndexedDB into LRU cache
 * Note: If there are more vectors in DB than maxVectors, oldest will be evicted
 */
async function loadFromDB() {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            // Initialize LRU cache if not already done
            if (!vectors) {
                initializeVectorsCache();
            }

            vectors.clear();
            for (const item of request.result) {
                vectors.set(item.id, item);
            }

            // Process any evictions
            processEvictions();

            console.log(`[LocalVectorStore] Loaded ${vectors.size} vectors from IndexedDB (max: ${currentMaxVectors})`);
            resolve(vectors.size);
        };

        request.onerror = () => reject(request.error);
    });
}

/**
 * Initialize the LRU cache for vectors
 */
function initializeVectorsCache() {
    vectors = new LRUCache(currentMaxVectors, {
        onEvict: (key) => {
            // Mark for async delete from IndexedDB
            console.log(`[LocalVectorStore] Evicting vector ${key} from LRU cache`);
        }
    });
}

/**
 * Process pending evictions from LRU cache by deleting from IndexedDB
 */
async function processEvictions() {
    if (!vectors || !db) return;

    const evicted = vectors.getPendingEvictions();
    if (evicted.length === 0) return;

    try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        for (const id of evicted) {
            store.delete(id);
        }

        console.log(`[LocalVectorStore] Cleaned up ${evicted.length} evicted vectors from IndexedDB`);
    } catch (e) {
        console.warn('[LocalVectorStore] Failed to clean up evicted vectors:', e);
    }
}

/**
 * Persist a vector to IndexedDB
 */
async function persistVector(item) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(item);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Clear all vectors from IndexedDB
 */
async function clearDB() {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
            vectors.clear();
            console.log('[LocalVectorStore] Cleared all vectors');
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

// ==========================================
// Vector Math (Cosine Similarity)
// ==========================================

/**
 * Compute cosine similarity between two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Similarity score between -1 and 1
 */
function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) {
        return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
}

// ==========================================
// Public API
// ==========================================

const LocalVectorStore = {
    /**
     * Initialize the vector store
     * Loads existing vectors from IndexedDB and pre-initializes the search worker
     * @param {Object} options - Configuration options
     * @param {number} options.maxVectors - Maximum vectors before eviction (default: 5000)
     * @param {boolean} options.autoScale - Auto-scale based on storage quota
     */
    async init(options = {}) {
        // Apply configuration
        if (options.maxVectors) {
            currentMaxVectors = options.maxVectors;
        }

        // Initialize LRU cache
        initializeVectorsCache();

        await initDB();
        await loadFromDB();

        // Enable auto-scale if requested
        if (options.autoScale) {
            await this.enableAutoScale(true);
        }

        // Pre-initialize worker to avoid user-facing delays during first search
        // Note: initWorkerAsync() never rejects - it resolves with the worker or null
        const worker = await initWorkerAsync();
        if (!worker) {
            console.warn('[LocalVectorStore] Worker pre-init failed, will use sync fallback');
        }

        return this.count();
    },

    /**
     * Add or update a vector
     * May trigger LRU eviction if at capacity
     * @param {number|string} id - Unique identifier for this vector
     * @param {number[]} vector - The embedding vector (e.g., 384 dimensions)
     * @param {Object} payload - Metadata (text, type, etc.)
     */
    async upsert(id, vector, payload = {}) {
        if (!vectors) initializeVectorsCache();

        const item = { id, vector, payload };
        const evicted = vectors.set(id, item);

        // Async persist to IndexedDB (non-blocking)
        persistVector(item).catch(e => {
            console.warn('[LocalVectorStore] Persist failed:', e);
        });

        // Clean up any evicted items from IndexedDB
        if (evicted) {
            processEvictions();
        }

        return true;
    },

    /**
     * Add multiple vectors at once (batch upsert)
     * @param {Array<{id, vector, payload}>} items - Array of vectors to add
     */
    async upsertBatch(items) {
        for (const item of items) {
            vectors.set(item.id, item);
        }

        // Batch persist to IndexedDB
        if (db) {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            for (const item of items) {
                store.put(item);
            }

            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => resolve(items.length);
                transaction.onerror = () => reject(transaction.error);
            });
        }

        return items.length;
    },

    /**
     * Search for similar vectors (synchronous, main thread)
     * Uses brute-force cosine similarity (fast for ~1000 vectors)
     * NOTE: For large vector sets, prefer searchAsync() to avoid UI blocking
     * 
     * @param {number[]} queryVector - The query embedding vector
     * @param {number} limit - Maximum results to return
     * @param {number} threshold - Minimum similarity score (0-1)
     * @returns {Array<{id, score, payload}>} Sorted by similarity descending
     */
    search(queryVector, limit = 5, threshold = 0.5) {
        if (!queryVector || queryVector.length === 0) {
            return [];
        }

        const results = [];

        for (const [id, item] of vectors) {
            const score = cosineSimilarity(queryVector, item.vector);

            if (score >= threshold) {
                results.push({
                    id,
                    score,
                    payload: item.payload
                });
            }
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score);

        return results.slice(0, limit);
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
        if (!queryVector || queryVector.length === 0) {
            return [];
        }

        // Try to use worker for non-blocking search (async initialization prevents race)
        const worker = await initWorkerAsync();

        if (!worker) {
            // Fallback to sync search
            console.log('[LocalVectorStore] Worker unavailable, using sync search');
            return this.search(queryVector, limit, threshold);
        }

        // Convert Map to Array for worker transfer
        const vectorArray = Array.from(vectors.values());

        // For small vector sets, use sync search (worker overhead not worth it)
        if (vectorArray.length < 500) {
            return this.search(queryVector, limit, threshold);
        }

        const requestId = generateRequestId();

        return new Promise((resolve, reject) => {
            // Timeout for worker response (30 seconds)
            const timeout = setTimeout(() => {
                pendingSearches.delete(requestId);
                console.warn('[LocalVectorStore] Worker timeout, falling back to sync search');
                resolve(this.search(queryVector, limit, threshold));
            }, 30000);

            pendingSearches.set(requestId, {
                resolve: (results) => {
                    clearTimeout(timeout);
                    resolve(results);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    // Fallback to sync on worker error
                    console.warn('[LocalVectorStore] Worker failed, falling back to sync:', error);
                    resolve(this.search(queryVector, limit, threshold));
                }
            });

            // Priority 3: Use SharedArrayBuffer when available for zero-copy transfer
            if (SHARED_MEMORY_AVAILABLE) {
                const sharedData = buildSharedVectorData();
                if (sharedData) {
                    worker.postMessage({
                        type: 'search_shared',
                        id: requestId,
                        queryVector,
                        sharedVectors: sharedData.sharedVectors,
                        payloads: sharedData.payloads,
                        dimensions: sharedData.dimensions,
                        limit,
                        threshold
                    });
                    return;
                }
            }

            // Fallback to standard structured clone transfer
            worker.postMessage({
                type: 'search',
                id: requestId,
                queryVector,
                vectors: vectorArray,
                limit,
                threshold
            });
        });
    },

    /**
     * Get a specific vector by ID
     * @param {number|string} id - Vector ID
     * @returns {Object|null} The vector item or null
     */
    get(id) {
        return vectors.get(id) || null;
    },

    /**
     * Delete a vector by ID
     * @param {number|string} id - Vector ID
     */
    async delete(id) {
        vectors.delete(id);

        if (db) {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.delete(id);
        }
    },

    /**
     * Get total vector count
     * @returns {number} Number of vectors stored
     */
    count() {
        return vectors.size;
    },

    /**
     * Clear all vectors
     */
    async clear() {
        await clearDB();
    },

    /**
     * Get store statistics including LRU eviction metrics
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
                    available: SHARED_MEMORY_AVAILABLE,
                    enabled: false
                }
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

        return {
            count,
            maxVectors: currentMaxVectors,
            utilization: count / currentMaxVectors,
            dimensions: {
                min: minDimensions === Infinity ? 0 : minDimensions,
                max: maxDimensions,
                avg: avgDimensions
            },
            storage: {
                bytes: estimatedBytes,
                megabytes: parseFloat(estimatedMB)
            },
            lru: {
                evictionCount: lruStats.evictionCount,
                hitRate: lruStats.hitRate,
                hitCount: lruStats.hitCount,
                missCount: lruStats.missCount,
                autoScaleEnabled: autoScaleEnabled
            },
            sharedMemory: {
                available: SHARED_MEMORY_AVAILABLE,
                enabled: SHARED_MEMORY_AVAILABLE && count > 0
            }
        };
    },

    /**
     * Check if store is ready
     */
    isReady() {
        return dbReady;
    },

    /**
     * Check if search worker is ready
     * @returns {boolean} True if worker is initialized and ready
     */
    isWorkerReady() {
        return workerReady;
    },

    /**
     * Set maximum vectors (triggers eviction if new limit is lower)
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
     * @returns {number}
     */
    getMaxVectors() {
        return currentMaxVectors;
    },

    /**
     * Enable/disable auto-scale based on storage quota
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
     * @returns {boolean}
     */
    isAutoScaleEnabled() {
        return autoScaleEnabled;
    }
};

// ==========================================
// Export
// ==========================================

// ES Module export
export { LocalVectorStore };

// ES Module export - use ModuleRegistry for access instead of window globals
console.log('[LocalVectorStore] Module loaded. Call LocalVectorStore.init() to initialize.');

