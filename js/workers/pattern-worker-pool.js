/**
 * Pattern Worker Pool - Facade
 *
 * This is a FACADE that re-exports all pattern worker pool functionality
 * from focused modules. Maintains backward compatibility with existing imports.
 *
 * Module structure:
 * - worker-lifecycle: Worker creation, termination, and health monitoring
 * - pool-management: Optimal worker count calculation and pool sizing
 * - task-distribution: Task scheduling and result aggregation
 *
 * @module workers/pattern-worker-pool
 * @example
 * import { PatternWorkerPool } from './workers/pattern-worker-pool.js';
 * await PatternWorkerPool.init();
 * const results = await PatternWorkerPool.detectAllPatterns(data);
 */

// Import internal coordinator
import * as Internal from './pattern-worker-pool/index.js';

// Import all module functions for re-export
import * as WorkerLifecycle from './pattern-worker-pool/worker-lifecycle.js';
import * as PoolManagement from './pattern-worker-pool/pool-management.js';
import * as TaskDistribution from './pattern-worker-pool/task-distribution.js';

// ==========================================
// PatternWorkerPool Namespace (Backward Compatible)
// ==========================================

/**
 * PatternWorkerPool namespace
 * Maintains backward compatibility with existing code that imports PatternWorkerPool
 */
export const PatternWorkerPool = {
    /**
     * Initialize the worker pool
     * @param {Object} options - Configuration options
     * @returns {Promise<void>}
     */
    init: (options) => Internal.initializePool(options),

    /**
     * Detect all patterns using parallel workers
     * @param {Object} data - Streaming history data
     * @param {Object} options - Detection options
     * @returns {Promise<Object>} Detected patterns
     */
    detectAllPatterns: (data, options) =>
        Internal.detectAllPatterns(data, options),

    /**
     * Terminate all workers
     */
    terminate: () => Internal.terminatePool(),

    /**
     * Get current pool status
     * @returns {Object} Pool status information
     */
    getStatus: () => Internal.getPoolStatus(),

    /**
     * Resize the pool
     * @param {number} newWorkerCount - New worker count
     * @returns {Promise<void>}
     */
    resize: (newWorkerCount) => Internal.resizePool(newWorkerCount)
};

// ==========================================
// Re-export all functions for direct access
// ==========================================

// Worker Lifecycle exports
export {
    createWorker,
    terminateWorker,
    terminateAllWorkers,
    restartWorker,
    checkStaleWorkers,
    startHeartbeat,
    stopHeartbeat,
    sendHeartbeat,
    setupHeartbeatChannel,
    registerUnloadHandler
} from './pattern-worker-pool/worker-lifecycle.js';

// Pool Management exports
export {
    calculateOptimalWorkerCount,
    isSharedArrayBufferAvailable,
    partitionData,
    getStatus,
    getSpeedupFactor,
    getMemoryConfig,
    resizePool
} from './pattern-worker-pool/pool-management.js';

// Task Distribution exports
export {
    detectAllPatterns,
    detectWithSingleWorker,
    fallbackToSync,
    handleWorkerMessage,
    handleWorkerError,
    aggregateResults,
    checkBackpressure,
    onBackpressure,
    onResultConsumed,
    cleanupPendingRequests,
    initializeTaskDistribution
} from './pattern-worker-pool/task-distribution.js';

// ==========================================
// Re-export constants
// ==========================================

// Worker Lifecycle constants
export const {
    HEARTBEAT_INTERVAL,
    HEARTBEAT_TIMEOUT,
    WORKER_TIMEOUT,
    MAX_RESTART_ATTEMPTS
} = WorkerLifecycle;

// Pool Management constants
export const {
    DEFAULT_WORKER_COUNT,
    SHARED_MEMORY_AVAILABLE,
    MEMORY_CONFIG
} = PoolManagement;

// Task Distribution constants
export const {
    BACKPRESSURE_THRESHOLD,
    BACKPRESSURE_RESUME_THRESHOLD,
    MAX_PENDING_REQUESTS
} = TaskDistribution;

// ==========================================
// Re-export modules for advanced usage
// ==========================================

export { WorkerLifecycle } from './pattern-worker-pool/worker-lifecycle.js';
export { PoolManagement } from './pattern-worker-pool/pool-management.js';
export { TaskDistribution } from './pattern-worker-pool/task-distribution.js';

// ==========================================
// Export all from internal index
// ==========================================

export * from './pattern-worker-pool/index.js';
