/**
 * Async Vector Search Wrapper
 *
 * Wrapper around worker manager for async search
 *
 * @module vector-store/search-async
 */

import { DEFAULT_VECTOR_DIMENSIONS } from './config.js';

/**
 * Create async search function
 *
 * @param {Object} workerManager - Worker manager instance
 * @param {Object} vectorsCache - Vectors cache
 * @param {Function} searchSync - Synchronous search function
 * @param {Function} buildSharedData - Function to build shared memory data
 * @returns {Function} Async search function
 */
export function createAsyncSearch(workerManager, vectorsCache, searchSync, buildSharedData) {
    /**
     * Search for similar vectors (asynchronous, Web Worker)
     *
     * @param {number[]} queryVector - The query embedding vector
     * @param {number} limit - Maximum results to return
     * @param {number} threshold - Minimum similarity score (0-1)
     * @returns {Promise<Array<{id, score, payload}>>} Sorted by similarity descending
     */
    return async function searchAsync(queryVector, limit = 5, threshold = 0.5) {
        // Validate query vector
        if (!queryVector || queryVector.length === 0) {
            console.warn('[VectorStore] Query vector is empty');
            return [];
        }

        // Validate vector dimension matches expected
        if (queryVector.length !== DEFAULT_VECTOR_DIMENSIONS) {
            console.warn(`[VectorStore] Query vector has wrong dimensions: ${queryVector.length}, expected ${DEFAULT_VECTOR_DIMENSIONS}. Returning empty results.`);
            return [];
        }

        // Validate we have vectors cache
        if (!vectorsCache || typeof vectorsCache.size === 'undefined') {
            console.warn('[VectorStore] Vectors cache not initialized');
            return [];
        }

        // Validate we have vectors to search
        if (vectorsCache.size === 0) {
            console.warn('[VectorStore] No vectors available to search - embeddings may not have been generated');
            return [];
        }

        // Use worker manager for search
        return workerManager.searchAsync({
            queryVector,
            vectors: vectorsCache,
            limit,
            threshold,
            buildSharedData: () => buildSharedData(vectorsCache)
        });
    };
}
