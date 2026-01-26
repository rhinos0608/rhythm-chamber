/**
 * Streaming Message Handler Timeout Fix Tests
 *
 * CRITICAL FIX: Tests for network interruption handling and timeout protection
 * Tests verify that stale buffer data doesn't corrupt subsequent streams
 *
 * @file tests/unit/streaming-timeout-fix.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamingMessageHandler } from '../../js/controllers/streaming-message-handler.js';

// Mock DOM environment
global.document = {
    getElementById: vi.fn((id) => {
        if (id === 'chat-messages') {
            return {
                appendChild: vi.fn(),
                scrollTop: 0,
                scrollHeight: 100
            };
        }
        return null;
    }),
    createElement: vi.fn((tag) => ({
        className: '',
        id: '',
        innerHTML: '',
        dataset: {},
        classList: {
            remove: vi.fn(),
            add: vi.fn()
        },
        removeAttribute: vi.fn(),
        querySelector: vi.fn(() => null),
        insertBefore: vi.fn()
    }))
};

describe('Streaming Message Handler - Timeout Fix', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        StreamingMessageHandler.resetSequenceBuffer();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Network Interruption Protection', () => {
        it('should reset buffer after timeout when no chunks arrive', async () => {
            const handler = vi.fn();

            // Process first chunk
            StreamingMessageHandler.processSequencedChunk(0, 'first', handler);
            expect(handler).toHaveBeenCalledWith('first');

            // Wait for timeout (30 seconds)
            vi.advanceTimersByTime(30000);

            // Process chunk after timeout - should start fresh sequence
            StreamingMessageHandler.processSequencedChunk(0, 'new-first', handler);
            expect(handler).toHaveBeenLastCalledWith('new-first');
        });

        it('should clear timeout when new chunk arrives', () => {
            const handler = vi.fn();

            // Process chunk (starts timeout)
            StreamingMessageHandler.processSequencedChunk(0, 'first', handler);

            // Advance timer but not to timeout
            vi.advanceTimersByTime(20000);

            // Process another chunk (should reset timeout)
            StreamingMessageHandler.processSequencedChunk(1, 'second', handler);

            // Advance past original timeout
            vi.advanceTimersByTime(10001);

            // Buffer should still work because timeout was reset
            StreamingMessageHandler.processSequencedChunk(2, 'third', handler);
            expect(handler).toHaveBeenCalledWith('third');
        });

        it('should handle out-of-order chunks with timeout protection', () => {
            const handler = vi.fn();

            // Process chunk 0 and 2
            StreamingMessageHandler.processSequencedChunk(0, 'first', handler);
            StreamingMessageHandler.processSequencedChunk(2, 'third', handler);

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith('first');

            // Advance timer
            vi.advanceTimersByTime(20000);

            // Process chunk 1 (should trigger buffered chunk 2)
            StreamingMessageHandler.processSequencedChunk(1, 'second', handler);

            expect(handler).toHaveBeenLastCalledWith('third');
            expect(handler).toHaveBeenCalledTimes(3);
        });

        it('should not timeout when chunks arrive regularly', () => {
            const handler = vi.fn();

            // Process chunks with regular intervals (less than timeout)
            for (let i = 0; i < 5; i++) {
                StreamingMessageHandler.processSequencedChunk(i, `chunk-${i}`, handler);
                vi.advanceTimersByTime(10000); // 10 seconds between chunks
            }

            // All chunks should be processed
            expect(handler).toHaveBeenCalledTimes(5);
        });
    });

    describe('Error Handling', () => {
        it('should clear timeout on error', () => {
            const handler = vi.fn(() => {
                throw new Error('Processing error');
            });

            // Process chunk that throws error
            expect(() => {
                StreamingMessageHandler.processSequencedChunk(0, 'error-chunk', handler);
            }).toThrow('Processing error');

            // Advance past timeout
            vi.advanceTimersByTime(30001);

            // Should be able to process new chunk (timeout was cleared)
            const goodHandler = vi.fn();
            StreamingMessageHandler.processSequencedChunk(0, 'good-chunk', goodHandler);
            expect(goodHandler).toHaveBeenCalledWith('good-chunk');
        });

        it('should handle timeout during out-of-order buffering', () => {
            const handler = vi.fn();

            // Process chunks 0 and 2, creating a gap
            StreamingMessageHandler.processSequencedChunk(0, 'first', handler);
            StreamingMessageHandler.processSequencedChunk(2, 'third', handler);

            // Wait for timeout
            vi.advanceTimersByTime(30000);

            // After timeout, sequence should be reset
            // New chunk 0 should be accepted
            StreamingMessageHandler.processSequencedChunk(0, 'new-first', handler);
            expect(handler).toHaveBeenLastCalledWith('new-first');
        });
    });

    describe('Sequence Buffer Status', () => {
        it('should report pending chunks before timeout', () => {
            const handler = vi.fn();

            // Process out-of-order chunks
            StreamingMessageHandler.processSequencedChunk(0, 'first', handler);
            StreamingMessageHandler.processSequencedChunk(2, 'third', handler);

            const status = StreamingMessageHandler.getSequenceBufferStatus();
            expect(status.pending).toBe(1);
            expect(status.nextExpected).toBe(1);
            expect(status.gaps).toContain(1);
        });

        it('should reset status after timeout', () => {
            const handler = vi.fn();

            // Process out-of-order chunks
            StreamingMessageHandler.processSequencedChunk(0, 'first', handler);
            StreamingMessageHandler.processSequencedChunk(2, 'third', handler);

            // Wait for timeout
            vi.advanceTimersByTime(30000);

            const status = StreamingMessageHandler.getSequenceBufferStatus();
            expect(status.pending).toBe(0);
            expect(status.nextExpected).toBe(0);
        });
    });

    describe('Manual Reset', () => {
        it('should clear timeout when manually reset', () => {
            const handler = vi.fn();

            // Start timeout
            StreamingMessageHandler.processSequencedChunk(0, 'first', handler);

            // Manually reset
            StreamingMessageHandler.resetSequenceBuffer();

            // Advance past timeout
            vi.advanceTimersByTime(30001);

            // Should work fine (timeout was cleared)
            StreamingMessageHandler.processSequencedChunk(0, 'new-first', handler);
            expect(handler).toHaveBeenLastCalledWith('new-first');
        });

        it('should handle reset during active stream', () => {
            const handler = vi.fn();

            // Process some chunks
            StreamingMessageHandler.processSequencedChunk(0, 'first', handler);
            StreamingMessageHandler.processSequencedChunk(1, 'second', handler);

            // Manually reset
            StreamingMessageHandler.resetSequenceBuffer();

            // Should start from sequence 0 again
            StreamingMessageHandler.processSequencedChunk(0, 'new-first', handler);
            expect(handler).toHaveBeenLastCalledWith('new-first');
        });
    });

    describe('Real-World Scenarios', () => {
        it('should recover from network drop', () => {
            const handler = vi.fn();

            // Simulate stream starting
            StreamingMessageHandler.processSequencedChunk(0, 'Hello', handler);
            StreamingMessageHandler.processSequencedChunk(1, ' there', handler);

            expect(handler).toHaveBeenCalledTimes(2);

            // Network drops (timeout triggers)
            vi.advanceTimersByTime(30000);

            // New stream starts
            StreamingMessageHandler.processSequencedChunk(0, 'New message', handler);
            expect(handler).toHaveBeenLastCalledWith('New message');
        });

        it('should handle slow network without timeout', () => {
            const handler = vi.fn();

            // Simulate slow network (chunks arrive every 25 seconds)
            StreamingMessageHandler.processSequencedChunk(0, 'chunk-0', handler);
            vi.advanceTimersByTime(25000);

            StreamingMessageHandler.processSequencedChunk(1, 'chunk-1', handler);
            vi.advanceTimersByTime(25000);

            StreamingMessageHandler.processSequencedChunk(2, 'chunk-2', handler);

            // All should be processed (timeout resets on each chunk)
            expect(handler).toHaveBeenCalledTimes(3);
        });

        it('should prevent stale data corruption', () => {
            const handler = vi.fn();

            // First stream
            StreamingMessageHandler.processSequencedChunk(0, 'stream1-chunk0', handler);
            StreamingMessageHandler.processSequencedChunk(2, 'stream1-chunk2', handler);

            // Stream fails (timeout)
            vi.advanceTimersByTime(30000);

            // Second stream starts
            StreamingMessageHandler.processSequencedChunk(0, 'stream2-chunk0', handler);

            // Should only process stream2 data, not stale stream1 data
            expect(handler).toHaveBeenLastCalledWith('stream2-chunk0');
            expect(handler).not.toHaveBeenCalledWith('stream1-chunk2');
        });
    });
});
