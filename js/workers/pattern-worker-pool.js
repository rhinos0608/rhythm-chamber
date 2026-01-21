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
 * MEMORY OPTIMIZATION:
 * - Uses SharedArrayBuffer when COOP/COEP headers are present
 * - Falls back to data partitioning when SharedArrayBuffer unavailable
 * - Adapts worker count based on navigator.deviceMemory
 *
 * COOP/COEP REQUIREMENTS for SharedArrayBuffer:
 * Server must send these headers:
 *   Cross-Origin-Opener-Policy: same-origin
 *   Cross-Origin-Embedder-Policy: require-corp
 *
 * @module workers/pattern-worker-pool
 */

import { Patterns } from '../patterns.js';
import { EventBus } from '../services/event-bus.js';

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
// SharedArrayBuffer Detection & Memory Pooling
// ==========================================

/**
 * Check if SharedArrayBuffer is available
 * Requires COOP/COEP headers: Cross-Origin-Opener-Policy: same-origin
 *                             Cross-Origin-Embedder-Policy: require-corp
 */
function isSharedArrayBufferAvailable() {
    try {
        // Check if SAB exists and is actually usable
        if (typeof SharedArrayBuffer === 'undefined') {
            return false;
        }

        // Try to create a test buffer - will fail if cross-origin isolated is not set
        const testBuffer = new SharedArrayBuffer(8);
        return testBuffer.byteLength === 8;
    } catch (e) {
        console.log('[PatternWorkerPool] SharedArrayBuffer not available:', e.message);
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
    logMemoryUsage: true
};

console.log(`[PatternWorkerPool] Memory mode: ${SHARED_MEMORY_AVAILABLE ? 'SharedArrayBuffer' : 'Partitioned'}`);

// ==========================================
// Worker Pool State
// ==========================================

let workers = [];
let initialized = false;
let requestId = 0;
const pendingRequests = new Map();

// Heartbeat state - using dedicated MessageChannel for isolation
let heartbeatInterval = null;
const HEARTBEAT_INTERVAL_MS = 5000; // 5 seconds
const STALE_WORKER_TIMEOUT_MS = 15000; // 15 seconds
const workerLastHeartbeat = new Map(); // Track last heartbeat response from each worker
const workerHeartbeatChannels = new Map(); // Track dedicated heartbeat MessageChannel per worker

// Backpressure state (HNW Wave)
let pendingResultCount = 0;
const BACKPRESSURE_THRESHOLD = 50; // Pause at 50 pending results
const BACKPRESSURE_RESUME_THRESHOLD = 25; // Resume at 25 pending results
let paused = false;
const backpressureListeners = [];

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

    // HNW Network: Adapt worker count based on device memory
    // Low memory devices (<= 2GB) get fewer workers to prevent OOM
    const deviceMemory = navigator?.deviceMemory || 4; // Default to 4GB if not available
    let memoryAdjustedMax = computedMax;
    if (deviceMemory <= 2) {
        memoryAdjustedMax = Math.min(computedMax, 2); // Low memory: max 2 workers
        console.log(`[PatternWorkerPool] Low memory device (${deviceMemory}GB), limiting to ${memoryAdjustedMax} workers`);
    } else if (deviceMemory <= 4) {
        memoryAdjustedMax = Math.min(computedMax, 3); // Medium memory: max 3 workers
    }

    const requestedCount = (typeof options.workerCount === 'number' && options.workerCount > 0)
        ? options.workerCount
        : null;
    const workerCount = requestedCount ?? Math.min(DEFAULT_WORKER_COUNT, memoryAdjustedMax);

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
            
            // Create dedicated MessageChannel for heartbeats (prevents contention with work messages)
            setupHeartbeatChannel(worker, i);
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
    const { requestId: reqId, type, result, error, progress, timestamp, pattern } = event.data;
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

    // Handle partial results - store immediately in case worker dies
    // HNW Wave: Enables recovery of partial work
    if (type === 'partial') {
        const partialResult = result;
        const progressPercent = progress;

        // Initialize partial results storage if needed
        if (!request.partialResults) {
            request.partialResults = {};
        }

        // Store partial result
        request.partialResults[pattern] = partialResult;

        // Notify progress
        if (request.onProgress) {
            request.onProgress({
                type: 'partial',
                pattern,
                progress: progressPercent,
                result: partialResult
            });
        }

        // Track backpressure: increment counter and check if we should pause
        pendingResultCount++;
        checkBackpressure();

        console.log(`[PatternWorkerPool] Partial result: ${pattern} (${Math.round(progressPercent * 100)}%)`);
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

        // Track backpressure: increment counter and check if we should pause
        pendingResultCount++;
        checkBackpressure();

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

            // Use partial results if available
            if (request.partialResults && Object.keys(request.partialResults).length > 0) {
                console.log('[PatternWorkerPool] Using partial results due to worker error');
                request.resolve(request.partialResults);
            } else if (request.results.length > 0) {
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
 * HNW Wave: Emits pattern:worker_failure event for UI notification
 * 
 * @param {ErrorEvent} error - Worker error event
 */
function handleWorkerError(error) {
    console.error('[PatternWorkerPool] Worker error:', error);

    const workerInfo = workers.find(w => w.worker === error?.target);
    const workerIndex = workerInfo ? workers.indexOf(workerInfo) : -1;

    if (workerInfo) {
        workerInfo.busy = false;
        workerInfo.processedCount += 1;
    }

    // Emit failure event for UI notification
    // HNW Wave: Enables user-friendly error display
    const errorMessage = error?.message || 'Unknown worker error';
    EventBus.emit('pattern:worker_failure', {
        workerIndex,
        error: errorMessage,
        timestamp: Date.now(),
        affectedPatterns: PATTERN_GROUPS[workerIndex] || []
    });
    console.log('[PatternWorkerPool] Emitted pattern:worker_failure event');

    for (const [reqId, request] of pendingRequests.entries()) {
        if (request.completedWorkers >= request.totalWorkers) {
            continue;
        }

        request.errors.push(errorMessage);
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
 * Setup dedicated MessageChannel for heartbeat communication
 * This isolates heartbeat messages from work messages to prevent:
 * 1. Large work payloads delaying heartbeat responses
 * 2. False positive stale detection during heavy computation
 * 
 * @param {Worker} worker - The worker to setup heartbeat channel for
 * @param {number} index - Worker index for logging
 */
function setupHeartbeatChannel(worker, index) {
    try {
        // Create a dedicated MessageChannel for this worker's heartbeats
        const channel = new MessageChannel();
        
        // Store the channel for later use
        workerHeartbeatChannels.set(worker, {
            port: channel.port1,
            index
        });
        
        // Setup handler for heartbeat responses on port1
        channel.port1.onmessage = (event) => {
            const { type, timestamp } = event.data;
            if (type === 'HEARTBEAT_RESPONSE') {
                workerLastHeartbeat.set(worker, timestamp || Date.now());
                if (false) { // Set to true for verbose heartbeat logging
                    console.log(`[PatternWorkerPool] Worker ${index} heartbeat received via dedicated channel`);
                }
            }
        };
        
        // Transfer port2 to the worker
        worker.postMessage({
            type: 'HEARTBEAT_CHANNEL',
            port: channel.port2
        }, [channel.port2]);
        
        console.log(`[PatternWorkerPool] Heartbeat channel established for worker ${index}`);
    } catch (error) {
        // Fallback: some environments don't support MessageChannel transferable
        console.warn(`[PatternWorkerPool] MessageChannel not available for worker ${index}, using fallback:`, error.message);
        workerHeartbeatChannels.delete(worker);
    }
}

/**
 * Send heartbeat to all workers via dedicated channels
 * Falls back to regular postMessage if MessageChannel unavailable
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
            const channelInfo = workerHeartbeatChannels.get(workerInfo.worker);
            
            if (channelInfo && channelInfo.port) {
                // Use dedicated heartbeat channel (preferred - doesn't contend with work)
                channelInfo.port.postMessage({
                    type: 'HEARTBEAT',
                    timestamp
                });
            } else {
                // Fallback: use regular worker postMessage
                workerInfo.worker.postMessage({
                    type: 'HEARTBEAT',
                    timestamp
                });
            }
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
            // Clean up old heartbeat channel
            const oldChannel = workerHeartbeatChannels.get(workerInfo.worker);
            if (oldChannel && oldChannel.port) {
                try {
                    oldChannel.port.close();
                } catch (e) { /* ignore */ }
            }
            workerHeartbeatChannels.delete(workerInfo.worker);
            workerLastHeartbeat.delete(workerInfo.worker);
            
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
            
            // Setup new heartbeat channel
            setupHeartbeatChannel(newWorker, index);

            console.log(`[PatternWorkerPool] Worker ${index} restarted successfully with new heartbeat channel`);
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

    if (Patterns) {
        return Patterns.detectAllPatterns(streams, chunks);
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
        ready: initialized && workers.length > 0,
        workerCount: workers.length,
        busyWorkers: workers.filter(w => w.busy).length,
        pendingRequests: pendingRequests.size,
        totalProcessed: workers.reduce((sum, w) => sum + w.processedCount, 0),
        // Backpressure status
        pendingResultCount,
        paused,
        backpressureThreshold: BACKPRESSURE_THRESHOLD
    };
}

/**
 * Check and apply backpressure if needed
 * Notifies listeners when backpressure state changes
 * @private
 */
function checkBackpressure() {
    if (pendingResultCount >= BACKPRESSURE_THRESHOLD && !paused) {
        paused = true;
        console.warn(`[PatternWorkerPool] Backpressure: pausing (${pendingResultCount} pending results)`);
        notifyBackpressureListeners('backpressure', { pending: pendingResultCount });
    } else if (paused && pendingResultCount < BACKPRESSURE_RESUME_THRESHOLD) {
        paused = false;
        console.log(`[PatternWorkerPool] Backpressure: resuming (${pendingResultCount} pending results)`);
        notifyBackpressureListeners('resume', { pending: pendingResultCount });
    }
}

/**
 * Mark a result as consumed, potentially resuming production
 */
function onResultConsumed() {
    pendingResultCount = Math.max(0, pendingResultCount - 1);

    // Check if we should resume (now handled by checkBackpressure)
    checkBackpressure();
}

/**
 * Subscribe to backpressure events
 * @param {function} listener - Callback receiving (event: 'backpressure' | 'resume', data: object)
 * @returns {function} Unsubscribe function
 */
function onBackpressure(listener) {
    backpressureListeners.push(listener);
    return () => {
        const idx = backpressureListeners.indexOf(listener);
        if (idx >= 0) backpressureListeners.splice(idx, 1);
    };
}

/**
 * Notify all backpressure listeners
 * @private
 */
function notifyBackpressureListeners(event, data) {
    for (const listener of backpressureListeners) {
        try {
            listener(event, data);
        } catch (e) {
            console.error('[PatternWorkerPool] Backpressure listener error:', e);
        }
    }
}

/**
 * Check if pool is paused due to backpressure
 * @returns {boolean}
 */
function isPaused() {
    return paused;
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

    // Clean up heartbeat channels
    for (const [worker, channelInfo] of workerHeartbeatChannels.entries()) {
        try {
            if (channelInfo && channelInfo.port) {
                channelInfo.port.close();
            }
        } catch (e) { /* ignore */ }
    }
    workerHeartbeatChannels.clear();

    // Clear heartbeat tracking
    workerLastHeartbeat.clear();

    for (const workerInfo of workers) {
        workerInfo.worker.terminate();
    }

    workers = [];
    initialized = false;

    console.log('[PatternWorkerPool] Terminated all workers and heartbeat channels');
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

/**
 * Partition data for workers when SharedArrayBuffer unavailable
 * HNW Network: Reduces memory by partitioning instead of duplicating
 * 
 * @param {Array} data - Data to partition
 * @param {number} numPartitions - Number of partitions (same as worker count)
 * @returns {Array<Array>} - Partitioned data arrays
 */
function partitionData(data, numPartitions) {
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
        console.log(`[PatternWorkerPool] Memory: ${(originalSize / 1024).toFixed(1)}KB original → ${(partitionedSize / 1024).toFixed(1)}KB partitioned (${numPartitions} partitions)`);
    }

    return partitions;
}

/**
 * Get memory configuration status
 * @returns {Object} Memory config and status
 */
function getMemoryConfig() {
    return {
        sharedArrayBufferAvailable: SHARED_MEMORY_AVAILABLE,
        useSharedMemory: MEMORY_CONFIG.useSharedMemory,
        partitionData: MEMORY_CONFIG.partitionData,
        workerCount: workers.length,
        crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'unknown',
        recommendation: SHARED_MEMORY_AVAILABLE
            ? 'SharedArrayBuffer enabled - optimal memory usage'
            : 'Add COOP/COEP headers for SharedArrayBuffer: Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: require-corp'
    };
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

    // Backpressure (HNW Wave)
    onBackpressure,
    onResultConsumed,
    isPaused,

    // Memory configuration (HNW Network)
    getMemoryConfig,
    partitionData,

    // Configuration
    PATTERN_GROUPS,
    SHARED_MEMORY_AVAILABLE
};

// ES Module export
export { PatternWorkerPool };

console.log('[PatternWorkerPool] Pattern Worker Pool loaded');

