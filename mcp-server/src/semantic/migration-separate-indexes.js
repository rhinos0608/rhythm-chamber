/**
 * Database Migration: Separate Indexes
 *
 * Migrates from a single unified index to separate code and documentation indexes.
 * This eliminates documentation noise from code queries.
 *
 * Migration steps:
 * 1. Create new docs tables (vec_chunks_docs, chunk_metadata_docs)
 * 2. Rename existing tables to code (vec_chunks_code, chunk_metadata_code)
 * 3. Add content_type column to code table
 * 4. Migrate markdown chunks from code to docs index
 * 5. Update file_index with content_type column
 *
 * Usage:
 *   import { migrateToSeparateIndexes } from './migration-separate-indexes.js';
 *   await migrateToSeparateIndexes(adapter);
 */

import Database from 'better-sqlite3';
import { isDocFile } from './config.js';

/**
 * Migrate existing database to separate code/docs indexes
 * @param {string} dbPath - Path to the SQLite database file
 * @returns {Object} Migration statistics
 */
export function migrateToSeparateIndexes(dbPath) {
  console.error('[Migration] Starting separate indexes migration...');
  const startTime = Date.now();

  const db = new Database(dbPath);

  // Check if migration already completed with schema validation
  const docsTableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='chunk_metadata_docs'"
    )
    .get();

  if (docsTableExists) {
    // Validate schema to ensure it's a complete migration
    const tableInfo = db.pragma('table_info(chunk_metadata_docs)');
    const hasRequiredColumns = tableInfo.some(col => col.name === 'content_type');

    if (hasRequiredColumns) {
      console.warn('[Migration] Migration already completed (docs tables exist with correct schema)');
      db.close();
      return { status: 'already_migrated' };
    }
    console.warn('[Migration] Docs table exists but schema incomplete, re-running migration...');
  }

  // CRITICAL FIX: Check for old format without vec_rowid column
  const chunkTableInfo = db.pragma('table_info(chunk_metadata)');
  const hasVecRowid = chunkTableInfo.some(col => col.name === 'vec_rowid');

  if (!hasVecRowid) {
    console.error('[Migration] Old format detected (no vec_rowid column), adding column...');
    db.exec('ALTER TABLE chunk_metadata ADD COLUMN vec_rowid INTEGER');
    // Populate vec_rowid from rowid (assumes 1:1 mapping for old format)
    db.exec('UPDATE chunk_metadata SET vec_rowid = (SELECT rowid FROM vec_chunks WHERE vec_chunks.rowid = chunk_metadata.rowid LIMIT 1)');
    // For any chunks where vec_rowid is still NULL, try to match by chunk_id
    db.exec(`
      UPDATE chunk_metadata
      SET vec_rowid = (
        SELECT vec_chunks.rowid
        FROM vec_chunks
        WHERE vec_chunks.rowid = chunk_metadata.rowid
        LIMIT 1
      )
      WHERE vec_rowid IS NULL
    `);
    // CRITICAL FIX: Validate that vec_rowid was populated successfully
    const nullCount = db.prepare('SELECT COUNT(*) as count FROM chunk_metadata WHERE vec_rowid IS NULL').get()?.count || 0;
    if (nullCount > 0) {
      console.error(`[Migration] WARNING: ${nullCount} chunks have NULL vec_rowid after population attempt`);
      console.error('[Migration] These chunks will be skipped during migration to prevent corruption');
    } else {
      console.error('[Migration] Successfully populated vec_rowid for all chunks');
    }
    console.error('[Migration] Added vec_rowid column to chunk_metadata table');
  }

  // Step 1: Get current state before migration
  const beforeStats = {
    chunks: db.prepare('SELECT COUNT(*) as count FROM vec_chunks').get()?.count || 0,
    metadata: db.prepare('SELECT COUNT(*) as count FROM chunk_metadata').get()?.count || 0,
    files: db.prepare('SELECT COUNT(*) as count FROM file_index').get()?.count || 0,
  };

  console.error(`[Migration] Before: ${beforeStats.chunks} chunks, ${beforeStats.files} files`);

  // Step 2: Create docs tables
  console.error('[Migration] Step 1: Creating docs tables...');
  db.exec(`
    CREATE VIRTUAL TABLE vec_chunks_docs USING vec0(
      embedding FLOAT[768]
    );

    CREATE TABLE chunk_metadata_docs (
      chunk_id TEXT PRIMARY KEY,
      vec_rowid INTEGER,
      text TEXT,
      name TEXT,
      type TEXT,
      file TEXT,
      line INTEGER,
      title TEXT,
      language TEXT,
      level INTEGER,
      content_type TEXT DEFAULT 'docs',
      updated_at INTEGER
    );
  `);

  // Step 3: Rename existing tables to code
  console.error('[Migration] Step 2: Renaming existing tables to code...');
  db.exec(`
    ALTER TABLE vec_chunks RENAME TO vec_chunks_code;
    ALTER TABLE chunk_metadata RENAME TO chunk_metadata_code;
  `);

  // Step 4: Add content_type column to code table
  console.error('[Migration] Step 3: Adding content_type column to code table...');
  db.exec(`
    ALTER TABLE chunk_metadata_code ADD COLUMN content_type TEXT DEFAULT 'code';
    UPDATE chunk_metadata_code SET content_type = 'code';
  `);

  // Step 5: Migrate markdown chunks from code to docs
  console.error('[Migration] Step 4: Migrating markdown chunks to docs index...');

  // Get all markdown chunks
  const mdChunks = db
    .prepare(`
      SELECT chunk_id, vec_rowid, text, name, type, file, line, updated_at
      FROM chunk_metadata_code
      WHERE file LIKE '%.md' OR type LIKE 'md-%'
    `)
    .all();

  console.error(`[Migration] Found ${mdChunks.length} markdown chunks to migrate`);

  let migratedCount = 0;
  let failedCount = 0;

  // Migrate in transaction for safety
  const migrateTransaction = db.transaction(() => {
    for (const chunk of mdChunks) {
      try {
        // Get embedding from code table
        const embeddingRow = db
          .prepare('SELECT embedding FROM vec_chunks_code WHERE rowid = ?')
          .get(chunk.vec_rowid);

        if (!embeddingRow) {
          console.warn(`[Migration] No embedding found for chunk ${chunk.chunk_id}, skipping`);
          failedCount++;
          continue;
        }

        // Insert into docs vector table
        const insertVecStmt = db.prepare('INSERT INTO vec_chunks_docs (embedding) VALUES (?)');
        const vecResult = insertVecStmt.run(embeddingRow.embedding);
        const newVecRowid = vecResult.lastInsertRowid;

        // Insert into docs metadata table
        const insertMetaStmt = db.prepare(`
          INSERT INTO chunk_metadata_docs
          (chunk_id, vec_rowid, text, name, type, file, line, content_type, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'docs', ?)
        `);
        insertMetaStmt.run(
          chunk.chunk_id,
          newVecRowid,
          chunk.text,
          chunk.name,
          chunk.type,
          chunk.file,
          chunk.line,
          chunk.updated_at
        );

        // Delete from code tables
        db.prepare('DELETE FROM vec_chunks_code WHERE rowid = ?').run(chunk.vec_rowid);
        db.prepare('DELETE FROM chunk_metadata_code WHERE chunk_id = ?').run(chunk.chunk_id);

        migratedCount++;
      } catch (error) {
        console.error(`[Migration] Failed to migrate chunk ${chunk.chunk_id}:`, error.message);
        failedCount++;
      }
    }
  });

  migrateTransaction();

  // Step 6: Update file_index with content_type column
  console.error('[Migration] Step 5: Updating file_index table...');

  // Check if content_type column already exists
  const pragmaResult = db
    .pragma('table_info(file_index)')
    .filter(col => col.name === 'content_type');

  if (pragmaResult.length === 0) {
    db.exec(`
      ALTER TABLE file_index ADD COLUMN content_type TEXT;
    `);

    // Update file_index with content type
    const files = db.prepare('SELECT file FROM file_index').all();
    for (const row of files) {
      const contentType = isDocFile(row.file) ? 'docs' : 'code';
      db.prepare('UPDATE file_index SET content_type = ? WHERE file = ?').run(
        contentType,
        row.file
      );
    }
  }

  // Get final stats
  const afterStats = {
    codeChunks: db.prepare('SELECT COUNT(*) as count FROM vec_chunks_code').get()?.count || 0,
    docsChunks: db.prepare('SELECT COUNT(*) as count FROM vec_chunks_docs').get()?.count || 0,
    totalChunks: 0,
    files: db.prepare('SELECT COUNT(*) as count FROM file_index').get()?.count || 0,
  };
  afterStats.totalChunks = afterStats.codeChunks + afterStats.docsChunks;

  const duration = Date.now() - startTime;

  console.error('[Migration] Migration complete!');
  console.error(`[Migration] Duration: ${duration}ms`);
  console.error(`[Migration] Migrated: ${migratedCount} markdown chunks`);
  console.error(`[Migration] Failed: ${failedCount} chunks`);
  console.error(`[Migration] After: ${afterStats.codeChunks} code chunks, ${afterStats.docsChunks} docs chunks`);
  console.error(`[Migration] Total: ${afterStats.totalChunks} chunks, ${afterStats.files} files`);

  db.close();

  return {
    status: 'success',
    duration,
    before: beforeStats,
    after: afterStats,
    migrated: migratedCount,
    failed: failedCount,
  };
}

/**
 * Rollback separate indexes migration
 * WARNING: This will lose the separate indexes and merge everything back together
 * @param {string} dbPath - Path to the SQLite database file
 */
export function rollbackSeparateIndexes(dbPath) {
  console.error('[Rollback] Starting rollback of separate indexes migration...');
  const startTime = Date.now();

  const db = new Database(dbPath);

  // Get stats before rollback
  const beforeStats = {
    codeChunks: db.prepare('SELECT COUNT(*) as count FROM vec_chunks_code').get()?.count || 0,
    docsChunks: db.prepare('SELECT COUNT(*) as count FROM vec_chunks_docs').get()?.count || 0,
  };

  console.error(`[Rollback] Before: ${beforeStats.codeChunks} code chunks, ${beforeStats.docsChunks} docs chunks`);

  // Move docs chunks back to code table
  console.error('[Rollback] Moving docs chunks back to unified index...');

  const rollbackTransaction = db.transaction(() => {
    // Get all docs chunks
    const docsChunks = db
      .prepare(`
        SELECT chunk_id, vec_rowid, text, name, type, file, line, updated_at
        FROM chunk_metadata_docs
      `)
      .all();

    for (const chunk of docsChunks) {
      try {
        // Get embedding
        const embeddingRow = db
          .prepare('SELECT embedding FROM vec_chunks_docs WHERE rowid = ?')
          .get(chunk.vec_rowid);

        if (!embeddingRow) {
          continue;
        }

        // Insert into code tables
        const insertVecStmt = db.prepare('INSERT INTO vec_chunks_code (embedding) VALUES (?)');
        const vecResult = insertVecStmt.run(embeddingRow.embedding);

        const insertMetaStmt = db.prepare(`
          INSERT INTO chunk_metadata_code
          (chunk_id, vec_rowid, text, name, type, file, line, content_type, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'docs', ?)
        `);
        insertMetaStmt.run(
          chunk.chunk_id,
          vecResult.lastInsertRowid,
          chunk.text,
          chunk.name,
          chunk.type,
          chunk.file,
          chunk.line,
          chunk.updated_at
        );
      } catch (error) {
        console.error(`[Rollback] Failed to migrate chunk ${chunk.chunk_id}:`, error.message);
      }
    }

    // Drop docs tables
    db.exec('DROP TABLE IF EXISTS vec_chunks_docs');
    db.exec('DROP TABLE IF EXISTS chunk_metadata_docs');

    // Remove content_type column from file_index (SQLite doesn't support DROP COLUMN, so recreate table)
    db.exec(`
      CREATE TABLE file_index_new (
        file TEXT PRIMARY KEY,
        mtime INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        indexed_at INTEGER NOT NULL,
        model_version TEXT
      );

      INSERT INTO file_index_new (file, mtime, chunk_count, indexed_at, model_version)
      SELECT file, mtime, chunk_count, indexed_at, model_version
      FROM file_index;

      DROP TABLE file_index;
      ALTER TABLE file_index_new RENAME TO file_index;
    `);
  });

  rollbackTransaction();

  const afterStats = {
    chunks: db.prepare('SELECT COUNT(*) as count FROM vec_chunks_code').get()?.count || 0,
  };

  const duration = Date.now() - startTime;

  console.error('[Rollback] Rollback complete!');
  console.error(`[Rollback] Duration: ${duration}ms`);
  console.error(`[Rollback] After: ${afterStats.chunks} total chunks`);

  db.close();

  return {
    status: 'success',
    duration,
    before: beforeStats,
    after: afterStats,
  };
}

export default {
  migrateToSeparateIndexes,
  rollbackSeparateIndexes,
};
