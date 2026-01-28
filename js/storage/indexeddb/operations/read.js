/**
 * IndexedDB Read Operations
 *
 * Provides primitive read operations: get, getAll, count.
 * All operations support fallback backend when IndexedDB is unavailable.
 *
 * @module storage/indexeddb/operations/read
 */

import { initDatabase } from '../../indexeddb/connection.js';
import { isUsingFallback, activateFallback } from '../../indexeddb/connection.js';
import { FallbackBackend } from '../../fallback-backend.js';
import { wrapRequest } from '../../indexeddb/transactions.js';

/**
 * Get a single record by key
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 *
 * @param {string} storeName - Store name
 * @param {IDBValidKey} key - Record key
 * @returns {Promise<any>} The record or undefined
 */
export async function get(storeName, key) {
    // Use fallback if active
    if (isUsingFallback()) {
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
        if (!isUsingFallback()) {
            await activateFallback();
            return FallbackBackend.get(storeName, key);
        }
        throw error;
    }
}

/**
 * Get all records from a store
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 *
 * @param {string} storeName - Store name
 * @returns {Promise<Array>} All records
 */
export async function getAll(storeName) {
    // Use fallback if active
    if (isUsingFallback()) {
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
        if (!isUsingFallback()) {
            await activateFallback();
            return FallbackBackend.getAll(storeName);
        }
        throw error;
    }
}

/**
 * Count records in a store
 * FALLBACK: Uses FallbackBackend when IndexedDB is unavailable
 *
 * @param {string} storeName - Store name
 * @returns {Promise<number>} Record count
 */
export async function count(storeName) {
    // Use fallback if active
    if (isUsingFallback()) {
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
        if (!isUsingFallback()) {
            await activateFallback();
            return FallbackBackend.count(storeName);
        }
        throw error;
    }
}
