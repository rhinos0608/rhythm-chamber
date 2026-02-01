/**
 * Test: CodeIndexer.reindexFiles mutex
 *
 * Ensures concurrent calls to reindexFiles do not spin and do not overlap.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';

import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import CodeIndexer from '../src/semantic/indexer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDir = join(__dirname, '.test-reindex');

function createIndexerStub() {
  const indexer = Object.create(CodeIndexer.prototype);

  indexer.projectRoot = '/';
  indexer._reindexInProgress = false;
  indexer._reindexPromise = null;

  let active = 0;
  let maxActive = 0;

  indexer._indexFile = async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise(r => setTimeout(r, 20));
    active--;
  };

  indexer._saveCache = async () => {};

  return { indexer, getMaxActive: () => maxActive };
}

describe('CodeIndexer - reindexFiles mutex', () => {
  before(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });

    await writeFile(join(testDir, 'a.js'), 'export const a = 1;');
    await writeFile(join(testDir, 'b.js'), 'export const b = 2;');
  });

  it('serializes concurrent reindexFiles calls (no overlap)', async () => {
    const { indexer, getMaxActive } = createIndexerStub();

    const aPath = join(testDir, 'a.js');
    const bPath = join(testDir, 'b.js');

    const p1 = indexer.reindexFiles([aPath]);
    const p2 = indexer.reindexFiles([bPath]);

    const [r1, r2] = await Promise.all([p1, p2]);

    assert.deepStrictEqual(r1, { reindexed: 1 });
    assert.deepStrictEqual(r2, { reindexed: 1 });
    assert.strictEqual(getMaxActive(), 1);
  });
});
