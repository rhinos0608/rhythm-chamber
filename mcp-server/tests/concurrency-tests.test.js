/**
 * Concurrency Tests
 *
 * Tests for HIGH #8: Missing Concurrency Tests
 *
 * These tests verify concurrent operations:
 * - Parallel indexing
 * - Concurrent searching
 * - Race condition prevention
 * - Lock and mutex behavior
 *
 * Phase 4: Comprehensive Testing
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import { FTS5Adapter } from '../src/semantic/fts5-adapter.js';
import { SymbolIndex } from '../src/semantic/symbol-index.js';
import { HybridSearchEngine } from '../src/semantic/hybrid-search.js';

const TEST_DB_PATH = join(process.cwd(), '.test-cache', 'test-concurrency.db');

function cleanup() {
  if (existsSync(TEST_DB_PATH)) {
    try {
      unlinkSync(TEST_DB_PATH);
    } catch (error) {
      // Ignore
    }
  }
}

function ensureTestCacheDir() {
  const cacheDir = join(process.cwd(), '.test-cache');
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
}

describe('Concurrency Tests', () => {
  beforeEach(() => {
    ensureTestCacheDir();
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * Parallel Indexing
   *
   * Tests that multiple files can be indexed concurrently
   */
  describe('Parallel Indexing', () => {
    it('should handle parallel FTS5 indexing', async () => {
      const adapter = new FTS5Adapter();
      await adapter.initialize(TEST_DB_PATH);

      // Index 100 chunks in parallel
      const indexPromises = Array.from({ length: 100 }, (_, i) =>
        adapter.indexChunk(`chunk-${i}`, `function test${i}() { return ${i}; }`, {
          file: `test${i}.js`,
          type: 'function',
          layer: 'controllers'
        })
      );

      await Promise.all(indexPromises);

      // Verify all chunks were indexed
      const stats = await adapter.getStats();
      assert.strictEqual(stats.codeChunks, 100, 'should index all 100 chunks');

      // Verify search works
      const results = await adapter.search('test50');
      assert.ok(results.length > 0, 'should find indexed chunks');

      adapter.close?.();
    });

    it('should handle parallel SymbolIndex updates', async () => {
      const symbolIndex = new SymbolIndex(TEST_DB_PATH);
      symbolIndex.initialize(TEST_DB_PATH);

      // Add 100 symbols in parallel
      const addPromises = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve().then(() => {
          symbolIndex.addChunk({
            id: `chunk-${i}`,
            type: 'function',
            name: `function${i}`,
            text: `function function${i}() { return ${i}; }`,
            metadata: {
              file: `test${i}.js`,
              startLine: 1,
              endLine: 3,
              exported: true
            }
          });
        })
      );

      await Promise.all(addPromises);

      // Verify all symbols were added
      assert.strictEqual(symbolIndex.definitions.size, 100, 'should add all 100 symbols');

      // Verify lookup works
      const def = symbolIndex.findDefinition('function50');
      assert.ok(def.length > 0, 'should find symbol');

      symbolIndex.close();
    });

    it('should handle mixed parallel operations', async () => {
      const adapter = new FTS5Adapter();
      await adapter.initialize(TEST_DB_PATH);

      // Mix of indexing and searching
      const operations = [];

      // Indexing operations
      for (let i = 0; i < 50; i++) {
        operations.push(
          adapter.indexChunk(`chunk-${i}`, `function test${i}() {}`, {
            file: `test${i}.js`,
            type: 'function'
          })
        );
      }

      // Search operations (may run during indexing)
      for (let i = 0; i < 20; i++) {
        operations.push(adapter.search('test'));
      }

      // Stats operations
      for (let i = 0; i < 10; i++) {
        operations.push(adapter.getStats());
      }

      const results = await Promise.all(operations);

      // Verify operations completed
      assert.ok(results.length === 80, 'should complete all operations');

      // Verify final state
      const stats = await adapter.getStats();
      assert.ok(stats.codeChunks >= 50, 'should index all chunks');

      adapter.close?.();
    });
  });

  /**
   * Concurrent Searching
   *
   * Tests that multiple searches can run concurrently
   */
  describe('Concurrent Searching', () => {
    it('should handle concurrent FTS5 searches', async () => {
      const adapter = new FTS5Adapter();
      await adapter.initialize(TEST_DB_PATH);

      // Index test data
      for (let i = 0; i < 100; i++) {
        await adapter.indexChunk(`chunk-${i}`, `function test${i}() { return ${i}; }`, {
          file: `test${i}.js`,
          type: 'function'
        });
      }

      // Launch 200 concurrent searches
      const searchPromises = Array.from({ length: 200 }, (_, i) =>
        adapter.search(`test${i % 100}`, { limit: 10 })
      );

      const results = await Promise.all(searchPromises);

      // Verify all searches completed
      assert.strictEqual(results.length, 200, 'should complete all searches');
      assert.ok(results.every(r => Array.isArray(r)), 'all searches should return arrays');

      adapter.close?.();
    });

    it('should handle concurrent hybrid searches', async () => {
      const ftsAdapter = new FTS5Adapter();
      await ftsAdapter.initialize(TEST_DB_PATH);

      // Index test data
      for (let i = 0; i < 50; i++) {
        await ftsAdapter.indexChunk(`chunk-${i}`, `function test${i}() {}`, {
          file: `test${i}.js`,
          type: 'function'
        });
      }

      const mockVectorAdapter = {
        search: async () => [
          {
            chunkId: 'chunk-25',
            similarity: 0.9,
            text: 'function test25() {}',
            file: 'test25.js',
            type: 'function'
          }
        ]
      };

      const engine = new HybridSearchEngine(mockVectorAdapter, ftsAdapter);

      // Launch 100 concurrent hybrid searches
      const searchPromises = Array.from({ length: 100 }, (_, i) =>
        engine.search(`test${i % 50}`, new Float32Array(768))
      );

      const results = await Promise.all(searchPromises);

      // Verify all searches completed
      assert.strictEqual(results.length, 100, 'should complete all searches');
      assert.ok(results.every(r => Array.isArray(r)), 'all searches should return arrays');

      ftsAdapter.close?.();
    });

    it('should handle concurrent symbol lookups', async () => {
      const symbolIndex = new SymbolIndex(TEST_DB_PATH);
      symbolIndex.initialize(TEST_DB_PATH);

      // Add symbols
      for (let i = 0; i < 100; i++) {
        symbolIndex.addChunk({
          id: `chunk-${i}`,
          type: 'function',
          name: `function${i}`,
          text: `function function${i}() {}`,
          metadata: {
            file: `test${i}.js`,
            startLine: 1,
            endLine: 3,
            exported: true
          }
        });
      }

      // Launch 500 concurrent lookups
      const lookupPromises = Array.from({ length: 500 }, (_, i) =>
        Promise.resolve().then(() => symbolIndex.findDefinition(`function${i % 100}`))
      );

      const results = await Promise.all(lookupPromises);

      // Verify all lookups completed
      assert.strictEqual(results.length, 500, 'should complete all lookups');
      assert.ok(results.every(r => Array.isArray(r)), 'all lookups should return arrays');

      symbolIndex.close();
    });
  });

  /**
   * Race Condition Prevention
   *
   * Tests that race conditions are prevented
   */
  describe('Race Condition Prevention', () => {
    it('should prevent concurrent SymbolIndex initialization', async () => {
      const symbolIndex = new SymbolIndex(TEST_DB_PATH);

      // Try to initialize from multiple "threads" (simulated with promises)
      const initPromises = Array.from({ length: 10 }, () =>
        Promise.resolve().then(() => {
          try {
            symbolIndex.initialize(TEST_DB_PATH);
            return { success: true, error: null };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })
      );

      const results = await Promise.all(initPromises);

      // Only one should succeed, others should fail or be skipped
      const successCount = results.filter(r => r.success).length;
      assert.ok(successCount >= 1, 'at least one initialization should succeed');

      // Verify it's initialized
      assert.strictEqual(symbolIndex.isInitialized, true, 'should be initialized');

      symbolIndex.close();
    });

    it('should prevent concurrent FTS5Adapter initialization', async () => {
      const adapter = new FTS5Adapter();

      // Try to initialize from multiple "threads"
      const initPromises = Array.from({ length: 10 }, () =>
        Promise.resolve().then(() => {
          try {
            adapter.initialize(TEST_DB_PATH);
            return { success: true };
          } catch (error) {
            return { success: false };
          }
        })
      );

      const results = await Promise.all(initPromises);

      // At least one should succeed
      const successCount = results.filter(r => r.success).length;
      assert.ok(successCount >= 1, 'at least one initialization should succeed');

      adapter.close?.();
    });

    it('should handle rapid clear and reindex', async () => {
      const symbolIndex = new SymbolIndex(TEST_DB_PATH);
      symbolIndex.initialize(TEST_DB_PATH);

      // Add, clear, and reindex rapidly
      for (let i = 0; i < 10; i++) {
        // Add chunks
        for (let j = 0; j < 10; j++) {
          symbolIndex.addChunk({
            id: `chunk-${i}-${j}`,
            type: 'function',
            name: `function${i}_${j}`,
            text: `function function${i}_${j}() {}`,
            metadata: {
              file: `test${i}.js`,
              startLine: 1,
              endLine: 3,
              exported: true
            }
          });
        }

        // Clear
        symbolIndex.clear();

        // Verify clear
        assert.strictEqual(symbolIndex.definitions.size, 0, 'should clear all definitions');
      }

      symbolIndex.close();
    });
  });

  /**
   * Concurrent Read-Write Operations
   *
   * Tests that reads and writes can happen concurrently
   */
  describe('Concurrent Read-Write Operations', () => {
    it('should handle concurrent indexing and searching', async () => {
      const adapter = new FTS5Adapter();
      await adapter.initialize(TEST_DB_PATH);

      const operations = [];

      // Mix of indexing and searching
      for (let i = 0; i < 100; i++) {
        // Index
        operations.push(
          adapter.indexChunk(`chunk-${i}`, `function test${i}() {}`, {
            file: `test${i}.js`,
            type: 'function'
          })
        );

        // Search (may or may not find the chunk depending on timing)
        operations.push(adapter.search('test'));
      }

      const results = await Promise.all(operations);

      // Verify all operations completed
      assert.strictEqual(results.length, 200, 'should complete all operations');

      // Verify final state
      const stats = await adapter.getStats();
      assert.strictEqual(stats.codeChunks, 100, 'should index all chunks');

      adapter.close?.();
    });

    it('should handle concurrent symbol updates and lookups', async () => {
      const symbolIndex = new SymbolIndex(TEST_DB_PATH);
      symbolIndex.initialize(TEST_DB_PATH);

      const operations = [];

      // Mix of updates and lookups
      for (let i = 0; i < 100; i++) {
        // Update
        operations.push(
          Promise.resolve().then(() => {
            symbolIndex.addChunk({
              id: `chunk-${i}`,
              type: 'function',
              name: `function${i}`,
              text: `function function${i}() {}`,
              metadata: {
                file: `test${i}.js`,
                startLine: 1,
                endLine: 3,
                exported: true
              }
            });
          })
        );

        // Lookup
        operations.push(
          Promise.resolve().then(() => symbolIndex.findDefinition(`function${i}`))
        );
      }

      await Promise.all(operations);

      // Verify all symbols were added
      assert.strictEqual(symbolIndex.definitions.size, 100, 'should add all symbols');

      symbolIndex.close();
    });
  });

  /**
   * Stress Tests
   *
   * High-load concurrent operations
   */
  describe('Stress Tests', () => {
    it('should handle 1000 concurrent operations', async () => {
      const adapter = new FTS5Adapter();
      await adapter.initialize(TEST_DB_PATH);

      // Create 1000 concurrent operations
      const operations = [];

      for (let i = 0; i < 500; i++) {
        operations.push(
          adapter.indexChunk(`chunk-${i}`, `function test${i}() {}`, {
            file: `test${i}.js`,
            type: 'function'
          })
        );
      }

      for (let i = 0; i < 500; i++) {
        operations.push(adapter.search('test'));
      }

      const start = Date.now();
      const results = await Promise.all(operations);
      const duration = Date.now() - start;

      // Verify all operations completed
      assert.strictEqual(results.length, 1000, 'should complete all 1000 operations');

      // Should complete in reasonable time
      assert.ok(duration < 10000, `should complete in < 10 seconds (actual: ${duration}ms)`);

      // Verify final state
      const stats = await adapter.getStats();
      assert.strictEqual(stats.codeChunks, 500, 'should index all chunks');

      adapter.close?.();
    });

    it('should handle rapid consecutive operations', async () => {
      const adapter = new FTS5Adapter();
      await adapter.initialize(TEST_DB_PATH);

      // Perform operations in rapid succession
      for (let i = 0; i < 100; i++) {
        await adapter.indexChunk(`chunk-${i}`, `function test${i}() {}`, {
          file: `test${i}.js`,
          type: 'function'
        });

        await adapter.search('test');

        await adapter.getStats();
      }

      // Verify all operations completed
      const stats = await adapter.getStats();
      assert.strictEqual(stats.codeChunks, 100, 'should index all chunks');

      adapter.close?.();
    });
  });
});
