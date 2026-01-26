/**
 * IndexedDB Connection Manager with Fallback Chain
 *
 * Manages IndexedDB connections with retry logic, graceful degradation,
 * and fallback mechanisms for handling connection failures.
 *
 * HNW Considerations:
 * - Hierarchy: Single authority for IndexedDB connections
 * - Network: Prevents cascade failures from storage issues
 * - Wave: Retry with exponential backoff, eventual fallback to memory-only
 *
 * @module storage/connection-manager
 */

import { withRetry, databaseRetryStrategy, classifyError, ErrorType } from '../utils/resilient-retry.js';
import { EventBus } from '../services/event-bus.js';

// ==========================================
// Connection State
// ==========================================

/**
 * Connection states
 */
export const ConnectionState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    FAILED: 'failed',
    FALLBACK: 'fallback'
};

/**
 * Connection pool entry
 * @typedef {Object} ConnectionEntry
 * @property {string} name - Database name
 * @property {IDBDatabase} connection - Database connection
 * @property {ConnectionState} state - Connection state
 * @property {number} version - Database version
 * @property {number} createdAt - Connection creation timestamp
 * @property {number} lastUsed - Last activity timestamp
 * @property {number} failureCount - Consecutive failure count
 * @property {Error} lastError - Last error encountered
 */

/**
 * Connection pool
 * @type {Map<string, ConnectionEntry>}
 */
const connectionPool = new Map();

/**
 * Fallback mode active (memory-only storage)
 * @type {boolean}
 */
let fallbackMode = false;

/**
 * Maximum consecutive failures before fallback
 */
const MAX_FAILURES_BEFORE_FALLBACK = 5;

/**
 * Connection retry configuration
 */
const CONNECTION_RETRY_CONFIG = {
    maxRetries: 3,
    config: {
        BASE_DELAY_MS: 500,
        MAX_DELAY_MS: 5000,
        JITTER_MS: 100,
        EXPONENTIAL_BASE: 2
    }
};

// ==========================================
// Connection Management
// ==========================================

/**
 * Open IndexedDB connection with retry logic
 *
 * @param {string} dbName - Database name
 * @param {number} version - Database version
 * @param {Function} onUpgrade - Upgrade callback (optional)
 * @returns {Promise<IDBDatabase>} Database connection
 */
export async function openConnection(dbName, version, onUpgrade = null) {
    // Check for existing connection
    const existing = connectionPool.get(dbName);
    if (existing && existing.state === ConnectionState.CONNECTED) {
        existing.lastUsed = Date.now();
        return existing.connection;
    }

    // If in fallback mode, return null (callers should handle gracefully)
    if (fallbackMode) {
        console.warn('[ConnectionManager] In fallback mode - using memory-only storage');
        EventBus.emit('storage:fallback_mode', { dbName, reason: 'previous_failures' });
        return null;
    }

    const startTime = Date.now();

    try {
        const connectionResult = await withRetry(
            async () => {
                const entry = connectionPool.get(dbName);
                if (entry?.state === ConnectionState.CONNECTING) {
                    // Wait for existing connection attempt
                    throw new Error('Connection in progress');
                }

                // Mark as connecting
                connectionPool.set(dbName, {
                    name: dbName,
                    connection: null,
                    state: ConnectionState.CONNECTING,
                    version,
                    createdAt: Date.now(),
                    lastUsed: Date.now(),
                    failureCount: 0,
                    lastError: null
                });

                return new Promise((resolve, reject) => {
                    const request = indexedDB.open(dbName, version);

                    request.onerror = () => {
                        const error = request.error;
                        const entry = connectionPool.get(dbName);
                        if (entry) {
                            entry.failureCount++;
                            entry.lastError = error;
                            entry.state = ConnectionState.FAILED;
                        }

                        // Emit connection failure event
                        EventBus.emit('storage:connection_failed', {
                            dbName,
                            error: error.message,
                            recoverable: entry.failureCount < MAX_FAILURES_BEFORE_FALLBACK
                        });

                        reject(error);
                    };

                    request.onsuccess = () => {
                        const db = request.result;
                        const entry = connectionPool.get(dbName);
                        if (entry) {
                            entry.connection = db;
                            entry.state = ConnectionState.CONNECTED;
                            entry.failureCount = 0;
                            entry.lastError = null;
                        }

                        // Emit connection established event
                        EventBus.emit('storage:connection_established', {
                            dbName,
                            attempts: entry.failureCount + 1
                        });

                        resolve({ db });
                    };

                    request.onupgradeneeded = (event) => {
                        if (onUpgrade) {
                            try {
                                onUpgrade(event);
                            } catch (upgradeError) {
                                console.error('[ConnectionManager] Upgrade error:', upgradeError);
                                reject(upgradeError);
                                request.transaction?.abort();
                            }
                        }
                    };

                    request.onblocked = () => {
                        const error = new Error('Database upgrade blocked by another tab');
                        EventBus.emit('storage:connection_blocked', {
                            dbName,
                            reason: 'another_tab',
                            message: 'Close other tabs using this application'
                        });
                        reject(error);
                    };
                });
            },
            {
                ...CONNECTION_RETRY_CONFIG,
                onRetry: (error, attempt, delay) => {
                    const entry = connectionPool.get(dbName);
                    EventBus.emit('storage:connection_retry', {
                        dbName,
                        attempt: attempt + 1,
                        maxAttempts: CONNECTION_RETRY_CONFIG.maxRetries + 1,
                        nextRetryMs: delay,
                        error: error.message
                    });
                }
            }
        );

        return connectionResult?.db || null;
    } catch (error) {
        const entry = connectionPool.get(dbName);
        const failureCount = entry?.failureCount || 0;

        // Check if we should enter fallback mode
        if (failureCount >= MAX_FAILURES_BEFORE_FALLBACK) {
            fallbackMode = true;
            console.error('[ConnectionManager] Entering fallback mode after', failureCount, 'failures');
            EventBus.emit('storage:fallback_mode_activated', {
                dbName,
                failureCount,
                reason: 'max_failures_exceeded'
            });
        }

        throw error;
    }
}

/**
 * Close a database connection
 *
 * @param {string} dbName - Database name
 */
export function closeConnection(dbName) {
    const entry = connectionPool.get(dbName);
    if (!entry || !entry.connection) {
        return;
    }

    try {
        entry.connection.close();
        connectionPool.delete(dbName);
        console.log('[ConnectionManager] Connection closed:', dbName);
    } catch (error) {
        console.warn('[ConnectionManager] Error closing connection:', error);
    }
}

/**
 * Get connection state
 *
 * @param {string} dbName - Database name
 * @returns {ConnectionState|null} Connection state or null if not tracked
 */
export function getConnectionState(dbName) {
    const entry = connectionPool.get(dbName);
    return entry?.state || null;
}

/**
 * Check if fallback mode is active
 *
 * @returns {boolean} True if in fallback mode
 */
export function isFallbackMode() {
    return fallbackMode;
}

/**
 * Exit fallback mode and retry connections
 *
 * @returns {Promise<boolean>} True if successfully exited fallback mode
 */
export async function exitFallbackMode() {
    if (!fallbackMode) {
        return true;
    }

    console.log('[ConnectionManager] Attempting to exit fallback mode...');

    // Reset failure counts for all connections
    for (const [dbName, entry] of connectionPool.entries()) {
        entry.failureCount = 0;
        entry.lastError = null;
    }

    fallbackMode = false;

    // Try to reconnect to all databases
    let successCount = 0;
    for (const [dbName, entry] of connectionPool.entries()) {
        try {
            const connection = await openConnection(dbName, entry.version);
            if (connection) {
                successCount++;
            }
        } catch (error) {
            console.warn('[ConnectionManager] Failed to reconnect to', dbName, error);
        }
    }

    if (successCount > 0) {
        console.log('[ConnectionManager] Exited fallback mode, reconnected to', successCount, 'databases');
        EventBus.emit('storage:fallback_mode_exited', {
            successCount,
            totalDatabases: connectionPool.size
        });
        return true;
    } else {
        // Re-enter fallback mode if all reconnections failed
        fallbackMode = true;
        console.warn('[ConnectionManager] Failed to exit fallback mode - all reconnections failed');
        return false;
    }
}

/**
 * Execute a transaction with automatic retry
 *
 * @param {string} dbName - Database name
 * @param {string[]} storeNames - Object store names
 * @param {string} mode - Transaction mode ('readonly' or 'readwrite')
 * @param {Function} operation - Operation function (receives transaction)
 * @returns {Promise<any>} Operation result
 */
export async function executeWithRetry(dbName, storeNames, mode, operation) {
    const maxTransactionRetries = 2;
    let lastError = null;

    for (let attempt = 0; attempt <= maxTransactionRetries; attempt++) {
        const entry = connectionPool.get(dbName);

        // Check connection state
        if (!entry || entry.state !== ConnectionState.CONNECTED) {
            throw new Error(`Database ${dbName} not connected`);
        }

        try {
            const transaction = entry.connection.transaction(storeNames, mode);

            return new Promise((resolve, reject) => {
                let operationResult;
                transaction.oncomplete = () => resolve(operationResult);
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));

                try {
                    operationResult = operation(transaction);
                } catch (opError) {
                    reject(opError);
                }
            });
        } catch (error) {
            lastError = error;
            const errorType = classifyError(error);

            // Don't retry certain error types
            if (errorType === ErrorType.CLIENT_ERROR || errorType === ErrorType.AUTHENTICATION) {
                throw error;
            }

            if (attempt < maxTransactionRetries) {
                const delay = 100 * Math.pow(2, attempt);
                console.warn(`[ConnectionManager] Transaction retry ${attempt + 1}/${maxTransactionRetries} after ${delay}ms:`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}

/**
 * Get connection pool statistics
 *
 * @returns {Object} Connection pool stats
 */
export function getConnectionStats() {
    const stats = {
        totalConnections: connectionPool.size,
        connected: 0,
        connecting: 0,
        failed: 0,
        fallbackMode,
        connections: {}
    };

    for (const [dbName, entry] of connectionPool.entries()) {
        stats.connections[dbName] = {
            state: entry.state,
            version: entry.version,
            failureCount: entry.failureCount,
            lastError: entry.lastError?.message || null,
            age: Date.now() - entry.createdAt,
            idle: Date.now() - entry.lastUsed
        };

        switch (entry.state) {
            case ConnectionState.CONNECTED:
                stats.connected++;
                break;
            case ConnectionState.CONNECTING:
                stats.connecting++;
                break;
            case ConnectionState.FAILED:
                stats.failed++;
                break;
        }
    }

    return stats;
}

/**
 * Close all connections
 */
export function closeAllConnections() {
    for (const dbName of connectionPool.keys()) {
        closeConnection(dbName);
    }
    console.log('[ConnectionManager] All connections closed');
}

/**
 * Reset connection manager state
 * Clears all connections and exits fallback mode
 */
export function reset() {
    closeAllConnections();
    fallbackMode = false;
    console.log('[ConnectionManager] Connection manager reset');
}

// Export
export default {
    ConnectionState,
    openConnection,
    closeConnection,
    getConnectionState,
    isFallbackMode,
    exitFallbackMode,
    executeWithRetry,
    getConnectionStats,
    closeAllConnections,
    reset
};

console.log('[ConnectionManager] Module loaded with fallback chain support');
