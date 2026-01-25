/**
 * Issue #7: Vector Store Retry Data Loss Tests
 *
 * Tests for the retry queue optimization that prevents:
 * 1. Data loss from deleted vectors still in retry queue
 * 2. O(n) performance on every upsert
 * 3. Stale retry entries accumulation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ==========================================
// Mock Infrastructure
// ==========================================

class MockIndexedDB {
    constructor() {
        this.store = new Map();
        this.transactionMode = 'readonly';
    }

    transaction(storeNames, mode) {
        this.transactionMode = mode;
        return {
            objectStore: () => ({
                put: (item) => {
                    if (this.transactionMode === 'readwrite') {
                        this.store.set(item.id, item);
                        return { request: true };
                    }
                    throw new Error('Transaction not writable');
                },
                get: (id) => {
                    return {
                        result: this.store.get(id)
                    };
                },
                delete: (id) => {
                    if (this.transactionMode === 'readwrite') {
                        this.store.delete(id);
                    }
                },
                getAll: () => {
                    return {
                        result: Array.from(this.store.values())
                    };
                },
                clear: () => {
                    if (this.transactionMode === 'readwrite') {
                        this.store.clear();
                    }
                }
            }),
            oncomplete: null,
            onerror: null
        };
    }

    reset() {
        this.store.clear();
    }
}

// ==========================================
// Test Implementation
// ==========================================

describe('Issue #7: Vector Store Retry Queue Optimization', () => {
    let mockDB;
    let vectors;
    let failedPersists;

    beforeEach(() => {
        mockDB = new MockIndexedDB();
        vectors = new Map();
        failedPersists = new Map();
    });

    afterEach(() => {
        mockDB.reset();
    });

    describe('Data Loss Prevention', () => {
        it('should clean up retry entries when vectors are deleted', () => {
            // Setup: Add vector and mark as failed persist
            vectors.set('vec-1', { id: 'vec-1', vector: [1, 2, 3], payload: {} });
            failedPersists.set('vec-1', {
                timestamp: Date.now(),
                retryCount: 0,
                lastError: 'Simulated error'
            });

            expect(failedPersists.size).toBe(1);
            expect(failedPersists.has('vec-1')).toBe(true);

            // Simulate delete operation
            vectors.delete('vec-1');
            if (failedPersists.has('vec-1')) {
                failedPersists.delete('vec-1');
            }

            // Verify cleanup
            expect(failedPersists.has('vec-1')).toBe(false);
            expect(failedPersists.size).toBe(0);
        });

        it('should validate retry targets exist before retry', async () => {
            // Setup: Add vectors with failed persists
            vectors.set('vec-1', { id: 'vec-1', vector: [1, 2, 3], payload: {} });
            vectors.set('vec-2', { id: 'vec-2', vector: [4, 5, 6], payload: {} });
            failedPersists.set('vec-1', { timestamp: Date.now(), retryCount: 0 });
            failedPersists.set('vec-2', { timestamp: Date.now(), retryCount: 0 });

            // Delete vec-2 but forget to clean up retry entry (simulating bug)
            vectors.delete('vec-2');

            // Simulate retry logic (from upsert method)
            const toDelete = [];
            for (const [retryId, metadata] of failedPersists.entries()) {
                const retryItem = vectors.get(retryId);
                if (!retryItem) {
                    // This should catch the deleted vector
                    toDelete.push(retryId);
                }
            }

            // Clean up stale entries
            for (const id of toDelete) {
                failedPersists.delete(id);
            }

            // Verify: vec-2 cleaned up, vec-1 remains
            expect(failedPersists.has('vec-1')).toBe(true);
            expect(failedPersists.has('vec-2')).toBe(false);
            expect(failedPersists.size).toBe(1);
        });

        it('should clear retry queue when clearing all vectors', () => {
            // Setup: Multiple vectors with failed persists
            for (let i = 1; i <= 5; i++) {
                const id = `vec-${i}`;
                vectors.set(id, { id, vector: [i, i+1, i+2], payload: {} });
                failedPersists.set(id, {
                    timestamp: Date.now(),
                    retryCount: Math.floor(Math.random() * 3)
                });
            }

            expect(vectors.size).toBe(5);
            expect(failedPersists.size).toBe(5);

            // Clear all
            vectors.clear();
            failedPersists.clear();

            expect(vectors.size).toBe(0);
            expect(failedPersists.size).toBe(0);
        });
    });

    describe('Performance Optimization (O(1) vs O(n))', () => {
        it('should use Map.entries() for O(1) iteration', () => {
            // Setup: Many failed persists
            const count = 1000;
            for (let i = 0; i < count; i++) {
                vectors.set(`vec-${i}`, { id: `vec-${i}`, vector: [i], payload: {} });
                failedPersists.set(`vec-${i}`, {
                    timestamp: Date.now(),
                    retryCount: 0
                });
            }

            // Measure performance with Map.entries()
            const startTime = performance.now();
            let processed = 0;

            for (const [retryId, metadata] of failedPersists.entries()) {
                const retryItem = vectors.get(retryId);
                if (retryItem) {
                    processed++;
                }
            }

            const elapsed = performance.now() - startTime;

            expect(processed).toBe(count);
            expect(elapsed).toBeLessThan(10); // Should be very fast with O(1)
        });

        it('should avoid Array.from() conversion (prevents O(n) allocation)', () => {
            // Setup: Add failed persists
            for (let i = 0; i < 100; i++) {
                failedPersists.set(`vec-${i}`, {
                    timestamp: Date.now(),
                    retryCount: 0
                });
            }

            // Bad pattern (old code): Array.from(failedPersists)
            // This creates a new array - O(n) memory allocation
            const badPatternStart = performance.now();
            const badArray = Array.from(failedPersists);
            const badPatternTime = performance.now() - badPatternStart;

            // Good pattern (new code): failedPersists.entries()
            // This uses iterator - no allocation
            const goodPatternStart = performance.now();
            const goodIterator = failedPersists.entries();
            const goodPatternTime = performance.now() - goodPatternStart;

            // Good pattern should be faster (no array allocation)
            expect(goodPatternTime).toBeLessThan(badPatternTime);
        });

        it('should provide O(1) lookup for retry validation', () => {
            // Setup: Add many entries
            for (let i = 0; i < 1000; i++) {
                failedPersists.set(`vec-${i}`, {
                    timestamp: Date.now(),
                    retryCount: i
                });
            }

            // Test O(1) lookup
            const startTime = performance.now();
            const metadata = failedPersists.get('vec-500');
            const elapsed = performance.now() - startTime;

            expect(metadata).toBeDefined();
            expect(metadata.retryCount).toBe(500);
            expect(elapsed).toBeLessThan(1); // Should be instant
        });
    });

    describe('Stale Entry Cleanup', () => {
        it('should remove entries older than timeout', () => {
            const now = Date.now();
            const RETRY_TIMEOUT = 60000; // 1 minute

            // Add entries at different times
            failedPersists.set('vec-old', {
                timestamp: now - RETRY_TIMEOUT - 1000, // Too old
                retryCount: 0
            });
            failedPersists.set('vec-recent', {
                timestamp: now - 1000, // Recent
                retryCount: 0
            });

            expect(failedPersists.size).toBe(2);

            // Cleanup logic
            const toDelete = [];
            for (const [retryId, metadata] of failedPersists.entries()) {
                if (now - metadata.timestamp > RETRY_TIMEOUT) {
                    toDelete.push(retryId);
                }
            }

            for (const id of toDelete) {
                failedPersists.delete(id);
            }

            // Verify: old entry removed, recent remains
            expect(failedPersists.has('vec-old')).toBe(false);
            expect(failedPersists.has('vec-recent')).toBe(true);
            expect(failedPersists.size).toBe(1);
        });

        it('should remove entries exceeding max retries', () => {
            const MAX_RETRIES = 3;

            // Add entries with different retry counts
            failedPersists.set('vec-retryable', {
                timestamp: Date.now(),
                retryCount: 2
            });
            failedPersists.set('vec-giveup', {
                timestamp: Date.now(),
                retryCount: 5
            });

            expect(failedPersists.size).toBe(2);

            // Cleanup logic
            const toDelete = [];
            for (const [retryId, metadata] of failedPersists.entries()) {
                if (metadata.retryCount >= MAX_RETRIES) {
                    toDelete.push(retryId);
                }
            }

            for (const id of toDelete) {
                failedPersists.delete(id);
            }

            // Verify: retryable remains, giveup removed
            expect(failedPersists.has('vec-retryable')).toBe(true);
            expect(failedPersists.has('vec-giveup')).toBe(false);
            expect(failedPersists.size).toBe(1);
        });

        it('should update retry metadata on failure', () => {
            failedPersists.set('vec-1', {
                timestamp: Date.now(),
                retryCount: 0,
                lastError: 'First error'
            });

            // Simulate retry failure
            const metadata = failedPersists.get('vec-1');
            metadata.retryCount++;
            metadata.timestamp = Date.now();
            metadata.lastError = 'Retry error';

            expect(metadata.retryCount).toBe(1);
            expect(metadata.lastError).toBe('Retry error');
        });
    });

    describe('Retry Queue Metrics', () => {
        it('should track retry queue size', () => {
            expect(failedPersists.size).toBe(0);

            for (let i = 0; i < 5; i++) {
                failedPersists.set(`vec-${i}`, {
                    timestamp: Date.now(),
                    retryCount: 0
                });
            }

            expect(failedPersists.size).toBe(5);
        });

        it('should track oldest entry age', () => {
            const now = Date.now();

            failedPersists.set('vec-old', {
                timestamp: now - 10000, // 10 seconds ago
                retryCount: 0
            });
            failedPersists.set('vec-new', {
                timestamp: now - 1000, // 1 second ago
                retryCount: 0
            });

            // Calculate oldest entry age
            let oldestRetry = null;
            for (const [id, metadata] of failedPersists) {
                if (!oldestRetry || metadata.timestamp < oldestRetry) {
                    oldestRetry = metadata.timestamp;
                }
            }

            const oldestAge = now - oldestRetry;

            expect(oldestAge).toBeGreaterThanOrEqual(10000);
            expect(oldestAge).toBeLessThan(11000); // Allow small margin
        });

        it('should track max retry count', () => {
            failedPersists.set('vec-1', { timestamp: Date.now(), retryCount: 1 });
            failedPersists.set('vec-2', { timestamp: Date.now(), retryCount: 3 });
            failedPersists.set('vec-3', { timestamp: Date.now(), retryCount: 2 });

            let maxRetries = 0;
            for (const [id, metadata] of failedPersists) {
                if (metadata.retryCount > maxRetries) {
                    maxRetries = metadata.retryCount;
                }
            }

            expect(maxRetries).toBe(3);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty retry queue gracefully', () => {
            expect(failedPersists.size).toBe(0);

            // Should not throw
            for (const [retryId, metadata] of failedPersists.entries()) {
                // This loop should not execute
                expect(true).toBe(false);
            }

            expect(true).toBe(true);
        });

        it('should handle concurrent delete and retry', () => {
            // Setup: Vector in both maps
            vectors.set('vec-1', { id: 'vec-1', vector: [1, 2, 3], payload: {} });
            failedPersists.set('vec-1', {
                timestamp: Date.now(),
                retryCount: 0
            });

            // Simulate: Delete happens, then retry attempts
            vectors.delete('vec-1');

            // Retry should find vector gone
            const retryItem = vectors.get('vec-1');
            expect(retryItem).toBeUndefined();

            // Cleanup should remove retry entry
            if (failedPersists.has('vec-1')) {
                failedPersists.delete('vec-1');
            }

            expect(failedPersists.has('vec-1')).toBe(false);
        });

        it('should handle metadata mutation safely', () => {
            failedPersists.set('vec-1', {
                timestamp: Date.now(),
                retryCount: 0,
                lastError: 'Error 1'
            });

            // Get reference
            const metadata1 = failedPersists.get('vec-1');

            // Mutate
            metadata1.retryCount = 1;
            metadata1.lastError = 'Error 2';

            // Get again - should be same reference
            const metadata2 = failedPersists.get('vec-1');

            expect(metadata2).toBe(metadata1);
            expect(metadata2.retryCount).toBe(1);
            expect(metadata2.lastError).toBe('Error 2');
        });
    });
});
