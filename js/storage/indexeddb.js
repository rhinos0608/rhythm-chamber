/**
 * IndexedDB Core Module
 *
 * Low-level IndexedDB operations for the Storage layer.
 * Provides primitive operations: put, get, getAll, clear, delete.
 *
 * HNW Hierarchy: Respects TabCoordinator write authority for multi-tab safety.
 *
 * FALLBACK SUPPORT: When IndexedDB is unavailable (private browsing, etc.),
 * automatically falls back to localStorage/memory-based storage.
 *
 * @module storage/indexeddb
 */

import { TabCoordinator } from '../services/tab-coordination.js';
import { VectorClock } from '../services/vector-clock.js';
import { EventBus } from '../services/event-bus.js';
import { FallbackBackend } from './fallback-backend.js';

// Module-level VectorClock for write tracking
const writeVectorClock = new VectorClock();

// Fallback backend state
let usingFallback = false;
let fallbackInitialized = false;

// ==========================================
// Database Configuration
// ==========================================

const INDEXEDDB_NAME = 'rhythm-chamber';
const INDEXEDDB_VERSION = 5;

const INDEXEDDB_STORES = {
    STREAMS: 'streams',
    CHUNKS: 'chunks',
    EMBEDDINGS: 'embeddings',
    PERSONALITY: 'personality',
    SETTINGS: 'settings',
    CHAT_SESSIONS: 'chat_sessions',
    CONFIG: 'config',
    TOKENS: 'tokens',
    MIGRATION: 'migration',
    EVENT_LOG: 'event_log',
    EVENT_CHECKPOINT: 'event_checkpoint',
    DEMO_STREAMS: 'demo_streams',
    DEMO_PATTERNS: 'demo_patterns',
    DEMO_PERSONALITY: 'demo_personality'
};

// Database connection
let indexedDBConnection = null;

// Connection retry state
let connectionAttempts = 0;
let isConnectionFailed = false;

// ==========================================
// Connection Retry Configuration
// ==========================================

const CONNECTION_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 2
};

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
            // Emit event for UI notification
            EventBus.emit('storage:connection_blocked', {
                reason: 'upgrade_blocked',
                message: 'Database upgrade blocked by other tabs. Please close other tabs.'
            });
            options.onBlocked?.();
        };

        request.onsuccess = () => {
            indexedDBConnection = request.result;
            connectionAttempts = 0; // Reset on success
            isConnectionFailed = false;

            indexedDBConnection.onversionchange = () => {
                console.log('[IndexedDB] Database version change detected');
                if (options.onVersionChange) {
                    options.onVersionChange();
                } else {
                    indexedDBConnection.close();
                    indexedDBConnection = null;
                }
            };

            indexedDBConnection.onerror = (event) => {
                console.error('[IndexedDB] Database error:', event.target.error);
                EventBus.emit('storage:error', {
                    type: 'database_error',
                    error: event.target.error?.message || 'Unknown database error'
                });
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
 * Initialize database with retry logic and exponential backoff
 * HNW Hierarchy: Provides resilient connection with graceful degradation
 *
 * FALLBACK: If IndexedDB fails after all retries, automatically falls back
 * to FallbackBackend for private browsing compatibility.
 *
 * @param {object} options - Options for handling version changes
 * @param {number} [options.maxAttempts=3] - Maximum retry attempts
 * @param {function} options.onVersionChange - Callback when another tab upgrades DB
 * @param {function} options.onBlocked - Callback when upgrade is blocked
 * @param {function} options.onRetry - Callback on retry attempt
 * @param {boolean} [options.enableFallback=true] - Whether to use fallback on failure
 * @returns {Promise<IDBDatabase|object>} Database connection or fallback backend
 */
async function initDatabaseWithRetry(options = {}) {
    const maxAttempts = options.maxAttempts ?? CONNECTION_CONFIG.maxRetries;
    const enableFallback = options.enableFallback !== false;

    // If already using fallback, return immediately
    if (usingFallback) {
        return { fallback: true, backend: FallbackBackend };
    }

    // Return existing connection if available
    if (indexedDBConnection) {
        return indexedDBConnection;
    }

    // If previously failed permanently and fallback is available, use it
    if (isConnectionFailed && enableFallback) {
        return await activateFallback();
    }

    // If previously failed permanently and no fallback, throw immediately
    if (isConnectionFailed) {
        throw new Error('IndexedDB connection permanently failed. Refresh the page to retry.');
    }

    // Check if IndexedDB is available at all
    if (!window.indexedDB) {
        console.warn('[IndexedDB] IndexedDB not available in this environment');
        if (enableFallback) {
            return await activateFallback();
        }
        throw new Error('IndexedDB is not available in this browser environment');
    }

    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        connectionAttempts = attempt;

        try {
            console.log(`[IndexedDB] Connection attempt ${attempt}/${maxAttempts}`);

            const connection = await initDatabase(options);

            // Success - reset state
            connectionAttempts = 0;
            EventBus.emit('storage:connection_established', {
                attempts: attempt
            });

            return connection;
        } catch (error) {
            lastError = error;
            console.warn(`[IndexedDB] Connection attempt ${attempt} failed:`, error.message);

            // Notify about retry
            if (options.onRetry) {
                options.onRetry(attempt, maxAttempts, error);
            }

            if (attempt < maxAttempts) {
                // Calculate exponential backoff delay
                const delay = Math.min(
                    CONNECTION_CONFIG.baseDelayMs * Math.pow(CONNECTION_CONFIG.backoffMultiplier, attempt - 1),
                    CONNECTION_CONFIG.maxDelayMs
                );

                EventBus.emit('storage:connection_retry', {
                    attempt,
                    maxAttempts,
                    nextRetryMs: delay,
                    error: error.message
                });

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // All attempts exhausted - try fallback if enabled
    isConnectionFailed = true;

    if (enableFallback) {
        console.warn('[IndexedDB] All connection attempts failed, activating fallback backend');
        return await activateFallback();
    }

    // No fallback available - emit failure event
    EventBus.emit('storage:connection_failed', {
        attempts: connectionAttempts,
        error: lastError?.message || 'Unknown error',
        recoverable: false
    });

    console.error(`[IndexedDB] All ${maxAttempts} connection attempts failed`);
    throw new Error(`Failed to connect to IndexedDB after ${maxAttempts} attempts: ${lastError?.message}`);
}

/**
 * Activate fallback storage backend
 * @returns {Promise<object>} Fallback backend marker
 */
async function activateFallback() {
    if (!fallbackInitialized) {
        const fallbackInfo = await FallbackBackend.init();
        fallbackInitialized = true;

        console.log('[IndexedDB] Fallback backend activated:', fallbackInfo);
    }

    usingFallback = true;

    // Emit fallback activation event
    EventBus.emit('storage:fallback_activated', {
        mode: FallbackBackend.getMode(),
        stats: FallbackBackend.getStats()
    });

    return { fallback: true, backend: FallbackBackend };
}

/**
 * Check if currently using fallback backend
 * @returns {boolean}
 */
function isUsingFallback() {
    return usingFallback;
}

/**
 * Get current storage backend info
 * @returns {{ type: 'indexeddb' | 'fallback', fallbackMode?: string }}
 */
function getStorageBackend() {
    if (usingFallback) {
        return {
            type: 'fallback',
            fallbackMode: FallbackBackend.getMode(),
            stats: FallbackBackend.getStats()
        };
    }
    return { type: 'indexeddb' };
}

/**
 * Reset connection failure state (for recovery attempts)
 */
function resetConnectionState() {
    isConnectionFailed = false;
    connectionAttempts = 0;
    indexedDBConnection = null;
}

/**
 * Get connection status
 * @returns {{ isConnected: boolean, isFailed: boolean, attempts: number }}
 */
function getConnectionStatus() {
    return {
        isConnected: indexedDBConnection !== null,
        isFailed: isConnectionFailed,
        attempts: connectionAttempts
    };
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

    // Event log store for event replay
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.EVENT_LOG)) {
        const eventLogStore = database.createObjectStore(INDEXEDDB_STORES.EVENT_LOG, { keyPath: 'id' });
        eventLogStore.createIndex('sequenceNumber', 'sequenceNumber', { unique: true });
        eventLogStore.createIndex('type', 'type', { unique: false });
        eventLogStore.createIndex('timestamp', 'timestamp', { unique: false });
    }

    // Event checkpoint store for rapid recovery
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.EVENT_CHECKPOINT)) {
        const checkpointStore = database.createObjectStore(INDEXEDDB_STORES.EVENT_CHECKPOINT, { keyPath: 'id' });
        checkpointStore.createIndex('sequenceNumber', 'sequenceNumber', { unique: true });
    }

    // Demo streams store for demo mode data
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.DEMO_STREAMS)) {
        const demoStreamsStore = database.createObjectStore(INDEXEDDB_STORES.DEMO_STREAMS, { keyPath: 'id' });
        demoStreamsStore.createIndex('timestamp', 'timestamp', { unique: false });
        demoStreamsStore.createIndex('type', 'type', { unique: false });
    }

    // Demo patterns store for demo mode analysis
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.DEMO_PATTERNS)) {
        const demoPatternsStore = database.createObjectStore(INDEXEDDB_STORES.DEMO_PATTERNS, { keyPath: 'id' });
        demoPatternsStore.createIndex('timestamp', 'timestamp', { unique: false });
    }

    // Demo personality store for demo mode personality data
    if (!database.objectStoreNames.contains(INDEXEDDB_STORES.DEMO_PERSONALITY)) {
        database.createObjectStore(INDEXEDDB_STORES.DEMO_PERSONALITY, { keyPath: 'id' });
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
 * Wrap an IndexedDB request with timeout and proper error handling
 * CRITICAL FIX: Prevents hanging transactions and ensures proper cleanup
 * @param {IDBRequest} request - The IndexedDB request
 * @param {IDBTransaction} transaction - The parent transaction
 * @param {number} [timeoutMs=5000] - Timeout in milliseconds
 * @returns {Promise<any>} The request result
 */
function wrapRequest(request, transaction, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        let timeoutHandle;
        let completed = false;

        const cleanup = () => {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
                timeoutHandle = null;
            }
            completed = true;
        };

        // Set timeout
        timeoutHandle = setTimeout(() => {
            if (!completed) {
                cleanup();
                transaction.abort();
                reject(new Error(`IndexedDB request timeout after ${timeoutMs}ms`));
            }
        }, timeoutMs);

        // Handle success
        request.onsuccess = () => {
            if (!completed) {
                cleanup();
                resolve(request.result);
            }
        };

        // Handle error
        request.onerror = () => {
            if (!completed) {
                cleanup();
                reject(request.error || new Error('IndexedDB request failed'));
            }
        };

        // CRITICAL: Handle transaction abort
        transaction.onabort = () => {
            if (!completed) {
                cleanup();
                reject(transaction.error || new Error('IndexedDB transaction aborted'));
            }
        };

        // Handle transaction timeout (browser may abort for inactivity)
        transaction.ontimeout = () => {
            if (!completed) {
                cleanup();
                reject(new Error('IndexedDB transaction timed out'));
            }
        };
    });
}

/**
 * Put (insert or update) a record
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 * @param {string} storeName - Store name
 * @param {object} data - Data to store
 * @param {Object} [options] - Options
 * @param {boolean} [options.bypassAuthority] - Skip write authority check
 * @returns {Promise<IDBValidKey>} The key of the stored record
 */
async function put(storeName, data, options = {}) {
    // Use fallback if active
    if (usingFallback) {
        return FallbackBackend.put(storeName, data);
    }

    // Check write authority unless bypassed
    if (!options.bypassAuthority && !checkWriteAuthority(storeName, 'put')) {
        if (AUTHORITY_CONFIG.strictMode) {
            throw new Error(`Write denied: Tab is in read-only mode`);
        } else {
            return; // No-op in non-strict mode
        }
    }

    // Add VectorClock timestamp for dual-write protection and conflict detection
    // Skip for read-only stores or if explicitly bypassed
    const clockState = writeVectorClock.tick();
    const stampedData = options.skipWriteEpoch ? data : {
        ...data,
        _writeEpoch: clockState,
        _writerId: writeVectorClock.processId
    };

    try {
        const database = await initDatabase();
        const transaction = database.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(stampedData);

        // CRITICAL FIX: Use wrapRequest for timeout and abort handling
        return wrapRequest(request, transaction);
    } catch (error) {
        // On error, try falling back if not already
        if (!usingFallback) {
            console.warn('[IndexedDB] Put failed, trying fallback:', error.message);
            await activateFallback();
            return FallbackBackend.put(storeName, data);
        }
        throw error;
    }
}

/**
 * Get a single record by key
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 * @param {string} storeName - Store name
 * @param {IDBValidKey} key - Record key
 * @returns {Promise<any>} The record or undefined
 */
async function get(storeName, key) {
    // Use fallback if active
    if (usingFallback) {
        return FallbackBackend.get(storeName, key);
    }

    try {
        const database = await initDatabase();
        const transaction = database.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        // CRITICAL FIX: Use wrapRequest for timeout and abort handling
        return wrapRequest(request, transaction);
    } catch (error) {
        if (!usingFallback) {
            await activateFallback();
            return FallbackBackend.get(storeName, key);
        }
        throw error;
    }
}

/**
 * Get all records from a store
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 * @param {string} storeName - Store name
 * @returns {Promise<Array>} All records
 */
async function getAll(storeName) {
    // Use fallback if active
    if (usingFallback) {
        return FallbackBackend.getAll(storeName);
    }

    try {
        const database = await initDatabase();
        const transaction = database.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        // CRITICAL FIX: Use wrapRequest for timeout and abort handling
        return wrapRequest(request, transaction);
    } catch (error) {
        if (!usingFallback) {
            await activateFallback();
            return FallbackBackend.getAll(storeName);
        }
        throw error;
    }
}

/**
 * Clear all records from a store
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 * @param {string} storeName - Store name
 * @param {Object} [options] - Options
 * @param {boolean} [options.bypassAuthority] - Skip write authority check
 * @returns {Promise<void>}
 */
async function clear(storeName, options = {}) {
    // Use fallback if active
    if (usingFallback) {
        return FallbackBackend.clear(storeName);
    }

    // Check write authority unless bypassed
    if (!options.bypassAuthority && !checkWriteAuthority(storeName, 'clear')) {
        if (AUTHORITY_CONFIG.strictMode) {
            throw new Error(`Write denied: Tab is in read-only mode`);
        } else {
            return; // No-op in non-strict mode
        }
    }

    try {
        const database = await initDatabase();
        const transaction = database.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        // CRITICAL FIX: Use wrapRequest for timeout and abort handling
        return wrapRequest(request, transaction);
    } catch (error) {
        if (!usingFallback) {
            await activateFallback();
            return FallbackBackend.clear(storeName);
        }
        throw error;
    }
}

/**
 * Delete a single record by key
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 * @param {string} storeName - Store name
 * @param {IDBValidKey} key - Record key
 * @param {Object} [options] - Options
 * @param {boolean} [options.bypassAuthority] - Skip write authority check
 * @returns {Promise<void>}
 */
async function deleteRecord(storeName, key, options = {}) {
    // Use fallback if active
    if (usingFallback) {
        return FallbackBackend.delete(storeName, key);
    }

    // Check write authority unless bypassed
    if (!options.bypassAuthority && !checkWriteAuthority(storeName, 'delete')) {
        if (AUTHORITY_CONFIG.strictMode) {
            throw new Error(`Write denied: Tab is in read-only mode`);
        } else {
            return; // No-op in non-strict mode
        }
    }

    try {
        const database = await initDatabase();
        const transaction = database.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        // CRITICAL FIX: Use wrapRequest for timeout and abort handling
        return wrapRequest(request, transaction);
    } catch (error) {
        if (!usingFallback) {
            await activateFallback();
            return FallbackBackend.delete(storeName, key);
        }
        throw error;
    }
}

/**
 * Count records in a store
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 * @param {string} storeName - Store name
 * @returns {Promise<number>} Record count
 */
async function count(storeName) {
    // Use fallback if active
    if (usingFallback) {
        return FallbackBackend.count(storeName);
    }

    try {
        const database = await initDatabase();
        const transaction = database.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.count();

        // CRITICAL FIX: Use wrapRequest for timeout and abort handling
        return wrapRequest(request, transaction);
    } catch (error) {
        if (!usingFallback) {
            await activateFallback();
            return FallbackBackend.count(storeName);
        }
        throw error;
    }
}

/**
 * Execute a transaction with multiple operations
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 * @param {string} storeName - Store name
 * @param {string} mode - Transaction mode ('readonly' or 'readwrite')
 * @param {function} operations - Function receiving store, returns array of ops
 * @returns {Promise<void>}
 */
async function transaction(storeName, mode, operations) {
    // Use fallback if active
    if (usingFallback) {
        // Fallback doesn't support transactions - execute operations directly
        // This provides basic functionality but not atomicity
        return new Promise((resolve) => {
            try {
                operations(FallbackBackend);
            } catch (e) {
                console.warn('[IndexedDB] Fallback transaction operation failed:', e);
            }
            resolve();
        });
    }

    try {
        const database = await initDatabase();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, mode);
            const store = tx.objectStore(storeName);

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);

            operations(store);
        });
    } catch (error) {
        if (!usingFallback) {
            console.warn('[IndexedDB] Transaction failed, trying fallback:', error.message);
            await activateFallback();
            // Retry with fallback
            return transaction(storeName, mode, operations);
        }
        throw error;
    }
}

/**
 * Get records using an index with cursor (for sorted results)
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 * @param {string} storeName - Store name
 * @param {string} indexName - Index name
 * @param {string} direction - Cursor direction ('next', 'prev', etc.)
 * @returns {Promise<Array>} Sorted records
 */
async function getAllByIndex(storeName, indexName, direction = 'next') {
    // Use fallback if active - fallback doesn't support indexes, return all sorted manually
    if (usingFallback) {
        const allRecords = await FallbackBackend.getAll(storeName);
        // Fallback: simple sort by updatedAt or timestamp if available
        // This provides basic functionality without full index support
        const sortBy = indexName === 'updatedAt' ? 'updatedAt' :
                      indexName === 'timestamp' ? 'timestamp' :
                      indexName === 'startDate' ? 'startDate' : null;
        if (sortBy) {
            const isReverse = direction === 'prev' || direction === 'prevunique';
            allRecords.sort((a, b) => {
                const aVal = a[sortBy] || '';
                const bVal = b[sortBy] || '';
                return isReverse
                    ? String(bVal).localeCompare(String(aVal))
                    : String(aVal).localeCompare(String(bVal));
            });
        }
        return allRecords;
    }

    try {
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
    } catch (error) {
        if (!usingFallback) {
            console.warn('[IndexedDB] getAllByIndex failed, trying fallback:', error.message);
            await activateFallback();
            return getAllByIndex(storeName, indexName, direction);
        }
        throw error;
    }
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
                // Add write epoch to atomic updates with VectorClock
                const clockState = writeVectorClock.tick();
                const stampedValue = {
                    ...newValue,
                    _writeEpoch: clockState,
                    _writerId: writeVectorClock.processId
                };
                cursor.update(stampedValue);
                resolve(stampedValue);
            } else {
                // Key doesn't exist, create new
                const newValue = modifier(undefined);
                const clockState = writeVectorClock.tick();
                const stampedValue = {
                    ...newValue,
                    _writeEpoch: clockState,
                    _writerId: writeVectorClock.processId
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
 * Detect write conflicts between two records using VectorClock timestamps
 * VectorClock provides true concurrent conflict detection vs Lamport's total ordering
 * @param {Object} existing - Existing record with _writeEpoch
 * @param {Object} incoming - Incoming record with _writeEpoch
 * @returns {{ hasConflict: boolean, winner: 'existing' | 'incoming', reason: string, isConcurrent: boolean }}
 */
function detectWriteConflict(existing, incoming) {
    // No existing record - no conflict
    if (!existing) {
        return { hasConflict: false, winner: 'incoming', reason: 'new_record', isConcurrent: false };
    }

    // Neither has epoch - legacy data, treat as no conflict
    if (!existing._writeEpoch && !incoming._writeEpoch) {
        return { hasConflict: false, winner: 'incoming', reason: 'legacy_data', isConcurrent: false };
    }

    // Only one has epoch - prefer the one with epoch
    if (!existing._writeEpoch) {
        return { hasConflict: false, winner: 'incoming', reason: 'existing_legacy', isConcurrent: false };
    }
    if (!incoming._writeEpoch) {
        return { hasConflict: true, winner: 'existing', reason: 'incoming_legacy', isConcurrent: false };
    }

    // Both have epochs - use VectorClock comparison
    // Create temporary VectorClock to compare states
    const existingClock = VectorClock.fromState(existing._writeEpoch, existing._writerId);
    const comparison = existingClock.compare(incoming._writeEpoch);

    switch (comparison) {
        case 'equal':
            return { hasConflict: false, winner: 'incoming', reason: 'same_epoch', isConcurrent: false };

        case 'before':
            // Existing happened before incoming - incoming is newer
            return { hasConflict: false, winner: 'incoming', reason: 'incoming_newer', isConcurrent: false };

        case 'after':
            // Existing happened after incoming - existing is newer
            return { hasConflict: true, winner: 'existing', reason: 'existing_newer', isConcurrent: false };

        case 'concurrent':
            // True concurrent update detected - needs conflict resolution
            // Use writerId as tiebreaker (consistent ordering)
            const winnerByTiebreaker = (existing._writerId || '') < (incoming._writerId || '')
                ? 'existing'
                : 'incoming';
            return {
                hasConflict: true,
                winner: winnerByTiebreaker,
                reason: 'concurrent_update',
                isConcurrent: true
            };

        default:
            // Fallback to incoming for unknown comparison result
            return { hasConflict: false, winner: 'incoming', reason: 'unknown_comparison', isConcurrent: false };
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
    initDatabaseWithRetry,
    closeDatabase,
    getConnection,
    resetConnectionState,
    getConnectionStatus,

    // Fallback management
    isUsingFallback,
    getStorageBackend,
    activateFallback,

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


console.log('[IndexedDBCore] Core module loaded');
