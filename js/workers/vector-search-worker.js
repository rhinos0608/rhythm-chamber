/**
 * Vector Search Worker for Rhythm Chamber
 *
 * Offloads cosine similarity computations from the main UI thread
 * to prevent jank during RAG queries with large vector sets.
 *
 * DESIGN:
 * - Uses Command Pattern for clean interface
 * - Handles 100k+ vectors without blocking UI
 * - Maintains 60fps during search operations
 * - Supports SharedArrayBuffer for zero-copy vector transfer
 *
 * HNW Considerations:
 * - Hierarchy: Worker is subordinate to LocalVectorStore
 * - Network: Isolated from main thread storage operations
 * - Wave: Async search maintains UI responsiveness
 *
 * Message Interface:
 * - Input: { type: 'search', id: string, queryVector: number[], vectors: Array, limit: number, threshold: number }
 * - Input: { type: 'search_shared', id: string, queryVector: number[], sharedVectors: SharedArrayBuffer, payloads: Array, dimensions: number, limit: number, threshold: number }
 * - Output: { type: 'results', id: string, results: Array<{id, score, payload}> }
 * - Output: { type: 'error', id: string, message: string }
 *
 * @module VectorSearchWorker
 */

'use strict';

// ==========================================
// Vector Math (Cosine Similarity)
// ==========================================

/**
 * Compute cosine similarity between two vectors
 * Optimized for performance with large vector sets
 *
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Similarity score between -1 and 1
 */
function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) {
        return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    const len = a.length;

    // Single loop for better performance
    for (let i = 0; i < len; i++) {
        const ai = a[i];
        const bi = b[i];
        dotProduct += ai * bi;
        normA += ai * ai;
        normB += bi * bi;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
}

/**
 * Perform brute-force search across all vectors
 *
 * @param {number[]} queryVector - The query embedding vector
 * @param {Array<{id, vector, payload}>} vectors - Array of stored vectors
 * @param {number} limit - Maximum results to return
 * @param {number} threshold - Minimum similarity score (0-1)
 * @returns {Array<{id, score, payload}>} Sorted by similarity descending
 */
function searchVectors(queryVector, vectors, limit, threshold) {
    if (!queryVector || queryVector.length === 0 || !vectors || vectors.length === 0) {
        return [];
    }

    const results = [];

    for (let i = 0; i < vectors.length; i++) {
        const item = vectors[i];
        const score = cosineSimilarity(queryVector, item.vector);

        if (score >= threshold) {
            results.push({
                id: item.id,
                score,
                payload: item.payload,
            });
        }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
}

/**
 * Perform search using SharedArrayBuffer for zero-copy performance
 *
 * @param {number[]} queryVector - The query embedding vector
 * @param {SharedArrayBuffer} sharedVectors - Shared memory buffer containing vectors
 * @param {Array} payloads - Array of payloads corresponding to vectors
 * @param {number} dimensions - Vector dimension count
 * @param {number} limit - Maximum results to return
 * @param {number} threshold - Minimum similarity score (0-1)
 * @returns {Array<{id, score, payload}>} Sorted by similarity descending
 */
function searchVectorsShared(queryVector, sharedVectors, payloads, dimensions, limit, threshold) {
    if (
        !queryVector ||
        queryVector.length === 0 ||
        !sharedVectors ||
        !payloads ||
        payloads.length === 0
    ) {
        return [];
    }

    // Validate dimensions parameter
    if (typeof dimensions !== 'number' || !Number.isInteger(dimensions) || dimensions <= 0) {
        throw new Error(`Invalid dimensions: ${dimensions}. Must be a positive integer.`);
    }

    // Validate query vector dimension consistency
    if (queryVector.length !== dimensions) {
        throw new Error(
            `Query vector dimension mismatch. Expected ${dimensions}, got ${queryVector.length}`
        );
    }

    // Validate query vector content
    for (let i = 0; i < queryVector.length; i++) {
        if (!Number.isFinite(queryVector[i])) {
            throw new Error(`Query vector contains invalid value at index ${i}: ${queryVector[i]}`);
        }
    }

    // Validate SharedArrayBuffer type
    if (!(sharedVectors instanceof SharedArrayBuffer)) {
        throw new Error('sharedVectors must be a SharedArrayBuffer');
    }

    // Validate buffer size matches expected dimensions
    const expectedLen = payloads.length * dimensions;
    const vectorArray = new Float32Array(sharedVectors);
    if (vectorArray.length < expectedLen) {
        throw new Error(
            `Shared buffer too small. Expected ${expectedLen} floats, got ${vectorArray.length}`
        );
    }

    const vectorCount = payloads.length;
    const results = [];

    // Iterate through vectors in shared memory
    for (let i = 0; i < vectorCount; i++) {
        const offset = i * dimensions;

        // Bounds check before subarray operation
        if (offset + dimensions > vectorArray.length) {
            throw new Error(
                `Buffer overflow prevented at vector index ${i}. Offset: ${offset + dimensions}, Buffer length: ${vectorArray.length}`
            );
        }

        const vector = vectorArray.subarray(offset, offset + dimensions);

        const score = cosineSimilarity(queryVector, vector);

        if (score >= threshold) {
            results.push({
                id: payloads[i].id,
                score,
                payload: payloads[i].payload,
            });
        }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
}

// ==========================================
// Command Handler
// ==========================================

/**
 * Handle incoming messages from main thread
 * Uses Command Pattern for extensibility
 */
self.onmessage = function (event) {
    const { type, id, ...params } = event.data;

    switch (type) {
        case 'search':
            handleSearch(id, params);
            break;

        case 'search_shared':
            handleSearchShared(id, params);
            break;

        case 'ping':
            // Health check
            self.postMessage({ type: 'pong', id });
            break;

        default:
            self.postMessage({
                type: 'error',
                id: id || 'unknown',
                message: `Unknown command type: ${type}`,
            });
    }
};

/**
 * Handle search command
 *
 * @param {string} id - Request ID for correlation
 * @param {Object} params - Search parameters
 * @param {number[]} params.queryVector - Query embedding
 * @param {Array} params.vectors - Vectors to search
 * @param {number} params.limit - Max results
 * @param {number} params.threshold - Min score
 */
function handleSearch(id, { queryVector, vectors, limit = 5, threshold = 0.5 }) {
    try {
        const startTime = performance.now();

        const results = searchVectors(queryVector, vectors, limit, threshold);

        const elapsed = performance.now() - startTime;

        self.postMessage({
            type: 'results',
            id,
            results,
            stats: {
                vectorCount: vectors?.length || 0,
                resultCount: results.length,
                elapsedMs: Math.round(elapsed * 100) / 100,
            },
        });
    } catch (error) {
        self.postMessage({
            type: 'error',
            id,
            message: error.message || 'Search failed',
        });
    }
}

/**
 * Handle search_shared command with SharedArrayBuffer
 *
 * @param {string} id - Request ID for correlation
 * @param {Object} params - Search parameters
 * @param {number[]} params.queryVector - Query embedding
 * @param {SharedArrayBuffer} params.sharedVectors - Shared memory buffer
 * @param {Array} params.payloads - Array of payloads
 * @param {number} params.dimensions - Vector dimensions
 * @param {number} params.limit - Max results
 * @param {number} params.threshold - Min score
 */
function handleSearchShared(
    id,
    { queryVector, sharedVectors, payloads, dimensions, limit = 5, threshold = 0.5 }
) {
    try {
        // Validate parameters before calling searchVectorsShared
        if (!queryVector || !Array.isArray(queryVector)) {
            throw new Error('queryVector must be a non-empty array');
        }

        if (!(sharedVectors instanceof SharedArrayBuffer)) {
            throw new Error('sharedVectors must be a SharedArrayBuffer');
        }

        if (!payloads || !Array.isArray(payloads) || payloads.length === 0) {
            throw new Error('payloads must be a non-empty array');
        }

        if (typeof dimensions !== 'number' || dimensions <= 0 || !Number.isInteger(dimensions)) {
            throw new Error(`Invalid dimensions: ${dimensions}. Must be a positive integer.`);
        }

        // Validate query vector dimension consistency
        if (queryVector.length !== dimensions) {
            throw new Error(
                `Query vector dimension mismatch. Expected ${dimensions}, got ${queryVector.length}`
            );
        }

        // Validate limit and threshold ranges
        if (typeof limit !== 'number' || limit <= 0) {
            throw new Error(`Invalid limit: ${limit}. Must be a positive number.`);
        }

        if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
            throw new Error(`Invalid threshold: ${threshold}. Must be between 0 and 1.`);
        }

        // Validate payload structure
        for (let i = 0; i < payloads.length; i++) {
            if (!payloads[i] || typeof payloads[i].id === 'undefined') {
                throw new Error(`Invalid payload at index ${i}. Missing required 'id' field.`);
            }
        }

        const startTime = performance.now();

        const results = searchVectorsShared(
            queryVector,
            sharedVectors,
            payloads,
            dimensions,
            limit,
            threshold
        );

        const elapsed = performance.now() - startTime;

        self.postMessage({
            type: 'results',
            id,
            results,
            stats: {
                vectorCount: payloads?.length || 0,
                resultCount: results.length,
                elapsedMs: Math.round(elapsed * 100) / 100,
                sharedMemory: true,
            },
        });
    } catch (error) {
        self.postMessage({
            type: 'error',
            id,
            message: `Shared search validation failed: ${error.message}`,
        });
    }
}

// ==========================================
// Worker Initialization
// ==========================================

console.log('[VectorSearchWorker] Worker initialized and ready for search commands');
