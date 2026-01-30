/**
 * Test: Cache Embedding Storage
 *
 * Tests that the cache properly stores and retrieves embeddings,
 * avoiding unnecessary regeneration during server startup.
 */

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import { unlink, mkdir, rmdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { EmbeddingCache } from '../src/semantic/cache.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('EmbeddingCache - Embedding Storage', () => {
  const testCacheDir = join(__dirname, '.test-cache');
  const cacheFile = join(testCacheDir, 'semantic-embeddings.json');

  // Clean up before ALL tests
  before(async () => {
    // Clear entire test cache directory
    const cache = new EmbeddingCache(testCacheDir, { enabled: true });
    await cache.initialize();
    await cache.delete();
    await mkdir(testCacheDir, { recursive: true });
  });

  // Clean up after EACH test to avoid cross-contamination
  afterEach(async () => {
    // Clear cache between tests
    const cache = new EmbeddingCache(testCacheDir, { enabled: true });
    await cache.initialize();
    await cache.delete();
  });

  after(async () => {
    if (existsSync(cacheFile)) {
      await unlink(cacheFile);
    }
    // Try to clean up directory
    try {
      await rmdir(testCacheDir);
    } catch {
      // Directory not empty, ignore
    }
  });

  it('should store embeddings along with chunk data', async () => {
    const cache = new EmbeddingCache(testCacheDir, { enabled: true });
    await cache.initialize();

    // Create test chunks with embeddings
    const chunks = [
      {
        id: 'test_chunk_1',
        text: 'function hello() { return "world"; }',
        type: 'function',
        name: 'hello',
        metadata: { file: 'test.js', startLine: 1, endLine: 3 }
      },
      {
        id: 'test_chunk_2',
        text: 'const x = 42;',
        type: 'variable',
        name: 'x',
        metadata: { file: 'test.js', startLine: 5, endLine: 5 }
      }
    ];

    // Create embeddings (768 dimensions for all-MiniLM-L6-v2)
    const embeddings = [
      new Float32Array(768).fill(0.1),
      new Float32Array(768).fill(0.2)
    ];

    // Store chunks WITH embeddings
    await cache.storeFileChunks('test.js', chunks, Date.now(), embeddings);

    // Verify embeddings are stored
    const chunk1 = cache.getChunk('test_chunk_1');
    assert.ok(chunk1, 'Chunk 1 should be retrieved');
    assert.ok(chunk1.embedding, 'Chunk 1 should have embedding');
    assert.strictEqual(chunk1.embedding.length, 768, 'Embedding should have 768 dimensions');
    assert.ok(Math.abs(chunk1.embedding[0] - 0.1) < 0.0001, 'First value should match (within float precision)');

    const chunk2 = cache.getChunk('test_chunk_2');
    assert.ok(chunk2, 'Chunk 2 should be retrieved');
    assert.ok(chunk2.embedding, 'Chunk 2 should have embedding');
    assert.ok(Math.abs(chunk2.embedding[0] - 0.2) < 0.0001, 'First value should match (within float precision)');

    console.error('✓ Embeddings stored correctly in cache');
  });

  it('should retrieve embeddings from cache after save/load', async () => {
    const cache1 = new EmbeddingCache(testCacheDir, { enabled: true });
    await cache1.initialize();

    // Store chunks with embeddings
    const chunks = [
      {
        id: 'persisted_chunk',
        text: 'function persisted() { return true; }',
        type: 'function',
        name: 'persisted',
        metadata: { file: 'persist.js', startLine: 1, endLine: 3 }
      }
    ];

    const embeddings = [
      new Float32Array(768).fill(0.5)
    ];

    await cache1.storeFileChunks('persist.js', chunks, Date.now(), embeddings);
    await cache1.save();

    // Create new cache instance (simulates server restart)
    const cache2 = new EmbeddingCache(testCacheDir, { enabled: true });
    await cache2.initialize();

    // Verify embeddings persisted
    const retrieved = cache2.getChunk('persisted_chunk');
    assert.ok(retrieved, 'Chunk should be retrieved after reload');
    assert.ok(retrieved.embedding, 'Chunk should have embedding after reload');
    assert.strictEqual(retrieved.embedding.length, 768, 'Embedding dimensions should persist');
    assert.strictEqual(retrieved.embedding[0], 0.5, 'Embedding values should persist');

    console.error('✓ Embeddings persist across save/load cycles');
  });

  it('should not regenerate embeddings when loading from cache', async () => {
    const cache = new EmbeddingCache(testCacheDir, { enabled: true });
    await cache.initialize();

    // Store chunk with embedding
    const chunks = [
      {
        id: 'cached_chunk',
        text: 'function cached() { return "loaded"; }',
        type: 'function',
        name: 'cached',
        metadata: { file: 'cached.js', startLine: 1, endLine: 3 }
      }
    ];

    const originalEmbedding = new Float32Array(768).fill(0.7);
    await cache.storeFileChunks('cached.js', chunks, Date.now(), [originalEmbedding]);

    // Retrieve from cache
    const retrieved = cache.getChunk('cached_chunk');

    // Verify we got the cached embedding, not a regenerated one
    assert.ok(retrieved.embedding, 'Should have embedding from cache');
    assert.deepStrictEqual(
      Array.from(retrieved.embedding),
      Array.from(originalEmbedding),
      'Should use cached embedding, not regenerate'
    );

    console.error('✓ Cached embeddings used without regeneration');
  });

  it('should maintain cache statistics with embeddings', async () => {
    const cache = new EmbeddingCache(testCacheDir, { enabled: true });
    await cache.initialize();

    const chunks = [
      { id: 'stats_1', text: 'const a = 1;', type: 'variable', name: 'a', metadata: {} },
      { id: 'stats_2', text: 'const b = 2;', type: 'variable', name: 'b', metadata: {} }
    ];

    const embeddings = [
      new Float32Array(768).fill(0.1),
      new Float32Array(768).fill(0.2)
    ];

    await cache.storeFileChunks('stats.js', chunks, Date.now(), embeddings);
    await cache.save();

    const stats = cache.getStats();
    assert.strictEqual(stats.fileCount, 1, 'Should have 1 file');
    assert.strictEqual(stats.chunkCount, 2, 'Should have 2 chunks');

    // Size should include embeddings (768 * 4 bytes * 2 chunks = 6144 bytes)
    assert.ok(stats.approximateSize > 6000, 'Cache size should include embeddings');

    console.error(`✓ Cache stats include embeddings (${stats.approximateSize} bytes)`);
  });
});
