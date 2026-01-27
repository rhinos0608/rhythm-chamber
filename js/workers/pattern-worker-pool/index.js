/**
 * Pattern Worker Pool - Internal Index
 *
 * Internal coordinator that imports all sub-modules and provides
 * a unified interface for the facade to use.
 *
 * This file is for internal use only. External consumers should
 * import from the facade (pattern-worker-pool.js).
 *
 * @module workers/pattern-worker-pool/index
 */

// Import all sub-modules
import * as WorkerLifecycle from './worker-lifecycle.js';
import * as PoolManagement from './pool-management.js';
import * as TaskDistribution from './task-distribution.js';

// Re-export all module exports for internal use
export * from './worker-lifecycle.js';
export * from './pool-management.js';
export * from './task-distribution.js';

// Re-export modules as named exports for convenience
export { WorkerLifecycle, PoolManagement, TaskDistribution };

// Shared state management
let workers = [];
let initialized = false;

/**
 * Initialize the complete worker pool system
 * This is called by the facade's init() function
 *
 * @param {Object} options - Configuration options
 * @returns {Promise<void>}
 */
export async function initializePool(options = {}) {
    if (initialized) {
        console.log('[PatternWorkerPool] Already initialized');
        return;
    }

    try {
        // Calculate optimal worker count
        const workerCount = PoolManagement.calculateOptimalWorkerCount(options);

        console.log(`[PatternWorkerPool] Initializing with ${workerCount} workers`);

        // Create workers
        for (let i = 0; i < workerCount; i++) {
            const workerInfo = WorkerLifecycle.createWorker(i);
            workers.push(workerInfo);
        }

        // Initialize task distribution with worker pool
        TaskDistribution.initializeTaskDistribution(workers, true);

        // Setup message handlers
        workers.forEach(workerInfo => {
            workerInfo.worker.onmessage = TaskDistribution.handleWorkerMessage;
            workerInfo.worker.onerror = TaskDistribution.handleWorkerError;
        });

        // Start heartbeat monitoring
        WorkerLifecycle.startHeartbeat();

        // Register page unload handler
        WorkerLifecycle.registerUnloadHandler(() => {
            terminatePool();
        });

        initialized = true;
        console.log('[PatternWorkerPool] Initialized successfully');
    } catch (error) {
        console.error('[PatternWorkerPool] Initialization failed:', error);
        throw error;
    }
}

/**
 * Terminate the complete worker pool system
 * This is called by the facade's terminate() function
 */
export function terminatePool() {
    const terminationError = new Error('Worker pool terminated');

    // Clean up pending requests
    TaskDistribution.cleanupPendingRequests(terminationError);

    // Stop heartbeat
    WorkerLifecycle.stopHeartbeat();

    // Terminate all workers (use terminate(), not terminateAllWorkers)
    WorkerLifecycle.terminate();

    // Clear workers array
    workers = [];
    initialized = false;

    console.log('[PatternWorkerPool] Terminated all workers');
}

/**
 * Resize the pool to a new worker count
 * This is called by the facade's resize() function
 *
 * @param {number} newWorkerCount - Target worker count
 * @returns {number} New worker count
 */
export function resizePool(newWorkerCount) {
    if (!initialized) {
        console.warn('[PatternWorkerPool] Cannot resize pool: not initialized');
        return 0;
    }

    const currentCount = workers.length;

    if (newWorkerCount === currentCount) {
        return currentCount;
    }

    if (newWorkerCount > currentCount) {
        // Add workers
        const workersToAdd = newWorkerCount - currentCount;
        for (let i = 0; i < workersToAdd; i++) {
            const workerIndex = currentCount + i;
            const workerInfo = WorkerLifecycle.createWorker(workerIndex);
            workers.push(workerInfo);

            // Setup message handlers for new worker
            workerInfo.worker.onmessage = TaskDistribution.handleWorkerMessage;
            workerInfo.worker.onerror = TaskDistribution.handleWorkerError;
        }
        console.log(`[PatternWorkerPool] Added ${workersToAdd} workers (total: ${newWorkerCount})`);
    } else {
        // Remove workers (remove from end to minimize disruption)
        const workersToRemove = currentCount - newWorkerCount;
        for (let i = 0; i < workersToRemove; i++) {
            const workerInfo = workers.pop();
            if (workerInfo && workerInfo.worker) {
                workerInfo.worker.terminate();
            }
        }
        console.log(`[PatternWorkerPool] Removed ${workersToRemove} workers (total: ${newWorkerCount})`);
    }

    // Update task distribution with new worker count
    TaskDistribution.initializeTaskDistribution(workers, true);

    return newWorkerCount;
}

/**
 * Get pool status
 *
 * @returns {Object} Pool status
 */
export function getPoolStatus() {
    return {
        initialized,
        ready: initialized && workers.length > 0,
        workerCount: workers.length,
        busyWorkers: workers.filter(w => w.busy).length,
        pendingRequests: TaskDistribution.getState().pendingRequests.size,
        totalProcessed: workers.reduce((sum, w) => sum + w.processedCount, 0),
        ...TaskDistribution.getBackpressureState()
    };
}

/**
 * Get workers array (for testing)
 *
 * @returns {Array} Workers array
 */
export function getWorkers() {
    return workers;
}

/**
 * Check if pool is initialized
 *
 * @returns {boolean}
 */
export function isInitialized() {
    return initialized;
}

/**
 * Detect all patterns using parallel workers
 * Delegates to task distribution module
 *
 * @param {Array} streams - Streaming history data
 * @param {Array} chunks - Weekly/monthly chunks
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Detected patterns
 */
export async function detectAllPatterns(streams, chunks, onProgress = null) {
    if (!initialized) {
        console.warn('[PatternWorkerPool] Not initialized, using fallback');
        return TaskDistribution.fallbackToSync(streams);
    }

    return TaskDistribution.detectAllPatterns(streams, chunks, onProgress);
}
