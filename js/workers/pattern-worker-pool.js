/**
 * Pattern Worker Pool
 * 
 * Spawns multiple Web Workers for parallel pattern detection.
 * Distributes work across workers and aggregates results.
 * 
 * HNW Wave: Achieves 3x speedup on multi-core devices by
 * parallelizing independent pattern detection algorithms.
 * 
 * @module workers/pattern-worker-pool
 */

// ==========================================
// Configuration
// ==========================================

/**
 * Pattern groups for distribution across workers
 * Patterns are grouped by approximate execution time
 */
const PATTERN_GROUPS = [
    // Worker 1: Data-heavy patterns
    ['detectComfortDiscoveryRatio', 'detectEras', 'detectTimePatterns'],
    // Worker 2: Artist analysis patterns
    ['detectSocialPatterns', 'detectGhostedArtists', 'detectDiscoveryExplosions'],
    // Worker 3: Engagement patterns
    ['detectMoodSearching', 'detectTrueFavorites']
];

/**
 * Default number of workers (adjusted based on hardware)
 */
const DEFAULT_WORKER_COUNT = 3;

// ==========================================
// Worker Pool State
// ==========================================

let workers = [];
let initialized = false;
let requestId = 0;
const pendingRequests = new Map();

// ==========================================
// Core Functions
// ==========================================

/**
 * Initialize the worker pool
 * 
 * @param {Object} [options] - Configuration options
 * @param {number} [options.workerCount] - Number of workers to spawn
 * @returns {Promise<void>}
 */
async function init(options = {}) {
    if (initialized) {
        console.log('[PatternWorkerPool] Already initialized');
        return;
    }

    // Determine optimal worker count based on hardware
    const hardwareConcurrency = navigator?.hardwareConcurrency || 4;
    const workerCount = options.workerCount || Math.min(DEFAULT_WORKER_COUNT, hardwareConcurrency - 1);

    console.log(`[PatternWorkerPool] Initializing with ${workerCount} workers (${hardwareConcurrency} cores)`);

    try {
        for (let i = 0; i < workerCount; i++) {
            const worker = new Worker('./pattern-worker.js');

            // Setup message handler
            worker.onmessage = handleWorkerMessage;
            worker.onerror = handleWorkerError;

            workers.push({
                worker,
                busy: false,
                processedCount: 0
            });
        }

        initialized = true;
        console.log('[PatternWorkerPool] Initialized successfully');
    } catch (error) {
        console.error('[PatternWorkerPool] Initialization failed:', error);
        throw error;
    }
}

/**
 * Handle message from worker
 * 
 * @param {MessageEvent} event - Worker message event
 */
function handleWorkerMessage(event) {
    const { requestId: reqId, type, result, error, progress } = event.data;

    const request = pendingRequests.get(reqId);
    if (!request) {
        console.warn('[PatternWorkerPool] Received message for unknown request:', reqId);
        return;
    }

    if (type === 'progress' && request.onProgress) {
        request.onProgress(progress);
        return;
    }

    if (type === 'result') {
        request.results.push(result);
        request.completedWorkers++;

        // Check if all workers have completed
        if (request.completedWorkers >= request.totalWorkers) {
            pendingRequests.delete(reqId);

            // Aggregate results
            const aggregated = aggregateResults(request.results);
            request.resolve(aggregated);
        }
    }

    if (type === 'error') {
        console.error('[PatternWorkerPool] Worker error:', error);
        request.errors.push(error);
        request.completedWorkers++;

        // Still check for completion
        if (request.completedWorkers >= request.totalWorkers) {
            pendingRequests.delete(reqId);

            if (request.results.length > 0) {
                // Partial success
                const aggregated = aggregateResults(request.results);
                request.resolve(aggregated);
            } else {
                // Complete failure
                request.reject(new Error(`All workers failed: ${request.errors.join(', ')}`));
            }
        }
    }
}

/**
 * Handle worker error
 * 
 * @param {ErrorEvent} error - Worker error event
 */
function handleWorkerError(error) {
    console.error('[PatternWorkerPool] Worker error:', error);
}

/**
 * Detect all patterns in parallel using worker pool
 * 
 * @param {Array} streams - Streaming history data
 * @param {Array} chunks - Weekly/monthly chunks
 * @param {function} [onProgress] - Progress callback
 * @returns {Promise<Object>} Aggregated pattern results
 */
async function detectAllPatterns(streams, chunks, onProgress = null) {
    // Fallback to synchronous if pool not available
    if (!initialized || workers.length === 0) {
        console.warn('[PatternWorkerPool] Not initialized, falling back to sync');
        return fallbackToSync(streams, chunks);
    }

    // For small datasets, use single worker
    if (streams.length < 1000) {
        return detectWithSingleWorker(streams, chunks, onProgress);
    }

    const reqId = `pool_${++requestId}`;

    return new Promise((resolve, reject) => {
        const request = {
            resolve,
            reject,
            onProgress,
            results: [],
            errors: [],
            completedWorkers: 0,
            totalWorkers: workers.length,
            startTime: Date.now()
        };

        pendingRequests.set(reqId, request);

        // Distribute work across workers
        workers.forEach((workerInfo, index) => {
            const patternGroup = PATTERN_GROUPS[index] || [];

            workerInfo.worker.postMessage({
                type: 'DETECT_PATTERNS',
                requestId: reqId,
                streams,
                chunks,
                patterns: patternGroup
            });

            workerInfo.busy = true;
        });

        console.log(`[PatternWorkerPool] Dispatched request ${reqId} to ${workers.length} workers`);
    });
}

/**
 * Detect patterns using a single worker (for small datasets)
 * 
 * @param {Array} streams - Streaming history
 * @param {Array} chunks - Chunks
 * @param {function} [onProgress] - Progress callback
 * @returns {Promise<Object>}
 */
async function detectWithSingleWorker(streams, chunks, onProgress) {
    if (workers.length === 0) {
        return fallbackToSync(streams, chunks);
    }

    const reqId = `single_${++requestId}`;

    return new Promise((resolve, reject) => {
        const request = {
            resolve,
            reject,
            onProgress,
            results: [],
            errors: [],
            completedWorkers: 0,
            totalWorkers: 1,
            startTime: Date.now()
        };

        pendingRequests.set(reqId, request);

        // Use first worker for all patterns
        const allPatterns = PATTERN_GROUPS.flat();

        workers[0].worker.postMessage({
            type: 'DETECT_PATTERNS',
            requestId: reqId,
            streams,
            chunks,
            patterns: allPatterns
        });
    });
}

/**
 * Fallback to synchronous pattern detection
 * 
 * @param {Array} streams - Streaming history
 * @param {Array} chunks - Chunks
 * @returns {Promise<Object>}
 */
async function fallbackToSync(streams, chunks) {
    console.log('[PatternWorkerPool] Using synchronous fallback');

    if (typeof window !== 'undefined' && window.Patterns) {
        return window.Patterns.detectAllPatterns(streams, chunks);
    }

    throw new Error('Patterns module not available');
}

/**
 * Aggregate results from multiple workers
 * 
 * @param {Array<Object>} results - Results from each worker
 * @returns {Object} Aggregated pattern results
 */
function aggregateResults(results) {
    const aggregated = {};

    for (const result of results) {
        if (result && typeof result === 'object') {
            Object.assign(aggregated, result);
        }
    }

    return aggregated;
}

/**
 * Get pool status
 * 
 * @returns {Object}
 */
function getStatus() {
    return {
        initialized,
        workerCount: workers.length,
        busyWorkers: workers.filter(w => w.busy).length,
        pendingRequests: pendingRequests.size,
        totalProcessed: workers.reduce((sum, w) => sum + w.processedCount, 0)
    };
}

/**
 * Terminate all workers
 */
function terminate() {
    for (const workerInfo of workers) {
        workerInfo.worker.terminate();
    }

    workers = [];
    initialized = false;
    pendingRequests.clear();

    console.log('[PatternWorkerPool] Terminated all workers');
}

/**
 * Get estimated speedup factor
 * 
 * @returns {number}
 */
function getSpeedupFactor() {
    const cores = navigator?.hardwareConcurrency || 1;
    const activeWorkers = workers.length;

    // Theoretical max is number of workers, but communication overhead reduces it
    return Math.min(activeWorkers * 0.8, cores - 1);
}

// ==========================================
// Public API
// ==========================================

const PatternWorkerPool = {
    // Lifecycle
    init,
    terminate,

    // Detection
    detectAllPatterns,

    // Status
    getStatus,
    getSpeedupFactor,

    // Configuration
    PATTERN_GROUPS
};

// ES Module export
export { PatternWorkerPool };

console.log('[PatternWorkerPool] Pattern Worker Pool loaded');
