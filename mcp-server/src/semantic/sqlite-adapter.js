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
import { statSync } from 'fs';

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

    // Create database connection
    this._db = new Database(dbPath);

    // Load sqlite-vec extension
    const extPath = getLoadablePath();
    this._db.loadExtension(extPath);

    console.log(`[SqliteAdapter] Loaded sqlite-vec extension from: ${extPath}`);

    // Create vec0 virtual tables
    this._createTables();

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

    // Use a transaction for atomic upsert
    const transaction = this._db.transaction(() => {
      // Insert or replace embedding
      const insertEmbedding = this._db.prepare(
        'INSERT OR REPLACE INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)'
      );
      insertEmbedding.run(chunkId, embedding);

      // Insert or replace metadata
      const insertMetadata = this._db.prepare(`
        INSERT OR REPLACE INTO chunk_metadata (
          chunk_id, text, name, type, file, line, exported,
          layer, context_before, context_after, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertMetadata.run(
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

    transaction();
  }

  /**
   * KNN search using cosine similarity
   *
   * Uses a subquery approach to find nearest neighbors by computing
   * cosine distance between query embedding and all stored embeddings.
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

    // Build WHERE clause for filters
    const conditions = [];
    const params = [];

    if (filters.chunkType) {
      conditions.push('m.type = ?');
      params.push(filters.chunkType);
    }

    if (filters.exportedOnly) {
      conditions.push('m.exported = 1');
    }

    if (filters.layer) {
      conditions.push('m.layer = ?');
      params.push(filters.layer);
    }

    const whereClause = conditions.length > 0
      ? 'AND ' + conditions.join(' AND ')
      : '';

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
        ${whereClause}
      ORDER BY v.distance
      LIMIT ?
    `;

    const stmt = this._db.prepare(query);
    const rows = stmt.all(queryEmbedding, maxDistance, ...params, limit);

    // Convert results to expected format
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
        results.push({
          chunkId: row.chunk_id,
          similarity,
          metadata,
        });
      }
    }

    return results;
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

    // Check if chunk exists in vec_chunks
    const exists = this._db.prepare(
      'SELECT 1 FROM vec_chunks WHERE chunk_id = ?'
    ).get(chunkId);

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
    const row = this._db.prepare(`
      SELECT
        text, name, type, file, line, exported,
        layer, context_before as contextBefore, context_after as contextAfter,
        updated_at as updatedAt
      FROM chunk_metadata
      WHERE chunk_id = ?
    `).get(chunkId);

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

    const transaction = this._db.transaction(() => {
      const result = this._db.prepare(
        'DELETE FROM vec_chunks WHERE chunk_id = ?'
      ).run(chunkId);

      this._db.prepare(
        'DELETE FROM chunk_metadata WHERE chunk_id = ?'
      ).run(chunkId);

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

    // Get chunk count from database
    const countResult = this._db.prepare(
      'SELECT COUNT(*) as count FROM vec_chunks'
    ).get();

    return {
      initialized: true,
      dbSizeBytes,
      chunkCount: countResult?.count || 0,
      dimension: this._dimension,
      dbPath: this._dbPath,
    };
  }

  /**
   * Close the database connection
   */
  close() {
    if (this._db) {
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
