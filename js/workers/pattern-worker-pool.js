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
    init: options => Internal.initializePool(options),

    /**
     * Detect all patterns using parallel workers
     * @param {Array} streams - Streaming history data
     * @param {Array} chunks - Weekly/monthly chunks
     * @param {Function} onProgress - Progress callback
     * @returns {Promise<Object>} Detected patterns
     */
    detectAllPatterns: (streams, chunks, onProgress) =>
        Internal.detectAllPatterns(streams, chunks, onProgress),

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
     * @returns {number} New worker count
     */
    resize: newWorkerCount => Internal.resizePool(newWorkerCount),

    /**
     * Get speedup factor
     * @param {number} activeWorkers - Number of active workers
     * @returns {number} Speedup factor
     */
    getSpeedupFactor: activeWorkers => PoolManagement.getSpeedupFactor(activeWorkers),

    /**
     * Check if paused due to backpressure
     * @returns {boolean} True if paused
     */
    isPaused: () => {
        const state = Internal.getPoolStatus();
        return state.paused || false;
    },

    /**
     * Register callback for backpressure events
     * @param {Function} callback - Callback function
     */
    onBackpressure: callback => TaskDistribution.onBackpressure(callback),

    /**
     * Register callback for result consumption
     * @param {Function} callback - Callback function
     */
    onResultConsumed: callback => TaskDistribution.onResultConsumed(callback),

    /**
     * Get memory configuration
     * @returns {Object} Memory config
     */
    getMemoryConfig: () => PoolManagement.getMemoryConfig(Internal.getPoolStatus().workerCount),

    /**
     * Partition data for workers
     * @param {Array} data - Data to partition
     * @param {number} numPartitions - Number of partitions
     * @returns {Array} Partitioned data
     */
    partitionData: (data, numPartitions) => PoolManagement.partitionData(data, numPartitions),

    /**
     * Pattern groups for worker distribution
     */
    PATTERN_GROUPS: TaskDistribution.PATTERN_GROUPS,

    /**
     * Whether SharedArrayBuffer is available
     */
    SHARED_MEMORY_AVAILABLE: PoolManagement.SHARED_MEMORY_AVAILABLE,
};

// ==========================================
// Re-export all functions for direct access
// ==========================================

// Worker Lifecycle exports
export {
    createWorker,
    terminate,
    restartWorker,
    checkStaleWorkers,
    startHeartbeat,
    stopHeartbeat,
    sendHeartbeat,
    setupHeartbeatChannel,
    registerUnloadHandler,
} from './pattern-worker-pool/worker-lifecycle.js';

// Pool Management exports
export {
    calculateOptimalWorkerCount,
    isSharedArrayBufferAvailable,
    partitionData,
    getStatus,
    getSpeedupFactor,
    getMemoryConfig,
    resizePool,
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
    initializeTaskDistribution,
} from './pattern-worker-pool/task-distribution.js';

// ==========================================
// Re-export constants
// ==========================================

// Pool Management constants
export {
    DEFAULT_WORKER_COUNT,
    SHARED_MEMORY_AVAILABLE,
    MEMORY_CONFIG,
} from './pattern-worker-pool/pool-management.js';

// Task Distribution constants
export { PATTERN_GROUPS } from './pattern-worker-pool/task-distribution.js';

// Task Distribution threshold constants (with CONST suffix)
export {
    BACKPRESSURE_THRESHOLD_CONST as BACKPRESSURE_THRESHOLD,
    BACKPRESSURE_RESUME_THRESHOLD_CONST as BACKPRESSURE_RESUME_THRESHOLD,
} from './pattern-worker-pool/task-distribution.js';

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
