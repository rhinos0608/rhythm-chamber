/**
 * Storage Transactions Module
 *
 * Coordinates multi-store atomic operations across IndexedDB.
 * Provides transaction management and rollback capabilities.
 *
 * @module storage/transactions
 */

import { StorageTransaction } from './transaction/index.js';
import { IndexedDBCore } from './indexeddb.js';
import { STORES } from './stores/registry.js';

/**
 * Begin an atomic transaction across storage backends (IndexedDB + localStorage).
 * Delegates to StorageTransaction.transaction for commit/rollback semantics.
 *
 * @param {function(import('./transaction/index.js').TransactionContext): Promise<void>} callback
 * @returns {Promise<{success: boolean, operationsCommitted: number}>}
 */
export async function beginTransaction(callback) {
    if (!StorageTransaction?.transaction) {
        throw new Error('StorageTransaction not available');
    }
    return StorageTransaction.transaction(callback);
}

/**
 * Run operations on multiple stores in a single transaction
 * @param {string[]} storeNames - Array of store names
 * @param {string} mode - Transaction mode ('readonly' or 'readwrite')
 * @param {Function} callback - Callback receiving transaction object
 * @returns {Promise<*>} Result from callback
 */
export async function runTransaction(storeNames, mode, callback) {
    try {
        return await IndexedDBCore.transaction(
            storeNames.map(name => {
                // Convert STORES enum to actual store name if needed
                if (typeof name === 'string' && Object.values(STORES).includes(name)) {
                    return name;
                }
                return name;
            }),
            mode,
            callback
        );
    } catch (error) {
        console.error('[Storage] Transaction failed:', error);
        throw error;
    }
}

/**
 * Execute multiple write operations atomically
 * @param {Array<Object>} operations - Array of operations {store, type, data}
 * @returns {Promise<Array>} Array of results
 */
export async function batchOperations(operations) {
    const storeNames = [...new Set(operations.map(op => op.store))];

    return runTransaction(storeNames, 'readwrite', async (tx) => {
        const results = [];

        for (const op of operations) {
            const store = tx.objectStore(op.store);

            switch (op.type) {
                case 'put':
                    results.push(await store.put(op.data));
                    break;
                case 'delete':
                    results.push(await store.delete(op.key));
                    break;
                case 'clear':
                    results.push(await store.clear());
                    break;
                default:
                    throw new Error(`Unknown operation type: ${op.type}`);
            }
        }

        return results;
    });
}

/**
 * Clear multiple stores atomically
 * @param {string[]} storeNames - Array of store names to clear
 * @returns {Promise<void>}
 */
export async function clearStores(storeNames) {
    return runTransaction(storeNames, 'readwrite', async (tx) => {
        for (const storeName of storeNames) {
            await tx.objectStore(storeName).clear();
        }
    });
}

/**
 * Copy data from one store to another atomically
 * @param {string} sourceStore - Source store name
 * @param {string} targetStore - Target store name
 * @param {Function} filterFn - Optional filter function
 * @returns {Promise<number>} Number of records copied
 */
export async function copyStore(sourceStore, targetStore, filterFn = null) {
    return runTransaction([sourceStore, targetStore], 'readwrite', async (tx) => {
        const source = tx.objectStore(sourceStore);
        const target = tx.objectStore(targetStore);

        const allRecords = await source.getAll();
        let copiedCount = 0;

        for (const record of allRecords) {
            if (!filterFn || filterFn(record)) {
                await target.put(record);
                copiedCount++;
            }
        }

        return copiedCount;
    });
}

/**
 * Move data from one store to another atomically (copy then delete source)
 * @param {string} sourceStore - Source store name
 * @param {string} targetStore - Target store name
 * @param {Function} filterFn - Optional filter function
 * @returns {Promise<number>} Number of records moved
 */
export async function moveStore(sourceStore, targetStore, filterFn = null) {
    return runTransaction([sourceStore, targetStore], 'readwrite', async (tx) => {
        const source = tx.objectStore(sourceStore);
        const target = tx.objectStore(targetStore);

        const allRecords = await source.getAll();
        let movedCount = 0;

        for (const record of allRecords) {
            if (!filterFn || filterFn(record)) {
                await target.put(record);
                await source.delete(record.id || record.key);
                movedCount++;
            }
        }

        return movedCount;
    });
}

/**
 * Merge data from multiple stores into a single result
 * @param {string[]} storeNames - Array of store names to merge
 * @param {Function} mergeFn - Merge function receiving (storeName, data)
 * @returns {Promise<Object>} Merged result object
 */
export async function mergeStores(storeNames, mergeFn) {
    const results = {};

    for (const storeName of storeNames) {
        const data = await IndexedDBCore.getAll(storeName);
        results[storeName] = mergeFn(storeName, data);
    }

    return results;
}

/**
 * Check if a transaction is currently active
 * @returns {boolean} True if transaction is active
 */
export function isTransactionActive() {
    // This would need to be tracked by IndexedDBCore
    // For now, return false as we don't have visibility
    return false;
}

/**
 * Get transaction statistics
 * @returns {Promise<Object>} Transaction stats
 */
export async function getTransactionStats() {
    // Would need to be tracked by IndexedDBCore
    return {
        active: false,
        pending: 0,
        completed: 0,
        failed: 0
    };
}
