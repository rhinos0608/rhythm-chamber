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
      console.log(`[SqliteAdapter] Ensured directory exists: ${parentDir}`);
    } catch (mkdirError) {
      // Directory might already exist or creation failed - try to continue
      console.warn(`[SqliteAdapter] Directory creation warning: ${mkdirError.message}`);
    }

    // Create database connection
    this._db = new Database(dbPath);

    // Load sqlite-vec extension
    const extPath = getLoadablePath();
    this._db.loadExtension(extPath);

    console.log(`[SqliteAdapter] Loaded sqlite-vec extension from: ${extPath}`);

    // Create vec0 virtual tables
    this._createTables();

    // CRITICAL FIX #3: Prepare and cache statements for reuse
    this._prepareStatements();

    this._initialized = true;
    console.log(`[SqliteAdapter] Initialized: ${dbPath} (dimension: ${dimension})`);
  }

  /**
   * Create vec0 virtual tables for vector storage
   * @private
   */
  _createTables() {
    // Create main vec0 table for vector storage (IF NOT EXISTS for persistence)
    this._db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        chunk_id TEXT PRIMARY KEY,
        embedding FLOAT[${this._dimension}]
      );
    `);

    // Create metadata table (separate because vec0 doesn't support complex metadata)
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS chunk_metadata (
        chunk_id TEXT PRIMARY KEY,
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

    console.log('[SqliteAdapter] Created vec0 tables');
  }

  /**
   * Prepare and cache SQL statements for reuse
   * CRITICAL FIX #3: Prevents statement leak and improves performance
   * @private
   */
  _prepareStatements() {
    this._statements = {
      // Upsert statements
      deleteEmbedding: this._db.prepare('DELETE FROM vec_chunks WHERE chunk_id = ?'),
      insertEmbedding: this._db.prepare(
        'INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)'
      ),
      deleteMetadata: this._db.prepare('DELETE FROM chunk_metadata WHERE chunk_id = ?'),
      insertMetadata: this._db.prepare(`
        INSERT INTO chunk_metadata (
          chunk_id, text, name, type, file, line, exported,
          layer, context_before, context_after, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      // Get statements
      getMetadata: this._db.prepare(`
        SELECT
          text, name, type, file, line, exported,
          layer, context_before as contextBefore, context_after as contextAfter,
          updated_at as updatedAt
        FROM chunk_metadata
        WHERE chunk_id = ?
      `),
      chunkExists: this._db.prepare('SELECT 1 FROM vec_chunks WHERE chunk_id = ?'),

      // Delete statements
      deleteChunkVec: this._db.prepare('DELETE FROM vec_chunks WHERE chunk_id = ?'),
      deleteChunkMetadata: this._db.prepare('DELETE FROM chunk_metadata WHERE chunk_id = ?'),

      // Stats statements
      countChunks: this._db.prepare('SELECT COUNT(*) as count FROM vec_chunks'),

      // Get files statement
      getFiles: this._db.prepare(
        'SELECT DISTINCT file FROM chunk_metadata WHERE file IS NOT NULL ORDER BY file'
      ),
    };

    console.log('[SqliteAdapter] Prepared and cached SQL statements');
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
    const query = `
      SELECT
        v.chunk_id,
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
          chunk_id,
          vec_distance_cosine(embedding, ?) as distance
        FROM vec_chunks
      ) v
      LEFT JOIN chunk_metadata m ON v.chunk_id = m.chunk_id
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
      console.log('[SqliteAdapter] Database connection closed');
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
