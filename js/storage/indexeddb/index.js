/**
 * IndexedDB Core Module - Refactored
 *
 * This is the main entry point and public API facade.
 * All exports maintain backward compatibility with the original monolithic module.
 *
 * INTERNAL STRUCTURE:
 * - config.js: Database configuration constants
 * - connection.js: Connection management and retry logic
 * - migrations.js: Schema migrations (V1-V6)
 * - authority.js: Write authority enforcement (HNW)
 * - transactions.js: Transaction pool and request wrapping
 * - operations/read.js: Read operations (get, getAll, count)
 * - operations/write.js: Write operations (put, clear, delete)
 * - indexing.js: Index queries and atomic operations
 * - conflict.js: VectorClock-based conflict detection
 *
 * @module storage/indexeddb
 */

// ==========================================
// CONFIGURATION
// ==========================================

export {
    INDEXEDDB_NAME as DB_NAME,
    INDEXEDDB_VERSION as DB_VERSION,
    INDEXEDDB_STORES as STORES,
    CONNECTION_CONFIG,
    AUTHORITY_CONFIG,
    REQUEST_CONFIG,
} from './config.js';

// ==========================================
// CONNECTION MANAGEMENT
// ==========================================

export {
    initDatabase,
    initDatabaseWithRetry,
    closeDatabase,
    getConnection,
    resetConnectionState,
    getConnectionStatus,
} from './connection.js';

// ==========================================
// FALLBACK MANAGEMENT
// ==========================================

export { isUsingFallback, getStorageBackend, activateFallback } from './connection.js';

// ==========================================
// PRIMITIVE OPERATIONS - READ
// ==========================================

export { get, getAll, count } from './operations/read.js';

// ==========================================
// PRIMITIVE OPERATIONS - WRITE
// ==========================================

export { put, clear, delete as deleteRecord } from './operations/write.js';

// ==========================================
// ADVANCED OPERATIONS
// ==========================================

export { getAllByIndex, atomicUpdate, transaction } from './indexing.js';

// ==========================================
// CONFLICT DETECTION
// ==========================================

export { detectWriteConflict } from './conflict.js';

// ==========================================
// PUBLIC API (FACADE)
// ==========================================

import {
    initDatabase,
    initDatabaseWithRetry,
    closeDatabase,
    getConnection,
    resetConnectionState,
    getConnectionStatus,
    isUsingFallback,
    getStorageBackend,
    activateFallback,
} from './connection.js';

import { get, getAll, count } from './operations/read.js';

import { put, clear, deleteRecord } from './operations/write.js';

import { getAllByIndex, atomicUpdate, transaction } from './indexing.js';

import { detectWriteConflict } from './conflict.js';

import { INDEXEDDB_NAME, INDEXEDDB_VERSION, INDEXEDDB_STORES } from './config.js';

// Export IndexedDBCore object for grouped exports (backward compatibility)
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
    detectWriteConflict,
};

console.log('[IndexedDBCore] Core module loaded (refactored)');
