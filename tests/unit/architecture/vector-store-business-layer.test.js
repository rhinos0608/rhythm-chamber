/**
 * Vector Store Business Logic Layer Tests
 *
 * Tests the "WHAT" layer - business rules for vector data validation
 * This layer should NOT know about IndexedDB, SharedArrayBuffer, or Workers
 *
 * Layer Responsibilities:
 * - Define what data is valid
 * - Define business rules for vector operations
 * - No implementation details (no IndexedDB, no SharedArrayBuffer references)
 */

import { describe, it, expect } from 'vitest';
import {
    validateVectorDimensions,
    validateVectorConsistency,
    validateVectorElements,
    buildVectorValidationReport
} from '../../../js/architecture/vector-store-business-layer.js';

describe('Vector Store Business Logic Layer', () => {

    describe('validateVectorDimensions', () => {
        it('should accept vectors with expected dimensions', () => {
            const vector = Array(384).fill(0.1);
            const result = validateVectorDimensions(vector, 384);
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should reject empty vectors', () => {
            const result = validateVectorDimensions([], 384);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('vector_empty');
        });

        it('should reject vectors with wrong dimensions', () => {
            const vector = Array(100).fill(0.1);
            const result = validateVectorDimensions(vector, 384);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('dimension_mismatch');
        });

        it('should not reference implementation details', () => {
            // Business layer should not know about IndexedDB, Workers, etc.
            const vector = Array(384).fill(0.1);
            const result = validateVectorDimensions(vector, 384);
            const resultString = JSON.stringify(result);
            expect(resultString).not.toContain('IndexedDB');
            expect(resultString).not.toContain('SharedArrayBuffer');
            expect(resultString).not.toContain('Worker');
        });
    });

    describe('validateVectorConsistency', () => {
        it('should accept consistent vector collection', () => {
            const vectors = [
                { id: '1', vector: Array(384).fill(0.1) },
                { id: '2', vector: Array(384).fill(0.2) },
                { id: '3', vector: Array(384).fill(0.3) }
            ];
            const result = validateVectorConsistency(vectors);
            expect(result.isValid).toBe(true);
            expect(result.dimensions).toBe(384);
        });

        it('should detect dimension mismatch across vectors', () => {
            const vectors = [
                { id: '1', vector: Array(384).fill(0.1) },
                { id: '2', vector: Array(512).fill(0.2) },  // Wrong dimensions
                { id: '3', vector: Array(384).fill(0.3) }
            ];
            const result = validateVectorConsistency(vectors);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('inconsistent_dimensions');
            expect(result.mismatchIds).toContain('2');
        });

        it('should reject vectors missing vector property', () => {
            const vectors = [
                { id: '1', vector: Array(384).fill(0.1) },
                { id: '2', payload: {} }  // Missing vector
            ];
            const result = validateVectorConsistency(vectors);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('missing_vector');
        });
    });

    describe('validateVectorElements', () => {
        it('should accept valid numeric elements', () => {
            const vector = [0.1, -0.5, 1.0, 0];
            const result = validateVectorElements(vector);
            expect(result.isValid).toBe(true);
        });

        it('should reject NaN values', () => {
            const vector = [0.1, NaN, 1.0];
            const result = validateVectorElements(vector);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('contains_nan');
        });

        it('should reject non-numeric values', () => {
            const vector = [0.1, 'string', 1.0];
            const result = validateVectorElements(vector);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('non_numeric');
        });
    });

    describe('buildVectorValidationReport', () => {
        it('should aggregate all validation results', () => {
            const vectors = [
                { id: '1', vector: Array(384).fill(0.1) },
                { id: '2', vector: Array(384).fill(0.2) }
            ];
            const report = buildVectorValidationReport(vectors, 384);

            expect(report.isValid).toBe(true);
            expect(report.vectorCount).toBe(2);
            expect(report.dimensions).toBe(384);
            expect(report.errors).toHaveLength(0);
        });

        it('should collect all errors from failed validations', () => {
            const vectors = [
                { id: '1', vector: [0.1, NaN, 0.3] },
                { id: '2', vector: Array(384).fill(0.2) }
            ];
            const report = buildVectorValidationReport(vectors, 3);

            expect(report.isValid).toBe(false);
            expect(report.errors.length).toBeGreaterThan(0);
        });

        it('should provide summary statistics', () => {
            const vectors = [
                { id: '1', vector: Array(384).fill(0.1) },
                { id: '2', vector: Array(384).fill(0.2) },
                { id: '3', vector: Array(384).fill(0.3) }
            ];
            const report = buildVectorValidationReport(vectors, 384);

            expect(report.vectorCount).toBe(3);
            expect(report.dimensions).toBe(384);
            expect(report.totalElements).toBe(1152); // 3 * 384
        });
    });

    describe('Business Layer Constraints', () => {
        // Business layer should be testable without any infrastructure
        // These tests verify that business logic works in isolation

        it('should validate vectors without requiring IndexedDB', () => {
            // Business validation works with plain arrays - no database needed
            const vector = Array(384).fill(0.1);
            const result = validateVectorDimensions(vector, 384);
            expect(result.isValid).toBe(true);
        });

        it('should validate consistency without requiring SharedArrayBuffer', () => {
            // Business validation works with plain objects - no special memory needed
            const vectors = [
                { id: '1', vector: Array(384).fill(0.1) },
                { id: '2', vector: Array(384).fill(0.2) }
            ];
            const result = validateVectorConsistency(vectors);
            expect(result.isValid).toBe(true);
        });

        it('should provide pure functions with no side effects', () => {
            // All business functions should be pure (no side effects)
            const vector = [0.1, 0.2, 0.3];
            const original = [...vector];

            validateVectorElements(vector);
            validateVectorDimensions(vector, 3);

            // Verify input was not mutated
            expect(vector).toEqual(original);
        });
    });
});
