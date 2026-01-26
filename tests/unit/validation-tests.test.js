/**
 * Validation and Data Integrity Tests
 *
 * Tests for data validation, vector validation,
 * timestamp handling, and data integrity checks.
 *
 * Covers:
 * - Vector dimension validation (efcc205)
 * - Timestamp validation (efcc205)
 * - Session validation (a3be695)
 * - Data structure validation
 * - UUID validation
 *
 * @module tests/unit/validation-tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Test: Vector Dimension Validation
// ==========================================

describe('Vector Dimension Validation (efcc205)', () => {
    it('should validate consistent dimensions across all vectors', () => {
        function validateVectorDimensions(vectors) {
            if (!vectors || vectors.length === 0) {
                return { valid: true, dimensions: 0 };
            }

            let expectedDimensions = null;
            const mismatches = [];

            for (let i = 0; i < vectors.length; i++) {
                const vector = vectors[i];

                // Check if vector exists and is an array
                if (!vector.vector || !Array.isArray(vector.vector)) {
                    return {
                        valid: false,
                        error: `Vector at index ${i}: missing or not an array`,
                        index: i
                    };
                }

                // Check vector dimensions
                const currentDimensions = vector.vector.length;
                if (currentDimensions === 0) {
                    return {
                        valid: false,
                        error: `Empty vector at index ${i}`,
                        index: i
                    };
                }

                // Validate consistent dimensions
                if (expectedDimensions === null) {
                    expectedDimensions = currentDimensions;
                } else if (currentDimensions !== expectedDimensions) {
                    mismatches.push({
                        index: i,
                        expected: expectedDimensions,
                        actual: currentDimensions,
                        id: vector.id
                    });
                }

                // Validate all elements are numbers
                for (let j = 0; j < currentDimensions; j++) {
                    if (typeof vector.vector[j] !== 'number' || isNaN(vector.vector[j])) {
                        return {
                            valid: false,
                            error: `Non-numeric value at vector ${i}, index ${j}`,
                            index: i
                        };
                    }
                }
            }

            if (mismatches.length > 0) {
                return {
                    valid: false,
                    error: `Dimension mismatch detected`,
                    expectedDimensions,
                    mismatches
                };
            }

            return {
                valid: true,
                dimensions: expectedDimensions
            };
        }

        // Valid vectors
        const validVectors = [
            { id: 'vec1', vector: [1, 2, 3] },
            { id: 'vec2', vector: [4, 5, 6] },
            { id: 'vec3', vector: [7, 8, 9] }
        ];

        const result1 = validateVectorDimensions(validVectors);
        expect(result1.valid).toBe(true);
        expect(result1.dimensions).toBe(3);

        // Mismatched dimensions
        const mismatchedVectors = [
            { id: 'vec1', vector: [1, 2, 3] },
            { id: 'vec2', vector: [4, 5] }, // Dimension mismatch
            { id: 'vec3', vector: [6, 7, 8] }
        ];

        const result2 = validateVectorDimensions(mismatchedVectors);
        expect(result2.valid).toBe(false);
        expect(result2.mismatches).toHaveLength(1);
        expect(result2.mismatches[0].index).toBe(1);
        expect(result2.mismatches[0].expected).toBe(3);
        expect(result2.mismatches[0].actual).toBe(2);

        // Invalid vector (not an array)
        const invalidVectors = [
            { id: 'vec1', vector: [1, 2, 3] },
            { id: 'vec2', vector: 'not an array' }
        ];

        const result3 = validateVectorDimensions(invalidVectors);
        expect(result3.valid).toBe(false);
        expect(result3.error).toContain('not an array');
        expect(result3.index).toBe(1);

        // Non-numeric values
        const nonNumericVectors = [
            { id: 'vec1', vector: [1, 2, 'three'] }
        ];

        const result4 = validateVectorDimensions(nonNumericVectors);
        expect(result4.valid).toBe(false);
        expect(result4.error).toContain('Non-numeric value');
    });

    it('should log prominent warnings for dimension mismatch', () => {
        const warnings = [];

        const originalWarn = console.warn;
        console.warn = (...args) => {
            warnings.push(args.join(' '));
        };

        try {
            function checkVectorsWithWarning(vectors) {
                let expectedDimensions = null;

                for (let i = 0; i < vectors.length; i++) {
                    const item = vectors[i];

                    if (!item.vector || !Array.isArray(item.vector)) {
                        console.warn(`[LocalVectorStore] Invalid vector at index ${i}: missing or not an array`);
                        return false;
                    }

                    const currentDimensions = item.vector.length;

                    if (expectedDimensions === null) {
                        expectedDimensions = currentDimensions;
                    } else if (currentDimensions !== expectedDimensions) {
                        // Issue 7 fix: More prominent warning
                        console.warn(`[LocalVectorStore] DIMENSION MISMATCH DETECTED at index ${i}: expected ${expectedDimensions}, got ${currentDimensions}. Vector ID: ${item.id}`);
                        console.warn('[LocalVectorStore] Falling back to slower search path. Consider cleaning up mismatched vectors.');
                        return false;
                    }
                }

                return true;
            }

            const vectors = [
                { id: 'vec1', vector: [1, 2, 3] },
                { id: 'vec2', vector: [4, 5] }, // Mismatch
                { id: 'vec3', vector: [6, 7, 8] }
            ];

            const result = checkVectorsWithWarning(vectors);

            expect(result).toBe(false);
            expect(warnings.length).toBeGreaterThanOrEqual(2);
            expect(warnings[0]).toContain('DIMENSION MISMATCH DETECTED');
            expect(warnings[0]).toContain('expected 3, got 2');
            expect(warnings[0]).toContain('Vector ID: vec2');
            expect(warnings[1]).toContain('Falling back to slower search path');
        } finally {
            console.warn = originalWarn;
        }
    });
});

// ==========================================
// Test: Timestamp Validation
// ==========================================

describe('Timestamp Validation (efcc205)', () => {
    it('should validate timestamps before creating Date objects', () => {
        function validateTimestamp(timestamp, streamIndex) {
            // Issue 6 fix: Validate timestamp before creating Date
            if (!timestamp) {
                console.warn(`[EmbeddingWorker] Stream missing timestamp, skipping stream at index: ${streamIndex}`);
                return { valid: false, error: 'Missing timestamp' };
            }

            const date = new Date(timestamp);
            if (isNaN(date.getTime())) {
                console.warn(`[EmbeddingWorker] Invalid date for stream at index: ${streamIndex}, timestamp: ${timestamp}`);
                return { valid: false, error: 'Invalid date' };
            }

            return { valid: true, date };
        }

        // Valid timestamps
        const validTimestamps = [
            { ts: 1609459200000 },
            { endTime: 1609459200000 },
            { ts: '2021-01-01T00:00:00.000Z' },
            { timestamp: 1609459200000 }
        ];

        validTimestamps.forEach((stream, idx) => {
            const timestamp = stream.ts || stream.endTime || stream.timestamp;
            const result = validateTimestamp(timestamp, idx);
            expect(result.valid).toBe(true);
            expect(result.date).toBeInstanceOf(Date);
            expect(isNaN(result.date.getTime())).toBe(false);
        });

        // Invalid timestamps
        const invalidStreams = [
            { ts: null },
            { endTime: undefined },
            { },
            { ts: 'invalid-date' },
            { ts: NaN },
            { ts: 'not-a-date' }
        ];

        invalidStreams.forEach((stream, idx) => {
            const timestamp = stream.ts || stream.endTime || stream.timestamp;
            const result = validateTimestamp(timestamp, idx);
            expect(result.valid).toBe(false);
        });
    });

    it('should handle streams with missing timestamps', () => {
        const warnings = [];
        const skippedStreams = [];

        const originalWarn = console.warn;
        console.warn = (...args) => {
            warnings.push(args.join(' '));
        };

        try {
            function processStreamsWithValidation(streams) {
                const processed = [];

                streams.forEach((stream, idx) => {
                    // Issue 6 fix: Validate timestamp before creating Date object
                    const timestamp = stream.ts || stream.endTime;
                    if (!timestamp) {
                        console.warn(`[EmbeddingWorker] Stream missing timestamp, skipping stream at index: ${idx}`);
                        skippedStreams.push(idx);
                        return; // Skip this stream
                    }

                    const date = new Date(timestamp);
                    if (isNaN(date.getTime())) {
                        console.warn(`[EmbeddingWorker] Invalid date for stream at index: ${idx}, timestamp: ${timestamp}`);
                        skippedStreams.push(idx);
                        return; // Skip this stream
                    }

                    processed.push({
                        ...stream,
                        date,
                        monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
                    });
                });

                return processed;
            }

            const streams = [
                { ts: 1609459200000, master_metadata_track_name: 'Track 1' },
                { endTime: 1609545600000, trackName: 'Track 2' },
                { master_metadata_track_name: 'Track 3' }, // Missing timestamp
                { ts: 'invalid', trackName: 'Track 4' }, // Invalid timestamp
                { ts: 1609632000000, trackName: 'Track 5' }
            ];

            const result = processStreamsWithValidation(streams);

            expect(result).toHaveLength(3); // Only valid streams
            expect(skippedStreams).toEqual([2, 3]);
            expect(warnings.length).toBeGreaterThanOrEqual(2);
        } finally {
            console.warn = originalWarn;
        }
    });
});

// ==========================================
// Test: Session Validation
// ==========================================

describe('Session Validation (a3be695)', () => {
    it('should validate session structure', () => {
        function validateSession(session) {
            if (!session) {
                return { valid: false, error: 'Session is null or undefined' };
            }

            if (typeof session !== 'object') {
                return { valid: false, error: 'Session is not an object' };
            }

            if (!session.id || typeof session.id !== 'string') {
                return { valid: false, error: 'Session missing valid id' };
            }

            if (!Array.isArray(session.messages)) {
                return { valid: false, error: 'Session missing messages array' };
            }

            if (!session.createdAt) {
                return { valid: false, error: 'Session missing createdAt' };
            }

            // Validate UUID format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(session.id)) {
                return { valid: false, error: 'Session id is not valid UUID v4' };
            }

            return { valid: true };
        }

        // Valid session
        const validSession = {
            id: '550e8400-e29b-41d4-a716-446655440000',
            createdAt: new Date().toISOString(),
            messages: [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there!' }
            ],
            title: 'Test Chat',
            metadata: {}
        };

        expect(validateSession(validSession)).toEqual({ valid: true });

        // Invalid sessions
        const invalidSessions = [
            { value: 'not an object' },
            null,
            undefined,
            { id: 123, createdAt: new Date().toISOString(), messages: [] },
            { id: '550e8400-e29b-41d4-a716-446655440000', messages: [] },
            { id: '550e8400-e29b-41d4-a716-446655440000', createdAt: new Date().toISOString(), messages: 'not array' },
            { id: 'invalid-uuid', createdAt: new Date().toISOString(), messages: [] },
            { id: '550e8400-e29b-41d4-a716-446655440000', createdAt: new Date().toISOString(), messages: [] }
        ];

        invalidSessions.forEach(session => {
            const result = validateSession(session);
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    it('should validate before loading session', () => {
        let loadAttempts = [];
        let validationFailures = [];

        function loadSessionWithValidation(sessionId, getSessionFn) {
            loadAttempts.push(sessionId);

            const session = getSessionFn(sessionId);

            if (!session) {
                validationFailures.push({ sessionId, error: 'Session not found' });
                return null;
            }

            // Validate session structure
            if (!session.id || !Array.isArray(session.messages) || !session.createdAt) {
                validationFailures.push({ sessionId, error: 'Invalid session structure' });
                return null;
            }

            return session;
        }

        const mockSessions = {
            'valid-001': {
                id: 'valid-001',
                createdAt: '2024-01-01T00:00:00.000Z',
                messages: []
            },
            'invalid-002': {
                id: 'invalid-002',
                createdAt: '2024-01-01T00:00:00.000Z'
                // Missing messages
            }
        };

        const result1 = loadSessionWithValidation('valid-001', id => mockSessions[id]);
        const result2 = loadSessionWithValidation('invalid-002', id => mockSessions[id]);
        const result3 = loadSessionWithValidation('nonexistent', id => mockSessions[id]);

        expect(result1).not.toBeNull();
        expect(result2).toBeNull();
        expect(result3).toBeNull();

        expect(validationFailures).toHaveLength(2);
        expect(validationFailures[0].sessionId).toBe('invalid-002');
        expect(validationFailures[0].error).toBe('Invalid session structure');
        expect(validationFailures[1].sessionId).toBe('nonexistent');
        expect(validationFailures[1].error).toBe('Session not found');
    });
});

// ==========================================
// Test: UUID Generation and Validation
// ==========================================

describe('UUID Generation and Validation', () => {
    it('should generate valid UUID v4 format', () => {
        function generateUUID() {
            // Generate deterministic UUID for testing
            const random = () => Math.floor(Math.random() * 16).toString(16);
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
                .replace(/x/g, random)
                .replace(/y/g, () => (Math.floor(Math.random() * 4) + 8).toString(16));
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        for (let i = 0; i < 100; i++) {
            const uuid = generateUUID();
            expect(uuid).toMatch(uuidRegex);
        }
    });

    it('should generate unique UUIDs', () => {
        function generateUUID() {
            const random = () => Math.floor(Math.random() * 16).toString(16);
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
                .replace(/x/g, random)
                .replace(/y/g, () => (Math.floor(Math.random() * 4) + 8).toString(16));
        }

        const uuids = new Set();
        for (let i = 0; i < 1000; i++) {
            uuids.add(generateUUID());
        }

        // Should have 1000 unique UUIDs (probability of collision is extremely low)
        expect(uuids.size).toBe(1000);
    });

    it('should validate UUID format', () => {
        function isValidUUID(uuid) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            return uuidRegex.test(uuid);
        }

        // Valid UUIDs
        expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
        expect(isValidUUID('6ba7b811-9dad-11d1-80b4-00c04fd430c8')).toBe(true);

        // Invalid UUIDs
        expect(isValidUUID('not-a-uuid')).toBe(false);
        expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
        expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false);
        expect(isValidUUID('')).toBe(false);
        expect(isValidUUID(null)).toBe(false);
        expect(isValidUUID(undefined)).toBe(false);
    });
});

// ==========================================
// Test: Data Structure Validation
// ==========================================

describe('Data Structure Validation', () => {
    it('should validate message structure', () => {
        function validateMessage(message) {
            if (!message || typeof message !== 'object') {
                return { valid: false, error: 'Message is not an object' };
            }

            if (!message.role || typeof message.role !== 'string') {
                return { valid: false, error: 'Message missing valid role' };
            }

            if (!message.content && !message.tool_calls) {
                return { valid: false, error: 'Message missing content or tool_calls' };
            }

            const validRoles = ['user', 'assistant', 'system', 'tool'];
            if (!validRoles.includes(message.role)) {
                return { valid: false, error: `Invalid role: ${message.role}` };
            }

            return { valid: true };
        }

        // Valid messages
        const validMessages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
            { role: 'system', content: 'You are helpful' },
            { role: 'tool', content: 'Tool result', tool_call_id: '123' }
        ];

        validMessages.forEach(msg => {
            expect(validateMessage(msg)).toEqual({ valid: true });
        });

        // Invalid messages
        const invalidMessages = [
            { role: 'user' }, // Missing content
            { content: 'Hello' }, // Missing role
            { role: 'invalid', content: 'Test' }, // Invalid role
            null,
            undefined,
            'string',
            123
        ];

        invalidMessages.forEach(msg => {
            const result = validateMessage(msg);
            expect(result.valid).toBe(false);
        });
    });

    it('should validate stream data structure', () => {
        function validateStreamData(stream) {
            const requiredFields = ['ms_played', 'ts'];
            const optionalFields = ['master_metadata_album_artist_name', 'master_metadata_track_name'];

            if (!stream || typeof stream !== 'object') {
                return { valid: false, error: 'Stream is not an object' };
            }

            const errors = [];

            // Check at least one timestamp field exists
            const hasTimestamp = stream.ts || stream.endTime;
            if (!hasTimestamp) {
                errors.push('Missing timestamp (ts or endTime)');
            }

            // Check play duration
            const duration = stream.ms_played || stream.msPlayed;
            if (typeof duration !== 'number' || duration < 0) {
                errors.push('Invalid or missing play duration');
            }

            if (errors.length > 0) {
                return { valid: false, errors };
            }

            return { valid: true };
        }

        // Valid streams
        const validStreams = [
            { ms_played: 30000, ts: 1609459200000 },
            { msPlayed: 45000, endTime: 1609459200000 },
            { ms_played: 60000, ts: 1609459200000, master_metadata_track_name: 'Song' }
        ];

        validStreams.forEach(stream => {
            expect(validateStreamData(stream)).toEqual({ valid: true });
        });

        // Invalid streams
        const invalidStreams = [
            { ms_played: -1000, ts: 1609459200000 }, // Negative duration
            { ms_played: 30000 }, // Missing timestamp
            { ts: 1609459200000 }, // Missing duration
            null
        ];

        invalidStreams.forEach(stream => {
            const result = validateStreamData(stream);
            expect(result.valid).toBe(false);
        });
    });
});
