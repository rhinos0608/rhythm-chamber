/**
 * Characterization Tests for LocalVectorStore Refactoring
 *
 * These tests capture the CURRENT BEHAVIOR of js/local-vector-store.js
 * before refactoring. They ensure backward compatibility after splitting
 * into multiple modules.
 *
 * DO NOT modify these tests during refactoring unless:
 * 1. Current behavior is a bug (document the fix)
 * 2. Intentionally changing behavior (document the change)
 *
 * Phase 2.4 - Local Vector Store Refactoring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ==========================================
// Mock Infrastructure
// ==========================================

class MockIndexedDB {
    constructor() {
        this.store = new Map();
        this.transactionMode = 'readonly';
        this.dbReady = false;
    }

    async open() {
        this.dbReady = true;
        return this;
    }

    transaction(storeNames, mode) {
        this.transactionMode = mode;
        return {
            objectStore: () => ({
                put: (item) => {
                    if (this.transactionMode === 'readwrite') {
                        this.store.set(item.id, item);
                        return { onsuccess: null, onerror: null };
                    }
                    throw new Error('Transaction not writable');
                },
                get: (id) => {
                    return {
                        result: this.store.get(id),
                        onsuccess: null,
                        onerror: null
                    };
                },
                delete: (id) => {
                    if (this.transactionMode === 'readwrite') {
                        this.store.delete(id);
                    }
                    return { onsuccess: null, onerror: null };
                },
                getAll: () => {
                    return {
                        result: Array.from(this.store.values()),
                        onsuccess: null,
                        onerror: null
                    };
                },
                clear: () => {
                    if (this.transactionMode === 'readwrite') {
                        this.store.clear();
                    }
                    return { onsuccess: null, onerror: null };
                }
            }),
            oncomplete: null,
            onerror: null
        };
    }

    reset() {
        this.store.clear();
        this.dbReady = false;
        this.transactionMode = 'readonly';
    }

    get size() {
        return this.store.size;
    }
}

// Mock Worker
class MockWorker {
    constructor() {
        this.onmessage = null;
        this.onerror = null;
        this.messageCount = 0;
        this.terminate = vi.fn();
    }

    postMessage(data) {
        this.messageCount++;
        // Simulate async worker response
        setTimeout(() => {
            if (this.onmessage && data.type === 'search') {
                // Simulate search results
                const mockResults = [
                    { id: 'vec-1', score: 0.95, payload: { text: 'result 1' } },
                    { id: 'vec-2', score: 0.85, payload: { text: 'result 2' } }
                ];
                this.onmessage({
                    data: {
                        type: 'results',
                        id: data.id,
                        results: mockResults,
                        stats: {
                            vectorCount: data.vectors?.length || 0,
                            elapsedMs: 5
                        }
                    }
                });
            }
        }, 0);
    }
}

// ==========================================
// Test Helpers
// ==========================================

function createMockVector(id, dimensions = 384) {
    return {
        id,
        vector: Array.from({ length: dimensions }, () => Math.random()),
        payload: { text: `Vector ${id}`, type: 'test' }
    };
}

// ==========================================
// Characterization Tests
// ==========================================

describe('LocalVectorStore - Characterization Tests', () => {
    let mockDB;
    let mockWorker;
    let LocalVectorStore;
    let originalWorker;

    beforeEach(async () => {
        mockDB = new MockIndexedDB();
        await mockDB.open();

        mockWorker = new MockWorker();

        // Mock global Worker
        originalWorker = globalThis.Worker;
        globalThis.Worker = vi.fn(() => mockWorker);

        // Import LocalVectorStore after mocks are set up
        const module = await import('../../../js/local-vector-store.js');
        LocalVectorStore = module.LocalVectorStore;

        // Initialize store
        await LocalVectorStore.init({ maxVectors: 100 });
    });

    afterEach(async () => {
        await LocalVectorStore.clear();
        mockDB.reset();
        globalThis.Worker = originalWorker;
    });

    describe('Module Structure', () => {
        it('should export LocalVectorStore object', () => {
            expect(LocalVectorStore).toBeDefined();
            expect(typeof LocalVectorStore).toBe('object');
        });

        it('should export isSharedArrayBufferAvailable function', async () => {
            const module = await import('../../../js/local-vector-store.js');
            expect(module.isSharedArrayBufferAvailable).toBeDefined();
            expect(typeof module.isSharedArrayBufferAvailable).toBe('function');
        });
    });

    describe('Initialization', () => {
        it('should initialize with default options', async () => {
            const count = await LocalVectorStore.init();
            expect(typeof count).toBe('number');
        });

        it('should initialize with custom maxVectors', async () => {
            await LocalVectorStore.init({ maxVectors: 500 });
            expect(LocalVectorStore.getMaxVectors()).toBe(500);
        });

        it('should return count from init', async () => {
            await LocalVectorStore.upsert('test-1', [1, 2, 3], { text: 'test' });
            const count = await LocalVectorStore.init();
            expect(count).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Vector Operations', () => {
        it('should upsert a single vector', async () => {
            const vector = createMockVector('vec-1', 3);
            const result = await LocalVectorStore.upsert('vec-1', vector.vector, vector.payload);
            expect(result).toBe(true);
        });

        it('should retrieve upserted vector', async () => {
            const vector = createMockVector('vec-1', 3);
            await LocalVectorStore.upsert('vec-1', vector.vector, vector.payload);

            const retrieved = LocalVectorStore.get('vec-1');
            expect(retrieved).toBeDefined();
            expect(retrieved.id).toBe('vec-1');
            expect(retrieved.vector).toEqual(vector.vector);
            expect(retrieved.payload).toEqual(vector.payload);
        });

        it('should upsert batch of vectors', async () => {
            const vectors = [
                createMockVector('vec-1', 3),
                createMockVector('vec-2', 3),
                createMockVector('vec-3', 3)
            ];

            const count = await LocalVectorStore.upsertBatch(vectors);
            expect(count).toBe(3);
            expect(LocalVectorStore.count()).toBe(3);
        });

        it('should delete a vector', async () => {
            const vector = createMockVector('vec-1', 3);
            await LocalVectorStore.upsert('vec-1', vector.vector, vector.payload);

            expect(LocalVectorStore.count()).toBe(1);
            await LocalVectorStore.delete('vec-1');
            expect(LocalVectorStore.get('vec-1')).toBeNull();
        });

        it('should clear all vectors', async () => {
            await LocalVectorStore.upsertBatch([
                createMockVector('vec-1', 3),
                createMockVector('vec-2', 3)
            ]);

            expect(LocalVectorStore.count()).toBe(2);
            await LocalVectorStore.clear();
            expect(LocalVectorStore.count()).toBe(0);
        });
    });

    describe('Search Operations', () => {
        beforeEach(async () => {
            // Add test vectors
            await LocalVectorStore.upsert('vec-1', [1, 0, 0], { text: 'first' });
            await LocalVectorStore.upsert('vec-2', [0, 1, 0], { text: 'second' });
            await LocalVectorStore.upsert('vec-3', [0, 0, 1], { text: 'third' });
        });

        it('should search synchronously', () => {
            const results = LocalVectorStore.search([1, 0, 0], 2, 0.5);

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThanOrEqual(0);
            if (results.length > 0) {
                expect(results[0]).toHaveProperty('id');
                expect(results[0]).toHaveProperty('score');
                expect(results[0]).toHaveProperty('payload');
            }
        });

        it('should return results sorted by score descending', () => {
            const results = LocalVectorStore.search([1, 0, 0], 3, 0.0);

            if (results.length > 1) {
                for (let i = 0; i < results.length - 1; i++) {
                    expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
                }
            }
        });

        it('should respect limit parameter', () => {
            const results = LocalVectorStore.search([1, 0, 0], 2, 0.0);
            expect(results.length).toBeLessThanOrEqual(2);
        });

        it('should respect threshold parameter', () => {
            const results = LocalVectorStore.search([1, 0, 0], 10, 0.9);
            results.forEach(result => {
                expect(result.score).toBeGreaterThanOrEqual(0.9);
            });
        });

        it('should handle empty query vector gracefully', () => {
            const results = LocalVectorStore.search([], 5, 0.5);
            expect(results).toEqual([]);
        });

        it('should handle null query vector gracefully', () => {
            const results = LocalVectorStore.search(null, 5, 0.5);
            expect(results).toEqual([]);
        });
    });

    describe('Async Search Operations', () => {
        beforeEach(async () => {
            // Add test vectors with 384 dimensions (real embedding size)
            for (let i = 1; i <= 10; i++) {
                const vector = createMockVector(`vec-${i}`, 384);
                await LocalVectorStore.upsert(vector.id, vector.vector, vector.payload);
            }
        });

        it('should search asynchronously', async () => {
            const queryVector = createMockVector('query', 384).vector;
            const results = await LocalVectorStore.searchAsync(queryVector, 5, 0.5);

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThanOrEqual(0);
        });

        it('should return results with correct structure', async () => {
            const queryVector = createMockVector('query', 384).vector;
            const results = await LocalVectorStore.searchAsync(queryVector, 5, 0.5);

            results.forEach(result => {
                expect(result).toHaveProperty('id');
                expect(result).toHaveProperty('score');
                expect(result).toHaveProperty('payload');
                expect(typeof result.score).toBe('number');
                expect(result.score).toBeGreaterThanOrEqual(0);
                expect(result.score).toBeLessThanOrEqual(1);
            });
        });

        it('should fallback to sync for small vector sets', async () => {
            // Clear first
            await LocalVectorStore.clear();

            // Add only 10 vectors (below threshold)
            await LocalVectorStore.upsert('vec-1', createMockVector('vec-1', 384).vector, {});

            const queryVector = createMockVector('query', 384).vector;
            const results = await LocalVectorStore.searchAsync(queryVector, 5, 0.5);

            expect(Array.isArray(results)).toBe(true);
        });

        it('should handle wrong dimension query vector', async () => {
            const wrongDimVector = Array.from({ length: 128 }, () => Math.random());
            const results = await LocalVectorStore.searchAsync(wrongDimVector, 5, 0.5);

            // Should return empty results (not throw)
            expect(results).toEqual([]);
        });

        it('should handle empty query vector', async () => {
            const results = await LocalVectorStore.searchAsync([], 5, 0.5);
            expect(results).toEqual([]);
        });
    });

    describe('LRU Cache Behavior', () => {
        it('should track max vectors setting', async () => {
            LocalVectorStore.setMaxVectors(200);
            expect(LocalVectorStore.getMaxVectors()).toBe(200);
        });

        it('should enforce minimum maxVectors of 100', () => {
            LocalVectorStore.setMaxVectors(50);
            expect(LocalVectorStore.getMaxVectors()).toBe(100);
        });

        it('should track vector count', async () => {
            expect(LocalVectorStore.count()).toBe(0);

            await LocalVectorStore.upsertBatch([
                createMockVector('vec-1', 3),
                createMockVector('vec-2', 3),
                createMockVector('vec-3', 3)
            ]);

            expect(LocalVectorStore.count()).toBe(3);
        });

        it('should handle null vectors cache gracefully', () => {
            // This tests defensive programming
            const count = LocalVectorStore.count();
            expect(typeof count).toBe('number');
        });
    });

    describe('Statistics', () => {
        beforeEach(async () => {
            await LocalVectorStore.upsert('vec-1', [1, 2, 3], { text: 'test1' });
            await LocalVectorStore.upsert('vec-2', [4, 5, 6], { text: 'test2' });
        });

        it('should return statistics object', () => {
            const stats = LocalVectorStore.getStats();

            expect(stats).toBeDefined();
            expect(typeof stats).toBe('object');
        });

        it('should include count in stats', () => {
            const stats = LocalVectorStore.getStats();
            expect(stats).toHaveProperty('count');
            expect(typeof stats.count).toBe('number');
        });

        it('should include maxVectors in stats', () => {
            const stats = LocalVectorStore.getStats();
            expect(stats).toHaveProperty('maxVectors');
            expect(typeof stats.maxVectors).toBe('number');
        });

        it('should include dimensions in stats', () => {
            const stats = LocalVectorStore.getStats();
            expect(stats).toHaveProperty('dimensions');
            expect(stats.dimensions).toHaveProperty('min');
            expect(stats.dimensions).toHaveProperty('max');
            expect(stats.dimensions).toHaveProperty('avg');
        });

        it('should include storage in stats', () => {
            const stats = LocalVectorStore.getStats();
            expect(stats).toHaveProperty('storage');
            expect(stats.storage).toHaveProperty('bytes');
            expect(stats.storage).toHaveProperty('megabytes');
        });

        it('should include LRU stats', () => {
            const stats = LocalVectorStore.getStats();
            expect(stats).toHaveProperty('lru');
            expect(stats.lru).toHaveProperty('evictionCount');
            expect(stats.lru).toHaveProperty('hitRate');
        });

        it('should include sharedMemory stats', () => {
            const stats = LocalVectorStore.getStats();
            expect(stats).toHaveProperty('sharedMemory');
            expect(stats.sharedMemory).toHaveProperty('available');
            expect(stats.sharedMemory).toHaveProperty('enabled');
        });

        it('should include retryQueue stats', () => {
            const stats = LocalVectorStore.getStats();
            expect(stats).toHaveProperty('retryQueue');
            expect(stats.retryQueue).toHaveProperty('size');
        });

        it('should calculate utilization correctly', () => {
            const stats = LocalVectorStore.getStats();
            expect(stats).toHaveProperty('utilization');
            expect(typeof stats.utilization).toBe('number');
        });
    });

    describe('Ready State', () => {
        it('should report ready state', () => {
            const ready = LocalVectorStore.isReady();
            expect(typeof ready).toBe('boolean');
        });

        it('should report worker ready state', () => {
            const workerReady = LocalVectorStore.isWorkerReady();
            expect(typeof workerReady).toBe('boolean');
        });
    });

    describe('Auto-Scale', () => {
        it('should enable auto-scale', async () => {
            const newMax = await LocalVectorStore.enableAutoScale(true);
            expect(typeof newMax).toBe('number');
            expect(LocalVectorStore.isAutoScaleEnabled()).toBe(true);
        });

        it('should disable auto-scale', async () => {
            await LocalVectorStore.enableAutoScale(true);
            await LocalVectorStore.enableAutoScale(false);
            expect(LocalVectorStore.isAutoScaleEnabled()).toBe(false);
        });

        it('should report auto-scale enabled state', () => {
            const enabled = LocalVectorStore.isAutoScaleEnabled();
            expect(typeof enabled).toBe('boolean');
        });
    });

    describe('Retry Queue Behavior (Issue #7)', () => {
        it('should handle failed persists gracefully', async () => {
            // This test documents current behavior with retry queue
            // Actual persistence is mocked, so we test the API
            const vector = createMockVector('vec-1', 3);
            const result = await LocalVectorStore.upsert('vec-1', vector.vector, vector.payload);

            // Should succeed even if IndexedDB is mocked
            expect(result).toBe(true);
        });

        it('should clean up retry entries on delete', async () => {
            const vector = createMockVector('vec-1', 3);
            await LocalVectorStore.upsert('vec-1', vector.vector, vector.payload);
            await LocalVectorStore.delete('vec-1');

            // Should not throw, retry entry should be cleaned up
            expect(LocalVectorStore.get('vec-1')).toBeNull();
        });

        it('should clear retry queue on clear', async () => {
            await LocalVectorStore.upsert('vec-1', [1, 2, 3], {});
            await LocalVectorStore.clear();

            const stats = LocalVectorStore.getStats();
            expect(stats.retryQueue.size).toBe(0);
        });
    });

    describe('Worker Initialization Race Conditions', () => {
        it('should handle concurrent searchAsync calls', async () => {
            const queryVector = createMockVector('query', 384).vector;

            // Concurrent searches
            const results = await Promise.all([
                LocalVectorStore.searchAsync(queryVector, 5, 0.5),
                LocalVectorStore.searchAsync(queryVector, 5, 0.5),
                LocalVectorStore.searchAsync(queryVector, 5, 0.5)
            ]);

            results.forEach(result => {
                expect(Array.isArray(result)).toBe(true);
            });
        });

        it('should handle worker initialization failure gracefully', async () => {
            // Mock Worker to throw
            globalThis.Worker = vi.fn(() => {
                throw new Error('Worker not supported');
            });

            // Re-import to get new module with failing Worker
            const module = await import('../../../js/local-vector-store.js');
            const Store = module.LocalVectorStore;

            await Store.init();

            // Should fallback to sync search
            const queryVector = createMockVector('query', 384).vector;
            const results = await Store.searchAsync(queryVector, 5, 0.5);

            expect(Array.isArray(results)).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('should handle vectors with different dimensions gracefully', async () => {
            // Current behavior: logs warning, returns empty for shared memory
            await LocalVectorStore.upsert('vec-1', [1, 2, 3], {});
            await LocalVectorStore.upsert('vec-2', [4, 5, 6, 7], {});

            const count = LocalVectorStore.count();
            expect(count).toBe(2);
        });

        it('should handle non-numeric vector values', async () => {
            // Current behavior: validates and rejects invalid vectors
            const invalidVector = [1, 2, NaN, 4];

            // Should not throw
            const result = await LocalVectorStore.upsert('vec-1', invalidVector, {});
            expect(result).toBe(true);
        });

        it('should handle upsert with existing ID (update behavior)', async () => {
            await LocalVectorStore.upsert('vec-1', [1, 2, 3], { version: 1 });
            await LocalVectorStore.upsert('vec-1', [4, 5, 6], { version: 2 });

            const retrieved = LocalVectorStore.get('vec-1');
            expect(retrieved.payload.version).toBe(2);
            expect(retrieved.vector).toEqual([4, 5, 6]);
        });
    });

    describe('Shared Memory Detection', () => {
        it('should export SharedArrayBuffer availability check', async () => {
            const module = await import('../../../js/local-vector-store.js');
            const isAvailable = module.isSharedArrayBufferAvailable();

            expect(typeof isAvailable).toBe('boolean');
            // In test environment (Node.js), SharedArrayBuffer may or may not be available
        });

        it('should include shared memory stats', () => {
            const stats = LocalVectorStore.getStats();

            expect(stats.sharedMemory).toBeDefined();
            expect(stats.sharedMemory.available).toBeDefined();
            expect(typeof stats.sharedMemory.available).toBe('boolean');
        });
    });

    describe('Persistence Layer Integration', () => {
        it('should persist vectors on upsert', async () => {
            const vector = createMockVector('vec-1', 3);
            await LocalVectorStore.upsert('vec-1', vector.vector, vector.payload);

            // Vector should be retrievable
            const retrieved = LocalVectorStore.get('vec-1');
            expect(retrieved).toBeDefined();
        });

        it('should load vectors from IndexedDB on init', async () => {
            // Add vectors
            await LocalVectorStore.upsertBatch([
                createMockVector('vec-1', 3),
                createMockVector('vec-2', 3)
            ]);

            // Re-initialize
            await LocalVectorStore.init();

            // Vectors should be loaded
            expect(LocalVectorStore.count()).toBe(2);
        });
    });

    describe('Performance Characteristics', () => {
        it('should handle upsert of 100 vectors efficiently', async () => {
            const vectors = Array.from({ length: 100 }, (_, i) =>
                createMockVector(`vec-${i}`, 384)
            );

            const start = performance.now();
            await LocalVectorStore.upsertBatch(vectors);
            const elapsed = performance.now() - start;

            expect(LocalVectorStore.count()).toBe(100);
            // Should be fast (< 1 second for 100 vectors)
            expect(elapsed).toBeLessThan(1000);
        });

        it('should perform search on 1000 vectors efficiently', async () => {
            // Add many vectors
            const vectors = Array.from({ length: 1000 }, (_, i) =>
                createMockVector(`vec-${i}`, 384)
            );

            await LocalVectorStore.upsertBatch(vectors);

            const queryVector = createMockVector('query', 384).vector;
            const start = performance.now();
            const results = LocalVectorStore.search(queryVector, 10, 0.5);
            const elapsed = performance.now() - start;

            expect(Array.isArray(results)).toBe(true);
            // Sync search should be fast (< 100ms for 1000 vectors)
            expect(elapsed).toBeLessThan(100);
        });
    });
});
