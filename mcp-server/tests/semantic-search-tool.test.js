/**
 * Test: semantic_search tool behavior
 *
 * Focuses on output defaults and filtering behavior to avoid confusing results
 * (e.g., docs dominating code queries, lexical-only results showing 0%).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handler as semanticSearch } from '../src/tools/semantic-search.js';

function makeStubIndexer({ stats, results }) {
  return {
    getStats() {
      return stats;
    },
    async search(query, options = {}) {
      const patternStr = options?.filters?.filePattern;
      if (!patternStr) {
        return results;
      }

      const pattern = new RegExp(patternStr);
      return results.filter(r => pattern.test(r?.metadata?.file || ''));
    },
  };
}

describe('semantic_search tool', () => {
  it('defaults to code-first scope and non-summary output', async () => {
    const indexer = makeStubIndexer({
      stats: { vectorStore: { chunkCount: 10 }, embeddingSource: 'transformers' },
      results: [
        {
          chunkId: 'docs_chunk',
          similarity: 0.9,
          metadata: {
            file: 'docs/API.md',
            name: 'API',
            type: 'md-section',
            startLine: 1,
            endLine: 5,
            text: '- Web Worker docs bullet',
          },
        },
        {
          chunkId: 'worker_chunk',
          similarity: 0.73,
          metadata: {
            file: 'js/workers/example-worker.js',
            name: 'startWorker',
            type: 'function',
            exported: true,
            startLine: 10,
            endLine: 22,
            text: 'const w = new Worker("worker.js");',
          },
        },
      ],
    });

    const server = { getIndexingStatus: () => ({ status: 'idle' }) };
    const res = await semanticSearch({ query: 'Web Worker' }, '/project', indexer, server);
    const text = res.content?.[0]?.text || '';

    // Code-first: docs entry should not show up by default
    assert.ok(!text.includes('docs/API.md'));
    assert.ok(text.includes('js/workers/example-worker.js'));

    // Non-summary: should include code block output
    assert.ok(text.includes('```'));
    assert.ok(text.includes('new Worker'));
  });

  it('labels lexical-only results instead of showing 0% similarity', async () => {
    const indexer = makeStubIndexer({
      stats: { vectorStore: { chunkCount: 10 }, embeddingSource: 'transformers' },
      results: [
        {
          chunkId: 'lex_only',
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
      ],
    });

    const server = { getIndexingStatus: () => ({ status: 'idle' }) };
    const res = await semanticSearch(
      { query: 'exportedThing', summaryMode: true, limit: 1 },
      '/project',
      indexer,
      server
    );
    const text = res.content?.[0]?.text || '';

    assert.ok(text.includes('lexical'));
    assert.ok(!text.includes('0%'));
  });

  it('allows searching while indexing if vectors already exist', async () => {
    let called = false;
    const indexer = {
      getStats() {
        return { vectorStore: { chunkCount: 10 }, embeddingSource: 'transformers' };
      },
      async search() {
        called = true;
        return [
          {
            chunkId: 'x',
            similarity: 0.5,
            metadata: { file: 'js/main.js', name: 'main', startLine: 1, endLine: 2, text: '...' },
          },
        ];
      },
    };

    const server = {
      getIndexingStatus: () => ({
        status: 'indexing',
        stats: { filesDiscovered: 10, chunksIndexed: 5, embeddingSource: 'transformers' },
      }),
    };

    const res = await semanticSearch({ query: 'main' }, '/project', indexer, server);
    const text = res.content?.[0]?.text || '';

    assert.equal(called, true);
    assert.ok(text.includes('# Semantic Search Results'));
    assert.ok(text.toLowerCase().includes('indexing'));
  });
});

