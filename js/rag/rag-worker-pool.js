/**
 * RAG Worker Pool
 *
 * Manages Web Workers for parallel RAG processing.
 * Handles worker lifecycle, task distribution, and result collection.
 *
 * FEATURES:
 * - Lazy worker initialization (avoids blocking page load)
 * - Request tracking with unique IDs to prevent race conditions
 * - Timeout protection with automatic cleanup
 * - Stale response rejection (prevents old responses from completing requests)
 * - Automatic fallback to main thread when worker fails
 * - Graceful error handling with recovery
 *
 * Based on patterns from PatternWorkerPool and SharedWorkerCoordinator.
 *
 * @module rag/rag-worker-pool
 */

import { ragChunkingService } from './chunking-service.js';

// ==========================================
// Configuration
// ==========================================

const WORKER_URL = './js/embedding-worker.js';
const REQUEST_TIMEOUT_MS = 120000; // 120 seconds
const MAX_RESPONSE_AGE_MS = 130000; // 130 seconds (timeout + buffer)

// ==========================================
// Worker Pool State
// ==========================================

/** @type {Worker|null} */
let embeddingWorker = null;

/** @type {Map<string, {resolve: Function, reject: Function, onProgress: Function, timeoutId: number}>} */
const pendingWorkerRequests = new Map();

/** @type {number} */
let requestIdCounter = 0;

// ==========================================
// Worker Lifecycle
// ==========================================

/**
 * Get or create the EmbeddingWorker instance
 * Lazy-loads the worker to avoid blocking page load
 *
 * @returns {Worker|null} Worker instance or null if not supported
 */
function getWorker() {
    if (embeddingWorker) {
        return embeddingWorker;
    }

    if (typeof Worker === 'undefined') {
        console.warn('[RAGWorkerPool] Web Workers not supported');
        return null;
    }

    try {
        embeddingWorker = new Worker(WORKER_URL);
        console.log('[RAGWorkerPool] EmbeddingWorker initialized');

        // Set up error handler for cleanup
        embeddingWorker.onerror = error => {
            console.warn('[RAGWorkerPool] EmbeddingWorker error:', error.message);
            cleanup();
        };

        return embeddingWorker;
    } catch (err) {
        console.warn('[RAGWorkerPool] Failed to create EmbeddingWorker:', err.message);
        return null;
    }
}

/**
 * Clean up the EmbeddingWorker instance
 * Should be called when worker is no longer needed or on page unload
 *
 * @returns {boolean} True if worker was cleaned up
 */
function cleanup() {
    if (!embeddingWorker) {
        return false;
    }

    try {
        // Reject all pending requests before cleanup
        for (const [requestId, pending] of pendingWorkerRequests.entries()) {
            clearTimeout(pending.timeoutId);
            pending.reject(new Error('Worker cleaned up before completion'));
        }
        pendingWorkerRequests.clear();

        embeddingWorker.onmessage = null;
        embeddingWorker.onerror = null;
        embeddingWorker.terminate();
        embeddingWorker = null;

        console.log('[RAGWorkerPool] EmbeddingWorker cleaned up');
        return true;
    } catch (err) {
        console.warn('[RAGWorkerPool] Error during EmbeddingWorker cleanup:', err.message);
        embeddingWorker = null;
        return false;
    }
}

// ==========================================
// Task Execution
// ==========================================

/**
 * Execute a task on the worker
 *
 * @param {string} task - Task type (e.g., 'createChunks')
 * @param {Object} data - Task data
 * @param {Function} onProgress - Progress callback (current, total, message)
 * @returns {Promise<*>} Task result
 */
async function execute(task, data, onProgress = () => {}) {
    const worker = getWorker();

    // Fallback to main thread if worker not available
    if (!worker) {
        console.log('[RAGWorkerPool] Worker not available, using main thread fallback');
        onProgress(0, 100, 'Processing (main thread - async fallback)...');
        return await executeFallback(task, data, onProgress);
    }

    // Generate unique request ID for this call using counter (prevents collisions)
    const requestId = `${task}_${++requestIdCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            pendingWorkerRequests.delete(requestId);
            reject(new Error(`Worker timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`));
        }, REQUEST_TIMEOUT_MS);

        // Store the request's resolve/reject handlers
        pendingWorkerRequests.set(requestId, { resolve, reject, onProgress, timeoutId });

        // Set up message handler ONCE to prevent race conditions
        if (!worker._chunksHandlerSetup) {
            worker.onmessage = event => {
                const { type, requestId: rid, current, total, message, chunks } = event.data;

                // CRITICAL FIX: Validate request timestamp to reject stale responses
                // Request ID format: <task>_<counter>_<timestamp>
                const requestIdParts = rid.split('_');
                if (requestIdParts.length >= 3) {
                    const requestTimestamp = parseInt(requestIdParts[2]);
                    const responseAge = Date.now() - requestTimestamp;

                    // Reject responses older than MAX_RESPONSE_AGE_MS
                    if (responseAge > MAX_RESPONSE_AGE_MS) {
                        console.warn('[RAGWorkerPool] STALE RESPONSE REJECTED:', {
                            requestId: rid,
                            messageType: type,
                            responseAge: `${Math.round(responseAge / 1000)}s`,
                            maxAge: `${Math.round(MAX_RESPONSE_AGE_MS / 1000)}s`,
                            reason: 'Response timestamp exceeds maximum allowed age',
                        });
                        return;
                    }
                }

                const pending = pendingWorkerRequests.get(rid);
                if (!pending) {
                    // Log late response for debugging
                    const now = Date.now();
                    const age =
                        requestIdParts.length >= 3
                            ? {
                                extracted: requestIdParts[2],
                                ageMs: now - parseInt(requestIdParts[2]),
                            }
                            : { unknown: true };

                    console.warn('[RAGWorkerPool] LATE RESPONSE DETECTED:', {
                        requestId: rid,
                        messageType: type,
                        timestamp: now,
                        requestAge: age,
                        pendingRequests: Array.from(pendingWorkerRequests.keys()),
                        reason: 'Request already completed, timed out, or cleaned up',
                    });
                    return;
                }

                switch (type) {
                    case 'progress':
                        pending.onProgress(current, total, message);
                        break;
                    case 'complete':
                        clearTimeout(pending.timeoutId);
                        pendingWorkerRequests.delete(rid);
                        pending.resolve(chunks);
                        break;
                    case 'error':
                        clearTimeout(pending.timeoutId);
                        pendingWorkerRequests.delete(rid);
                        pending.reject(new Error(message || 'Worker error'));
                        break;
                }
            };
            worker._chunksHandlerSetup = true;
        }

        // Capture the original error handler before assigning new one
        const originalOnError = worker.onerror;

        worker.onerror = async error => {
            clearTimeout(timeoutId);
            console.warn(
                '[RAGWorkerPool] Worker error, falling back to async main thread:',
                error.message
            );

            // FIX: Remove the pending request from the map BEFORE resolving/rejecting
            // This prevents memory leaks and allows proper cleanup
            pendingWorkerRequests.delete(requestId);

            // Fallback to async main thread version
            try {
                const result = await executeFallback(task, data, onProgress);
                cleanup();
                resolve(result);
            } catch (fallbackError) {
                cleanup();
                reject(fallbackError);
            }

            // Invoke the original error handler if it existed
            if (originalOnError && typeof originalOnError === 'function') {
                try {
                    originalOnError.call(worker, error);
                } catch (handlerError) {
                    console.warn(
                        '[RAGWorkerPool] Original error handler failed:',
                        handlerError.message
                    );
                }
            }
        };

        // Send task to worker with requestId
        worker.postMessage({ type: task, ...data, requestId });
    });
}

/**
 * Fallback execution on main thread when worker unavailable
 *
 * @param {string} task - Task type
 * @param {Object} data - Task data
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<*>} Task result
 */
async function executeFallback(task, data, onProgress) {
    switch (task) {
        case 'createChunks':
            return await ragChunkingService.splitDocument(data.streams, onProgress);

        default:
            throw new Error(`Unknown task type: ${task}`);
    }
}

// ==========================================
// Public API
// ==========================================

/**
 * Create chunks using the worker (off-thread) or fallback to main thread
 * Wrapper for backward compatibility with existing code
 *
 * @param {Array} streams - Streaming data
 * @param {Function} onProgress - Progress callback (current, total, message)
 * @returns {Promise<Array>} Chunks for embedding
 */
async function createChunksWithWorker(streams, onProgress = () => {}) {
    return await execute('createChunks', { streams }, onProgress);
}

/**
 * Get pool status
 *
 * @returns {Object} Status information
 */
function getStatus() {
    return {
        workerAvailable: !!embeddingWorker,
        pendingRequests: pendingWorkerRequests.size,
        workerUrl: WORKER_URL,
    };
}

// ==========================================
// Export
// ==========================================

const RAGWorkerPool = {
    // Task execution
    execute,
    createChunksWithWorker,

    // Lifecycle
    cleanup,

    // Status
    getStatus,
};

export { RAGWorkerPool };
