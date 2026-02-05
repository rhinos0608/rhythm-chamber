/**
 * Phase 2 Critical Fixes Test Suite
 *
 * Tests for CRITICAL and HIGH severity issues found in adversarial code review.
 * Following TDD: Write failing tests first, then fix.
 *
 * Issues:
 * - CRITICAL #1: Missing TypeScript Type Handlers in DependencyGraph
 * - CRITICAL #2: Race Condition in SymbolIndex Initialization
 * - CRITICAL #3: Memory Leak in SymbolIndex
 * - HIGH #4: Wrong Fallback Order in getMigrationVersion
 * - HIGH #5: SQL Injection Risk in FTS5 Search
 * - HIGH #6: Missing Validation in TypeScriptChunker.isSupported()
 * - HIGH #7: Incomplete Chunk Metadata (exported status)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';

import { DependencyGraph, SYMBOL_TYPES } from '../src/semantic/dependency-graph.js';
import { SymbolIndex } from '../src/semantic/symbol-index.js';
import { TypeScriptChunker } from '../src/semantic/typescript-chunker.js';
import { getMigrationVersion } from '../src/semantic/migration-symbols.js';
import Database from 'better-sqlite3';

describe('Phase 2 Critical Fixes', () => {
  let testDbPath;

  beforeEach(() => {
    testDbPath = join(tmpdir(), `test-${Date.now()}.db`);
  });

  afterEach(() => {
    if (existsSync(testDbPath)) {
      try {
        unlinkSync(testDbPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  /**
   * CRITICAL #1: Missing TypeScript Type Handlers
   *
   * Location: src/semantic/dependency-graph.js:69-91
   * Problem: Switch statement has no case for 'interface', 'type-alias', 'enum'
   * Fix: Add cases and implement _addInterface(), _addTypeAlias(), _addEnum() methods
   */
  describe('CRITICAL #1: TypeScript Type Handlers', () => {
    it('should handle interface chunks via _addInterface handler', () => {
      const graph = new DependencyGraph();

      const interfaceChunk = {
        id: 'interface_TestInterface_1',
        type: 'interface',
        name: 'TestInterface',
        text: 'interface TestInterface { prop: string; }',
        metadata: {
          file: 'test.ts',
          startLine: 1,
          endLine: 3,
          exported: true,
          properties: [{ name: 'prop', type: 'string' }],
        },
      };

      // Should not throw error
      graph.addChunk(interfaceChunk);

      // Verify interface was added to definitions
      const definitions = graph.findDefinition('TestInterface');
      assert.ok(Array.isArray(definitions), 'definitions should be an array');
      assert.strictEqual(definitions.length, 1, 'should have one definition');
      assert.strictEqual(definitions[0].type, SYMBOL_TYPES.INTERFACE, 'should be INTERFACE type');
      assert.strictEqual(definitions[0].exported, true, 'should track exported status');

      // Verify export tracking
      const exports = graph.findExports('test.ts');
      assert.ok(exports.some(e => e.symbol === 'TestInterface'), 'should track interface export');
    });

    it('should handle type-alias chunks via _addTypeAlias handler', () => {
      const graph = new DependencyGraph();

      const typeChunk = {
        id: 'type_TestType_1',
        type: 'type-alias',
        name: 'TestType',
        text: 'type TestType = string | number;',
        metadata: {
          file: 'test.ts',
          startLine: 1,
          endLine: 1,
          exported: false,
          typeAnnotation: 'string | number',
        },
      };

      // Should not throw error
      graph.addChunk(typeChunk);

      // Verify type alias was added
      const definitions = graph.findDefinition('TestType');
      assert.ok(Array.isArray(definitions), 'definitions should be an array');
      assert.strictEqual(definitions.length, 1, 'should have one definition');
      assert.strictEqual(definitions[0].type, SYMBOL_TYPES.TYPE_ALIAS, 'should be TYPE_ALIAS type');
    });

    it('should handle enum chunks via _addEnum handler', () => {
      const graph = new DependencyGraph();

      const enumChunk = {
        id: 'enum_TestEnum_1',
        type: 'enum',
        name: 'TestEnum',
        text: 'enum TestEnum { A, B, C }',
        metadata: {
          file: 'test.ts',
          startLine: 1,
          endLine: 1,
          exported: true,
          members: [
            { name: 'A', initializer: 0 },
            { name: 'B', initializer: 1 },
            { name: 'C', initializer: 2 },
          ],
        },
      };

      // Should not throw error
      graph.addChunk(enumChunk);

      // Verify enum was added
      const definitions = graph.findDefinition('TestEnum');
      assert.ok(Array.isArray(definitions), 'definitions should be an array');
      assert.strictEqual(definitions.length, 1, 'should have one definition');
      assert.strictEqual(definitions[0].type, SYMBOL_TYPES.ENUM, 'should be ENUM type');
      assert.strictEqual(definitions[0].exported, true, 'should track exported status');

      // Verify export tracking
      const exports = graph.findExports('test.ts');
      assert.ok(exports.some(e => e.symbol === 'TestEnum'), 'should track enum export');
    });
  });

  /**
   * CRITICAL #2: Race Condition in SymbolIndex Initialization
   *
   * Location: src/semantic/indexer.js:183-212 in _initializeSymbolIndex()
   * Problem: No guard against concurrent initialization
   * Fix: Add _symbolInitializing flag with try-finally block
   */
  describe('CRITICAL #2: SymbolIndex Initialization Race Condition', () => {
    it('should prevent concurrent SymbolIndex initialization', async () => {
      const symbolIndex = new SymbolIndex(testDbPath);

      // The initialize() method is synchronous, but we need to test
      // that calling it while it's already in progress throws an error
      // Since it's synchronous and fast, we simulate a concurrent call
      // by checking the _initializing flag

      // First initialization should succeed
      assert.strictEqual(symbolIndex._initializing, false, 'should not be initializing yet');
      symbolIndex.initialize(testDbPath);
      assert.strictEqual(symbolIndex.isInitialized, true, 'should be initialized');
      assert.strictEqual(symbolIndex._initializing, false, 'should not be initializing after complete');

      // Second initialization should just warn and skip (not throw)
      // This is because _initialized is true
      symbolIndex.initialize(testDbPath);
      assert.strictEqual(symbolIndex.isInitialized, true, 'should still be initialized');

      symbolIndex.close();
    });

    it('should throw error when initialize is called while already initializing', async () => {
      const symbolIndex = new SymbolIndex(testDbPath);

      // Manually set the flag to simulate concurrent initialization
      // (In real scenario, this would happen if initialize() was called
      // from two different places at nearly the same time)
      symbolIndex._initializing = true;

      // Should throw error
      assert.throws(
        () => symbolIndex.initialize(testDbPath),
        /Already initializing/
      );

      // Clean up
      symbolIndex._initializing = false;
      symbolIndex.initialize(testDbPath);
      symbolIndex.close();
    });

    it('should allow sequential initialization after first completes', async () => {
      const symbolIndex = new SymbolIndex(testDbPath);

      // First initialization
      symbolIndex.initialize(testDbPath);
      assert.strictEqual(symbolIndex.isInitialized, true, 'should be initialized');

      // Second initialization (should warn and skip)
      symbolIndex.initialize(testDbPath);
      assert.strictEqual(symbolIndex.isInitialized, true, 'should still be initialized');

      symbolIndex.close();
    });
  });

  /**
   * CRITICAL #3: Memory Leak in SymbolIndex
   *
   * Location: src/semantic/symbol-index.js:239-308 in addChunk()
   * Problem: In-memory Maps never cleared on reindex, accumulate indefinitely
   * Fix: Override clear() method to clear both in-memory maps and SQLite tables
   */
  describe('CRITICAL #3: SymbolIndex Memory Leak', () => {
    it('should clear all in-memory data when clear() is called', async () => {
      const symbolIndex = new SymbolIndex(testDbPath);
      await symbolIndex.initialize(testDbPath);

      // Add some chunks
      const chunk1 = {
        id: 'test_chunk_1',
        type: 'function',
        name: 'testFunction',
        text: 'function testFunction() {}',
        metadata: {
          file: 'test.js',
          startLine: 1,
          endLine: 3,
          exported: true,
        },
      };

      const chunk2 = {
        id: 'test_chunk_2',
        type: 'class',
        name: 'TestClass',
        text: 'class TestClass {}',
        metadata: {
          file: 'test.js',
          startLine: 5,
          endLine: 7,
          exported: false,
        },
      };

      symbolIndex.addChunk(chunk1);
      symbolIndex.addChunk(chunk2);

      // Verify data is in memory
      assert.strictEqual(symbolIndex.definitions.size, 2, 'should have 2 definitions');
      assert.strictEqual(symbolIndex.chunkSymbols.size, 2, 'should have 2 chunk symbols');
      assert.strictEqual(symbolIndex.fileChunks.size, 1, 'should have 1 file');

      // Clear all data
      symbolIndex.clear();

      // Verify all in-memory maps are cleared
      assert.strictEqual(symbolIndex.definitions.size, 0, 'definitions should be cleared');
      assert.strictEqual(symbolIndex.usages.size, 0, 'usages should be cleared');
      assert.strictEqual(symbolIndex.exports.size, 0, 'exports should be cleared');
      assert.strictEqual(symbolIndex.imports.size, 0, 'imports should be cleared');
      assert.strictEqual(symbolIndex.chunkSymbols.size, 0, 'chunkSymbols should be cleared');
      assert.strictEqual(symbolIndex.fileChunks.size, 0, 'fileChunks should be cleared');

      // Verify SQLite tables are also cleared
      const stats = symbolIndex.getStats();
      assert.strictEqual(stats.symbolCount, 0, 'SQLite symbols should be cleared');
      assert.strictEqual(stats.usageCount, 0, 'SQLite usages should be cleared');

      symbolIndex.close();
    });

    it('should allow reindexing after clear without memory accumulation', async () => {
      const symbolIndex = new SymbolIndex(testDbPath);
      await symbolIndex.initialize(testDbPath);

      // First indexing
      const chunk1 = {
        id: 'test_chunk_1',
        type: 'function',
        name: 'testFunction',
        text: 'function testFunction() {}',
        metadata: {
          file: 'test.js',
          startLine: 1,
          endLine: 3,
          exported: true,
        },
      };

      symbolIndex.addChunk(chunk1);
      assert.strictEqual(symbolIndex.definitions.size, 1, 'should have 1 definition');

      // Clear and reindex
      symbolIndex.clear();
      symbolIndex.addChunk(chunk1);

      // Should still have only 1 definition (no accumulation)
      assert.strictEqual(symbolIndex.definitions.size, 1, 'should have 1 definition after clear and reindex');

      symbolIndex.close();
    });
  });

  /**
   * HIGH #4: Wrong Fallback Order in getMigrationVersion
   *
   * Location: src/semantic/migration-symbols.js:93-105
   * Problem: Tries pragma_user_config first, but should check _metadata first
   * Fix: Swap order - check _metadata first, then pragma_user_config
   */
  describe('HIGH #4: getMigrationVersion Fallback Order', () => {
    it('should check _metadata table first, then pragma_user_config', () => {
      // Create a test database with both tables
      const db = new Database(testDbPath);

      // Create _metadata table first
      db.exec(`
        CREATE TABLE IF NOT EXISTS _metadata (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `);

      // Insert version into _metadata
      db.exec(`
        INSERT OR REPLACE INTO _metadata (key, value)
        VALUES ('migration_version', '2')
      `);

      // Create pragma_user_config with different version
      db.exec(`
        CREATE TABLE IF NOT EXISTS pragma_user_config (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `);

      db.exec(`
        INSERT OR REPLACE INTO pragma_user_config (key, value)
        VALUES ('migration_version', '1')
      `);

      db.close();

      // getMigrationVersion should prefer _metadata over pragma_user_config
      const version = getMigrationVersion(testDbPath);

      // Should return version from _metadata (2), not pragma_user_config (1)
      assert.strictEqual(version, 2, 'should prefer _metadata table over pragma_user_config');
    });

    it('should fall back to pragma_user_config if _metadata does not exist', () => {
      // Create a test database with only pragma_user_config
      const db = new Database(testDbPath);

      // Create pragma_user_config table
      db.exec(`
        CREATE TABLE IF NOT EXISTS pragma_user_config (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `);

      db.exec(`
        INSERT OR REPLACE INTO pragma_user_config (key, value)
        VALUES ('migration_version', '3')
      `);

      db.close();

      // Should fall back to pragma_user_config
      const version = getMigrationVersion(testDbPath);
      assert.strictEqual(version, 3, 'should fall back to pragma_user_config');
    });

    it('should return default version 1 if neither table exists', () => {
      // Create empty database
      new Database(testDbPath).close();

      const version = getMigrationVersion(testDbPath);
      assert.strictEqual(version, 1, 'should return default version 1');
    });
  });

  /**
   * HIGH #5: SQL Injection Risk in FTS5 Search
   *
   * Location: src/semantic/symbol-index.js:367-392 in _sanitizeFTSQuery()
   * Problem: Missing escape for single quotes and backslashes
   * Fix: Add \' and \\ to the sanitization regex
   */
  describe('HIGH #5: SQL Injection in FTS5 Search', () => {
    it('should escape single quotes in FTS queries', async () => {
      const symbolIndex = new SymbolIndex(testDbPath);
      await symbolIndex.initialize(testDbPath);

      // Add a test chunk
      symbolIndex.addChunk({
        id: 'test_1',
        type: 'function',
        name: 'testFunc',
        text: 'function testFunc() {}',
        metadata: { file: 'test.js', startLine: 1, endLine: 1 },
      });

      // Query with single quote (potential SQL injection)
      const maliciousQuery = "test'; DROP TABLE symbols; --";
      const sanitized = symbolIndex._sanitizeFTSQuery(maliciousQuery);

      // Single quotes should be escaped
      assert.ok(!sanitized.includes("'"), 'should escape single quotes');
      assert.ok(sanitized.includes("''") || !sanitized.includes("'"), 'should double quotes or remove them');

      // Should not throw SQL error
      const results = symbolIndex.searchSymbols(sanitized);
      assert.ok(Array.isArray(results), 'should return array without throwing');

      symbolIndex.close();
    });

    it('should escape backslashes in FTS queries', async () => {
      const symbolIndex = new SymbolIndex(testDbPath);
      await symbolIndex.initialize(testDbPath);

      // Query with backslash (potential SQL injection)
      const maliciousQuery = 'test\\';
      const sanitized = symbolIndex._sanitizeFTSQuery(maliciousQuery);

      // Backslash should be escaped
      assert.ok(!sanitized.includes('\\'), 'should escape backslashes');

      // Should not throw SQL error
      const results = symbolIndex.searchSymbols(sanitized);
      assert.ok(Array.isArray(results), 'should return array without throwing');

      symbolIndex.close();
    });

    it('should handle combination of special characters', async () => {
      const symbolIndex = new SymbolIndex(testDbPath);
      await symbolIndex.initialize(testDbPath);

      // Query with multiple dangerous characters
      const maliciousQuery = "'; DROP TABLE symbols; -- \\ [ ] { } \"";
      const sanitized = symbolIndex._sanitizeFTSQuery(maliciousQuery);

      // All dangerous characters should be handled
      assert.ok(!sanitized.includes("'") || sanitized.includes("''"), 'should handle single quotes');
      assert.ok(!sanitized.includes('\\'), 'should handle backslashes');
      assert.ok(!sanitized.includes('['), 'should remove brackets');
      assert.ok(!sanitized.includes('{'), 'should remove braces');

      // Should not throw SQL error
      const results = symbolIndex.searchSymbols(sanitized);
      assert.ok(Array.isArray(results), 'should return array without throwing');

      symbolIndex.close();
    });
  });

  /**
   * HIGH #6: Missing Validation in TypeScriptChunker.isSupported()
   *
   * Location: src/semantic/typescript-chunker.js:27-29
   * Problem: No validation, returns undefined for invalid paths
   * Fix: Add null check and validation for file path parameter
   */
  describe('HIGH #6: TypeScriptChunker.isSupported Validation', () => {
    it('should validate file path parameter', () => {
      const chunker = new TypeScriptChunker();

      // Valid paths
      assert.strictEqual(chunker.isSupported('test.ts'), true, 'should support .ts files');
      assert.strictEqual(chunker.isSupported('test.tsx'), true, 'should support .tsx files');
      assert.strictEqual(chunker.isSupported('test.jsx'), true, 'should support .jsx files');
      assert.strictEqual(chunker.isSupported('/path/to/test.ts'), true, 'should support absolute paths');
      assert.strictEqual(chunker.isSupported('./relative/path/test.tsx'), true, 'should support relative paths');

      // Invalid paths
      assert.strictEqual(chunker.isSupported(null), false, 'should return false for null');
      assert.strictEqual(chunker.isSupported(undefined), false, 'should return false for undefined');
      assert.strictEqual(chunker.isSupported(''), false, 'should return false for empty string');
      assert.strictEqual(chunker.isSupported('noextension'), false, 'should return false for files without extension');
      assert.strictEqual(chunker.isSupported('test.js'), false, 'should not support .js files (handled by CodeChunker)');
      assert.strictEqual(chunker.isSupported('test.md'), false, 'should not support .md files');
    });

    it('should not throw error for invalid input', () => {
      const chunker = new TypeScriptChunker();

      // Should not throw
      assert.strictEqual(chunker.isSupported(null), false);
      assert.strictEqual(chunker.isSupported(undefined), false);
      assert.strictEqual(chunker.isSupported(''), false);
      assert.strictEqual(chunker.isSupported(123), false);
      assert.strictEqual(chunker.isSupported({}), false);
    });
  });

  /**
   * HIGH #7: Incomplete Chunk Metadata (exported status)
   *
   * Location: src/semantic/typescript-chunker.js:86-106 in _extractInterfaces()
   * Problem: Hardcoded exported: false for interfaces
   * Fix: Check AST node for export keyword and set correctly
   */
  describe('HIGH #7: Interface Exported Status', () => {
    it('should preserve exported status for interfaces', () => {
      const chunker = new TypeScriptChunker();

      const sourceCode = `
        export interface ExportedInterface {
          prop: string;
        }

        interface NotExportedInterface {
          prop: number;
        }
      `;

      const chunks = chunker.chunkSourceFile(sourceCode, 'test.ts');

      // Find interface chunks
      const interfaceChunks = chunks.filter(c => c.type === 'interface');

      assert.ok(interfaceChunks.length >= 2, 'should have at least 2 interface chunks');

      // Find exported interface
      const exportedInterface = interfaceChunks.find(c => c.name === 'ExportedInterface');
      assert.ok(exportedInterface, 'should find ExportedInterface');
      assert.strictEqual(exportedInterface.metadata.exported, true, 'ExportedInterface should have exported=true');

      // Find non-exported interface
      const notExportedInterface = interfaceChunks.find(c => c.name === 'NotExportedInterface');
      assert.ok(notExportedInterface, 'should find NotExportedInterface');
      assert.strictEqual(notExportedInterface.metadata.exported, false, 'NotExportedInterface should have exported=false');
    });

    it('should preserve exported status for type aliases', () => {
      const chunker = new TypeScriptChunker();

      const sourceCode = `
        export type ExportedType = string | number;

        type NotExportedType = boolean;
      `;

      const chunks = chunker.chunkSourceFile(sourceCode, 'test.ts');

      // Find type chunks
      const typeChunks = chunks.filter(c => c.type === 'type-alias');

      assert.ok(typeChunks.length >= 2, 'should have at least 2 type chunks');

      // Find exported type
      const exportedType = typeChunks.find(c => c.name === 'ExportedType');
      assert.ok(exportedType, 'should find ExportedType');
      assert.strictEqual(exportedType.metadata.exported, true, 'ExportedType should have exported=true');

      // Find non-exported type
      const notExportedType = typeChunks.find(c => c.name === 'NotExportedType');
      assert.ok(notExportedType, 'should find NotExportedType');
      assert.strictEqual(notExportedType.metadata.exported, false, 'NotExportedType should have exported=false');
    });

    it('should preserve exported status for enums', () => {
      const chunker = new TypeScriptChunker();

      const sourceCode = `
        export enum ExportedEnum {
          A,
          B,
        }

        enum NotExportedEnum {
          C,
          D,
        }
      `;

      const chunks = chunker.chunkSourceFile(sourceCode, 'test.ts');

      // Find enum chunks
      const enumChunks = chunks.filter(c => c.type === 'enum');

      assert.ok(enumChunks.length >= 2, 'should have at least 2 enum chunks');

      // Find exported enum
      const exportedEnum = enumChunks.find(c => c.name === 'ExportedEnum');
      assert.ok(exportedEnum, 'should find ExportedEnum');
      assert.strictEqual(exportedEnum.metadata.exported, true, 'ExportedEnum should have exported=true');

      // Find non-exported enum
      const notExportedEnum = enumChunks.find(c => c.name === 'NotExportedEnum');
      assert.ok(notExportedEnum, 'should find NotExportedEnum');
      assert.strictEqual(notExportedEnum.metadata.exported, false, 'NotExportedEnum should have exported=false');
    });
  });
});
