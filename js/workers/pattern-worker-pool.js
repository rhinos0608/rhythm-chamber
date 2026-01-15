/**
 * Pattern Worker Pool
 *
 * Spawns multiple Web Workers for parallel pattern detection.
 * Distributes work across workers and aggregates results.
 *
 * HNW Wave: Achieves 3x speedup on multi-core devices by
 * parallelizing independent pattern detection algorithms.
 *
 * HEARTBEAT: Bidirectional liveness checks with worker health monitoring
 * and automatic restart of stale workers.
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

// Heartbeat state
let heartbeatInterval = null;
const HEARTBEAT_INTERVAL_MS = 5000; // 5 seconds
const STALE_WORKER_TIMEOUT_MS = 15000; // 15 seconds
const workerLastHeartbeat = new Map(); // Track last heartbeat response from each worker

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
    const computedMax = Math.max(1, hardwareConcurrency - 1);
    const requestedCount = (typeof options.workerCount === 'number' && options.workerCount > 0)
        ? options.workerCount
        : null;
    const workerCount = requestedCount ?? Math.min(DEFAULT_WORKER_COUNT, computedMax);

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

            // Initialize heartbeat tracking for this worker
            workerLastHeartbeat.set(worker, Date.now());
        }

        initialized = true;
        
        // Start heartbeat monitoring
        startHeartbeat();
        
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
    const { requestId: reqId, type, result, error, progress, timestamp } = event.data;
    const workerInfo = workers.find(w => w.worker === event.target);

    // Handle heartbeat response
    if (type === 'HEARTBEAT_RESPONSE') {
        if (workerInfo) {
            workerLastHeartbeat.set(workerInfo.worker, timestamp);
            console.log(`[PatternWorkerPool] Worker heartbeat received at ${new Date(timestamp).toISOString()}`);
        }
        return;
    }

    const request = pendingRequests.get(reqId);
    if (!request) {
        if (workerInfo) {
            workerInfo.busy = false;
        }
        console.warn('[PatternWorkerPool] Received message for unknown request:', reqId);
        return;
    }

    if (type === 'progress' && request.onProgress) {
        request.onProgress(progress);
        return;
    }

    const markComplete = () => {
        if (workerInfo) {
            workerInfo.busy = false;
            workerInfo.processedCount += 1;
        }
        request.completedWorkers++;
    };

    if (type === 'result') {
        request.results.push(result);
        markComplete();

        // Check if all workers have completed
        if (request.completedWorkers >= request.totalWorkers) {
            pendingRequests.delete(reqId);

            // Aggregate results
            const aggregated = aggregateResults(request.results);
            request.resolve(aggregated);
        }
    } else if (type === 'error') {
        console.error('[PatternWorkerPool] Worker error:', error);
        request.errors.push(error);
        markComplete();

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

    const workerInfo = workers.find(w => w.worker === error?.target);
    if (workerInfo) {
        workerInfo.busy = false;
        workerInfo.processedCount += 1;
    }

    for (const [reqId, request] of pendingRequests.entries()) {
        if (request.completedWorkers >= request.totalWorkers) {
            continue;
        }

        request.errors.push(error?.message || 'Worker error');
        request.completedWorkers++;

        if (request.completedWorkers >= request.totalWorkers) {
            pendingRequests.delete(reqId);

            if (request.results.length > 0) {
                const aggregated = aggregateResults(request.results);
                request.resolve(aggregated);
            } else {
                request.reject(new Error('All workers failed'));
            }
        }
    }
}

/**
 * Send heartbeat to all workers
 *
 * @returns {void}
 */
function sendHeartbeat() {
    if (!initialized || workers.length === 0) {
        return;
    }

    const timestamp = Date.now();
    
    workers.forEach((workerInfo, index) => {
        try {
            workerInfo.worker.postMessage({
                type: 'HEARTBEAT',
                timestamp
            });
        } catch (error) {
            console.error(`[PatternWorkerPool] Failed to send heartbeat to worker ${index}:`, error);
        }
    });
}

/**
 * Handle heartbeat response from worker
 *
 * @param {MessageEvent} event - Worker message event
 */
function handleHeartbeatResponse(event) {
    const { type, timestamp } = event.data;
    
    if (type !== 'HEARTBEAT_RESPONSE') {
        return;
    }
    
    const workerInfo = workers.find(w => w.worker === event.target);
    if (workerInfo) {
        workerLastHeartbeat.set(workerInfo.worker, timestamp);
        console.log(`[PatternWorkerPool] Worker heartbeat received at ${new Date(timestamp).toISOString()}`);
    }
}

/**
 * Check for stale workers and restart them
 *
 * @returns {void}
 */
function checkStaleWorkers() {
    if (!initialized || workers.length === 0) {
        return;
    }

    const now = Date.now();
    const staleWorkers = [];

    workers.forEach((workerInfo, index) => {
        const lastHeartbeat = workerLastHeartbeat.get(workerInfo.worker);
        
        // If no heartbeat received or heartbeat is too old, mark as stale
        if (!lastHeartbeat || (now - lastHeartbeat) > STALE_WORKER_TIMEOUT_MS) {
            staleWorkers.push({ workerInfo, index });
        }
    });

    // Restart stale workers
    staleWorkers.forEach(({ workerInfo, index }) => {
        console.warn(`[PatternWorkerPool] Worker ${index} is stale, restarting...`);
        
        try {
            // Terminate the stale worker
            workerInfo.worker.terminate();
            
            // Create a new worker
            const newWorker = new Worker('./pattern-worker.js');
            
            // Setup message handler
            newWorker.onmessage = handleWorkerMessage;
            newWorker.onerror = handleWorkerError;
            
            // Update the worker info
            workerInfo.worker = newWorker;
            workerInfo.busy = false;
            
            // Reset heartbeat tracking
            workerLastHeartbeat.set(newWorker, Date.now());
            
            console.log(`[PatternWorkerPool] Worker ${index} restarted successfully`);
        } catch (error) {
            console.error(`[PatternWorkerPool] Failed to restart worker ${index}:`, error);
        }
    });
}

/**
 * Start the heartbeat interval
 *
 * @returns {void}
 */
function startHeartbeat() {
    if (heartbeatInterval) {
        console.log('[PatternWorkerPool] Heartbeat already running');
        return;
    }

    console.log(`[PatternWorkerPool] Starting heartbeat (interval: ${HEARTBEAT_INTERVAL_MS}ms)`);
    
    heartbeatInterval = setInterval(() => {
        sendHeartbeat();
        checkStaleWorkers();
    }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Stop the heartbeat interval
 *
 * @returns {void}
 */
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        console.log('[PatternWorkerPool] Heartbeat stopped');
    }
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
    const dispatchPlan = workers
        .map((workerInfo, index) => ({
            workerInfo,
            patternGroup: PATTERN_GROUPS[index] || []
        }))
        .filter(entry => entry.patternGroup.length > 0);
    const activeWorkerCount = dispatchPlan.length;

    return new Promise((resolve, reject) => {
        const request = {
            resolve,
            reject,
            onProgress,
            results: [],
            errors: [],
            completedWorkers: 0,
            totalWorkers: activeWorkerCount,
            startTime: Date.now()
        };

        pendingRequests.set(reqId, request);

        if (activeWorkerCount === 0) {
            pendingRequests.delete(reqId);
            resolve({});
            return;
        }

        // Distribute work across workers
        dispatchPlan.forEach(({ workerInfo, patternGroup }) => {
            workerInfo.worker.postMessage({
                type: 'DETECT_PATTERNS',
                requestId: reqId,
                streams,
                chunks,
                patterns: patternGroup
            });

            workerInfo.busy = true;
        });

        console.log(`[PatternWorkerPool] Dispatched request ${reqId} to ${activeWorkerCount} workers`);
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

        workers[0].busy = true;
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
    const terminationError = new Error('Worker pool terminated');
    for (const [, request] of pendingRequests.entries()) {
        request.reject(terminationError);
    }
    pendingRequests.clear();

    // Stop heartbeat monitoring
    stopHeartbeat();

    // Clear heartbeat tracking
    workerLastHeartbeat.clear();

    for (const workerInfo of workers) {
        workerInfo.worker.terminate();
    }

    workers = [];
    initialized = false;

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
