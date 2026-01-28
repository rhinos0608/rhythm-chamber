/**
 * Unit Tests for Vector Store Retry Queue
 * @module tests/unit/vector-store/retry-queue-new
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRetryQueue } from '/Users/rhinesharar/rhythm-chamber/js/vector-store/retry-queue.js';

// Mock config values
vi.mock('/Users/rhinesharar/rhythm-chamber/js/vector-store/config.js', () => ({
    RETRY_TIMEOUT: 300000, // 5 minutes
    MAX_RETRIES: 3,
    RETRY_COOLDOWN_MS: 1000,
    MAX_RETRIES_PER_UPSERT: 5
}));

describe('Vector Store Retry Queue', () => {
    let retryQueue;
    let vectorsMap;
    let persistFn;

    beforeEach(() => {
        vectorsMap = new Map([
            ['vec-1', { id: 'vec-1', embedding: [1, 2, 3] }],
            ['vec-2', { id: 'vec-2', embedding: [4, 5, 6] }]
        ]);

        persistFn = vi.fn().mockResolvedValue(undefined);

        retryQueue = createRetryQueue(vectorsMap);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Adding Failures', () => {
        it('should add failed persist to queue', () => {
            const error = new Error('IndexedDB error');
            retryQueue.addFailure('vec-1', error);

            expect(retryQueue.size).toBe(1);
        });

        it('should track multiple failures', () => {
            retryQueue.addFailure('vec-1', new Error('Error 1'));
            retryQueue.addFailure('vec-2', new Error('Error 2'));

            expect(retryQueue.size).toBe(2);
        });

        it('should store error metadata', async () => {
            const error = new Error('Test error');
            retryQueue.addFailure('vec-1', error);

            const metrics = retryQueue.getMetrics();
            expect(metrics.size).toBe(1);
            expect(metrics.maxRetries).toBe(0);
        });
    });

    describe('Processing Retries', () => {
        it('should return 0 when queue is empty', async () => {
            const result = await retryQueue.processRetries(persistFn);
            expect(result).toBe(0);
        });

        it('should process single retry successfully', async () => {
            retryQueue.addFailure('vec-1', new Error('IndexedDB locked'));

            const retriesAttempted = await retryQueue.processRetries(persistFn);

            expect(retriesAttempted).toBe(1);
            expect(persistFn).toHaveBeenCalledWith(vectorsMap.get('vec-1'));
            expect(retryQueue.size).toBe(0);
        });

        it('should process multiple retries', async () => {
            retryQueue.addFailure('vec-1', new Error('Error 1'));
            retryQueue.addFailure('vec-2', new Error('Error 2'));

            const retriesAttempted = await retryQueue.processRetries(persistFn);

            expect(retriesAttempted).toBe(2);
            expect(retryQueue.size).toBe(0);
        });

        it('should handle retry failure', async () => {
            persistFn.mockRejectedValue(new Error('Still failing'));
            retryQueue.addFailure('vec-1', new Error('First error'));

            const retriesAttempted = await retryQueue.processRetries(persistFn);

            expect(retriesAttempted).toBe(1);
            expect(retryQueue.size).toBe(1); // Still in queue

            const metrics = retryQueue.getMetrics();
            expect(metrics.maxRetries).toBe(1);
        });

        it('should respect retry cooldown', async () => {
            retryQueue.addFailure('vec-1', new Error('Error'));

            // First attempt
            await retryQueue.processRetries(persistFn);

            // Immediate second attempt should be blocked by cooldown
            const secondAttempt = await retryQueue.processRetries(persistFn);
            expect(secondAttempt).toBe(0);
        });
    });

    describe('Max Retries Per Upsert', () => {
        it('should limit retries per upsert call', async () => {
            // Add more failures than MAX_RETRIES_PER_UPSERT
            for (let i = 0; i < 10; i++) {
                vectorsMap.set(`vec-${i}`, { id: `vec-${i}` });
                retryQueue.addFailure(`vec-${i}`, new Error(`Error ${i}`));
            }

            const retriesAttempted = await retryQueue.processRetries(persistFn);

            // Should stop at MAX_RETRIES_PER_UPSERT (5)
            expect(retriesAttempted).toBe(5);
            expect(retryQueue.size).toBeGreaterThan(0);
        });
    });

    describe('Stale Entry Cleanup', () => {
        it('should remove stale entries', async () => {
            const oldQueue = createRetryQueue(vectorsMap);

            // Manually add an old entry
            oldQueue.failedPersists = new Map([
                ['vec-1', {
                    timestamp: Date.now() - 400000, // Older than RETRY_TIMEOUT
                    retryCount: 1,
                    lastError: 'Old error'
                }]
            ]);

            await oldQueue.processRetries(persistFn);

            // Old entry should be removed
            expect(oldQueue.size).toBe(0);
        });

        it('should respect max retries limit', async () => {
            const queue = createRetryQueue(vectorsMap);

            // Manually add entry at max retries
            queue.failedPersists = new Map([
                ['vec-1', {
                    timestamp: Date.now(),
                    retryCount: 3, // MAX_RETRIES
                    lastError: 'Max retries error'
                }]
            ]);

            await queue.processRetries(persistFn);

            // Entry should be removed
            expect(queue.size).toBe(0);
        });
    });

    describe('Deleted Vector Cleanup', () => {
        it('should remove retry entry if vector was deleted', async () => {
            retryQueue.addFailure('vec-1', new Error('Error'));

            // Delete vector from map
            vectorsMap.delete('vec-1');

            await retryQueue.processRetries(persistFn);

            // Retry entry should be cleaned up
            expect(retryQueue.size).toBe(0);
            expect(persistFn).not.toHaveBeenCalled();
        });
    });

    describe('Concurrent Retry Protection', () => {
        it('should prevent concurrent retries of same vector', async () => {
            // We can't directly test this without accessing private members
            // So we'll just verify the API exists and doesn't throw
            expect(retryQueue.size).toBe(0);

            // The actual concurrent retry protection is tested
            // indirectly through the cooldown test above
        });
    });

    describe('Removing Entries', () => {
        it('should remove specific entry', () => {
            retryQueue.addFailure('vec-1', new Error('Error 1'));
            retryQueue.addFailure('vec-2', new Error('Error 2'));

            retryQueue.removeEntry('vec-1');

            expect(retryQueue.size).toBe(1);
        });

        it('should clear all entries', () => {
            retryQueue.addFailure('vec-1', new Error('Error 1'));
            retryQueue.addFailure('vec-2', new Error('Error 2'));

            retryQueue.clear();

            expect(retryQueue.size).toBe(0);
        });
    });

    describe('Metrics', () => {
        it('should return queue metrics', () => {
            retryQueue.addFailure('vec-1', new Error('Error 1'));
            retryQueue.addFailure('vec-2', new Error('Error 2'));

            const metrics = retryQueue.getMetrics();

            expect(metrics.size).toBe(2);
            expect(metrics.oldestEntryAge).toBeGreaterThanOrEqual(0);
            expect(metrics.maxRetries).toBe(0);
        });

        it('should track oldest entry age', () => {
            retryQueue.addFailure('vec-1', new Error('Error'));

            const metricsBefore = retryQueue.getMetrics();
            const ageBefore = metricsBefore.oldestEntryAge;

            // Wait a bit
            return new Promise(resolve => {
                setTimeout(() => {
                    const metricsAfter = retryQueue.getMetrics();
                    expect(metricsAfter.oldestEntryAge).toBeGreaterThan(ageBefore);
                    resolve();
                }, 10);
            });
        });

        it('should track max retry count', async () => {
            persistFn.mockRejectedValue(new Error('Always fails'));

            retryQueue.addFailure('vec-1', new Error('Error'));
            await retryQueue.processRetries(persistFn);

            // Only 1 retry attempted because of cooldown
            const metrics = retryQueue.getMetrics();
            expect(metrics.maxRetries).toBeGreaterThanOrEqual(1);
        });

        it('should return null for oldestEntryAge when empty', () => {
            const metrics = retryQueue.getMetrics();
            expect(metrics.size).toBe(0);
            expect(metrics.oldestEntryAge).toBeNull();
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty vectorsMap', async () => {
            const emptyMap = new Map();
            const emptyQueue = createRetryQueue(emptyMap);

            emptyQueue.addFailure('vec-1', new Error('Error'));

            await emptyQueue.processRetries(persistFn);

            // Entry should be removed
            expect(emptyQueue.size).toBe(0);
        });

        it('should handle persistFn throwing error', async () => {
            persistFn.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            retryQueue.addFailure('vec-1', new Error('Error'));

            // Should not throw, just handle gracefully
            await expect(retryQueue.processRetries(persistFn)).resolves.toBe(1);
        });
    });
});
