/**
 * Pattern Cache Module
 * Manages Web Worker state and asynchronous pattern detection for large datasets.
 * @module patterns/pattern-cache
 */

// Worker state (module-private)
let patternWorker = null;
let patternWorkerInitialized = false;
let patternRequestId = 0;
const pendingPatternRequests = new Map();

// Forward declaration for detectAllPatterns (will be provided by index.js)
let detectAllPatternsSync = null;

/**
 * Set the sync pattern detector function
 * Called by index.js to inject the sync detector for fallback
 *
 * @param {Function} syncDetector - The detectAllPatterns function from index.js
 */
export function setSyncDetector(syncDetector) {
    detectAllPatternsSync = syncDetector;
}

/**
 * Initialize pattern worker global handlers (called once)
 * NOTE: Can be called before worker is created to prevent race conditions
 */
export function initPatternWorkerHandlers() {
    if (patternWorkerInitialized) return;

    // If worker exists, set up handlers immediately
    // If worker doesn't exist yet, handlers will be set up when it's created
    if (patternWorker) {
        patternWorkerInitialized = true;

        patternWorker.onmessage = e => {
            // Validate message format before destructuring
            if (!e.data || typeof e.data !== 'object') {
                console.warn('[Patterns] Received invalid message format');
                return;
            }

            const { type, requestId, patterns, current, total, message, error } = e.data;

            const pending = pendingPatternRequests.get(requestId);
            if (!pending) {
                console.warn('[Patterns] Received message for unknown requestId:', requestId);
                return;
            }

            switch (type) {
                case 'progress':
                    pending.onProgress(current, total, message);
                    break;

                case 'complete':
                    clearTimeout(pending.timeoutId);
                    pendingPatternRequests.delete(requestId);
                    pending.resolve(patterns);
                    if (pendingPatternRequests.size === 0) {
                        cleanupPatternWorker();
                    }
                    break;

                case 'error':
                    clearTimeout(pending.timeoutId);
                    pendingPatternRequests.delete(requestId);
                    pending.reject(new Error(error));
                    if (pendingPatternRequests.size === 0) {
                        cleanupPatternWorker();
                    }
                    break;
            }
        };

        patternWorker.onerror = err => {
            // On global error, reject all pending requests
            for (const [requestId, pending] of pendingPatternRequests) {
                clearTimeout(pending.timeoutId);
                pending.reject(new Error(err.message || 'Worker error'));
            }
            pendingPatternRequests.clear();
            cleanupPatternWorker();
        };
    }
}

/**
 * Detect all patterns asynchronously using Web Worker
 * Use for large datasets (100k+ streams) to avoid UI freezing
 *
 * Uses request ID pattern to prevent race conditions when called concurrently.
 *
 * @param {Array} streams - Streaming history
 * @param {Array} chunks - Weekly/monthly chunks
 * @param {Function} onProgress - Progress callback (current, total, message)
 * @returns {Promise<Object>} Detected patterns
 */
export async function detectAllPatternsAsync(streams, chunks, onProgress = () => {}) {
    // For small datasets, use sync detection (faster, no worker overhead)
    const WORKER_THRESHOLD = 10000;
    if (streams.length < WORKER_THRESHOLD) {
        console.log('[Patterns] Using sync detection for small dataset');
        // Use injected sync detector if available, otherwise throw
        if (detectAllPatternsSync) {
            return detectAllPatternsSync(streams, chunks);
        } else {
            throw new Error(
                'Sync detector not available. Make sure index.js calls setSyncDetector().'
            );
        }
    }

    // Check for Web Worker support
    if (typeof Worker === 'undefined') {
        console.warn('[Patterns] Web Workers not supported, falling back to sync');
        if (detectAllPatternsSync) {
            return detectAllPatternsSync(streams, chunks);
        } else {
            throw new Error('Sync detector not available and Web Workers unsupported.');
        }
    }

    // Create worker if not already created
    if (!patternWorker) {
        try {
            patternWorker = new Worker('js/workers/pattern-worker.js');

            // CRITICAL: Initialize handlers immediately after worker creation
            // This prevents race condition where worker sends messages before handlers are ready
            initPatternWorkerHandlers();
        } catch (e) {
            console.warn('[Patterns] Failed to create worker, falling back to sync:', e.message);
            if (detectAllPatternsSync) {
                return detectAllPatternsSync(streams, chunks);
            } else {
                throw new Error(`Failed to create worker: ${e.message}`);
            }
        }
    } else if (!patternWorkerInitialized) {
        // Worker exists but handlers not initialized (edge case)
        initPatternWorkerHandlers();
    }

    // Generate unique request ID for this call
    const requestId = ++patternRequestId;

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            pendingPatternRequests.delete(requestId);
            reject(new Error('Pattern detection timed out (60s)'));
            if (pendingPatternRequests.size === 0) {
                cleanupPatternWorker();
            }
        }, 60000);

        // Store pending request
        pendingPatternRequests.set(requestId, {
            resolve,
            reject,
            onProgress,
            timeoutId,
        });

        // Start detection with requestId
        onProgress(0, 8, 'Starting pattern detection...');
        patternWorker.postMessage({ type: 'detect', requestId, streams, chunks });
    });
}

/**
 * Clean up pattern worker
 * Terminates worker and resets all worker-related state
 */
export function cleanupPatternWorker() {
    if (patternWorker) {
        patternWorker.terminate();
        patternWorker = null;
        patternWorkerInitialized = false;
    }
}
