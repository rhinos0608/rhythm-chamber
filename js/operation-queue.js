/**
 * Operation Queue System
 *
 * Provides queuing and retry logic for non-critical operations that can
 * be deferred when locks are held. Part of the Operation Lock Contract.
 */

// Import OperationLock and error classes
import { OperationLock } from './operation-lock.js';
import { LockAcquisitionError } from './operation-lock-errors.js';

const normalizeBlockers = (blockedBy) => {
    if (!Array.isArray(blockedBy)) return [];
    return [...new Set(blockedBy.filter(Boolean))].sort();
};

const blockersEqual = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};

/**
 * Priority levels for queued operations
 * @enum {number}
 */
const PRIORITY = {
    LOW: 0,
    NORMAL: 1,
    HIGH: 2,
    CRITICAL: 3
};

/**
 * Status of a queued operation
 * @enum {string}
 */
const STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
};

/**
 * Represents a queued operation
 */
class QueuedOperation {
    /**
     * @param {string} operationName - The operation to lock
     * @param {Function} operationFn - Async function to execute
     * @param {number} priority - Priority level (0-3)
     * @param {Object} options - Additional options
     */
    constructor(operationName, operationFn, priority = PRIORITY.NORMAL, options = {}) {
        this.id = `${operationName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.operationName = operationName;
        this.operationFn = operationFn;
        this.priority = priority;
        this.status = STATUS.PENDING;
        this.createdAt = Date.now();
        this.attempts = 0;
        this.maxAttempts = options.maxAttempts || 3;
        this.retryDelay = options.retryDelay || 1000; // 1 second default
        this.timeout = options.timeout || 60000; // 60 seconds default
        this.result = null;
        this.error = null;
        this.resolve = null;
        this.reject = null;
    }

    /**
     * Execute the operation
     * @returns {Promise<any>}
     */
    async execute() {
        this.status = STATUS.PROCESSING;
        this.attempts++;

        try {
            // Use OperationLock with timeout
            const lockId = await OperationLock.acquireWithTimeout(
                this.operationName,
                this.timeout
            );

            try {
                this.result = await this.operationFn();
                this.status = STATUS.COMPLETED;
                return this.result;
            } finally {
                OperationLock.release(this.operationName, lockId);
            }
        } catch (error) {
            this.error = error;

            if (error instanceof LockAcquisitionError && this.attempts < this.maxAttempts) {
                // Will retry
                this.status = STATUS.PENDING;
                throw error;
            } else {
                // Final failure
                this.status = STATUS.FAILED;
                throw error;
            }
        }
    }

    /**
     * Check if operation can be retried
     * @returns {boolean}
     */
    canRetry() {
        return this.attempts < this.maxAttempts &&
            (this.status === STATUS.PENDING || this.status === STATUS.FAILED);
    }

    /**
     * Get estimated wait time based on queue position
     * @param {number} queueLength - Current queue length
     * @returns {number} Estimated milliseconds
     */
    getEstimatedWaitTime(queueLength) {
        // Rough estimate: each operation takes ~2 seconds + lock wait time
        const baseTime = queueLength * 2000;
        const lockWaitTime = this.attempts * this.retryDelay;
        return baseTime + lockWaitTime;
    }
}

/**
 * Operation Queue Manager
 * Handles queuing, retry logic, and execution of non-critical operations
 */
class OperationQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.listeners = {
            queued: [],
            processing: [],
            completed: [],
            failed: [],
            cancelled: []
        };
        // MEMORY LEAK FIX #4: Track listener registrations to prevent duplicates
        // Uses WeakMap to avoid memory leaks - entries are automatically garbage collected
        // when the callback function is no longer referenced elsewhere in the application.
        this._listenerRegistry = new WeakMap();
    }

    /**
     * Add an operation to the queue
     * @param {string} operationName - The operation to lock
     * @param {Function} operationFn - Async function to execute
     * @param {number} priority - Priority level (0-3)
     * @param {Object} options - Additional options
     * @returns {Promise<any>} Result of operation
     */
    enqueue(operationName, operationFn, priority = PRIORITY.NORMAL, options = {}) {
        return new Promise((resolve, reject) => {
            const operation = new QueuedOperation(operationName, operationFn, priority, options);
            operation.resolve = resolve;
            operation.reject = reject;

            // Add to queue and sort by priority
            this.queue.push(operation);
            this.queue.sort((a, b) => b.priority - a.priority);

            // Emit event
            this.emit('queued', operation);

            // Start processing if not already running
            this.processQueue();

            // Return promise that will be resolved when operation completes
            // (operation.resolve/reject will be called by execute())
        });
    }

    /**
     * Process the queue
     * RACE CONDITION FIX: Added deadlock detection and circular wait prevention
     * to prevent indefinite blocking when operations form circular dependencies.
     *
     * @private
     */
    async processQueue() {
        if (this.processing) return;
        this.processing = true;

        // Max pre-check retries to avoid indefinite blocking
        const MAX_PRE_CHECK_RETRIES = 10;
        let preCheckRetries = 0;

        // RACE CONDITION FIX: Track operations we're waiting on to detect circular dependencies
        // If the same operation keeps getting blocked by the same set of locks, we may have a deadlock
        const blockedHistory = new Map(); // operationName -> [{ blockedBy, timestamp }]

        while (this.queue.length > 0) {
            const operation = this.queue[0];

            // Check if operation was cancelled
            if (operation.status === STATUS.CANCELLED) {
                this.queue.shift();
                preCheckRetries = 0; // Reset for next operation
                blockedHistory.delete(operation.operationName);
                continue;
            }

            // Check if we can acquire lock
            const check = OperationLock.canAcquire(operation.operationName);

            if (!check.canAcquire) {
                preCheckRetries++;

                // RACE CONDITION FIX: Deadlock detection - track blocked operations
                const history = blockedHistory.get(operation.operationName) || [];
                history.push({
                    blockedBy: check.blockedBy,
                    timestamp: Date.now()
                });
                blockedHistory.set(operation.operationName, history);

                // Check for circular wait: if we've been blocked by the same operations
                // multiple times, we may be in a deadlock scenario
                if (history.length > 3) {
                    const recentBlocks = history.slice(-3).map(entry => normalizeBlockers(entry.blockedBy));
                    const currentBlockers = normalizeBlockers(check.blockedBy);
                    const sameBlockers = recentBlocks.every(blockers => blockersEqual(blockers, currentBlockers));

                    if (sameBlockers) {
                        console.error(`[OperationQueue] Circular wait detected for '${operation.operationName}' - blocked by: ${currentBlockers.join(', ')}`);
                        operation.status = STATUS.FAILED;
                        operation.error = new Error(`Deadlock detected: circular wait on locks ${currentBlockers.join(', ')}`);
                        this.queue.shift();
                        operation.reject(operation.error);
                        this.emit('failed', operation);
                        preCheckRetries = 0;
                        blockedHistory.delete(operation.operationName);
                        continue;
                    }
                }

                // Fail if exceeded max retries to avoid indefinite blocking
                if (preCheckRetries >= MAX_PRE_CHECK_RETRIES) {
                    console.error(`[OperationQueue] Operation '${operation.operationName}' exceeded max pre-check retries (${MAX_PRE_CHECK_RETRIES})`);
                    operation.status = STATUS.FAILED;
                    operation.error = new Error(`Lock pre-check timeout after ${MAX_PRE_CHECK_RETRIES} retries`);
                    this.queue.shift();
                    operation.reject(operation.error);
                    this.emit('failed', operation);
                    preCheckRetries = 0; // Reset for next operation
                    blockedHistory.delete(operation.operationName);
                    continue;
                }

                // Cannot acquire lock, wait and retry
                const waitTime = operation.retryDelay;
                console.log(`[OperationQueue] Waiting ${waitTime}ms for lock on '${operation.operationName}' (blocked by: ${check.blockedBy.join(', ')}) [retry ${preCheckRetries}/${MAX_PRE_CHECK_RETRIES}]`);

                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, waitTime));

                // MEDIUM FIX Issue #21: Removed confusing queue re-sort after wait
                // The original code re-sorted the queue and reset the retry counter,
                // which could lead to operations retrying indefinitely and violating
                // the MAX_PRE_CHECK_RETRIES limit. This was confusing because:
                // 1. A high-priority operation that fails could jump behind lower-priority ops
                // 2. The retry counter reset meant operations could retry forever
                // 3. Priority semantics were violated (a failed operation should maintain position)
                //
                // Now: Queue is only sorted when new operations are added (in enqueue()).
                // The current operation remains at queue[0] and will retry with the same
                // preCheckRetries counter, ensuring the limit is enforced.
                continue;
            }

            // Reset retry counter on successful check
            preCheckRetries = 0;
            // Clear blocked history when we successfully acquire
            blockedHistory.delete(operation.operationName);

            // Execute operation
            try {
                this.emit('processing', operation);
                const result = await operation.execute();

                // Remove from queue
                this.queue.shift();

                // Resolve promise
                operation.resolve(result);
                this.emit('completed', operation);

            } catch (error) {
                if (operation.canRetry()) {
                    console.warn(`[OperationQueue] Operation '${operation.operationName}' failed (attempt ${operation.attempts}/${operation.maxAttempts}), will retry`);

                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, operation.retryDelay));

                    // MEDIUM FIX Issue #21: No re-sort on retry - operation maintains queue position
                    // This preserves priority semantics and prevents priority inversion where
                    // a failed high-priority operation could lose its place to lower-priority ops.
                } else {
                    // Final failure
                    this.queue.shift();
                    operation.reject(error);
                    this.emit('failed', operation);
                    console.error(`[OperationQueue] Operation '${operation.operationName}' failed permanently:`, error);
                }
            }
        }

        this.processing = false;
    }

    /**
     * Cancel an operation by ID
     * @param {string} operationId
     * @returns {boolean} True if cancelled
     */
    cancel(operationId) {
        const operation = this.queue.find(op => op.id === operationId);
        if (operation && operation.status === STATUS.PENDING) {
            operation.status = STATUS.CANCELLED;
            operation.reject(new Error('Operation cancelled by user'));
            this.emit('cancelled', operation);
            return true;
        }
        return false;
    }

    /**
     * Cancel all operations for a specific operation name
     * @param {string} operationName
     * @returns {number} Number of cancelled operations
     */
    cancelAll(operationName) {
        let count = 0;
        this.queue.forEach(op => {
            if (op.operationName === operationName && op.status === STATUS.PENDING) {
                op.status = STATUS.CANCELLED;
                op.reject(new Error(`All '${operationName}' operations cancelled`));
                this.emit('cancelled', op);
                count++;
            }
        });
        return count;
    }

    /**
     * Get queue status
     * @returns {Object}
     */
    getStatus() {
        const pending = this.queue.filter(op => op.status === STATUS.PENDING).length;
        const processing = this.queue.filter(op => op.status === STATUS.PROCESSING).length;
        const failed = this.queue.filter(op => op.status === STATUS.FAILED).length;

        return {
            total: this.queue.length,
            pending,
            processing,
            failed,
            isProcessing: this.processing
        };
    }

    /**
     * Get detailed queue information
     * @returns {Array}
     */
    getQueueDetails() {
        return this.queue.map(op => ({
            id: op.id,
            operationName: op.operationName,
            priority: op.priority,
            status: op.status,
            attempts: op.attempts,
            maxAttempts: op.maxAttempts,
            createdAt: op.createdAt,
            error: op.error ? op.error.message : null
        }));
    }

    /**
     * Clear completed and failed operations
     * MEMORY LEAK FIX: Also cleans up completed/failed event listeners to prevent
     * unbounded memory growth when operations accumulate over time.
     *
     * @returns {number} Number of operations cleared
     */
    clearCompleted() {
        const initialLength = this.queue.length;
        const clearedCount = this.queue.filter(op =>
            op.status === STATUS.COMPLETED || op.status === STATUS.FAILED
        ).length;

        this.queue = this.queue.filter(op =>
            op.status === STATUS.PENDING || op.status === STATUS.PROCESSING
        );

        // Clean up listeners for completed operations
        // This prevents memory leaks when long-running apps process many operations
        if (clearedCount > 100) {
            // If we've cleared a lot of operations, proactively clean up listeners
            // to prevent unbounded memory growth
            this.clearAllListeners();
        }

        return clearedCount;
    }

    /**
     * Destroy the operation queue
     * MEMORY LEAK FIX: Clean up all resources and prevent memory leaks when the
     * queue instance is no longer needed. This should be called during application
     * shutdown or when destroying the queue instance.
     *
     * - Cancels all pending operations
     * - Clears all event listeners (preventing memory leaks)
     * - Clears the queue
     * - Logs shutdown for debugging
     *
     * @returns {Object} Shutdown statistics
     */
    destroy() {
        const stats = {
            pending: 0,
            processing: 0,
            cancelled: 0,
            listenersCleared: 0
        };

        // Cancel all pending operations
        this.queue.forEach(op => {
            if (op.status === STATUS.PENDING) {
                op.status = STATUS.CANCELLED;
                op.reject(new Error('Operation cancelled during queue shutdown'));
                stats.pending++;
                this.emit('cancelled', op);
            } else if (op.status === STATUS.PROCESSING) {
                stats.processing++;
            }
        });

        // Clear all event listeners to prevent memory leaks
        const listenerCounts = this.clearAllListeners();
        stats.listenersCleared = Object.values(listenerCounts).reduce((sum, count) => sum + count, 0);

        // Clear the queue
        stats.cancelled = this.queue.length;
        this.queue = [];
        this.processing = false;

        console.log('[OperationQueue] Queue destroyed:', stats);
        return stats;
    }

    /**
     * Event emitter
     * @param {string} event - Event name
     * @param {QueuedOperation} operation - Operation instance
     * @private
     */
    emit(event, operation) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => {
                try {
                    callback(operation);
                } catch (error) {
                    console.error(`[OperationQueue] Event listener error:`, error);
                }
            });
        }
    }

    /**
     * Add event listener
     * MEMORY LEAK FIX #4: Prevents duplicate listener registration by tracking
     * registered callbacks in a WeakMap. This prevents memory leaks from the same
     * callback being registered multiple times for the same event.
     *
     * @param {string} event - Event name (queued, processing, completed, failed, cancelled)
     * @param {Function} callback - Event handler
     * @returns {boolean} True if listener was added, false if it was already registered
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            console.warn(`[OperationQueue] Unknown event type: ${event}`);
            return false;
        }

        if (typeof callback !== 'function') {
            console.error(`[OperationQueue] Event listener must be a function, got: ${typeof callback}`);
            return false;
        }

        // Get existing registrations for this callback
        let registrations = this._listenerRegistry.get(callback);
        if (!registrations) {
            registrations = new Set();
            this._listenerRegistry.set(callback, registrations);
        }

        // Check if this callback is already registered for this event
        if (registrations.has(event)) {
            console.warn(`[OperationQueue] Event listener already registered for '${event}' event`);
            return false;
        }

        // Register the listener
        this.listeners[event].push(callback);
        registrations.add(event);

        return true;
    }

    /**
     * Remove event listener
     * MEMORY LEAK FIX #4: Updates the listener registry when removing listeners
     * to maintain consistency and prevent stale references.
     *
     * @param {string} event - Event name
     * @param {Function} callback - Event handler to remove
     * @returns {boolean} True if listener was removed, false if not found
     */
    off(event, callback) {
        if (!this.listeners[event]) {
            return false;
        }

        const index = this.listeners[event].indexOf(callback);
        if (index > -1) {
            this.listeners[event].splice(index, 1);

            // Update registry
            const registrations = this._listenerRegistry.get(callback);
            if (registrations) {
                registrations.delete(event);
                // Clean up empty registry entries
                if (registrations.size === 0) {
                    this._listenerRegistry.delete(callback);
                }
            }

            return true;
        }

        return false;
    }

    /**
     * Clear all listeners for a specific event type
     * MEMORY LEAK FIX: Prevents unbounded memory growth by removing all listeners
     * for a specific event type. Also updates the listener registry to prevent
     * stale references.
     *
     * Use this when:
     * - A component or module that registered listeners is being destroyed
     * - You want to stop receiving notifications for a specific event type
     * - You're switching to a different event handling strategy
     *
     * @param {string} eventType - Event type (queued, processing, completed, failed, cancelled)
     * @returns {boolean} True if listeners were cleared
     */
    clearListeners(eventType) {
        if (this.listeners[eventType]) {
            const count = this.listeners[eventType].length;

            // Clean up registry entries for this event type
            this.listeners[eventType].forEach(callback => {
                const registrations = this._listenerRegistry.get(callback);
                if (registrations) {
                    registrations.delete(eventType);
                    // Clean up empty registry entries
                    if (registrations.size === 0) {
                        this._listenerRegistry.delete(callback);
                    }
                }
            });

            this.listeners[eventType] = [];
            console.log(`[OperationQueue] Cleared ${count} listener(s) for '${eventType}' event`);
            return count > 0;
        }
        return false;
    }

    /**
     * Clear all event listeners
     * MEMORY LEAK FIX: Prevents unbounded memory growth by removing all listeners.
     * Critical for preventing memory leaks in long-running applications. Also clears
     * the listener registry to prevent stale references.
     *
     * Use this when:
     * - The OperationQueue instance is no longer needed
     * - You're shutting down the application or module
     * - You want to completely reset the event system
     * - You've finished a batch of operations and want to release references
     *
     * WARNING: After calling this method, no events will be emitted until new
     * listeners are registered via on().
     *
     * @returns {Object} Count of cleared listeners per event type
     */
    clearAllListeners() {
        const counts = {};
        Object.keys(this.listeners).forEach(key => {
            counts[key] = this.listeners[key].length;
            this.listeners[key] = [];
        });

        // Clear the listener registry
        this._listenerRegistry = new WeakMap();

        const totalCleared = Object.values(counts).reduce((sum, count) => sum + count, 0);
        console.log(`[OperationQueue] Cleared all listeners (${totalCleared} total):`, counts);
        return counts;
    }
}

// Export for use
const OperationQueueModule = {
    OperationQueue,
    QueuedOperation,
    PRIORITY,
    STATUS
};

// ES Module exports
export { OperationQueue, QueuedOperation, PRIORITY as QUEUE_PRIORITY, STATUS as QUEUE_STATUS };

console.log('[OperationQueue] Module loaded with retry logic and priority support');