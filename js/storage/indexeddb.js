/**
 * IndexedDB Core Module - Refactored
 *
 * This is the main entry point and public API facade.
 * Exports a single IndexedDBCore object for consistency across storage modules.
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
// IMPORTS
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
} from './indexeddb/connection.js';

import { get, getAll, count } from './indexeddb/operations/read.js';

import { put, clear, deleteRecord } from './indexeddb/operations/write.js';

import { getAllByIndex, atomicUpdate, transaction } from './indexeddb/indexing.js';

import { detectWriteConflict } from './indexeddb/conflict.js';

import { INDEXEDDB_NAME, INDEXEDDB_VERSION, INDEXEDDB_STORES } from './indexeddb/config.js';

// Re-export constants for backward compatibility
export {
    INDEXEDDB_NAME as DB_NAME,
    INDEXEDDB_VERSION as DB_VERSION,
    INDEXEDDB_STORES as STORES,
} from './indexeddb/config.js';

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
