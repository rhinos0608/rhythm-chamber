/**
 * Vector Store Infrastructure Layer Tests
 *
 * Tests the "HOW TO IMPLEMENT" layer - low-level storage operations
 * This layer handles SharedArrayBuffer construction and IndexedDB interaction.
 *
 * Layer Responsibilities:
 * - Create SharedArrayBuffer for zero-copy transfer
 * - Interact with IndexedDB
 * - Handle low-level data operations
 * - No business logic (validation, filtering)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    createSharedVectorBuffer,
    buildSharedVectorPayload,
    InfrastructureError
} from '../../../js/architecture/vector-store-infrastructure-layer.js';

describe('Vector Store Infrastructure Layer', () => {

    describe('InfrastructureError', () => {
        it('should create error with code and details', () => {
            const error = new InfrastructureError('buffer_allocation_failed', {
                size: 1000,
                reason: 'Out of memory'
            });

            expect(error.code).toBe('buffer_allocation_failed');
            expect(error.details.size).toBe(1000);
            expect(error.details.reason).toBe('Out of memory');
            expect(error.message).toContain('buffer_allocation_failed');
        });

        it('should be instance of Error', () => {
            const error = new InfrastructureError('test_error');
            expect(error).toBeInstanceOf(Error);
        });
    });

    describe('createSharedVectorBuffer', () => {
        it('should create SharedArrayBuffer when available', () => {
            const result = createSharedVectorBuffer(384, 10);

            expect(result.success).toBe(true);
            expect(result.buffer).toBeInstanceOf(SharedArrayBuffer);
            expect(result.byteLength).toBe(384 * 10 * 4); // Float32 = 4 bytes
        });

        it('should return failure when SharedArrayBuffer unavailable', () => {
            // Temporarily hide SharedArrayBuffer
            const original = global.SharedArrayBuffer;
            // @ts-ignore - testing unavailable scenario
            delete global.SharedArrayBuffer;

            const result = createSharedVectorBuffer(384, 10);

            expect(result.success).toBe(false);
            expect(result.error).toBe('shared_array_buffer_unavailable');
            expect(result.buffer).toBeNull();

            // Restore
            global.SharedArrayBuffer = original;
        });

        it('should calculate correct byte size', () => {
            const result = createSharedVectorBuffer(768, 100);

            if (result.success) {
                expect(result.byteLength).toBe(768 * 100 * 4);
            }
        });

        it('should handle zero-sized requests', () => {
            const result = createSharedVectorBuffer(0, 0);

            if (result.success) {
                expect(result.byteLength).toBe(0);
            }
        });
    });

    describe('buildSharedVectorPayload', () => {
        it('should build payload for worker transfer', () => {
            const vectors = [
                { id: '1', vector: Array(384).fill(0.1), payload: { type: 'test' } },
                { id: '2', vector: Array(384).fill(0.2), payload: { type: 'test' } }
            ];

            const result = buildSharedVectorPayload(vectors, 384);

            expect(result.success).toBe(true);
            expect(result.payload.sharedVectors).toBeInstanceOf(SharedArrayBuffer);
            expect(result.payload.payloads).toHaveLength(2);
            expect(result.payload.dimensions).toBe(384);
        });

        it('should include vector IDs in payloads', () => {
            const vectors = [
                { id: 'vec-1', vector: [0.1, 0.2], payload: { data: 'a' } },
                { id: 'vec-2', vector: [0.3, 0.4], payload: { data: 'b' } }
            ];

            const result = buildSharedVectorPayload(vectors, 2);

            if (result.success) {
                expect(result.payload.payloads[0].id).toBe('vec-1');
                expect(result.payload.payloads[1].id).toBe('vec-2');
                expect(result.payload.payloads[0].payload).toEqual({ data: 'a' });
            }
        });

        it('should return failure when SharedArrayBuffer unavailable', () => {
            const original = global.SharedArrayBuffer;
            // @ts-ignore
            delete global.SharedArrayBuffer;

            const vectors = [{ id: '1', vector: [0.1, 0.2], payload: {} }];
            const result = buildSharedVectorPayload(vectors, 2);

            expect(result.success).toBe(false);
            expect(result.error).toBe('shared_array_buffer_unavailable');

            global.SharedArrayBuffer = original;
        });

        it('should handle empty vector array', () => {
            const result = buildSharedVectorPayload([], 384);

            expect(result.success).toBe(false);
            expect(result.error).toBe('no_vectors');
        });
    });

    describe('Infrastructure Layer Constraints', () => {
        it('should not contain business logic for validation', () => {
            // Infrastructure layer should NOT validate vector business rules
            // It should accept data that was already validated by business layer

            const vectors = [
                { id: '1', vector: [0.1, 0.2], payload: {} }
            ];

            // Even with mismatched dimensions (business rule violation),
            // infrastructure layer should still process the request
            const result = buildSharedVectorPayload(vectors, 999);

            // Infrastructure layer doesn't validate dimensions - that's business layer's job
            // It either succeeds or fails for infrastructure reasons only
            if (result.success) {
                expect(result.payload.dimensions).toBe(999);
            } else {
                // Failure should be for infrastructure reasons, not validation
                expect(['shared_array_buffer_unavailable', 'no_vectors']).toContain(result.error);
            }
        });

        it('should handle data copying without transformation', () => {
            // Infrastructure layer should copy data as-is, not transform it
            const vectors = [
                { id: '1', vector: [0.1, 0.2, 0.3], payload: { key: 'value' } }
            ];

            const result = buildSharedVectorPayload(vectors, 3);

            if (result.success) {
                const floatView = new Float32Array(result.payload.sharedVectors);
                // Use approximate comparison for floating point
                expect(floatView[0]).toBeCloseTo(0.1, 5);
                expect(floatView[1]).toBeCloseTo(0.2, 5);
                expect(floatView[2]).toBeCloseTo(0.3, 5);
            }
        });
    });
});
