/**
 * Synchronous Vector Search
 *
 * Main thread vector search operations
 *
 * @module vector-store/search
 */

import { cosineSimilarity } from './math.js';

/**
 * Perform synchronous vector search
 *
 * @param {Object} params - Search parameters
 * @param {number[]} params.queryVector - Query embedding vector
 * @param {Map} params.vectors - Vectors to search
 * @param {number} params.limit - Maximum results to return
 * @param {number} params.threshold - Minimum similarity score (0-1)
 * @returns {Array<{id, score, payload}>} Sorted by similarity descending
 */
export function search({ queryVector, vectors, limit = 5, threshold = 0.5 }) {
    if (!queryVector || queryVector.length === 0) {
        return [];
    }

    // Defensive: handle null vectors gracefully
    if (!vectors) {
        console.warn('[VectorStore] Vectors cache is null, cannot search');
        return [];
    }

    const results = [];

    for (const [id, item] of vectors) {
        const score = cosineSimilarity(queryVector, item.vector);

        if (score >= threshold) {
            results.push({
                id,
                score,
                payload: item.payload,
            });
        }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
}
