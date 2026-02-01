/**
 * IndexedDB Persistence Operations
 *
 * Handles all IndexedDB operations for vector storage
 *
 * @module vector-store/persistence
 */

import { DB_NAME, DB_VERSION, STORE_NAME } from './config.js';

/**
 * Create a persistence manager for IndexedDB operations
 *
 * @returns {Object} Persistence manager
 */
export function createPersistenceManager() {
    let db = null;
    let dbReady = false;

    /**
     * Initialize the IndexedDB database
     *
     * @returns {Promise<IDBDatabase>} The database instance
     */
    async function initDB() {
        if (dbReady && db) return db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('[VectorStore] IndexedDB error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                db = request.result;
                dbReady = true;
                console.log('[VectorStore] IndexedDB ready');
                resolve(db);
            };

            request.onupgradeneeded = event => {
                const database = event.target.result;

                // Create vectors store
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('type', 'payload.type', { unique: false });
                    console.log('[VectorStore] Created vectors store');
                }
            };
        });
    }

    /**
     * Load all vectors from IndexedDB
     *
     * @param {Object} vectorsCache - Cache to load vectors into
     * @returns {Promise<number>} Number of vectors loaded
     */
    async function loadFromDB(vectorsCache) {
        if (!db) await initDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                vectorsCache.clear();
                for (const item of request.result) {
                    // Validate before adding to prevent corrupt data crashes
                    if (!item.id || !item.vector || !Array.isArray(item.vector)) {
                        console.warn('[VectorStore] Skipping invalid vector:', item.id);
                        continue;
                    }
                    vectorsCache.set(item.id, item);
                }

                console.log(`[VectorStore] Loaded ${vectorsCache.size} vectors from IndexedDB`);
                resolve(vectorsCache.size);
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Persist a vector to IndexedDB
     *
     * @param {Object} item - Vector item to persist
     * @returns {Promise<void>}
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
     * Batch persist vectors to IndexedDB
     *
     * @param {Array} items - Array of vector items to persist
     * @param {Function} processEvictions - Function to process evictions after batch
     * @returns {Promise<number>} Number of vectors persisted
     */
    async function persistBatch(items, processEvictions) {
        if (!db) await initDB();

        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        for (const item of items) {
            store.put(item);
        }

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                if (processEvictions) {
                    processEvictions();
                }
                resolve(items.length);
            };
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Delete a vector from IndexedDB
     *
     * @param {string} id - Vector ID to delete
     * @returns {Promise<void>}
     */
    async function deleteVector(id) {
        if (!db) await initDB();

        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(id);
    }

    /**
     * Clear all vectors from IndexedDB
     *
     * @param {Function} clearCache - Function to clear the memory cache
     * @returns {Promise<void>}
     */
    async function clearDB(clearCache) {
        if (!db) await initDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => {
                if (clearCache) {
                    clearCache();
                }
                console.log('[VectorStore] Cleared all vectors');
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Process pending evictions from LRU cache by deleting from IndexedDB
     *
     * @param {Array} evicted - Array of evicted vector IDs
     * @returns {Promise<void>}
     */
    async function processEvictions(evicted) {
        if (!db || evicted.length === 0) return;

        try {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            for (const id of evicted) {
                store.delete(id);
            }

            // Wait for transaction to complete before confirming
            await new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log(
                        `[VectorStore] Cleaned up ${evicted.length} evicted vectors from IndexedDB`
                    );
                    resolve();
                };
                transaction.onerror = () => {
                    console.warn(
                        '[VectorStore] Failed to clean up evicted vectors:',
                        transaction.error
                    );
                    reject(transaction.error);
                };
            });
        } catch (e) {
            console.warn('[VectorStore] Failed to clean up evicted vectors:', e);
        }
    }

    /**
     * Check if database is ready
     *
     * @returns {boolean} True if database is ready
     */
    function isReady() {
        return dbReady;
    }

    return {
        initDB,
        loadFromDB,
        persistVector,
        persistBatch,
        deleteVector,
        clearDB,
        processEvictions,
        isReady,
        get db() {
            return db;
        },
    };
}
