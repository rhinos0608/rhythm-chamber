/**
 * Web Worker Management for Async Search
 *
 * Manages the vector search worker lifecycle and communication
 *
 * @module vector-store/worker
 */

import { WORKER_TIMEOUT_MS, WORKER_INIT_TIMEOUT_MS, SMALL_VECTOR_THRESHOLD } from './config.js';

/**
 * Create a worker manager for async vector search
 *
 * @param {Function} searchFallback - Fallback function when worker unavailable
 * @returns {Object} Worker manager
 */
export function createWorkerManager(searchFallback) {
    let searchWorker = null;
    let workerInitPromise = null;
    let workerReady = false;
    let initStartTime = 0;

    // Track pending searches
    const pendingSearches = new Map();
    let requestIdCounter = 0;

    /**
     * Generate unique request ID for worker correlation
     *
     * @returns {string} Unique request ID
     */
    function generateRequestId() {
        return `search-${++requestIdCounter}-${Date.now()}`;
    }

    /**
     * Initialize the search worker asynchronously with initialization semaphore
     *
     * CRITICAL FIX: Worker initialization race condition
     * Multiple concurrent calls can trigger multiple worker creation attempts.
     * This implements a semaphore pattern with timeout-based recovery.
     *
     * @returns {Promise<Worker|null>} The worker instance or null if unavailable
     */
    async function initWorkerAsync() {
        // Already initialized
        if (searchWorker && workerReady) return searchWorker;

        // Check for stale initialization promise with timeout
        if (workerInitPromise && initStartTime > 0) {
            const initDuration = Date.now() - initStartTime;
            if (initDuration > WORKER_INIT_TIMEOUT_MS) {
                console.warn(`[VectorStore] Worker init timeout after ${initDuration}ms, retrying`);
                workerInitPromise = null;
                initStartTime = 0;
            }
        }

        // Check and assign synchronously before any await to prevent race condition
        if (workerInitPromise) return workerInitPromise;

        // Record start time IMMEDIATELY before creating promise
        initStartTime = Date.now();

        // Start initialization - set promise IMMEDIATELY before any async code
        workerInitPromise = new Promise(resolve => {
            try {
                // Check if we're in a context where workers can be created
                if (typeof Worker === 'undefined') {
                    console.warn('[VectorStore] Web Workers not supported, using sync fallback');
                    resolve(null);
                    return;
                }

                const worker = new Worker('js/workers/vector-search-worker.js');

                // Track if worker successfully initialized
                let workerStarted = false;

                worker.onmessage = event => {
                    workerStarted = true;
                    const { type, id, results, stats, message } = event.data;

                    // Check if request is still in pendingSearches
                    const pending = pendingSearches.get(id);
                    if (!pending) {
                        // Log late response for debugging
                        const now = Date.now();
                        let age;
                        if (id.includes('_')) {
                            const parts = id.split('_');
                            const lastPart = parts.pop();
                            const timestamp = parseInt(lastPart, 10);
                            if (!isNaN(timestamp) && timestamp > 0) {
                                age = {
                                    extracted: lastPart,
                                    ageMs: now - timestamp,
                                };
                            } else {
                                age = {
                                    raw: id,
                                    parseError: `Could not parse timestamp from: ${lastPart}`,
                                };
                            }
                        } else {
                            age = { unknown: true, raw: id };
                        }

                        console.warn('[VectorStore] LATE SEARCH RESPONSE DETECTED:', {
                            searchId: id,
                            messageType: type,
                            timestamp: now,
                            requestAge: age,
                            pendingSearches: Array.from(pendingSearches.keys()),
                            reason: 'Search already completed, timed out, or cancelled',
                        });
                        return;
                    }

                    pendingSearches.delete(id);

                    if (type === 'results') {
                        if (stats) {
                            console.log(
                                `[VectorStore] Worker search: ${stats.vectorCount} vectors in ${stats.elapsedMs}ms`
                            );
                        }
                        pending.resolve(results);
                    } else if (type === 'error') {
                        console.error('[VectorStore] Worker error:', message);
                        pending.reject(new Error(message));
                    }
                };

                worker.onerror = error => {
                    // Determine if this is a network/loading error vs runtime error
                    const isNetworkError =
                        !workerStarted ||
                        (error.message &&
                            (error.message.includes('NetworkError') ||
                                error.message.includes('Failed to fetch') ||
                                error.message.includes('Failed to load') ||
                                error.message.includes('Script error')));

                    if (isNetworkError) {
                        console.warn(
                            '[VectorStore] Worker failed to load (offline or network error). Using sync fallback.'
                        );
                        console.warn(
                            '[VectorStore] This is expected when offline - vector search will use main thread.'
                        );
                    } else {
                        console.error('[VectorStore] Worker runtime error:', error);
                    }

                    // Reject all pending searches
                    for (const [id, pending] of pendingSearches) {
                        pending.reject(new Error('Worker unavailable'));
                    }
                    pendingSearches.clear();

                    searchWorker = null;
                    workerReady = false;

                    // Clear workerInitPromise to allow future retries after failure
                    workerInitPromise = null;
                    initStartTime = 0;

                    resolve(null);
                };

                searchWorker = worker;
                workerReady = true;
                console.log('[VectorStore] Search worker initialized');
                resolve(worker);
            } catch (e) {
                // Handle synchronous errors (e.g., CSP blocking Worker creation)
                const isSecurityError =
                    e.name === 'SecurityError' || e.message?.includes('Content Security Policy');

                if (isSecurityError) {
                    console.warn(
                        '[VectorStore] Worker blocked by security policy, using sync fallback'
                    );
                } else {
                    console.warn(
                        '[VectorStore] Failed to initialize worker, using sync fallback:',
                        e.message
                    );
                }

                workerInitPromise = null;
                initStartTime = 0;
                resolve(null);
            }
        });

        return workerInitPromise;
    }

    /**
     * Synchronous worker getter for backward compatibility
     *
     * @returns {Worker|null} The worker if already initialized, null otherwise
     */
    function getWorkerSync() {
        return workerReady ? searchWorker : null;
    }

    /**
     * Perform async search using worker
     *
     * @param {Object} params - Search parameters
     * @param {number[]} params.queryVector - Query vector
     * @param {Map} params.vectors - Vectors to search
     * @param {number} params.limit - Max results
     * @param {number} params.threshold - Min similarity score
     * @param {Function} params.buildSharedData - Function to build shared memory data
     * @returns {Promise<Array>} Search results
     */
    async function searchAsync({ queryVector, vectors, limit, threshold, buildSharedData }) {
        // Validate query vector
        if (!queryVector || queryVector.length === 0) {
            console.warn('[VectorStore] Query vector is empty');
            return [];
        }

        // Validate we have vectors to search
        if (!vectors || vectors.size === 0) {
            console.warn('[VectorStore] No vectors available to search');
            return [];
        }

        // Try to use worker for non-blocking search
        const worker = await initWorkerAsync();

        if (!worker) {
            // Fallback to sync search
            console.log('[VectorStore] Worker unavailable, using sync search');
            return searchFallback(queryVector, limit, threshold);
        }

        // Convert Map to Array for worker transfer
        const vectorArray = Array.from(vectors.values());

        // For small vector sets, use sync search (worker overhead not worth it)
        if (vectorArray.length < SMALL_VECTOR_THRESHOLD) {
            return searchFallback(queryVector, limit, threshold);
        }

        const requestId = generateRequestId();

        return new Promise((resolve, reject) => {
            // Timeout for worker response
            const timeout = setTimeout(() => {
                pendingSearches.delete(requestId);
                console.warn('[VectorStore] Worker timeout, falling back to sync search');
                resolve(searchFallback(queryVector, limit, threshold));
            }, WORKER_TIMEOUT_MS);

            pendingSearches.set(requestId, {
                resolve: results => {
                    clearTimeout(timeout);
                    resolve(results);
                },
                reject: error => {
                    clearTimeout(timeout);
                    // Fallback to sync on worker error
                    console.warn('[VectorStore] Worker failed, falling back to sync:', error);
                    resolve(searchFallback(queryVector, limit, threshold));
                },
            });

            // Try SharedArrayBuffer first for zero-copy transfer
            const sharedData = buildSharedData();
            if (sharedData) {
                worker.postMessage({
                    type: 'search_shared',
                    id: requestId,
                    queryVector,
                    sharedVectors: sharedData.sharedVectors,
                    payloads: sharedData.payloads,
                    dimensions: sharedData.dimensions,
                    limit,
                    threshold,
                });
                return;
            }

            // Fallback to standard structured clone transfer
            worker.postMessage({
                type: 'search',
                id: requestId,
                queryVector,
                vectors: vectorArray,
                limit,
                threshold,
            });
        });
    }

    /**
     * Check if worker is ready
     *
     * @returns {boolean} True if worker is initialized and ready
     */
    function isWorkerReady() {
        return workerReady;
    }

    return {
        initWorkerAsync,
        getWorkerSync,
        searchAsync,
        isWorkerReady,
        generateRequestId,
        get pendingSearches() {
            return pendingSearches;
        },
    };
}
