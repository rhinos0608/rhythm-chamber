/**
 * IndexedDB Write Operations
 *
 * Provides primitive write operations: put, clear, delete.
 * All operations support fallback backend when IndexedDB is unavailable.
 * Includes write authority enforcement and VectorClock integration.
 *
 * @module storage/indexeddb/operations/write
 */

import { initDatabase } from '../../indexeddb/connection.js';
import { isUsingFallback, activateFallback } from '../../indexeddb/connection.js';
import { FallbackBackend } from '../../fallback-backend.js';
import { wrapRequest, acquireTransaction } from '../../indexeddb/transactions.js';
import { checkWriteAuthority } from '../../indexeddb/authority.js';
import { AUTHORITY_CONFIG } from '../../indexeddb/config.js';

// Module-level VectorClock for write tracking
import { VectorClock } from '../../../services/vector-clock.js';
const writeVectorClock = new VectorClock();

/**
 * Put (insert or update) a record
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 * CRITICAL FIX for Issue #1: Uses explicit transaction with proper locking
 *
 * @param {string} storeName - Store name
 * @param {object} data - Data to store
 * @param {Object} [options] - Options
 * @param {boolean} [options.bypassAuthority] - Skip write authority check
 * @param {IDBTransaction} [options.transaction] - Explicit transaction to use
 * @param {boolean} [options.skipWriteEpoch] - Skip VectorClock timestamp
 * @returns {Promise<IDBValidKey>} The key of the stored record
 */
export async function put(storeName, data, options = {}) {
    // Use fallback if active
    if (isUsingFallback()) {
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

        // CRITICAL FIX for Issue #1: Use explicit transaction for proper isolation
        // If a transaction is provided, use it. Otherwise acquire from pool or create new.
        let transaction = options.transaction;
        let shouldComplete = false;

        if (!transaction) {
            transaction = acquireTransaction(database, storeName, 'readwrite');
            shouldComplete = true;
        }

        const store = transaction.objectStore(storeName);
        const request = store.put(stampedData);

        // CRITICAL FIX: Use wrapRequest for timeout and abort handling
        const result = await wrapRequest(request, transaction);

        // For auto-created transactions, wait for completion before returning
        // This ensures proper locking and isolation
        if (shouldComplete) {
            await new Promise((resolve, reject) => {
                // CRITICAL FIX: Valid IndexedDB transaction states are 'active', 'inactive', 'done'
                // The 'finished' state does NOT exist in the IndexedDB spec
                if (transaction.readyState === 'done') {
                    resolve();
                    return;
                }
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
            });
        }

        return result;
    } catch (error) {
        // On error, try falling back if not already
        if (!isUsingFallback()) {
            console.warn('[IndexedDB] Put failed, trying fallback:', error.message);
            await activateFallback();
            return FallbackBackend.put(storeName, data);
        }
        throw error;
    }
}

/**
 * Clear all records from a store
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 *
 * @param {string} storeName - Store name
 * @param {Object} [options] - Options
 * @param {boolean} [options.bypassAuthority] - Skip write authority check
 * @returns {Promise<void>}
 */
export async function clear(storeName, options = {}) {
    // Use fallback if active
    if (isUsingFallback()) {
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
        if (!isUsingFallback()) {
            await activateFallback();
            return FallbackBackend.clear(storeName);
        }
        throw error;
    }
}

/**
 * Delete a single record by key
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 *
 * @param {string} storeName - Store name
 * @param {IDBValidKey} key - Record key
 * @param {Object} [options] - Options
 * @param {boolean} [options.bypassAuthority] - Skip write authority check
 * @returns {Promise<void>}
 */
export async function deleteRecord(storeName, key, options = {}) {
    // Use fallback if active
    if (isUsingFallback()) {
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
        if (!isUsingFallback()) {
            await activateFallback();
            return FallbackBackend.delete(storeName, key);
        }
        throw error;
    }
}
