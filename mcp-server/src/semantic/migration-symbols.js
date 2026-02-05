/**
 * Database Migration: Symbol Index (Phase 2)
 *
 * Migrates the database to add symbol tracking capabilities:
 * - symbols table for symbol metadata
 * - symbols_fts for full-text search
 * - symbol_usages for call graph tracking
 *
 * This migration is additive and doesn't modify existing data.
 *
 * Usage:
 *   import { migrateToV2 } from './migration-symbols.js';
 *   await migrateToV2(dbPath);
 */

import Database from 'better-sqlite3';

/**
 * Migration version constant
 */
export const MIGRATION_VERSION = 2;

/**
 * Run the Phase 2 migration for symbol tracking
 * @param {string} dbPath - Path to the SQLite database file
 * @returns {Object} Migration result
 */
export function migrateToV2(dbPath) {
  console.error('[Migration V2] Starting symbol index migration...');
  const startTime = Date.now();

  const db = new Database(dbPath);

  try {
    // Check if migration already completed
    const symbolTableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='symbols'")
      .get();

    if (symbolTableExists) {
      // Validate schema to ensure it's complete
      const tableInfo = db.pragma('table_info(symbols)');
      const hasRequiredColumns = tableInfo.some(col => col.name === 'qualified_name');

      if (hasRequiredColumns) {
        console.warn(
          '[Migration V2] Migration already completed (symbols table exists with correct schema)'
        );
        db.close();
        return { status: 'already_migrated', version: MIGRATION_VERSION };
      }
      console.warn(
        '[Migration V2] Symbols table exists but schema incomplete, re-running migration...'
      );
    }

    // Step 1: Create symbols table
    console.error('[Migration V2] Step 1: Creating symbols table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS symbols (
        name TEXT NOT NULL,
        qualified_name TEXT,
        chunk_id TEXT NOT NULL,
        type TEXT NOT NULL,
        file TEXT NOT NULL,
        line INTEGER NOT NULL,
        exported INTEGER DEFAULT 0,
        async INTEGER DEFAULT 0,
        static INTEGER DEFAULT 0,
        class_name TEXT,
        parameters TEXT,
        signature TEXT,
        parent_chunk_id TEXT,
        definition_count INTEGER DEFAULT 1,

        PRIMARY KEY (name, chunk_id)
        -- Note: No FK to chunk_metadata_code since that table uses vec_rowid as PRIMARY KEY
        -- Cascade delete is handled at application layer
      );
    `);

    // Step 2: Create FTS5 table for symbol search
    console.error('[Migration V2] Step 2: Creating FTS5 symbol search table...');
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
        name,
        qualified_name,
        type,
        file,
        content='symbols',
        content_rowid='rowid'
      );
    `);

    // Step 3: Create triggers to keep FTS5 in sync
    console.error('[Migration V2] Step 3: Creating FTS5 sync triggers...');
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
        INSERT INTO symbols_fts(rowid, name, qualified_name, type, file)
        VALUES (NEW.rowid, NEW.name, NEW.qualified_name, NEW.type, NEW.file);
      END;

      CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
        DELETE FROM symbols_fts WHERE rowid = OLD.rowid;
      END;

      CREATE TRIGGER IF NOT EXISTS symbols_au AFTER UPDATE ON symbols BEGIN
        UPDATE symbols_fts SET name = NEW.name, qualified_name = NEW.qualified_name, type = NEW.type, file = NEW.file
        WHERE rowid = NEW.rowid;
      END;
    `);

    // Step 4: Create symbol_usages table for call graph
    console.error('[Migration V2] Step 4: Creating symbol_usages table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS symbol_usages (
        symbol_name TEXT NOT NULL,
        chunk_id TEXT NOT NULL,
        usage_type TEXT NOT NULL,
        file TEXT NOT NULL,
        line INTEGER,

        PRIMARY KEY (symbol_name, chunk_id, usage_type)
        -- Note: No FK to chunk_metadata_code since that table uses vec_rowid as PRIMARY KEY
        -- Cascade delete is handled at application layer
      );
    `);

    // Step 5: Create indexes for performance
    console.error('[Migration V2] Step 5: Creating performance indexes...');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(type);
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file);
      CREATE INDEX IF NOT EXISTS idx_symbols_exported ON symbols(exported);
      CREATE INDEX IF NOT EXISTS idx_symbols_class ON symbols(class_name);
      CREATE INDEX IF NOT EXISTS idx_usages_symbol ON symbol_usages(symbol_name);
    `);

    // Step 6: Set migration version
    console.error('[Migration V2] Step 6: Setting migration version...');
    _setMigrationVersion(db, MIGRATION_VERSION);

    const duration = Date.now() - startTime;

    console.error('[Migration V2] Migration complete!');
    console.error(`[Migration V2] Duration: ${duration}ms`);
    console.error('[Migration V2] Created tables: symbols, symbols_fts, symbol_usages');
    console.error(
      '[Migration V2] Created indexes: idx_symbols_type, idx_symbols_file, idx_symbols_exported, idx_symbols_class, idx_usages_symbol'
    );

    db.close();

    return {
      status: 'success',
      version: MIGRATION_VERSION,
      duration,
      tables: ['symbols', 'symbols_fts', 'symbol_usages'],
      indexes: [
        'idx_symbols_type',
        'idx_symbols_file',
        'idx_symbols_exported',
        'idx_symbols_class',
        'idx_usages_symbol',
      ],
    };
  } catch (error) {
    console.error('[Migration V2] Migration failed:', error.message);
    db.close();
    throw error;
  }
}

/**
 * Rollback Phase 2 migration
 * WARNING: This will delete all symbol data
 * @param {string} dbPath - Path to the SQLite database file
 * @returns {Object} Rollback result
 */
export function rollbackV2(dbPath) {
  console.error('[Rollback V2] Starting rollback of symbol index migration...');
  const startTime = Date.now();

  const db = new Database(dbPath);

  try {
    // Get stats before rollback
    const beforeStats = {
      symbols: db.prepare('SELECT COUNT(*) as count FROM symbols').get()?.count || 0,
      usages: db.prepare('SELECT COUNT(*) as count FROM symbol_usages').get()?.count || 0,
    };

    console.error(
      `[Rollback V2] Before: ${beforeStats.symbols} symbols, ${beforeStats.usages} usages`
    );

    // Drop tables
    console.error('[Rollback V2] Dropping symbol tables...');
    db.exec('DROP TABLE IF EXISTS symbols_fts');
    db.exec('DROP TABLE IF EXISTS symbols');
    db.exec('DROP TABLE IF EXISTS symbol_usages');

    // Clear migration version
    _setMigrationVersion(db, 1);

    const duration = Date.now() - startTime;

    console.error('[Rollback V2] Rollback complete!');
    console.error(`[Rollback V2] Duration: ${duration}ms`);
    console.error(
      `[Rollback V2] Deleted: ${beforeStats.symbols} symbols, ${beforeStats.usages} usages`
    );

    db.close();

    return {
      status: 'success',
      duration,
      deletedSymbols: beforeStats.symbols,
      deletedUsages: beforeStats.usages,
    };
  } catch (error) {
    console.error('[Rollback V2] Rollback failed:', error.message);
    db.close();
    throw error;
  }
}

/**
 * Get current migration version
 * @param {string} dbPath - Path to the SQLite database file
 * @returns {number} Migration version
 */
export function getMigrationVersion(dbPath) {
  const db = new Database(dbPath, { readonly: true });

  try {
    // HIGH FIX #4: Try _metadata table first (correct priority order)
    let result;

    try {
      result = db.prepare("SELECT value FROM _metadata WHERE key = 'migration_version'").get();
    } catch {
      // _metadata table doesn't exist, continue to pragma_user_config
    }

    if (result) {
      return parseInt(result.value, 10);
    }

    // Fall back to pragma_user_config
    try {
      result = db
        .prepare("SELECT value FROM pragma_user_config WHERE key = 'migration_version'")
        .get();
    } catch {
      // pragma_user_config doesn't exist either
    }

    return result ? parseInt(result.value, 10) : 1;
  } catch (error) {
    return 1; // Default version 1 if no migration table or query fails
  } finally {
    db.close();
  }
}

/**
 * Set migration version in pragma_user_config
 * @private
 */
function _setMigrationVersion(db, version) {
  // Use pragma_user_config to store migration version
  try {
    db.exec(`
      INSERT OR REPLACE INTO pragma_user_config(key, value)
      VALUES ('migration_version', '${version}')
    `);
  } catch (error) {
    // pragma_user_config might not exist, try creating metadata table
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS _metadata (
          key TEXT PRIMARY KEY,
          value TEXT
        );

        INSERT OR REPLACE INTO _metadata (key, value)
        VALUES ('migration_version', '${version}')
      `);
    } catch (error2) {
      console.warn('[Migration V2] Could not store migration version:', error2.message);
    }
  }
}

/**
 * Populate symbols from existing chunk metadata
 * This extracts symbols from already-indexed chunks
 * @param {string} dbPath - Path to the SQLite database file
 * @returns {Object} Population result
 */
export function populateSymbolsFromChunks(dbPath) {
  console.error('[Migration V2] Populating symbols from existing chunks...');
  const startTime = Date.now();

  const db = new Database(dbPath);

  try {
    // Get all code chunks with symbol information
    const chunks = db
      .prepare(
        `
      SELECT chunk_id, text, name, type, file, line
      FROM chunk_metadata_code
      WHERE name IS NOT NULL
      AND type IN ('function', 'class', 'class-declaration', 'method', 'variable')
    `
      )
      .all();

    console.error(`[Migration V2] Found ${chunks.length} chunks to process`);

    let populated = 0;
    let failed = 0;

    const populateTransaction = db.transaction(() => {
      for (const chunk of chunks) {
        try {
          // Determine if exported (check for 'export' in text)
          const exported = chunk.text && chunk.text.trim().startsWith('export') ? 1 : 0;

          db.prepare(
            `
            INSERT OR REPLACE INTO symbols
            (name, qualified_name, chunk_id, type, file, line, exported, async, static, class_name, definition_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, 1)
          `
          ).run(
            chunk.name,
            chunk.name, // qualified_name same as name initially
            chunk.chunk_id,
            chunk.type,
            chunk.file,
            chunk.line,
            exported
          );

          populated++;
        } catch (error) {
          console.error(
            `[Migration V2] Failed to populate chunk ${chunk.chunk_id}:`,
            error.message
          );
          failed++;
        }
      }
    });

    populateTransaction();

    const duration = Date.now() - startTime;

    console.error('[Migration V2] Population complete!');
    console.error(`[Migration V2] Duration: ${duration}ms`);
    console.error(`[Migration V2] Populated: ${populated} symbols`);
    console.error(`[Migration V2] Failed: ${failed} chunks`);

    db.close();

    return {
      status: 'success',
      duration,
      populated,
      failed,
    };
  } catch (error) {
    console.error('[Migration V2] Population failed:', error.message);
    db.close();
    throw error;
  }
}

export default {
  migrateToV2,
  rollbackV2,
  getMigrationVersion,
  populateSymbolsFromChunks,
  MIGRATION_VERSION,
};
