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
 * 
 * HNW Considerations:
 * - Hierarchy: Worker is subordinate to LocalVectorStore
 * - Network: Isolated from main thread storage operations
 * - Wave: Async search maintains UI responsiveness
 * 
 * Message Interface:
 * - Input: { type: 'search', id: string, queryVector: number[], vectors: Array, limit: number, threshold: number }
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
                payload: item.payload
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

        case 'ping':
            // Health check
            self.postMessage({ type: 'pong', id });
            break;

        default:
            self.postMessage({
                type: 'error',
                id: id || 'unknown',
                message: `Unknown command type: ${type}`
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
                elapsedMs: Math.round(elapsed * 100) / 100
            }
        });
    } catch (error) {
        self.postMessage({
            type: 'error',
            id,
            message: error.message || 'Search failed'
        });
    }
}

// ==========================================
// Worker Initialization
// ==========================================

console.log('[VectorSearchWorker] Worker initialized and ready for search commands');
