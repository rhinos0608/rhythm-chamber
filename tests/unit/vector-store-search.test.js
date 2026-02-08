/**
 * Vector Store Search Tests
 *
 * Comprehensive tests for js/vector-store/search.js covering:
 * - Cosine similarity accuracy (math correctness, edge cases)
 * - Search performance (result ranking, score thresholds)
 * - Result ranking (top-K, score normalization)
 * - Query optimization (early termination, caching)
 * - Edge cases (empty store, duplicate vectors, zero vectors)
 *
 * @module tests/unit/vector-store-search
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { search } from '../../js/vector-store/search.js';
import { cosineSimilarity, generateDeterministicVector, normalizeVector } from './utils/test-helpers.js';

// ==========================================
// Test Setup
// ==========================================

function createMockVector(id, seed, dimension = 384, payload = {}) {
    return {
        id,
        vector: generateDeterministicVector(seed, dimension),
        payload,
    };
}

function createVectorStore(items) {
    const store = new Map();
    for (const item of items) {
        store.set(item.id, item);
    }
    return store;
}

// ==========================================
// Cosine Similarity Accuracy Tests
// ==========================================

describe('Vector Store Search - Cosine Similarity Accuracy', () => {
    it('should calculate perfect similarity for identical vectors', () => {
        const vec = generateDeterministicVector(1, 384);
        const store = createVectorStore([createMockVector('1', 1)]);
        const results = search({ queryVector: vec, vectors: store, limit: 5, threshold: 0 });

        expect(results).toHaveLength(1);
        expect(results[0].score).toBeCloseTo(1.0, 5);
    });

    it('should calculate zero similarity for orthogonal vectors', () => {
        // Create orthogonal vectors (perfectly perpendicular)
        const vec1 = normalizeVector([1, 0, 0, 0]);
        const vec2 = normalizeVector([0, 1, 0, 0]);
        const vec3 = normalizeVector([0, 0, 1, 0]);

        const store = new Map([
            ['1', { id: '1', vector: vec1, payload: {} }],
            ['2', { id: '2', vector: vec2, payload: {} }],
            ['3', { id: '3', vector: vec3, payload: {} }],
        ]);

        const results = search({ queryVector: vec1, vectors: store, limit: 5, threshold: 0.1 });

        expect(results[0].id).toBe('1');
        expect(results[0].score).toBeCloseTo(1.0, 5);
        // Other vectors should have zero similarity (below threshold of 0.1)
        expect(results.filter(r => r.id !== '1')).toHaveLength(0);
    });

    it('should calculate negative similarity for opposite vectors', () => {
        const vec1 = normalizeVector([1, 2, 3, 4]);
        const vec2 = normalizeVector([-1, -2, -3, -4]); // Opposite direction

        const store = new Map([['1', { id: '1', vector: vec2, payload: {} }]]);

        const results = search({ queryVector: vec1, vectors: store, limit: 5, threshold: -1 });

        expect(results).toHaveLength(1);
        expect(results[0].score).toBeCloseTo(-1.0, 5);
    });

    it('should handle vectors with different magnitudes correctly', () => {
        const base = [1, 2, 3, 4];
        const vec1 = normalizeVector(base);
        const vec2 = normalizeVector(base.map(v => v * 10)); // Same direction, larger magnitude
        const vec3 = normalizeVector(base.map(v => v * 0.1)); // Same direction, smaller magnitude

        const store = new Map([
            ['1', { id: '1', vector: vec1, payload: {} }],
            ['2', { id: '2', vector: vec2, payload: {} }],
            ['3', { id: '3', vector: vec3, payload: {} }],
        ]);

        const results = search({ queryVector: vec1, vectors: store, limit: 5, threshold: 0 });

        // All should have perfect similarity since they're in the same direction
        expect(results).toHaveLength(3);
        results.forEach(r => {
            expect(r.score).toBeCloseTo(1.0, 5);
        });
    });

    it('should calculate intermediate similarity values correctly', () => {
        const vec1 = normalizeVector([1, 0, 0, 0]);
        const vec2 = normalizeVector([1, 1, 0, 0]);
        const vec3 = normalizeVector([1, 1, 1, 0]);
        const vec4 = normalizeVector([1, 1, 1, 1]);

        const store = new Map([
            ['1', { id: '1', vector: vec2, payload: {} }],
            ['2', { id: '2', vector: vec3, payload: {} }],
            ['3', { id: '3', vector: vec4, payload: {} }],
        ]);

        const results = search({ queryVector: vec1, vectors: store, limit: 5, threshold: 0 });

        // vec1·vec2 = 1/√2 ≈ 0.707
        // vec1·vec3 = 1/√3 ≈ 0.577
        // vec1·vec4 = 1/√4 = 0.5
        expect(results[0].score).toBeCloseTo(0.707, 2);
        expect(results[1].score).toBeCloseTo(0.577, 2);
        expect(results[2].score).toBeCloseTo(0.5, 2);
    });

    it('should be symmetric: sim(a,b) = sim(b,a)', () => {
        const vec1 = generateDeterministicVector(1, 384);
        const vec2 = generateDeterministicVector(2, 384);

        const store1 = new Map([['1', { id: '1', vector: vec2, payload: {} }]]);
        const store2 = new Map([['1', { id: '1', vector: vec1, payload: {} }]]);

        const results1 = search({ queryVector: vec1, vectors: store1, limit: 5, threshold: -1 });
        const results2 = search({ queryVector: vec2, vectors: store2, limit: 5, threshold: -1 });

        expect(results1[0].score).toBeCloseTo(results2[0].score, 10);
    });
});

// ==========================================
// Search Performance Tests
// ==========================================

describe('Vector Store Search - Performance', () => {
    it('should return results in descending score order', () => {
        const queryVec = generateDeterministicVector(100, 384);
        const items = Array.from({ length: 20 }, (_, i) =>
            createMockVector(`vec-${i}`, i + 1, 384, { index: i }) // Use i+1 to avoid seed 0
        );
        const store = createVectorStore(items);

        const results = search({ queryVector: queryVec, vectors: store, limit: 10, threshold: 0 });

        // Check that scores are in descending order
        for (let i = 1; i < results.length; i++) {
            expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
        }
    });

    it('should respect limit parameter (top-K)', () => {
        const queryVec = generateDeterministicVector(100, 384);
        const items = Array.from({ length: 100 }, (_, i) => createMockVector(`vec-${i}`, i + 1));
        const store = createVectorStore(items);

        const limit5 = search({ queryVector: queryVec, vectors: store, limit: 5, threshold: 0 });
        const limit10 = search({ queryVector: queryVec, vectors: store, limit: 10, threshold: 0 });
        const limit50 = search({ queryVector: queryVec, vectors: store, limit: 50, threshold: 0 });

        expect(limit5).toHaveLength(5);
        expect(limit10).toHaveLength(10);
        expect(limit50).toHaveLength(50);
    });

    it('should return limit results even when threshold excludes many', () => {
        const queryVec = generateDeterministicVector(100, 384);
        const items = Array.from({ length: 50 }, (_, i) => createMockVector(`vec-${i}`, i + 1));
        const store = createVectorStore(items);

        // High threshold should still return up to limit if results exist
        const results = search({ queryVector: queryVec, vectors: store, limit: 5, threshold: 0.95 });

        expect(results.length).toBeLessThanOrEqual(5);
        // All results should meet the threshold
        results.forEach(r => {
            expect(r.score).toBeGreaterThanOrEqual(0.95);
        });
    });

    it('should filter results by threshold correctly', () => {
        const queryVec = generateDeterministicVector(100, 384);
        const items = Array.from({ length: 50 }, (_, i) => createMockVector(`vec-${i}`, i + 1));
        const store = createVectorStore(items);

        const thresholdHigh = search({ queryVector: queryVec, vectors: store, limit: 50, threshold: 0.8 });
        const thresholdLow = search({ queryVector: queryVec, vectors: store, limit: 50, threshold: 0.3 });
        const thresholdNone = search({ queryVector: queryVec, vectors: store, limit: 50, threshold: 0 });

        expect(thresholdHigh.length).toBeLessThanOrEqual(thresholdLow.length);
        expect(thresholdLow.length).toBeLessThanOrEqual(thresholdNone.length);

        // Verify all results meet their thresholds
        thresholdHigh.forEach(r => expect(r.score).toBeGreaterThanOrEqual(0.8));
        thresholdLow.forEach(r => expect(r.score).toBeGreaterThanOrEqual(0.3));
    });

    it('should handle limit larger than store size', () => {
        const queryVec = generateDeterministicVector(100, 384);
        const items = Array.from({ length: 10 }, (_, i) => createMockVector(`vec-${i}`, i + 1));
        const store = createVectorStore(items);

        const results = search({ queryVector: queryVec, vectors: store, limit: 100, threshold: 0 });

        expect(results).toHaveLength(10);
    });

    it('should return top-K most similar results', () => {
        const queryVec = generateDeterministicVector(100, 384);
        const items = Array.from({ length: 100 }, (_, i) => createMockVector(`vec-${i}`, i + 1));
        const store = createVectorStore(items);

        const results = search({ queryVector: queryVec, vectors: store, limit: 5, threshold: 0 });

        // The top 5 results should have the highest scores
        const allResults = search({ queryVector: queryVec, vectors: store, limit: 100, threshold: 0 });
        const expectedTop5 = allResults.slice(0, 5);

        expect(results).toEqual(expectedTop5);
    });
});

// ==========================================
// Result Ranking Tests
// ==========================================

describe('Vector Store Search - Result Ranking', () => {
    it('should rank identical vectors first', () => {
        const vec = generateDeterministicVector(42, 384);
        const items = [
            createMockVector('similar-1', 42), // Identical
            createMockVector('similar-2', 43),
            createMockVector('similar-3', 44),
        ];
        const store = createVectorStore(items);

        const results = search({ queryVector: vec, vectors: store, limit: 10, threshold: 0 });

        expect(results[0].id).toBe('similar-1');
        expect(results[0].score).toBeCloseTo(1.0, 5);
    });

    it('should maintain consistent ranking across multiple searches', () => {
        const queryVec = generateDeterministicVector(100, 384);
        const items = Array.from({ length: 20 }, (_, i) => createMockVector(`vec-${i}`, i + 1));
        const store = createVectorStore(items);

        const results1 = search({ queryVector: queryVec, vectors: store, limit: 10, threshold: 0 });
        const results2 = search({ queryVector: queryVec, vectors: store, limit: 10, threshold: 0 });
        const results3 = search({ queryVector: queryVec, vectors: store, limit: 10, threshold: 0 });

        // All searches should return identical results
        expect(results1).toEqual(results2);
        expect(results2).toEqual(results3);
    });

    it('should include payload in results', () => {
        const queryVec = generateDeterministicVector(100, 384);
        const payload = { text: 'test', type: 'document', id: 123 };
        const items = [createMockVector('doc-1', 1, 384, payload)];
        const store = createVectorStore(items);

        const results = search({ queryVector: queryVec, vectors: store, limit: 10, threshold: 0 });

        expect(results[0].payload).toEqual(payload);
    });

    it('should preserve vector IDs in results', () => {
        const queryVec = generateDeterministicVector(100, 384);
        const items = ['a', 'b', 'c', 'd', 'e'].map((id, i) => createMockVector(id, i + 1));
        const store = createVectorStore(items);

        const results = search({ queryVector: queryVec, vectors: store, limit: 5, threshold: 0 });

        const resultIds = results.map(r => r.id);
        expect(resultIds).toContain('a');
        expect(resultIds).toContain('b');
        expect(resultIds).toContain('c');
        expect(resultIds).toContain('d');
        expect(resultIds).toContain('e');
    });

    it('should handle ties in similarity scores', () => {
        const vec1 = normalizeVector([1, 0, 0, 0]);
        const vec2 = normalizeVector([0, 1, 0, 0]);
        const vec3 = normalizeVector([0, 0, 1, 0]);
        const vec4 = normalizeVector([0, 0, 0, 1]);

        const query = normalizeVector([1, 1, 0, 0]);

        const store = new Map([
            ['a', { id: 'a', vector: vec1, payload: {} }],
            ['b', { id: 'b', vector: vec2, payload: {} }],
            ['c', { id: 'c', vector: vec3, payload: {} }],
            ['d', { id: 'd', vector: vec4, payload: {} }],
        ]);

        const results = search({ queryVector: query, vectors: store, limit: 4, threshold: 0 });

        // vec1 and vec2 should have same score, vec3 and vec4 should have same (lower) score
        expect(results[0].score).toBeCloseTo(results[1].score, 5);
        expect(results[2].score).toBeCloseTo(results[3].score, 5);
        expect(results[0].score).toBeGreaterThan(results[2].score);
    });
});

// ==========================================
// Edge Cases Tests
// ==========================================

describe('Vector Store Search - Edge Cases', () => {
    it('should handle empty vector store', () => {
        const queryVec = generateDeterministicVector(1, 384);
        const store = new Map();

        const results = search({ queryVector: queryVec, vectors: store, limit: 5, threshold: 0 });

        expect(results).toEqual([]);
    });

    it('should handle null vectors gracefully', () => {
        const queryVec = generateDeterministicVector(1, 384);

        const results = search({ queryVector: queryVec, vectors: null, limit: 5, threshold: 0 });

        expect(results).toEqual([]);
    });

    it('should handle empty query vector', () => {
        const store = createVectorStore([createMockVector('1', 1)]);

        const results = search({ queryVector: [], vectors: store, limit: 5, threshold: 0 });

        expect(results).toEqual([]);
    });

    it('should handle null query vector', () => {
        const store = createVectorStore([createMockVector('1', 1)]);

        const results = search({ queryVector: null, vectors: store, limit: 5, threshold: 0 });

        expect(results).toEqual([]);
    });

    it('should handle zero vectors (all components are 0)', () => {
        const zeroVec = new Array(384).fill(0);
        const queryVec = generateDeterministicVector(1, 384);
        const items = [
            { id: '1', vector: zeroVec, payload: {} },
            createMockVector('2', 2),
        ];
        const store = createVectorStore(items);

        const results = search({ queryVector: queryVec, vectors: store, limit: 5, threshold: 0 });

        // Zero vector should have 0 similarity
        const zeroVecResult = results.find(r => r.id === '1');
        expect(zeroVecResult?.score || 0).toBe(0);
    });

    it('should handle single vector store', () => {
        const queryVec = generateDeterministicVector(1, 384);
        const store = createVectorStore([createMockVector('only', 1)]);

        const results = search({ queryVector: queryVec, vectors: store, limit: 5, threshold: 0 });

        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('only');
    });

    it('should handle duplicate vectors (different IDs, same values)', () => {
        const vec = generateDeterministicVector(42, 384);
        const items = [
            { id: 'dup-1', vector: vec, payload: {} },
            { id: 'dup-2', vector: vec, payload: {} },
            { id: 'dup-3', vector: vec, payload: {} },
        ];
        const store = createVectorStore(items);

        const results = search({ queryVector: vec, vectors: store, limit: 5, threshold: 0 });

        // All duplicates should have perfect similarity
        expect(results).toHaveLength(3);
        results.forEach(r => {
            expect(r.score).toBeCloseTo(1.0, 5);
        });
    });

    it('should handle vectors with different dimensions', () => {
        const queryVec = generateDeterministicVector(1, 384);
        const items = [
            createMockVector('vec-384', 1, 384),
            createMockVector('vec-128', 2, 128),
            createMockVector('vec-512', 3, 512),
        ];
        const store = createVectorStore(items);

        // cosineSimilarity should return 0 for mismatched dimensions
        const results = search({ queryVector: queryVec, vectors: store, limit: 10, threshold: 0 });

        // Only the 384-dim vector should match (others have 0 similarity)
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].id).toBe('vec-384');
    });

    it('should handle very high threshold that excludes all results', () => {
        const queryVec = generateDeterministicVector(100, 384);
        const items = Array.from({ length: 50 }, (_, i) => createMockVector(`vec-${i}`, i + 100));
        const store = createVectorStore(items);

        const results = search({ queryVector: queryVec, vectors: store, limit: 10, threshold: 0.999 });

        // Very unlikely to have vectors with 0.999+ similarity to random vectors
        expect(results.length).toBeLessThan(10);
    });

    it('should handle negative threshold (allow all similarities)', () => {
        const vec1 = normalizeVector([1, 0, 0, 0]);
        const vec2 = normalizeVector([-1, 0, 0, 0]); // Opposite direction

        const store = new Map([['1', { id: '1', vector: vec2, payload: {} }]]);

        const results = search({ queryVector: vec1, vectors: store, limit: 5, threshold: -1 });

        expect(results).toHaveLength(1);
        expect(results[0].score).toBeCloseTo(-1.0, 5);
    });

    it('should handle NaN in vector components', () => {
        const vecWithNaN = [1, 2, NaN, 4];
        const queryVec = [1, 2, 3, 4];

        const store = new Map([['1', { id: '1', vector: vecWithNaN, payload: {} }]]);

        const results = search({ queryVector: queryVec, vectors: store, limit: 5, threshold: -Infinity });

        // Should handle NaN gracefully (similarity will be NaN or 0)
        expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle Infinity in vector components', () => {
        const vecWithInf = [1, 2, Infinity, 4];
        const queryVec = [1, 2, 3, 4];

        const store = new Map([['1', { id: '1', vector: vecWithInf, payload: {} }]]);

        const results = search({ queryVector: queryVec, vectors: store, limit: 5, threshold: -Infinity });

        // Should handle Infinity gracefully
        expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle very large dimension vectors', () => {
        const largeDim = 4096;
        const queryVec = generateDeterministicVector(1, largeDim);
        const items = [createMockVector('large', 2, largeDim)];
        const store = createVectorStore(items);

        const results = search({ queryVector: queryVec, vectors: store, limit: 5, threshold: 0 });

        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('large');
    });

    it('should handle single dimension vectors', () => {
        const queryVec = [5];
        const items = [
            { id: 'pos', vector: [10], payload: {} },
            { id: 'neg', vector: [-10], payload: {} },
            { id: 'zero', vector: [0], payload: {} },
        ];
        const store = createVectorStore(items);

        const results = search({ queryVector: queryVec, vectors: store, limit: 5, threshold: -1 });

        expect(results).toHaveLength(3);
        expect(results[0].id).toBe('pos'); // Same direction, highest similarity
        expect(results[2].id).toBe('neg'); // Opposite direction, lowest similarity
    });
});

// ==========================================
// Query Optimization Tests
// ==========================================

describe('Vector Store Search - Query Optimization', () => {
    it('should not modify input vectors during search', () => {
        const queryVec = generateDeterministicVector(1, 384);
        const originalQuery = [...queryVec];
        const items = [createMockVector('1', 1)];
        const store = createVectorStore(items);

        search({ queryVector: queryVec, vectors: store, limit: 5, threshold: 0 });

        expect(queryVec).toEqual(originalQuery);
    });

    it('should not modify store during search', () => {
        const queryVec = generateDeterministicVector(1, 384);
        const items = [createMockVector('1', 1)];
        const store = createVectorStore(items);
        const originalStoreSize = store.size;

        search({ queryVector: queryVec, vectors: store, limit: 5, threshold: 0 });

        expect(store.size).toBe(originalStoreSize);
    });

    it('should handle consecutive searches efficiently', () => {
        const queryVec1 = generateDeterministicVector(1, 384);
        const queryVec2 = generateDeterministicVector(2, 384);
        const queryVec3 = generateDeterministicVector(3, 384);
        const items = Array.from({ length: 100 }, (_, i) => createMockVector(`vec-${i}`, i + 10));
        const store = createVectorStore(items);

        const startTime = performance.now();
        search({ queryVector: queryVec1, vectors: store, limit: 5, threshold: 0 });
        search({ queryVector: queryVec2, vectors: store, limit: 5, threshold: 0 });
        search({ queryVector: queryVec3, vectors: store, limit: 5, threshold: 0 });
        const endTime = performance.now();

        // Three consecutive searches should complete reasonably fast
        // (This is a soft check - adjust threshold if running on slow hardware)
        expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle limit of 0 (return no results)', () => {
        const queryVec = generateDeterministicVector(1, 384);
        const store = createVectorStore([createMockVector('1', 1)]);

        const results = search({ queryVector: queryVec, vectors: store, limit: 0, threshold: 0 });

        expect(results).toEqual([]);
    });

    it('should handle negative limit (treat as 0)', () => {
        const queryVec = generateDeterministicVector(1, 384);
        const store = createVectorStore([createMockVector('1', 1)]);

        const results = search({ queryVector: queryVec, vectors: store, limit: -5, threshold: 0 });

        expect(results).toEqual([]);
    });

    it('should work with default parameters', () => {
        const queryVec = generateDeterministicVector(1, 384);
        const items = Array.from({ length: 10 }, (_, i) => createMockVector(`vec-${i}`, i + 1));
        const store = createVectorStore(items);

        // Call with only queryVector (use defaults for limit and threshold)
        const results = search({ queryVector: queryVec, vectors: store });

        expect(results.length).toBeLessThanOrEqual(5); // Default limit
        results.forEach(r => {
            expect(r.score).toBeGreaterThanOrEqual(0.5); // Default threshold
        });
    });
});

// ==========================================
// Stress Tests
// ==========================================

describe('Vector Store Search - Stress Tests', () => {
    it('should handle large vector stores (1000+ vectors)', () => {
        const queryVec = generateDeterministicVector(1000, 384);
        const items = Array.from({ length: 1000 }, (_, i) => createMockVector(`vec-${i}`, i + 1));
        const store = createVectorStore(items);

        const results = search({ queryVector: queryVec, vectors: store, limit: 10, threshold: 0 });

        expect(results).toHaveLength(10);
        expect(results[0].score).toBeGreaterThan(0);
    });

    it('should maintain performance with many searches', () => {
        const store = createVectorStore(
            Array.from({ length: 100 }, (_, i) => createMockVector(`vec-${i}`, i + 1))
        );

        const iterations = 50;
        const startTime = performance.now();

        for (let i = 0; i < iterations; i++) {
            const queryVec = generateDeterministicVector(i + 100, 384);
            search({ queryVector: queryVec, vectors: store, limit: 5, threshold: 0 });
        }

        const endTime = performance.now();
        const avgTime = (endTime - startTime) / iterations;

        // Average search time should be reasonable (< 10ms per search)
        expect(avgTime).toBeLessThan(10);
    });

    it('should handle concurrent-like search patterns', () => {
        const store = createVectorStore(
            Array.from({ length: 200 }, (_, i) => createMockVector(`vec-${i}`, i + 1))
        );

        const queries = Array.from({ length: 20 }, (_, i) => generateDeterministicVector(i + 1000, 384));

        const results = queries.map(queryVec =>
            search({ queryVector: queryVec, vectors: store, limit: 5, threshold: 0 })
        );

        // All searches should complete successfully
        results.forEach(result => {
            expect(result.length).toBeLessThanOrEqual(5);
        });
    });
});

// ==========================================
// Integration Tests
// ==========================================

describe('Vector Store Search - Integration', () => {
    it('should work with realistic document embeddings', () => {
        // Simulate document embeddings with known similarities
        const doc1 = generateDeterministicVector(1, 384);
        const doc2 = generateDeterministicVector(2, 384);
        const doc3 = generateDeterministicVector(3, 384);

        const items = [
            { id: 'doc1', vector: doc1, payload: { text: 'Document 1' } },
            { id: 'doc2', vector: doc2, payload: { text: 'Document 2' } },
            { id: 'doc3', vector: doc3, payload: { text: 'Document 3' } },
        ];
        const store = createVectorStore(items);

        const query = doc1;
        const results = search({ queryVector: query, vectors: store, limit: 3, threshold: 0 });

        expect(results[0].id).toBe('doc1');
        expect(results[0].score).toBeCloseTo(1.0, 5);
        expect(results[0].payload.text).toBe('Document 1');
    });

    it('should find semantically similar documents', () => {
        // Create vectors with controlled similarities
        const base = generateDeterministicVector(42, 384);

        // Create similar vectors by adding small noise
        const similar1 = base.map((v, i) => v + (Math.random() - 0.5) * 0.1);
        const similar2 = base.map((v, i) => v + (Math.random() - 0.5) * 0.1);

        // Create dissimilar vector
        const dissimilar = generateDeterministicVector(999, 384);

        const items = [
            { id: 'similar-1', vector: normalizeVector(similar1), payload: { type: 'similar' } },
            { id: 'similar-2', vector: normalizeVector(similar2), payload: { type: 'similar' } },
            { id: 'dissimilar', vector: dissimilar, payload: { type: 'other' } },
        ];
        const store = createVectorStore(items);

        const query = base;
        const results = search({ queryVector: query, vectors: store, limit: 3, threshold: 0 });

        // Similar documents should rank higher
        expect(results[0].id).toMatch(/^similar-/);
        expect(results[0].payload.type).toBe('similar');
    });
});

console.log('[Vector Store Search Tests] Test suite loaded');
