/**
 * Migration: Separate Indexes Tests
 *
 * Tests for database migration from single unified index to separate code/docs indexes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import Database from 'better-sqlite3';
import {
  migrateToSeparateIndexes,
  rollbackSeparateIndexes,
} from '../src/semantic/migration-separate-indexes.js';

describe('Migration: Separate Indexes', () => {
  const TEST_DB_PATH = '.test-cache/migration-test.db';
  const DIMENSION = 768;

  // Helper to create test database in old format (single unified index)
  function createOldFormatDatabase() {
    const db = new Database(TEST_DB_PATH);

    // Create old format tables (single unified index)
    db.exec(`
      CREATE VIRTUAL TABLE vec_chunks USING vec0(embedding FLOAT[${DIMENSION}]);

      CREATE TABLE chunk_metadata (
        chunk_id TEXT PRIMARY KEY,
        vec_rowid INTEGER,
        text TEXT,
        name TEXT,
        type TEXT,
        file TEXT,
        line INTEGER,
        exported INTEGER,
        layer TEXT,
        context_before TEXT,
        context_after TEXT,
        updated_at INTEGER
      );

      CREATE TABLE file_index (
        file TEXT PRIMARY KEY,
        mtime INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        indexed_at INTEGER NOT NULL,
        model_version TEXT
      );
    `);

    // Insert test data: mix of code and docs
    const stmtVec = db.prepare('INSERT INTO vec_chunks (embedding) VALUES (?)');
    const stmtMeta = db.prepare(`
      INSERT INTO chunk_metadata
      (chunk_id, vec_rowid, text, name, type, file, line, exported, layer, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const stmtFile = db.prepare(`
      INSERT INTO file_index (file, mtime, chunk_count, indexed_at, model_version)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Add code chunks
    for (let i = 0; i < 3; i++) {
      const vecResult = stmtVec.run(new Float32Array(DIMENSION).fill(0.1 + i * 0.1));
      stmtMeta.run(
        `code-chunk-${i}`,
        vecResult.lastInsertRowid,
        `function code${i}() {}`,
        `code${i}`,
        'function',
        `js/file${i}.js`,
        10 + i,
        1,
        'services',
        Date.now()
      );
      stmtFile.run(`js/file${i}.js`, Date.now(), 1, Date.now(), 'test-model');
    }

    // Add docs chunks (these should be migrated)
    for (let i = 0; i < 2; i++) {
      const vecResult = stmtVec.run(new Float32Array(DIMENSION).fill(0.5 + i * 0.1));
      stmtMeta.run(
        `docs-chunk-${i}`,
        vecResult.lastInsertRowid,
        `# Documentation ${i}`,
        `Section ${i}`,
        'md-section',
        `docs/section${i}.md`,
        1 + i,
        0,
        null,
        Date.now()
      );
      stmtFile.run(`docs/section${i}.md`, Date.now(), 1, Date.now(), 'test-model');
    }

    db.close();
  }

  beforeEach(() => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  afterEach(() => {
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('Migration', () => {
    it('should detect already migrated database', () => {
      // Create database in new format (docs tables already exist)
      const db = new Database(TEST_DB_PATH);
      db.exec(`
        CREATE VIRTUAL TABLE vec_chunks_code USING vec0(embedding FLOAT[${DIMENSION}]);
        CREATE TABLE chunk_metadata_docs (chunk_id TEXT PRIMARY KEY);
      `);
      db.close();

      const result = migrateToSeparateIndexes(TEST_DB_PATH);

      expect(result.status).toBe('already_migrated');
    });

    it('should migrate single index to separate indexes', () => {
      createOldFormatDatabase();

      const result = migrateToSeparateIndexes(TEST_DB_PATH);

      expect(result.status).toBe('success');
      expect(result.migrated).toBe(2); // 2 docs chunks migrated
      expect(result.before.chunks).toBe(5); // 3 code + 2 docs
      expect(result.after.codeChunks).toBe(3);
      expect(result.after.docsChunks).toBe(2);
      expect(result.after.totalChunks).toBe(5);
    });

    it('should rename existing tables to code', () => {
      createOldFormatDatabase();
      migrateToSeparateIndexes(TEST_DB_PATH);

      const db = new Database(TEST_DB_PATH);

      // Check that old tables don't exist
      const oldVecTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vec_chunks'")
        .get();
      const oldMetaTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunk_metadata'")
        .get();

      expect(oldVecTable).toBeUndefined();
      expect(oldMetaTable).toBeUndefined();

      // Check that new code tables exist
      const codeVecTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vec_chunks_code'")
        .get();
      const codeMetaTable = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='chunk_metadata_code'"
        )
        .get();

      expect(codeVecTable).toBeDefined();
      expect(codeMetaTable).toBeDefined();

      db.close();
    });

    it('should create docs tables', () => {
      createOldFormatDatabase();
      migrateToSeparateIndexes(TEST_DB_PATH);

      const db = new Database(TEST_DB_PATH);

      const docsVecTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vec_chunks_docs'")
        .get();
      const docsMetaTable = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='chunk_metadata_docs'"
        )
        .get();

      expect(docsVecTable).toBeDefined();
      expect(docsMetaTable).toBeDefined();

      db.close();
    });

    it('should add content_type column to code table', () => {
      createOldFormatDatabase();
      migrateToSeparateIndexes(TEST_DB_PATH);

      const db = new Database(TEST_DB_PATH);

      // Check that content_type column exists
      const pragmaResult = db.pragma('table_info(chunk_metadata_code)');
      const contentTypeColumn = pragmaResult.find(col => col.name === 'content_type');

      expect(contentTypeColumn).toBeDefined();

      // Check that all code chunks have content_type = 'code'
      const codeChunks = db
        .prepare('SELECT content_type FROM chunk_metadata_code')
        .all();

      expect(codeChunks.every(c => c.content_type === 'code')).toBe(true);

      db.close();
    });

    it('should migrate markdown chunks to docs index', () => {
      createOldFormatDatabase();
      migrateToSeparateIndexes(TEST_DB_PATH);

      const db = new Database(TEST_DB_PATH);

      // Check that no .md files remain in code index
      const codeMdChunks = db
        .prepare("SELECT * FROM chunk_metadata_code WHERE file LIKE '%.md'")
        .all();

      expect(codeMdChunks).toHaveLength(0);

      // Check that docs chunks are in docs index
      const docsChunks = db
        .prepare('SELECT * FROM chunk_metadata_docs')
        .all();

      expect(docsChunks).toHaveLength(2);
      expect(docsChunks.every(c => c.file.endsWith('.md'))).toBe(true);
      expect(docsChunks.every(c => c.content_type === 'docs')).toBe(true);

      db.close();
    });

    it('should preserve code chunks in code index', () => {
      createOldFormatDatabase();
      migrateToSeparateIndexes(TEST_DB_PATH);

      const db = new Database(TEST_DB_PATH);

      const codeChunks = db
        .prepare('SELECT * FROM chunk_metadata_code')
        .all();

      expect(codeChunks).toHaveLength(3);
      expect(codeChunks.every(c => c.file.endsWith('.js'))).toBe(true);
      expect(codeChunks.every(c => c.content_type === 'code')).toBe(true);

      db.close();
    });

    it('should update file_index with content_type', () => {
      createOldFormatDatabase();
      migrateToSeparateIndexes(TEST_DB_PATH);

      const db = new Database(TEST_DB_PATH);

      // Check that content_type column exists in file_index
      const pragmaResult = db.pragma('table_info(file_index)');
      const contentTypeColumn = pragmaResult.find(col => col.name === 'content_type');

      expect(contentTypeColumn).toBeDefined();

      // Check content types
      const files = db.prepare('SELECT file, content_type FROM file_index').all();

      const codeFiles = files.filter(f => f.content_type === 'code');
      const docsFiles = files.filter(f => f.content_type === 'docs');

      expect(codeFiles).toHaveLength(3);
      expect(docsFiles).toHaveLength(2);

      db.close();
    });
  });

  describe('Rollback', () => {
    it('should rollback separate indexes to unified index', () => {
      // Create migrated database
      createOldFormatDatabase();
      migrateToSeparateIndexes(TEST_DB_PATH);

      // Rollback
      const result = rollbackSeparateIndexes(TEST_DB_PATH);

      expect(result.status).toBe('success');
      expect(result.before.codeChunks).toBe(3);
      expect(result.before.docsChunks).toBe(2);
      expect(result.after.chunks).toBe(5); // All chunks back together
    });

    it('should remove docs tables after rollback', () => {
      createOldFormatDatabase();
      migrateToSeparateIndexes(TEST_DB_PATH);
      rollbackSeparateIndexes(TEST_DB_PATH);

      const db = new Database(TEST_DB_PATH);

      const docsVecTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vec_chunks_docs'")
        .get();
      const docsMetaTable = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='chunk_metadata_docs'"
        )
        .get();

      expect(docsVecTable).toBeUndefined();
      expect(docsMetaTable).toBeUndefined();

      db.close();
    });

    it('should merge docs chunks back into code index', () => {
      createOldFormatDatabase();
      migrateToSeparateIndexes(TEST_DB_PATH);
      rollbackSeparateIndexes(TEST_DB_PATH);

      const db = new Database(TEST_DB_PATH);

      const allChunks = db.prepare('SELECT * FROM chunk_metadata_code').all();

      expect(allChunks).toHaveLength(5); // 3 code + 2 docs

      // Check that docs chunks are back with content_type = 'docs'
      const docsChunks = allChunks.filter(c => c.file.endsWith('.md'));
      expect(docsChunks).toHaveLength(2);
      expect(docsChunks.every(c => c.content_type === 'docs')).toBe(true);

      db.close();
    });
  });

  describe('Edge Cases', () => {
    it('should handle database with no docs chunks', () => {
      const db = new Database(TEST_DB_PATH);
      db.exec(`
        CREATE VIRTUAL TABLE vec_chunks USING vec0(embedding FLOAT[${DIMENSION}]);
        CREATE TABLE chunk_metadata (
          chunk_id TEXT PRIMARY KEY,
          vec_rowid INTEGER,
          text TEXT,
          name TEXT,
          type TEXT,
          file TEXT,
          line INTEGER,
          exported INTEGER,
          layer TEXT,
          context_before TEXT,
          context_after TEXT,
          updated_at INTEGER
        );
        CREATE TABLE file_index (
          file TEXT PRIMARY KEY,
          mtime INTEGER NOT NULL,
          chunk_count INTEGER NOT NULL DEFAULT 0,
          indexed_at INTEGER NOT NULL,
          model_version TEXT
        );
      `);

      // Add only code chunks
      const stmtVec = db.prepare('INSERT INTO vec_chunks (embedding) VALUES (?)');
      const stmtMeta = db.prepare(`
        INSERT INTO chunk_metadata
        (chunk_id, vec_rowid, text, name, type, file, line, exported, layer, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < 3; i++) {
        const vecResult = stmtVec.run(new Float32Array(DIMENSION).fill(0.1));
        stmtMeta.run(
          `code-${i}`,
          vecResult.lastInsertRowid,
          'function test() {}',
          'test',
          'function',
          'test.js',
          1,
          1,
          null,
          Date.now()
        );
      }

      db.close();

      const result = migrateToSeparateIndexes(TEST_DB_PATH);

      expect(result.status).toBe('success');
      expect(result.migrated).toBe(0);
      expect(result.after.codeChunks).toBe(3);
      expect(result.after.docsChunks).toBe(0);
    });

    it('should handle empty database', () => {
      const db = new Database(TEST_DB_PATH);
      db.exec(`
        CREATE VIRTUAL TABLE vec_chunks USING vec0(embedding FLOAT[${DIMENSION}]);
        CREATE TABLE chunk_metadata (
          chunk_id TEXT PRIMARY KEY,
          vec_rowid INTEGER,
          text TEXT,
          name TEXT,
          type TEXT,
          file TEXT,
          line INTEGER,
          exported INTEGER,
          layer TEXT,
          context_before TEXT,
          context_after TEXT,
          updated_at INTEGER
        );
        CREATE TABLE file_index (
          file TEXT PRIMARY KEY,
          mtime INTEGER NOT NULL,
          chunk_count INTEGER NOT NULL DEFAULT 0,
          indexed_at INTEGER NOT NULL,
          model_version TEXT
        );
      `);
      db.close();

      const result = migrateToSeparateIndexes(TEST_DB_PATH);

      expect(result.status).toBe('success');
      expect(result.before.chunks).toBe(0);
      expect(result.after.codeChunks).toBe(0);
      expect(result.after.docsChunks).toBe(0);
    });
  });
});
