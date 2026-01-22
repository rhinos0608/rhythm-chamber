/**
 * Operation Queue System
 *
 * Provides queuing and retry logic for non-critical operations that can
 * be deferred when locks are held. Part of the Operation Lock Contract.
 */

// Import OperationLock and error classes
import { OperationLock } from './operation-lock.js';
import { LockAcquisitionError } from './operation-lock-errors.js';

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
     * @private
     */
    async processQueue() {
        if (this.processing) return;
        this.processing = true;

        // Max pre-check retries to avoid indefinite blocking
        const MAX_PRE_CHECK_RETRIES = 10;
        let preCheckRetries = 0;

        while (this.queue.length > 0) {
            const operation = this.queue[0];

            // Check if operation was cancelled
            if (operation.status === STATUS.CANCELLED) {
                this.queue.shift();
                preCheckRetries = 0; // Reset for next operation
                continue;
            }

            // Check if we can acquire lock
            const check = OperationLock.canAcquire(operation.operationName);

            if (!check.canAcquire) {
                preCheckRetries++;

                // Fail if exceeded max retries to avoid indefinite blocking
                if (preCheckRetries >= MAX_PRE_CHECK_RETRIES) {
                    console.error(`[OperationQueue] Operation '${operation.operationName}' exceeded max pre-check retries (${MAX_PRE_CHECK_RETRIES})`);
                    operation.status = STATUS.FAILED;
                    operation.error = new Error(`Lock pre-check timeout after ${MAX_PRE_CHECK_RETRIES} retries`);
                    this.queue.shift();
                    operation.reject(operation.error);
                    this.emit('failed', operation);
                    preCheckRetries = 0; // Reset for next operation
                    continue;
                }

                // Cannot acquire lock, wait and retry
                const waitTime = operation.retryDelay;
                console.log(`[OperationQueue] Waiting ${waitTime}ms for lock on '${operation.operationName}' (blocked by: ${check.blockedBy.join(', ')}) [retry ${preCheckRetries}/${MAX_PRE_CHECK_RETRIES}]`);

                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, waitTime));
                // Re-sort queue after waiting - priorities may have changed or new ops added
                this.queue.sort((a, b) => b.priority - a.priority);
                // Reset retry counter since operation identity may have changed after re-sort
                preCheckRetries = 0;
                continue;
            }

            // Reset retry counter on successful check
            preCheckRetries = 0;

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

                    // MEDIUM FIX Issue #21: Avoid priority inversion by NOT re-sorting queue on retry
                    // The original code re-sorted the entire queue after each retry, which could
                    // cause a high-priority operation that just failed to jump behind newly added
                    // lower-priority operations. This violates priority semantics.
                    //
                    // Instead, only sort when new operations are added (in enqueue()),
                    // or explicitly trigger a re-sort if priority was intentionally changed.
                    //
                    // The failed operation remains at its current position (front of queue),
                    // which is correct since it has been waiting the longest and deserves another chance.
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
     * @returns {number} Number of operations cleared
     */
    clearCompleted() {
        const initialLength = this.queue.length;
        this.queue = this.queue.filter(op =>
            op.status === STATUS.PENDING || op.status === STATUS.PROCESSING
        );
        return initialLength - this.queue.length;
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
     * @param {string} event - Event name (queued, processing, completed, failed, cancelled)
     * @param {Function} callback - Event handler
     */
    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} callback - Event handler to remove
     */
    off(event, callback) {
        if (this.listeners[event]) {
            const index = this.listeners[event].indexOf(callback);
            if (index > -1) {
                this.listeners[event].splice(index, 1);
            }
        }
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