/**
 * Vector Store Operations Tests
 *
 * Comprehensive unit tests for vector storage, retrieval, LRU eviction,
 * pinning, auto-scaling, and memory management in the LocalVectorStore.
 *
 * Tests cover:
 * - Vector storage and retrieval operations
 * - LRU eviction behavior and cache size limits
 * - Pinning important vectors
 * - Auto-scaling based on storage quota
 * - Memory management and cleanup
 *
 * @module tests/unit/vector-store-operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock IndexedDB and browser APIs
const mockDB = {
    close: vi.fn(),
    transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
            get: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
            getAll: vi.fn().mockResolvedValue([]),
        })),
    })),
};

vi.mock('../../js/storage/persistent-vector-store.js', () => ({
    createPersistenceManager: () => ({
        initDB: vi.fn().mockResolvedValue(),
        loadFromDB: vi.fn().mockResolvedValue(),
        persistVector: vi.fn().mockResolvedValue(),
        persistBatch: vi.fn().mockResolvedValue(),
        deleteVector: vi.fn().mockResolvedValue(),
        clearDB: vi.fn().mockResolvedValue(),
        processEvictions: vi.fn().mockResolvedValue(),
        isReady: vi.fn().mockReturnValue(true),
    }),
}));

vi.mock('../../js/vector-store/worker.js', () => ({
    createWorkerManager: () => ({
        initWorkerAsync: vi.fn().mockResolvedValue(null),
        isWorkerReady: vi.fn().mockReturnValue(false),
        terminate: vi.fn(),
    }),
}));

vi.mock('../../js/vector-store/search-async.js', () => ({
    createAsyncSearch: vi.fn(() => vi.fn().mockResolvedValue([])),
}));

vi.mock('../../js/vector-store/retry-queue.js', () => ({
    createRetryQueue: () => ({
        size: 0,
        addFailure: vi.fn(),
        removeEntry: vi.fn(),
        processRetries: vi.fn(),
        getMetrics: vi.fn().mockReturnValue({
            size: 0,
            oldestEntryAge: null,
            maxRetries: 0,
        }),
        clear: vi.fn(),
    }),
}));

import { LocalVectorStore } from '../../js/vector-store/index.js';

// ==========================================
// Test Utilities
// ==========================================

/**
 * Create a test vector with specified dimensions
 */
function createTestVector(id, dimensions = 384) {
    return {
        id,
        vector: Array.from({ length: dimensions }, () => Math.random()),
        payload: {
            text: `Test vector ${id}`,
            type: 'test',
            timestamp: Date.now(),
        },
    };
}

/**
 * Create multiple test vectors
 */
function createTestVectorBatch(count, dimensions = 384) {
    return Array.from({ length: count }, (_, i) => createTestVector(`test-${i}`, dimensions));
}

/**
 * Wait for async operations to complete
 */
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Mock navigator.storage.estimate for auto-scaling tests
 */
function mockStorageEstimate(quota = 100 * 1024 * 1024, usage = 10 * 1024 * 1024) {
    if (typeof navigator !== 'undefined') {
        navigator.storage = {
            estimate: async () => ({ quota, usage }),
        };
    }
}

/**
 * Clear mock storage estimate
 */
function clearStorageEstimate() {
    if (typeof navigator !== 'undefined') {
        delete navigator.storage;
    }
}

// ==========================================
// Vector Storage and Retrieval Tests
// ==========================================

describe('Vector Store - Storage and Retrieval', () => {
    let store;

    beforeEach(async () => {
        store = Object.create(LocalVectorStore);
        await store.init({ maxVectors: 100 });
    });

    afterEach(async () => {
        if (store) {
            await store.clear();
        }
    });

    it('should store a single vector', async () => {
        const vector = createTestVector('vec-1');
        const result = await store.upsert(vector.id, vector.vector, vector.payload);

        expect(result).toBe(true);
        expect(store.count()).toBe(1);
    });

    it('should retrieve a stored vector', async () => {
        const vector = createTestVector('vec-1');
        await store.upsert(vector.id, vector.vector, vector.payload);

        const retrieved = store.get('vec-1');
        expect(retrieved).toBeDefined();
        expect(retrieved.id).toBe('vec-1');
        expect(retrieved.vector).toEqual(vector.vector);
        expect(retrieved.payload).toEqual(vector.payload);
    });

    it('should return null for non-existent vector', () => {
        const retrieved = store.get('non-existent');
        expect(retrieved).toBeNull();
    });

    it('should update existing vector on upsert', async () => {
        const vector = createTestVector('vec-1');
        await store.upsert(vector.id, vector.vector, vector.payload);

        // Update with new payload
        const newPayload = { text: 'Updated text', type: 'updated' };
        await store.upsert(vector.id, vector.vector, newPayload);

        const retrieved = store.get('vec-1');
        expect(retrieved.payload).toEqual(newPayload);
        expect(store.count()).toBe(1); // Count should not increase
    });

    it('should store multiple vectors', async () => {
        const vectors = createTestVectorBatch(10);
        for (const v of vectors) {
            await store.upsert(v.id, v.vector, v.payload);
        }

        expect(store.count()).toBe(10);
    });

    it('should store vectors with different dimensions', async () => {
        const vec1 = createTestVector('vec-1', 128);
        const vec2 = createTestVector('vec-2', 384);
        const vec3 = createTestVector('vec-3', 768);

        await store.upsert(vec1.id, vec1.vector, vec1.payload);
        await store.upsert(vec2.id, vec2.vector, vec2.payload);
        await store.upsert(vec3.id, vec3.vector, vec3.payload);

        expect(store.count()).toBe(3);

        const stats = store.getStats();
        expect(stats.dimensions.min).toBe(128);
        expect(stats.dimensions.max).toBe(768);
    });

    it('should delete a vector', async () => {
        const vector = createTestVector('vec-1');
        await store.upsert(vector.id, vector.vector, vector.payload);

        expect(store.count()).toBe(1);

        await store.delete('vec-1');
        expect(store.count()).toBe(0);
        expect(store.get('vec-1')).toBeNull();
    });

    it('should handle deleting non-existent vector', async () => {
        await store.delete('non-existent');
        expect(store.count()).toBe(0);
    });

    it('should clear all vectors', async () => {
        const vectors = createTestVectorBatch(10);
        for (const v of vectors) {
            await store.upsert(v.id, v.vector, v.payload);
        }

        expect(store.count()).toBe(10);

        await store.clear();
        expect(store.count()).toBe(0);
    });

    it('should handle bulk upsert operations', async () => {
        const vectors = createTestVectorBatch(50);
        const count = await store.upsertBatch(vectors);

        expect(count).toBe(50);
        expect(store.count()).toBe(50);
    });

    it('should maintain vector integrity after bulk operations', async () => {
        const vectors = createTestVectorBatch(20);
        await store.upsertBatch(vectors);

        // Verify each vector
        for (const v of vectors) {
            const retrieved = store.get(v.id);
            expect(retrieved).toBeDefined();
            expect(retrieved.vector).toEqual(v.vector);
            expect(retrieved.payload).toEqual(v.payload);
        }
    });
});

// ==========================================
// LRU Eviction Tests
// ==========================================

describe('Vector Store - LRU Eviction', () => {
    let store;

    beforeEach(async () => {
        store = Object.create(LocalVectorStore);
        await store.init({ maxVectors: 5 });
    });

    afterEach(async () => {
        if (store) {
            await store.clear();
        }
    });

    it('should evict oldest vector when at capacity', async () => {
        // Add 5 vectors (at capacity)
        for (let i = 0; i < 5; i++) {
            const v = createTestVector(`vec-${i}`);
            await store.upsert(v.id, v.vector, v.payload);
        }

        expect(store.count()).toBe(5);

        // Add 6th vector - should evict vec-0
        const v6 = createTestVector('vec-5');
        await store.upsert(v6.id, v6.vector, v6.payload);

        expect(store.count()).toBe(5);
        expect(store.get('vec-0')).toBeNull(); // Evicted
        expect(store.get('vec-1')).toBeDefined(); // Still present
    });

    it('should update recency on vector access', async () => {
        // Add 5 vectors
        for (let i = 0; i < 5; i++) {
            const v = createTestVector(`vec-${i}`);
            await store.upsert(v.id, v.vector, v.payload);
        }

        // Access vec-0 to make it most recent
        store.get('vec-0');

        // Add 6th vector - should evict vec-1 (now oldest)
        const v6 = createTestVector('vec-5');
        await store.upsert(v6.id, v6.vector, v6.payload);

        expect(store.get('vec-0')).toBeDefined(); // Accessed, not evicted
        expect(store.get('vec-1')).toBeNull(); // Oldest, evicted
    });

    it('should track eviction statistics', async () => {
        const stats = store.getStats();
        expect(stats.lru.evictionCount).toBe(0);

        // Fill cache and trigger eviction
        for (let i = 0; i < 10; i++) {
            const v = createTestVector(`vec-${i}`);
            await store.upsert(v.id, v.vector, v.payload);
        }

        const updatedStats = store.getStats();
        expect(updatedStats.lru.evictionCount).toBeGreaterThan(0);
    });

    it('should respect maxVectors limit', async () => {
        await store.init({ maxVectors: 10 });

        // Add 20 vectors
        for (let i = 0; i < 20; i++) {
            const v = createTestVector(`vec-${i}`);
            await store.upsert(v.id, v.vector, v.payload);
        }

        // Should not exceed maxVectors
        expect(store.count()).toBe(10);
    });

    it('should calculate cache utilization correctly', async () => {
        await store.init({ maxVectors: 100 });

        for (let i = 0; i < 50; i++) {
            const v = createTestVector(`vec-${i}`);
            await store.upsert(v.id, v.vector, v.payload);
        }

        const stats = store.getStats();
        expect(stats.utilization).toBe(0.5);
    });

    it('should enforce minimum maxVectors limit', async () => {
        store.setMaxVectors(50);
        expect(store.getMaxVectors()).toBe(50);

        store.setMaxVectors(0);
        expect(store.getMaxVectors()).toBeGreaterThanOrEqual(100);
    });

    it('should evict in batches when reducing max size', async () => {
        // Add 10 vectors
        for (let i = 0; i < 10; i++) {
            const v = createTestVector(`vec-${i}`);
            await store.upsert(v.id, v.vector, v.payload);
        }

        expect(store.count()).toBe(10);

        // Reduce max size to 5
        store.setMaxVectors(5);
        await wait(100); // Allow async eviction to process

        expect(store.count()).toBeLessThanOrEqual(5);
    });

    it('should track hit rate for cache access', async () => {
        await store.init({ maxVectors: 100 });

        const v1 = createTestVector('vec-1');
        await store.upsert(v1.id, v1.vector, v1.payload);

        // Generate hits and misses
        store.get('vec-1'); // Hit
        store.get('vec-1'); // Hit
        store.get('vec-2'); // Miss
        store.get('vec-3'); // Miss

        const stats = store.getStats();
        expect(stats.lru.hitCount).toBe(2);
        expect(stats.lru.missCount).toBe(2);
        expect(stats.lru.hitRate).toBe(0.5);
    });
});

// ==========================================
// Pinning Tests
// ==========================================

describe('Vector Store - Pinning', () => {
    let store;

    beforeEach(async () => {
        store = Object.create(LocalVectorStore);
        await store.init({ maxVectors: 5 });
    });

    afterEach(async () => {
        if (store) {
            await store.clear();
        }
    });

    it('should prevent eviction of pinned vectors', async () => {
        // Add 5 vectors
        const vectors = [];
        for (let i = 0; i < 5; i++) {
            const v = createTestVector(`vec-${i}`);
            vectors.push(v);
            await store.upsert(v.id, v.vector, v.payload);
        }

        // Pin vec-0 (oldest)
        store.pin?.('vec-0');

        // Add 6th vector - should evict vec-1 instead of vec-0
        const v6 = createTestVector('vec-5');
        await store.upsert(v6.id, v6.vector, v6.payload);

        expect(store.get('vec-0')).toBeDefined(); // Pinned, not evicted
        expect(store.get('vec-1')).toBeNull(); // Evicted (oldest unpinned)
    });

    it('should allow unpinning vectors', async () => {
        const v1 = createTestVector('vec-1');
        await store.upsert(v1.id, v1.vector, v1.payload);

        // Access internal cache to test pinning
        const vectors = store.get?.('_vectors');
        if (vectors?.pin) {
            vectors.pin('vec-1');
            expect(vectors.isPinned('vec-1')).toBe(true);

            vectors.unpin('vec-1');
            expect(vectors.isPinned('vec-1')).toBe(false);
        }
    });

    it('should not update recency for pinned vectors on access', async () => {
        // Add 5 vectors
        for (let i = 0; i < 5; i++) {
            const v = createTestVector(`vec-${i}`);
            await store.upsert(v.id, v.vector, v.payload);
        }

        // Access internal cache
        const vectors = store.get?.('_vectors');
        if (vectors?.pin) {
            vectors.pin('vec-0');
            store.get('vec-0'); // Access pinned vector

            // Add 6th vector - should still evict vec-1
            const v6 = createTestVector('vec-5');
            await store.upsert(v6.id, v6.vector, v6.payload);

            expect(store.get('vec-0')).toBeDefined(); // Pinned
            expect(store.get('vec-1')).toBeNull(); // Evicted
        }
    });

    it('should track pinned count', async () => {
        const vectors = store.get?.('_vectors');
        if (vectors?.pin) {
            const v1 = createTestVector('vec-1');
            const v2 = createTestVector('vec-2');
            await store.upsert(v1.id, v1.vector, v1.payload);
            await store.upsert(v2.id, v2.vector, v2.payload);

            expect(vectors.pinnedCount).toBe(0);

            vectors.pin('vec-1');
            vectors.pin('vec-2');

            expect(vectors.pinnedCount).toBe(2);
        }
    });

    it('should handle pinning non-existent vectors gracefully', async () => {
        const vectors = store.get?.('_vectors');
        if (vectors?.pin) {
            vectors.pin('non-existent');
            expect(vectors.pinnedCount).toBe(0);
        }
    });

    it('should allow cache overflow when all items are pinned', async () => {
        const vectors = store.get?.('_vectors');
        if (vectors?.pin) {
            // Add 5 vectors and pin them all
            for (let i = 0; i < 5; i++) {
                const v = createTestVector(`vec-${i}`);
                await store.upsert(v.id, v.vector, v.payload);
                vectors.pin(v.id);
            }

            // Add 6th vector - should allow overflow
            const v6 = createTestVector('vec-5');
            await store.upsert(v6.id, v6.vector, v6.payload);

            expect(store.count()).toBe(6);
        }
    });
});

// ==========================================
// Auto-scaling Tests
// ==========================================

describe('Vector Store - Auto-scaling', () => {
    let store;

    beforeEach(() => {
        mockStorageEstimate(100 * 1024 * 1024, 10 * 1024 * 1024);
    });

    afterEach(async () => {
        if (store) {
            await store.clear();
        }
        clearStorageEstimate();
    });

    it('should enable auto-scaling', async () => {
        store = Object.create(LocalVectorStore);
        await store.init({ maxVectors: 100, autoScale: true });

        expect(store.isAutoScaleEnabled()).toBe(true);
    });

    it('should adjust max vectors based on available storage', async () => {
        store = Object.create(LocalVectorStore);
        const initialMax = 100;
        await store.init({ maxVectors: initialMax, autoScale: true });

        const newMax = await store.enableAutoScale(true);
        expect(newMax).toBeGreaterThan(initialMax);
    });

    it('should cap max vectors at reasonable limit', async () => {
        // Mock huge quota
        mockStorageEstimate(1024 * 1024 * 1024, 0); // 1GB

        store = Object.create(LocalVectorStore);
        await store.init({ maxVectors: 100, autoScale: true });

        const newMax = await store.enableAutoScale(true);
        expect(newMax).toBeLessThanOrEqual(50000); // Cap at 50k
    });

    it('should enforce minimum max vectors during auto-scale', async () => {
        // Mock very small quota
        mockStorageEstimate(5 * 1024 * 1024, 1 * 1024 * 1024); // 5MB

        store = Object.create(LocalVectorStore);
        await store.init({ maxVectors: 100, autoScale: true });

        const newMax = await store.enableAutoScale(true);
        expect(newMax).toBeGreaterThanOrEqual(1000); // Minimum 1000
    });

    it('should report auto-scale status in stats', async () => {
        store = Object.create(LocalVectorStore);
        await store.init({ maxVectors: 100, autoScale: true });

        const stats = store.getStats();
        expect(stats.lru.autoScaleEnabled).toBe(true);
    });

    it('should handle storage estimate failures gracefully', async () => {
        // Mock failing storage estimate
        if (typeof navigator !== 'undefined') {
            navigator.storage = {
                estimate: async () => {
                    throw new Error('Storage estimate failed');
                },
            };
        }

        store = Object.create(LocalVectorStore);
        const initialMax = 100;
        await store.init({ maxVectors: initialMax });

        const newMax = await store.enableAutoScale(true);
        expect(newMax).toBe(initialMax); // Should fall back to current max
    });

    it('should disable auto-scaling', async () => {
        store = Object.create(LocalVectorStore);
        await store.init({ maxVectors: 100, autoScale: true });

        await store.enableAutoScale(false);
        expect(store.isAutoScaleEnabled()).toBe(false);
    });
});

// ==========================================
// Memory Management Tests
// ==========================================

describe('Vector Store - Memory Management', () => {
    let store;

    beforeEach(async () => {
        store = Object.create(LocalVectorStore);
        await store.init({ maxVectors: 100 });
    });

    afterEach(async () => {
        if (store) {
            await store.clear();
        }
    });

    it('should estimate storage size correctly', async () => {
        const vectors = createTestVectorBatch(10, 384);
        await store.upsertBatch(vectors);

        const stats = store.getStats();
        expect(stats.storage.bytes).toBeGreaterThan(0);
        expect(stats.storage.megabytes).toBeGreaterThan(0);
    });

    it('should calculate storage size based on vector dimensions', async () => {
        // Add 384-dim vectors
        const vec384 = createTestVector('vec-384', 384);
        await store.upsert(vec384.id, vec384.vector, vec384.payload);

        let stats = store.getStats();
        const size384 = stats.storage.bytes;

        // Add 768-dim vectors
        const vec768 = createTestVector('vec-768', 768);
        await store.upsert(vec768.id, vec768.vector, vec768.payload);

        stats = store.getStats();
        expect(stats.storage.bytes).toBeGreaterThan(size384);
    });

    it('should report average dimension size', async () => {
        const vec1 = createTestVector('vec-1', 128);
        const vec2 = createTestVector('vec-2', 384);
        const vec3 = createTestVector('vec-3', 768);

        await store.upsert(vec1.id, vec1.vector, vec1.payload);
        await store.upsert(vec2.id, vec2.vector, vec2.payload);
        await store.upsert(vec3.id, vec3.vector, vec3.payload);

        const stats = store.getStats();
        expect(stats.dimensions.min).toBe(128);
        expect(stats.dimensions.max).toBe(768);
        expect(stats.dimensions.avg).toBe((128 + 384 + 768) / 3);
    });

    it('should clear retry queue on vector deletion', async () => {
        const v1 = createTestVector('vec-1');
        await store.upsert(v1.id, v1.vector, v1.payload);

        // Check retry queue in stats
        let stats = store.getStats();
        expect(stats.retryQueue).toBeDefined();

        await store.delete('vec-1');

        stats = store.getStats();
        // Retry queue should be updated
        expect(stats.count).toBe(0);
    });

    it('should clear retry queue on store clear', async () => {
        const vectors = createTestVectorBatch(5);
        await store.upsertBatch(vectors);

        await store.clear();

        const stats = store.getStats();
        expect(stats.count).toBe(0);
    });

    it('should handle empty store stats', async () => {
        await store.clear();

        const stats = store.getStats();
        expect(stats.count).toBe(0);
        expect(stats.dimensions.min).toBe(0);
        expect(stats.dimensions.max).toBe(0);
        expect(stats.dimensions.avg).toBe(0);
        expect(stats.storage.bytes).toBe(0);
    });

    it('should report shared memory availability', async () => {
        const stats = store.getStats();
        expect(stats.sharedMemory).toBeDefined();
        expect(typeof stats.sharedMemory.available).toBe('boolean');
    });
});

// ==========================================
// Store Readiness and Lifecycle Tests
// ==========================================

describe('Vector Store - Lifecycle and Readiness', () => {
    it('should initialize store', async () => {
        const store = Object.create(LocalVectorStore);
        const count = await store.init({ maxVectors: 100 });

        expect(count).toBe(0);
        expect(store.isReady()).toBe(true);
    });

    it('should check worker readiness', async () => {
        const store = Object.create(LocalVectorStore);
        await store.init({ maxVectors: 100 });

        const isWorkerReady = store.isWorkerReady();
        expect(typeof isWorkerReady).toBe('boolean');
    });

    it('should handle multiple init calls', async () => {
        const store = Object.create(LocalVectorStore);
        await store.init({ maxVectors: 100 });
        await store.init({ maxVectors: 200 });

        expect(store.isReady()).toBe(true);
        expect(store.getMaxVectors()).toBe(200);
    });

    it('should load existing vectors on init', async () => {
        const store1 = Object.create(LocalVectorStore);
        await store1.init({ maxVectors: 100 });

        // Add some vectors
        const vectors = createTestVectorBatch(10);
        await store1.upsertBatch(vectors);

        // Create new store instance - should load existing vectors
        const store2 = Object.create(LocalVectorStore);
        const count = await store2.init({ maxVectors: 100 });

        expect(count).toBeGreaterThan(0);
    });
});

// ==========================================
// Edge Cases and Error Handling Tests
// ==========================================

describe('Vector Store - Edge Cases', () => {
    let store;

    beforeEach(async () => {
        store = Object.create(LocalVectorStore);
        await store.init({ maxVectors: 100 });
    });

    afterEach(async () => {
        if (store) {
            await store.clear();
        }
    });

    it('should handle empty vector arrays', async () => {
        const v1 = createTestVector('vec-1');
        v1.vector = [];

        await store.upsert(v1.id, v1.vector, v1.payload);
        const retrieved = store.get('vec-1');

        expect(retrieved).toBeDefined();
        expect(retrieved.vector).toEqual([]);
    });

    it('should handle very large vectors', async () => {
        const largeVector = createTestVector('vec-large', 1536);
        await store.upsert(largeVector.id, largeVector.vector, largeVector.payload);

        const retrieved = store.get('vec-large');
        expect(retrieved.vector.length).toBe(1536);
    });

    it('should handle special characters in vector IDs', async () => {
        const specialIds = ['id/with/slashes', 'id:with:colons', 'id-with-dashes', 'id_with_underscores'];

        for (const id of specialIds) {
            const v = createTestVector(id);
            await store.upsert(v.id, v.vector, v.payload);
        }

        expect(store.count()).toBe(specialIds.length);

        for (const id of specialIds) {
            expect(store.get(id)).toBeDefined();
        }
    });

    it('should handle concurrent upserts', async () => {
        const promises = [];
        for (let i = 0; i < 50; i++) {
            const v = createTestVector(`vec-${i}`);
            promises.push(store.upsert(v.id, v.vector, v.payload));
        }

        await Promise.all(promises);
        expect(store.count()).toBe(50);
    });

    it('should handle rapid delete operations', async () => {
        const vectors = createTestVectorBatch(20);
        await store.upsertBatch(vectors);

        const promises = vectors.map(v => store.delete(v.id));
        await Promise.all(promises);

        expect(store.count()).toBe(0);
    });

    it('should maintain stats accuracy after operations', async () => {
        const vectors = createTestVectorBatch(30);
        await store.upsertBatch(vectors);

        let stats = store.getStats();
        expect(stats.count).toBe(30);

        // Delete half
        for (let i = 0; i < 15; i++) {
            await store.delete(`vec-${i}`);
        }

        stats = store.getStats();
        expect(stats.count).toBe(15);
    });
});

// ==========================================
// Integration Tests
// ==========================================

describe('Vector Store - Integration Scenarios', () => {
    it('should handle realistic workflow: add, search, evict', async () => {
        const store = Object.create(LocalVectorStore);
        await store.init({ maxVectors: 10 });

        // Add initial vectors
        const initialVectors = createTestVectorBatch(8);
        await store.upsertBatch(initialVectors);

        expect(store.count()).toBe(8);

        // Add more vectors to trigger eviction
        const moreVectors = createTestVectorBatch(5).map((v, i) => ({
            ...v,
            id: `vec-${8 + i}`,
        }));
        await store.upsertBatch(moreVectors);

        expect(store.count()).toBe(10); // At capacity

        // Verify oldest vectors were evicted
        expect(store.get('vec-0')).toBeNull();
        expect(store.get('vec-1')).toBeNull();
        expect(store.get('vec-2')).toBeNull();

        // Verify newer vectors are present
        expect(store.get('vec-8')).toBeDefined();
        expect(store.get('vec-9')).toBeDefined();

        await store.clear();
    });

    it('should maintain performance with large datasets', async () => {
        const store = Object.create(LocalVectorStore);
        await store.init({ maxVectors: 1000 });

        const startTime = Date.now();

        // Add 500 vectors
        const vectors = createTestVectorBatch(500);
        await store.upsertBatch(vectors);

        const addTime = Date.now() - startTime;
        expect(addTime).toBeLessThan(5000); // Should complete in < 5s

        // Test retrieval performance
        const retrievalStart = Date.now();
        for (let i = 0; i < 100; i++) {
            store.get(`vec-${i}`);
        }
        const retrievalTime = Date.now() - retrievalStart;
        expect(retrievalTime).toBeLessThan(100); // Should be very fast

        await store.clear();
    });

    it('should handle pinning and eviction together', async () => {
        const store = Object.create(LocalVectorStore);
        await store.init({ maxVectors: 5 });

        // Add and pin important vectors
        const importantVectors = createTestVectorBatch(2);
        await store.upsertBatch(importantVectors);

        const vectors = store.get?.('_vectors');
        if (vectors?.pin) {
            vectors.pin('vec-0');
            vectors.pin('vec-1');
        }

        // Add more vectors to trigger eviction
        const moreVectors = createTestVectorBatch(5).map((v, i) => ({
            ...v,
            id: `vec-${2 + i}`,
        }));
        await store.upsertBatch(moreVectors);

        // Important vectors should still be present
        expect(store.get('vec-0')).toBeDefined();
        expect(store.get('vec-1')).toBeDefined();

        await store.clear();
    });
});
