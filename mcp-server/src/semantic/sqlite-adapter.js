/**
 * SQLite Vector Adapter
 *
 * Provides disk-backed vector storage using sqlite-vec extension.
 * Handles all sqlite-vec operations including upsert, search, and retrieval.
 *
 * Uses better-sqlite3 for synchronous operations and sqlite-vec for vector search.
 *
 * IMPORTANT: sqlite-vec stores Float32Array directly - you must pass the
 * Float32Array object as a parameter, not wrapped in any function.
 */

import Database from 'better-sqlite3';
import { getLoadablePath } from 'sqlite-vec';
import { statSync, mkdirSync, unlinkSync, existsSync } from 'fs';
import { dirname } from 'path';
import { passesFilters as sharedPassesFilters } from './filters.js';

/**
 * Default embedding dimension (nomic-embed-text-v1.5)
 */
const DEFAULT_DIM = 768;

/**
 * SQLite Vector Adapter class
 */
export class SqliteVectorAdapter {
  constructor() {
    this._db = null;
    this._dbPath = null;
    this._dimension = DEFAULT_DIM;
    this._initialized = false;
    this._statements = null; // CRITICAL FIX #3: Cache prepared statements
    this.type = 'sqlite'; // Type identifier for adapter detection

    // OOM FIX: Counter to track total upsert operations for periodic statement renewal
    // better-sqlite3 retains references to bound parameters (Float32Array embeddings)
    // causing unbounded memory growth during indexing
    this._statementCounter = 0;
    this._STATEMENT_RENEWAL_INTERVAL = 1000; // After ~1000 chunks, renew statements
  }

  /**
   * Initialize the SQLite database with vec0 tables
   * @param {string} dbPath - Path to the SQLite database file
   * @param {number} dimension - Embedding dimension (default: 768)
   */
  initialize(dbPath, dimension = DEFAULT_DIM) {
    if (this._initialized) {
      console.warn('[SqliteAdapter] Already initialized, skipping');
      return;
    }

    this._dbPath = dbPath;
    this._dimension = dimension;

    // HIGH FIX #7: Ensure parent directory exists before creating database
    const parentDir = dirname(dbPath);
    try {
      mkdirSync(parentDir, { recursive: true });
      console.error(`[SqliteAdapter] Ensured directory exists: ${parentDir}`);
    } catch (mkdirError) {
      // Directory might already exist or creation failed - try to continue
      console.warn(`[SqliteAdapter] Directory creation warning: ${mkdirError.message}`);
    }

    // Create database connection
    this._db = new Database(dbPath);

    // OOM FIX: Minimal PRAGMAs - sqlite-vec may have issues with certain settings
    // Using only safe, compatible settings
    this._db.pragma('synchronous = NORMAL'); // Safe but faster than FULL
    console.error('[SqliteAdapter] Applied minimal PRAGMAs for sqlite-vec compatibility');

    // Load sqlite-vec extension
    const extPath = getLoadablePath();
    this._db.loadExtension(extPath);

    console.error(`[SqliteAdapter] Loaded sqlite-vec extension from: ${extPath}`);

    // Create vec0 virtual tables
    this._createTables();

    // CRITICAL FIX #3: Prepare and cache statements for reuse
    this._prepareStatements();

    this._initialized = true;
    console.error(`[SqliteAdapter] Initialized: ${dbPath} (dimension: ${dimension})`);
  }

  /**
   * Create vec0 virtual tables for vector storage
   * @private
   */
  _createTables() {
    // OOM FIX: Use simplest vec0 schema - only embedding column, no custom primary key.
    // Store chunk_id in separate metadata table. The vec0 table uses default rowid.
    // This avoids sqlite-vec "readonly database" shadow table issues.
    this._db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        embedding FLOAT[${this._dimension}]
      );
    `);

    // Create metadata table (separate because vec0 doesn't support complex metadata)
    // OOM FIX: Added vec_rowid to link with vec_chunks table (rowid-based join)
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS chunk_metadata (
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
    `);

    // Create file_index table for incremental resume support
    // Tracks which files have been indexed and their modification times
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS file_index (
        file TEXT PRIMARY KEY,
        mtime INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        indexed_at INTEGER NOT NULL,
        model_version TEXT
      );
    `);

    console.error('[SqliteAdapter] Created vec0 tables');
  }

  /**
   * Prepare and cache SQL statements for reuse
   * CRITICAL FIX #3: Prevents statement leak and improves performance
   * @private
   */
  _prepareStatements() {
    this._statements = {
      // Upsert statements (vec_chunks uses rowid, handled inline)
      deleteMetadata: this._db.prepare('DELETE FROM chunk_metadata WHERE chunk_id = ?'),
      insertMetadata: this._db.prepare(`
        INSERT INTO chunk_metadata (
          chunk_id, vec_rowid, text, name, type, file, line, exported,
          layer, context_before, context_after, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      // Get statements
      getMetadata: this._db.prepare(`
        SELECT
          vec_rowid, text, name, type, file, line, exported,
          layer, context_before as contextBefore, context_after as contextAfter,
          updated_at as updatedAt
        FROM chunk_metadata
        WHERE chunk_id = ?
      `),
      chunkExists: this._db.prepare('SELECT 1 FROM chunk_metadata WHERE chunk_id = ?'),

      // Delete statements
      deleteChunkVec: this._db.prepare('DELETE FROM vec_chunks WHERE rowid = ?'),
      deleteChunkMetadata: this._db.prepare('DELETE FROM chunk_metadata WHERE chunk_id = ?'),

      // Stats statements
      countChunks: this._db.prepare('SELECT COUNT(*) as count FROM vec_chunks'),

      // Get files statement
      getFiles: this._db.prepare(
        'SELECT DISTINCT file FROM chunk_metadata WHERE file IS NOT NULL ORDER BY file'
      ),

      // File index statements for incremental resume
      getFileIndex: this._db.prepare(
        'SELECT mtime, chunk_count, indexed_at, model_version FROM file_index WHERE file = ?'
      ),
      upsertFileIndex: this._db.prepare(`
        INSERT INTO file_index (file, mtime, chunk_count, indexed_at, model_version)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(file) DO UPDATE SET
          mtime = excluded.mtime,
          chunk_count = excluded.chunk_count,
          indexed_at = excluded.indexed_at,
          model_version = excluded.model_version
      `),
      removeFileIndex: this._db.prepare('DELETE FROM file_index WHERE file = ?'),
      getAllFileIndexes: this._db.prepare('SELECT file, mtime, chunk_count FROM file_index'),

      // Batch delete statements for file cleanup
      // OOM FIX: Use rowid-based join - vec_chunks uses rowid, chunk_metadata has vec_rowid
      deleteVecChunksByFile: this._db.prepare(`
        DELETE FROM vec_chunks
        WHERE rowid IN (
          SELECT vec_rowid FROM chunk_metadata WHERE file = ?
        )
      `),
      deleteMetadataByFile: this._db.prepare('DELETE FROM chunk_metadata WHERE file = ?'),
    };

    console.error('[SqliteAdapter] Prepared and cached SQL statements');
  }

  /**
   * Renew only the embedding insert statement to free accumulated Float32Array references
   *
   * OOM FIX: better-sqlite3 retains references to bound parameters (Float32Array embeddings)
   * causing unbounded memory growth during indexing.
   *
   * CRITICAL: Only renew insertEmbedding statement - finalizing ALL statements that
   * reference vec_chunks breaks sqlite-vec's virtual table internal state and causes
   * "attempt to write a readonly database" errors on shadow tables.
   *
   * @private
   */
  _renewStatements() {
    if (!this._statements) {
      return;
    }

    console.error('[SqliteAdapter] Renewing insertEmbedding statement to free bound parameters...');

    // OOM FIX: Only renew the insertEmbedding statement which binds Float32Array embeddings.
    // Finalizing ALL vec_chunks statements breaks sqlite-vec's virtual table state.
    const oldStatement = this._statements.insertEmbedding;
    if (oldStatement && typeof oldStatement.finalize === 'function') {
      try {
        oldStatement.finalize();
      } catch (finalizeError) {
        console.warn('[SqliteAdapter] Failed to finalize insertEmbedding:', finalizeError.message);
      }
    }

    // Recreate only the insertEmbedding statement
    this._statements.insertEmbedding = this._db.prepare(
      'INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)'
    );

    // Reset counter
    this._statementCounter = 0;

    // Force GC to reclaim memory from finalized statement
    if (global.gc) {
      global.gc();
    }

    console.error('[SqliteAdapter] Statement renewal complete (insertEmbedding only)');
  }

  /**
   * Insert or update a chunk with embedding and metadata
   * @param {string} chunkId - Unique chunk identifier
   * @param {Float32Array|Array} embedding - Embedding vector
   * @param {Object} metadata - Chunk metadata
   */
  upsert(chunkId, embedding, metadata = {}) {
    if (!this._initialized) {
      throw new Error('SqliteAdapter not initialized');
    }

    // Convert embedding to Float32Array if needed
    if (!(embedding instanceof Float32Array)) {
      embedding = new Float32Array(embedding);
    }

    // CRITICAL FIX #3: Use cached prepared statements instead of preparing each time
    // Use a transaction for atomic upsert
    const upsertTransaction = this._db.transaction(() => {
      // Delete existing if present
      this._statements.deleteEmbedding.run(chunkId);
      this._statements.deleteMetadata.run(chunkId);

      // Insert new data
      this._statements.insertEmbedding.run(chunkId, embedding);
      this._statements.insertMetadata.run(
        chunkId,
        metadata.text || null,
        metadata.name || null,
        metadata.type || null,
        metadata.file || null,
        metadata.line || null,
        metadata.exported ? 1 : 0,
        metadata.layer || null,
        metadata.contextBefore || null,
        metadata.contextAfter || null,
        metadata.updatedAt || Date.now()
      );
    });

    upsertTransaction();
  }

  /**
   * Batch upsert multiple chunks in a single transaction
   * More efficient than individual upsert calls for large batches
   *
   * OOM FIX: Sub-batch processing (100 chunks per transaction) to prevent
   * unbounded memory growth during large batch operations. Based on MCP Memory
   * Service optimization recommendations and better-sqlite3 issue #433.
   *
   * @param {Array} items - Array of {chunkId, embedding, metadata} objects
   */
  upsertBatch(items) {
    if (!this._initialized) {
      throw new Error('SqliteAdapter not initialized');
    }

    if (!items || items.length === 0) {
      return;
    }

    // OOM FIX: Process in sub-batches of 100 chunks to limit memory usage
    // Large transactions can cause unbounded memory growth in better-sqlite3
    const SUB_BATCH_SIZE = 100;
    const totalItems = items.length;
    let processed = 0;

    while (processed < totalItems) {
      const subBatch = items.slice(processed, processed + SUB_BATCH_SIZE);
      processed += subBatch.length;

      // Process this sub-batch in a single transaction
      this._processSubBatch(subBatch);

      // OOM FIX: Trigger GC between sub-batches to help V8 reclaim memory
      // This prevents heap from growing too large during indexing
      if (global.gc && processed < totalItems) {
        global.gc();
      }
    }

    console.error(`[SqliteAdapter] Batch upsert: ${totalItems} chunks in ${Math.ceil(totalItems / SUB_BATCH_SIZE)} sub-batches`);
  }

  /**
   * Process a single sub-batch of chunks in one transaction
   * @param {Array} items - Array of {chunkId, embedding, metadata} objects
   * @private
   */
  _processSubBatch(items) {
    // CRITICAL: Track which chunk/operation fails for debugging
    let failedChunkId = null;
    let failedOperation = null;

    const batchTransaction = this._db.transaction(() => {
      // OOM FIX: Prepare reusable statements once for the entire batch
      // Creating statements per-chunk caused memory accumulation (9000+ statements)
      const getVecRowidStmt = this._db.prepare('SELECT vec_rowid FROM chunk_metadata WHERE chunk_id = ?');
      const insertVecStmt = this._db.prepare('INSERT INTO vec_chunks (embedding) VALUES (?)');

      for (const { chunkId, embedding, metadata } of items) {
        failedChunkId = chunkId; // Track for error reporting

        // Convert embedding to Float32Array if needed
        if (!(embedding instanceof Float32Array)) {
          embedding = new Float32Array(embedding);
        }

        // OOM FIX: New rowid-based approach to avoid sqlite-vec shadow table issues
        // 1. Get old vec_rowid if exists, 2. Delete old embedding, 3. Insert new, 4. Update metadata

        // Check if chunk already exists and get its vec_rowid
        failedOperation = 'getOldRowId';
        const oldMeta = this._statements.getMetadata.get(chunkId);

        // Delete old embedding from vec_chunks if it existed
        if (oldMeta && oldMeta.vecRowid) {
          failedOperation = 'deleteOldEmbedding';
          this._statements.deleteChunkVec.run(oldMeta.vecRowid);
        }

        // Delete old metadata
        failedOperation = 'deleteMetadata';
        this._statements.deleteMetadata.run(chunkId);

        // Insert new embedding into vec_chunks and get back the rowid
        failedOperation = 'insertEmbedding';
        const vecResult = insertVecStmt.run(embedding);
        const newRowId = vecResult.lastInsertRowid;

        // Insert new metadata with vec_rowid
        failedOperation = 'insertMetadata';
        this._statements.insertMetadata.run(
          chunkId,
          newRowId, // vec_rowid links to vec_chunks.rowid
          metadata.text || null,
          metadata.name || null,
          metadata.type || null,
          metadata.file || null,
          metadata.line || null,
          metadata.exported ? 1 : 0,
          metadata.layer || null,
          metadata.contextBefore || null,
          metadata.contextAfter || null,
          metadata.updatedAt || Date.now()
        );
      }

      // Statements auto-finalize when transaction completes
    });

    try {
      batchTransaction();
    } catch (error) {
      // CRITICAL: Provide context about which chunk/operation failed
      throw new Error(
        `Batch upsert failed at chunkId="${failedChunkId}" during ${failedOperation}: ${error.message}`
      );
    }

    // OOM FIX: Statement renewal DISABLED - finalizing statements that reference
    // sqlite-vec's virtual table breaks its internal state and causes
    // "attempt to write a readonly database" errors. With sub-batching and
    // other memory optimizations, memory growth should be manageable.
    // this._statementCounter += items.length;
    // if (this._statementCounter >= this._STATEMENT_RENEWAL_INTERVAL) {
    //   this._renewStatements();
    // }

    // OOM FIX: Explicitly null out embedding references in the items array
    // This helps V8 GC reclaim the Float32Arrays after transaction completes
    for (let i = 0; i < items.length; i++) {
      items[i].embedding = null;
    }
  }

  /**
   * KNN search using cosine similarity
   *
   * Uses a subquery approach to find nearest neighbors by computing
   * cosine distance between query embedding and all stored embeddings.
   *
   * HIGH FIX #8: Apply filters in application code using sharedPassesFilters()
   * for consistency with Map version and to support complex filter logic.
   *
   * @param {Float32Array|Array} queryEmbedding - Query embedding vector
   * @param {Object} options - Search options
   * @returns {Array} Search results with chunkId, similarity, and metadata
   */
  search(queryEmbedding, options = {}) {
    if (!this._initialized) {
      throw new Error('SqliteAdapter not initialized');
    }

    const { limit = 10, threshold = 0.3, filters = {} } = options;

    // Convert query embedding to Float32Array if needed
    if (!(queryEmbedding instanceof Float32Array)) {
      queryEmbedding = new Float32Array(queryEmbedding);
    }

    // Convert similarity threshold to max distance
    // cosine distance = 1 - cosine similarity
    const maxDistance = 1 - threshold;

    // HIGH FIX #8: Removed SQL-level filters for consistency with Map version
    // Filters are now applied in application code using sharedPassesFilters()
    // KNN search using distance calculation with metadata JOIN
    // Fetches all data in a single query to avoid N+1 problem
    // OOM FIX: Use rowid-based join - vec_chunks uses rowid, chunk_metadata has vec_rowid
    const query = `
      SELECT
        m.chunk_id,
        v.distance,
        m.text,
        m.name,
        m.type,
        m.file,
        m.line,
        m.exported,
        m.layer,
        m.context_before as contextBefore,
        m.context_after as contextAfter,
        m.updated_at as updatedAt
      FROM (
        SELECT
          rowid,
          vec_distance_cosine(embedding, ?) as distance
        FROM vec_chunks
      ) v
      LEFT JOIN chunk_metadata m ON m.vec_rowid = v.rowid
      WHERE v.distance < ?
      ORDER BY v.distance
      LIMIT ?
    `;

    const stmt = this._db.prepare(query);
    const rows = stmt.all(queryEmbedding, maxDistance, limit * 10); // Fetch more to account for filtering

    // Convert results to expected format and apply filters in application code
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
          exported: row.exported === 1,
          layer: row.layer,
          contextBefore: row.contextBefore,
          contextAfter: row.contextAfter,
          updatedAt: row.updatedAt,
          chunkId: row.chunk_id,
        };

        // HIGH FIX #8: Apply filters in application code using shared utility
        if (sharedPassesFilters(metadata, filters)) {
          results.push({
            chunkId: row.chunk_id,
            similarity,
            metadata,
          });
        }
      }
    }

    // Sort by similarity (descending) and limit results
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Get a chunk by ID with metadata
   * @param {string} chunkId - Chunk identifier
   * @returns {Object|null} Chunk data with metadata, or null if not found
   */
  get(chunkId) {
    if (!this._initialized) {
      throw new Error('SqliteAdapter not initialized');
    }

    const metadata = this._getMetadata(chunkId);
    if (!metadata) {
      return null;
    }

    // CRITICAL FIX #3: Use cached prepared statement
    // Check if chunk exists in vec_chunks
    const exists = this._statements.chunkExists.get(chunkId);

    return {
      chunkId,
      metadata,
      hasEmbedding: !!exists,
    };
  }

  /**
   * Get metadata for a chunk
   * @private
   * @param {string} chunkId - Chunk identifier
   * @returns {Object|null} Metadata object or null if not found
   */
  _getMetadata(chunkId) {
    // CRITICAL FIX #3: Use cached prepared statement
    const row = this._statements.getMetadata.get(chunkId);

    if (!row) {
      return null;
    }

    return {
      vecRowid: row.vec_rowid,
      text: row.text,
      name: row.name,
      type: row.type,
      file: row.file,
      line: row.line,
      exported: row.exported === 1,
      layer: row.layer,
      contextBefore: row.contextBefore,
      contextAfter: row.contextAfter,
      updatedAt: row.updatedAt,
      chunkId,
    };
  }

  /**
   * Delete a chunk by ID
   * @param {string} chunkId - Chunk identifier
   * @returns {boolean} True if deleted, false if not found
   */
  delete(chunkId) {
    if (!this._initialized) {
      throw new Error('SqliteAdapter not initialized');
    }

    // CRITICAL FIX #3: Use cached prepared statements
    const transaction = this._db.transaction(() => {
      const result = this._statements.deleteChunkVec.run(chunkId);
      this._statements.deleteChunkMetadata.run(chunkId);

      return result.changes > 0;
    });

    return transaction();
  }

  /**
   * Get database statistics
   * @returns {Object} Statistics including chunk count, database size, etc.
   */
  getStats() {
    if (!this._initialized) {
      return {
        initialized: false,
        dbSizeBytes: 0,
      };
    }

    // Get database file size
    let dbSizeBytes = 0;
    try {
      dbSizeBytes = statSync(this._dbPath).size;
      // File doesn't exist or can't be read
    } catch {
      // Intentionally ignore - size will be 0
    }

    // CRITICAL FIX #3: Use cached prepared statement
    // Get chunk count from database
    const countResult = this._statements.countChunks.get();

    return {
      initialized: true,
      dbSizeBytes,
      chunkCount: countResult?.count || 0,
      dimension: this._dimension,
      dbPath: this._dbPath,
      storageType: 'sqlite',
    };
  }

  /**
   * Get all unique files from metadata
   * @returns {Array<string>} Array of unique file paths
   */
  getFiles() {
    if (!this._initialized) {
      return [];
    }

    const rows = this._statements.getFiles.all();
    return rows.map(row => row.file);
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

    const stmt = this._db.prepare('SELECT chunk_id FROM chunk_metadata WHERE file = ?');
    const rows = stmt.all(filePath);
    return rows.map(row => ({ chunkId: row.chunk_id }));
  }

  /**
   * Get file index state for incremental resume
   * @param {string} filePath - File path to check
   * @returns {Object|null} File index state {mtime, chunkCount, indexedAt, modelVersion} or null
   */
  getFileIndexState(filePath) {
    if (!this._initialized) {
      return null;
    }

    const row = this._statements.getFileIndex.get(filePath);
    if (!row) {
      return null;
    }

    return {
      mtime: row.mtime,
      chunkCount: row.chunk_count,
      indexedAt: row.indexed_at,
      modelVersion: row.model_version,
    };
  }

  /**
   * Update file index after successfully indexing a file
   * @param {string} filePath - File path that was indexed
   * @param {number} mtime - File modification time
   * @param {number} chunkCount - Number of chunks indexed
   * @param {string} modelVersion - Embedding model version
   */
  updateFileIndex(filePath, mtime, chunkCount, modelVersion) {
    if (!this._initialized) {
      console.warn(`[SqliteAdapter] Cannot update file index for ${filePath}: adapter not initialized`);
      return;
    }

    // Validate and sanitize modelVersion
    const version = typeof modelVersion === 'string' && modelVersion ? modelVersion : 'unknown';

    this._statements.upsertFileIndex.run(filePath, mtime, chunkCount, Date.now(), version);
  }

  /**
   * Remove file from index (when file is deleted or needs re-indexing)
   * @param {string} filePath - File path to remove
   */
  removeFileIndex(filePath) {
    if (!this._initialized) {
      return;
    }

    this._statements.removeFileIndex.run(filePath);
  }

  /**
   * Delete all chunks and metadata for a specific file (batch operation)
   * More efficient than calling delete() for each chunk individually
   * @param {string} filePath - File path to delete all chunks for
   */
  deleteChunksByFile(filePath) {
    if (!this._initialized) {
      return;
    }

    // Use cached prepared statements for parameter binding
    // Use transaction for atomic batch delete
    this._db.transaction(() => {
      this._statements.deleteVecChunksByFile.run(filePath);
      this._statements.deleteMetadataByFile.run(filePath);
    })();

    console.error(`[SqliteAdapter] Deleted all chunks for file: ${filePath}`);
  }

  /**
   * Get all file indexes for resume progress tracking
   * @returns {Array<Object>} Array of {file, mtime, chunkCount}
   */
  getAllFileIndexes() {
    if (!this._initialized) {
      return [];
    }

    const rows = this._statements.getAllFileIndexes.all();
    return rows.map(row => ({
      file: row.file,
      mtime: row.mtime,
      chunkCount: row.chunk_count,
    }));
  }

  /**
   * Clear the file index table (for force reindex)
   * This removes all file tracking entries to force a complete reindex
   */
  clearFileIndex() {
    if (!this._initialized) {
      return;
    }

    this._db.exec('DELETE FROM file_index');
    console.error('[SqliteAdapter] Cleared file_index table');
  }

  /**
   * Clear all data (file_index, vec_chunks, chunk_metadata)
   * Used for force reindex to start completely fresh
   * Wrapped in transaction for atomicity
   */
  clearAll() {
    if (!this._initialized) {
      return;
    }

    // Wrap in transaction to ensure all deletes succeed atomically
    this._db.transaction(() => {
      this._db.exec('DELETE FROM file_index');
      this._db.exec('DELETE FROM vec_chunks');
      this._db.exec('DELETE FROM chunk_metadata');
    })();
    console.error('[SqliteAdapter] Cleared all tables (file_index, vec_chunks, chunk_metadata)');
  }

  /**
   * Close the database connection
   * CRITICAL FIX #3: Finalize prepared statements to prevent memory leaks
   */
  close() {
    if (this._db) {
      // Finalize all prepared statements before closing
      if (this._statements) {
        for (const [name, statement] of Object.entries(this._statements)) {
          try {
            if (statement && typeof statement.finalize === 'function') {
              statement.finalize();
            }
          } catch (finalizeError) {
            console.warn(
              `[SqliteAdapter] Failed to finalize statement ${name}:`,
              finalizeError.message
            );
          }
        }
        this._statements = null;
      }

      this._db.close();
      this._db = null;
      this._initialized = false;
      console.error('[SqliteAdapter] Database connection closed');
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
export default SqliteVectorAdapter;
