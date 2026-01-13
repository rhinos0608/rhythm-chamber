/**
 * Local Vector Store for Rhythm Chamber
 * 
 * In-memory + IndexedDB vector storage for local semantic search
 * without Qdrant Cloud dependency.
 * 
 * Design validated by HNW analysis:
 * - Storage size for 1000 chunks × 384 dimensions × 4 bytes ≈ 1.5MB (negligible)
 * - Brute-force cosine similarity is fast enough for ~1000 vectors
 * - Uses Web Worker for non-blocking search (future optimization)
 * 
 * HNW Considerations:
 * - Hierarchy: LocalVectorStore is the authority for local mode
 * - Network: Isolated from cloud Qdrant - no accidental mixing
 * - Wave: Persistence is async, search is sync for responsiveness
 */

// ==========================================
// Constants
// ==========================================

const DB_NAME = 'rhythm_chamber_vectors';
const DB_VERSION = 1;
const STORE_NAME = 'vectors';

// ==========================================
// In-Memory Vector Storage
// ==========================================

let vectors = new Map(); // id -> { id, vector, payload }
let dbReady = false;
let db = null;

// ==========================================
// IndexedDB Persistence
// ==========================================

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
 * Load all vectors from IndexedDB into memory
 */
async function loadFromDB() {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            vectors.clear();
            for (const item of request.result) {
                vectors.set(item.id, item);
            }
            console.log(`[LocalVectorStore] Loaded ${vectors.size} vectors from IndexedDB`);
            resolve(vectors.size);
        };

        request.onerror = () => reject(request.error);
    });
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
     * Loads existing vectors from IndexedDB
     */
    async init() {
        await initDB();
        await loadFromDB();
        return this.count();
    },

    /**
     * Add or update a vector
     * @param {number|string} id - Unique identifier for this vector
     * @param {number[]} vector - The embedding vector (e.g., 384 dimensions)
     * @param {Object} payload - Metadata (text, type, etc.)
     */
    async upsert(id, vector, payload = {}) {
        const item = { id, vector, payload };
        vectors.set(id, item);

        // Async persist to IndexedDB (non-blocking)
        persistVector(item).catch(e => {
            console.warn('[LocalVectorStore] Persist failed:', e);
        });

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
     * Search for similar vectors
     * Uses brute-force cosine similarity (fast for ~1000 vectors)
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
     * Get store statistics
     */
    getStats() {
        let totalDimensions = 0;
        let minDimensions = Infinity;
        let maxDimensions = 0;

        for (const [, item] of vectors) {
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

        return {
            count,
            dimensions: {
                min: minDimensions === Infinity ? 0 : minDimensions,
                max: maxDimensions,
                avg: avgDimensions
            },
            storage: {
                bytes: estimatedBytes,
                megabytes: parseFloat(estimatedMB)
            }
        };
    },

    /**
     * Check if store is ready
     */
    isReady() {
        return dbReady;
    }
};

// ==========================================
// Export
// ==========================================

window.LocalVectorStore = LocalVectorStore;

console.log('[LocalVectorStore] Module loaded. Call LocalVectorStore.init() to initialize.');
