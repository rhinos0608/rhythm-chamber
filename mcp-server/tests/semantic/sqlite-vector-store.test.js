/**
 * Unit tests for SqliteVectorAdapter
 *
 * Tests the SQLite adapter for disk-backed vector storage.
 * Run with: node --test mcp-server/tests/semantic/sqlite-vector-store.test.js
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { SqliteVectorAdapter } from '../../src/semantic/sqlite-adapter.js';
import { cosineSimilarity } from '../../src/semantic/embeddings.js';

/**
 * Helper to create a unique test database path
 */
function getTestDbPath(suiteName) {
  return join(tmpdir(), `test-sqlite-${suiteName}-${Date.now()}.db`);
}

/**
 * Helper to create and initialize adapter for a test
 */
function createAdapter(dbPath, dimension = 768) {
  const adapter = new SqliteVectorAdapter();
  adapter.initialize(dbPath, dimension);
  return adapter;
}

describe('SqliteVectorAdapter', () => {
  describe('initialization', () => {
    it('should initialize with database and vec0 tables', () => {
      const dbPath = getTestDbPath('init');
      const adapter = createAdapter(dbPath);

      try {
        assert.strictEqual(adapter.isInitialized, true);
        assert.strictEqual(adapter.dbPath, dbPath);
        assert.strictEqual(adapter.dimension, 768);
        assert.ok(existsSync(dbPath), 'Database file created');
      } finally {
        adapter.close();
        rmSync(dbPath);
      }
    });

    it('should skip re-initialization if already initialized', () => {
      const dbPath = getTestDbPath('reinit');
      const adapter = createAdapter(dbPath);

      try {
        const dbPathAfter = adapter.dbPath;

        // Re-initialize should be skipped
        adapter.initialize(dbPath, 768);

        assert.strictEqual(adapter.dbPath, dbPathAfter, 'dbPath unchanged');
      } finally {
        adapter.close();
        rmSync(dbPath);
      }
    });

    it('should support custom dimensions', () => {
      const dbPath = getTestDbPath('custom-dim');
      let adapter;

      try {
        adapter = createAdapter(dbPath, 512);
        assert.strictEqual(adapter.dimension, 512);
      } finally {
        if (adapter) adapter.close();
        rmSync(dbPath);
      }
    });
  });

  describe('upsert', () => {
    let adapter;
    let dbPath;

    beforeEach(() => {
      dbPath = getTestDbPath('upsert');
      adapter = createAdapter(dbPath);
    });

    afterEach(() => {
      adapter.close();
      rmSync(dbPath);
    });

    it('should insert a single chunk', () => {
      const embedding = new Float32Array(768).fill(0.1);
      const metadata = {
        text: 'test code',
        name: 'testFunction',
        type: 'function',
        file: 'test.js',
        line: 10,
        exported: true,
      };

      adapter.upsert('chunk_1', embedding, metadata);

      const stats = adapter.getStats();
      assert.strictEqual(stats.chunkCount, 1);
    });

    it('should update existing chunk', () => {
      const embedding = new Float32Array(768).fill(0.1);

      adapter.upsert('chunk_1', embedding, { text: 'original' });
      adapter.upsert('chunk_1', embedding, { text: 'updated' });

      const chunk = adapter.get('chunk_1');
      assert.strictEqual(chunk.metadata.text, 'updated');
    });

    it('should handle batch upserts', () => {
      const batchSize = 10;
      const embeddings = [];

      for (let i = 0; i < batchSize; i++) {
        const embedding = new Float32Array(768).fill(i * 0.001);
        adapter.upsert(`chunk_${i}`, embedding, {
          text: `test ${i}`,
          name: `func_${i}`,
        });
      }

      const stats = adapter.getStats();
      assert.strictEqual(stats.chunkCount, batchSize);
    });

    it('should store Float32Array and Array embeddings', () => {
      const float32Emb = new Float32Array(768).fill(0.5);
      const arrayEmb = new Array(768).fill(0.5);

      adapter.upsert('chunk_float32', float32Emb, { text: 'float32' });
      adapter.upsert('chunk_array', arrayEmb, { text: 'array' });

      const stats = adapter.getStats();
      assert.strictEqual(stats.chunkCount, 2);
    });

    it('should convert exported boolean to integer', () => {
      adapter.upsert('chunk_1', new Float32Array(768).fill(0.1), {
        exported: true,
      });

      const chunk = adapter.get('chunk_1');
      assert.strictEqual(chunk.metadata.exported, true);
    });

    it('should store all metadata fields', () => {
      const embedding = new Float32Array(768).fill(0.1);
      const metadata = {
        text: 'example text',
        name: 'exampleName',
        type: 'class',
        file: 'example.js',
        line: 42,
        exported: false,
        layer: 'services',
        contextBefore: 'before context',
        contextAfter: 'after context',
      };

      adapter.upsert('test_chunk', embedding, metadata);

      const chunk = adapter.get('test_chunk');
      assert.strictEqual(chunk.metadata.text, metadata.text);
      assert.strictEqual(chunk.metadata.name, metadata.name);
      assert.strictEqual(chunk.metadata.type, metadata.type);
      assert.strictEqual(chunk.metadata.file, metadata.file);
      assert.strictEqual(chunk.metadata.line, metadata.line);
      assert.strictEqual(chunk.metadata.exported, metadata.exported);
      assert.strictEqual(chunk.metadata.layer, metadata.layer);
      assert.strictEqual(chunk.metadata.contextBefore, metadata.contextBefore);
      assert.strictEqual(chunk.metadata.contextAfter, metadata.contextAfter);
    });
  });

  describe('search', () => {
    let adapter;
    let dbPath;

    beforeEach(() => {
      dbPath = getTestDbPath('search');
      adapter = createAdapter(dbPath);

      // Insert test chunks with known similarities
      // chunk_0: all 0.1, chunk_1: all 0.5, chunk_2: all 1.0
      // Note: Cannot use zero vector because cosine similarity is undefined for zero vectors
      adapter.upsert('chunk_0', new Float32Array(768).fill(0.1), { name: 'tenths' });
      adapter.upsert('chunk_1', new Float32Array(768).fill(0.5), { name: 'halves' });
      adapter.upsert('chunk_2', new Float32Array(768).fill(1.0), { name: 'ones' });
    });

    afterEach(() => {
      adapter.close();
      rmSync(dbPath);
    });

    it('should return results sorted by similarity', () => {
      const query = new Float32Array(768).fill(1.0); // Similar to chunk_2
      const results = adapter.search(query, { limit: 5, threshold: 0.0 });

      // All chunks should be returned with threshold 0.0
      assert.strictEqual(results.length, 3);

      // All chunks should have similarity 1.0 (parallel vectors)
      assert.ok(results.every(r => Math.abs(r.similarity - 1.0) < 0.0001));

      // Results should be sorted by distance (ascending), which is similarity descending
      for (let i = 1; i < results.length; i++) {
        assert.ok(
          results[i - 1].similarity >= results[i].similarity,
          `Result ${i - 1} (${results[i - 1].similarity}) >= Result ${i} (${results[i].similarity})`
        );
      }
    });

    it('should respect threshold parameter', () => {
      const query = new Float32Array(768).fill(0.8);
      const results = adapter.search(query, { threshold: 0.5, limit: 10 });

      // Only chunks with similarity >= 0.5 should be returned
      assert.ok(results.every(r => r.similarity >= 0.5));
    });

    it('should respect limit parameter', () => {
      // Query similar to chunk_2 (all ones)
      const query = new Float32Array(768).fill(1.0);
      const results = adapter.search(query, { limit: 2, threshold: 0.0 });

      assert.strictEqual(results.length, 2);
      // With threshold 0.0, all 3 chunks should match, but limit returns only 2
    });

    it('should filter by chunkType', () => {
      // Add more chunks with different types
      adapter.upsert('chunk_class', new Float32Array(768).fill(0.3), {
        type: 'class',
        name: 'TestClass',
      });
      adapter.upsert('chunk_method', new Float32Array(768).fill(0.3), {
        type: 'method',
        name: 'testMethod',
      });

      const query = new Float32Array(768).fill(0.3);
      const results = adapter.search(query, {
        filters: { chunkType: 'class' },
        limit: 10,
      });

      assert.ok(results.every(r => r.metadata.type === 'class'));
    });

    it('should filter by exportedOnly', () => {
      adapter.upsert('exported_func', new Float32Array(768).fill(0.3), {
        exported: true,
        name: 'exportedFunc',
      });
      adapter.upsert('private_func', new Float32Array(768).fill(0.3), {
        exported: false,
        name: 'privateFunc',
      });

      const query = new Float32Array(768).fill(0.3);
      const results = adapter.search(query, {
        filters: { exportedOnly: true },
        limit: 10,
      });

      assert.ok(results.every(r => r.metadata.exported === true));
    });

    it('should filter by layer', () => {
      adapter.upsert('service_chunk', new Float32Array(768).fill(0.3), {
        layer: 'services',
        name: 'serviceFunc',
      });
      adapter.upsert('controller_chunk', new Float32Array(768).fill(0.3), {
        layer: 'controllers',
        name: 'controllerFunc',
      });

      const query = new Float32Array(768).fill(0.3);
      const results = adapter.search(query, {
        filters: { layer: 'services' },
        limit: 10,
      });

      assert.ok(results.every(r => r.metadata.layer === 'services'));
    });

    it('should handle Float32Array and Array query embeddings', () => {
      const float32Query = new Float32Array(768).fill(0.5);
      const arrayQuery = new Array(768).fill(0.5);

      const results1 = adapter.search(float32Query, { limit: 5 });
      const results2 = adapter.search(arrayQuery, { limit: 5 });

      assert.strictEqual(results1.length, results2.length);
    });

    // CRITICAL FIX #5: Validate sqlite-vec's cosine distance matches in-memory cosineSimilarity()
    it('should match in-memory cosine similarity calculations', () => {
      const query = new Float32Array(768).fill(0.7);
      const chunkId = 'chunk_test';
      const embedding = new Float32Array(768).fill(0.5);

      // Insert test chunk
      adapter.upsert(chunkId, embedding, { name: 'test' });

      // Get results from SQLite adapter
      const results = adapter.search(query, { limit: 5, threshold: 0.0 });

      assert.ok(results.length > 0, 'Should return at least one result');

      // Calculate expected similarity using in-memory cosineSimilarity()
      const expectedSimilarity = cosineSimilarity(query, embedding);

      // Find the result for our test chunk
      const testResult = results.find(r => r.chunkId === chunkId);
      assert.ok(testResult, 'Should find the test chunk in results');

      // CRITICAL FIX #5: Validate that sqlite-vec's cosine distance calculation
      // matches the in-memory cosineSimilarity() function within floating-point tolerance
      const similarityDelta = Math.abs(testResult.similarity - expectedSimilarity);
      const tolerance = 0.0001; // Allow small floating-point differences

      assert.ok(
        similarityDelta < tolerance,
        `Cosine similarity mismatch: sqlite-vec=${testResult.similarity}, in-memory=${expectedSimilarity}, delta=${similarityDelta}`
      );
    });
  });

  describe('get', () => {
    let adapter;
    let dbPath;

    beforeEach(() => {
      dbPath = getTestDbPath('get');
      adapter = createAdapter(dbPath);
    });

    afterEach(() => {
      adapter.close();
      rmSync(dbPath);
    });

    it('should retrieve chunk by ID', () => {
      const embedding = new Float32Array(768).fill(0.1);
      const metadata = { text: 'test', name: 'test' };

      adapter.upsert('chunk_1', embedding, metadata);

      const chunk = adapter.get('chunk_1');

      assert.strictEqual(chunk.chunkId, 'chunk_1');
      assert.strictEqual(chunk.metadata.text, 'test');
      assert.strictEqual(chunk.hasEmbedding, true);
    });

    it('should return null for non-existent chunk', () => {
      const chunk = adapter.get('nonexistent');

      assert.strictEqual(chunk, null);
    });
  });

  describe('delete', () => {
    let adapter;
    let dbPath;

    beforeEach(() => {
      dbPath = getTestDbPath('delete');
      adapter = createAdapter(dbPath);

      const embedding = new Float32Array(768).fill(0.1);
      adapter.upsert('chunk_1', embedding, { text: 'test' });
      adapter.upsert('chunk_2', embedding, { text: 'test2' });
    });

    afterEach(() => {
      adapter.close();
      rmSync(dbPath);
    });

    it('should delete chunk by ID', () => {
      const deleted = adapter.delete('chunk_1');

      assert.strictEqual(deleted, true);

      const chunk = adapter.get('chunk_1');
      assert.strictEqual(chunk, null);

      const stats = adapter.getStats();
      assert.strictEqual(stats.chunkCount, 1);
    });

    it('should return false for non-existent chunk', () => {
      const deleted = adapter.delete('nonexistent');

      assert.strictEqual(deleted, false);
    });

    it('should delete both vector and metadata', () => {
      adapter.delete('chunk_2');

      // Metadata should also be gone
      const stats = adapter.getStats();
      assert.strictEqual(stats.chunkCount, 1);
    });
  });

  describe('getStats', () => {
    let adapter;
    let dbPath;

    beforeEach(() => {
      dbPath = getTestDbPath('stats');
      adapter = createAdapter(dbPath);
    });

    afterEach(() => {
      adapter.close();
      rmSync(dbPath);
    });

    it('should return correct statistics', () => {
      const embedding = new Float32Array(768).fill(0.1);
      adapter.upsert('chunk_1', embedding, {});
      adapter.upsert('chunk_2', embedding, {});
      adapter.upsert('chunk_3', embedding, {});

      const stats = adapter.getStats();

      assert.strictEqual(stats.initialized, true);
      assert.strictEqual(stats.chunkCount, 3);
      assert.strictEqual(stats.dimension, 768);
      assert.strictEqual(stats.dbPath, dbPath);
      assert.ok(stats.dbSizeBytes > 0, 'Database file has size');
    });

    it('should return uninit stats when not initialized', () => {
      const newAdapter = new SqliteVectorAdapter();
      const stats = newAdapter.getStats();

      assert.strictEqual(stats.initialized, false);
      assert.strictEqual(stats.dbSizeBytes, 0);
    });
  });

  describe('close', () => {
    it('should close database connection', () => {
      const dbPath = getTestDbPath('close');
      const adapter = createAdapter(dbPath);

      assert.strictEqual(adapter.isInitialized, true);

      adapter.close();

      assert.strictEqual(adapter.isInitialized, false);

      rmSync(dbPath);
    });

    it('should handle multiple close calls gracefully', () => {
      const dbPath = getTestDbPath('close-multi');
      const adapter = createAdapter(dbPath);

      adapter.close();
      adapter.close(); // Should not throw

      assert.strictEqual(adapter.isInitialized, false);

      rmSync(dbPath);
    });
  });

  describe('edge cases', () => {
    let adapter;
    let dbPath;

    beforeEach(() => {
      dbPath = getTestDbPath('edge');
      adapter = createAdapter(dbPath);
    });

    afterEach(() => {
      adapter.close();
      rmSync(dbPath);
    });

    it('should handle empty embedding array', () => {
      const empty = new Float32Array(768);

      adapter.upsert('empty_chunk', empty, { text: 'empty' });

      const chunk = adapter.get('empty_chunk');
      assert.strictEqual(chunk.metadata.text, 'empty');
    });

    it('should handle special characters in metadata', () => {
      const embedding = new Float32Array(768).fill(0.1);
      const metadata = {
        text: 'Text with "quotes" and \'apostrophes\'',
        name: 'func-with-dash',
      };

      adapter.upsert('special_chunk', embedding, metadata);

      const chunk = adapter.get('special_chunk');
      assert.strictEqual(chunk.metadata.text, metadata.text);
      assert.strictEqual(chunk.metadata.name, metadata.name);
    });

    it('should throw error when upserting before initialization', () => {
      const newAdapter = new SqliteVectorAdapter();

      assert.throws(
        () => newAdapter.upsert('test', new Float32Array(768), {}),
        /SqliteAdapter not initialized/
      );
    });
  });
});
