/**
 * IndexedDB Connection Management
 *
 * Handles database initialization, connection retry logic,
 * and fallback backend activation.
 *
 * @module storage/indexeddb/connection
 */

import { INDEXEDDB_NAME, INDEXEDDB_VERSION, CONNECTION_CONFIG } from './config.js';
import { runMigrations } from './migrations.js';
import { EventBus } from '../../services/event-bus.js';
import { FallbackBackend } from '../fallback-backend.js';

// Database connection
let indexedDBConnection = null;

// Connection retry state
let connectionAttempts = 0;
let isConnectionFailed = false;

// Fallback backend state
let usingFallback = false;
let fallbackInitialized = false;

/**
 * Initialize the IndexedDB database connection
 * @param {object} options - Options for handling version changes
 * @param {function} options.onVersionChange - Callback when another tab upgrades DB
 * @param {function} options.onBlocked - Callback when upgrade is blocked
 * @returns {Promise<IDBDatabase>} Database connection
 */
export async function initDatabase(options = {}) {
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
            runMigrations(database, event.oldVersion, event.newVersion);
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
export async function initDatabaseWithRetry(options = {}) {
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
export function isUsingFallback() {
    return usingFallback;
}

/**
 * Get current storage backend info
 * @returns {{ type: 'indexeddb' | 'fallback', fallbackMode?: string }}
 */
export function getStorageBackend() {
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
export function resetConnectionState() {
    isConnectionFailed = false;
    connectionAttempts = 0;
    indexedDBConnection = null;
    usingFallback = false;
    fallbackInitialized = false;
}

/**
 * Get connection status
 * @returns {{ isConnected: boolean, isFailed: boolean, attempts: number }}
 */
export function getConnectionStatus() {
    return {
        isConnected: indexedDBConnection !== null,
        isFailed: isConnectionFailed,
        attempts: connectionAttempts
    };
}

/**
 * Close the database connection
 */
export function closeDatabase() {
    if (indexedDBConnection) {
        indexedDBConnection.close();
        indexedDBConnection = null;
    }
}

/**
 * Get the current database connection
 * @returns {IDBDatabase|null}
 */
export function getConnection() {
    return indexedDBConnection;
}

// Export activateFallback for use in other modules
export { activateFallback };
