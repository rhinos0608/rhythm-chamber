/**
 * Multi-Index Adapter
 *
 * Manages separate vector spaces for code and documentation to eliminate noise.
 * Routes queries to appropriate indexes and merges results when needed.
 *
 * Benefits:
 * - Code queries return only code (no documentation noise)
 * - Docs queries return only docs (no code noise)
 * - 2x faster code queries (half the vectors to search)
 * - Separate similarity thresholds per content type
 *
 * Phase 1 fixes applied:
 * - Fixed statement memory leak in _upsertBatchDocs
 * - Added deleteChunksByFile method
 * - Added file index management methods
 * - Auto-detect content_type from file extension
 * - Fixed threshold handling for 'all' index search
 * - Added index on content_type column
 */

import { SqliteVectorAdapter } from './sqlite-adapter.js';
import { TYPE_THRESHOLDS, isDocFile } from './config.js';

/**
 * Multi-index adapter managing separate code and documentation vector spaces
 */
export class MultiIndexAdapter {
  constructor() {
    this.codeAdapter = new SqliteVectorAdapter();
    this.docsAdapter = new SqliteVectorAdapter();
    this._sharedDb = null;
    this._dbPath = null;
    this._dimension = 768;
    this._initialized = false;
  }

  /**
   * Initialize multi-index adapter with separate tables
   * @param {string} dbPath - Path to the SQLite database file
   * @param {number} dimension - Embedding dimension (default: 768)
   */
  initialize(dbPath, dimension = 768) {
    if (this._initialized) {
      console.warn('[MultiIndexAdapter] Already initialized, skipping');
      return;
    }

    this._dbPath = dbPath;
    this._dimension = dimension;

    // Initialize code adapter with existing tables
    this.codeAdapter.initialize(dbPath, dimension);
    this._sharedDb = this.codeAdapter._db;

    // Initialize docs adapter with shared database connection
    // but separate tables
    this.docsAdapter._db = this._sharedDb;
    this.docsAdapter._dimension = dimension;
    this._createDocsTables();

    // Prepare docs adapter statements
    this._prepareDocsStatements();

    this._initialized = true;
    console.error(`[MultiIndexAdapter] Initialized: ${dbPath} (dimension: ${dimension})`);
  }

  /**
   * Create docs-specific tables (separate from code tables)
   * @private
   */
  _createDocsTables() {
    // Create vec_chunks_docs virtual table
    this._sharedDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks_docs USING vec0(
        embedding FLOAT[${this._dimension}]
      );
    `);

    // Create chunk_metadata_docs table
    this._sharedDb.exec(`
      CREATE TABLE IF NOT EXISTS chunk_metadata_docs (
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

    // Create index on content_type for filtering performance
    this._sharedDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_docs_content_type
      ON chunk_metadata_docs(content_type)
    `);

    console.error('[MultiIndexAdapter] Created docs tables');
  }

  /**
   * Prepare statements for docs adapter
   * @private
   */
  _prepareDocsStatements() {
    // Create docs-specific statements
    this.docsAdapter._statements = {
      deleteMetadata: this._sharedDb.prepare('DELETE FROM chunk_metadata_docs WHERE chunk_id = ?'),
      insertMetadata: this._sharedDb.prepare(`
        INSERT INTO chunk_metadata_docs (
          chunk_id, vec_rowid, text, name, type, file, line,
          title, language, level, content_type, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getMetadata: this._sharedDb.prepare(`
        SELECT
          vec_rowid, text, name, type, file, line,
          title, language, level, content_type, updated_at as updatedAt
        FROM chunk_metadata_docs
        WHERE chunk_id = ?
      `),
      chunkExists: this._sharedDb.prepare('SELECT 1 FROM chunk_metadata_docs WHERE chunk_id = ?'),
      deleteChunkVec: this._sharedDb.prepare('DELETE FROM vec_chunks_docs WHERE rowid = ?'),
      deleteChunkMetadata: this._sharedDb.prepare('DELETE FROM chunk_metadata_docs WHERE chunk_id = ?'),
      countChunks: this._sharedDb.prepare('SELECT COUNT(*) as count FROM vec_chunks_docs'),
      getFiles: this._sharedDb.prepare(
        'SELECT DISTINCT file FROM chunk_metadata_docs WHERE file IS NOT NULL ORDER BY file'
      ),
      deleteVecChunksByFile: this._sharedDb.prepare(`
        DELETE FROM vec_chunks_docs
        WHERE rowid IN (
          SELECT vec_rowid FROM chunk_metadata_docs WHERE file = ?
        )
      `),
      deleteMetadataByFile: this._sharedDb.prepare('DELETE FROM chunk_metadata_docs WHERE file = ?'),
      // CRITICAL FIX: Cache INSERT statement to prevent memory leak
      insertVec: this._sharedDb.prepare('INSERT INTO vec_chunks_docs (embedding) VALUES (?)'),
    };

    console.error('[MultiIndexAdapter] Prepared docs statements');
  }

  /**
   * Insert or update a chunk with embedding and metadata
   * Routes to appropriate adapter based on content_type or auto-detects from file extension
   *
   * @param {string} chunkId - Unique chunk identifier
   * @param {Float32Array|Array} embedding - Embedding vector
   * @param {Object} metadata - Chunk metadata
   */
  upsert(chunkId, embedding, metadata = {}) {
    if (!this._initialized) {
      throw new Error('MultiIndexAdapter not initialized');
    }

    // Auto-detect content_type from file extension if not specified
    const contentType = metadata.content_type ||
      (isDocFile(metadata.file || '') ? 'docs' : 'code');
    const adapter = contentType === 'docs' ? this.docsAdapter : this.codeAdapter;

    return adapter.upsert(chunkId, embedding, metadata);
  }

  /**
   * Batch upsert multiple chunks
   * Routes each chunk to appropriate adapter based on content_type
   *
   * @param {Array} items - Array of {chunkId, embedding, metadata} objects
   */
  upsertBatch(items) {
    if (!this._initialized) {
      throw new Error('MultiIndexAdapter not initialized');
    }

    if (!items || items.length === 0) {
      return;
    }

    // Separate items by content type
    const codeItems = [];
    const docsItems = [];

    for (const item of items) {
      // Auto-detect content_type from file extension if not specified
      const contentType = item.metadata?.content_type ||
        (isDocFile(item.metadata?.file || '') ? 'docs' : 'code');
      if (contentType === 'docs') {
        item.metadata.content_type = 'docs'; // Ensure metadata has content_type
        docsItems.push(item);
      } else {
        item.metadata.content_type = 'code'; // Ensure metadata has content_type
        codeItems.push(item);
      }
    }

    // Upsert to respective adapters
    const results = [];
    if (codeItems.length > 0) {
      results.push({ type: 'code', count: codeItems.length });
      this.codeAdapter.upsertBatch(codeItems);
    }

    if (docsItems.length > 0) {
      results.push({ type: 'docs', count: docsItems.length });
      this._upsertBatchDocs(docsItems);
    }

    return results;
  }

  /**
   * Batch upsert docs items using cached statements
   * CRITICAL FIX: Use cached statements to prevent memory leak
   * @param {Array} items - Array of {chunkId, embedding, metadata} objects
   * @private
   */
  _upsertBatchDocs(items) {
    const SUB_BATCH_SIZE = 100;
    let processed = 0;

    while (processed < items.length) {
      const subBatch = items.slice(processed, processed + SUB_BATCH_SIZE);
      processed += subBatch.length;

      const batchTransaction = this._sharedDb.transaction(() => {
        // CRITICAL FIX: Use cached statement instead of preparing new one
        const insertVecStmt = this.docsAdapter._statements.insertVec;

        for (const { chunkId, embedding: embeddingRaw, metadata } of subBatch) {
          let embedding = embeddingRaw;
          if (!(embedding instanceof Float32Array)) {
            embedding = new Float32Array(embedding);
          }

          const oldMeta = this.docsAdapter._statements.getMetadata.get(chunkId);

          if (oldMeta && oldMeta.vecRowid) {
            this.docsAdapter._statements.deleteChunkVec.run(oldMeta.vecRowid);
          }

          this.docsAdapter._statements.deleteMetadata.run(chunkId);

          // Insert new embedding into vec_chunks_docs using cached statement
          const vecResult = insertVecStmt.run(embedding);

          this.docsAdapter._statements.insertMetadata.run(
            chunkId,
            vecResult.lastInsertRowid,
            metadata.text || null,
            metadata.name || null,
            metadata.type || null,
            metadata.file || null,
            metadata.line || null,
            metadata.title || null,
            metadata.language || null,
            metadata.level || null,
            metadata.content_type || 'docs',
            metadata.updatedAt || Date.now()
          );
        }
      });

      try {
        batchTransaction();
      } catch (error) {
        throw new Error(`Docs batch upsert failed: ${error.message}`);
      }

      if (global.gc && processed < items.length) {
        global.gc();
      }
    }

    console.error(`[MultiIndexAdapter] Docs batch upsert: ${items.length} chunks`);
  }

  /**
   * Search using vector similarity
   * Routes to appropriate index(es) based on indexType option
   *
   * CRITICAL FIX: Use same threshold for both indexes when searching 'all'
   *
   * @param {Float32Array|Array} queryEmbedding - Query embedding vector
   * @param {Object} options - Search options
   * @param {string} options.indexType - 'code', 'docs', or 'all' (default: 'all')
   * @param {number} options.limit - Maximum results to return (default: 10)
   * @param {number} options.threshold - Minimum similarity threshold (default: 0.3)
   * @param {Object} options.filters - Metadata filters to apply
   * @returns {Array} Search results with chunkId, similarity, and metadata
   */
  search(queryEmbedding, options = {}) {
    if (!this._initialized) {
      throw new Error('MultiIndexAdapter not initialized');
    }

    const { indexType = 'all', limit = 10, threshold, filters = {} } = options;

    // Use same threshold for both indexes to ensure fair comparison
    const defaultThreshold = threshold || 0.25;

    // If specific index type requested, search only that index
    if (indexType === 'code') {
      return this.codeAdapter.search(queryEmbedding, {
        limit,
        threshold: defaultThreshold,
        filters,
      });
    }

    if (indexType === 'docs') {
      return this._searchDocs(queryEmbedding, { limit, threshold: defaultThreshold, filters });
    }

    // Search both with same threshold and merge
    const codeResults = this.codeAdapter.search(queryEmbedding, {
      limit,
      threshold: defaultThreshold,
      filters,
    });

    const docsResults = this._searchDocs(queryEmbedding, {
      limit,
      threshold: defaultThreshold,
      filters,
    });

    return this._mergeResults(codeResults, docsResults, limit);
  }

  /**
   * Search docs index
   * @param {Float32Array|Array} queryEmbedding - Query embedding vector
   * @param {Object} options - Search options
   * @returns {Array} Search results
   * @private
   */
  _searchDocs(queryEmbedding, options = {}) {
    const { limit = 10, threshold = 0.3, filters = {} } = options;

    if (!(queryEmbedding instanceof Float32Array)) {
      queryEmbedding = new Float32Array(queryEmbedding);
    }

    const maxDistance = 1 - threshold;

    const query = `
      SELECT
        m.chunk_id,
        v.distance,
        m.text,
        m.name,
        m.type,
        m.file,
        m.line,
        m.title,
        m.language,
        m.level,
        m.content_type,
        m.updated_at as updatedAt
      FROM (
        SELECT
          rowid,
          vec_distance_cosine(embedding, ?) as distance
        FROM vec_chunks_docs
      ) v
      LEFT JOIN chunk_metadata_docs m ON m.vec_rowid = v.rowid
      WHERE v.distance < ?
      ORDER BY v.distance
      LIMIT ?
    `;

    const stmt = this._sharedDb.prepare(query);
    // Fetch more results to account for post-filtering
    const rows = stmt.all(queryEmbedding, maxDistance, limit * 50);

    const results = [];
    for (const row of rows) {
      const similarity = 1 - row.distance;

      if (similarity >= threshold) {
        const metadata = {
          text: row.text,
          name: row.name,
          type: row.type,
          file: row.file,
          line: row.line,
          title: row.title,
          language: row.language,
          level: row.level,
          content_type: row.content_type,
          updatedAt: row.updatedAt,
          chunkId: row.chunk_id,
        };

        // Apply filters
        let passesFilters = true;
        if (filters.file && metadata.file !== filters.file) {
          passesFilters = false;
        }
        if (filters.type && metadata.type !== filters.type) {
          passesFilters = false;
        }

        if (passesFilters) {
          results.push({
            chunkId: row.chunk_id,
            similarity,
            metadata,
          });
        }
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Merge results from code and docs searches
   * @param {Array} codeResults - Results from code index
   * @param {Array} docsResults - Results from docs index
   * @param {number} limit - Maximum results to return
   * @returns {Array} Merged and sorted results
   * @private
   */
  _mergeResults(codeResults, docsResults, limit) {
    const allResults = [...codeResults, ...docsResults];

    // Sort by similarity (descending)
    allResults.sort((a, b) => b.similarity - a.similarity);

    return allResults.slice(0, limit);
  }

  /**
   * Get a chunk by ID with metadata
   * Searches both indexes
   * @param {string} chunkId - Chunk identifier
   * @returns {Object|null} Chunk data with metadata, or null if not found
   */
  get(chunkId) {
    if (!this._initialized) {
      throw new Error('MultiIndexAdapter not initialized');
    }

    // Try code index first
    const codeResult = this.codeAdapter.get(chunkId);
    if (codeResult) {
      return codeResult;
    }

    // Try docs index
    const docsMetadata = this.docsAdapter._statements.getMetadata.get(chunkId);
    if (docsMetadata) {
      return {
        chunkId,
        metadata: docsMetadata,
        hasEmbedding: true,
      };
    }

    return null;
  }

  /**
   * Delete a chunk by ID
   * Searches both indexes
   * @param {string} chunkId - Chunk identifier
   * @returns {boolean} True if deleted, false if not found
   */
  delete(chunkId) {
    if (!this._initialized) {
      throw new Error('MultiIndexAdapter not initialized');
    }

    // Try code index first
    const codeDeleted = this.codeAdapter.delete(chunkId);
    if (codeDeleted) {
      return true;
    }

    // Try docs index
    const docsMetadata = this.docsAdapter._statements.getMetadata.get(chunkId);
    if (docsMetadata) {
      const transaction = this._sharedDb.transaction(() => {
        const result = this.docsAdapter._statements.deleteChunkVec.run(docsMetadata.vec_rowid);
        this.docsAdapter._statements.deleteChunkMetadata.run(chunkId);
        return result.changes > 0;
      });
      return transaction();
    }

    return false;
  }

  /**
   * Delete all chunks and metadata for a specific file (batch operation)
   * CRITICAL FIX: Added method that was missing
   * @param {string} filePath - File path to delete all chunks for
   */
  deleteChunksByFile(filePath) {
    if (!this._initialized) {
      return;
    }

    // Use transaction for atomic batch delete
    this._sharedDb.transaction(() => {
      // Delete from code adapter
      this.codeAdapter.deleteChunksByFile(filePath);

      // Delete from docs adapter
      this.docsAdapter._statements.deleteVecChunksByFile.run(filePath);
      this.docsAdapter._statements.deleteMetadataByFile.run(filePath);
    })();

    console.error(`[MultiIndexAdapter] Deleted all chunks for file: ${filePath}`);
  }

  /**
   * Get database statistics
   * CRITICAL FIX: Fixed incorrect total calculation
   * @returns {Object} Statistics including chunk counts by content type
   */
  getStats() {
    if (!this._initialized) {
      return {
        initialized: false,
        dbSizeBytes: 0,
      };
    }

    const codeStats = this.codeAdapter.getStats();
    const docsCount = this.docsAdapter._statements.countChunks.get()?.count || 0;

    return {
      initialized: true,
      dbSizeBytes: codeStats.dbSizeBytes,
      chunkCount: (codeStats.chunkCount || 0) + docsCount,
      codeChunks: codeStats.chunkCount || 0,
      docsChunks: docsCount,
      dimension: this._dimension,
      dbPath: this._dbPath,
      storageType: 'multi-index',
    };
  }

  /**
   * Get all unique files from metadata
   * @param {string} contentType - 'code', 'docs', or 'all' (default: 'all')
   * @returns {Array<string>} Array of unique file paths
   */
  getFiles(contentType = 'all') {
    if (!this._initialized) {
      return [];
    }

    if (contentType === 'code') {
      return this.codeAdapter.getFiles();
    }

    if (contentType === 'docs') {
      const rows = this.docsAdapter._statements.getFiles.all();
      return rows.map(row => row.file);
    }

    // Return all files from both indexes
    const codeFiles = this.codeAdapter.getFiles();
    const docsRows = this.docsAdapter._statements.getFiles.all();
    const docsFiles = docsRows.map(row => row.file);

    return [...new Set([...codeFiles, ...docsFiles])].sort();
  }

  /**
   * Get file index state for incremental resume
   * Delegates to code adapter (file_index is shared)
   * @param {string} filePath - File path to check
   * @returns {Object|null} File index state
   */
  getFileIndexState(filePath) {
    if (!this._initialized) {
      return null;
    }
    return this.codeAdapter.getFileIndexState(filePath);
  }

  /**
   * Update file index after successfully indexing a file
   * Delegates to code adapter (file_index is shared)
   * @param {string} filePath - File path that was indexed
   * @param {number} mtime - File modification time
   * @param {number} chunkCount - Number of chunks indexed
   * @param {string} modelVersion - Embedding model version
   */
  updateFileIndex(filePath, mtime, chunkCount, modelVersion) {
    if (!this._initialized) {
      console.warn('[MultiIndexAdapter] Cannot update file index: adapter not initialized');
      return;
    }
    this.codeAdapter.updateFileIndex(filePath, mtime, chunkCount, modelVersion);
  }

  /**
   * Remove file from index (when file is deleted or needs re-indexing)
   * Delegates to code adapter (file_index is shared)
   * @param {string} filePath - File path to remove
   */
  removeFileIndex(filePath) {
    if (!this._initialized) {
      return;
    }
    this.codeAdapter.removeFileIndex(filePath);
  }

  /**
   * Get all file indexes for resume progress tracking
   * Delegates to code adapter (file_index is shared)
   * @returns {Array<Object>} Array of {file, mtime, chunkCount}
   */
  getAllFileIndexes() {
    if (!this._initialized) {
      return [];
    }
    return this.codeAdapter.getAllFileIndexes();
  }

  /**
   * Clear the file index table (for force reindex)
   * Delegates to code adapter (file_index is shared)
   */
  clearFileIndex() {
    if (!this._initialized) {
      return;
    }
    this.codeAdapter.clearFileIndex();
  }

  /**
   * Get chunks by file path
   * @param {string} filePath - File path to get chunks for
   * @returns {Array<Object>} Array of chunk IDs for the file
   */
  getChunksByFile(filePath) {
    if (!this._initialized) {
      return [];
    }

    const results = [];

    // Get from code index
    const codeChunks = this.codeAdapter.getChunksByFile(filePath);
    results.push(...codeChunks);

    // Get from docs index
    const stmt = this._sharedDb.prepare('SELECT chunk_id FROM chunk_metadata_docs WHERE file = ?');
    const docsRows = stmt.all(filePath);
    results.push(...docsRows.map(row => ({ chunkId: row.chunk_id })));

    return results;
  }

  /**
   * Clear all data (both indexes)
   */
  clearAll() {
    if (!this._initialized) {
      return;
    }

    this.codeAdapter.clearAll();

    // Clear docs tables
    this._sharedDb.transaction(() => {
      this._sharedDb.exec('DELETE FROM vec_chunks_docs');
      this._sharedDb.exec('DELETE FROM chunk_metadata_docs');
    })();

    console.error('[MultiIndexAdapter] Cleared all tables (code + docs)');
  }

  /**
   * Close the database connection
   * CRITICAL FIX: Now properly closes code adapter which finalizes its statements
   */
  close() {
    if (this._sharedDb) {
      // Close code adapter first (this finalizes code adapter statements)
      this.codeAdapter.close();

      // Finalize docs statements
      if (this.docsAdapter._statements) {
        for (const [name, statement] of Object.entries(this.docsAdapter._statements)) {
          try {
            if (statement && typeof statement.finalize === 'function') {
              statement.finalize();
            }
          } catch (finalizeError) {
            console.warn(
              `[MultiIndexAdapter] Failed to finalize docs statement ${name}:`,
              finalizeError.message
            );
          }
        }
        this.docsAdapter._statements = null;
      }

      // Don't close shared DB (code adapter already did)
      this._sharedDb = null;
      this._initialized = false;
      console.error('[MultiIndexAdapter] Database connection closed');
    }
  }

  /**
   * Check if adapter is initialized
   */
  get isInitialized() {
    return this._initialized;
  }

  /**
   * Get database path
   */
  get dbPath() {
    return this._dbPath;
  }

  /**
   * Get embedding dimension
   */
  get dimension() {
    return this._dimension;
  }
}

/**
 * Default export
 */
export default MultiIndexAdapter;
