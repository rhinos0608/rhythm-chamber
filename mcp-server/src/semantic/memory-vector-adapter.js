/**
 * Memory Vector Adapter
 *
 * Provides in-memory vector storage using JavaScript Maps.
 * This is a pure JavaScript fallback when SQLite native modules fail.
 *
 * Implements the same interface as SqliteVectorAdapter for seamless swapping.
 *
 * Trade-offs vs SQLite:
 * - ✅ No native dependencies (works everywhere)
 * - ✅ Fast startup (no DB initialization)
 * - ❌ No persistence (data lost on restart)
 * - ❌ Higher memory usage (all vectors in RAM)
 * - ❌ Slower search for large datasets (O(n) vs SQLite's vec0)
 *
 * Best for:
 * - Development environments with native module issues
 * - Smaller codebases (< 10k chunks)
 * - CI/CD environments where compilation is problematic
 */

import { cosineSimilarity } from './embeddings.js';
import { passesFilters as sharedPassesFilters } from './filters.js';

/**
 * Default embedding dimension (nomic-embed-text-v1.5)
 */
const DEFAULT_DIM = 768;

/**
 * Memory Vector Adapter class
 *
 * Pure JavaScript implementation of vector storage with cosine similarity search.
 */
export class MemoryVectorAdapter {
  constructor() {
    this._vectors = new Map(); // chunkId -> Float32Array
    this._metadata = new Map(); // chunkId -> metadata object
    this._dimension = DEFAULT_DIM;
    this._initialized = false;
    this._dbPath = null; // For API compatibility (not used for storage)
    this.type = 'memory'; // Type identifier for adapter detection
  }

  /**
   * Initialize the memory adapter
   * @param {string} dbPath - Path for API compatibility (ignored, data is in-memory)
   * @param {number} dimension - Embedding dimension (default: 768)
   */
  initialize(dbPath, dimension = DEFAULT_DIM) {
    if (this._initialized) {
      console.warn('[MemoryAdapter] Already initialized, skipping');
      return;
    }

    this._dbPath = dbPath;
    this._dimension = dimension;
    this._initialized = true;

    console.log(`[MemoryAdapter] Initialized (dimension: ${dimension}, in-memory only)`);
  }

  /**
   * Insert or update a chunk with embedding and metadata
   * @param {string} chunkId - Unique chunk identifier
   * @param {Float32Array|Array} embedding - Embedding vector
   * @param {Object} metadata - Chunk metadata
   * @throws {Error} If adapter is not initialized
   * @throws {Error} If chunkId is invalid
   * @throws {Error} If embedding dimension doesn't match
   */
  upsert(chunkId, embedding, metadata = {}) {
    if (!this._initialized) {
      throw new Error('MemoryAdapter not initialized');
    }

    // Validate chunkId
    if (typeof chunkId !== 'string' || chunkId.length === 0) {
      throw new Error(
        `Invalid chunkId: expected non-empty string, got ${typeof chunkId}`
      );
    }

    // Convert embedding to Float32Array if needed
    if (!(embedding instanceof Float32Array)) {
      embedding = new Float32Array(embedding);
    }

    // Validate dimension
    if (embedding.length !== this._dimension) {
      throw new Error(
        `Embedding dimension mismatch for ${chunkId}: ` +
        `expected ${this._dimension} dimensions, got ${embedding.length}`
      );
    }

    // Store vector and metadata
    this._vectors.set(chunkId, embedding);
    this._metadata.set(chunkId, {
      ...metadata,
      chunkId,
      updatedAt: Date.now(),
    });
  }

  /**
   * KNN search using cosine similarity
   *
   * Performs brute-force cosine similarity search across all stored vectors.
   * Time complexity: O(n) where n = number of chunks
   *
   * @param {Float32Array|Array} queryEmbedding - Query embedding vector
   * @param {Object} options - Search options
   * @returns {Array} Search results with chunkId, similarity, and metadata
   */
  search(queryEmbedding, options = {}) {
    if (!this._initialized) {
      throw new Error('MemoryAdapter not initialized');
    }

    const { limit = 10, threshold = 0.3, filters = {} } = options;

    // Convert query embedding to Float32Array if needed
    if (!(queryEmbedding instanceof Float32Array)) {
      queryEmbedding = new Float32Array(queryEmbedding);
    }

    // Validate dimension
    if (queryEmbedding.length !== this._dimension) {
      throw new Error(
        `Query embedding dimension (${queryEmbedding.length}) does not match ` +
        `adapter dimension (${this._dimension})`
      );
    }

    const results = [];

    // Brute-force search: compute cosine similarity for all vectors
    for (const [chunkId, vector] of this._vectors.entries()) {
      const metadata = this._metadata.get(chunkId);

      // Apply filters using shared utility (consistency with SQLite version)
      if (!sharedPassesFilters(metadata, filters)) {
        continue;
      }

      // Calculate cosine similarity
      const similarity = cosineSimilarity(queryEmbedding, vector);

      if (similarity >= threshold) {
        results.push({
          chunkId,
          similarity,
          metadata,
        });
      }
    }

    // Sort by similarity (descending)
    results.sort((a, b) => b.similarity - a.similarity);

    // Return top results
    return results.slice(0, limit);
  }

  /**
   * Get a chunk by ID with metadata
   * @param {string} chunkId - Chunk identifier
   * @returns {Object|null} Chunk data with metadata, or null if not found
   */
  get(chunkId) {
    if (!this._initialized) {
      throw new Error('MemoryAdapter not initialized');
    }

    const metadata = this._metadata.get(chunkId);
    if (!metadata) {
      return null;
    }

    // Note: We don't return the vector here to match SQLite adapter behavior
    // The vector is stored but get() only returns metadata
    return {
      chunkId,
      metadata,
      hasEmbedding: this._vectors.has(chunkId),
    };
  }

  /**
   * Delete a chunk by ID
   * @param {string} chunkId - Chunk identifier
   * @returns {boolean} True if deleted, false if not found
   */
  delete(chunkId) {
    if (!this._initialized) {
      throw new Error('MemoryAdapter not initialized');
    }

    const hadVector = this._vectors.has(chunkId);
    this._vectors.delete(chunkId);
    this._metadata.delete(chunkId);

    return hadVector;
  }

  /**
   * Get database statistics
   * @returns {Object} Statistics including chunk count
   */
  getStats() {
    if (!this._initialized) {
      return {
        initialized: false,
        dbSizeBytes: 0,
      };
    }

    // Estimate memory usage
    const vectorBytes = this._vectors.size * this._dimension * 4; // Float32 = 4 bytes
    const metadataBytes = this._metadata.size * 500; // Rough estimate

    return {
      initialized: true,
      dbSizeBytes: vectorBytes + metadataBytes, // Virtual "size" for compatibility
      chunkCount: this._vectors.size,
      dimension: this._dimension,
      dbPath: this._dbPath,
      storageType: 'memory',
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

    const files = new Set();

    for (const metadata of this._metadata.values()) {
      if (metadata.file) {
        files.add(metadata.file);
      }
    }

    return Array.from(files).sort();
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

    const chunks = [];

    for (const [chunkId, metadata] of this._metadata.entries()) {
      if (metadata.file === filePath) {
        chunks.push({ chunkId });
      }
    }

    return chunks;
  }

  /**
   * Close the adapter and free memory
   * Clears all stored vectors and metadata
   */
  close() {
    this._vectors.clear();
    this._metadata.clear();
    this._initialized = false;
    console.log('[MemoryAdapter] Closed and cleared all data');
  }

  /**
   * Clear all data without closing
   * Useful for resetting state while keeping adapter initialized
   */
  clear() {
    this._vectors.clear();
    this._metadata.clear();
  }

  /**
   * Check if adapter is initialized
   */
  get isInitialized() {
    return this._initialized;
  }

  /**
   * Get database path (for API compatibility)
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

  /**
   * Get file index state for incremental resume (stub for API compatibility)
   * Memory adapter doesn't persist, so always returns null
   * @param {string} filePath - File path to check
   * @returns {null} Always null (no persistent state)
   */
  getFileIndexState(filePath) {
    // Memory adapter doesn't persist file index state
    // Returning null ensures files will always be re-indexed
    return null;
  }

  /**
   * Update file index after successfully indexing a file (stub for API compatibility)
   * Memory adapter doesn't persist, so this is a no-op
   * @param {string} filePath - File path that was indexed
   * @param {number} mtime - File modification time
   * @param {number} chunkCount - Number of chunks indexed
   * @param {string} modelVersion - Embedding model version
   */
  updateFileIndex(filePath, mtime, chunkCount, modelVersion) {
    // No-op for memory adapter (no persistence)
    // File index is only useful for incremental resume across restarts
  }

  /**
   * Remove file from index (stub for API compatibility)
   * @param {string} filePath - File path to remove
   */
  removeFileIndex(filePath) {
    // No-op for memory adapter
  }

  /**
   * Get all file indexes (stub for API compatibility)
   * @returns {Array} Empty array (no persistent state)
   */
  getAllFileIndexes() {
    // Memory adapter doesn't track file index state
    return [];
  }

  /**
   * Delete all chunks for a specific file (batch operation)
   * More efficient than calling delete() for each chunk individually
   * @param {string} filePath - File path to delete all chunks for
   */
  deleteChunksByFile(filePath) {
    if (!this._initialized) {
      return;
    }

    const chunksToDelete = [];
    for (const [chunkId, metadata] of this._metadata.entries()) {
      if (metadata.file === filePath) {
        chunksToDelete.push(chunkId);
      }
    }

    for (const chunkId of chunksToDelete) {
      this._vectors.delete(chunkId);
      this._metadata.delete(chunkId);
    }

    if (chunksToDelete.length > 0) {
      console.log(`[MemoryAdapter] Deleted ${chunksToDelete.length} chunks for file: ${filePath}`);
    }
  }

  /**
   * Clear the file index (stub for API compatibility)
   */
  clearFileIndex() {
    // No-op for memory adapter
  }

  /**
   * Clear all data (file_index, vectors, metadata)
   * Used for force reindex to start completely fresh
   */
  clearAll() {
    this._vectors.clear();
    this._metadata.clear();
    console.log('[MemoryAdapter] Cleared all data');
  }
}

/**
 * Default export
 */
export default MemoryVectorAdapter;
