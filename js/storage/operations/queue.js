/**
 * Storage Operation Queue
 *
 * Serializes async storage operations to prevent conflicts.
 * Critical operations block database version changes during execution.
 *
 * @module storage/operations/queue
 */

// Operation queue for critical operations
const storageQueue = [];
let isQueueProcessing = false;
let criticalOperationInProgress = false;
let pendingReload = false;
let processPromise = null;

/**
 * Queue an async operation to run sequentially
 * @param {Function} fn - Async function to queue
 * @param {boolean} isCritical - Block version changes during critical ops
 * @returns {Promise<*>}
 */
export async function queuedOperation(fn, isCritical = false) {
    return new Promise((resolve, reject) => {
        storageQueue.push({ fn, resolve, reject, isCritical });
        processQueue();
    });
}

/**
 * Process the operation queue sequentially
 * @private
 */
async function processQueue() {
    // Use promise to prevent concurrent executions
    if (processPromise) {
        return processPromise;
    }

    processPromise = (async () => {
        if (isQueueProcessing || storageQueue.length === 0) {
            processPromise = null;
            return;
        }

        isQueueProcessing = true;

        while (storageQueue.length > 0) {
            const { fn, resolve, reject, isCritical } = storageQueue.shift();
            if (isCritical) {
                criticalOperationInProgress = true;
            }

            try {
                const result = await fn();
                resolve(result);
            } catch (err) {
                reject(err);
            } finally {
                if (isCritical) {
                    const hasPendingCritical = storageQueue.some(item => item.isCritical);
                    criticalOperationInProgress = hasPendingCritical;
                }
            }
        }

        isQueueProcessing = false;

        if (pendingReload && storageQueue.length === 0) {
            console.log('[Storage] Executing deferred reload');
            window.location.reload();
        }

        processPromise = null;
    })();

    return processPromise;
}

/**
 * Check if a critical operation is in progress
 * @returns {boolean}
 */
export function isCriticalOperationInProgress() {
    return criticalOperationInProgress;
}

/**
 * Set pending reload flag
 * @param {boolean} pending - Whether to reload after queue clears
 */
export function setPendingReload(pending) {
    pendingReload = pending;
}

/**
 * Check if reload is pending
 * @returns {boolean}
 */
export function isReloadPending() {
    return pendingReload;
}

/**
 * Get queue length
 * @returns {number}
 */
export function getQueueLength() {
    return storageQueue.length;
}

/**
 * Check if queue is processing
 * @returns {boolean}
 */
export function isProcessingQueue() {
    return isQueueProcessing;
}
