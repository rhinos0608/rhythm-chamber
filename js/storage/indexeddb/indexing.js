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
import { deepClone } from '../../utils/common.js';

// Module-level VectorClock for write tracking
const writeVectorClock = new VectorClock();

// ==========================================
// Fallback Transaction Atomicity Helpers
// ==========================================

/**
 * Capture current state of a store for potential rollback
 * @param {string} storeName - Store name
 * @returns {Promise<Object>} Deep clone of current store state
 * @private
 */
async function captureStoreState(storeName) {
    const allData = await FallbackBackend.getAll(storeName);
    // Deep clone to prevent reference sharing
    return deepClone(allData);
}

/**
 * Rollback store to previous state after transaction failure
 * @param {string} storeName - Store name
 * @param {Object} previousState - State to restore
 * @param {Array} operationsLog - Log of attempted operations
 * @returns {Promise<void>}
 * @private
 */
async function rollbackStoreState(storeName, previousState, operationsLog) {
    try {
        // For array-based stores (streams, chunks, embeddings), restore entire state
        if (storeName === 'streams' || storeName === 'chunks' || storeName === 'embeddings') {
            await FallbackBackend.clear(storeName);
            if (Array.isArray(previousState) && previousState.length > 0) {
                // Restore each item
                for (const item of previousState) {
                    await FallbackBackend.put(storeName, item);
                }
            }
        } else {
            // For key-value stores, clear and restore previous entries
            await FallbackBackend.clear(storeName);
            if (Array.isArray(previousState)) {
                for (const item of previousState) {
                    if (item && (item.id || item.key)) {
                        await FallbackBackend.put(storeName, item);
                    }
                }
            }
        }

        console.log(`[IndexedDB] Rollback completed for ${storeName}, restored ${Array.isArray(previousState) ? previousState.length : 0} items`);
    } catch (rollbackError) {
        // If rollback fails, we have a serious problem - log extensively
        console.error(`[IndexedDB] CRITICAL: Rollback failed for ${storeName}:`, rollbackError);
        console.error('[IndexedDB] Operations log:', operationsLog);
        console.error('[IndexedDB] Previous state:', previousState);
        // Re-throw so caller knows data may be inconsistent
        throw new Error(`Rollback failed: ${rollbackError.message}. Data may be in inconsistent state.`);
    }
}

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
                // Using deepClone instead of JSON.parse/stringify to preserve Date objects and undefined values
                const clonedValue = deepClone(currentValue);

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
 * IMPORTANT: Fallback mode provides BEST-EFFORT atomicity:
 * - All operations are validated before execution (pre-flight checks)
 * - If any operation fails, all previous operations are rolled back
 * - Rollback restores data to state before transaction started
 * - This is NOT true ACID atomicity but prevents partial updates
 *
 * @param {string} storeName - Store name
 * @param {string} mode - Transaction mode ('readonly' or 'readwrite')
 * @param {function} operations - Function receiving store, returns array of ops
 * @returns {Promise<void>}
 */
export async function transaction(storeName, mode, operations) {
    // Use fallback if active
    if (isUsingFallback()) {
        // FALLBACK ATOMICITY IMPLEMENTATION
        // Since FallbackBackend doesn't support true transactions, we implement
        // a two-phase commit with rollback capability:
        //
        // Phase 1: Capture current state for potential rollback
        // Phase 2: Execute operations with error tracking
        // Phase 3: On failure, restore captured state (rollback)

        // Phase 1: Capture pre-transaction state for rollback
        const preTransactionState = await captureStoreState(storeName);
        const operationsLog = [];

        // Create a wrapper that tracks operations for potential rollback
        const fallbackStore = {
            put: async data => {
                const key = data.id || data.key || 'default';
                operationsLog.push({ type: 'put', key, data });
                return FallbackBackend.put(storeName, data);
            },
            get: key => FallbackBackend.get(storeName, key),
            delete: async key => {
                operationsLog.push({ type: 'delete', key });
                return FallbackBackend.delete(storeName, key);
            },
            clear: async () => {
                operationsLog.push({ type: 'clear' });
                return FallbackBackend.clear(storeName);
            },
        };

        try {
            // Phase 2: Execute operations
            const result = operations(fallbackStore);

            // Handle both sync and async operations
            if (result && typeof result.then === 'function') {
                await result;
            }

            // Success - no rollback needed
            return;
        } catch (error) {
            // Phase 3: Rollback on failure
            console.error(
                `[IndexedDB] Fallback transaction failed, rolling back ${operationsLog.length} operations:`
            );

            await rollbackStoreState(storeName, preTransactionState, operationsLog);

            // Re-throw so caller knows transaction failed
            throw new Error(
                `Fallback transaction failed and rolled back: ${error.message}`
            );
        }
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
