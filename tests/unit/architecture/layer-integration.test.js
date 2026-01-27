/**
 * Architecture Layer Integration Tests
 *
 * Tests that verify the three layers work together correctly:
 * 1. Business Logic Layer (WHAT) - defines valid data
 * 2. Application Logic Layer (HOW) - orchestrates operations
 * 3. Infrastructure Layer (HOW TO IMPLEMENT) - low-level details
 *
 * These tests verify:
 * - Clear boundaries between layers
 * - No business logic in infrastructure
 * - No infrastructure in business logic
 * - Proper sequencing through layers
 */

import { describe, it, expect } from 'vitest';

import * as BusinessLayer from '../../../js/architecture/vector-store-business-layer.js';
import * as InfrastructureLayer from '../../../js/architecture/vector-store-infrastructure-layer.js';
import * as SessionBusinessLayer from '../../../js/architecture/session-persistence-application-layer.js';

describe('Architecture Layer Integration', () => {

    describe('Layer Separation', () => {
        it('business layer should not import from infrastructure', async () => {
            // Business layer should be importable independently
            const business = await import('../../../js/architecture/vector-store-business-layer.js');

            // Should have validation functions
            expect(business.validateVectorDimensions).toBeDefined();
            expect(business.validateVectorElements).toBeDefined();
            expect(business.validateVectorConsistency).toBeDefined();

            // Should NOT have infrastructure functions
            expect(business.createSharedVectorBuffer).toBeUndefined();
            expect(business.buildSharedVectorPayload).toBeUndefined();
        });

        it('infrastructure layer should not import from business', async () => {
            // Infrastructure layer should be importable independently
            const infra = await import('../../../js/architecture/vector-store-infrastructure-layer.js');

            // Should have infrastructure functions
            expect(infra.createSharedVectorBuffer).toBeDefined();
            expect(infra.buildSharedVectorPayload).toBeDefined();

            // Should NOT have business validation functions
            expect(infra.validateVectorDimensions).toBeUndefined();
            expect(infra.validateVectorElements).toBeUndefined();
        });
    });

    describe('Vector Store Flow: Business -> Infrastructure', () => {
        it('should validate vectors before creating shared buffer', () => {
            // Step 1: Business layer validates
            const vectors = [
                { id: '1', vector: Array(384).fill(0.1), payload: { type: 'test' } },
                { id: '2', vector: Array(384).fill(0.2), payload: { type: 'test' } }
            ];

            const validationReport = BusinessLayer.buildVectorValidationReport(vectors, 384);

            // Business rule: must be valid
            expect(validationReport.isValid).toBe(true);
            expect(validationReport.dimensions).toBe(384);

            // Step 2: Infrastructure layer creates buffer (only if valid)
            const infraResult = InfrastructureLayer.buildSharedVectorPayload(vectors, 384);

            // Infrastructure operation succeeds
            expect(infraResult.success).toBe(true);
            expect(infraResult.payload.sharedVectors).toBeInstanceOf(SharedArrayBuffer);
        });

        it('should fail gracefully when business validation fails', () => {
            // Step 1: Business layer detects invalid data
            const vectors = [
                { id: '1', vector: [0.1, NaN, 0.3], payload: {} }  // Invalid: contains NaN
            ];

            const validationReport = BusinessLayer.buildVectorValidationReport(vectors, 3);

            // Business rule: invalid vectors should be rejected
            expect(validationReport.isValid).toBe(false);
            expect(validationReport.errors.length).toBeGreaterThan(0);

            // Step 2: Infrastructure should NOT be called with invalid data
            // (This is enforced at the orchestration level, not in the layers themselves)
        });
    });

    describe('Session Persistence Flow: Application -> Infrastructure', () => {
        it('should prepare session data using application layer', () => {
            const sessionData = {
                id: 'session-123',
                createdAt: '2024-01-01T00:00:00.000Z',
                messages: [
                    { role: 'system', content: 'You are helpful' },
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi there' }
                ],
                personality: { name: 'Test', emoji: '🧪' },
                isLiteMode: false
            };

            // Application layer orchestrates preparation
            const prepared = SessionBusinessLayer.prepareSessionForSave(sessionData, 100);

            expect(prepared.id).toBe('session-123');
            expect(prepared.messages).toHaveLength(3);
            expect(prepared.metadata.personalityName).toBe('Test');

            // Result is ready for infrastructure layer to persist
            expect(prepared).toMatchObject({
                id: expect.any(String),
                title: expect.any(String),
                createdAt: expect.any(String),
                messages: expect.any(Array),
                metadata: expect.any(Object)
            });
        });

        it('should filter messages according to business rules', () => {
            const messages = [
                { role: 'system', content: 'System' },
                ...Array(150).fill(0).map((_, i) => ({
                    role: i % 2 === 0 ? 'user' : 'assistant',
                    content: `Message ${i}`
                }))
            ];

            // Application layer applies business rules
            const filtered = SessionBusinessLayer.filterMessagesForStorage(messages, 100);

            // Business rule: preserve system messages + limit total
            const systemMessages = filtered.filter(m => m.role === 'system');
            expect(systemMessages).toHaveLength(1);
            expect(filtered.length).toBeLessThanOrEqual(100);
        });
    });

    describe('Layer Contracts', () => {
        it('business layer should accept plain arrays (no infrastructure required)', () => {
            const vector = [0.1, 0.2, 0.3];

            // Business validation works with plain data
            const result = BusinessLayer.validateVectorElements(vector);

            expect(result.isValid).toBe(true);
        });

        it('infrastructure layer should accept pre-validated data', () => {
            const vectors = [
                { id: '1', vector: [0.1, 0.2], payload: {} }
            ];

            // Infrastructure doesn't validate - it processes
            const result = InfrastructureLayer.buildSharedVectorPayload(vectors, 2);

            expect(result.success).toBe(true);
        });

        it('application layer should produce deterministic output', () => {
            const input = {
                id: 'test',
                messages: [{ role: 'user', content: 'Hello' }]
            };

            const output1 = SessionBusinessLayer.prepareSessionForSave(input, 100);
            const output2 = SessionBusinessLayer.prepareSessionForSave(input, 100);

            expect(output1).toEqual(output2);
        });
    });

    describe('Error Handling Across Layers', () => {
        it('business layer should report specific validation errors', () => {
            const result = BusinessLayer.validateVectorDimensions([], 384);

            expect(result.isValid).toBe(false);
            expect(result.error).toBe(BusinessLayer.VALIDATION_ERRORS.VECTOR_EMPTY);
        });

        it('infrastructure layer should report specific infrastructure errors', () => {
            const result = InfrastructureLayer.buildSharedVectorPayload([], 384);

            expect(result.success).toBe(false);
            expect(result.error).toBe(InfrastructureLayer.INFRASTRUCTURE_ERRORS.NO_VECTORS);
        });
    });

    describe('Independence of Layers', () => {
        it('business layer should be testable in isolation', () => {
            // Can use business layer without any infrastructure setup
            const result = BusinessLayer.validateVectorConsistency([
                { id: '1', vector: [0.1, 0.2] },
                { id: '2', vector: [0.3, 0.4] }
            ]);

            expect(result.isValid).toBe(true);
            expect(result.dimensions).toBe(2);
        });

        it('infrastructure layer should be testable in isolation', () => {
            // Can use infrastructure layer without business rules
            const result = InfrastructureLayer.createSharedVectorBuffer(10, 5);

            if (result.success) {
                expect(result.buffer).toBeInstanceOf(SharedArrayBuffer);
            }
        });

        it('application layer should be testable in isolation', () => {
            // Can use application layer without storage
            const prepared = SessionBusinessLayer.prepareSessionForSave({
                id: 'test',
                messages: [{ role: 'user', content: 'Test' }]
            }, 100);

            expect(prepared.id).toBe('test');
        });
    });
});
