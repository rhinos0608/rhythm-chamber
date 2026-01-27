/**
 * Task Distribution Module
 *
 * Handles task distribution to workers and result aggregation.
 *
 * Responsibilities:
 * - Distribute pattern detection tasks across workers
 * - Handle worker messages (results, errors, partial results, heartbeats)
 * - Aggregate results from multiple workers
 * - Backpressure management and flow control
 * - Request lifecycle management
 * - Fallback to synchronous pattern detection
 *
 * @module workers/pattern-worker-pool/task-distribution
 */

import { Patterns } from '../../patterns.js';
import { EventBus } from '../../services/event-bus.js';

// ==========================================
// Configuration
// ==========================================

/**
 * Pattern groups for distribution across workers
 * Patterns are grouped by approximate execution time
 */
export const PATTERN_GROUPS = [
    // Worker 1: Data-heavy patterns
    ['detectComfortDiscoveryRatio', 'detectEras', 'detectTimePatterns'],
    // Worker 2: Artist analysis patterns
    ['detectSocialPatterns', 'detectGhostedArtists', 'detectDiscoveryExplosions'],
    // Worker 3: Engagement patterns
    ['detectMoodSearching', 'detectTrueFavorites']
];

// ==========================================
// State
// ==========================================

let workers = [];
let initialized = false;
let requestId = 0;
const pendingRequests = new Map();

// Backpressure state (HNW Wave)
let pendingResultCount = 0;
const BACKPRESSURE_THRESHOLD = 50; // Pause at 50 pending results
const BACKPRESSURE_RESUME_THRESHOLD = 25; // Resume at 25 pending results
let paused = false;
const backpressureListeners = [];

// Result consumption tracking (Issue #18 fix)
const resultConsumptionCalls = new Map();

// ==========================================
// Public API
// ==========================================

/**
 * Initialize task distribution with worker pool
 *
 * @param {Array} workerPool - Array of worker info objects
 * @param {boolean} isInitialized - Whether pool is initialized
 */
export function initializeTaskDistribution(workerPool, isInitialized) {
    workers = workerPool;
    initialized = isInitialized;
}

/**
 * Get current state for testing/inspection
 *
 * @returns {Object} Current state
 */
export function getState() {
    return {
        workers,
        initialized,
        pendingRequests,
        requestId,
        pendingResultCount,
        paused,
        backpressureListeners,
        resultConsumptionCalls
    };
}

/**
 * Handle message from worker
 *
 * @param {MessageEvent} event - Worker message event
 */
export function handleWorkerMessage(event) {
    const { requestId: reqId, type, result, error, progress, timestamp, pattern } = event.data;
    const workerInfo = workers.find(w => w.worker === event.target);

    // Handle heartbeat response
    if (type === 'HEARTBEAT_RESPONSE') {
        if (workerInfo) {
            // Heartbeat tracking is handled by worker-lifecycle module
            if (false) { // Set to true for verbose logging
                console.log(`[TaskDistribution] Worker heartbeat received at ${new Date(timestamp).toISOString()}`);
            }
        }
        return;
    }

    const request = pendingRequests.get(reqId);
    if (!request) {
        if (workerInfo) {
            workerInfo.busy = false;
        }
        console.warn('[TaskDistribution] Received message for unknown request:', reqId);
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

        console.log(`[TaskDistribution] Partial result: ${pattern} (${Math.round(progressPercent * 100)}%)`);
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

            // MEDIUM FIX Issue #18: Clean up result consumption tracking when request completes
            resultConsumptionCalls.delete(reqId);

            // Aggregate results
            const aggregated = aggregateResults(request.results);
            request.resolve(aggregated);
        }
    } else if (type === 'error') {
        console.error('[TaskDistribution] Worker error:', error);
        request.errors.push(error);
        markComplete();

        // Still check for completion
        if (request.completedWorkers >= request.totalWorkers) {
            pendingRequests.delete(reqId);

            // MEDIUM FIX Issue #18: Clean up result consumption tracking when request completes
            resultConsumptionCalls.delete(reqId);

            // Use partial results if available
            if (request.partialResults && Object.keys(request.partialResults).length > 0) {
                console.log('[TaskDistribution] Using partial results due to worker error');
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
export function handleWorkerError(error) {
    console.error('[TaskDistribution] Worker error:', error);

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
    console.log('[TaskDistribution] Emitted pattern:worker_failure event');

    // Create a snapshot of pending request IDs to avoid modification during iteration
    // This prevents the memory leak where requests are deleted while iterating
    const pendingRequestIds = Array.from(pendingRequests.keys());

    for (const reqId of pendingRequestIds) {
        const request = pendingRequests.get(reqId);

        // Request may have been deleted by a previous iteration (worker error handling)
        if (!request) {
            continue;
        }

        // Skip already completed requests
        if (request.completedWorkers >= request.totalWorkers) {
            continue;
        }

        request.errors.push(errorMessage);
        request.completedWorkers++;

        if (request.completedWorkers >= request.totalWorkers) {
            // Delete before resolving to prevent potential re-entry issues
            pendingRequests.delete(reqId);

            // MEDIUM FIX Issue #18: Clean up result consumption tracking on worker error
            resultConsumptionCalls.delete(reqId);

            if (request.results.length > 0) {
                const aggregated = aggregateResults(request.results);
                request.resolve(aggregated);
            } else if (request.partialResults && Object.keys(request.partialResults).length > 0) {
                // Use partial results if available (HNW Wave: recovery from partial work)
                console.log('[TaskDistribution] Using partial results due to worker error');
                request.resolve(request.partialResults);
            } else {
                request.reject(new Error('All workers failed'));
            }
        }
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
export async function detectAllPatterns(streams, chunks, onProgress = null) {
    // Fallback to synchronous if pool not available
    if (!initialized || workers.length === 0) {
        console.warn('[TaskDistribution] Not initialized, falling back to sync');
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

        console.log(`[TaskDistribution] Dispatched request ${reqId} to ${activeWorkerCount} workers`);
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
export async function detectWithSingleWorker(streams, chunks, onProgress) {
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
export async function fallbackToSync(streams, chunks) {
    console.log('[TaskDistribution] Using synchronous fallback');

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
export function aggregateResults(results) {
    const aggregated = {};

    for (const result of results) {
        if (result && typeof result === 'object') {
            Object.assign(aggregated, result);
        }
    }

    return aggregated;
}

/**
 * Check and apply backpressure if needed
 * Notifies listeners when backpressure state changes
 * @private
 */
function checkBackpressure() {
    if (pendingResultCount >= BACKPRESSURE_THRESHOLD && !paused) {
        paused = true;
        console.warn(`[TaskDistribution] Backpressure: pausing (${pendingResultCount} pending results)`);
        notifyBackpressureListeners('backpressure', { pending: pendingResultCount });
    } else if (paused && pendingResultCount < BACKPRESSURE_RESUME_THRESHOLD) {
        paused = false;
        console.log(`[TaskDistribution] Backpressure: resuming (${pendingResultCount} pending results)`);
        notifyBackpressureListeners('resume', { pending: pendingResultCount });
    }
}

/**
 * Mark a result as consumed, potentially resuming production
 * MEDIUM FIX Issue #18: Added guard to prevent counter underflow and track consumptions
 *
 * @param {string} requestId - Request ID for tracking
 */
export function onResultConsumed(requestId) {
    // MEDIUM FIX Issue #18: Track per-request consumption to prevent underflow
    // The previous implementation could cause underflow if called more times than results produced
    if (requestId) {
        const previousCalls = resultConsumptionCalls.get(requestId) || 0;
        resultConsumptionCalls.set(requestId, previousCalls + 1);
    }

    // Clamp to prevent underflow (should never go below 0, but defensive programming)
    const beforeCount = pendingResultCount;
    pendingResultCount = Math.max(0, pendingResultCount - 1);

    // MEDIUM FIX Issue #18: Log suspicious decrements (potential bug in caller code)
    if (beforeCount === 0 && requestId) {
        console.warn(`[TaskDistribution] onResultConsumed called with pendingResultCount=0 for request ${requestId}. This may indicate a bug in caller code.`);
    }

    // Check if we should resume (now handled by checkBackpressure)
    checkBackpressure();

    // MEDIUM FIX Issue #18: Clean up tracking when backpressure is clear
    if (pendingResultCount === 0 && resultConsumptionCalls.size > 100) {
        // Prevent unbounded growth of the tracking map
        resultConsumptionCalls.clear();
    }
}

/**
 * Subscribe to backpressure events
 *
 * @param {function} listener - Callback receiving (event: 'backpressure' | 'resume', data: object)
 * @returns {function} Unsubscribe function
 */
export function onBackpressure(listener) {
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
            console.error('[TaskDistribution] Backpressure listener error:', e);
        }
    }
}

/**
 * Check if pool is paused due to backpressure
 *
 * @returns {boolean}
 */
export function isPaused() {
    return paused;
}

/**
 * Clean up all pending requests (for termination)
 *
 * @param {Error} terminationError - Error to reject pending requests with
 */
export function cleanupPendingRequests(terminationError) {
    for (const [, request] of pendingRequests.entries()) {
        request.reject(terminationError);
    }
    pendingRequests.clear();

    // MEDIUM FIX Issue #18: Clean up result consumption tracking on terminate
    resultConsumptionCalls.clear();
}

/**
 * Get backpressure state
 *
 * @returns {Object} Backpressure status
 */
export function getBackpressureState() {
    return {
        pendingResultCount,
        paused,
        backpressureThreshold: BACKPRESSURE_THRESHOLD,
        backpressureResumeThreshold: BACKPRESSURE_RESUME_THRESHOLD,
        listenerCount: backpressureListeners.length
    };
}

// ==========================================
// Constants
// ==========================================

export const BACKPRESSURE_THRESHOLD_CONST = BACKPRESSURE_THRESHOLD;
export const BACKPRESSURE_RESUME_THRESHOLD_CONST = BACKPRESSURE_RESUME_THRESHOLD;
