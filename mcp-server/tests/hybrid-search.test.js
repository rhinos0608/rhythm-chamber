/**
 * Hybrid Search Tests (Phase 3)
 *
 * TDD Approach: RED phase - write failing tests first
 *
 * Tests cover:
 * 1. FTS5Adapter - Full-text search with BM25 ranking
 * 2. HybridSearchEngine - RRF merging of vector + keyword results
 * 3. QueryRouter - Intent analysis and routing
 * 4. End-to-end hybrid search integration
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';

// Import classes to test
import { FTS5Adapter } from '../src/semantic/fts5-adapter.js';
import { HybridSearchEngine } from '../src/semantic/hybrid-search.js';
import { QueryRouter } from '../src/semantic/query-router.js';

// Test database path
const TEST_DB_PATH = join(process.cwd(), '.test-cache', 'test-hybrid-search.db');

/**
 * Clean up test database before and after tests
 */
function cleanupTestDb() {
  if (existsSync(TEST_DB_PATH)) {
    try {
      unlinkSync(TEST_DB_PATH);
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Create test cache directory
 */
function ensureTestCacheDir() {
  const cacheDir = join(process.cwd(), '.test-cache');
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
}

describe('Hybrid Search Tests (Phase 3)', () => {
  beforeEach(() => {
    ensureTestCacheDir();
    cleanupTestDb();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  // =============================================================================
  // FTS5Adapter Tests
  // =============================================================================
  describe('FTS5Adapter', () => {
    it('should create code and docs FTS5 tables on initialization', async () => {
      const adapter = new FTS5Adapter();
      await adapter.initialize(TEST_DB_PATH);

      const stats = await adapter.getStats();
      assert.strictEqual(stats.initialized, true);
      assert.strictEqual(stats.codeChunks, 0);
      assert.strictEqual(stats.docsChunks, 0);
    });

    it('should index code chunks correctly', async () => {
      const adapter = new FTS5Adapter();
      await adapter.initialize(TEST_DB_PATH);

      await adapter.indexChunk('test-1', 'function handleMessage() {}', {
        file: 'test.js',
        type: 'function',
        layer: 'controllers'
      });

      const stats = await adapter.getStats();
      assert.strictEqual(stats.codeChunks, 1);
    });

    it('should index documentation chunks correctly', async () => {
      const adapter = new FTS5Adapter();
      await adapter.initialize(TEST_DB_PATH);

      await adapter.indexChunk('doc-1', '# API Reference\n\nThis is documentation.', {
        file: 'README.md',
        type: 'md-section',
        title: 'API Reference'
      });

      const stats = await adapter.getStats();
      assert.strictEqual(stats.docsChunks, 1);
    });

    it('should return BM25 ranked results for code search', async () => {
      const adapter = new FTS5Adapter();
      await adapter.initialize(TEST_DB_PATH);

      // Index test chunks
      await adapter.indexChunk('code-1', 'function handleMessage(msg) { return process(msg); }', {
        file: 'controllers/message.js',
        type: 'function',
        layer: 'controllers'
      });

      await adapter.indexChunk('code-2', 'class MessageQueue { push(msg) {} }', {
        file: 'services/queue.js',
        type: 'class',
        layer: 'services'
      });

      await adapter.indexChunk('code-3', 'const config = { port: 8080 };', {
        file: 'config.js',
        type: 'variable',
        layer: 'utils'
      });

      // Search for 'handleMessage'
      const results = await adapter.search('handleMessage', { limit: 5 });

      assert.ok(results.length > 0);
      assert.ok(results[0].chunkId !== undefined);
      assert.ok(results[0].score !== undefined);
      assert.ok(results[0].snippet !== undefined);
      assert.strictEqual(results[0].chunkId, 'code-1');
    });

    it('should return BM25 ranked results for docs search', async () => {
      const adapter = new FTS5Adapter();
      await adapter.initialize(TEST_DB_PATH);

      // Index documentation chunks
      await adapter.indexChunk('doc-1', '# Installation Guide\n\nnpm install my-package', {
        file: 'INSTALL.md',
        type: 'md-section',
        title: 'Installation Guide'
      });

      await adapter.indexChunk('doc-2', '# API Reference\n\nThe handleMessage function processes messages.', {
        file: 'API.md',
        type: 'md-section',
        title: 'API Reference'
      });

      // Search for 'install'
      const results = await adapter.search('install', { limit: 5, indexType: 'docs' });

      assert.ok(results.length > 0);
      assert.strictEqual(results[0].chunkId, 'doc-1');
    });

    it('should rebuild indexes from existing chunk_metadata tables', async () => {
      const adapter = new FTS5Adapter();
      await adapter.initialize(TEST_DB_PATH);

      // First, populate chunk_metadata directly
      const db = new Database(TEST_DB_PATH);
      db.exec(`
        CREATE TABLE IF NOT EXISTS chunk_metadata (
          chunk_id TEXT PRIMARY KEY,
          vec_rowid INTEGER,
          text TEXT,
          name TEXT,
          type TEXT,
          file TEXT,
          line INTEGER,
          exported INTEGER,
          layer TEXT,
          context_before TEXT,
          context_after TEXT,
          updated_at INTEGER
        );

        INSERT INTO chunk_metadata VALUES
          ('chunk-1', NULL, 'function test() {}', 'test', 'function', 'test.js', 1, 0, 'controllers', NULL, NULL, 1),
          ('chunk-2', NULL, '# Documentation', 'Documentation', 'md-section', 'README.md', 1, 0, NULL, NULL, NULL, 1);
      `);
      db.close();

      // Rebuild FTS5 indexes
      await adapter.rebuildIndexes();

      const stats = await adapter.getStats();
      assert.strictEqual(stats.codeChunks, 1);
      assert.strictEqual(stats.docsChunks, 1);
    });

    it('should return correct statistics', async () => {
      const adapter = new FTS5Adapter();
      await adapter.initialize(TEST_DB_PATH);

      // Index some chunks
      await adapter.indexChunk('code-1', 'function foo() {}', { file: 'foo.js', type: 'function' });
      await adapter.indexChunk('code-2', 'function bar() {}', { file: 'bar.js', type: 'function' });
      await adapter.indexChunk('doc-1', '# Docs', { file: 'README.md', type: 'md-section' });

      const stats = await adapter.getStats();
      assert.strictEqual(stats.codeChunks, 2);
      assert.strictEqual(stats.docsChunks, 1);
      assert.strictEqual(stats.initialized, true);
    });
  });

  // =============================================================================
  // HybridSearchEngine Tests
  // =============================================================================
  describe('HybridSearchEngine', () => {
    it('should merge vector and keyword results using RRF', async () => {
      // Mock vector store
      const mockVectorStore = {
        search: async (embedding, options) => [
          { chunkId: 'chunk-1', similarity: 0.9, metadata: { name: 'foo' } },
          { chunkId: 'chunk-2', similarity: 0.8, metadata: { name: 'bar' } }
        ]
      };

      // Mock FTS5 adapter
      const mockFTS5 = {
        search: async (query, options) => [
          { chunkId: 'chunk-2', score: 0.95, snippet: 'bar function' },
          { chunkId: 'chunk-3', score: 0.85, snippet: 'baz function' }
        ]
      };

      const engine = new HybridSearchEngine(mockVectorStore, mockFTS5);
      const results = await engine.search('test query', new Float32Array(768));

      // chunk-2 appears in both rankings, should have highest combined score
      assert.ok(results.length > 0);
      const chunk2 = results.find(r => r.chunkId === 'chunk-2');
      assert.ok(chunk2);
      assert.ok(chunk2.sources.includes('vector'));
      assert.ok(chunk2.sources.includes('keyword'));
    });

    it('should calculate adaptive weights based on query type', () => {
      const mockVectorStore = { search: async () => [] };
      const mockFTS5 = { search: async () => [] };

      const engine = new HybridSearchEngine(mockVectorStore, mockFTS5);

      // Exact match query → favor keyword
      const exactWeights = engine.calculateWeights('handleMessage');
      assert.ok(exactWeights.keyword > exactWeights.vector);

      // Natural language query → favor semantic
      const nlWeights = engine.calculateWeights('how are sessions created');
      assert.ok(nlWeights.vector > nlWeights.keyword);

      // Default balanced
      const defaultWeights = engine.calculateWeights('api endpoint design');
      assert.strictEqual(defaultWeights.vector, defaultWeights.keyword);
    });

    it('should track result sources correctly', async () => {
      const mockVectorStore = {
        search: async () => [
          { chunkId: 'only-vector', similarity: 0.9, metadata: {} }
        ]
      };

      const mockFTS5 = {
        search: async () => [
          { chunkId: 'only-keyword', score: 0.9, snippet: 'keyword result' }
        ]
      };

      const engine = new HybridSearchEngine(mockVectorStore, mockFTS5);
      const results = await engine.search('test', new Float32Array(768));

      const onlyVector = results.find(r => r.chunkId === 'only-vector');
      const onlyKeyword = results.find(r => r.chunkId === 'only-keyword');

      assert.deepStrictEqual(onlyVector.sources, ['vector']);
      assert.deepStrictEqual(onlyKeyword.sources, ['keyword']);
    });

    it('should apply RRF k parameter correctly', async () => {
      const mockVectorStore = {
        search: async () => [
          { chunkId: 'chunk-1', similarity: 0.9, metadata: {} },
          { chunkId: 'chunk-2', similarity: 0.8, metadata: {} }
        ]
      };

      const mockFTS5 = {
        search: async () => [
          { chunkId: 'chunk-2', score: 0.9, snippet: '' },
          { chunkId: 'chunk-3', score: 0.8, snippet: '' }
        ]
      };

      const engine = new HybridSearchEngine(mockVectorStore, mockFTS5);
      const results = await engine.search('test', new Float32Array(768), { rrf_k: 60 });

      // Verify RRF calculation: 1/(k + rank)
      // chunk-1: rank 1 in vector → 1/(60+1) = 0.0164
      // chunk-2: rank 2 in vector, rank 1 in keyword → 1/(60+2) + 1/(60+1) = 0.0323
      assert.strictEqual(results[0].chunkId, 'chunk-2'); // Should be ranked higher
    });
  });

  // =============================================================================
  // QueryRouter Tests
  // =============================================================================
  describe('QueryRouter', () => {
    it('should route code queries to code index', async () => {
      const mockHybrid = {
        search: async () => []
      };

      const router = new QueryRouter(mockHybrid);
      const intent = router._analyzeIntent('function handleMessage');

      assert.strictEqual(intent.type, 'code');
      assert.ok(intent.weights.keyword > intent.weights.vector);
    });

    it('should route documentation queries to docs index', async () => {
      const mockHybrid = {
        search: async () => []
      };

      const router = new QueryRouter(mockHybrid);
      const intent = router._analyzeIntent('how to install the package');

      assert.strictEqual(intent.type, 'docs');
      assert.ok(intent.weights.vector > intent.weights.keyword);
    });

    it('should route hybrid queries to both indexes', async () => {
      const mockHybrid = {
        search: async () => []
      };

      const router = new QueryRouter(mockHybrid);
      const intent = router._analyzeIntent('api endpoint for authentication');

      assert.strictEqual(intent.type, 'hybrid');
      assert.ok(Math.abs(intent.weights.vector - intent.weights.keyword) < 0.01);
    });

    it('should apply correct index type filter based on intent', async () => {
      let searchOptions = {};

      const mockHybrid = {
        search: async (query, embedding, options) => {
          searchOptions = options;
          return [];
        }
      };

      const router = new QueryRouter(mockHybrid);

      // Code query
      await router.search('function handleMessage', new Float32Array(768));
      assert.strictEqual(searchOptions.indexType, 'code');

      // Docs query
      await router.search('how to install', new Float32Array(768));
      assert.strictEqual(searchOptions.indexType, 'docs');

      // Hybrid query
      await router.search('api endpoint', new Float32Array(768));
      assert.strictEqual(searchOptions.indexType, undefined); // Both indexes
    });
  });

  // =============================================================================
  // End-to-End Integration Tests
  // =============================================================================
  describe('End-to-End Hybrid Search', () => {
    it('should perform full hybrid search with merged results', async () => {
      // Create real adapters for end-to-end test
      const ftsAdapter = new FTS5Adapter();
      await ftsAdapter.initialize(TEST_DB_PATH);

      // Mock vector adapter (full vector search requires embeddings)
      const mockVectorAdapter = {
        search: async (embedding, options) => [
          {
            chunkId: 'code-1',
            similarity: 0.9,
            text: 'function handleMessage(msg) { return process(msg); }',
            file: 'controllers/message.js',
            type: 'function',
            layer: 'controllers'
          },
          {
            chunkId: 'code-3',
            similarity: 0.7,
            text: 'const config = { port: 8080 };',
            file: 'config.js',
            type: 'variable',
            layer: 'utils'
          }
        ]
      };

      // Index test data in FTS5
      await ftsAdapter.indexChunk('code-1', 'function handleMessage(msg) { return process(msg); }', {
        file: 'controllers/message.js',
        type: 'function',
        layer: 'controllers'
      });

      await ftsAdapter.indexChunk('code-2', 'class MessageQueue { push(msg) {} }', {
        file: 'services/queue.js',
        type: 'class',
        layer: 'services'
      });

      await ftsAdapter.indexChunk('code-3', 'const config = { port: 8080 };', {
        file: 'config.js',
        type: 'variable',
        layer: 'utils'
      });

      // Create hybrid search engine
      const engine = new HybridSearchEngine(mockVectorAdapter, ftsAdapter);

      // Perform hybrid search
      const results = await engine.search('handleMessage', new Float32Array(768), {
        k: 10,
        rrf_k: 60
      });

      // Verify results are merged and ranked
      assert.ok(results.length > 0, 'should return results');
      assert.ok(results[0].combined_score > 0, 'should have combined score');

      // Verify source tracking
      const code1Result = results.find(r => r.chunkId === 'code-1');
      assert.ok(code1Result, 'should find code-1 in results');
      assert.ok(code1Result.sources.includes('vector'), 'should track vector source');
      assert.ok(code1Result.sources.includes('keyword'), 'should track keyword source');

      // Verify RRF merging - code-1 appears in both, should be ranked higher
      assert.strictEqual(results[0].chunkId, 'code-1', 'chunk appearing in both sources should be ranked highest');

      // Verify metadata is preserved
      assert.strictEqual(code1Result.file, 'controllers/message.js', 'should preserve file metadata');
      assert.strictEqual(code1Result.type, 'function', 'should preserve type metadata');
    });

    it('should return results with source metadata', async () => {
      const ftsAdapter = new FTS5Adapter();
      await ftsAdapter.initialize(TEST_DB_PATH);

      // Index FTS data with content that will match
      await ftsAdapter.indexChunk('only-keyword', 'test keyword result', {
        file: 'keyword.js',
        type: 'function'
      });

      await ftsAdapter.indexChunk('both', 'test both result', {
        file: 'both.js',
        type: 'class'
      });

      const mockVectorAdapter = {
        search: async () => [
          {
            chunkId: 'only-vector',
            similarity: 0.9,
            text: 'vector only result',
            file: 'vector.js',
            type: 'function'
          },
          {
            chunkId: 'both',
            similarity: 0.8,
            text: 'test both result',
            file: 'both.js',
            type: 'class'
          }
        ]
      };

      const engine = new HybridSearchEngine(mockVectorAdapter, ftsAdapter);
      const results = await engine.search('test', new Float32Array(768));

      // Verify source metadata
      const onlyVector = results.find(r => r.chunkId === 'only-vector');
      const onlyKeyword = results.find(r => r.chunkId === 'only-keyword');
      const both = results.find(r => r.chunkId === 'both');

      assert.ok(onlyVector, 'should find vector-only result');
      assert.ok(onlyKeyword, 'should find keyword-only result');
      assert.ok(both, 'should find result from both sources');

      assert.deepStrictEqual(onlyVector.sources, ['vector'], 'vector-only should have vector source');
      assert.deepStrictEqual(onlyKeyword.sources, ['keyword'], 'keyword-only should have keyword source');
      assert.ok(both.sources.includes('vector'), 'both should have vector source');
      assert.ok(both.sources.includes('keyword'), 'both should have keyword source');

      // Verify ranking details are present
      assert.ok(both.vec_rank !== null, 'should have vector rank');
      assert.ok(both.fts_rank !== null, 'should have FTS rank');
      assert.ok(both.combined_score > 0, 'should have combined score');
    });

    it('should handle edge cases gracefully', async () => {
      const ftsAdapter = new FTS5Adapter();
      await ftsAdapter.initialize(TEST_DB_PATH);

      const mockVectorAdapter = {
        search: async () => []
      };

      const engine = new HybridSearchEngine(mockVectorAdapter, ftsAdapter);

      // Test 1: Empty query
      const emptyResults = await engine.search('', new Float32Array(768));
      assert.ok(Array.isArray(emptyResults), 'should return array for empty query');

      // Test 2: No results from either source
      const noResults = await engine.search('nonexistent query xyz', new Float32Array(768));
      assert.ok(Array.isArray(noResults), 'should return array with no results');
      assert.strictEqual(noResults.length, 0, 'should return empty array when no matches');

      // Test 3: Null embedding (should not throw)
      try {
        await engine.search('test', null);
        // Should either work or throw gracefully
      } catch (error) {
        assert.ok(error.message, 'should throw meaningful error if it throws');
      }

      // Test 4: Very large k parameter (should be limited)
      await ftsAdapter.indexChunk('test-1', 'test content', { file: 'test.js', type: 'function' });
      const largeKResults = await engine.search('test', new Float32Array(768), { k: 10000 });
      assert.ok(largeKResults.length <= 100, 'should limit results to prevent memory exhaustion');

      // Test 5: One adapter fails (graceful degradation)
      const failingVectorAdapter = {
        search: async () => {
          throw new Error('Vector search failed');
        }
      };
      const engineWithFailing = new HybridSearchEngine(failingVectorAdapter, ftsAdapter);
      const degradedResults = await engineWithFailing.search('test', new Float32Array(768));
      assert.ok(Array.isArray(degradedResults), 'should return results even with one adapter failed');
      assert.ok(degradedResults.length > 0, 'should return FTS results when vector fails');

      // Test 6: Both adapters fail
      const failingFtsAdapter = {
        search: async () => {
          throw new Error('FTS search failed');
        }
      };
      const engineWithBothFailing = new HybridSearchEngine(failingVectorAdapter, failingFtsAdapter);
      const bothFailedResults = await engineWithBothFailing.search('test', new Float32Array(768));
      assert.ok(Array.isArray(bothFailedResults), 'should return empty array when both fail');
      assert.strictEqual(bothFailedResults.length, 0, 'should return empty array when both fail');
    });
  });
});
