/**
 * Test: HealthMonitor vector mismatch trigger
 *
 * Ensures vector mismatch only triggers when vectors are missing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { HealthMonitor } from '../src/semantic/health-monitor.js';

function createIndexerStub({ vectorCount, expectedCount }) {
  return {
    stats: { chunksIndexed: expectedCount, filesIndexed: 1, cacheFailures: 0 },
    vectorStore: { chunkCount: vectorCount },
    cache: { getStats: () => ({ fileCount: 1 }) },
  };
}

describe('HealthMonitor - vector mismatch', () => {
  it('does not treat extra vectors as missing', async () => {
    const indexer = createIndexerStub({ vectorCount: 12, expectedCount: 10 });
    const hm = new HealthMonitor(indexer, null, { autoHeal: true });

    let recoverCalled = false;
    hm._autoRecover = async () => {
      recoverCalled = true;
    };

    await hm._checkHealth();
    assert.strictEqual(recoverCalled, false);
  });

  it('triggers recovery when vectors are missing', async () => {
    const indexer = createIndexerStub({ vectorCount: 8, expectedCount: 10 });
    const hm = new HealthMonitor(indexer, null, { autoHeal: true });

    let recoverCalled = false;
    hm._autoRecover = async () => {
      recoverCalled = true;
    };

    await hm._checkHealth();
    assert.strictEqual(recoverCalled, true);
  });
});
