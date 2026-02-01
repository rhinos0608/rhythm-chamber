/**
 * Test: SemanticQueryCache has() respects TTL
 *
 * Ensures has() does not report stale entries even if periodic cleanup
 * hasn't run yet.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { SemanticQueryCache } from '../src/semantic/query-cache.js';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('SemanticQueryCache - has() TTL', () => {
  it('returns false for expired entries without requiring a cleanup sweep', async () => {
    const cache = new SemanticQueryCache({ CACHE_TTL: 10, CLEANUP_INTERVAL_MS: 60_000 });

    await cache.get('foo', async () => [1], null, 'model-a');
    assert.equal(cache.has('foo'), true);

    await delay(20);

    // No other cache operations: has() should still reflect expiry.
    assert.equal(cache.has('foo'), false);
  });
});
