/**
 * Multi-Index Adapter Tests
 *
 * Tests for separate code and documentation indexes.
 * Phase 1: Verify that code queries don't return docs and vice versa.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { MultiIndexAdapter } from '../src/semantic/multi-index-adapter.js';
import { isCodeFile, isDocFile } from '../src/semantic/config.js';

describe('MultiIndexAdapter', () => {
  const TEST_DB_PATH = '.test-cache/multi-index-test.db';
  const DIMENSION = 768;

  let adapter;

  beforeEach(() => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    adapter = new MultiIndexAdapter();
  });

  afterEach(() => {
    if (adapter && adapter.isInitialized) {
      adapter.close();
    }

    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('File Type Detection', () => {
    it('should correctly identify code files', () => {
      expect(isCodeFile('test.js')).toBe(true);
      expect(isCodeFile('component.tsx')).toBe(true);
      expect(isCodeFile('module.mjs')).toBe(true);
      expect(isCodeFile('script.cjs')).toBe(true);
    });

    it('should correctly identify documentation files', () => {
      expect(isDocFile('README.md')).toBe(true);
      expect(isDocFile('docs/guide.md')).toBe(true);
      expect(isDocFile('CONTRIBUTING.markdown')).toBe(true);
    });

    it('should not misidentify file types', () => {
      expect(isCodeFile('README.md')).toBe(false);
      expect(isDocFile('test.js')).toBe(false);
    });
  });

  describe('Initialization', () => {
    it('should initialize with separate code and docs tables', () => {
      adapter.initialize(TEST_DB_PATH, DIMENSION);

      expect(adapter.isInitialized).toBe(true);
      expect(adapter.dbPath).toBe(TEST_DB_PATH);
      expect(adapter.dimension).toBe(DIMENSION);

      // Check that both code and docs adapters exist
      expect(adapter.codeAdapter).toBeDefined();
      expect(adapter.docsAdapter).toBeDefined();
    });

    it('should create docs tables on initialization', () => {
      adapter.initialize(TEST_DB_PATH, DIMENSION);

      const stats = adapter.getStats();

      // Should have code and docs chunk counters
      expect(stats.codeChunks).toBeDefined();
      expect(stats.docsChunks).toBeDefined();
      expect(stats.chunkCount).toBe(0); // Should start at 0
    });
  });

  describe('Code vs Docs Routing', () => {
    beforeEach(() => {
      adapter.initialize(TEST_DB_PATH, DIMENSION);
    });

    it('should route code chunks to code index', () => {
      const codeEmbedding = new Float32Array(DIMENSION).fill(0.1);
      const codeMetadata = {
        content_type: 'code',
        type: 'function',
        name: 'testFunction',
        file: 'js/test.js',
        text: 'function testFunction() {}',
      };

      adapter.upsert('code-chunk-1', codeEmbedding, codeMetadata);

      const stats = adapter.getStats();
      expect(stats.codeChunks).toBe(1);
      expect(stats.docsChunks).toBe(0);
    });

    it('should route docs chunks to docs index', () => {
      const docsEmbedding = new Float32Array(DIMENSION).fill(0.2);
      const docsMetadata = {
        content_type: 'docs',
        type: 'md-section',
        name: 'Introduction',
        file: 'README.md',
        text: '# Introduction',
        title: 'Introduction',
        level: 1,
      };

      adapter.upsert('docs-chunk-1', docsEmbedding, docsMetadata);

      const stats = adapter.getStats();
      expect(stats.codeChunks).toBe(0);
      expect(stats.docsChunks).toBe(1);
    });

    it('should default to code when content_type is not specified', () => {
      const embedding = new Float32Array(DIMENSION).fill(0.1);
      const metadata = {
        type: 'function',
        name: 'testFunction',
        file: 'js/test.js',
        text: 'function testFunction() {}',
      };

      adapter.upsert('chunk-1', embedding, metadata);

      const stats = adapter.getStats();
      expect(stats.codeChunks).toBe(1);
      expect(stats.docsChunks).toBe(0);
    });
  });

  describe('Search Filtering', () => {
    let queryEmbedding;

    beforeEach(() => {
      adapter.initialize(TEST_DB_PATH, DIMENSION);
      queryEmbedding = new Float32Array(DIMENSION).fill(0.5);

      // Add code chunks
      const codeEmbedding = new Float32Array(DIMENSION).fill(0.4);
      adapter.upsert('code-1', codeEmbedding, {
        content_type: 'code',
        type: 'function',
        name: 'handleMessage',
        file: 'js/test.js',
        text: 'function handleMessage() {}',
      });

      adapter.upsert('code-2', codeEmbedding, {
        content_type: 'code',
        type: 'class',
        name: 'EventBus',
        file: 'js/events.js',
        text: 'class EventBus {}',
      });

      // Add docs chunks
      const docsEmbedding = new Float32Array(DIMENSION).fill(0.45);
      adapter.upsert('docs-1', docsEmbedding, {
        content_type: 'docs',
        type: 'md-section',
        name: 'Getting Started',
        file: 'README.md',
        text: '# Getting Started',
        title: 'Getting Started',
        level: 1,
      });

      adapter.upsert('docs-2', docsEmbedding, {
        content_type: 'docs',
        type: 'md-section',
        name: 'Installation',
        file: 'docs/INSTALL.md',
        text: '## Installation',
        title: 'Installation',
        level: 2,
      });
    });

    it('should return only code chunks when searching code index', () => {
      const results = adapter.search(queryEmbedding, {
        indexType: 'code',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.metadata.content_type === 'code')).toBe(true);
      expect(results.every(r => r.metadata.file.endsWith('.js'))).toBe(true);
    });

    it('should return only docs chunks when searching docs index', () => {
      const results = adapter.search(queryEmbedding, {
        indexType: 'docs',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.metadata.content_type === 'docs')).toBe(true);
      expect(results.every(r => r.metadata.file.endsWith('.md'))).toBe(true);
    });

    it('should return mixed results when searching all indexes', () => {
      const results = adapter.search(queryEmbedding, {
        indexType: 'all',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);

      const codeResults = results.filter(r => r.metadata.content_type === 'code');
      const docsResults = results.filter(r => r.metadata.content_type === 'docs');

      // Should have both code and docs results
      expect(codeResults.length).toBeGreaterThan(0);
      expect(docsResults.length).toBeGreaterThan(0);
    });
  });

  describe('Batch Operations', () => {
    beforeEach(() => {
      adapter.initialize(TEST_DB_PATH, DIMENSION);
    });

    it('should route mixed batch to correct indexes', () => {
      const items = [
        {
          chunkId: 'code-1',
          embedding: new Float32Array(DIMENSION).fill(0.1),
          metadata: {
            content_type: 'code',
            type: 'function',
            name: 'func1',
            file: 'a.js',
            text: 'function func1() {}',
          },
        },
        {
          chunkId: 'docs-1',
          embedding: new Float32Array(DIMENSION).fill(0.2),
          metadata: {
            content_type: 'docs',
            type: 'md-section',
            name: 'Section 1',
            file: 'README.md',
            text: '# Section 1',
            title: 'Section 1',
            level: 1,
          },
        },
        {
          chunkId: 'code-2',
          embedding: new Float32Array(DIMENSION).fill(0.3),
          metadata: {
            content_type: 'code',
            type: 'class',
            name: 'Class1',
            file: 'b.js',
            text: 'class Class1 {}',
          },
        },
      ];

      adapter.upsertBatch(items);

      const stats = adapter.getStats();
      expect(stats.codeChunks).toBe(2);
      expect(stats.docsChunks).toBe(1);
    });
  });

  describe('Get and Delete Operations', () => {
    beforeEach(() => {
      adapter.initialize(TEST_DB_PATH, DIMENSION);

      // Add chunks to both indexes
      adapter.upsert('code-1', new Float32Array(DIMENSION).fill(0.1), {
        content_type: 'code',
        type: 'function',
        name: 'func1',
        file: 'a.js',
      });

      adapter.upsert('docs-1', new Float32Array(DIMENSION).fill(0.2), {
        content_type: 'docs',
        type: 'md-section',
        name: 'Section 1',
        file: 'README.md',
      });
    });

    it('should retrieve code chunks from code index', () => {
      const result = adapter.get('code-1');

      expect(result).toBeDefined();
      expect(result.chunkId).toBe('code-1');
      expect(result.metadata.content_type).toBe('code');
    });

    it('should retrieve docs chunks from docs index', () => {
      const result = adapter.get('docs-1');

      expect(result).toBeDefined();
      expect(result.chunkId).toBe('docs-1');
      expect(result.metadata.content_type).toBe('docs');
    });

    it('should delete code chunks from code index', () => {
      const deleted = adapter.delete('code-1');

      expect(deleted).toBe(true);

      const result = adapter.get('code-1');
      expect(result).toBeNull();
    });

    it('should delete docs chunks from docs index', () => {
      const deleted = adapter.delete('docs-1');

      expect(deleted).toBe(true);

      const result = adapter.get('docs-1');
      expect(result).toBeNull();
    });
  });

  describe('Get Files', () => {
    beforeEach(() => {
      adapter.initialize(TEST_DB_PATH, DIMENSION);

      adapter.upsert('code-1', new Float32Array(DIMENSION).fill(0.1), {
        content_type: 'code',
        file: 'js/test.js',
      });

      adapter.upsert('code-2', new Float32Array(DIMENSION).fill(0.2), {
        content_type: 'code',
        file: 'tests/test.test.js',
      });

      adapter.upsert('docs-1', new Float32Array(DIMENSION).fill(0.3), {
        content_type: 'docs',
        file: 'README.md',
      });

      adapter.upsert('docs-2', new Float32Array(DIMENSION).fill(0.4), {
        content_type: 'docs',
        file: 'docs/guide.md',
      });
    });

    it('should return only code files when contentType is code', () => {
      const files = adapter.getFiles('code');

      expect(files).toHaveLength(2);
      expect(files.every(f => f.endsWith('.js'))).toBe(true);
    });

    it('should return only docs files when contentType is docs', () => {
      const files = adapter.getFiles('docs');

      expect(files).toHaveLength(2);
      expect(files.every(f => f.endsWith('.md'))).toBe(true);
    });

    it('should return all files when contentType is all', () => {
      const files = adapter.getFiles('all');

      expect(files).toHaveLength(4);
    });
  });

  describe('Clear All', () => {
    beforeEach(() => {
      adapter.initialize(TEST_DB_PATH, DIMENSION);

      adapter.upsert('code-1', new Float32Array(DIMENSION).fill(0.1), {
        content_type: 'code',
        file: 'a.js',
      });

      adapter.upsert('docs-1', new Float32Array(DIMENSION).fill(0.2), {
        content_type: 'docs',
        file: 'README.md',
      });
    });

    it('should clear all data from both indexes', () => {
      adapter.clearAll();

      const stats = adapter.getStats();
      expect(stats.codeChunks).toBe(0);
      expect(stats.docsChunks).toBe(0);
      expect(stats.chunkCount).toBe(0);
    });
  });
});
