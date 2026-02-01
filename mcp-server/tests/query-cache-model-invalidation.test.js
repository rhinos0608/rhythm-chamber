/**
 * Test: SemanticQueryCache model invalidation
 *
 * Verifies that switching models clears the cache and forces recompute.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { SemanticQueryCache } from '../src/semantic/query-cache.js';

describe('SemanticQueryCache - model invalidation', () => {
  it('clears cache when current model changes', async () => {
    const cache = new SemanticQueryCache({ CACHE_TTL: 60_000 });

    let calls = 0;
    const computeFn = async () => {
      calls++;
      return [calls];
    };

    cache.setCurrentModel('model-a');
    const a1 = await cache.get('hello', computeFn, null, 'model-a');
    const a2 = await cache.get('hello', computeFn, null, 'model-a');
    assert.deepStrictEqual(a1, [1]);
    assert.deepStrictEqual(a2, [1]);
    assert.strictEqual(calls, 1);

    // Switch model -> cache should be cleared
    cache.setCurrentModel('model-b');

    const b1 = await cache.get('hello', computeFn, null, 'model-b');
    assert.deepStrictEqual(b1, [2]);
    assert.strictEqual(calls, 2);
  });
});
