/**
 * IndexedDB Core Module
 * 
 * Low-level IndexedDB operations for the Storage layer.
 * Provides primitive operations: put, get, getAll, clear, delete.
 * 
 * HNW Hierarchy: Respects TabCoordinator write authority for multi-tab safety.
 * 
 * @module storage/indexeddb
 */

import { TabCoordinator } from '../services/tab-coordination.js';
import { LamportClock } from '../services/lamport-clock.js';

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
// Write Authority Configuration (HNW)
// ==========================================

/**
 * Configuration for write authority enforcement
 */
const AUTHORITY_CONFIG = {
    // Enable/disable write authority checks
    enforceWriteAuthority: true,

    // Stores exempt from authority checks (e.g., migration state)
    exemptStores: new Set(['migration']),

    // Whether to throw or just warn on authority violation
    strictMode: false
};

/**
 * Check write authority before performing write operation
 * HNW Hierarchy: Ensures only primary tab can write
 * 
 * @param {string} storeName - Store being written to
 * @param {string} operation - Operation name (for logging)
 * @returns {boolean} True if write is allowed
 * @throws {Error} In strict mode, throws if write not allowed
 */
function checkWriteAuthority(storeName, operation) {
    // Skip check if disabled
    if (!AUTHORITY_CONFIG.enforceWriteAuthority) {
        return true;
    }

    // Skip check for exempt stores
    if (AUTHORITY_CONFIG.exemptStores.has(storeName)) {
        return true;
    }

    // Check with TabCoordinator
    const isAllowed = TabCoordinator?.isWriteAllowed?.() ?? true;

    if (!isAllowed) {
        const message = `[IndexedDB] Write authority denied for ${operation} on ${storeName}. Tab is in read-only mode.`;

        if (AUTHORITY_CONFIG.strictMode) {
            const error = new Error(message);
            error.code = 'WRITE_AUTHORITY_DENIED';
            error.storeName = storeName;
            error.operation = operation;
            throw error;
        } else {
            console.warn(message);
            return false;
        }
    }

    return true;
}

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
 * @param {Object} [options] - Options
 * @param {boolean} [options.bypassAuthority] - Skip write authority check
 * @returns {Promise<IDBValidKey>} The key of the stored record
 */
async function put(storeName, data, options = {}) {
    // Check write authority unless bypassed
    if (!options.bypassAuthority && !checkWriteAuthority(storeName, 'put')) {
        if (AUTHORITY_CONFIG.strictMode) {
            throw new Error(`Write denied: Tab is in read-only mode`);
        } else {
            return; // No-op in non-strict mode
        }
    }

    // Add Lamport timestamp for dual-write protection
    // Skip for read-only stores or if explicitly bypassed
    const stampedData = options.skipWriteEpoch ? data : {
        ...data,
        _writeEpoch: LamportClock.tick(),
        _writerId: LamportClock.getId()
    };

    const database = await initDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(stampedData);

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
 * @param {Object} [options] - Options
 * @param {boolean} [options.bypassAuthority] - Skip write authority check
 * @returns {Promise<void>}
 */
async function clear(storeName, options = {}) {
    // Check write authority unless bypassed
    if (!options.bypassAuthority && !checkWriteAuthority(storeName, 'clear')) {
        if (AUTHORITY_CONFIG.strictMode) {
            throw new Error(`Write denied: Tab is in read-only mode`);
        } else {
            return; // No-op in non-strict mode
        }
    }

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
 * @param {Object} [options] - Options
 * @param {boolean} [options.bypassAuthority] - Skip write authority check
 * @returns {Promise<void>}
 */
async function deleteRecord(storeName, key, options = {}) {
    // Check write authority unless bypassed
    if (!options.bypassAuthority && !checkWriteAuthority(storeName, 'delete')) {
        if (AUTHORITY_CONFIG.strictMode) {
            throw new Error(`Write denied: Tab is in read-only mode`);
        } else {
            return; // No-op in non-strict mode
        }
    }

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

/**
 * Atomic read-modify-write operation using cursor
 * This ensures true atomicity for append operations
 * @param {string} storeName - Store name
 * @param {IDBValidKey} key - Record key
 * @param {function} modifier - Function that modifies the value
 * @returns {Promise<any>} The updated value
 */
async function atomicUpdate(storeName, key, modifier) {
    const database = await initDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.openCursor(key);

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const currentValue = cursor.value;
                const newValue = modifier(currentValue);
                // Add write epoch to atomic updates
                const stampedValue = {
                    ...newValue,
                    _writeEpoch: LamportClock.tick(),
                    _writerId: LamportClock.getId()
                };
                cursor.update(stampedValue);
                resolve(stampedValue);
            } else {
                // Key doesn't exist, create new
                const newValue = modifier(undefined);
                const stampedValue = {
                    ...newValue,
                    _writeEpoch: LamportClock.tick(),
                    _writerId: LamportClock.getId()
                };
                const putRequest = store.put(stampedValue);
                putRequest.onsuccess = () => resolve(stampedValue);
                putRequest.onerror = () => reject(putRequest.error);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Detect write conflicts between two records using Lamport timestamps
 * @param {Object} existing - Existing record with _writeEpoch
 * @param {Object} incoming - Incoming record with _writeEpoch
 * @returns {{ hasConflict: boolean, winner: 'existing' | 'incoming', reason: string }}
 */
function detectWriteConflict(existing, incoming) {
    // No existing record - no conflict
    if (!existing) {
        return { hasConflict: false, winner: 'incoming', reason: 'new_record' };
    }

    // Neither has epoch - legacy data, treat as no conflict
    if (!existing._writeEpoch && !incoming._writeEpoch) {
        return { hasConflict: false, winner: 'incoming', reason: 'legacy_data' };
    }

    // Only one has epoch - prefer the one with epoch
    if (!existing._writeEpoch) {
        return { hasConflict: false, winner: 'incoming', reason: 'existing_legacy' };
    }
    if (!incoming._writeEpoch) {
        return { hasConflict: true, winner: 'existing', reason: 'incoming_legacy' };
    }

    // Both have epochs - compare using Lamport clock rules
    const comparison = LamportClock.compare(
        { lamportTimestamp: existing._writeEpoch, senderId: existing._writerId || '' },
        { lamportTimestamp: incoming._writeEpoch, senderId: incoming._writerId || '' }
    );

    if (comparison === 0) {
        return { hasConflict: false, winner: 'incoming', reason: 'same_epoch' };
    }

    // Last-write-wins: higher epoch wins
    if (comparison < 0) {
        return { hasConflict: true, winner: 'incoming', reason: 'incoming_newer' };
    } else {
        return { hasConflict: true, winner: 'existing', reason: 'existing_newer' };
    }
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
    getAllByIndex,
    atomicUpdate,

    // Conflict detection
    detectWriteConflict
};

// Keep window global for backwards compatibility during migration
if (typeof window !== 'undefined') {
    window.IndexedDBCore = IndexedDBCore;
}

console.log('[IndexedDBCore] Core module loaded');
