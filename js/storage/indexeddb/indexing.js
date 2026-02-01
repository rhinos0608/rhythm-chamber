/**
 * IndexedDB Indexing and Atomic Operations
 *
 * Provides index-based queries (getAllByIndex) and atomic update operations.
 * These are advanced operations that require special handling.
 *
 * @module storage/indexeddb/indexing
 */

import { initDatabase } from './connection.js';
import { isUsingFallback, activateFallback } from './connection.js';
import { FallbackBackend } from '../fallback-backend.js';
import { VectorClock } from '../../services/vector-clock.js';

// Module-level VectorClock for write tracking
const writeVectorClock = new VectorClock();

/**
 * Get records using an index with cursor (for sorted results)
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 *
 * @param {string} storeName - Store name
 * @param {string} indexName - Index name
 * @param {string} direction - Cursor direction ('next', 'prev', etc.)
 * @returns {Promise<Array>} Sorted records
 */
export async function getAllByIndex(storeName, indexName, direction = 'next') {
    // Use fallback if active - fallback doesn't support indexes, return all sorted manually
    if (isUsingFallback()) {
        const allRecords = await FallbackBackend.getAll(storeName);
        // Fallback: simple sort by updatedAt or timestamp if available
        // This provides basic functionality without full index support
        const sortBy =
            indexName === 'updatedAt'
                ? 'updatedAt'
                : indexName === 'timestamp'
                    ? 'timestamp'
                    : indexName === 'startDate'
                        ? 'startDate'
                        : null;
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
            request.onsuccess = event => {
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
        if (!isUsingFallback()) {
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
 * CRITICAL FIX for Issue #2: Adds try-catch around modifier call with explicit transaction abort on error
 *
 * @param {string} storeName - Store name
 * @param {IDBValidKey} key - Record key
 * @param {function} modifier - Function that modifies the value
 * @returns {Promise<any>} The updated value
 */
export async function atomicUpdate(storeName, key, modifier) {
    const database = await initDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.openCursor(key);

        // CRITICAL FIX for Issue #2: Track whether modifier threw to properly abort transaction
        let modifierThrew = false;
        let modifierError = null;

        request.onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
                const currentValue = cursor.value;

                // CRITICAL FIX for Issue #4: Deep clone currentValue before passing to modifier
                // This prevents the modifier from mutating the original object in-place
                // before throwing, which would leave the caller seeing a partially mutated object
                const clonedValue = JSON.parse(JSON.stringify(currentValue));

                // CRITICAL FIX for Issue #2: Wrap modifier in try-catch
                // If modifier throws, explicitly abort the transaction
                let newValue;
                try {
                    newValue = modifier(clonedValue);
                } catch (error) {
                    modifierThrew = true;
                    modifierError = error;
                    console.error(
                        '[IndexedDB] atomicUpdate modifier threw, aborting transaction:',
                        error
                    );
                    transaction.abort();
                    reject(error);
                    return;
                }

                // Add write epoch to atomic updates with VectorClock
                const clockState = writeVectorClock.tick();
                const stampedValue = {
                    ...newValue,
                    _writeEpoch: clockState,
                    _writerId: writeVectorClock.processId,
                };
                const updateReq = cursor.update(stampedValue);
                updateReq.onerror = () => reject(updateReq.error);
                updateReq.onsuccess = () => resolve(stampedValue);
            } else {
                // Key doesn't exist, create new
                // CRITICAL FIX for Issue #2: Wrap modifier in try-catch
                let newValue;
                try {
                    newValue = modifier(undefined);
                } catch (error) {
                    modifierThrew = true;
                    modifierError = error;
                    console.error(
                        '[IndexedDB] atomicUpdate modifier threw (new key), aborting transaction:',
                        error
                    );
                    transaction.abort();
                    reject(error);
                    return;
                }

                const clockState = writeVectorClock.tick();
                const stampedValue = {
                    ...newValue,
                    _writeEpoch: clockState,
                    _writerId: writeVectorClock.processId,
                };
                const putRequest = store.put(stampedValue);
                putRequest.onsuccess = () => resolve(stampedValue);
                putRequest.onerror = () => reject(putRequest.error);
            }
        };

        request.onerror = () => {
            // Only reject if modifier didn't throw (modifier error already handled)
            if (!modifierThrew) {
                reject(request.error);
            }
        };

        // CRITICAL FIX for Issue #2: Handle transaction abort explicitly
        transaction.onabort = () => {
            if (modifierThrew) {
                // Already rejected with modifier error
                return;
            }
            // Transaction aborted for another reason
            reject(transaction.error || new Error('Transaction aborted during atomicUpdate'));
        };
    });
}

/**
 * Execute a transaction with multiple operations
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 *
 * @param {string} storeName - Store name
 * @param {string} mode - Transaction mode ('readonly' or 'readwrite')
 * @param {function} operations - Function receiving store, returns array of ops
 * @returns {Promise<void>}
 */
export async function transaction(storeName, mode, operations) {
    // Use fallback if active
    if (isUsingFallback()) {
        // Fallback doesn't support transactions - execute operations directly
        // This provides basic functionality but not atomicity
        //
        // CRITICAL FIX: Create a wrapper object that mimics IDBObjectStore interface
        // by binding the storeName to FallbackBackend methods. This ensures the
        // operations callback can use the same API as IndexedDB objectStore.
        const fallbackStore = {
            put: data => FallbackBackend.put(storeName, data),
            get: key => FallbackBackend.get(storeName, key),
            delete: key => FallbackBackend.delete(storeName, key),
            clear: () => FallbackBackend.clear(storeName),
        };

        return new Promise(resolve => {
            try {
                operations(fallbackStore);
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
        if (!isUsingFallback()) {
            console.warn('[IndexedDB] Transaction failed, trying fallback:', error.message);
            await activateFallback();
            // Retry with fallback
            return transaction(storeName, mode, operations);
        }
        throw error;
    }
}
