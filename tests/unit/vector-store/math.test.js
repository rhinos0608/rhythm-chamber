/**
 * Unit Tests for Vector Math Operations
 *
 * @module vector-store/math
 */

import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '../../../js/vector-store/math.js';

describe('Vector Math - Cosine Similarity', () => {
    describe('Basic Functionality', () => {
        it('should return 1 for identical vectors', () => {
            const a = [1, 2, 3];
            const b = [1, 2, 3];
            expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
        });

        it('should return -1 for opposite vectors', () => {
            const a = [1, 2, 3];
            const b = [-1, -2, -3];
            expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
        });

        it('should return 0 for orthogonal vectors', () => {
            const a = [1, 0, 0];
            const b = [0, 1, 0];
            expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
        });

        it('should handle different dimension vectors', () => {
            const a = [1, 2, 3];
            const b = [1, 2];
            expect(cosineSimilarity(a, b)).toBe(0);
        });

        it('should handle empty vectors', () => {
            expect(cosineSimilarity([], [])).toBe(0);
        });

        it('should handle null vectors', () => {
            expect(cosineSimilarity(null, [1, 2, 3])).toBe(0);
            expect(cosineSimilarity([1, 2, 3], null)).toBe(0);
            expect(cosineSimilarity(null, null)).toBe(0);
        });

        it('should handle undefined vectors', () => {
            expect(cosineSimilarity(undefined, [1, 2, 3])).toBe(0);
            expect(cosineSimilarity([1, 2, 3], undefined)).toBe(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle zero vectors', () => {
            const a = [0, 0, 0];
            const b = [1, 2, 3];
            expect(cosineSimilarity(a, b)).toBe(0);
        });

        it('should handle vectors with negative values', () => {
            const a = [1, -2, 3];
            const b = [-1, 2, -3];
            expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
        });

        it('should handle single dimension vectors', () => {
            const a = [5];
            const b = [10];
            expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
        });

        it('should handle large vectors', () => {
            const a = Array.from({ length: 1000 }, () => Math.random());
            const b = Array.from({ length: 1000 }, () => Math.random());
            const result = cosineSimilarity(a, b);
            expect(result).toBeGreaterThanOrEqual(-1);
            expect(result).toBeLessThanOrEqual(1);
        });

        it('should handle vectors with NaN values', () => {
            const a = [1, 2, NaN];
            const b = [1, 2, 3];
            const result = cosineSimilarity(a, b);
            expect(result).toBeNaN();
        });

        it('should handle vectors with Infinity values', () => {
            const a = [1, 2, Infinity];
            const b = [1, 2, 3];
            const result = cosineSimilarity(a, b);
            expect(result).toBeNaN();
        });
    });

    describe('Performance', () => {
        it('should calculate similarity quickly for 384-dim vectors', () => {
            const a = Array.from({ length: 384 }, () => Math.random());
            const b = Array.from({ length: 384 }, () => Math.random());

            const start = performance.now();
            const result = cosineSimilarity(a, b);
            const elapsed = performance.now() - start;

            expect(result).toBeGreaterThanOrEqual(-1);
            expect(result).toBeLessThanOrEqual(1);
            expect(elapsed).toBeLessThan(10); // Should be very fast
        });
    });

    describe('Real-world Examples', () => {
        it('should calculate similarity for embedding-like vectors', () => {
            // Simulated embedding vectors
            const vec1 = [0.1, 0.2, 0.3, 0.4, 0.5];
            const vec2 = [0.2, 0.3, 0.4, 0.5, 0.6];

            const result = cosineSimilarity(vec1, vec2);
            expect(result).toBeGreaterThan(0.9); // Very similar
            expect(result).toBeLessThanOrEqual(1);
        });

        it('should distinguish between different vectors', () => {
            const vec1 = [0.1, 0.2, 0.3, 0.4, 0.5];
            const vec2 = [0.9, 0.8, 0.7, 0.6, 0.5];

            const result = cosineSimilarity(vec1, vec2);
            expect(result).toBeLessThan(0.9); // Less similar
            expect(result).toBeGreaterThan(-1);
        });
    });

    describe('Numerical Precision', () => {
        it('should handle very small values', () => {
            const a = [1e-10, 2e-10, 3e-10];
            const b = [2e-10, 4e-10, 6e-10];
            expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
        });

        it('should handle very large values', () => {
            const a = [1e10, 2e10, 3e10];
            const b = [2e10, 4e10, 6e10];
            expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
        });

        it('should maintain precision across different scales', () => {
            const a = [1, 2, 3];
            const b = [10, 20, 30];
            expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
        });
    });
});
