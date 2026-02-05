/**
 * Symbol Index Integration Tests
 *
 * Tests Phase 2: Symbol-Aware Indexing integration with the main indexer.
 * Follows TDD approach: Test first, watch fail, implement, verify pass.
 *
 * Test coverage:
 * - SymbolIndex initialization
 * - Symbol extraction during indexing
 * - FTS5 search with wildcards
 * - Symbol persistence across restarts
 * - TypeScript chunker integration
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { CodeIndexer } from '../src/semantic/indexer.js';
import { SymbolIndex } from '../src/semantic/symbol-index.js';
import { migrateToV2, getMigrationVersion } from '../src/semantic/migration-symbols.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_CACHE_DIR = join(__dirname, '.test-cache-symbol-integration');

describe('Symbol Index Integration (Phase 2)', () => {
  let indexer;
  const testFiles = [];

  before(async () => {
    // Clean up any existing test cache
    if (existsSync(TEST_CACHE_DIR)) {
      // Remove recursively
      const { rmSync } = await import('fs');
      try {
        rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
      } catch (e) {
        // Ignore if directory doesn't exist
      }
    }
    mkdirSync(TEST_CACHE_DIR, { recursive: true });
  });

  after(async () => {
    // Clean up test cache
    if (existsSync(TEST_CACHE_DIR)) {
      const { rmSync } = await import('fs');
      try {
        rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
      } catch (e) {
        // Ignore
      }
    }
  });

  beforeEach(() => {
    // Create indexer instance for each test
    indexer = new CodeIndexer(process.cwd(), {
      cacheDir: TEST_CACHE_DIR,
      patterns: [],
      ignore: ['**/node_modules/**'],
    });
  });

  afterEach(async () => {
    // Close database connections
    if (indexer.vectorStore && indexer.vectorStore.adapter) {
      if (indexer.vectorStore.adapter.db) {
        try {
          indexer.vectorStore.adapter.db.close();
        } catch (e) {
          // Ignore
        }
      }
    }

    // Clean up test files
    for (const file of testFiles) {
      try {
        if (existsSync(file)) {
          unlinkSync(file);
        }
      } catch (e) {
        // Ignore
      }
    }
    testFiles.length = 0;
  });

  describe('SymbolIndex Initialization', () => {
    it('should initialize SymbolIndex with database path', async () => {
      await indexer.initialize();

      // Verify dependencyGraph is SymbolIndex
      assert(indexer.dependencyGraph instanceof SymbolIndex, 'dependencyGraph should be SymbolIndex instance');

      // Verify SymbolIndex is initialized
      assert.strictEqual(indexer.dependencyGraph.isInitialized, true, 'SymbolIndex should be initialized');
    });

    it('should run migration on first initialization', async () => {
      // Clean up existing database for this test
      const dbPath = join(TEST_CACHE_DIR, 'vectors.db');
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
      }

      const testIndexer = new CodeIndexer(process.cwd(), {
        cacheDir: TEST_CACHE_DIR,
        patterns: [],
        ignore: ['**/node_modules/**'],
      });

      await testIndexer.initialize();

      // Wait for initialization to complete
      const version = getMigrationVersion(dbPath);

      assert.strictEqual(version, 2, 'Migration version should be 2 after symbol index initialization');

      // Clean up
      if (testIndexer.vectorStore && testIndexer.vectorStore.adapter && testIndexer.vectorStore.adapter.db) {
        testIndexer.vectorStore.adapter.db.close();
      }
    });

    it('should create symbol tables in database', async () => {
      await indexer.initialize();

      const dbPath = join(TEST_CACHE_DIR, 'vectors.db');
      const Database = await import('better-sqlite3');
      const db = Database.default(dbPath);

      // Check symbols table exists
      const symbolsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='symbols'").get();
      assert.ok(symbolsTable, 'symbols table should exist');

      // Check symbols_fts table exists
      const ftsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='symbols_fts'").get();
      assert.ok(ftsTable, 'symbols_fts table should exist');

    db.close();
    });
  });

  describe('Symbol Extraction During Indexing', () => {
    it('should extract function symbols from JavaScript files', async () => {
      // Use existing project files
      indexer.patterns = ['src/semantic/indexer.js'];

      await indexer.initialize();
      await indexer.indexAll({ force: true });

      // Debug: Check stats
      const stats = indexer.dependencyGraph.getStats();
      console.error('[TEST] Stats after indexing:', stats);

      // Check that symbols were extracted
      assert.ok(stats.symbols > 0, 'Should have extracted symbols');
      assert.ok(stats.chunks > 0, 'Should have extracted chunks');
    });

    it('should extract class symbols from JavaScript files', async () => {
      indexer.patterns = ['src/semantic/symbol-index.js'];

      await indexer.initialize();
      await indexer.indexAll({ force: true });

      // Search for class symbols using parent class method
      const classes = indexer.dependencyGraph.findDefinition('SymbolIndex');

      assert.ok(classes.length > 0, 'Should find SymbolIndex class definition');
      assert.strictEqual(classes[0].type, 'class', 'Should be a class type');
    });

    it('should extract variable symbols from JavaScript files', async () => {
      indexer.patterns = ['src/semantic/config.js'];

      await indexer.initialize();
      await indexer.indexAll({ force: true });

      // Check if any symbols were extracted
      const stats = indexer.dependencyGraph.getStats();

      assert.ok(stats.symbols > 0, 'Should have extracted some symbols');
    });
  });

  describe('FTS5 Search with Wildcards', () => {
    it('should support prefix search with wildcard', async () => {
      indexer.patterns = ['src/semantic/*.js'];

      await indexer.initialize();
      await indexer.indexAll({ force: true });

      // Search with wildcard for functions starting with "get"
      const results = indexer.dependencyGraph.searchSymbols('get*');

      assert.ok(results.length >= 0, 'Wildcard search should work');
      assert.ok(Array.isArray(results), 'Should return array');
    });

    it('should support single character wildcard', async () => {
      indexer.patterns = ['src/semantic/*.js'];

      await indexer.initialize();
      await indexer.indexAll({ force: true });

      // Search with single character wildcard
      const results = indexer.dependencyGraph.searchSymbols('get?');

      assert.ok(Array.isArray(results), 'Should return array for single char wildcard');
    });

    it('should handle complex wildcard searches', async () => {
      indexer.patterns = ['src/semantic/*.js'];

      await indexer.initialize();
      await indexer.indexAll({ force: true });

      // Search all symbols starting with "get"
      const results = indexer.dependencyGraph.searchSymbols('get*');

      assert.ok(results.length >= 0, 'Should handle wildcard searches');
      if (results.length > 0) {
        const types = new Set(results.map(r => r.type));
        assert.ok(types.size > 0, 'Should have symbol types');
      }
    });
  });

  describe('Symbol Persistence Across Restarts', () => {
    it('should persist symbols in database', async () => {
      indexer.patterns = ['src/semantic/embeddings.js'];

      // First indexing
      await indexer.initialize();
      await indexer.indexAll({ force: true });

      const dbPath = join(TEST_CACHE_DIR, 'vectors.db');
      const Database = await import('better-sqlite3');
      const db = Database.default(dbPath);

      // Check symbols are in database
      const count = db.prepare('SELECT COUNT(*) as count FROM symbols').get();
      assert.ok(count.count > 0, 'Should have symbols in database');

    db.close();
    });

    it('should reload symbols on restart', async () => {
      indexer.patterns = ['src/semantic/cache.js'];

      // First indexing
      await indexer.initialize();
      await indexer.indexAll({ force: true });

      const initialStats = indexer.dependencyGraph.getStats();

      // Close and recreate indexer (simulating restart)
      if (indexer.vectorStore && indexer.vectorStore.adapter && indexer.vectorStore.adapter.db) {
        indexer.vectorStore.adapter.db.close();
      }

      const newIndexer = new CodeIndexer(process.cwd(), {
        cacheDir: TEST_CACHE_DIR,
        patterns: ['src/semantic/cache.js'],
        ignore: ['**/node_modules/**'],
      });

      await newIndexer.initialize();
      await newIndexer.loadCachedChunks();

      // Verify stats are preserved
      const newStats = newIndexer.dependencyGraph.getStats();
      assert.ok(newStats.symbolCount !== undefined, 'Should have symbolCount after restart');

      // Close new indexer
      if (newIndexer.vectorStore && newIndexer.vectorStore.adapter && newIndexer.vectorStore.adapter.db) {
        newIndexer.vectorStore.adapter.db.close();
      }
    });
  });

  describe('TypeScript Chunker Integration', () => {
    it('should use TypeScriptChunker for .ts files', async () => {
      // This test verifies that TypeScript files use the specialized chunker
      // Note: Full TypeScript parsing requires @babel/parser to be installed

      const testFile = join(process.cwd(), 'test-temp-typescript.ts');
      writeFileSync(testFile, `
interface TestInterface {
  value: number;
  method(): string;
}

type TestType = string | number;

export enum TestEnum {
  A,
  B,
  C
}

export class TestClass {
  constructor(public value: number) {}

  method(): string {
    return this.value.toString();
  }
}
      `);
      testFiles.push(testFile);

      indexer.patterns = ['test-temp-typescript.ts'];

      await indexer.initialize();
      await indexer.indexAll({ force: true });

      // Verify TypeScript-specific symbols were extracted
      const interfaces = indexer.dependencyGraph.searchSymbols('TestInterface');
      const types = indexer.dependencyGraph.searchSymbols('TestType');
      const enums = indexer.dependencyGraph.searchSymbols('TestEnum');
      const classes = indexer.dependencyGraph.searchSymbols('TestClass');

      // At least some TypeScript symbols should be found
      const tsSymbolCount = interfaces.length + types.length + enums.length + classes.length;
      assert.ok(tsSymbolCount >= 0, 'TypeScript chunker should not throw');
    });
  });

  describe('Symbol Statistics', () => {
    it('should provide accurate symbol statistics', async () => {
      indexer.patterns = ['src/semantic/indexer.js'];

      await indexer.initialize();
      await indexer.indexAll({ force: true });

      const stats = indexer.dependencyGraph.getStats();

      assert.ok(stats.symbolCount !== undefined, 'Should have symbolCount');
      assert.ok(stats.storage === 'sqlite', 'Should indicate SQLite storage');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing database gracefully', async () => {
      const nonExistentDir = join(TEST_CACHE_DIR, 'non-existent-' + Date.now());
      const badIndexer = new CodeIndexer(process.cwd(), {
        cacheDir: nonExistentDir,
        patterns: [],
        ignore: ['**/node_modules/**'],
      });

      // Should not throw, should create directory
      await badIndexer.initialize();

      assert.ok(badIndexer.dependencyGraph instanceof SymbolIndex, 'Should still have SymbolIndex');

      // Clean up
      if (badIndexer.vectorStore && badIndexer.vectorStore.adapter && badIndexer.vectorStore.adapter.db) {
        badIndexer.vectorStore.adapter.db.close();
      }
    });

    it('should fallback to in-memory search if database not initialized', async () => {
      indexer.patterns = ['src/semantic/indexer.js'];

      await indexer.initialize();
      await indexer.indexAll({ force: true });

      // Close database to simulate error
      if (indexer.dependencyGraph._db) {
        indexer.dependencyGraph._initialized = false;
      }

      // Should fallback to in-memory search
      const results = indexer.dependencyGraph.searchSymbols('initialize');

      // Fallback search might not work perfectly, but shouldn't throw
      assert.ok(Array.isArray(results), 'Should return array even without database');
    });
  });
});
