/**
 * Embedding Cache
 *
 * Provides persistent caching for embeddings and indexed data.
 * Tracks file modification times to invalidate stale cache entries.
 */

import { mkdir, readFile, writeFile, stat, readdir, rename, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Current cache format version
 */
const CACHE_VERSION = 1;

/**
 * Default cache filename
 */
const DEFAULT_CACHE_FILE = 'semantic-embeddings.json';

/**
 * Embedding Cache class
 */
export class EmbeddingCache {
  constructor(cacheDir, options = {}) {
    this.cacheDir = cacheDir;
    this.cacheFile = join(cacheDir, options.cacheFile || DEFAULT_CACHE_FILE);
    this.enabled = options.enabled !== false;
    this.compression = options.compression === true;

    // In-memory cache (not LRU - full cache until invalidated)
    this.files = new Map();       // filePath -> { mtime, chunks[] }
    this.embeddings = new HybridEmbeddingMap();

    this.loaded = false;
    this.dirty = false;
    this._saveLock = null;  // Concurrency control for save()
  }

  /**
   * Initialize cache (load from disk if available)
   */
  async initialize() {
    if (!this.enabled) {
      console.error('[Cache] Embedding cache disabled');
      return false;
    }

    // Ensure cache directory exists
    try {
      await mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      console.error('[Cache] Failed to create cache directory:', error.message);
      return false;
    }

    // Try to load existing cache
    const loaded = await this.load();
    if (loaded) {
      console.error(`[Cache] Loaded cache from ${this.cacheFile}`);
    } else {
      console.error('[Cache] No valid cache found, starting fresh');
    }

    this.loaded = true;
    return true;
  }

  /**
   * Load cache from disk
   */
  async load() {
    if (!existsSync(this.cacheFile)) {
      return false;
    }

    try {
      const data = JSON.parse(await readFile(this.cacheFile, 'utf-8'));

      // Validate version - delete old cache on mismatch
      if (data.version !== CACHE_VERSION) {
        console.error(`[Cache] Cache version mismatch: ${data.version} vs ${CACHE_VERSION}, deleting old cache`);
        await unlink(this.cacheFile).catch(() => {}); // Best effort delete
        return false;
      }

      // Restore files
      if (data.files) {
        for (const [file, info] of Object.entries(data.files)) {
          this.files.set(file, info);
        }
      }

      // Restore embeddings
      if (data.embeddings) {
        for (const [chunkId, chunkData] of Object.entries(data.embeddings)) {
          // Convert embedding array back to Float32Array if present
          if (chunkData.embedding && Array.isArray(chunkData.embedding)) {
            chunkData.embedding = new Float32Array(chunkData.embedding);
          }
          this.embeddings.set(chunkId, chunkData);
        }
      }

      return true;
    } catch (error) {
      console.error('[Cache] Failed to load cache:', error.message);
      return false;
    }
  }

  /**
   * Save cache to disk
   */
  async save() {
    if (!this.enabled || !this.dirty) {
      return false;
    }

    // Acquire lock
    while (this._saveLock) {
      await this._saveLock;
    }

    let resolveLock;
    this._saveLock = new Promise(resolve => { resolveLock = resolve; });

    try {
      const data = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        files: {},
        embeddings: {}
      };

      // CRITICAL: Create snapshots while holding lock
      // This prevents concurrent modifications during serialization
      const filesSnapshot = new Map(this.files.entries());
      const embeddingsSnapshot = new Map(this.embeddings.entries());

      // Serialize snapshots
      for (const [file, info] of filesSnapshot.entries()) {
        data.files[file] = info;
      }

      for (const [chunkId, embData] of embeddingsSnapshot.entries()) {
        data.embeddings[chunkId] = embData;
      }

      // Write to temp file first, then rename for atomicity
      const tempFile = this.cacheFile + '.tmp';
      await writeFile(tempFile, JSON.stringify(data), 'utf-8');

      // Rename (atomic on most systems)
      await rename(tempFile, this.cacheFile);

      this.dirty = false;
      console.error(`[Cache] Saved cache (${Object.keys(data.embeddings).length} chunks)`);
      return true;
    } catch (error) {
      console.error('[Cache] Failed to save cache:', error.message);
      return false;
    } finally {
      this._saveLock = null;
      resolveLock();
    }
  }

  /**
   * Check if a file's cache is valid
   */
  async isFileValid(filePath) {
    const cached = this.files.get(filePath);
    if (!cached) {
      return false;
    }

    try {
      const stats = await stat(filePath);
      return stats.mtimeMs <= cached.mtime;
    } catch {
      return false;
    }
  }

  /**
   * Check cache validity for multiple files
   */
  async checkFilesValid(filePaths) {
    const results = new Map();

    for (const filePath of filePaths) {
      results.set(filePath, await this.isFileValid(filePath));
    }

    return results;
  }

  /**
   * Get chunks for a file
   */
  getFileChunks(filePath) {
    const cached = this.files.get(filePath);
    return cached ? cached.chunks || [] : [];
  }

  /**
   * Get embedding data for a chunk
   */
  getChunk(chunkId) {
    return this.embeddings.get(chunkId);
  }

  /**
   * Get embedding vector for a chunk
   * @param {string} chunkId - Chunk ID
   * @returns {Float32Array|null} Embedding vector or null if not cached
   */
  getChunkEmbedding(chunkId) {
    const chunk = this.embeddings.get(chunkId);
    return chunk?.embedding || null;
  }

  /**
   * Get multiple chunks
   */
  getChunks(chunkIds) {
    const results = [];
    for (const id of chunkIds) {
      const chunk = this.embeddings.get(id);
      if (chunk) {
        results.push({ chunkId: id, ...chunk });
      }
    }
    return results;
  }

  /**
   * Store chunks for a file
   * @param {string} filePath - Relative file path
   * @param {Array} chunks - Array of chunk objects with {id, text, type, name, metadata}
   * @param {number} fileMtime - File modification time
   * @param {Array<Float32Array>} embeddings - Array of embedding vectors (one per chunk)
   */
  async storeFileChunks(filePath, chunks, fileMtime, embeddings = []) {
    const chunkIds = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      chunkIds.push(chunk.id);

      // Store chunk data WITH embedding
      this.embeddings.set(chunk.id, {
        text: chunk.text,
        type: chunk.type,
        name: chunk.name,
        metadata: chunk.metadata,
        embedding: embeddings[i] ? Array.from(embeddings[i]) : null // Convert Float32Array to plain array for JSON serialization
      });
    }

    // Store file info
    this.files.set(filePath, {
      mtime: fileMtime,
      chunks: chunkIds,
      chunkCount: chunkIds.length
    });

    this.dirty = true;
  }

  /**
   * Invalidate a file's cache
   */
  invalidateFile(filePath) {
    const cached = this.files.get(filePath);
    if (cached) {
      // Remove chunk data
      for (const chunkId of cached.chunks) {
        this.embeddings.delete(chunkId);
      }

      // Remove file entry
      this.files.delete(filePath);
      this.dirty = true;
    }
  }

  /**
   * Invalidate multiple files
   */
  invalidateFiles(filePaths) {
    for (const filePath of filePaths) {
      this.invalidateFile(filePath);
    }
  }

  /**
   * Get all cached file paths
   */
  getCachedFiles() {
    return Array.from(this.files.keys());
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let totalChunks = 0;
    let totalSize = 0;

    for (const file of this.files.values()) {
      totalChunks += file.chunks?.length || 0;
    }

    for (const emb of this.embeddings.values()) {
      // Count text size
      totalSize += emb.text?.length || 0;
      // Count embedding size (768 floats × 4 bytes per float)
      if (emb.embedding && emb.embedding.length > 0) {
        totalSize += emb.embedding.length * 4; // Float32Array = 4 bytes per element
      }
    }

    return {
      fileCount: this.files.size,
      chunkCount: totalChunks,
      approximateSize: totalSize,
      dirty: this.dirty
    };
  }

  /**
   * Clear all cache
   */
  clear() {
    this.files.clear();
    this.embeddings.clear();
    this.dirty = true;
  }

  /**
   * Delete cache file
   */
  async delete() {
    this.clear();
    try {
      if (existsSync(this.cacheFile)) {
        await unlink(this.cacheFile);
      }
    } catch (error) {
      console.error('[Cache] Failed to delete cache file:', error.message);
    }
  }
}

/**
 * Hybrid embedding map that handles Float32Array serialization
 */
class HybridEmbeddingMap {
  constructor() {
    this.map = new Map();
  }

  set(key, value) {
    this.map.set(key, value);
  }

  get(key) {
    return this.map.get(key);
  }

  has(key) {
    return this.map.has(key);
  }

  delete(key) {
    return this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  entries() {
    return this.map.entries();
  }

  values() {
    return this.map.values();
  }

  keys() {
    return this.map.keys();
  }

  *[Symbol.iterator]() {
    for (const [key, value] of this.map.entries()) {
      yield [key, value];
    }
  }

  get size() {
    return this.map.size;
  }
}

export default EmbeddingCache;
