/**
 * Vector Math Operations
 *
 * Mathematical operations for vector similarity calculations
 *
 * @module vector-store/math
 */

/**
 * Compute cosine similarity between two vectors
 * Optimized for performance with large vector sets
 *
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Similarity score between -1 and 1
 */
export function cosineSimilarity(a, b) {
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
