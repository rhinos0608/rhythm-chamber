/**
 * Symbol Index
 *
 * Extends DependencyGraph with SQLite persistence for symbols.
 * Enables fast symbol lookup using FTS5 full-text search.
 *
 * Features:
 * - SQLite-backed symbol persistence
 * - FTS5 full-text search with wildcards
 * - Call graph (usages) tracking
 * - Batch insert support for performance
 * - Prepared statements caching
 *
 * ⚠️ CRITICAL LIMITATION: Concurrent Writes NOT Supported
 *
 * This class is NOT thread-safe for concurrent addChunk() calls.
 *
 * DO NOT call addChunk() concurrently from multiple async operations.
 * Concurrent writes WILL cause data loss (90-99% loss observed in testing).
 *
 * For concurrent indexing, you MUST use an external mutex/queue:
 *
 *   // CORRECT: Sequential writes
 *   for (const chunk of chunks) {
 *     symbolIndex.addChunk(chunk);
 *   }
 *
 *   // WRONG: Concurrent writes (DATA LOSS!)
 *   await Promise.all(chunks.map(c => symbolIndex.addChunk(c)));
 *
 *   // CORRECT: Use external mutex for concurrent writes
 *   import { Mutex } from 'async-mutex';
 *   const mutex = new Mutex();
 *   await Promise.all(chunks.map(c =>
 *     mutex.runExclusive(() => symbolIndex.addChunk(c))
 *   ));
 *
 * @see {tests/honest-concurrency-tests.test.js} for test results
 *
 * Phase 2: Symbol-Aware Indexing
 */

import Database from 'better-sqlite3';
import { DependencyGraph, SYMBOL_TYPES } from './dependency-graph.js';
import { existsSync } from 'fs';
import { dirname } from 'path';

/**
 * Symbol Index class extending DependencyGraph with SQLite persistence
 */
/**
 * Maximum batch size for bulk insert operations
 * Prevents OOM errors with large symbol arrays
 */
const BATCH_LIMIT = 500;

export class SymbolIndex extends DependencyGraph {
  constructor(dbPath) {
    // Initialize parent class for in-memory tracking
    super();

    this._db = null;
    this._dbPath = dbPath;
    this._initialized = false;
    this._initializing = false; // Prevent concurrent initialization
    this._statements = {}; // Cached prepared statements

    // Batch insert state
    this._pendingSymbols = [];
    this._batchSize = 100;
  }

  /**
   * Initialize the symbol index with SQLite database
   * @param {string} dbPath - Path to the SQLite database file
   */
  initialize(dbPath) {
    if (this._initialized) {
      console.warn('[SymbolIndex] Already initialized, skipping');
      return;
    }

    if (this._initializing) {
      throw new Error('[SymbolIndex] Already initializing - concurrent initialization not allowed');
    }

    this._initializing = true;

    try {
      this._dbPath = dbPath || this._dbPath;

      if (!this._dbPath) {
        throw new Error('[SymbolIndex] Database path required for initialization');
      }

      // Create database connection
      this._db = new Database(this._dbPath);

      // Configure SQLite
      this._db.pragma('journal_mode = WAL');
      this._db.pragma('synchronous = NORMAL');

      console.error(`[SymbolIndex] Database opened: ${this._dbPath}`);

      // Create tables
      this._createTables();

      // Prepare statements
      this._prepareStatements();

      this._initialized = true;
      console.error('[SymbolIndex] Initialized successfully');
    } finally {
      this._initializing = false;
    }
  }

  /**
   * Create symbol tables if they don't exist
   * @private
   */
  _createTables() {
    this._db.exec(`
      -- Symbols table (extends chunk metadata with symbol-specific info)
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
        -- Cascade delete is handled at application layer in removeChunk()
      );

      -- FTS5 for fast symbol name search
      CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
        name,
        qualified_name,
        type,
        file,
        content='symbols',
        content_rowid='rowid'
      );

      -- Trigger to keep FTS5 in sync
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

      -- Call graph persistence
      CREATE TABLE IF NOT EXISTS symbol_usages (
        symbol_name TEXT NOT NULL,
        chunk_id TEXT NOT NULL,
        usage_type TEXT NOT NULL,
        file TEXT NOT NULL,
        line INTEGER,

        PRIMARY KEY (symbol_name, chunk_id, usage_type)
        -- Note: No FK to chunk_metadata_code since that table uses vec_rowid as PRIMARY KEY
        -- Cascade delete is handled at application layer in removeChunk()
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(type);
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file);
      CREATE INDEX IF NOT EXISTS idx_symbols_exported ON symbols(exported);
      CREATE INDEX IF NOT EXISTS idx_symbols_class ON symbols(class_name);
      CREATE INDEX IF NOT EXISTS idx_usages_symbol ON symbol_usages(symbol_name);
    `);

    console.error('[SymbolIndex] Tables created/verified');
  }

  /**
   * Prepare and cache frequently used statements
   * @private
   */
  _prepareStatements() {
    try {
      this._statements = {
        // Symbol operations
        insertSymbol: this._db.prepare(`
          INSERT OR REPLACE INTO symbols
          (name, qualified_name, chunk_id, type, file, line, exported, async, static, class_name, parameters, signature, parent_chunk_id, definition_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `),

        getSymbol: this._db.prepare(`
          SELECT * FROM symbols WHERE name = ? AND chunk_id = ?
        `),

        findSymbolsByName: this._db.prepare(`
          SELECT * FROM symbols WHERE name = ?
        `),

        findSymbolsByType: this._db.prepare(`
          SELECT * FROM symbols WHERE type = ? LIMIT ?
        `),

        deleteSymbol: this._db.prepare(`
          DELETE FROM symbols WHERE name = ? AND chunk_id = ?
        `),

        deleteSymbolsByChunk: this._db.prepare(`
          DELETE FROM symbols WHERE chunk_id = ?
        `),

        // Usage operations
        insertUsage: this._db.prepare(`
          INSERT OR REPLACE INTO symbol_usages (symbol_name, chunk_id, usage_type, file, line)
          VALUES (?, ?, ?, ?, ?)
        `),

        findUsages: this._db.prepare(`
          SELECT * FROM symbol_usages WHERE symbol_name = ?
        `),

        deleteUsagesByChunk: this._db.prepare(`
          DELETE FROM symbol_usages WHERE chunk_id = ?
        `),

        // Stats
        countSymbols: this._db.prepare(`
          SELECT COUNT(*) as count FROM symbols
        `),

        countUsages: this._db.prepare(`
          SELECT COUNT(*) as count FROM symbol_usages
        `),
      };

      console.error('[SymbolIndex] Statements prepared');
    } catch (error) {
      console.error('[SymbolIndex] Failed to prepare statements:', error);
      this._initialized = false;
      throw new Error(`SymbolIndex statement preparation failed: ${error.message}`);
    }
  }

  /**
   * Override addChunk to persist symbols to SQLite
   * @param {Object} chunk - Chunk object from chunker
   */
  addChunk(chunk) {
    // Call parent for in-memory tracking
    super.addChunk(chunk);

    // Skip SQLite persistence if not initialized
    if (!this._initialized) {
      return;
    }

    // Extract symbol information from chunk
    const { id, type, name, metadata } = chunk;

    if (!name) {
      return; // Skip chunks without symbol names
    }

    try {
      // Build symbol record
      const symbol = {
        name: name,
        qualified_name: this._buildQualifiedName(chunk),
        chunk_id: id,
        type: type,
        file: metadata.file || '',
        line: metadata.startLine || metadata.line || 0,
        exported: metadata.exported ? 1 : 0,
        async: metadata.async ? 1 : 0,
        static: metadata.static ? 1 : 0,
        class_name: metadata.className || null,
        parameters: metadata.params ? JSON.stringify(metadata.params) : null,
        signature: metadata.signature || null,
        parent_chunk_id: metadata.parentChunkId || null,
        definition_count: 1,
      };

      // Insert into database
      this._statements.insertSymbol.run(
        symbol.name,
        symbol.qualified_name,
        symbol.chunk_id,
        symbol.type,
        symbol.file,
        symbol.line,
        symbol.exported,
        symbol.async,
        symbol.static,
        symbol.class_name,
        symbol.parameters,
        symbol.signature,
        symbol.parent_chunk_id,
        symbol.definition_count
      );

      // Track calls as usages
      if (metadata.calls && metadata.calls.length > 0) {
        for (const call of metadata.calls) {
          this._trackUsage(call, id, 'call', metadata.file, metadata.line);
        }
      }

      // Track throws as usages
      if (metadata.throws && metadata.throws.length > 0) {
        for (const thrown of metadata.throws) {
          this._trackUsage(thrown, id, 'throw', metadata.file, metadata.line);
        }
      }
    } catch (error) {
      console.error(`[SymbolIndex] Error adding chunk ${id}:`, error.message);
    }
  }

  /**
   * Build qualified name for a symbol (e.g., "ClassName.methodName")
   * @private
   */
  _buildQualifiedName(chunk) {
    const { name, metadata } = chunk;

    if (metadata.className) {
      return `${metadata.className}.${name}`;
    }

    if (metadata.parentName) {
      return `${metadata.parentName}.${name}`;
    }

    return name;
  }

  /**
   * Track symbol usage
   * @private
   */
  _trackUsage(symbolName, chunkId, usageType, file, line) {
    if (!this._initialized) {
      return;
    }

    try {
      this._statements.insertUsage.run(symbolName, chunkId, usageType, file, line);
    } catch (error) {
      // Ignore duplicate errors (primary key constraint)
      if (!error.message.includes('UNIQUE')) {
        console.error(`[SymbolIndex] Error tracking usage:`, error.message);
      }
    }
  }

  /**
   * Find exact symbol by name
   * @param {string} name - Symbol name to find
   * @param {Object} options - Options
   * @returns {Array} Array of symbol records
   */
  findSymbol(name, options = {}) {
    if (!this._initialized) {
      // Fall back to in-memory
      return this.findDefinition(name);
    }

    const results = this._statements.findSymbolsByName.all(name);
    return this._postProcessResults(results, options);
  }

  /**
   * Sanitize FTS5 query to prevent SQL injection
   * @private
   */
  _sanitizeFTSQuery(query) {
    if (!query || typeof query !== 'string') {
      return '';
    }

    // HIGH FIX #5: Remove dangerous FTS5 special characters
    let sanitized = query
      .replace(/'/g, '') // Remove single quotes (not allowed in FTS5)
      .replace(/\\/g, '') // Remove backslashes (escape character)
      .replace(/[\[\]]/g, '') // Remove bracket expressions
      .replace(/\{/g, '') // Remove NEAR operators
      .replace(/"/g, ''); // Remove double quotes (not allowed in FTS5)

    // Limit wildcard usage
    const wildcardCount = (sanitized.match(/\*/g) || []).length;
    if (wildcardCount > 3) {
      // Too many wildcards, truncate
      let parts = sanitized.split('*');
      sanitized = parts.slice(0, 4).join('*') + (parts.length > 4 ? '*' : '');
    }

    // Prevent overly complex queries
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 100);
    }

    return sanitized.trim();
  }

  /**
   * Search symbols using FTS5 full-text search
   * Supports wildcards (* for any characters, ? for single character)
   * @param {string} query - Search query (supports wildcards)
   * @param {Object} options - Options
   * @param {string} options.type - Filter by symbol type
   * @param {number} options.limit - Maximum results (default: 50)
   * @param {string} options.file - Filter by file
   * @returns {Array} Array of matching symbols
   */
  searchSymbols(query, options = {}) {
    if (!this._initialized) {
      console.warn('[SymbolIndex] Not initialized, falling back to in-memory search');
      return this._fallbackSearch(query, options);
    }

    const { type, limit = 50, file } = options;

    // Sanitize query to prevent SQL injection
    const sanitizedQuery = this._sanitizeFTSQuery(query);

    if (!sanitizedQuery) {
      return [];
    }

    // Build FTS5 query
    let ftsQuery = sanitizedQuery;

    // If no wildcards, do prefix search
    if (!ftsQuery.includes('*') && !ftsQuery.includes('?')) {
      ftsQuery = `${ftsQuery}*`;
    }

    // Build SQL query
    let sql = `
      SELECT s.* FROM symbols s
      INNER JOIN symbols_fts f ON s.rowid = f.rowid
      WHERE symbols_fts MATCH ?
    `;

    const params = [ftsQuery];

    // Add filters
    if (type) {
      sql += ` AND s.type = ?`;
      params.push(type);
    }

    if (file) {
      sql += ` AND s.file = ?`;
      params.push(file);
    }

    sql += ` LIMIT ?`;
    params.push(limit);

    try {
      const stmt = this._db.prepare(sql);
      const results = stmt.all(...params);
      return this._postProcessResults(results, options);
    } catch (error) {
      console.error('[SymbolIndex] FTS5 search error:', error.message);
      return [];
    }
  }

  /**
   * Find symbols by type
   * @param {string} type - Symbol type (function, class, method, variable, etc.)
   * @param {Object} options - Options
   * @param {number} options.limit - Maximum results
   * @returns {Array} Array of symbols
   */
  findSymbolsByType(type, options = {}) {
    if (!this._initialized) {
      console.warn('[SymbolIndex] Not initialized, returning empty');
      return [];
    }

    const { limit = 100 } = options;
    const results = this._statements.findSymbolsByType.all(type, limit);
    return this._postProcessResults(results, options);
  }

  /**
   * Find all usages (call graph) for a symbol
   * @param {string} symbolName - Symbol name to find usages for
   * @param {Object} options - Options
   * @returns {Array} Array of usage records
   */
  findUsages(symbolName, options = {}) {
    if (!this._initialized) {
      // Fall back to in-memory
      return super.findUsages(symbolName);
    }

    const results = this._statements.findUsages.all(symbolName);

    // Post-process with chunk metadata
    const enriched = results.map(usage => {
      const chunkSyms = this.chunkSymbols.get(usage.chunk_id);
      return {
        ...usage,
        defines: chunkSyms ? Array.from(chunkSyms.defines) : [],
        uses: chunkSyms ? Array.from(chunkSyms.useds) : [],
      };
    });

    return enriched;
  }

  /**
   * Find all definitions of a symbol
   * @param {string} symbolName - Symbol name
   * @returns {Array} Array of definition records
   */
  findDefinitions(symbolName) {
    return this.findSymbol(symbolName);
  }

  /**
   * Batch insert symbols for performance
   * @param {Array} symbols - Array of symbol objects
   */
  bulkInsertSymbols(symbols) {
    if (!this._initialized || !symbols.length) {
      return;
    }

    // Enforce batch limit to prevent OOM
    if (symbols.length > BATCH_LIMIT) {
      console.warn(`[SymbolIndex] Batch size ${symbols.length} exceeds limit ${BATCH_LIMIT}, chunking`);

      let inserted = 0;
      for (let i = 0; i < symbols.length; i += BATCH_LIMIT) {
        const chunk = symbols.slice(i, Math.min(i + BATCH_LIMIT, symbols.length));
        this._bulkInsertSymbolsChunk(chunk);
        inserted += chunk.length;
      }

      console.error(`[SymbolIndex] Bulk inserted ${inserted} symbols in ${Math.ceil(symbols.length / BATCH_LIMIT)} batches`);
      return;
    }

    this._bulkInsertSymbolsChunk(symbols);
    console.error(`[SymbolIndex] Bulk inserted ${symbols.length} symbols`);
  }

  /**
   * Insert a chunk of symbols within batch limit
   * @private
   */
  _bulkInsertSymbolsChunk(symbols) {
    let failedCount = 0;
    const errors = [];

    const transaction = this._db.transaction((symbolList) => {
      for (const symbol of symbolList) {
        try {
          this._statements.insertSymbol.run(
            symbol.name,
            symbol.qualified_name,
            symbol.chunk_id,
            symbol.type,
            symbol.file,
            symbol.line,
            symbol.exported,
            symbol.async,
            symbol.static,
            symbol.class_name,
            symbol.parameters,
            symbol.signature,
            symbol.parent_chunk_id,
            symbol.definition_count
          );
        } catch (error) {
          failedCount++;
          errors.push({ symbol: symbol.name, error: error.message });
          console.error(`[SymbolIndex] Bulk insert error for ${symbol.name}:`, error.message);
        }
      }
    });

    try {
      transaction(symbols);

      // Log summary if there were failures
      if (failedCount > 0) {
        console.warn(`[SymbolIndex] Bulk insert completed with ${failedCount}/${symbols.length} failures`);
        if (errors.length <= 5) {
          console.warn('[SymbolIndex] Failed symbols:', errors);
        }
      }
    } catch (transactionError) {
      console.error('[SymbolIndex] Transaction failed:', transactionError.message);
      throw transactionError;
    }
  }

  /**
   * Remove chunk from symbol index
   * @param {string} chunkId - Chunk ID to remove
   */
  removeChunk(chunkId) {
    if (!this._initialized) {
      // Call parent for in-memory cleanup only
      super.removeChunk(chunkId);
      return;
    }

    try {
      // Clean SQLite FIRST, then in-memory (correct order)
      // deleteSymbolsByChunk and deleteUsagesByChunk handle the cleanup
      this._statements.deleteSymbolsByChunk.run(chunkId);
      this._statements.deleteUsagesByChunk.run(chunkId);

      // Only remove from in-memory after SQLite succeeds
      super.removeChunk(chunkId);
    } catch (error) {
      console.error(`[SymbolIndex] Error removing chunk ${chunkId}:`, error.message);
      // Don't remove from in-memory if SQLite failed
    }
  }

  /**
   * Get statistics about the symbol index
   * @returns {Object} Statistics
   */
  getStats() {
    const baseStats = super.getStats();

    if (!this._initialized) {
      return baseStats;
    }

    const symbolCount = this._statements.countSymbols.get()?.count || 0;
    const usageCount = this._statements.countUsages.get()?.count || 0;

    return {
      ...baseStats,
      symbolCount,
      usageCount,
      storage: 'sqlite',
    };
  }

  /**
   * Close the database connection
   */
  close() {
    if (this._db) {
      // Finalize statements
      for (const [name, statement] of Object.entries(this._statements)) {
        try {
          if (statement && typeof statement.finalize === 'function') {
            statement.finalize();
          }
        } catch (error) {
          console.warn(`[SymbolIndex] Failed to finalize ${name}:`, error.message);
        }
      }

      this._db.close();
      this._db = null;
      this._initialized = false;
      console.error('[SymbolIndex] Database connection closed');
    }
  }

  /**
   * Post-process results to add in-memory data
   * @private
   */
  _postProcessResults(results, options) {
    return results.map(row => ({
      name: row.name,
      qualifiedName: row.qualified_name,
      chunkId: row.chunk_id,
      type: row.type,
      file: row.file,
      line: row.line,
      exported: row.exported === 1,
      async: row.async === 1,
      static: row.static === 1,
      className: row.class_name,
      parameters: row.parameters ? (() => {
        try {
          return JSON.parse(row.parameters);
        } catch (error) {
          console.warn('[SymbolIndex] Failed to parse parameters:', error.message);
          return [];
        }
      })() : [],
      signature: row.signature,
      parentChunkId: row.parent_chunk_id,
    }));
  }

  /**
   * Fallback search for when database is not available
   * @private
   */
  _fallbackSearch(query, options) {
    const { limit = 50 } = options;
    const results = [];

    // Simple prefix match on in-memory definitions
    for (const [symbolName, defs] of this.definitions.entries()) {
      if (symbolName.startsWith(query.replace(/\*/g, ''))) {
        for (const def of defs) {
          results.push({
            name: symbolName,
            qualifiedName: symbolName,
            chunkId: def.chunkId,
            type: def.type,
            file: def.file,
            exported: def.exported,
          });

          if (results.length >= limit) {
            break;
          }
        }
      }

      if (results.length >= limit) {
        break;
      }
    }

    return results;
  }

  /**
   * Export all symbols to JSON
   * @returns {Array} Array of all symbols
   */
  exportSymbols() {
    if (!this._initialized) {
      throw new Error('SymbolIndex not initialized');
    }

    const rows = this._db.prepare('SELECT * FROM symbols').all();
    return this._postProcessResults(rows, {});
  }

  /**
   * Clear all symbol data
   */
  clear() {
    super.clear();

    if (this._initialized) {
      this._db.exec('DELETE FROM symbols');
      this._db.exec('DELETE FROM symbol_usages');
      console.error('[SymbolIndex] Cleared all symbols');
    }
  }

  /**
   * Check if initialized
   */
  get isInitialized() {
    return this._initialized;
  }
}

export default SymbolIndex;
