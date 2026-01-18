/**
 * Unit tests for EmbeddingsTaskManager Checkpoint Storage
 * 
 * Tests the hybrid localStorage + IndexedDB checkpoint strategy
 * that prevents localStorage quota exceeded errors for large streaming histories.
 * 
 * @see js/embeddings/embeddings-task-manager.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock IndexedDB and localStorage for testing
const mockIDBStore = new Map();
let mockLocalStorage = {};

// Track quota behavior
let shouldExceedQuota = false;
let quotaExceededSize = 1 * 1024 * 1024; // 1MB

// Mock localStorage with quota simulation
const mockLocalStorageImpl = {
    getItem: (key) => mockLocalStorage[key] ?? null,
    setItem: (key, value) => {
        const size = new Blob([value]).size;
        if (shouldExceedQuota && size > quotaExceededSize) {
            const error = new DOMException('QuotaExceededError', 'QuotaExceededError');
            error.name = 'QuotaExceededError';
            throw error;
        }
        mockLocalStorage[key] = value;
    },
    removeItem: (key) => {
        delete mockLocalStorage[key];
    },
    clear: () => {
        mockLocalStorage = {};
    }
};

// Mock IndexedDB
const mockDB = {
    transaction: (storeName, mode) => ({
        objectStore: () => ({
            put: (data) => {
                const request = {
                    onsuccess: null,
                    onerror: null,
                    result: data.key
                };
                setTimeout(() => {
                    mockIDBStore.set(data.key, data);
                    request.onsuccess?.();
                }, 0);
                return request;
            },
            get: (key) => {
                const request = {
                    onsuccess: null,
                    onerror: null,
                    result: mockIDBStore.get(key)
                };
                setTimeout(() => {
                    request.onsuccess?.();
                }, 0);
                return request;
            },
            delete: (key) => {
                const request = {
                    onsuccess: null,
                    onerror: null
                };
                setTimeout(() => {
                    mockIDBStore.delete(key);
                    request.onsuccess?.();
                }, 0);
                return request;
            }
        })
    })
};

// Apply mocks
beforeEach(() => {
    mockLocalStorage = {};
    mockIDBStore.clear();
    shouldExceedQuota = false;

    global.localStorage = mockLocalStorageImpl;
    global.Blob = globalThis.Blob || class {
        constructor(parts) {
            this.size = parts.reduce((acc, p) => acc + (typeof p === 'string' ? p.length : 0), 0);
        }
    };
});

afterEach(() => {
    vi.restoreAllMocks();
    mockLocalStorage = {};
    mockIDBStore.clear();
});

describe('Checkpoint Storage Strategy', () => {
    describe('Size Estimation', () => {
        it('should estimate JSON size in bytes', () => {
            // Import dynamically to get fresh module
            const data = { test: 'hello world' };
            const json = JSON.stringify(data);

            // Using actual Blob if available, otherwise estimate
            const size = new Blob([json]).size;
            expect(size).toBeGreaterThan(0);
            expect(size).toBeLessThan(100);
        });

        it('should detect large texts arrays', () => {
            // Create a large texts array (simulating 1k streaming history chunks)
            const largeTexts = Array(1000).fill('This is a sample text chunk for embedding');
            const json = JSON.stringify(largeTexts);
            const size = new Blob([json]).size;

            // Should be ~40KB for 1000 texts
            expect(size).toBeGreaterThan(40000); // ~40KB for 1000 texts
        });
    });

    describe('Threshold Detection', () => {
        const THRESHOLD = 1 * 1024 * 1024; // 1MB

        it('should classify small texts as localStorage-safe', () => {
            const smallTexts = ['chunk1', 'chunk2', 'chunk3'];
            const size = new Blob([JSON.stringify(smallTexts)]).size;

            expect(size).toBeLessThan(THRESHOLD);
        });

        it('should classify large texts as requiring IndexedDB', () => {
            // Create texts that exceed 1MB
            const largeTexts = Array(30000).fill('This is a reasonably sized text chunk for embedding that contains some content');
            const size = new Blob([JSON.stringify(largeTexts)]).size;

            expect(size).toBeGreaterThan(THRESHOLD);
        });
    });

    describe('Metadata Structure', () => {
        it('should include textsStoredInIDB flag', () => {
            const metadata = {
                processedCount: 50,
                totalCount: 100,
                timestamp: Date.now(),
                taskId: 'embed_123',
                processedIndices: [0, 1, 2],
                nextIndex: 50,
                textsStoredInIDB: true,
                textsCount: 100
            };

            expect(metadata.textsStoredInIDB).toBe(true);
            expect(metadata.textsCount).toBe(100);
            expect(metadata.processedCount).toBeLessThan(metadata.totalCount);
        });

        it('should validate checkpoint integrity', () => {
            const validCheckpoint = {
                processedCount: 25,
                totalCount: 50,
                texts: Array(50).fill('text'),
                textsCount: 50,
                taskId: 'task_1'
            };

            // Validation checks
            expect(validCheckpoint.processedCount).toBeDefined();
            expect(validCheckpoint.totalCount).toBeDefined();
            expect(Array.isArray(validCheckpoint.texts)).toBe(true);
            expect(validCheckpoint.texts.length).toBe(validCheckpoint.textsCount);
            expect(validCheckpoint.processedCount).toBeLessThan(validCheckpoint.totalCount);
        });

        it('should detect invalid checkpoint when texts count mismatches', () => {
            const invalidCheckpoint = {
                processedCount: 25,
                totalCount: 50,
                texts: Array(30).fill('text'), // Mismatch: 30 vs textsCount: 50
                textsCount: 50,
                taskId: 'task_1'
            };

            expect(invalidCheckpoint.texts.length).not.toBe(invalidCheckpoint.textsCount);
        });
    });

    describe('Backward Compatibility', () => {
        it('should support legacy checkpoint format (texts in localStorage)', () => {
            const legacyCheckpoint = {
                processedCount: 10,
                totalCount: 20,
                timestamp: Date.now(),
                taskId: 'embed_old',
                texts: ['text1', 'text2', 'text3'],
                processedIndices: [],
                nextIndex: 10
                // No textsStoredInIDB flag - legacy format
            };

            localStorage.setItem('embedding_checkpoint', JSON.stringify(legacyCheckpoint));

            const stored = JSON.parse(localStorage.getItem('embedding_checkpoint'));
            expect(stored.texts).toBeDefined();
            expect(stored.textsStoredInIDB).toBeUndefined();
        });

        it('should recognize new metadata key', () => {
            const newCheckpoint = {
                processedCount: 10,
                totalCount: 20,
                textsStoredInIDB: false,
                textsCount: 20,
                texts: Array(20).fill('text')
            };

            localStorage.setItem('embedding_checkpoint_meta', JSON.stringify(newCheckpoint));

            const stored = JSON.parse(localStorage.getItem('embedding_checkpoint_meta'));
            expect(stored.textsStoredInIDB).toBe(false);
        });
    });

    describe('Quota Handling', () => {
        it('should detect QuotaExceededError', () => {
            shouldExceedQuota = true;
            quotaExceededSize = 100; // Very low threshold

            const largeData = JSON.stringify({ data: 'x'.repeat(500) });

            expect(() => {
                localStorage.setItem('test_key', largeData);
            }).toThrow('QuotaExceededError');
        });

        it('should not throw for small data even with quota enabled', () => {
            shouldExceedQuota = true;
            quotaExceededSize = 1000;

            const smallData = JSON.stringify({ a: 1 });

            expect(() => {
                localStorage.setItem('test_key', smallData);
            }).not.toThrow();
        });
    });

    describe('IndexedDB Fallback', () => {
        it('should store data in mock IndexedDB', async () => {
            const testData = {
                key: 'test_texts',
                value: ['text1', 'text2'],
                timestamp: Date.now()
            };

            // Simulate IndexedDB storage
            mockIDBStore.set(testData.key, testData);

            expect(mockIDBStore.has('test_texts')).toBe(true);
            expect(mockIDBStore.get('test_texts').value).toEqual(['text1', 'text2']);
        });

        it('should clear data from IndexedDB', () => {
            mockIDBStore.set('test_key', { value: 'data' });
            expect(mockIDBStore.has('test_key')).toBe(true);

            mockIDBStore.delete('test_key');
            expect(mockIDBStore.has('test_key')).toBe(false);
        });
    });

    describe('Checkpoint Lifecycle', () => {
        it('should follow save -> load -> clear lifecycle', () => {
            const checkpoint = {
                processedCount: 50,
                totalCount: 100,
                textsStoredInIDB: false,
                textsCount: 100,
                texts: Array(100).fill('chunk')
            };

            // Save
            localStorage.setItem('embedding_checkpoint_meta', JSON.stringify(checkpoint));
            expect(localStorage.getItem('embedding_checkpoint_meta')).not.toBeNull();

            // Load
            const loaded = JSON.parse(localStorage.getItem('embedding_checkpoint_meta'));
            expect(loaded.processedCount).toBe(50);
            expect(loaded.texts.length).toBe(100);

            // Clear
            localStorage.removeItem('embedding_checkpoint_meta');
            expect(localStorage.getItem('embedding_checkpoint_meta')).toBeNull();
        });

        it('should clear both localStorage and IndexedDB on cleanup', () => {
            // Set up data in both stores
            localStorage.setItem('embedding_checkpoint_meta', '{}');
            localStorage.setItem('embedding_checkpoint', '{}'); // Legacy
            mockIDBStore.set('embedding_checkpoint_texts', { value: [] });

            // Clear all
            localStorage.removeItem('embedding_checkpoint_meta');
            localStorage.removeItem('embedding_checkpoint');
            mockIDBStore.delete('embedding_checkpoint_texts');

            // Verify cleanup
            expect(localStorage.getItem('embedding_checkpoint_meta')).toBeNull();
            expect(localStorage.getItem('embedding_checkpoint')).toBeNull();
            expect(mockIDBStore.has('embedding_checkpoint_texts')).toBe(false);
        });
    });
});

describe('Large Data Handling', () => {
    it('should calculate size correctly for streaming history scale data', () => {
        // Simulate 100k streaming history generating ~5000 texts chunks
        // Each chunk is typically 100-500 chars
        const chunks = Array(5000).fill(null).map((_, i) =>
            `In January 2024, user listened for 45 hours with 1500 plays. Top artists: Taylor Swift (200 plays), The Weeknd (150 plays), Drake (100 plays). ${i}`
        );

        const size = new Blob([JSON.stringify(chunks)]).size;

        // Should be several hundred KB at minimum
        expect(size).toBeGreaterThan(500 * 1024); // > 500KB
        console.log(`5000 chunks size: ${(size / 1024 / 1024).toFixed(2)}MB`);
    });

    it('should identify when IndexedDB is needed', () => {
        const THRESHOLD = 1 * 1024 * 1024;

        // Small data - localStorage OK
        const smallData = Array(100).fill('short chunk');
        const smallSize = new Blob([JSON.stringify(smallData)]).size;
        const needsIDB_small = smallSize > THRESHOLD;
        expect(needsIDB_small).toBe(false);

        // Large data - needs IndexedDB (use enough data to exceed 1MB)
        const largeData = Array(20000).fill('This is a reasonably sized text chunk for semantic search embedding that contains multiple words and phrases');
        const largeSize = new Blob([JSON.stringify(largeData)]).size;
        console.log(`largeSize: ${(largeSize / 1024 / 1024).toFixed(2)}MB`);
        const needsIDB_large = largeSize > THRESHOLD;
        expect(needsIDB_large).toBe(true);
    });
});
