/**
 * Test: SemanticQueryCache in-flight compute + model switch
 *
 * Ensures a model switch does not allow an in-flight old-model compute
 * to populate the cache for the new model or get reused by new-model callers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { SemanticQueryCache } from '../src/semantic/query-cache.js';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('SemanticQueryCache - in-flight model switch', () => {
  it('does not reuse or store old-model pending compute after model switch', async () => {
    const cache = new SemanticQueryCache({ CACHE_TTL: 60_000 });

    cache.setCurrentModel('model-a');

    let callsA = 0;
    const computeA = async () => {
      callsA++;
      await delay(30);
      return ['A'];
    };

    // Start an in-flight compute for model-a
    const pA = cache.get('hello', computeA, null, 'model-a');

    // Switch model before the compute resolves
    cache.setCurrentModel('model-b');

    let callsB = 0;
    const computeB = async () => {
      callsB++;
      return ['B'];
    };

    const b1 = await cache.get('hello', computeB, null, 'model-b');
    assert.deepStrictEqual(b1, ['B']);
    assert.strictEqual(callsB, 1);

    // Allow the old promise to resolve
    const a1 = await pA;
    assert.deepStrictEqual(a1, ['A']);
    assert.strictEqual(callsA, 1);

    // Ensure the cache still returns model-b result (not overwritten by A)
    const b2 = await cache.get('hello', computeB, null, 'model-b');
    assert.deepStrictEqual(b2, ['B']);
    assert.strictEqual(callsB, 1);
  });
});
