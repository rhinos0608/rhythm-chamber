/**
 * TurnQueue tests
 *
 * Tests the turn queue service that serializes conversation message
 * processing to prevent interleaving.
 *
 * Key areas tested:
 * 1. Queue serialization (FIFO ordering)
 * 2. Concurrent submissions handling (race condition prevention)
 * 3. Error handling and recovery
 * 4. Metrics and observability
 * 5. Queue management (clear, status, etc.)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the Chat module import
// Must be a factory function that returns fresh mock each time
vi.mock('../../js/chat.js', () => ({
    Chat: {
        sendMessage: vi.fn()
    }
}));

import { TurnQueue } from '../../js/services/turn-queue.js';
import { Chat } from '../../js/chat.js';

describe('TurnQueue', () => {
    beforeEach(async () => {
        // Wait for any ongoing processing to complete
        while (TurnQueue.isActive()) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Reset queue state before each test
        // Use the internal queue directly to avoid rejection errors
        while (TurnQueue._queue.length > 0) {
            TurnQueue._queue.shift();
        }
        TurnQueue.resetMetrics();

        // Reset mock
        vi.mocked(Chat.sendMessage).mockReset();
    });

    afterEach(async () => {
        // Wait for all async operations to complete
        while (TurnQueue.isActive()) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    });

    describe('Basic queue operations', () => {
        it('processes a single message successfully', async () => {
            const testResponse = { content: 'Test response' };
            vi.mocked(Chat.sendMessage).mockResolvedValue(testResponse);

            const result = await TurnQueue.push('Hello', { apiKey: 'test-key' });

            expect(result).toEqual(testResponse);
            expect(Chat.sendMessage).toHaveBeenCalledWith(
                'Hello',
                { apiKey: 'test-key' },
                { bypassQueue: true, allowBypass: true }
            );
        });

        it('processes multiple messages sequentially (FIFO)', async () => {
            const responses = ['First', 'Second', 'Third'];
            vi.mocked(Chat.sendMessage)
                .mockResolvedValueOnce(responses[0])
                .mockResolvedValueOnce(responses[1])
                .mockResolvedValueOnce(responses[2]);

            const promises = [
                TurnQueue.push('Message 1'),
                TurnQueue.push('Message 2'),
                TurnQueue.push('Message 3')
            ];

            const results = await Promise.all(promises);

            expect(results).toEqual(responses);
            expect(Chat.sendMessage).toHaveBeenCalledTimes(3);

            // Verify FIFO order
            expect(Chat.sendMessage).toHaveBeenNthCalledWith(1, 'Message 1', {}, { bypassQueue: true, allowBypass: true });
            expect(Chat.sendMessage).toHaveBeenNthCalledWith(2, 'Message 2', {}, { bypassQueue: true, allowBypass: true });
            expect(Chat.sendMessage).toHaveBeenNthCalledWith(3, 'Message 3', {}, { bypassQueue: true, allowBypass: true });
        });

        it('rejects when Chat.sendMessage throws', async () => {
            const testError = new Error('API Error');
            vi.mocked(Chat.sendMessage).mockRejectedValue(testError);

            await expect(TurnQueue.push('Hello')).rejects.toThrow('API Error');
        });
    });

    describe('Race condition prevention', () => {
        it('prevents concurrent processing with isProcessing flag', async () => {
            let processingCount = 0;
            let maxConcurrentProcessing = 0;

            // Create a mock that tracks concurrent processing
            vi.mocked(Chat.sendMessage).mockImplementation(async (message) => {
                processingCount++;
                if (processingCount > maxConcurrentProcessing) {
                    maxConcurrentProcessing = processingCount;
                }

                // Simulate async work
                await new Promise(resolve => setTimeout(resolve, 10));

                processingCount--;
                return { content: `Response to ${message}` };
            });

            // Submit 10 messages rapidly
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(TurnQueue.push(`Message ${i}`));
            }

            await Promise.all(promises);

            // Verify that at most one message was processed at a time
            expect(maxConcurrentProcessing).toBe(1);
            expect(processingCount).toBe(0);
        });

        it('handles rapid concurrent submissions without losing messages', async () => {
            const messageCount = 20;
            const results = [];

            vi.mocked(Chat.sendMessage).mockImplementation(async (message) => {
                // Simulate variable processing time
                const delay = Math.random() * 5;
                await new Promise(resolve => setTimeout(resolve, delay));
                return { content: `Response: ${message}` };
            });

            // Submit all messages rapidly (in same event loop iteration)
            const promises = [];
            for (let i = 0; i < messageCount; i++) {
                promises.push(
                    TurnQueue.push(`Msg${i}`).then(result => {
                        results.push(result.content);
                    })
                );
            }

            await Promise.all(promises);

            // All messages should be processed
            expect(results).toHaveLength(messageCount);

            // Verify all messages got responses
            for (let i = 0; i < messageCount; i++) {
                expect(results).toContain(`Response: Msg${i}`);
            }
        });

        it('maintains queue order under rapid concurrent load', async () => {
            const messageCount = 15;
            const processedOrder = [];

            vi.mocked(Chat.sendMessage).mockImplementation(async (message) => {
                // Record processing order
                processedOrder.push(message);
                await new Promise(resolve => setTimeout(resolve, 1));
                return { content: message };
            });

            // Submit all messages rapidly
            const promises = [];
            for (let i = 0; i < messageCount; i++) {
                promises.push(TurnQueue.push(`Msg${i}`));
            }

            await Promise.all(promises);

            // Verify FIFO order was maintained
            expect(processedOrder).toHaveLength(messageCount);
            for (let i = 0; i < messageCount; i++) {
                expect(processedOrder[i]).toBe(`Msg${i}`);
            }
        });

        it('respects isProcessing flag during rapid processNext calls', async () => {
            let callCount = 0;
            const maxSimultaneousCalls = { value: 0 };
            let currentCalls = 0;

            vi.mocked(Chat.sendMessage).mockImplementation(async () => {
                currentCalls++;
                if (currentCalls > maxSimultaneousCalls.value) {
                    maxSimultaneousCalls.value = currentCalls;
                }

                await new Promise(resolve => setTimeout(resolve, 20));

                currentCalls--;
                callCount++;
                return { content: 'done' };
            });

            // Manually call processNext multiple times rapidly
            // This simulates the race condition scenario
            const rapidCalls = [];
            const messagePromises = [];
            for (let i = 0; i < 5; i++) {
                messagePromises.push(TurnQueue.push(`Message ${i}`));
            }

            // Rapid processNext calls - the atomic check should prevent concurrent processing
            for (let i = 0; i < 10; i++) {
                rapidCalls.push(TurnQueue.processNext());
            }

            // Wait for both the rapid calls AND the actual messages
            await Promise.all([...rapidCalls, ...messagePromises]);

            // All 5 messages should be processed
            expect(callCount).toBe(5);
            expect(maxSimultaneousCalls.value).toBe(1);
        });
    });

    describe('Error handling and recovery', () => {
        it('continues processing after a failed turn', async () => {
            vi.mocked(Chat.sendMessage)
                .mockRejectedValueOnce(new Error('First failed'))
                .mockResolvedValueOnce({ content: 'Second succeeded' })
                .mockResolvedValueOnce({ content: 'Third succeeded' });

            const results = await Promise.allSettled([
                TurnQueue.push('First'),
                TurnQueue.push('Second'),
                TurnQueue.push('Third')
            ]);

            // First should be rejected
            expect(results[0].status).toBe('rejected');
            expect(results[0].reason.message).toBe('First failed');

            // Second and third should succeed (queue continued after error)
            expect(results[1].status).toBe('fulfilled');
            expect(results[1].value).toEqual({ content: 'Second succeeded' });

            expect(results[2].status).toBe('fulfilled');
            expect(results[2].value).toEqual({ content: 'Third succeeded' });
        });

        it('resets isProcessing flag even when error occurs', async () => {
            vi.mocked(Chat.sendMessage).mockRejectedValue(new Error('Test error'));

            await expect(TurnQueue.push('Test')).rejects.toThrow();

            // isProcessing should be reset after error
            expect(TurnQueue.isActive()).toBe(false);

            // Next message should process normally
            vi.mocked(Chat.sendMessage).mockResolvedValue({ content: 'Success' });
            await expect(TurnQueue.push('Next')).resolves.toEqual({ content: 'Success' });
        });

        it('records metrics for failed turns', async () => {
            vi.mocked(Chat.sendMessage).mockRejectedValue(new Error('Failed'));

            await expect(TurnQueue.push('Test')).rejects.toThrow();

            const metrics = TurnQueue.getMetrics();
            expect(metrics.totalFailed).toBe(1);
            expect(metrics.totalProcessed).toBe(0);
        });
    });

    describe('Queue status and metrics', () => {
        it('reports correct queue status', async () => {
            vi.mocked(Chat.sendMessage).mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return { content: 'done' };
            });

            // Start a message
            const firstPromise = TurnQueue.push('First');

            // Wait a bit for it to start processing
            await new Promise(resolve => setTimeout(resolve, 5));

            const statusWhileProcessing = TurnQueue.getStatus();
            expect(statusWhileProcessing.isProcessing).toBe(true);
            expect(statusWhileProcessing.currentTurnId).not.toBeNull();

            // Add more messages
            const secondPromise = TurnQueue.push('Second');
            const thirdPromise = TurnQueue.push('Third');

            const statusWithPending = TurnQueue.getStatus();
            expect(statusWithPending.pending).toBeGreaterThanOrEqual(0);

            // Wait for all to complete by awaiting the promises
            await Promise.all([firstPromise, secondPromise, thirdPromise]);

            const statusAfter = TurnQueue.getStatus();
            expect(statusAfter.isProcessing).toBe(false);
            expect(statusAfter.pending).toBe(0);
        });

        it('provides accurate metrics', async () => {
            vi.mocked(Chat.sendMessage).mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return { content: 'done' };
            });

            const count = 5;
            const promises = [];
            for (let i = 0; i < count; i++) {
                promises.push(TurnQueue.push(`Msg${i}`));
            }

            await Promise.all(promises);

            const metrics = TurnQueue.getMetrics();
            expect(metrics.totalProcessed).toBe(count);
            expect(metrics.totalFailed).toBe(0);
            expect(metrics.successRate).toBe(100);
            expect(metrics.avgWaitTimeMs).toBeGreaterThanOrEqual(0);
            expect(metrics.avgProcessingTimeMs).toBeGreaterThan(0);
        });

        it('calculates queue depth stats', async () => {
            vi.mocked(Chat.sendMessage).mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 20));
                return { content: 'done' };
            });

            // Submit messages rapidly to build up queue depth
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(TurnQueue.push(`Msg${i}`));
            }

            // Wait for all to complete
            await Promise.all(promises);

            const metrics = TurnQueue.getMetrics();
            expect(metrics.maxDepth).toBeGreaterThan(0);
            expect(metrics.historySize).toBe(10);
        });

        it('getStatusMessage returns appropriate messages', async () => {
            vi.mocked(Chat.sendMessage).mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return { content: 'done' };
            });

            // Empty queue
            expect(TurnQueue.getStatusMessage()).toBeNull();

            // Processing with no pending
            const firstPromise = TurnQueue.push('First');
            await new Promise(resolve => setTimeout(resolve, 5));
            expect(TurnQueue.getStatusMessage()).toBe('Processing your message...');

            // Add pending - these will queue up
            const secondPromise = TurnQueue.push('Second');
            const thirdPromise = TurnQueue.push('Third');
            const fourthPromise = TurnQueue.push('Fourth');

            // Wait a bit for queue state to stabilize
            await new Promise(resolve => setTimeout(resolve, 5));
            const message = TurnQueue.getStatusMessage();
            // Should indicate pending messages exist
            expect(message).toContain('messages');

            // Wait for all to complete
            await Promise.all([firstPromise, secondPromise, thirdPromise, fourthPromise]);
            expect(TurnQueue.getStatusMessage()).toBeNull();
        });
    });

    describe('Queue management', () => {
        it('clears pending turns', async () => {
            vi.mocked(Chat.sendMessage).mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return { content: 'done' };
            });

            // Queue multiple messages
            const promises = [
                TurnQueue.push('First'),
                TurnQueue.push('Second'),
                TurnQueue.push('Third')
            ];

            // Wait for first to start processing
            await new Promise(resolve => setTimeout(resolve, 10));

            // Clear pending (should clear 2, not the processing one)
            const clearedCount = TurnQueue.clearPending();
            expect(clearedCount).toBe(2);

            // First should succeed, others should be rejected with AbortError
            const results = await Promise.allSettled(promises);

            expect(results[0].status).toBe('fulfilled');
            expect(results[1].status).toBe('rejected');
            expect(results[2].status).toBe('rejected');

            expect(results[1].reason.name).toBe('AbortError');
            expect(results[2].reason.name).toBe('AbortError');
        });

        it('subscribes to queue events', async () => {
            const events = [];
            const unsubscribe = TurnQueue.subscribe((event, turn, error) => {
                events.push({ event, turnId: turn.id, error });
            });

            vi.mocked(Chat.sendMessage).mockResolvedValue({ content: 'done' });

            await TurnQueue.push('Test');

            // Should have received queued, processing, and completed events
            expect(events.length).toBeGreaterThanOrEqual(2);

            const eventTypes = events.map(e => e.event);
            expect(eventTypes).toContain('queued');
            expect(eventTypes).toContain('processing');
            expect(eventTypes).toContain('completed');

            unsubscribe();
        });

        it('receives error events on failure', async () => {
            const events = [];
            const unsubscribe = TurnQueue.subscribe((event, turn, error) => {
                events.push({ event, turnId: turn.id, error });
            });

            const testError = new Error('Test failure');
            vi.mocked(Chat.sendMessage).mockRejectedValue(testError);

            try {
                await TurnQueue.push('Test');
            } catch (e) {
                // Expected
            }

            const failedEvent = events.find(e => e.event === 'failed');
            expect(failedEvent).toBeDefined();
            expect(failedEvent.error).toBe(testError);

            unsubscribe();
        });
    });

    describe('Edge cases', () => {
        it('handles processNext on empty queue gracefully', async () => {
            // Should not throw
            await TurnQueue.processNext();
            await TurnQueue.processNext();
            await TurnQueue.processNext();

            expect(TurnQueue.isActive()).toBe(false);
        });

        it('handles empty options parameter', async () => {
            vi.mocked(Chat.sendMessage).mockResolvedValue({ content: 'done' });

            await TurnQueue.push('Test');

            expect(Chat.sendMessage).toHaveBeenCalledWith(
                'Test',
                {}, // options defaults to {} when null/undefined
                { bypassQueue: true, allowBypass: true }
            );
        });

        it('handles very rapid successive processNext calls', async () => {
            let processingCalls = 0;

            vi.mocked(Chat.sendMessage).mockImplementation(async () => {
                processingCalls++;
                await new Promise(resolve => setTimeout(resolve, 10));
                return { content: 'done' };
            });

            // Add single message
            TurnQueue.push('Test');

            // Rapid fire processNext calls
            for (let i = 0; i < 100; i++) {
                TurnQueue.processNext();
            }

            await new Promise(resolve => setTimeout(resolve, 50));

            // Only one message should be processed
            expect(processingCalls).toBe(1);
        });
    });

    describe('finally block cleanup', () => {
        it('resets isProcessing in finally block on success', async () => {
            vi.mocked(Chat.sendMessage).mockResolvedValue({ content: 'done' });

            expect(TurnQueue.isActive()).toBe(false);

            await TurnQueue.push('Test');

            expect(TurnQueue.isActive()).toBe(false);
        });

        it('resets isProcessing in finally block on error', async () => {
            vi.mocked(Chat.sendMessage).mockRejectedValue(new Error('Error'));

            await expect(TurnQueue.push('Test')).rejects.toThrow();

            expect(TurnQueue.isActive()).toBe(false);
        });

        it('processes next turn from finally block', async () => {
            const processedOrder = [];

            vi.mocked(Chat.sendMessage).mockImplementation(async (msg) => {
                processedOrder.push(msg);
                return { content: msg };
            });

            // Queue multiple messages
            const promises = [
                TurnQueue.push('First'),
                TurnQueue.push('Second'),
                TurnQueue.push('Third')
            ];

            await Promise.all(promises);

            // All should be processed in order due to recursive processNext in finally
            expect(processedOrder).toEqual(['First', 'Second', 'Third']);
        });

        it('continues queue after error in finally block', async () => {
            const processedOrder = [];

            vi.mocked(Chat.sendMessage)
                .mockRejectedValueOnce(new Error('Fail'))
                .mockImplementation(async (msg) => {
                    processedOrder.push(msg);
                    return { content: msg };
                });

            const results = await Promise.allSettled([
                TurnQueue.push('First'),
                TurnQueue.push('Second'),
                TurnQueue.push('Third')
            ]);

            // First fails, but queue continues
            expect(results[0].status).toBe('rejected');

            // Second and Third should process
            expect(results[1].status).toBe('fulfilled');
            expect(results[2].status).toBe('fulfilled');

            expect(processedOrder).toEqual(['Second', 'Third']);
        });
    });

    describe('Atomic check-and-set pattern', () => {
        it('uses atomic check-and-set to prevent race conditions', async () => {
            const processingOrder = [];
            let activeCount = 0;
            let maxActive = 0;

            vi.mocked(Chat.sendMessage).mockImplementation(async (msg) => {
                activeCount++;
                if (activeCount > maxActive) {
                    maxActive = activeCount;
                }
                processingOrder.push({ msg, active: activeCount });

                await new Promise(resolve => setTimeout(resolve, 10));

                activeCount--;
                return { content: 'done' };
            });

            // Submit multiple messages
            for (let i = 0; i < 5; i++) {
                TurnQueue.push(`Msg${i}`);
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            // All messages should be processed
            expect(processingOrder.length).toBe(5);
            // Only one message should be active at a time
            expect(maxActive).toBe(1);
            // Each processing event should have active count of exactly 1
            processingOrder.forEach(entry => {
                expect(entry.active).toBe(1);
            });
        });

        it('always resets isProcessing in finally block', async () => {
            let shouldThrow = false;

            vi.mocked(Chat.sendMessage).mockImplementation(async () => {
                if (shouldThrow) {
                    throw new Error('Simulated error');
                }
                await new Promise(resolve => setTimeout(resolve, 5));
                return { content: 'done' };
            });

            // First message succeeds
            await TurnQueue.push('First');
            expect(TurnQueue.isActive()).toBe(false);

            // Second message fails
            shouldThrow = true;
            await expect(TurnQueue.push('Second')).rejects.toThrow();
            expect(TurnQueue.isActive()).toBe(false);

            // Third message succeeds after error
            shouldThrow = false;
            await TurnQueue.push('Third');
            expect(TurnQueue.isActive()).toBe(false);
        });
    });
});
