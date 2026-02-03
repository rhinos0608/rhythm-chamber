/**
 * Test: embeddings model consistency
 *
 * The vector index must not mix embedding models in a single store.
 * Mixing models (e.g., code vs general) produces meaningless similarity scores.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { HybridEmbeddings } from '../src/semantic/embeddings.js';

describe('HybridEmbeddings (Transformers)', () => {
  it('uses a single model for mixed code + natural language batches', async () => {
    const embeddings = new HybridEmbeddings({
      mode: 'local',
      providerPriority: ['transformers'],
      forceTransformers: true,
    });

    const calls = [];
    embeddings._fetchBatchWithModel = async (texts, modelName) => {
      calls.push({ texts, modelName });
      return texts.map(() => new Float32Array(768));
    };

    await embeddings.getBatchEmbeddings([
      'function foo() { return 1; }',
      'session persistence',
    ]);

    assert.equal(calls.length, 1);
    assert.equal(typeof calls[0].modelName, 'string');
    assert.ok(calls[0].modelName.length > 0);
  });
});

