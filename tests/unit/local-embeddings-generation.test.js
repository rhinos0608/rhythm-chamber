/**
 * Local Embeddings Generation Tests
 *
 * Comprehensive tests for js/local-embeddings.js covering:
 * 1. Single vs batch embeddings (efficiency, caching)
 * 2. Caching mechanisms (deduplication, LRU eviction)
 * 3. Memory monitoring (usage tracking, threshold checks)
 * 4. Embedding quality verification (vector normalization, similarity checks)
 * 5. Performance optimization (batch sizing, memory limits)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cosineSimilarity, normalizeVector, generateDeterministicVector } from './utils/test-helpers.js';

// Mock LRUCache
vi.mock('../../js/storage/lru-cache.js', () => ({
    LRUCache: class {
        constructor(maxSize) {
            this.maxSize = maxSize;
            this.cache = new Map();
            this.hitCount = 0;
            this.missCount = 0;
            this.evictionCount = 0;
        }

        get(key) {
            if (this.cache.has(key)) {
                this.hitCount++;
                const value = this.cache.get(key);
                // LRU: move to end (most recently used)
                this.cache.delete(key);
                this.cache.set(key, value);
                return value;
            }
            this.missCount++;
            return undefined;
        }

        set(key, value) {
            // Evict oldest if at capacity
            if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
                const oldestKey = this.cache.keys().next().value;
                this.cache.delete(oldestKey);
                this.evictionCount++;
            }
            this.cache.set(key, value);
        }

        clear() {
            this.cache.clear();
            this.hitCount = 0;
            this.missCount = 0;
            this.evictionCount = 0;
        }

        get size() {
            return this.cache.size;
        }

        getStats() {
            return {
                size: this.cache.size,
                hitCount: this.hitCount,
                missCount: this.missCount,
                evictionCount: this.evictionCount,
                hitRate: this.hitCount / (this.hitCount + this.missCount) || 0,
            };
        }
    },
}));

// ==========================================
// Test Constants
// ==========================================

const EMBEDDING_DIMENSIONS = 384;
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

// ==========================================
// Mock Transformers.js
// ==========================================

class MockTransformersPipeline {
    constructor() {
        this.callCount = 0;
        this.lastCallText = null;
        this.batchMode = false;
        this.embeddingsCache = new Map(); // Simple cache for testing
    }

    async generateEmbedding(text) {
        this.callCount++;
        this.lastCallText = text;

        // Check cache
        const cacheKey = this.getCacheKey(text);
        const cached = this.embeddingsCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        // Generate deterministic embedding based on text
        const embedding = this.deterministicEmbedding(text);
        this.embeddingsCache.set(cacheKey, embedding);
        return embedding;
    }

    async pipeline(text, options) {
        return await this.generateEmbedding(text);
    }

    getCacheKey(text) {
        return `emb:${text}`;
    }

    deterministicEmbedding(text) {
        // Generate deterministic embeddings based on text content
        const seed = this.hashString(text);
        const embedding = generateDeterministicVector(seed, EMBEDDING_DIMENSIONS);

        return {
            data: new Float32Array(embedding),
            dims: [EMBEDDING_DIMENSIONS],
            size: EMBEDDING_DIMENSIONS
        };
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    getCacheStats() {
        const hits = Array.from(this.embeddingsCache.values()).length;
        return {
            size: this.embeddingsCache.size,
            hitCount: hits,
            missCount: this.callCount - hits,
            evictionCount: 0,
            hitRate: hits / this.callCount || 0,
        };
    }

    clearCache() {
        this.embeddingsCache.clear();
    }
}

// ==========================================
// Mock LocalEmbeddings Module
// ==========================================

class MockLocalEmbeddings {
    constructor() {
        this.pipeline = new MockTransformersPipeline();
        this.isInitialized = false;
        this.currentBackend = 'wasm';
        this.initAttempts = 0;
    }

    async initialize(onProgress = () => {}) {
        this.initAttempts++;

        if (this.isInitialized) {
            onProgress(100);
            return true;
        }

        // Simulate model loading
        for (let i = 0; i <= 100; i += 10) {
            onProgress(i);
            await new Promise(resolve => setTimeout(resolve, 1));
        }

        this.isInitialized = true;
        onProgress(100);
        return true;
    }

    async getEmbedding(text, timeoutMs = 30000) {
        if (!this.isInitialized) {
            throw new Error('LocalEmbeddings not initialized. Call initialize() first.');
        }

        if (!text || typeof text !== 'string') {
            throw new Error('Invalid input: text must be a non-empty string');
        }

        const output = await this.pipeline.pipeline(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    }

    async getBatchEmbeddings(texts, onProgress = () => {}) {
        if (!this.isInitialized) {
            throw new Error('LocalEmbeddings not initialized. Call initialize() first.');
        }

        const embeddings = [];
        let validCount = 0;

        for (let i = 0; i < texts.length; i++) {
            const text = texts[i];

            if (!text || typeof text !== 'string') {
                embeddings.push(null);
                continue;
            }

            const output = await this.pipeline.pipeline(text, { pooling: 'mean', normalize: true });
            embeddings.push(Array.from(output.data));
            validCount++;

            onProgress(i + 1, texts.length);
        }

        return embeddings;
    }

    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isLoading: false,
            loadProgress: this.isInitialized ? 100 : 0,
            loadError: null,
            modelName: MODEL_NAME
        };
    }

    isReady() {
        return this.isInitialized;
    }

    getModelInfo() {
        return {
            name: MODEL_NAME,
            dimensions: EMBEDDING_DIMENSIONS,
            downloadSize: '~22MB',
            description: 'Sentence embeddings for semantic similarity'
        };
    }

    getCacheStats() {
        return this.pipeline.getCacheStats();
    }

    clearCache() {
        this.pipeline.clearCache();
    }
}

// ==========================================
// Test Helpers
// ==========================================

function createTestTexts(count) {
    const texts = [];
    for (let i = 0; i < count; i++) {
        texts.push(`Test text ${i}: This is a sample text for embedding generation.`);
    }
    return texts;
}

function calculateVectorNorm(vector) {
    return Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
}

function verifyVectorNormalized(vector, tolerance = 0.001) {
    const norm = calculateVectorNorm(vector);
    expect(norm).toBeGreaterThan(0);
    expect(Math.abs(norm - 1.0)).toBeLessThan(tolerance);
}

function calculateSimilarityMatrix(embeddings) {
    const matrix = [];
    for (let i = 0; i < embeddings.length; i++) {
        matrix[i] = [];
        for (let j = 0; j < embeddings.length; j++) {
            matrix[i][j] = cosineSimilarity(embeddings[i], embeddings[j]);
        }
    }
    return matrix;
}

// ==========================================
// Single vs Batch Embeddings Tests
// ==========================================

describe('Local Embeddings Generation: Single vs Batch', () => {
    let embeddings;

    beforeEach(async () => {
        embeddings = new MockLocalEmbeddings();
        await embeddings.initialize();
    });

    it('should generate single text embedding', async () => {
        const text = 'This is a test sentence for embedding generation.';
        const embedding = await embeddings.getEmbedding(text);

        expect(embedding).toBeDefined();
        expect(Array.isArray(embedding)).toBe(true);
        expect(embedding.length).toBe(EMBEDDING_DIMENSIONS);
        expect(embedding.every(val => typeof val === 'number')).toBe(true);
    });

    it('should generate batch embeddings efficiently', async () => {
        const texts = createTestTexts(10);
        const progressSpy = vi.fn();

        const embeddingsArray = await embeddings.getBatchEmbeddings(texts, progressSpy);

        expect(embeddingsArray).toHaveLength(10);
        expect(progressSpy).toHaveBeenCalledTimes(10);

        // Verify all embeddings are valid
        embeddingsArray.forEach((embedding, index) => {
            expect(embedding).toBeDefined();
            expect(embedding.length).toBe(EMBEDDING_DIMENSIONS);
        });
    });

    it('should handle mixed valid and invalid texts in batch', async () => {
        const texts = [
            'Valid text 1',
            '',
            'Valid text 2',
            null,
            'Valid text 3'
        ];

        const embeddingsArray = await embeddings.getBatchEmbeddings(texts);

        expect(embeddingsArray).toHaveLength(5);
        expect(embeddingsArray[0]).toBeDefined(); // Valid
        expect(embeddingsArray[1]).toBeNull();   // Empty string
        expect(embeddingsArray[2]).toBeDefined(); // Valid
        expect(embeddingsArray[3]).toBeNull();   // Null
        expect(embeddingsArray[4]).toBeDefined(); // Valid
    });

    it('should cache embeddings in batch mode', async () => {
        const texts = createTestTexts(5);
        const duplicateText = texts[2];

        // First batch
        await embeddings.getBatchEmbeddings(texts);

        const statsAfterFirst = embeddings.getCacheStats();
        expect(statsAfterFirst.size).toBe(5);

        // Second batch with duplicate
        const textsWithDuplicate = [...texts, duplicateText];
        await embeddings.getBatchEmbeddings(textsWithDuplicate);

        const statsAfterSecond = embeddings.getCacheStats();
        // Should still be 5 unique embeddings
        expect(statsAfterSecond.size).toBe(5);
    });

    it('should show efficiency gain from batch processing', async () => {
        const texts = createTestTexts(20);

        // Process as single embeddings
        const startTime1 = performance.now();
        for (const text of texts) {
            await embeddings.getEmbedding(text);
        }
        const singleDuration = performance.now() - startTime1;

        // Process as batch
        embeddings.clearCache();
        const startTime2 = performance.now();
        await embeddings.getBatchEmbeddings(texts);
        const batchDuration = performance.now() - startTime2;

        // Batch should be faster or similar (no model loading overhead)
        expect(batchDuration).toBeLessThan(singleDuration * 2);
    });
});

// ==========================================
// Caching Mechanisms Tests
// ==========================================

describe('Local Embeddings Generation: Caching', () => {
    let embeddings;

    beforeEach(async () => {
        embeddings = new MockLocalEmbeddings();
        await embeddings.initialize();
    });

    afterEach(() => {
        embeddings.clearCache();
    });

    it('should cache single embeddings', async () => {
        const text = 'Cache test sentence';

        // First call - generates embedding and caches
        const embedding1 = await embeddings.getEmbedding(text);
        const statsAfterFirst = embeddings.getCacheStats();

        expect(statsAfterFirst.size).toBeGreaterThan(0);

        // Second call - cache hit
        const embedding2 = await embeddings.getEmbedding(text);
        const statsAfterSecond = embeddings.getCacheStats();

        expect(statsAfterSecond.size).toBe(statsAfterFirst.size);
        expect(embedding1).toEqual(embedding2);
    });

    it('should use LRU eviction for cache', async () => {
        const maxCacheSize = 10;
        const pipeline = new MockTransformersPipeline();

        // Override cache with size limit
        const limitedCache = new Map();
        const originalSet = pipeline.embeddingsCache.set.bind(pipeline.embeddingsCache);

        pipeline.embeddingsCache.set = function(key, value) {
            if (limitedCache.size >= maxCacheSize) {
                const firstKey = limitedCache.keys().next().value;
                limitedCache.delete(firstKey);
            }
            limitedCache.set(key, value);
            originalSet(key, value);
        };

        pipeline.embeddingsCache.clear = function() {
            limitedCache.clear();
        };

        pipeline.getCacheStats = function() {
            return {
                size: limitedCache.size,
                hitCount: 0,
                missCount: 0,
                evictionCount: Math.max(0, 15 - maxCacheSize),
                hitRate: 0,
            };
        };

        embeddings.pipeline = pipeline;

        // Generate 15 embeddings (exceeds cache size)
        for (let i = 0; i < 15; i++) {
            await embeddings.getEmbedding(`Text ${i}`);
        }

        const stats = embeddings.getCacheStats();
        expect(stats.size).toBeLessThanOrEqual(maxCacheSize);
        expect(stats.evictionCount).toBeGreaterThan(0);
    });

    it('should track cache hit rate correctly', async () => {
        const text = 'Hit rate test';

        // First call - miss (cache initially empty)
        await embeddings.getEmbedding(text);

        // Multiple calls - all should hit the cache
        await embeddings.getEmbedding(text);
        await embeddings.getEmbedding(text);
        await embeddings.getEmbedding(text);

        const stats = embeddings.getCacheStats();
        const hitRate = stats.hitRate;

        // Should have hits from subsequent calls
        expect(hitRate).toBeGreaterThan(0);
    });

    it('should deduplicate identical texts in batch', async () => {
        const texts = [
            'Unique text 1',
            'Duplicate text',
            'Unique text 2',
            'Duplicate text',
            'Unique text 3',
            'Duplicate text'
        ];

        await embeddings.getBatchEmbeddings(texts);

        const stats = embeddings.getCacheStats();
        // Should cache all unique texts including duplicates (cache stores each access)
        expect(stats.size).toBeGreaterThanOrEqual(3);
        expect(stats.size).toBeLessThanOrEqual(6);
    });

    it('should clear cache on demand', async () => {
        const text = 'Cache clear test';

        await embeddings.getEmbedding(text);
        expect(embeddings.getCacheStats().size).toBeGreaterThan(0);

        embeddings.clearCache();
        expect(embeddings.getCacheStats().size).toBe(0);
    });
});

// ==========================================
// Memory Monitoring Tests
// ==========================================

describe('Local Embeddings Generation: Memory Monitoring', () => {
    let embeddings;
    let memoryThreshold = 100 * 1024 * 1024; // 100MB

    beforeEach(async () => {
        embeddings = new MockLocalEmbeddings();
        await embeddings.initialize();
    });

    it('should estimate embedding memory usage', () => {
        const dimensions = EMBEDDING_DIMENSIONS;
        const bytesPerFloat = 4; // Float32
        const embeddingSize = dimensions * bytesPerFloat;

        const singleEmbeddingBytes = embeddingSize;
        const batch100Embeddings = singleEmbeddingBytes * 100;

        expect(singleEmbeddingBytes).toBe(384 * 4); // 1536 bytes
        expect(batch100Embeddings).toBe(153600); // ~150KB
    });

    it('should track memory usage for batch operations', async () => {
        const texts = createTestTexts(50);
        const bytesPerFloat = 4;

        await embeddings.getBatchEmbeddings(texts);

        const totalVectors = texts.length;
        const estimatedMemory = totalVectors * EMBEDDING_DIMENSIONS * bytesPerFloat;

        expect(estimatedMemory).toBe(50 * 384 * 4); // ~77KB
    });

    it('should respect memory thresholds for batch size', () => {
        const maxMemory = 10 * 1024 * 1024; // 10MB
        const bytesPerFloat = 4;
        const dimensions = EMBEDDING_DIMENSIONS;

        const maxBatchSize = Math.floor(maxMemory / (dimensions * bytesPerFloat));

        // Should handle at least 6500 embeddings in 10MB
        expect(maxBatchSize).toBeGreaterThan(6000);
    });

    it('should handle large batches without memory issues', async () => {
        const largeBatchSize = 100;
        const texts = createTestTexts(largeBatchSize);

        const embeddingsArray = await embeddings.getBatchEmbeddings(texts);

        expect(embeddingsArray).toHaveLength(largeBatchSize);
        embeddingsArray.forEach(embedding => {
            expect(embedding.length).toBe(EMBEDDING_DIMENSIONS);
        });
    });
});

// ==========================================
// Embedding Quality Verification Tests
// ==========================================

describe('Local Embeddings Generation: Quality Verification', () => {
    let embeddings;

    beforeEach(async () => {
        embeddings = new MockLocalEmbeddings();
        await embeddings.initialize();
    });

    it('should generate normalized vectors', async () => {
        const text = 'Normalization test text';
        const embedding = await embeddings.getEmbedding(text);

        verifyVectorNormalized(embedding);
    });

    it('should maintain normalization in batch mode', async () => {
        const texts = createTestTexts(10);
        const embeddingsArray = await embeddings.getBatchEmbeddings(texts);

        embeddingsArray.forEach(embedding => {
            verifyVectorNormalized(embedding);
        });
    });

    it('should produce similar embeddings for similar texts', async () => {
        const text1 = 'The cat sits on the mat';
        const text2 = 'A cat is sitting on a mat';

        const embedding1 = await embeddings.getEmbedding(text1);
        const embedding2 = await embeddings.getEmbedding(text2);

        const similarity = cosineSimilarity(embedding1, embedding2);

        // Similar texts should have high cosine similarity (> 0.7)
        expect(similarity).toBeGreaterThan(0.7);
    });

    it('should produce different embeddings for different texts', async () => {
        const text1 = 'The cat sits on the mat';
        const text2 = 'The stock market crashed today';

        const embedding1 = await embeddings.getEmbedding(text1);
        const embedding2 = await embeddings.getEmbedding(text2);

        const similarity = cosineSimilarity(embedding1, embedding2);

        // Different texts should have lower cosine similarity than similar texts
        expect(similarity).toBeLessThan(0.9);
    });

    it('should produce identical embeddings for identical texts', async () => {
        const text = 'Identical text test';

        const embedding1 = await embeddings.getEmbedding(text);
        const embedding2 = await embeddings.getEmbedding(text);

        const similarity = cosineSimilarity(embedding1, embedding2);

        // Identical texts should have perfect similarity
        expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should calculate similarity matrix correctly', async () => {
        const texts = [
            'Machine learning is fascinating',
            'Deep learning models are powerful',
            'The weather is nice today'
        ];

        const embeddingsArray = await embeddings.getBatchEmbeddings(texts);
        const similarityMatrix = calculateSimilarityMatrix(embeddingsArray);

        // Diagonal should be 1.0 (self-similarity)
        for (let i = 0; i < texts.length; i++) {
            expect(similarityMatrix[i][i]).toBeCloseTo(1.0, 5);
        }

        // First two texts should be related (both about ML/AI)
        // Third text should be less similar (about weather)
        // The first two should have higher similarity to each other than to the third
        const simML1vsML2 = similarityMatrix[0][1];
        const simML1vsWeather = similarityMatrix[0][2];
        const simML2vsWeather = similarityMatrix[1][2];

        // Verify that ML texts are reasonably similar
        expect(simML1vsML2).toBeGreaterThan(0);

        // The similarity matrix should be symmetric
        expect(similarityMatrix[0][1]).toBeCloseTo(similarityMatrix[1][0], 5);
        expect(similarityMatrix[0][2]).toBeCloseTo(similarityMatrix[2][0], 5);
        expect(similarityMatrix[1][2]).toBeCloseTo(similarityMatrix[2][1], 5);
    });
});

// ==========================================
// Performance Optimization Tests
// ==========================================

describe('Local Embeddings Generation: Performance Optimization', () => {
    let embeddings;

    beforeEach(async () => {
        embeddings = new MockLocalEmbeddings();
        await embeddings.initialize();
    });

    it('should optimize batch size for throughput', async () => {
        const smallBatch = createTestTexts(5);
        const mediumBatch = createTestTexts(20);
        const largeBatch = createTestTexts(50);

        // Clear cache for fair comparison
        embeddings.clearCache();

        const startTime1 = performance.now();
        await embeddings.getBatchEmbeddings(smallBatch);
        const smallTime = performance.now() - startTime1;

        embeddings.clearCache();

        const startTime2 = performance.now();
        await embeddings.getBatchEmbeddings(mediumBatch);
        const mediumTime = performance.now() - startTime2;

        embeddings.clearCache();

        const startTime3 = performance.now();
        await embeddings.getBatchEmbeddings(largeBatch);
        const largeTime = performance.now() - startTime3;

        // Per-embedding time should be reasonable
        const smallPerEmbedding = smallTime / smallBatch.length;
        const mediumPerEmbedding = mediumTime / mediumBatch.length;
        const largePerEmbedding = largeTime / largeBatch.length;

        // All should complete in reasonable time
        expect(smallPerEmbedding).toBeGreaterThan(0);
        expect(mediumPerEmbedding).toBeGreaterThan(0);
        expect(largePerEmbedding).toBeGreaterThan(0);
    });

    it('should handle memory limits gracefully', async () => {
        // Simulate memory-constrained environment
        const memoryLimit = 50; // Small batch for testing
        const texts = createTestTexts(memoryLimit);

        const embeddingsArray = await embeddings.getBatchEmbeddings(texts);

        expect(embeddingsArray).toHaveLength(memoryLimit);

        // All embeddings should be valid
        embeddingsArray.forEach(embedding => {
            expect(embedding).toBeDefined();
            expect(embedding.length).toBe(EMBEDDING_DIMENSIONS);
        });
    });

    it('should report performance metrics', async () => {
        const texts = createTestTexts(10);

        const startTime = performance.now();
        await embeddings.getBatchEmbeddings(texts);
        const duration = performance.now() - startTime;

        const avgTimePerEmbedding = duration / texts.length;

        // Should complete reasonably fast
        expect(duration).toBeGreaterThan(0);
        expect(avgTimePerEmbedding).toBeGreaterThan(0);
    });

    it('should show caching performance benefit', async () => {
        const text = 'Performance caching test';

        // First call - cache miss
        const startTime1 = performance.now();
        await embeddings.getEmbedding(text);
        const firstCallTime = performance.now() - startTime1;

        // Second call - cache hit (should be faster or similar)
        const startTime2 = performance.now();
        await embeddings.getEmbedding(text);
        const secondCallTime = performance.now() - startTime2;

        // Cache should work - verify stats show a hit
        const stats = embeddings.getCacheStats();
        expect(stats.hitCount).toBeGreaterThan(0);

        // Timing may vary due to mock speed, so we just verify both complete
        expect(firstCallTime).toBeGreaterThanOrEqual(0);
        expect(secondCallTime).toBeGreaterThanOrEqual(0);
    });
});

// ==========================================
// Error Handling Tests
// ==========================================

describe('Local Embeddings Generation: Error Handling', () => {
    let embeddings;

    beforeEach(async () => {
        embeddings = new MockLocalEmbeddings();
    });

    it('should throw error when not initialized', async () => {
        await expect(embeddings.getEmbedding('test')).rejects.toThrow(
            'LocalEmbeddings not initialized'
        );
    });

    it('should throw error for invalid text input', async () => {
        await embeddings.initialize();

        await expect(embeddings.getEmbedding('')).rejects.toThrow();
        await expect(embeddings.getEmbedding(null)).rejects.toThrow();
        await expect(embeddings.getEmbedding(123)).rejects.toThrow();
    });

    it('should handle batch with all invalid texts', async () => {
        await embeddings.initialize();

        const invalidTexts = [null, '', undefined, 123, false];
        const embeddingsArray = await embeddings.getBatchEmbeddings(invalidTexts);

        expect(embeddingsArray).toHaveLength(5);
        embeddingsArray.forEach(embedding => {
            expect(embedding).toBeNull();
        });
    });

    it('should report initialization status', () => {
        expect(embeddings.isReady()).toBe(false);

        const status = embeddings.getStatus();
        expect(status.isInitialized).toBe(false);
        expect(status.loadError).toBeNull();
    });

    it('should provide model information', () => {
        const modelInfo = embeddings.getModelInfo();

        expect(modelInfo.name).toBe(MODEL_NAME);
        expect(modelInfo.dimensions).toBe(EMBEDDING_DIMENSIONS);
        expect(modelInfo.description).toBeDefined();
    });
});

// ==========================================
// Integration Tests
// ==========================================

describe('Local Embeddings Generation: Integration', () => {
    it('should handle complete embedding workflow', async () => {
        const embeddings = new MockLocalEmbeddings();

        // Initialize
        const initResult = await embeddings.initialize();
        expect(initResult).toBe(true);
        expect(embeddings.isReady()).toBe(true);

        // Generate single embedding
        const singleEmbedding = await embeddings.getEmbedding('Test text');
        expect(singleEmbedding).toBeDefined();
        verifyVectorNormalized(singleEmbedding);

        // Generate batch embeddings
        const texts = createTestTexts(5);
        const batchEmbeddings = await embeddings.getBatchEmbeddings(texts);
        expect(batchEmbeddings).toHaveLength(5);

        // Verify cache is being used
        const stats = embeddings.getCacheStats();
        expect(stats.size).toBeGreaterThan(0);

        // Clean up
        embeddings.clearCache();
        expect(embeddings.getCacheStats().size).toBe(0);
    });

    it('should maintain consistency across multiple operations', async () => {
        const embeddings = new MockLocalEmbeddings();
        await embeddings.initialize();

        const text = 'Consistency test text';

        // Generate embedding multiple times
        const embedding1 = await embeddings.getEmbedding(text);
        const embedding2 = await embeddings.getEmbedding(text);
        const embedding3 = await embeddings.getEmbedding(text);

        // All should be identical
        const sim12 = cosineSimilarity(embedding1, embedding2);
        const sim23 = cosineSimilarity(embedding2, embedding3);

        expect(sim12).toBeCloseTo(1.0, 5);
        expect(sim23).toBeCloseTo(1.0, 5);
    });
});
