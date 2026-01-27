/**
 * Streaming Message Handler Tests
 *
 * TDD Approach: Tests for memory leak detection and cleanup
 * TD-6: Memory leak in StreamingMessageHandler timeout cleanup
 *
 * @file tests/unit/streaming-message-handler.test.js
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
        if (id === 'token-counter') {
            return {
                style: {},
                remove: vi.fn()
            };
        }
        return null;
    }),
    createElement: vi.fn((tag) => {
        const el = {
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
            insertBefore: vi.fn(),
            remove: vi.fn()
        };

        // Mock querySelector to return child elements
        el.querySelector = vi.fn((selector) => {
            if (selector === '.streaming-content' || selector === '.thinking-content') {
                return {
                    textContent: '',
                    innerHTML: '',
                    style: {}
                };
            }
            return null;
        });

        return el;
    })
};

describe('Streaming Message Handler - Memory Leak Tests (TD-6)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        StreamingMessageHandler.resetSequenceBuffer();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Memory Leak: Timeout Cleanup', () => {
        it('should provide cleanup function to clear activeTimeout', () => {
            // Verify cleanup function exists
            expect(StreamingMessageHandler.cleanupStreamingHandler).toBeDefined();
            expect(typeof StreamingMessageHandler.cleanupStreamingHandler).toBe('function');
        });

        it('should clear activeTimeout when cleanup is called', () => {
            const handler = vi.fn();

            // Process a chunk to start timeout
            StreamingMessageHandler.processSequencedChunk(0, 'first', handler);

            // Call cleanup
            StreamingMessageHandler.cleanupStreamingHandler();

            // Advance past timeout - should not trigger any behavior
            // because timeout was cleared
            vi.advanceTimersByTime(30001);

            // Buffer should be reset
            const status = StreamingMessageHandler.getSequenceBufferStatus();
            expect(status.pending).toBe(0);
            expect(status.nextExpected).toBe(0);
        });

        it('should clear activeTimeout on stream cancel/unmount simulation', () => {
            const handler = vi.fn();

            // Start processing chunks
            StreamingMessageHandler.processSequencedChunk(0, 'first', handler);
            StreamingMessageHandler.processSequencedChunk(2, 'third', handler);

            expect(handler).toHaveBeenCalledTimes(1);

            // Simulate component unmount or stream cancel
            StreamingMessageHandler.cleanupStreamingHandler();

            // Verify buffer is reset
            const status = StreamingMessageHandler.getSequenceBufferStatus();
            expect(status.pending).toBe(0);
            expect(status.nextExpected).toBe(0);
            expect(status.gaps).toEqual([]);
        });

        it('should not throw error when cleanup is called multiple times', () => {
            const handler = vi.fn();

            StreamingMessageHandler.processSequencedChunk(0, 'first', handler);

            // Call cleanup multiple times - should not throw
            expect(() => {
                StreamingMessageHandler.cleanupStreamingHandler();
                StreamingMessageHandler.cleanupStreamingHandler();
                StreamingMessageHandler.cleanupStreamingHandler();
            }).not.toThrow();
        });

        it('should not throw error when cleanup is called without active timeout', () => {
            // Call cleanup when no timeout is active
            expect(() => {
                StreamingMessageHandler.cleanupStreamingHandler();
            }).not.toThrow();
        });
    });

    describe('Memory Leak: Multiple Timeouts', () => {
        it('should ensure only the latest timeout is active', () => {
            const handler = vi.fn();
            const timeoutSpy = vi.spyOn(global, 'setTimeout');

            // Process first chunk
            StreamingMessageHandler.processSequencedChunk(0, 'first', handler);
            expect(timeoutSpy).toHaveBeenCalledTimes(1);

            // Process second chunk - should clear previous timeout
            StreamingMessageHandler.processSequencedChunk(1, 'second', handler);
            // A new timeout should be set (sliding window)
            expect(timeoutSpy).toHaveBeenCalledTimes(2);

            timeoutSpy.mockRestore();
        });

        it('should handle rapid successive chunks without timeout accumulation', () => {
            const handler = vi.fn();
            const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

            // Process many chunks rapidly
            for (let i = 0; i < 10; i++) {
                StreamingMessageHandler.processSequencedChunk(i, `chunk-${i}`, handler);
            }

            // Should have cleared previous timeouts before setting new ones
            // At least 9 clearTimeout calls for 10 chunks
            expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(9);

            clearTimeoutSpy.mockRestore();
        });

        it('should reset buffer in cleanup after multiple chunks', () => {
            const handler = vi.fn();

            // Process multiple chunks
            for (let i = 0; i < 5; i++) {
                StreamingMessageHandler.processSequencedChunk(i, `chunk-${i}`, handler);
            }

            // All should be processed
            expect(handler).toHaveBeenCalledTimes(5);

            // Cleanup
            StreamingMessageHandler.cleanupStreamingHandler();

            // Verify clean state
            const status = StreamingMessageHandler.getSequenceBufferStatus();
            expect(status.pending).toBe(0);
            expect(status.nextExpected).toBe(0);
        });
    });

    describe('Memory Leak: Lifecycle Integration', () => {
        it('should simulate component unmount with cleanup', () => {
            const handler = vi.fn();

            // Simulate stream starting
            StreamingMessageHandler.processSequencedChunk(0, 'data1', handler);
            StreamingMessageHandler.processSequencedChunk(2, 'data3', handler);

            // Simulate component unmount
            StreamingMessageHandler.cleanupStreamingHandler();

            // Advance time - no timeout should fire
            vi.advanceTimersByTime(30001);

            // Start new stream after unmount
            StreamingMessageHandler.processSequencedChunk(0, 'new-data', handler);

            expect(handler).toHaveBeenLastCalledWith('new-data');
        });

        it('should handle stream cancel followed by new stream', () => {
            const handler = vi.fn();

            // First stream
            StreamingMessageHandler.processSequencedChunk(0, 'stream1-0', handler);
            StreamingMessageHandler.processSequencedChunk(2, 'stream1-2', handler);

            // Cancel stream
            StreamingMessageHandler.cleanupStreamingHandler();

            // Second stream - should start fresh
            StreamingMessageHandler.processSequencedChunk(0, 'stream2-0', handler);

            // Should only process stream2 data
            expect(handler).toHaveBeenLastCalledWith('stream2-0');
            expect(handler).not.toHaveBeenCalledWith('stream1-2');

            // Verify no pending data from first stream
            const status = StreamingMessageHandler.getSequenceBufferStatus();
            expect(status.pending).toBe(0);
        });

        it('should be safe to call resetSequenceBuffer after cleanup', () => {
            const handler = vi.fn();

            StreamingMessageHandler.processSequencedChunk(0, 'data', handler);
            StreamingMessageHandler.cleanupStreamingHandler();
            StreamingMessageHandler.resetSequenceBuffer();

            // Should work fine
            StreamingMessageHandler.processSequencedChunk(0, 'new-data', handler);
            expect(handler).toHaveBeenLastCalledWith('new-data');
        });
    });

    describe('Memory Leak: Error Recovery with Cleanup', () => {
        it('should cleanup after processing error', () => {
            const errorHandler = vi.fn(() => {
                throw new Error('Processing error');
            });

            // Process chunk that throws
            expect(() => {
                StreamingMessageHandler.processSequencedChunk(0, 'error', errorHandler);
            }).toThrow('Processing error');

            // Cleanup should work even after error
            expect(() => {
                StreamingMessageHandler.cleanupStreamingHandler();
            }).not.toThrow();

            // New processing should work
            const goodHandler = vi.fn();
            StreamingMessageHandler.processSequencedChunk(0, 'good', goodHandler);
            expect(goodHandler).toHaveBeenCalledWith('good');
        });

        it('should handle cleanup during out-of-order buffering', () => {
            const handler = vi.fn();

            // Create out-of-order situation
            StreamingMessageHandler.processSequencedChunk(0, 'first', handler);
            StreamingMessageHandler.processSequencedChunk(3, 'fourth', handler);

            // Cleanup while data is buffered
            StreamingMessageHandler.cleanupStreamingHandler();

            // Buffer should be clear
            const status = StreamingMessageHandler.getSequenceBufferStatus();
            expect(status.pending).toBe(0);
        });
    });

    describe('Memory Leak Detection: Timeout Reference Tracking', () => {
        it('should not leak timeout references after cleanup', () => {
            const handler = vi.fn();

            // Create timeout
            StreamingMessageHandler.processSequencedChunk(0, 'data', handler);

            // Cleanup
            StreamingMessageHandler.cleanupStreamingHandler();

            // Create another timeout
            StreamingMessageHandler.processSequencedChunk(0, 'new-data', handler);

            // Only one timeout should be active
            vi.advanceTimersByTime(30000);

            // Should trigger reset
            StreamingMessageHandler.processSequencedChunk(0, 'after-timeout', handler);
            expect(handler).toHaveBeenLastCalledWith('after-timeout');
        });

        it('should handle cleanup and restart scenario', () => {
            const handler = vi.fn();

            // First stream
            StreamingMessageHandler.processSequencedChunk(0, 's1-c0', handler);
            StreamingMessageHandler.processSequencedChunk(1, 's1-c1', handler);

            // Cleanup
            StreamingMessageHandler.cleanupStreamingHandler();

            // Second stream
            StreamingMessageHandler.processSequencedChunk(0, 's2-c0', handler);
            StreamingMessageHandler.processSequencedChunk(1, 's2-c1', handler);

            // Should process all chunks correctly
            expect(handler).toHaveBeenCalledTimes(4);
            expect(handler).toHaveBeenLastCalledWith('s2-c1');
        });
    });
});
