/**
 * IndexedDB Core Module
 * 
 * Low-level IndexedDB operations for the Storage layer.
 * Provides primitive operations: put, get, getAll, clear, delete.
 * 
 * @module storage/indexeddb
 */

// ==========================================
// Database Configuration
// ==========================================

const INDEXEDDB_NAME = 'rhythm-chamber';
const INDEXEDDB_VERSION = 3;

const INDEXEDDB_STORES = {
    STREAMS: 'streams',
    CHUNKS: 'chunks',
    EMBEDDINGS: 'embeddings',
    PERSONALITY: 'personality',
    SETTINGS: 'settings',
    CHAT_SESSIONS: 'chat_sessions',
    CONFIG: 'config',
    TOKENS: 'tokens',
    MIGRATION: 'migration'
};

// Database connection
let indexedDBConnection = null;

// ==========================================
// Connection Management
// ==========================================

/**
 * Initialize the IndexedDB database connection
 * @param {object} options - Options for handling version changes
 * @param {function} options.onVersionChange - Callback when another tab upgrades DB
 * @param {function} options.onBlocked - Callback when upgrade is blocked
 * @returns {Promise<IDBDatabase>} Database connection
 */
async function initDatabase(options = {}) {
    if (indexedDBConnection) return indexedDBConnection;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);

        request.onerror = () => reject(request.error);

        request.onblocked = () => {
            console.warn('[IndexedDB] Database upgrade blocked by other tabs');
            options.onBlocked?.();
        };

        request.onsuccess = () => {
            indexedDBConnection = request.result;

            indexedDBConnection.onversionchange = () => {
                console.log('[IndexedDB] Database version change detected');
                if (options.onVersionChange) {
                    options.onVersionChange();
                } else {
                    indexedDBConnection.close();
                    indexedDBConnection = null;
                }
            };

            resolve(indexedDBConnection);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            createStores(database);
        };
    });
}

/**
 * Create all required object stores
 * @param {IDBDatabase} database - Database instance
 */
function createStores(database) {
    // Store for raw streaming history
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.STREAMS)) {
        database.createObjectStore(INDEXEDDB_STORES.STREAMS, { keyPath: 'id' });
    }

    // Store for aggregated chunks
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.CHUNKS)) {
        const chunksStore = database.createObjectStore(INDEXEDDB_STORES.CHUNKS, { keyPath: 'id' });
        chunksStore.createIndex('type', 'type', { unique: false });
        chunksStore.createIndex('startDate', 'startDate', { unique: false });
    }

    // Store for embeddings
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.EMBEDDINGS)) {
        database.createObjectStore(INDEXEDDB_STORES.EMBEDDINGS, { keyPath: 'id' });
    }

    // Store for personality results
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.PERSONALITY)) {
        database.createObjectStore(INDEXEDDB_STORES.PERSONALITY, { keyPath: 'id' });
    }

    // Store for user settings
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.SETTINGS)) {
        database.createObjectStore(INDEXEDDB_STORES.SETTINGS, { keyPath: 'key' });
    }

    // Store for chat sessions
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.CHAT_SESSIONS)) {
        const sessionsStore = database.createObjectStore(INDEXEDDB_STORES.CHAT_SESSIONS, { keyPath: 'id' });
        sessionsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
    }

    // Unified config store
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.CONFIG)) {
        database.createObjectStore(INDEXEDDB_STORES.CONFIG, { keyPath: 'key' });
    }

    // Token store for encrypted credentials
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.TOKENS)) {
        database.createObjectStore(INDEXEDDB_STORES.TOKENS, { keyPath: 'key' });
    }

    // Migration state and rollback backup
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.MIGRATION)) {
        database.createObjectStore(INDEXEDDB_STORES.MIGRATION, { keyPath: 'id' });
    }
}

/**
 * Close the database connection
 */
function closeDatabase() {
    if (indexedDBConnection) {
        indexedDBConnection.close();
        indexedDBConnection = null;
    }
}

/**
 * Get the current database connection
 * @returns {IDBDatabase|null}
 */
function getConnection() {
    return indexedDBConnection;
}

// ==========================================
// Primitive Operations
// ==========================================

/**
 * Put (insert or update) a record
 * @param {string} storeName - Store name
 * @param {object} data - Data to store
 * @returns {Promise<IDBValidKey>} The key of the stored record
 */
async function put(storeName, data) {
    const database = await initDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(data);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get a single record by key
 * @param {string} storeName - Store name
 * @param {IDBValidKey} key - Record key
 * @returns {Promise<any>} The record or undefined
 */
async function get(storeName, key) {
    const database = await initDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all records from a store
 * @param {string} storeName - Store name
 * @returns {Promise<Array>} All records
 */
async function getAll(storeName) {
    const database = await initDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Clear all records from a store
 * @param {string} storeName - Store name
 * @returns {Promise<void>}
 */
async function clear(storeName) {
    const database = await initDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete a single record by key
 * @param {string} storeName - Store name
 * @param {IDBValidKey} key - Record key
 * @returns {Promise<void>}
 */
async function deleteRecord(storeName, key) {
    const database = await initDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Count records in a store
 * @param {string} storeName - Store name
 * @returns {Promise<number>} Record count
 */
async function count(storeName) {
    const database = await initDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Execute a transaction with multiple operations
 * @param {string} storeName - Store name
 * @param {string} mode - Transaction mode ('readonly' or 'readwrite')
 * @param {function} operations - Function receiving store, returns array of ops
 * @returns {Promise<void>}
 */
async function transaction(storeName, mode, operations) {
    const database = await initDatabase();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(storeName, mode);
        const store = tx.objectStore(storeName);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);

        operations(store);
    });
}

/**
 * Get records using an index with cursor (for sorted results)
 * @param {string} storeName - Store name
 * @param {string} indexName - Index name
 * @param {string} direction - Cursor direction ('next', 'prev', etc.)
 * @returns {Promise<Array>} Sorted records
 */
async function getAllByIndex(storeName, indexName, direction = 'next') {
    const database = await initDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.openCursor(null, direction);

        const results = [];
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                results.push(cursor.value);
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

// ==========================================
// Public API
// ==========================================

// Store constants export
export const STORES = INDEXEDDB_STORES;
export const DB_NAME = INDEXEDDB_NAME;
export const DB_VERSION = INDEXEDDB_VERSION;

// IndexedDBCore object for grouped exports
export const IndexedDBCore = {
    // Connection management
    initDatabase,
    closeDatabase,
    getConnection,

    // Store configuration
    STORES: INDEXEDDB_STORES,
    DB_NAME: INDEXEDDB_NAME,
    DB_VERSION: INDEXEDDB_VERSION,

    // Primitive operations
    put,
    get,
    getAll,
    clear,
    delete: deleteRecord,
    count,
    transaction,
    getAllByIndex
};

// Keep window global for backwards compatibility during migration
if (typeof window !== 'undefined') {
    window.IndexedDBCore = IndexedDBCore;
}

console.log('[IndexedDBCore] Core module loaded');

