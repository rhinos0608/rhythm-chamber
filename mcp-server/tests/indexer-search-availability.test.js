/**
 * Test: CodeIndexer.search availability
 *
 * If vectors already exist (e.g., SQLite has a populated index), search should work even if
 * the `indexed` flag is false. This prevents tools from failing during background indexing
 * or when cache is missing but the vector DB is present.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import CodeIndexer from '../src/semantic/indexer.js';

describe('CodeIndexer.search', () => {
  it('does not throw when vectors exist but indexed=false', async () => {
    const indexer = Object.create(CodeIndexer.prototype);

    indexer.indexed = false;

    indexer.vectorStore = {
      getStats() {
        return { chunkCount: 1 };
      },
      async searchByText() {
        return [];
      },
    };

    indexer.embeddings = {
      async getEmbedding() {
        return new Float32Array(768);
      },
      getModelInfo() {
        return { name: 'transformers/jinaai/jina-embeddings-v2-base-code' };
      },
    };

    indexer.queryCache = {
      setCurrentModel() {},
      async get(_query, compute) {
        return compute();
      },
    };

    const res = await indexer.search('session management', {
      useHybrid: false,
      useQueryExpansion: false,
      limit: 3,
      threshold: 0.2,
    });

    assert.ok(Array.isArray(res));
  });
});

