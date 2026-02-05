/**
 * FTS5 Adapter
 *
 * Provides BM25 keyword/lexical search using SQLite FTS5.
 * Complements vector search for hybrid semantic + keyword queries.
 *
 * Features:
 * - Separate FTS5 indexes for code and docs
 * - BM25 ranking with configurable parameters
 * - Snippet generation with highlighted matches
 * - Parallel search across both indexes
 *
 * ⚠️ CRITICAL LIMITATION: Concurrent Writes NOT Supported
 *
 * This class is NOT thread-safe for concurrent indexChunk() calls.
 *
 * DO NOT call indexChunk() concurrently from multiple async operations.
 * Concurrent writes WILL cause data loss (90-99% loss observed in testing).
 *
 * For concurrent indexing, you MUST use an external mutex/queue:
 *
 *   // CORRECT: Sequential writes
 *   for (const chunk of chunks) {
 *     await ftsAdapter.indexChunk(chunk.id, chunk.text, chunk.metadata);
 *   }
 *
 *   // WRONG: Concurrent writes (DATA LOSS!)
 *   await Promise.all(chunks.map(c =>
 *     ftsAdapter.indexChunk(c.id, c.text, c.metadata)
 *   ));
 *
 *   // CORRECT: Use external mutex for concurrent writes
 *   import { Mutex } from 'async-mutex';
 *   const mutex = new Mutex();
 *   await Promise.all(chunks.map(c =>
 *     mutex.runExclusive(() =>
 *       ftsAdapter.indexChunk(c.id, c.text, c.metadata)
 *     )
 *   ));
 *
 * @see {tests/honest-concurrency-tests.test.js} for test results
 *
 * Phase 3: Hybrid Search
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { createHash } from 'crypto';

/**
 * Default BM25 parameters
 */
const DEFAULT_K1 = 1.2; // Term saturation parameter
const DEFAULT_B = 0.75; // Length normalization parameter

/**
 * Sanitize FTS5 query to prevent SQL injection
 * Escapes special characters that could break FTS5 MATCH syntax
 * @param {string} query - Raw query string
 * @returns {string} Sanitized query safe for FTS5 MATCH
 */
function sanitizeFTS5Query(query) {
  if (!query || typeof query !== 'string') {
    return '';
  }

  // Remove or escape dangerous FTS5 operators and characters
  // - Double quotes (unless properly paired)
  // - Parentheses (can be used for grouping attacks)
  // - NEAR operator (can be exploited)
  // - NOT operator

  let sanitized = query;

  // Escape backslashes first (to avoid double-escaping)
  sanitized = sanitized.replace(/\\/g, '\\\\');

  // Remove unbalanced quotes
  const quoteCount = (sanitized.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    // Remove last unbalanced quote
    sanitized = sanitized.replace(/"([^"]*)$/, '$1');
  }

  // Escape parentheses when not used for valid grouping
  // Allow balanced parentheses for phrase searches
  sanitized = sanitized.replace(/\(/g, ' \\(');
  sanitized = sanitized.replace(/\)/g, '\\) ');

  // Remove dangerous operators when used suspiciously
  // Allow NEAR only when properly formatted
  if (/NEAR\s*\(/i.test(sanitized) && !/\bNEAR\s*\(\s*\w+\s*,\s*\d+\s*\)/i.test(sanitized)) {
    // Remove improperly formatted NEAR
    sanitized = sanitized.replace(/NEAR\s*\(/gi, '');
  }

  // Remove NOT operator when potentially dangerous
  if (/\bNOT\s+"/i.test(sanitized)) {
    sanitized = sanitized.replace(/\bNOT\s+"/gi, '"');
  }

  // Clean up extra whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

/**
 * FTS5 Adapter class
 */
export class FTS5Adapter {
  constructor(dbPath) {
    this._db = null;
    this._dbPath = dbPath;
    this._initialized = false;
    this._initializing = false; // Prevent concurrent initialization
    this._statements = {};
  }

  /**
   * Initialize FTS5 adapter
   * @param {string} dbPath - Path to SQLite database
   */
  initialize(dbPath) {
    if (this._initialized) {
      console.warn('[FTS5Adapter] Already initialized, skipping');
      return;
    }

    if (this._initializing) {
      throw new Error('[FTS5Adapter] Already initializing - concurrent initialization not allowed');
    }

    this._initializing = true;

    try {
      this._dbPath = dbPath || this._dbPath;

      if (!this._dbPath) {
        throw new Error('[FTS5Adapter] Database path required');
      }

      this._db = new Database(this._dbPath);

      console.error(`[FTS5Adapter] Database opened: ${this._dbPath}`);

      // Create FTS5 tables
      this._createFTS5Tables();

      // Prepare statements
      this._prepareStatements();

      this._initialized = true;
      console.error('[FTS5Adapter] Initialized successfully');
    } finally {
      this._initializing = false;
    }
  }

  /**
   * Create FTS5 tables for code and docs
   * @private
   */
  _createFTS5Tables() {
    this._db.exec(`
      -- FTS5 table for code content
      CREATE VIRTUAL TABLE IF NOT EXISTS code_fts USING fts5(
        content,
        file_path,
        chunk_type,
        layer,
        chunk_id,
        tokenize='porter unicode61'
      );

      -- FTS5 table for documentation
      CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
        content,
        file_path,
        chunk_type,
        title,
        chunk_id,
        tokenize='porter unicode61'
      );
    `);

    console.error('[FTS5Adapter] FTS5 tables created/verified');
  }

  /**
   * Prepare cached statements
   * @private
   */
  _prepareStatements() {
    try {
      // Code FTS5 statements
      this._statements = {
        // Code search
        searchCode: this._db.prepare(`
          SELECT
            rowid as id,
            bm25(code_fts) as score,
            snippet(code_fts, 0, '<mark>', '</mark>', '...', 30) as highlighted,
            chunk_id,
            content,
            file_path,
            chunk_type,
            layer
          FROM code_fts
          WHERE code_fts MATCH ?
          ORDER BY score
          LIMIT ?
        `),

        // Docs search
        searchDocs: this._db.prepare(`
          SELECT
            rowid as id,
            bm25(docs_fts) as score,
            snippet(docs_fts, 0, '<mark>', '</mark>', '...', 30) as highlighted,
            chunk_id,
            content,
            file_path,
            chunk_type,
            title
          FROM docs_fts
          WHERE docs_fts MATCH ?
          ORDER BY score
          LIMIT ?
        `),

        // Insert code
        insertCode: this._db.prepare(`
          INSERT INTO code_fts (rowid, content, file_path, chunk_type, layer, chunk_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `),

        // Insert docs
        insertDocs: this._db.prepare(`
          INSERT INTO docs_fts (rowid, content, file_path, chunk_type, title, chunk_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `),

        // Delete by chunk_id
        deleteCode: this._db.prepare('DELETE FROM code_fts WHERE chunk_id = ?'),
        deleteDocs: this._db.prepare('DELETE FROM docs_fts WHERE chunk_id = ?'),

        // Stats
        countCode: this._db.prepare('SELECT COUNT(*) as count FROM code_fts'),
        countDocs: this._db.prepare('SELECT COUNT(*) as count FROM docs_fts'),
      };

      console.error('[FTS5Adapter] Statements prepared');
    } catch (error) {
      console.error('[FTS5Adapter] Failed to prepare statements:', error);
      this._initialized = false;
      throw new Error(`FTS5Adapter statement preparation failed: ${error.message}`);
    }
  }

  /**
   * Index a chunk for FTS5 search
   * @param {string} chunkId - Unique chunk identifier
   * @param {string} text - Chunk content
   * @param {Object} metadata - Chunk metadata
   */
  indexChunk(chunkId, text, metadata = {}) {
    if (!this._initialized) {
      return;
    }

    // Auto-detect if this is documentation
    const isDocs = metadata.file && metadata.file.endsWith('.md');
    const isDocsType = metadata.type && metadata.type.startsWith('md-');

    // Try to get vec_rowid from metadata first, fall back to lookup
    let rowid = metadata.vecRowid;
    if (!rowid) {
      rowid = this._getRowid(chunkId, metadata);
    }

    // For testing purposes, if still no rowid, use a hash-based one
    if (!rowid) {
      rowid = this._generateRowid(chunkId);
    }

    try {
      if (isDocs || isDocsType) {
        this._statements.insertDocs.run(
          rowid,
          text || '',
          metadata.file || '',
          metadata.type || '',
          metadata.title || '',
          chunkId
        );
      } else {
        this._statements.insertCode.run(
          rowid,
          text || '',
          metadata.file || '',
          metadata.type || '',
          metadata.layer || '',
          chunkId
        );
      }
    } catch (error) {
      console.error(`[FTS5Adapter] Error indexing chunk ${chunkId}:`, error.message);
    }
  }

  /**
   * Generate a deterministic rowid from chunkId using SHA-256
   * Uses cryptographic hash to minimize collision risk
   * @private
   * @param {string} chunkId - Chunk identifier
   * @returns {number} Deterministic rowid
   */
  _generateRowid(chunkId) {
    if (!chunkId || typeof chunkId !== 'string') {
      throw new Error('[FTS5Adapter] chunkId required for rowid generation');
    }

    // Use SHA-256 for cryptographic quality hash
    const hash = createHash('sha256')
      .update(chunkId, 'utf8')
      .digest('hex');

    // Convert first 8 chars of hex hash to integer (32 bits)
    // This gives us 2^32 possible values with good distribution
    const intHash = parseInt(hash.substring(0, 8), 16);

    // Ensure positive and add offset to avoid small rowids
    return Math.abs(intHash) + 1000000;
  }

  /**
   * Batch index multiple chunks
   * @param {Array} items - Array of {chunkId, text, metadata}
   */
  indexChunks(items) {
    if (!this._initialized || !items.length) {
      return;
    }

    const transaction = this._db.transaction(() => {
      for (const { chunkId, text, metadata } of items) {
        this.indexChunk(chunkId, text, metadata);
      }
    });

    transaction();
    console.error(`[FTS5Adapter] Batch indexed ${items.length} chunks`);
  }

  /**
   * Get vec_rowid for a chunk from metadata table
   * Includes table existence validation and better error handling
   * @private
   * @param {string} chunkId - Chunk identifier
   * @param {Object} metadata - Chunk metadata
   * @returns {number|null} Rowid or null if not found
   */
  _getRowid(chunkId, metadata) {
    if (!chunkId || typeof chunkId !== 'string') {
      console.warn('[FTS5Adapter] _getRowid: invalid chunkId');
      return null;
    }

    if (metadata?.vecRowid) {
      return metadata.vecRowid;
    }

    // Determine table name from metadata
    const tableName = metadata?.content_type === 'docs' ||
                     (metadata?.file && metadata.file.endsWith('.md'))
      ? 'chunk_metadata_docs'
      : 'chunk_metadata_code';

    try {
      // Check if table exists first
      const tableExists = this._db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?
      `).get(tableName);

      if (!tableExists) {
        console.debug(`[FTS5Adapter] Table ${tableName} does not exist, will use generated rowid`);
        return null;
      }

      // Query for vec_rowid
      const result = this._db
        .prepare(`SELECT vec_rowid FROM ${tableName} WHERE chunk_id = ?`)
        .get(chunkId);

      return result?.vec_rowid || null;
    } catch (error) {
      console.error(`[FTS5Adapter] Error getting rowid for ${chunkId}:`, error.message);
      return null;
    }
  }

  /**
   * Search using BM25 ranking
   * @param {string} query - Search query (FTS5 MATCH syntax)
   * @param {Object} options - Search options
   * @returns {Array} Search results
   */
  async search(query, options = {}) {
    if (!this._initialized) {
      console.warn('[FTS5Adapter] Not initialized, returning empty');
      return [];
    }

    const {
      limit = 20,
      contentType = 'all', // 'code', 'docs', 'all'
      indexType = null, // Alias for contentType for test compatibility
      chunkType = null,
    } = options;

    // Use indexType if contentType is not specified
    const effectiveContentType = indexType || contentType;

    const searches = [];

    if (effectiveContentType === 'code' || effectiveContentType === 'all') {
      searches.push(this._searchCode(query, { limit, chunkType }));
    }

    if (effectiveContentType === 'docs' || effectiveContentType === 'all') {
      searches.push(this._searchDocs(query, { limit, chunkType }));
    }

    // Execute searches in parallel
    const results = await Promise.all(searches);
    return results.flat();
  }

  /**
   * Search code index
   * @private
   */
  async _searchCode(query, options = {}) {
    const { limit = 20, chunkType: chunkTypeOption = null } = options;
    let chunkType = chunkTypeOption;

    try {
      // Sanitize query to prevent SQL injection
      let ftsQuery = sanitizeFTS5Query(query);

      // Validate chunkType against allowed values to prevent FTS5 injection
      if (chunkType) {
        const allowedTypes = ['function', 'class', 'method', 'variable', 'imports', 'export', 'code', 'interface', 'type', 'enum'];
        if (!allowedTypes.includes(chunkType)) {
          console.warn(`[FTS5Adapter] Invalid chunkType: ${chunkType}, ignoring filter`);
          chunkType = null;
        }
      }

      // Add chunk type filter if specified
      if (chunkType) {
        ftsQuery = `${ftsQuery} chunk_type:${chunkType}`;
      }

      const rows = this._statements.searchCode.all(ftsQuery, limit * 2); // Fetch extra for filtering

      return rows.map(row => ({
        id: row.id,
        score: row.score,
        snippet: row.highlighted, // Map highlighted to snippet for test compatibility
        text: row.content,
        highlighted: row.highlighted, // Keep both for compatibility
        file: row.file_path,
        type: row.chunk_type,
        layer: row.layer,
        chunkId: row.chunk_id,
        source: 'fts5-code',
      }));
    } catch (error) {
      console.error('[FTS5Adapter] Code search error:', error.message);
      return [];
    }
  }

  /**
   * Search docs index
   * @private
   */
  async _searchDocs(query, options = {}) {
    const { limit = 20, chunkType: chunkTypeOption = null } = options;
    let chunkType = chunkTypeOption;

    try {
      // Sanitize query to prevent SQL injection
      let ftsQuery = sanitizeFTS5Query(query);

      // Validate chunkType against allowed values to prevent FTS5 injection
      if (chunkType) {
        const allowedTypes = ['function', 'class', 'method', 'variable', 'imports', 'export', 'code', 'md-section', 'md-code-block', 'md-list', 'md-table', 'md-paragraph', 'md-blockquote', 'md-document'];
        if (!allowedTypes.includes(chunkType)) {
          console.warn(`[FTS5Adapter] Invalid chunkType: ${chunkType}, ignoring filter`);
          chunkType = null;
        }
      }

      // Add chunk type filter if specified
      if (chunkType) {
        ftsQuery = `${ftsQuery} chunk_type:${chunkType}`;
      }

      const rows = this._statements.searchDocs.all(ftsQuery, limit * 2);

      return rows.map(row => ({
        id: row.id,
        score: row.score,
        snippet: row.highlighted, // Map highlighted to snippet for test compatibility
        text: row.content,
        highlighted: row.highlighted, // Keep both for compatibility
        file: row.file_path,
        type: row.chunk_type,
        title: row.title,
        chunkId: row.chunk_id,
        source: 'fts5-docs',
      }));
    } catch (error) {
      console.error('[FTS5Adapter] Docs search error:', error.message);
      return [];
    }
  }

  /**
   * Delete a chunk from FTS5 index
   * @param {string} chunkId - Chunk ID to delete
   * @param {string} contentType - 'code' or 'docs'
   */
  deleteChunk(chunkId, contentType = 'code') {
    if (!this._initialized) {
      return;
    }

    try {
      if (contentType === 'docs') {
        this._statements.deleteDocs.run(chunkId);
      } else {
        this._statements.deleteCode.run(chunkId);
      }
    } catch (error) {
      console.error(`[FTS5Adapter] Error deleting chunk ${chunkId}:`, error.message);
    }
  }

  /**
   * Get statistics
   * @returns {Object} Statistics
   */
  getStats() {
    if (!this._initialized) {
      return {
        initialized: false,
        codeChunks: 0,
        docsChunks: 0,
      };
    }

    const codeCount = this._statements.countCode.get()?.count || 0;
    const docsCount = this._statements.countDocs.get()?.count || 0;

    return {
      initialized: true,
      codeChunks: codeCount,
      docsChunks: docsCount,
      totalChunks: codeCount + docsCount,
      storage: 'fts5',
    };
  }

  /**
   * Rebuild FTS5 indexes from existing metadata
   * Call this after migration or initial indexing
   */
  rebuildIndexes() {
    if (!this._initialized) {
      throw new Error('FTS5Adapter not initialized');
    }

    console.error('[FTS5Adapter] Rebuilding FTS5 indexes...');

    const transaction = this._db.transaction(() => {
      // Clear existing FTS5 data
      this._db.exec('DELETE FROM code_fts');
      this._db.exec('DELETE FROM docs_fts');

      // Try to rebuild from chunk_metadata_code and chunk_metadata_docs
      // If those tables don't exist, fall back to chunk_metadata
      let codeChunks = [];
      let docsChunks = [];

      try {
        codeChunks = this._db.prepare(`
          SELECT chunk_id, text, file, type, layer, vec_rowid
          FROM chunk_metadata_code
        `).all();
      } catch (error) {
        // chunk_metadata_code doesn't exist, try chunk_metadata
        try {
          codeChunks = this._db.prepare(`
            SELECT chunk_id, text, file, type, layer, vec_rowid
            FROM chunk_metadata
            WHERE type IS NULL OR type NOT LIKE 'md-%'
          `).all();
        } catch (error2) {
          // No metadata tables exist
        }
      }

      try {
        docsChunks = this._db.prepare(`
          SELECT chunk_id, text, file, type, title, vec_rowid
          FROM chunk_metadata_docs
        `).all();
      } catch (error) {
        // chunk_metadata_docs doesn't exist, try chunk_metadata
        try {
          // chunk_metadata doesn't have title column, use name instead
          docsChunks = this._db.prepare(`
            SELECT chunk_id, text, file, type, name as title, vec_rowid
            FROM chunk_metadata
            WHERE type LIKE 'md-%' OR file LIKE '%.md'
          `).all();
        } catch (error2) {
          // No metadata tables exist
        }
      }

      // Rebuild code index
      for (const chunk of codeChunks) {
        try {
          const rowid = chunk.vec_rowid || this._generateRowid(chunk.chunk_id);
          this._statements.insertCode.run(
            rowid,
            chunk.text || '',
            chunk.file || '',
            chunk.type || '',
            chunk.layer || '',
            chunk.chunk_id
          );
        } catch (error) {
          console.error(`[FTS5Adapter] Error rebuilding code chunk ${chunk.chunk_id}:`, error.message);
        }
      }

      // Rebuild docs index
      for (const chunk of docsChunks) {
        try {
          const rowid = chunk.vec_rowid || this._generateRowid(chunk.chunk_id);
          this._statements.insertDocs.run(
            rowid,
            chunk.text || '',
            chunk.file || '',
            chunk.type || '',
            chunk.title || '',
            chunk.chunk_id
          );
        } catch (error) {
          console.error(`[FTS5Adapter] Error rebuilding docs chunk ${chunk.chunk_id}:`, error.message);
        }
      }
    });

    transaction();

    const stats = this.getStats();
    console.error(`[FTS5Adapter] Rebuild complete: ${stats.codeChunks} code, ${stats.docsChunks} docs`);
  }

  /**
   * Close the database connection
   * Clears statements map even if finalize fails to prevent memory leaks
   */
  close() {
    if (this._db) {
      // Finalize statements - clear map even if individual finalizations fail
      const statementNames = Object.keys(this._statements);
      for (const name of statementNames) {
        try {
          const statement = this._statements[name];
          if (statement && typeof statement.finalize === 'function') {
            statement.finalize();
          }
        } catch (error) {
          console.warn(`[FTS5Adapter] Failed to finalize ${name}:`, error.message);
          // Continue with other statements even if this one fails
        }
      }

      // Always clear statements map to prevent memory leaks
      this._statements = {};

      this._db.close();
      this._db = null;
      this._initialized = false;
      console.error('[FTS5Adapter] Database connection closed');
    }
  }

  /**
   * Check if initialized
   */
  get isInitialized() {
    return this._initialized;
  }
}

export default FTS5Adapter;
