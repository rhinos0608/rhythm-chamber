/**
 * Vector Store Connection Management
 *
 * Provides connection management with retry logic, fallback support,
 * and health monitoring for the vector store IndexedDB database.
 *
 * This module follows the same patterns as js/storage/indexeddb/connection.js
 * but for the separate vector store database (rhythm_chamber_vectors).
 *
 * @module vector-store/connection
 */

import { DB_NAME, DB_VERSION, STORE_NAME } from './config.js';
import { EventBus } from '../services/event-bus.js';
import { FallbackBackend } from '../storage/fallback-backend.js';

// Connection retry configuration
const CONNECTION_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    backoffMultiplier: 2,
    maxDelayMs: 10000,
};

// Database connection
let vectorDBConnection = null;

// Connection retry state
let connectionAttempts = 0;
let isConnectionFailed = false;

// Fallback backend state
let usingFallback = false;
let fallbackInitialized = false;

/**
 * Initialize the vector store IndexedDB database connection
 * @param {object} options - Options for handling version changes
 * @param {function} options.onVersionChange - Callback when another tab upgrades DB
 * @param {function} options.onBlocked - Callback when upgrade is blocked
 * @returns {Promise<IDBDatabase>} Database connection
 */
export async function initVectorDatabase(options = {}) {
    if (vectorDBConnection) return vectorDBConnection;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('[VectorStore] IndexedDB error:', request.error);
            reject(request.error);
        };

        request.onblocked = () => {
            console.warn('[VectorStore] Database upgrade blocked by other tabs');
            EventBus.emit('storage:connection_blocked', {
                reason: 'vector_upgrade_blocked',
                message: 'Vector store upgrade blocked by other tabs.',
                store: 'vectors',
            });
            options.onBlocked?.();
        };

        request.onsuccess = () => {
            vectorDBConnection = request.result;
            connectionAttempts = 0;
            isConnectionFailed = false;

            vectorDBConnection.onversionchange = () => {
                console.log('[VectorStore] Database version change detected');
                if (options.onVersionChange) {
                    options.onVersionChange();
                } else {
                    vectorDBConnection.close();
                    vectorDBConnection = null;
                }
            };

            vectorDBConnection.onerror = event => {
                console.error('[VectorStore] Database error:', event.target.error);
                EventBus.emit('storage:error', {
                    type: 'vector_database_error',
                    error: event.target.error?.message || 'Unknown vector database error',
                });
            };

            console.log('[VectorStore] Database connection established');
            resolve(vectorDBConnection);
        };

        request.onupgradeneeded = event => {
            const database = event.target.result;
            const oldVersion = event.oldVersion;

            console.log(`[VectorStore] Upgrading database from v${oldVersion} to v${DB_VERSION}`);

            // Create vectors store if it doesn't exist
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('type', 'payload.type', { unique: false });
                console.log('[VectorStore] Created vectors store');
            }

            // Add migrations here as needed
            if (oldVersion < 1) {
                // Initial setup - already handled above
            }

            // Future migrations would go here
            // if (oldVersion < 2) { ... }
        };
    });
}

/**
 * Initialize vector database with retry logic and exponential backoff
 * Follows HNW principles with graceful degradation to fallback backend.
 *
 * @param {object} options - Options for handling version changes
 * @param {number} [options.maxAttempts=3] - Maximum retry attempts
 * @param {function} options.onVersionChange - Callback when another tab upgrades DB
 * @param {function} options.onBlocked - Callback when upgrade is blocked
 * @param {function} options.onRetry - Callback on retry attempt
 * @param {boolean} [options.enableFallback=true] - Whether to use fallback on failure
 * @returns {Promise<IDBDatabase|object>} Database connection or fallback backend
 */
export async function initVectorDatabaseWithRetry(options = {}) {
    const maxAttempts = options.maxAttempts ?? CONNECTION_CONFIG.maxRetries;
    const enableFallback = options.enableFallback !== false;

    // If already using fallback, return immediately
    if (usingFallback) {
        return { fallback: true, backend: FallbackBackend };
    }

    // Return existing connection if available
    if (vectorDBConnection) {
        return vectorDBConnection;
    }

    // If previously failed permanently and fallback is available, use it
    if (isConnectionFailed && enableFallback) {
        return await activateFallback();
    }

    // If previously failed permanently and no fallback, throw immediately
    if (isConnectionFailed) {
        throw new Error(
            'Vector store connection permanently failed. Refresh the page to retry.'
        );
    }

    // Check if IndexedDB is available at all
    if (!window.indexedDB) {
        console.warn('[VectorStore] IndexedDB not available in this environment');
        if (enableFallback) {
            return await activateFallback();
        }
        throw new Error('IndexedDB is not available in this browser environment');
    }

    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        connectionAttempts = attempt;

        try {
            console.log(`[VectorStore] Connection attempt ${attempt}/${maxAttempts}`);

            const connection = await initVectorDatabase(options);

            // Success - reset state
            connectionAttempts = 0;
            EventBus.emit('storage:connection_established', {
                store: 'vectors',
                attempts: attempt,
            });

            return connection;
        } catch (error) {
            lastError = error;
            console.warn(`[VectorStore] Connection attempt ${attempt} failed:`, error.message);

            // Notify about retry
            if (options.onRetry) {
                options.onRetry(attempt, maxAttempts, error);
            }

            if (attempt < maxAttempts) {
                // Calculate exponential backoff delay
                const delay = Math.min(
                    CONNECTION_CONFIG.baseDelayMs *
                        Math.pow(CONNECTION_CONFIG.backoffMultiplier, attempt - 1),
                    CONNECTION_CONFIG.maxDelayMs
                );

                EventBus.emit('storage:connection_retry', {
                    store: 'vectors',
                    attempt,
                    maxAttempts,
                    nextRetryMs: delay,
                    error: error.message,
                });

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // All attempts exhausted - try fallback if enabled
    isConnectionFailed = true;

    if (enableFallback) {
        console.warn('[VectorStore] All connection attempts failed, activating fallback backend');
        return await activateFallback();
    }

    // No fallback available - emit failure event
    EventBus.emit('storage:connection_failed', {
        store: 'vectors',
        attempts: connectionAttempts,
        error: lastError?.message || 'Unknown error',
        recoverable: false,
    });

    console.error(`[VectorStore] All ${maxAttempts} connection attempts failed`);
    throw new Error(
        `Failed to connect to vector store IndexedDB after ${maxAttempts} attempts: ${lastError?.message}`
    );
}

/**
 * Activate fallback storage backend for vectors
 * @returns {Promise<object>} Fallback backend marker
 */
async function activateFallback() {
    if (!fallbackInitialized) {
        const fallbackInfo = await FallbackBackend.init();
        fallbackInitialized = true;

        console.log('[VectorStore] Fallback backend activated:', fallbackInfo);
    }

    usingFallback = true;

    // Emit fallback activation event
    EventBus.emit('storage:fallback_activated', {
        store: 'vectors',
        mode: FallbackBackend.getMode(),
        stats: FallbackBackend.getStats(),
    });

    return { fallback: true, backend: FallbackBackend };
}

/**
 * Check if currently using fallback backend for vectors
 * @returns {boolean}
 */
export function isVectorUsingFallback() {
    return usingFallback;
}

/**
 * Get current vector storage backend info
 * @returns {{ type: 'indexeddb' | 'fallback', store: 'vectors', fallbackMode?: string }}
 */
export function getVectorStorageBackend() {
    if (usingFallback) {
        const mode = FallbackBackend.getMode?.() || 'unknown';
        const stats = FallbackBackend.getStats?.() || {};
        return {
            type: 'fallback',
            store: 'vectors',
            fallbackMode: mode,
            stats: stats,
        };
    }
    return { type: 'indexeddb', store: 'vectors' };
}

/**
 * Reset vector connection failure state (for recovery attempts)
 */
export function resetVectorConnectionState() {
    isConnectionFailed = false;
    connectionAttempts = 0;
    vectorDBConnection = null;
    usingFallback = false;
    fallbackInitialized = false;
    console.log('[VectorStore] Connection state reset');
}

/**
 * Get vector connection status
 * @returns {{ isConnected: boolean, isFailed: boolean, attempts: number, usingFallback: boolean }}
 */
export function getVectorConnectionStatus() {
    return {
        isConnected: vectorDBConnection !== null,
        isFailed: isConnectionFailed,
        attempts: connectionAttempts,
        usingFallback,
    };
}

/**
 * Close the vector database connection
 */
export function closeVectorDatabase() {
    if (vectorDBConnection) {
        vectorDBConnection.close();
        vectorDBConnection = null;
        console.log('[VectorStore] Database connection closed');
    }
}

/**
 * Get the current vector database connection
 * @returns {IDBDatabase|null}
 */
export function getVectorConnection() {
    return vectorDBConnection;
}

// Export for use in persistence.js
export { initVectorDatabase as initDatabase };
