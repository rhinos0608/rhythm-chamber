/**
 * Pool Management Module
 *
 * Handles pool sizing, scaling, and status reporting.
 *
 * Responsibilities:
 * - Calculate optimal worker count based on hardware
 * - Detect SharedArrayBuffer availability
 * - Data partitioning for memory optimization
 * - Pool status reporting
 * - Speedup factor calculation
 * - Memory configuration management
 *
 * @module workers/pattern-worker-pool/pool-management
 */

import { WORKER_TIMEOUTS } from '../../config/timeouts.js';

// ==========================================
// Configuration
// ==========================================

/**
 * Default number of workers (adjusted based on hardware)
 */
const DEFAULT_WORKER_COUNT = 3;

/**
 * Check if SharedArrayBuffer is available
 * Requires COOP/COEP headers: Cross-Origin-Opener-Policy: same-origin
 *                             Cross-Origin-Embedder-Policy: require-corp
 *
 * @returns {boolean} True if SharedArrayBuffer is available
 */
export function isSharedArrayBufferAvailable() {
    try {
        // Check if SAB exists and is actually usable
        if (typeof SharedArrayBuffer === 'undefined') {
            return false;
        }

        // Try to create a test buffer - will fail if cross-origin isolated is not set
        const testBuffer = new SharedArrayBuffer(8);
        return testBuffer.byteLength === 8;
    } catch (e) {
        console.log('[PoolManagement] SharedArrayBuffer not available:', e.message);
        return false;
    }
}

// Detect on module load
const SHARED_MEMORY_AVAILABLE = isSharedArrayBufferAvailable();

/**
 * Memory pooling configuration
 */
const MEMORY_CONFIG = {
    useSharedMemory: SHARED_MEMORY_AVAILABLE,
    partitionData: !SHARED_MEMORY_AVAILABLE, // Fallback: partition instead of duplicate
    logMemoryUsage: true,
};

console.log(
    `[PoolManagement] Memory mode: ${SHARED_MEMORY_AVAILABLE ? 'SharedArrayBuffer' : 'Partitioned'}`
);

// ==========================================
// Public API
// ==========================================

/**
 * Calculate optimal worker count based on hardware
 *
 * @param {Object} [options] - Configuration options
 * @param {number} [options.workerCount] - Explicit worker count (overrides calculation)
 * @returns {number} Optimal worker count
 */
export function calculateOptimalWorkerCount(options = {}) {
    // Determine optimal worker count based on hardware
    const hardwareConcurrency = navigator?.hardwareConcurrency || 4;
    const computedMax = Math.max(1, hardwareConcurrency - 1);

    // HNW Network: Adapt worker count based on device memory
    // Low memory devices (<= 2GB) get fewer workers to prevent OOM
    const deviceMemory = navigator?.deviceMemory || 4; // Default to 4GB if not available
    let memoryAdjustedMax = computedMax;

    if (deviceMemory <= 2) {
        memoryAdjustedMax = Math.min(computedMax, 2); // Low memory: max 2 workers
        console.log(
            `[PoolManagement] Low memory device (${deviceMemory}GB), limiting to ${memoryAdjustedMax} workers`
        );
    } else if (deviceMemory <= 4) {
        memoryAdjustedMax = Math.min(computedMax, 3); // Medium memory: max 3 workers
    }

    const requestedCount =
        typeof options.workerCount === 'number' && options.workerCount > 0
            ? options.workerCount
            : null;
    const workerCount = requestedCount ?? Math.min(DEFAULT_WORKER_COUNT, memoryAdjustedMax);

    console.log(
        `[PoolManagement] Optimal worker count: ${workerCount} (${hardwareConcurrency} cores, ${deviceMemory}GB RAM)`
    );

    return workerCount;
}

/**
 * Partition data for workers when SharedArrayBuffer unavailable
 * HNW Network: Reduces memory by partitioning instead of duplicating
 *
 * @param {Array} data - Data to partition
 * @param {number} numPartitions - Number of partitions (same as worker count)
 * @returns {Array<Array>} - Partitioned data arrays
 */
export function partitionData(data, numPartitions) {
    if (!data || !Array.isArray(data) || numPartitions < 1) {
        return [data];
    }

    const partitionSize = Math.ceil(data.length / numPartitions);
    const partitions = [];

    for (let i = 0; i < numPartitions; i++) {
        const start = i * partitionSize;
        const end = Math.min(start + partitionSize, data.length);
        partitions.push(data.slice(start, end));
    }

    if (MEMORY_CONFIG.logMemoryUsage) {
        const originalSize = JSON.stringify(data).length;
        const partitionedSize = partitions.reduce((sum, p) => sum + JSON.stringify(p).length, 0);
        console.log(
            `[PoolManagement] Memory: ${(originalSize / 1024).toFixed(1)}KB original → ${(partitionedSize / 1024).toFixed(1)}KB partitioned (${numPartitions} partitions)`
        );
    }

    return partitions;
}

/**
 * Get pool status
 *
 * @param {Object} state - Pool state object
 * @returns {Object} Pool status
 */
export function getStatus(state) {
    return {
        initialized: state.initialized,
        ready: state.initialized && state.workers.length > 0,
        workerCount: state.workers.length,
        busyWorkers: state.workers.filter(w => w.busy).length,
        pendingRequests: state.pendingRequests?.size || 0,
        totalProcessed: state.workers.reduce((sum, w) => sum + w.processedCount, 0),
        // Backpressure status
        pendingResultCount: state.pendingResultCount || 0,
        paused: state.paused || false,
        backpressureThreshold: state.backpressureThreshold || 50,
    };
}

/**
 * Get estimated speedup factor
 *
 * @param {number} activeWorkers - Number of active workers
 * @returns {number} Estimated speedup factor
 */
export function getSpeedupFactor(activeWorkers) {
    const cores = navigator?.hardwareConcurrency || 1;

    // Theoretical max is number of workers, but communication overhead reduces it
    return Math.min(activeWorkers * 0.8, cores - 1);
}

/**
 * Get memory configuration status
 *
 * @param {number} workerCount - Current worker count
 * @returns {Object} Memory config and status
 */
export function getMemoryConfig(workerCount) {
    return {
        sharedArrayBufferAvailable: SHARED_MEMORY_AVAILABLE,
        useSharedMemory: MEMORY_CONFIG.useSharedMemory,
        partitionData: MEMORY_CONFIG.partitionData,
        workerCount,
        crossOriginIsolated:
            typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'unknown',
        recommendation: SHARED_MEMORY_AVAILABLE
            ? 'SharedArrayBuffer enabled - optimal memory usage'
            : 'Add COOP/COEP headers for SharedArrayBuffer: Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: require-corp',
    };
}

/**
 * Resize pool to target worker count
 *
 * @param {Array} workers - Current workers array
 * @param {number} targetCount - Target worker count
 * @param {Function} createWorkerFn - Function to create new worker
 * @param {Function} terminateWorkerFn - Function to terminate worker
 * @returns {number} New worker count
 */
export function resizePool(workers, targetCount, createWorkerFn, terminateWorkerFn) {
    const currentCount = workers.length;

    if (targetCount === currentCount) {
        return currentCount;
    }

    if (targetCount > currentCount) {
        // Add workers
        const workersToAdd = targetCount - currentCount;
        for (let i = 0; i < workersToAdd; i++) {
            const workerIndex = currentCount + i;
            createWorkerFn(workerIndex);
        }
        console.log(`[PoolManagement] Added ${workersToAdd} workers (total: ${targetCount})`);
    } else {
        // Remove workers (remove from end to minimize disruption)
        const workersToRemove = currentCount - targetCount;
        for (let i = 0; i < workersToRemove; i++) {
            const workerInfo = workers.pop();
            if (workerInfo && terminateWorkerFn) {
                terminateWorkerFn(workerInfo.worker, currentCount - i - 1);
            }
        }
        console.log(`[PoolManagement] Removed ${workersToRemove} workers (total: ${targetCount})`);
    }

    return targetCount;
}

// ==========================================
// Exports
// ==========================================

export { DEFAULT_WORKER_COUNT, SHARED_MEMORY_AVAILABLE, MEMORY_CONFIG };
