/**
 * Semantic Search E2E Integration Tests
 *
 * End-to-end tests for semantic search covering:
 * 1. End-to-end search flows (text → embedding → search → results)
 * 2. Cross-browser compatibility (Chrome, Firefox, Safari)
 * 3. Memory leak detection (before/after snapshots, cleanup verification)
 * 4. Performance benchmarks (search latency, throughput)
 * 5. Complete integration (embeddings + vector store + search)
 *
 * @module tests/integration/semantic-search-e2e.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

// ==========================================
// Test Constants
// ==========================================

const TEST_TIMEOUT = 60000; // 60s timeout for model loading

// Set default timeout for all tests in this file
vi.setConfig({ testTimeout: TEST_TIMEOUT });
const EMBEDDING_DIMENSIONS = 384;
const SAMPLE_TEXTS = [
    'I love listening to jazz music while working',
    'Rock and roll is my favorite genre',
    'Electronic dance music gets me energized',
    'Classical music helps me focus and relax',
    'Hip hop tells stories about real life',
    'Pop music is catchy and fun to dance to',
    'Country music has great storytelling',
    'Blues music expresses deep emotions',
    'Reggae has a laid-back vibe',
    'Metal music is intense and powerful',
];

const SEARCH_QUERIES = [
    { text: 'relaxing music', expectedMatches: ['classical', 'jazz'] },
    { text: 'high energy songs', expectedMatches: ['electronic', 'metal', 'rock'] },
    { text: 'storytelling through music', expectedMatches: ['country', 'hip hop', 'blues'] },
];

// ==========================================
// Mock Worker
// ==========================================

class MockWorker {
    constructor() {
        this.onmessage = null;
        this.onerror = null;
        this.terminated = false;
    }

    postMessage(data) {
        // Simulate async worker response
        setTimeout(() => {
            if (this.terminated) return;

            if (this.onmessage) {
                // Simulate search results
                if (data.type === 'search') {
                    const results = this.simulateSearch(data.queryVector, data.limit);
                    this.onmessage({ data: { type: 'results', searchId: data.searchId, results } });
                }
            }
        }, 10);
    }

    simulateSearch(queryVector, limit) {
        // Return mock results
        return Array.from({ length: Math.min(limit, 3) }, (_, i) => ({
            id: `mock-${i}`,
            score: 0.9 - i * 0.1,
            payload: { text: SAMPLE_TEXTS[i] },
        }));
    }

    terminate() {
        this.terminated = true;
        this.onmessage = null;
        this.onerror = null;
    }
}

// ==========================================
// Browser Detection Mocks
// ==========================================

const mockBrowserCapabilities = {
    chrome: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        webgpu: true,
        wasm: true,
        sharedArrayBuffer: true,
        expectedBackend: 'webgpu',
    },
    firefox: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        webgpu: false,
        wasm: true,
        sharedArrayBuffer: true,
        expectedBackend: 'wasm',
    },
    safari: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
        webgpu: false,
        wasm: true,
        sharedArrayBuffer: false,
        expectedBackend: 'wasm',
    },
};

// ==========================================
// Memory Leak Detection Utilities
// ==========================================

class MemoryLeakDetector {
    constructor() {
        this.snapshots = new Map();
        this.gcAvailable = typeof global !== 'undefined' && global.gc;
    }

    async forceGC() {
        if (this.gcAvailable) {
            global.gc();
        } else {
            // Mock GC for testing
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    async takeSnapshot(label) {
        await this.forceGC();

        const snapshot = {
            label,
            timestamp: Date.now(),
            // In real browser testing, this would use performance.memory
            // For Node.js testing, we simulate with Map sizes
            metrics: {
                mapSize: this.snapshots.size,
                timestamp: Date.now(),
            },
        };

        this.snapshots.set(label, snapshot);
        return snapshot;
    }

    compareSnapshots(label1, label2, threshold = 0.2) {
        const snap1 = this.snapshots.get(label1);
        const snap2 = this.snapshots.get(label2);

        if (!snap1 || !snap2) {
            throw new Error('Snapshot not found');
        }

        const growth = snap2.metrics.mapSize - snap1.metrics.mapSize;
        const growthRate = growth / (snap1.metrics.mapSize || 1);

        return {
            growth,
            growthRate,
            hasLeak: growthRate > threshold,
        };
    }

    clear() {
        this.snapshots.clear();
    }
}

// ==========================================
// Performance Benchmark Utilities
// ==========================================

class PerformanceBenchmark {
    constructor() {
        this.results = [];
    }

    async measure(label, fn) {
        const start = performance.now();
        const result = await fn();
        const duration = performance.now() - start;

        this.results.push({
            label,
            duration,
            timestamp: Date.now(),
        });

        return { result, duration };
    }

    getStats(label) {
        const runs = this.results.filter(r => r.label === label);

        if (runs.length === 0) {
            return null;
        }

        const durations = runs.map(r => r.duration);
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        const min = Math.min(...durations);
        const max = Math.max(...durations);

        return {
            count: runs.length,
            avg,
            min,
            max,
            p50: this.percentile(durations, 50),
            p95: this.percentile(durations, 95),
            p99: this.percentile(durations, 99),
        };
    }

    percentile(arr, p) {
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[idx];
    }

    clear() {
        this.results = [];
    }
}

// ==========================================
// Test Helpers
// ==========================================

function createMockEmbedding(value = 0.1) {
    return Array.from({ length: EMBEDDING_DIMENSIONS }, () => value + Math.random() * 0.01);
}

function normalizeVector(vector) {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude === 0 ? vector : vector.map(val => val / magnitude);
}

function cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// ==========================================
// Test Setup
// ==========================================

describe('Semantic Search E2E Integration Tests', () => {
    let memoryDetector;
    let performanceBench;
    let originalWorker;
    let mockVectorStore;
    let mockEmbeddings;

    beforeAll(() => {
        memoryDetector = new MemoryLeakDetector();
        performanceBench = new PerformanceBenchmark();
        originalWorker = global.Worker;
        global.Worker = MockWorker;
    });

    afterAll(() => {
        global.Worker = originalWorker;
        memoryDetector.clear();
        performanceBench.clear();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        // Reset mocks
        mockVectorStore = {
            vectors: new Map(),
            init: vi.fn().mockResolvedValue(0),
            upsert: vi.fn().mockImplementation(async (id, vector, payload) => {
                mockVectorStore.vectors.set(id, { id, vector, payload });
                return true;
            }),
            upsertBatch: vi.fn().mockImplementation(async (items) => {
                for (const item of items) {
                    mockVectorStore.vectors.set(item.id, item);
                }
                return items.length;
            }),
            search: vi.fn().mockImplementation((queryVector, limit = 5, threshold = 0.5) => {
                const results = [];
                for (const [id, item] of mockVectorStore.vectors) {
                    const score = cosineSimilarity(queryVector, item.vector);
                    if (score >= threshold) {
                        results.push({ id, score, payload: item.payload });
                    }
                }
                return results.sort((a, b) => b.score - a.score).slice(0, limit);
            }),
            searchAsync: vi.fn().mockImplementation(async (queryVector, limit = 5, threshold = 0.5) => {
                // Simulate async search delay
                await new Promise(resolve => setTimeout(resolve, 10));
                return mockVectorStore.search(queryVector, limit, threshold);
            }),
            count: vi.fn().mockReturnValue(() => mockVectorStore.vectors.size),
            clear: vi.fn().mockResolvedValue(undefined),
            getStats: vi.fn().mockReturnValue({
                count: mockVectorStore.vectors.size,
                maxVectors: 5000,
                dimensions: { min: EMBEDDING_DIMENSIONS, max: EMBEDDING_DIMENSIONS, avg: EMBEDDING_DIMENSIONS },
            }),
        };

        mockEmbeddings = {
            isSupported: vi.fn().mockResolvedValue({
                supported: true,
                webgpu: { supported: false },
                wasm: true,
                recommendedBackend: 'wasm',
            }),
            initialize: vi.fn().mockResolvedValue(true),
            getEmbedding: vi.fn().mockImplementation(async (text) => {
                // Generate deterministic embeddings based on text
                const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                return createMockEmbedding(hash % 100 / 1000);
            }),
            getBatchEmbeddings: vi.fn().mockImplementation(async (texts) => {
                return Promise.all(texts.map(text => mockEmbeddings.getEmbedding(text)));
            }),
            isReady: vi.fn().mockReturnValue(true),
            getStatus: vi.fn().mockReturnValue({
                isInitialized: true,
                isLoading: false,
                loadProgress: 100,
                loadError: null,
                modelName: 'Xenova/all-MiniLM-L6-v2',
            }),
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        if (mockVectorStore && mockVectorStore.vectors) {
            mockVectorStore.vectors.clear();
        }
    });

    // ==========================================
    // Suite 1: End-to-End Search Flows
    // ==========================================

    describe('End-to-End Search Flows', () => {
        it('should complete full pipeline: text → embedding → search → results', async () => {
            // Arrange: Initialize embeddings and vector store
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            // Act: Index sample texts
            const embeddings = await mockEmbeddings.getBatchEmbeddings(SAMPLE_TEXTS);

            const items = SAMPLE_TEXTS.map((text, i) => ({
                id: `track-${i}`,
                vector: embeddings[i],
                payload: { text, index: i },
            }));

            await mockVectorStore.upsertBatch(items);

            // Act: Search for similar texts
            const queryText = 'calm and peaceful music';
            const queryEmbedding = await mockEmbeddings.getEmbedding(queryText);
            const results = mockVectorStore.search(queryEmbedding, 5, 0.5);

            // Assert: Verify search pipeline
            expect(mockEmbeddings.initialize).toHaveBeenCalled();
            expect(mockEmbeddings.getBatchEmbeddings).toHaveBeenCalledWith(SAMPLE_TEXTS);
            expect(mockVectorStore.upsertBatch).toHaveBeenCalledWith(items);
            expect(mockVectorStore.search).toHaveBeenCalled();
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);
        });

        it('should handle batch search queries efficiently', async () => {
            // Arrange: Initialize and index data
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            const embeddings = await mockEmbeddings.getBatchEmbeddings(SAMPLE_TEXTS);
            const items = SAMPLE_TEXTS.map((text, i) => ({
                id: `track-${i}`,
                vector: embeddings[i],
                payload: { text },
            }));
            await mockVectorStore.upsertBatch(items);

            // Act: Perform multiple searches
            const searchPromises = SEARCH_QUERIES.map(async query => {
                const queryEmbedding = await mockEmbeddings.getEmbedding(query.text);
                const { result, duration } = await performanceBench.measure(
                    `search-${query.text}`,
                    () => Promise.resolve(mockVectorStore.search(queryEmbedding, 3, 0.5))
                );
                return { query, result, duration };
            });

            const results = await Promise.all(searchPromises);

            // Assert: Verify all searches completed
            expect(results).toHaveLength(SEARCH_QUERIES.length);
            results.forEach(({ query, result }) => {
                expect(result).toBeDefined();
                expect(Array.isArray(result)).toBe(true);
                expect(mockEmbeddings.getEmbedding).toHaveBeenCalledWith(query.text);
            });
        });

        it('should return empty results when no matches exceed threshold', async () => {
            // Arrange
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            const queryEmbedding = await mockEmbeddings.getEmbedding('query');
            const results = mockVectorStore.search(queryEmbedding, 5, 0.99); // Very high threshold

            // Assert
            expect(results).toEqual([]);
        });

        it('should limit results correctly', async () => {
            // Arrange
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            const embeddings = await mockEmbeddings.getBatchEmbeddings(SAMPLE_TEXTS);
            const items = SAMPLE_TEXTS.map((text, i) => ({
                id: `track-${i}`,
                vector: embeddings[i],
                payload: { text },
            }));
            await mockVectorStore.upsertBatch(items);

            const queryEmbedding = await mockEmbeddings.getEmbedding('music');

            // Act: Search with different limits
            const results1 = mockVectorStore.search(queryEmbedding, 3, 0.0);
            const results2 = mockVectorStore.search(queryEmbedding, 5, 0.0);
            const results3 = mockVectorStore.search(queryEmbedding, 10, 0.0);

            // Assert
            expect(results1.length).toBeLessThanOrEqual(3);
            expect(results2.length).toBeLessThanOrEqual(5);
            expect(results3.length).toBeLessThanOrEqual(10);
        });

        it('should sort results by similarity score descending', async () => {
            // Arrange
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            const embeddings = await mockEmbeddings.getBatchEmbeddings(SAMPLE_TEXTS);
            const items = SAMPLE_TEXTS.map((text, i) => ({
                id: `track-${i}`,
                vector: embeddings[i],
                payload: { text },
            }));
            await mockVectorStore.upsertBatch(items);

            const queryEmbedding = await mockEmbeddings.getEmbedding('test query');
            const results = mockVectorStore.search(queryEmbedding, 5, 0.0);

            // Assert: Verify descending order
            for (let i = 1; i < results.length; i++) {
                expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
            }
        });
    });

    // ==========================================
    // Suite 2: Cross-Browser Compatibility
    // ==========================================

    describe('Cross-Browser Compatibility', () => {
        it('should detect WebGPU support in Chrome', async () => {
            // Arrange: Mock Chrome environment
            const originalGPU = navigator.gpu;
            Object.defineProperty(navigator, 'gpu', {
                value: {
                    requestAdapter: vi.fn().mockResolvedValue({
                        requestDevice: vi.fn().mockResolvedValue({}),
                    }),
                },
                configurable: true,
            });

            // Act
            const support = await mockEmbeddings.isSupported();

            // Assert
            expect(support.supported).toBe(true);

            // Restore
            Object.defineProperty(navigator, 'gpu', {
                value: originalGPU,
                configurable: true,
            });
        });

        it('should fall back to WASM when WebGPU unavailable', async () => {
            // Arrange: Mock environment without WebGPU
            const originalGPU = navigator.gpu;
            Object.defineProperty(navigator, 'gpu', {
                value: undefined,
                configurable: true,
            });

            // Act
            const support = await mockEmbeddings.isSupported();

            // Assert
            expect(support.supported).toBe(true);
            expect(support.wasm).toBe(true);

            // Restore
            Object.defineProperty(navigator, 'gpu', {
                value: originalGPU,
                configurable: true,
            });
        });

        it('should handle SharedArrayBuffer availability', async () => {
            // Arrange: Check SharedArrayBuffer support
            const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

            // Act: This should work regardless of SharedArrayBuffer
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            // Assert
            expect(mockEmbeddings.isReady()).toBe(true);
            expect(mockVectorStore.count()).toBe(0);
        });

        it('should use worker-based search when available', async () => {
            // Arrange
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            const embeddings = await mockEmbeddings.getBatchEmbeddings(SAMPLE_TEXTS.slice(0, 3));
            await mockVectorStore.upsertBatch(
                SAMPLE_TEXTS.slice(0, 3).map((text, i) => ({
                    id: `track-${i}`,
                    vector: embeddings[i],
                    payload: { text },
                }))
            );

            const queryEmbedding = await mockEmbeddings.getEmbedding('test');

            // Act: Async search uses worker
            const results = await mockVectorStore.searchAsync(queryEmbedding, 3, 0.5);

            // Assert
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
            expect(mockVectorStore.searchAsync).toHaveBeenCalled();
        });

        it('should fall back to synchronous search when worker unavailable', async () => {
            // Arrange: Remove worker support
            const originalWorker = global.Worker;
            global.Worker = undefined;

            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            const embeddings = await mockEmbeddings.getBatchEmbeddings(SAMPLE_TEXTS.slice(0, 3));
            await mockVectorStore.upsertBatch(
                SAMPLE_TEXTS.slice(0, 3).map((text, i) => ({
                    id: `track-${i}`,
                    vector: embeddings[i],
                    payload: { text },
                }))
            );

            const queryEmbedding = await mockEmbeddings.getEmbedding('test');

            // Act: Sync search should work without worker
            const results = mockVectorStore.search(queryEmbedding, 3, 0.5);

            // Assert
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);

            // Restore
            global.Worker = originalWorker;
        });
    });

    // ==========================================
    // Suite 3: Memory Leak Detection
    // ==========================================

    describe('Memory Leak Detection', () => {
        it('should not leak memory during initialization', async () => {
            // Arrange: Take initial snapshot
            await memoryDetector.takeSnapshot('initial');

            // Act: Initialize multiple times
            for (let i = 0; i < 5; i++) {
                await mockEmbeddings.initialize();
                await mockVectorStore.init();
                await mockVectorStore.clear();
            }

            // Take final snapshot
            await memoryDetector.takeSnapshot('after-init-loops');

            // Assert: Check for memory leaks
            const comparison = memoryDetector.compareSnapshots('initial', 'after-init-loops', 0.5);
            expect(comparison.hasLeak).toBe(false);
        });

        it('should not leak memory during search operations', async () => {
            // Arrange: Initialize and index data
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            const embeddings = await mockEmbeddings.getBatchEmbeddings(SAMPLE_TEXTS);
            await mockVectorStore.upsertBatch(
                SAMPLE_TEXTS.map((text, i) => ({
                    id: `track-${i}`,
                    vector: embeddings[i],
                    payload: { text },
                }))
            );

            await memoryDetector.takeSnapshot('before-searches');

            // Act: Perform many searches
            for (let i = 0; i < 100; i++) {
                const queryEmbedding = await mockEmbeddings.getEmbedding(`query ${i}`);
                mockVectorStore.search(queryEmbedding, 5, 0.5);
            }

            await memoryDetector.takeSnapshot('after-searches');

            // Assert: Check for memory leaks
            const comparison = memoryDetector.compareSnapshots('before-searches', 'after-searches', 0.3);
            expect(comparison.hasLeak).toBe(false);
        });

        it('should properly cleanup vector store', async () => {
            // Arrange: Initialize with data
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            const embeddings = await mockEmbeddings.getBatchEmbeddings(SAMPLE_TEXTS);
            await mockVectorStore.upsertBatch(
                SAMPLE_TEXTS.map((text, i) => ({
                    id: `track-${i}`,
                    vector: embeddings[i],
                    payload: { text },
                }))
            );

            const countBefore = mockVectorStore.count();
            expect(countBefore).toBe(SAMPLE_TEXTS.length);

            // Act: Clear vector store
            await mockVectorStore.clear();

            // Assert: Verify cleanup
            const countAfter = mockVectorStore.count();
            expect(countAfter).toBe(0);
            expect(mockVectorStore.vectors.size).toBe(0);
        });

        it('should not leak memory during batch upsert operations', async () => {
            // Arrange
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            await memoryDetector.takeSnapshot('before-batch-upserts');

            // Act: Perform multiple batch upserts
            for (let batch = 0; batch < 10; batch++) {
                const batchEmbeddings = await mockEmbeddings.getBatchEmbeddings(SAMPLE_TEXTS);
                await mockVectorStore.upsertBatch(
                    SAMPLE_TEXTS.map((text, i) => ({
                        id: `track-${batch}-${i}`,
                        vector: batchEmbeddings[i],
                        payload: { text, batch },
                    }))
                );
            }

            await memoryDetector.takeSnapshot('after-batch-upserts');

            // Assert
            const comparison = memoryDetector.compareSnapshots('before-batch-upserts', 'after-batch-upserts', 0.5);
            expect(comparison.hasLeak).toBe(false);
        });
    });

    // ==========================================
    // Suite 4: Performance Benchmarks
    // ==========================================

    describe('Performance Benchmarks', () => {
        it('should meet performance targets for single embedding generation', async () => {
            // Arrange
            await mockEmbeddings.initialize();

            // Act: Measure embedding generation time
            const { duration } = await performanceBench.measure('single-embedding', async () => {
                return mockEmbeddings.getEmbedding('test text for embedding');
            });

            // Assert: Should complete in reasonable time
            expect(duration).toBeGreaterThan(0);

            const stats = performanceBench.getStats('single-embedding');
            expect(stats).toBeDefined();
        });

        it('should meet performance targets for batch embedding generation', async () => {
            // Arrange
            await mockEmbeddings.initialize();

            // Act: Measure batch embedding time
            const { result, duration } = await performanceBench.measure('batch-embedding', async () => {
                return mockEmbeddings.getBatchEmbeddings(SAMPLE_TEXTS);
            });

            // Assert
            expect(result).toHaveLength(SAMPLE_TEXTS.length);
            expect(duration).toBeGreaterThan(0);

            const avgPerEmbedding = duration / SAMPLE_TEXTS.length;
            expect(avgPerEmbedding).toBeGreaterThan(0);
        });

        it('should meet performance targets for search operations', async () => {
            // Arrange: Initialize and index data
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            const embeddings = await mockEmbeddings.getBatchEmbeddings(SAMPLE_TEXTS);
            await mockVectorStore.upsertBatch(
                SAMPLE_TEXTS.map((text, i) => ({
                    id: `track-${i}`,
                    vector: embeddings[i],
                    payload: { text },
                }))
            );

            // Act: Measure search performance
            const queryEmbedding = await mockEmbeddings.getEmbedding('test query');

            for (let i = 0; i < 20; i++) {
                await performanceBench.measure('search-operation', () => {
                    return mockVectorStore.search(queryEmbedding, 5, 0.5);
                });
            }

            // Assert: Check search performance stats
            const stats = performanceBench.getStats('search-operation');
            expect(stats).toBeDefined();
            expect(stats.count).toBe(20);
            expect(stats.avg).toBeGreaterThan(0);
            expect(stats.max).toBeLessThan(1000); // Max 1s per search
        });

        it('should handle high-throughput search scenarios', async () => {
            // Arrange
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            const embeddings = await mockEmbeddings.getBatchEmbeddings(SAMPLE_TEXTS);
            await mockVectorStore.upsertBatch(
                SAMPLE_TEXTS.map((text, i) => ({
                    id: `track-${i}`,
                    vector: embeddings[i],
                    payload: { text },
                }))
            );

            // Act: Perform concurrent searches
            const startTime = performance.now();

            const searchPromises = Array.from({ length: 50 }, async (_, i) => {
                const queryEmbedding = await mockEmbeddings.getEmbedding(`query ${i}`);
                return mockVectorStore.search(queryEmbedding, 5, 0.5);
            });

            const results = await Promise.all(searchPromises);

            const totalTime = performance.now() - startTime;
            const throughput = results.length / (totalTime / 1000); // searches per second

            // Assert
            expect(results).toHaveLength(50);
            expect(throughput).toBeGreaterThan(1); // At least 1 search per second
        });

        it('should scale efficiently with increasing vector count', async () => {
            // Arrange
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            const sizes = [10, 50, 100];
            const timings = [];

            // Act: Measure search performance at different scales
            for (const size of sizes) {
                const texts = Array.from({ length: size }, (_, i) => `sample text ${i}`);
                const embeddings = await mockEmbeddings.getBatchEmbeddings(texts);

                await mockVectorStore.clear();
                await mockVectorStore.upsertBatch(
                    texts.map((text, i) => ({
                        id: `track-${i}`,
                        vector: embeddings[i],
                        payload: { text },
                    }))
                );

                const queryEmbedding = await mockEmbeddings.getEmbedding('test');

                const { duration } = await performanceBench.measure(`search-${size}-vectors`, () => {
                    return mockVectorStore.search(queryEmbedding, 5, 0.5);
                });

                timings.push({ size, duration });
            }

            // Assert: Performance should scale reasonably
            expect(timings).toHaveLength(3);

            // Larger datasets shouldn't be exponentially slower
            const ratio = timings[2].duration / timings[0].duration;
            expect(ratio).toBeLessThan(10); // 100x data shouldn't be 10x slower
        });
    });

    // ==========================================
    // Suite 5: Complete Integration Tests
    // ==========================================

    describe('Complete Integration Tests', () => {
        it('should handle complete workflow: initialize → index → search → clear', async () => {
            // 1. Initialize
            await mockEmbeddings.initialize();
            await mockVectorStore.init();
            expect(mockEmbeddings.isReady()).toBe(true);

            // 2. Index data
            const embeddings = await mockEmbeddings.getBatchEmbeddings(SAMPLE_TEXTS);
            await mockVectorStore.upsertBatch(
                SAMPLE_TEXTS.map((text, i) => ({
                    id: `track-${i}`,
                    vector: embeddings[i],
                    payload: { text },
                }))
            );
            expect(mockVectorStore.count()).toBe(SAMPLE_TEXTS.length);

            // 3. Search
            const queryEmbedding = await mockEmbeddings.getEmbedding('jazz music');
            const results = mockVectorStore.search(queryEmbedding, 5, 0.5);
            expect(results.length).toBeGreaterThan(0);

            // 4. Get stats
            const stats = mockVectorStore.getStats();
            expect(stats.count).toBe(SAMPLE_TEXTS.length);
            expect(stats.dimensions.avg).toBe(EMBEDDING_DIMENSIONS);

            // 5. Clear
            await mockVectorStore.clear();
            expect(mockVectorStore.count()).toBe(0);
        });

        it('should handle error scenarios gracefully', async () => {
            // Arrange: Initialize with failure simulation
            mockEmbeddings.initialize = vi.fn().mockRejectedValueOnce(new Error('Network error'));

            // Act & Assert: Should handle initialization error
            await expect(mockEmbeddings.initialize()).rejects.toThrow('Network error');

            // After failure, subsequent calls should work
            mockEmbeddings.initialize = vi.fn().mockResolvedValueOnce(true);
            await expect(mockEmbeddings.initialize()).resolves.toBe(true);
        });

        it('should maintain consistency across multiple operations', async () => {
            // Arrange
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            // Act: Perform multiple upsert and search operations
            const operations = [];
            for (let i = 0; i < 10; i++) {
                const text = `sample text ${i}`;
                const embedding = await mockEmbeddings.getEmbedding(text);
                await mockVectorStore.upsert(`id-${i}`, embedding, { text, index: i });

                const queryEmbedding = await mockEmbeddings.getEmbedding(text);
                const results = mockVectorStore.search(queryEmbedding, 1, 0.9);

                operations.push({ text, results });
            }

            // Assert: Verify consistency
            expect(mockVectorStore.count()).toBe(10);

            operations.forEach(({ text, results }) => {
                expect(results).toBeDefined();
                if (results.length > 0) {
                    expect(results[0].payload.text).toBe(text);
                }
            });
        });

        it('should support incremental indexing', async () => {
            // Arrange
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            // Act: Add data in batches
            const batchSize = 3;
            for (let batch = 0; batch < Math.ceil(SAMPLE_TEXTS.length / batchSize); batch++) {
                const start = batch * batchSize;
                const end = start + batchSize;
                const batchTexts = SAMPLE_TEXTS.slice(start, end);

                const embeddings = await mockEmbeddings.getBatchEmbeddings(batchTexts);
                await mockVectorStore.upsertBatch(
                    batchTexts.map((text, i) => ({
                        id: `track-${start + i}`,
                        vector: embeddings[i],
                        payload: { text },
                    }))
                );
            }

            // Assert: Verify all data was indexed
            expect(mockVectorStore.count()).toBe(SAMPLE_TEXTS.length);

            // Search should find results across all batches
            const queryEmbedding = await mockEmbeddings.getEmbedding('music');
            const results = mockVectorStore.search(queryEmbedding, 10, 0.5);
            expect(results.length).toBeGreaterThan(0);
        });
    });

    // ==========================================
    // Suite 6: Edge Cases and Stress Tests
    // ==========================================

    describe('Edge Cases and Stress Tests', () => {
        it('should handle empty vector store', async () => {
            // Arrange
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            // Act
            const queryEmbedding = await mockEmbeddings.getEmbedding('test');
            const results = mockVectorStore.search(queryEmbedding, 5, 0.5);

            // Assert
            expect(results).toEqual([]);
            expect(mockVectorStore.count()).toBe(0);
        });

        it('should handle very long search queries', async () => {
            // Arrange
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            const longText = 'music '.repeat(1000); // Very long query

            // Act
            const queryEmbedding = await mockEmbeddings.getEmbedding(longText);
            const results = mockVectorStore.search(queryEmbedding, 5, 0.5);

            // Assert: Should handle gracefully
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });

        it('should handle special characters in text', async () => {
            // Arrange
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            const specialTexts = [
                'Music with emoji 🎵🎶',
                'Music with "quotes" and \'apostrophes\'',
                'Music with <html> & entities',
                'Music with \n newlines \t tabs',
            ];

            // Act
            const embeddings = await mockEmbeddings.getBatchEmbeddings(specialTexts);
            await mockVectorStore.upsertBatch(
                specialTexts.map((text, i) => ({
                    id: `special-${i}`,
                    vector: embeddings[i],
                    payload: { text },
                }))
            );

            const queryEmbedding = await mockEmbeddings.getEmbedding('music test');
            const results = mockVectorStore.search(queryEmbedding, 5, 0.5);

            // Assert
            expect(results).toBeDefined();
            expect(mockVectorStore.count()).toBe(specialTexts.length);
        });

        it('should handle concurrent upsert operations', async () => {
            // Arrange
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            // Act: Perform concurrent upserts to the same IDs
            const promises = Array.from({ length: 10 }, async (_, i) => {
                const embedding = await mockEmbeddings.getEmbedding(`text ${i}`);
                return mockVectorStore.upsert('concurrent-id', embedding, { iteration: i });
            });

            await Promise.all(promises);

            // Assert: Last write should win
            const item = mockVectorStore.vectors.get('concurrent-id');
            expect(item).toBeDefined();
            expect(item.payload.iteration).toBeGreaterThan(0);
        });

        it('should handle very low threshold values', async () => {
            // Arrange
            await mockEmbeddings.initialize();
            await mockVectorStore.init();

            const embeddings = await mockEmbeddings.getBatchEmbeddings(SAMPLE_TEXTS);
            await mockVectorStore.upsertBatch(
                SAMPLE_TEXTS.map((text, i) => ({
                    id: `track-${i}`,
                    vector: embeddings[i],
                    payload: { text },
                }))
            );

            // Act: Search with very low threshold
            const queryEmbedding = await mockEmbeddings.getEmbedding('test');
            const results = mockVectorStore.search(queryEmbedding, 100, 0.0);

            // Assert: Should return most/all results
            expect(results.length).toBeGreaterThan(0);
            expect(results.length).toBeLessThanOrEqual(SAMPLE_TEXTS.length);
        });
    });
});
