/**
 * Test: SemanticQueryCache TTL and eviction
 *
 * Ensures the query cache does not return expired embeddings and
 * actively evicts expired entries.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { SemanticQueryCache } from '../src/semantic/query-cache.js';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('SemanticQueryCache - TTL', () => {
  it('does not return expired embeddings for normalized exact hits', async () => {
    const cache = new SemanticQueryCache({ CACHE_TTL: 10 });

    let calls = 0;
    const computeFn = async () => {
      calls++;
      return [calls];
    };

    const first = await cache.get('  Hello   World ', computeFn, null, 'model-a');
    assert.deepStrictEqual(first, [1]);

    // Allow TTL to expire
    await delay(20);

    // This should force recompute (not return stale cached embedding)
    const second = await cache.get('hello world', computeFn, null, 'model-a');
    assert.deepStrictEqual(second, [2]);
    assert.strictEqual(calls, 2);
  });

  it('evicts expired entries so has() reflects expiry', async () => {
    const cache = new SemanticQueryCache({ CACHE_TTL: 10 });

    await cache.get('foo', async () => [1], null, 'model-a');
    assert.equal(cache.has('foo'), true);

    await delay(20);

    // Trigger a cache access so eviction runs
    await cache.get('bar', async () => [2], null, 'model-a');

    assert.equal(cache.has('foo'), false);
  });
});
