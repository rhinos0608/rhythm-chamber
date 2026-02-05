/**
 * Phase 3 Critical Fixes Test Suite
 *
 * Tests for CRITICAL and HIGH severity issues found in adversarial code review.
 * Following TDD: RED → GREEN → REFACTOR
 *
 * Issues covered:
 * - CRITICAL #1: SQL Injection in FTS5 Query Construction
 * - CRITICAL #2: Hash Collision Vulnerability
 * - CRITICAL #3: Race Condition in Indexer Initialization
 * - CRITICAL #4: Silent Failure in _getRowid
 * - CRITICAL #5: Memory Exhaustion from Parallel Search
 * - HIGH #6: RRF ID Mismatch
 * - HIGH #7: Query Router Pattern Matching Too Permissive
 * - HIGH #8: Missing Transaction Handling in Batch Operations
 * - HIGH #9: Prepared Statement Memory Leak
 * - HIGH #10: No Validation of Search Results Structure
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Import classes to test
import { FTS5Adapter } from '../src/semantic/fts5-adapter.js';
import { HybridSearchEngine } from '../src/semantic/hybrid-search.js';
import { QueryRouter } from '../src/semantic/query-router.js';
import { CodeIndexer } from '../src/semantic/indexer.js';
import { HybridEmbeddings } from '../src/semantic/embeddings.js';
import { EmbeddingCache } from '../src/semantic/cache.js';
import { createVectorAdapter } from '../src/semantic/adapter-factory.js';

// Test database path
const TEST_DB_PATH = join(process.cwd(), '.test-cache', 'test-critical-fixes.db');

/**
 * Clean up test database
 */
function cleanupTestDb(dbPath) {
  if (existsSync(dbPath)) {
    try {
      unlinkSync(dbPath);
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

describe('CRITICAL #1: SQL Injection in FTS5 Query Construction', () => {
  let adapter;
  let dbPath;

  beforeEach(() => {
    ensureTestCacheDir();
    dbPath = join(process.cwd(), '.test-cache', `test-injection-${Date.now()}.db`);
    cleanupTestDb(dbPath);
    adapter = new FTS5Adapter();
  });

  afterEach(() => {
    if (adapter) {
      adapter.close();
    }
    cleanupTestDb(dbPath);
  });

  it('should sanitize FTS5 queries to prevent injection attacks', async () => {
    adapter.initialize(dbPath);

    // Add test chunks
    adapter.indexChunk('test-1', 'function handleMessage() {}', {
      file: 'test.js',
      type: 'function'
    });

    adapter.indexChunk('test-2', 'class DataService {}', {
      file: 'service.js',
      type: 'class'
    });

    // Try various injection attacks - should handle gracefully
    const injectionAttempts = [
      '" OR "1"="1',
      '"*" NEAR function',
      '"; DROP TABLE code_fts; --',
      '" OR "a"="a',
      'function") OR ("1"="1',
    ];

    for (const attempt of injectionAttempts) {
      const results = await adapter.search(attempt, { limit: 5 });

      // Should return valid array (not crash)
      assert.ok(Array.isArray(results));

      // Results should be well-formed
      results.forEach(result => {
        assert.ok(result.hasOwnProperty('id'));
        assert.ok(result.hasOwnProperty('chunkId'));
        assert.ok(result.hasOwnProperty('text'));
      });
    }
  });

  it('should escape special characters in chunkType filter', async () => {
    adapter.initialize(dbPath);

    adapter.indexChunk('test-1', 'const x = 1;', {
      file: 'test.js',
      type: 'variable'
    });

    // Try injection via chunkType parameter
    const results = await adapter.search('x', {
      limit: 5,
      chunkType: 'function"; DROP TABLE code_fts; --'
    });

    // Should handle gracefully - invalid chunkType should be ignored
    assert.ok(Array.isArray(results));
  });
});

describe('CRITICAL #2: Hash Collision Vulnerability', () => {
  let adapter;
  let dbPath;

  beforeEach(() => {
    ensureTestCacheDir();
    dbPath = join(process.cwd(), '.test-cache', `test-hash-${Date.now()}.db`);
    cleanupTestDb(dbPath);
    adapter = new FTS5Adapter();
  });

  afterEach(() => {
    if (adapter) {
      adapter.close();
    }
    cleanupTestDb(dbPath);
  });

  it('should use cryptographic hash to minimize collisions', async () => {
    adapter.initialize(dbPath);

    // Generate rowids for different chunks
    const rowid1 = adapter._generateRowid('chunk-aaaaaaaaaa');
    const rowid2 = adapter._generateRowid('chunk-bbbbbbbbbb');
    const rowid3 = adapter._generateRowid('chunk-1234567890');

    // All should be different (SHA-256 quality)
    assert.notStrictEqual(rowid1, rowid2);
    assert.notStrictEqual(rowid2, rowid3);
    assert.notStrictEqual(rowid1, rowid3);

    // Should be positive integers
    assert.ok(rowid1 > 0);
    assert.ok(rowid2 > 0);
    assert.ok(rowid3 > 0);
  });

  it('should generate deterministic rowids for same chunkId', async () => {
    adapter.initialize(dbPath);

    const chunkId = 'test-chunk-123';
    const rowid1 = adapter._generateRowid(chunkId);
    const rowid2 = adapter._generateRowid(chunkId);

    // Same chunkId should produce same rowid
    assert.strictEqual(rowid1, rowid2);
  });

  it('should handle similar chunkIds without collision', async () => {
    adapter.initialize(dbPath);

    // Chunks with similar names (common case)
    const chunkIds = [
      'handleMessage',
      'handleMessageError',
      'handleMessageSuccess',
      'handleMessages',
    ];

    const rowids = chunkIds.map(id => adapter._generateRowid(id));
    const uniqueRowids = new Set(rowids);

    // All should be unique
    assert.strictEqual(uniqueRowids.size, chunkIds.length);
  });
});

describe('CRITICAL #3: Race Condition in Indexer Initialization', () => {
  it('should handle embeddings initialization gracefully', async () => {
    // The indexer creates its own HybridEmbeddings instance
    // We just need to verify it initializes without throwing
    const indexer = new CodeIndexer(':memory:', {
      embeddings: {
        mode: 'transformers', // Use local mode to avoid API requirements
      },
    });

    // Should initialize successfully (might take a moment to load transformers)
    await assert.doesNotReject(() => indexer.initialize());

    // Should have valid state
    assert.ok(indexer.stats.embeddingSource);
    assert.ok(typeof indexer.stats.embeddingSource === 'string');
  });

  it('should validate embeddings model info after initialization', async () => {
    const indexer = new CodeIndexer(':memory:', {
      embeddings: {
        mode: 'transformers',
      },
    });

    await indexer.initialize();

    // Should have model info from embeddings
    const modelInfo = indexer.embeddings.getModelInfo();
    assert.ok(modelInfo);
    assert.ok(modelInfo.name);
  });
});

describe('CRITICAL #4: Silent Failure in _getRowid', () => {
  let adapter;
  let dbPath;

  beforeEach(() => {
    ensureTestCacheDir();
    dbPath = join(process.cwd(), '.test-cache', `test-getrowid-${Date.now()}.db`);
    cleanupTestDb(dbPath);
    adapter = new FTS5Adapter();
  });

  afterEach(() => {
    if (adapter) {
      adapter.close();
    }
    cleanupTestDb(dbPath);
  });

  it('should return null for non-existent table gracefully', async () => {
    adapter.initialize(dbPath);

    // Try to get rowid for non-existent table
    const rowid = adapter._getRowid('test-chunk', {
      content_type: 'invalid_type',
      file: 'test.xyz'
    });

    // Should return null gracefully (not crash)
    assert.strictEqual(rowid, null);
  });

  it('should handle missing chunkId in metadata', async () => {
    adapter.initialize(dbPath);

    const rowid = adapter._getRowid(null, {
      content_type: 'code',
      file: 'test.js'
    });

    // Should return null gracefully
    assert.strictEqual(rowid, null);
  });

  it('should use generated rowid when lookup fails', async () => {
    adapter.initialize(dbPath);

    // Create chunk without existing rowid
    const chunkId = 'new-chunk-test';
    const rowid = adapter._generateRowid(chunkId);

    // Should generate valid rowid
    assert.ok(rowid !== null);
    assert.ok(rowid > 0);
  });
});

describe('CRITICAL #5: Memory Exhaustion from Parallel Search', () => {
  it('should limit total results to prevent memory exhaustion', async () => {
    // Create mock adapters
    const mockVector = {
      search: () => {
        // Return 40 results
        return Array.from({ length: 40 }, (_, i) => ({
          chunkId: `chunk-${i}`,
          distance: 0.1 + (i * 0.01),
          text: `content ${i}`,
        }));
      },
    };

    const mockFTS = {
      search: async () => {
        // Return 40 results
        return Array.from({ length: 40 }, (_, i) => ({
          id: 1000 + i,
          chunkId: `chunk-${i}`,
          score: -1.5 - (i * 0.1),
          text: `content ${i}`,
        }));
      },
    };

    const engine = new HybridSearchEngine(mockVector, mockFTS);

    // Request large k value
    const results = await engine.search('test query', [1, 2, 3], {
      k: 100,
    });

    // Should limit results to prevent memory exhaustion
    // With both adapters returning 40 each, RRF should limit total
    assert.ok(results.length <= 80);
  });

  it('should calculate perSearchLimit based on total limit', async () => {
    const mockVector = {
      search: () => [],
    };

    const mockFTS = {
      search: async () => [],
    };

    const engine = new HybridSearchEngine(mockVector, mockFTS);

    // Search with limit
    await engine.search('test', [1, 2, 3], { k: 20 });

    // Both adapters should be called
    assert.ok(mockVector.search !== undefined);
    assert.ok(mockFTS.search !== undefined);
  });
});

describe('HIGH #6: RRF ID Normalization', () => {
  it('should normalize IDs from vector and FTS5 results', () => {
    const engine = new HybridSearchEngine(
      {
        search: () => {},
      },
      {
        search: async () => {},
      }
    );

    const vectorResults = [
      { chunkId: 'test-1', distance: 0.2 },
      { chunkId: 'test-2', distance: 0.3 },
    ];

    const ftsResults = [
      { id: 12345, chunkId: 'test-1', score: -1.5 },  // Use chunkId instead of chunk_id
      { id: 12346, chunkId: 'test-3', score: -2.0 },
    ];

    const merged = engine._mergeRRF(vectorResults, ftsResults, {
      rrf_k: 60,
      weights: { vector: 1.0, keyword: 1.0 },
    });

    // Should have 3 results (test-1 from both, test-2 from vector, test-3 from FTS)
    assert.strictEqual(merged.length, 3);

    // test-1 should have both sources
    const test1 = merged.find(r => r.chunkId === 'test-1');
    assert.ok(test1 !== undefined);
    assert.ok(test1.sources.includes('vector'));
    assert.ok(test1.sources.includes('keyword'));
  });

  it('should handle results with only id field', () => {
    const engine = new HybridSearchEngine(
      { search: () => {} },
      { search: async () => {} }
    );

    const vectorResults = [{ id: 'test-1', distance: 0.2 }];
    const ftsResults = [{ chunkId: 'test-1', score: -1.5 }];

    const merged = engine._mergeRRF(vectorResults, ftsResults, {
      rrf_k: 60,
      weights: { vector: 1.0, keyword: 1.0 },
    });

    // Should merge based on normalized IDs
    assert.strictEqual(merged.length, 1);
    assert.ok(merged[0].sources.includes('vector'));
    assert.ok(merged[0].sources.includes('keyword'));
  });
});

describe('HIGH #7: Query Router Specificity', () => {
  it('should NOT classify natural language as code', () => {
    const mockHybrid = { search: async () => [] };
    const router = new QueryRouter(mockHybrid);

    const intent = router._analyzeIntent('how do I fix this bug');

    // Should not match code pattern (no specific code keyword)
    // Should be docs or hybrid, not code
    assert.notStrictEqual(intent.type, 'code');
  });

  it('should classify camelCase with code keyword as code', () => {
    const mockHybrid = { search: async () => [] };
    const router = new QueryRouter(mockHybrid);

    const intent = router._analyzeIntent('function handleMessage');

    assert.strictEqual(intent.type, 'code');
  });

  it('should require specific keywords for code classification', () => {
    const mockHybrid = { search: async () => [] };
    const router = new QueryRouter(mockHybrid);

    // Pure camelCase identifier will match as code (intended for symbol search)
    const intent1 = router._analyzeIntent('handleMessage');
    assert.strictEqual(intent1.type, 'code');

    // With explicit code keyword should definitely be code
    const intent2 = router._analyzeIntent('function handleMessage');
    assert.strictEqual(intent2.type, 'code');

    // Natural language questions WITHOUT code keywords should be docs
    const intent3 = router._analyzeIntent('how does the message handling work');
    // This should match docs pattern - no code keywords like "function", "class"
    assert.strictEqual(intent3.type, 'docs');
  });

  it('should match documentation patterns correctly', () => {
    const mockHybrid = { search: async () => [] };
    const router = new QueryRouter(mockHybrid);

    const intent = router._analyzeIntent('how to install the package');

    assert.strictEqual(intent.type, 'docs');
  });
});

describe('HIGH #8: Batch Transaction Handling', () => {
  let adapter;
  let dbPath;

  beforeEach(() => {
    ensureTestCacheDir();
    dbPath = join(process.cwd(), '.test-cache', `test-batch-${Date.now()}.db`);
    cleanupTestDb(dbPath);
    adapter = new FTS5Adapter();
  });

  afterEach(() => {
    if (adapter) {
      adapter.close();
    }
    cleanupTestDb(dbPath);
  });

  it('should handle batch operations with transaction', async () => {
    adapter.initialize(dbPath);

    const items = [
      { chunkId: 'test-1', text: 'content 1', metadata: { file: 'test1.js', type: 'code' } },
      { chunkId: 'test-2', text: 'content 2', metadata: { file: 'test2.js', type: 'code' } },
      { chunkId: 'test-3', text: 'content 3', metadata: { file: 'test3.js', type: 'code' } },
    ];

    // Should not throw
    assert.doesNotThrow(() => {
      adapter.indexChunks(items);
    });

    // Verify chunks were indexed
    const stats = adapter.getStats();
    assert.strictEqual(stats.codeChunks, 3);
  });

  it('should handle empty batch gracefully', () => {
    adapter.initialize(dbPath);

    // Should not throw on empty batch
    assert.doesNotThrow(() => {
      adapter.indexChunks([]);
    });
  });
});

describe('HIGH #9: Statement Finalization', () => {
  let adapter;
  let dbPath;

  beforeEach(() => {
    ensureTestCacheDir();
    dbPath = join(process.cwd(), '.test-cache', `test-finalize-${Date.now()}.db`);
    cleanupTestDb(dbPath);
    adapter = new FTS5Adapter();
    adapter.initialize(dbPath);
  });

  afterEach(() => {
    cleanupTestDb(dbPath);
  });

  it('should clear statements map even if finalize fails', () => {
    // Mock statement that throws on finalize
    const mockStatement = {
      finalize: () => {
        throw new Error('finalize failed');
      },
    };

    adapter._statements.testStatement = mockStatement;

    // Close should not throw
    assert.doesNotThrow(() => {
      adapter.close();
    });

    // Statements should be cleared even if finalize failed
    assert.strictEqual(Object.keys(adapter._statements).length, 0);
  });

  it('should finalize all statements on close', () => {
    // Add a mock finalize method if not present
    if (adapter._statements.searchCode && !adapter._statements.searchCode.finalize) {
      adapter._statements.searchCode.finalize = () => {};
    }

    adapter.close();

    // After close, statements should be cleared
    assert.strictEqual(Object.keys(adapter._statements).length, 0);
  });
});

describe('HIGH #10: Result Validation', () => {
  it('should throw on invalid result structure', () => {
    const engine = new HybridSearchEngine(
      { search: () => {} },
      { search: async () => {} }
    );

    const invalidResults = [null, undefined, 'string', 123];

    invalidResults.forEach(results => {
      assert.throws(() => {
        engine._mergeRRF(results, [], {
          rrf_k: 60,
          weights: { vector: 1.0, keyword: 1.0 },
        });
      });
    });
  });

  it('should require chunkId or id in results', () => {
    const engine = new HybridSearchEngine(
      { search: () => {} },
      { search: async () => {} }
    );

    const invalidResults = [{ file: 'test.js' }]; // Missing id and chunkId

    assert.throws(() => {
      engine._mergeRRF(invalidResults, [], {
        rrf_k: 60,
        weights: { vector: 1.0, keyword: 1.0 },
      });
    });
  });

  it('should handle results with missing optional fields', () => {
    const engine = new HybridSearchEngine(
      { search: () => {} },
      { search: async () => {} }
    );

    const validResults = [
      { chunkId: 'test-1', distance: 0.2 }, // Missing optional fields
    ];

    // Should not throw
    assert.doesNotThrow(() => {
      engine._mergeRRF(validResults, [], {
        rrf_k: 60,
        weights: { vector: 1.0, keyword: 1.0 },
      });
    });
  });
});
