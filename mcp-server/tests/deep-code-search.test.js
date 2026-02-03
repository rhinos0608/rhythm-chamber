/**
 * Test: deep_code_search tool formatting
 *
 * Ensures deep_code_search is code-first by default and doesn't mislead users
 * with "0% similar" for lexical-only matches.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handler as deepCodeSearch } from '../src/tools/deep-code-search.js';

describe('deep_code_search tool', () => {
  it('defaults to code-first scope (excludes docs)', async () => {
    let receivedOptions = null;
    const indexer = {
      async search(query, options) {
        receivedOptions = options;
        return [];
      },
      getChunkDetails() {
        return null;
      },
    };

    await deepCodeSearch({ query: 'Web Worker', depth: 'quick', limit: 5 }, '/project', indexer, {});
    assert.ok(receivedOptions, 'indexer.search should be called');
    assert.ok(receivedOptions.filters?.filePattern, 'code-first should set a default filePattern');
    assert.ok(receivedOptions.filters.filePattern.includes('docs') || receivedOptions.filters.filePattern.includes('coverage'));
  });

  it('labels lexical-only matches instead of showing 0% similar', async () => {
    const indexer = {
      async search() {
        return [
          {
            chunkId: 'x',
            similarity: 0,
            rrfScore: 0.01,
            metadata: {
              file: 'js/services/foo.js',
              name: 'exportedThing',
              exported: true,
              startLine: 1,
              endLine: 3,
              text: 'export const exportedThing = 1;',
            },
          },
        ];
      },
      getChunkDetails() {
        return null;
      },
    };

    const res = await deepCodeSearch({ query: 'exportedThing', depth: 'quick', limit: 1 }, '/project', indexer, {});
    const text = res.content?.[0]?.text || '';

    assert.ok(text.includes('lexical'), 'should label lexical matches');
    assert.ok(!text.includes('0% similar'), 'should not print 0% similar for lexical-only matches');
  });

  it('includes short snippets for matches by default', async () => {
    const indexer = {
      async search() {
        return [
          {
            chunkId: 'x',
            similarity: 0.8,
            metadata: {
              file: 'js/workers/example-worker.js',
              name: 'startWorker',
              startLine: 10,
              endLine: 22,
              text: 'const w = new Worker("worker.js");',
            },
          },
        ];
      },
      getChunkDetails() {
        return null;
      },
    };

    const res = await deepCodeSearch({ query: 'Web Worker', depth: 'quick', limit: 1 }, '/project', indexer, {});
    const text = res.content?.[0]?.text || '';

    assert.ok(text.includes('Snippet:'), 'should include a snippet line');
    assert.ok(text.includes('new Worker'), 'snippet should contain code');
  });
});

