/**
 * Test: HealthMonitor missing chunk detection
 *
 * Verifies _findFilesWithMissingChunks uses EmbeddingCache APIs correctly
 * and never yields undefined file paths.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { HealthMonitor } from '../src/semantic/health-monitor.js';

function createIndexerStub() {
  return {
    cache: {
      getCachedFiles: () => ['a.js', null, undefined, 'b.js'],
      getFileChunks: file => {
        if (file === 'a.js') return ['a1', 'a2'];
        if (file === 'b.js') return ['b1'];
        return [];
      },
    },
    vectorStore: {
      getByFile: file => {
        if (file === 'a.js') return [{ chunkId: 'a1' }]; // missing one
        if (file === 'b.js') return [{ chunkId: 'b1' }]; // ok
        return [];
      },
    },
  };
}

describe('HealthMonitor - missing chunks detection', () => {
  it('returns only valid file paths with missing chunks', async () => {
    const indexer = createIndexerStub();
    const hm = new HealthMonitor(indexer, null, { autoHeal: false });

    const files = await hm._findFilesWithMissingChunks();

    assert.deepStrictEqual(files, ['a.js']);
    assert.ok(files.every(Boolean));
  });
});
