/**
 * Embedding Cache
 *
 * Provides persistent caching for embeddings and indexed data.
 * Tracks file modification times to invalidate stale cache entries.
 * Tracks model version to invalidate cache when embedding model changes.
 */

import { mkdir, readFile, writeFile, stat, readdir, rename, unlink, open } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Current cache format version
 * Increment this when cache structure changes incompatibly
 */
const CACHE_VERSION = 2;  // Bumped from 1 to 2 for modelVersion tracking

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

    // Model version tracking for cache invalidation
    this.modelVersion = options.modelVersion || null;

    this.loaded = false;
    this.dirty = false;
    this._saveLock = null;  // Concurrency control for save()

    // Save statistics for monitoring and debugging
    this.stats = {
      savesSucceeded: 0,
      savesSkipped: 0,  // Track no-op saves (when dirty=false)
      savesFailed: 0,
      lastSaveError: null,
      lastSaveTime: null,
      lastSaveTimestamp: null
    };
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

    // Clean up stale temp files from previous interrupted saves
    try {
      const tempFile = this.cacheFile + '.tmp';
      if (existsSync(tempFile)) {
        console.warn('[Cache] Found stale temp file, cleaning up:', tempFile);
        await unlink(tempFile).catch(() => {});
      }
    } catch (error) {
      // Ignore cleanup errors
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

      // Validate model version - invalidate cache if embedding model changed
      // This ensures embeddings from different models aren't mixed
      if (this.modelVersion !== null && data.modelVersion !== undefined) {
        if (data.modelVersion !== this.modelVersion) {
          console.error(`[Cache] Model version mismatch: cache has "${data.modelVersion}" but current is "${this.modelVersion}", deleting old cache`);
          await unlink(this.cacheFile).catch(() => {}); // Best effort delete
          return false;
        }
      }

      // Store loaded model version for reference
      if (data.modelVersion !== undefined) {
        this.modelVersion = data.modelVersion;
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
          // Validate and convert embedding to Float32Array
          if (chunkData.embedding) {
            if (Array.isArray(chunkData.embedding)) {
              // Standard array format - convert to Float32Array
              chunkData.embedding = new Float32Array(chunkData.embedding);
            } else if (typeof chunkData.embedding === 'object' && !Array.isArray(chunkData.embedding)) {
              // Corrupted cache: object with numeric keys instead of array
              console.error(`[Cache] Skipping corrupted embedding for ${chunkId}: has object with numeric keys`);
              delete data.embeddings[chunkId];  // Remove corrupted entry
              continue;  // Skip this chunk
            } else if (chunkData.embedding instanceof Float32Array) {
              // Already Float32Array (shouldn't happen from JSON but handle it)
              // Already in correct format, nothing to do
            } else {
              console.warn(`[Cache] Unexpected embedding type for ${chunkId}: ${typeof chunkData.embedding}`);
              delete data.embeddings[chunkId];
              continue;
            }
          }
          this.embeddings.set(chunkId, chunkData);
        }
      }

      return true;
    } catch (error) {
      console.error('[Cache] Failed to load cache:', error.message);

      // FIX #4: Cache corruption recovery
      // Move corrupted file for analysis instead of deleting
      if (existsSync(this.cacheFile)) {
        // Add random suffix to prevent collisions
        const backupFile = this.cacheFile + `.corrupted.${Date.now()}.${Math.random().toString(36).slice(2)}`;
        try {
          await rename(this.cacheFile, backupFile);
          console.error('[Cache] Backed up corrupted cache to:', backupFile);

          // Clean up old backups (keep only last 5)
          await this._cleanupOldBackups();
        } catch (renameError) {
          console.error('[Cache] Failed to backup corrupted cache:', renameError.message);
          // Try to delete if backup fails
          await unlink(this.cacheFile).catch(() => {});
        }
      }

      return false;
    }
  }

  /**
   * Clean up old corrupted backup files
   * Keeps only the 5 most recent backups to prevent disk space exhaustion
   */
  async _cleanupOldBackups() {
    try {
      const files = await readdir(this.cacheDir);
      const backups = files
        .filter(f => f.includes('semantic-embeddings.json.corrupted.'))
        .map(f => ({
          name: f,
          path: join(this.cacheDir, f),
          time: parseInt(f.split('.').pop()) || 0
        }))
        .sort((a, b) => b.time - a.time);  // Newest first

      // Keep only last 5 backups
      const toDelete = backups.slice(5);
      for (const backup of toDelete) {
        await unlink(backup.path);
        console.error('[Cache] Deleted old backup:', backup.name);
      }
    } catch (error) {
      console.error('[Cache] Failed to cleanup old backups:', error.message);
    }
  }

  /**
   * Sanitize error messages to prevent leaking sensitive information
   * Removes file paths, API keys, passwords, and truncates long messages
   */
  _sanitizeErrorMessage(message) {
    if (!message || typeof message !== 'string') {
      return 'Unknown error';
    }

    let sanitized = message;

    // Remove file paths (Unix and Windows)
    sanitized = sanitized.replace(/\/[^\s"']+/g, '[PATH]');
    sanitized = sanitized.replace(/\\[^\s"']+/g, '[PATH]');

    // Remove potential API keys (basic patterns)
    sanitized = sanitized.replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED]');
    sanitized = sanitized.replace(/api[_-]?key["\s=:]+[^\s"']+/gi, 'api_key=[REDACTED]');
    sanitized = sanitized.replace(/bearer[a-z\s=:]+[a-zA-Z0-9._-]{20,}/gi, 'bearer [REDACTED]');

    // Remove passwords
    sanitized = sanitized.replace(/password["\s=:]+[^\s"']+/gi, 'password=[REDACTED]');
    sanitized = sanitized.replace(/pwd["\s=:]+[^\s"']+/gi, 'pwd=[REDACTED]');
    sanitized = sanitized.replace(/passwd["\s=:]+[^\s"']+/gi, 'passwd=[REDACTED]');

    // Remove tokens
    sanitized = sanitized.replace(/token["\s=:]+[a-zA-Z0-9._-]{20,}/gi, 'token=[REDACTED]');

    // Truncate long messages
    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 200) + '...';
    }

    return sanitized;
  }

  /**
   * Save cache to disk with validation, retry logic, and error tracking
   *
   * Implements:
   * - JSON validation before atomic rename (fix #1)
   * - Retry logic with exponential backoff (fix #2)
   * - Detailed error tracking and statistics (fix #3, #5)
   * - Lock acquired before dirty check (fixes race condition)
   *
   * @param {number} maxRetries - Maximum number of retry attempts (default: 3, max: 10)
   * @returns {Promise<boolean>} True if save succeeded, false if disabled or not dirty
   * @throws {Error} If all retry attempts fail
   */
  async save(maxRetries = 3) {
    // FIX #12: Validate maxRetries parameter
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new Error(`maxRetries must be a non-negative integer, got: ${maxRetries}`);
    }
    if (maxRetries > 10) {
      console.warn(`[Cache] WARNING: maxRetries=${maxRetries} is unusually high, capping at 10`);
      maxRetries = 10;
    }

    // CRITICAL FIX: Acquire lock BEFORE checking dirty flag
    // This prevents race condition where multiple saves think dirty=true
    while (this._saveLock) {
      await this._saveLock;
    }

    let resolveLock;
    this._saveLock = new Promise(resolve => { resolveLock = resolve; });

    const startTime = Date.now();

    try {
      // Now check dirty flag while holding lock
      if (!this.enabled || !this.dirty) {
        this.stats.savesSkipped = (this.stats.savesSkipped || 0) + 1;
        return false;
      }

      const data = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        modelVersion: this.modelVersion,  // Track embedding model for cache invalidation
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

      // FIX #2: Retry logic with exponential backoff
      let lastError;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Write to temp file first, then rename for atomicity
          const tempFile = this.cacheFile + '.tmp';
          await writeFile(tempFile, JSON.stringify(data), 'utf-8');

          // FIX #1: Validate JSON before renaming
          // This ensures we only rename valid, complete JSON files
          const written = await readFile(tempFile, 'utf-8');
          JSON.parse(written);  // Will throw if invalid

          // CRITICAL: Sync to disk to ensure data is actually written
          // Without this, the rename can happen before data is flushed, causing data loss
          const handle = await open(tempFile, 'r');
          try {
            await handle.datasync();  // Sync data + metadata to disk
          } finally {
            await handle.close();
          }

          // Rename (atomic on most systems)
          await rename(tempFile, this.cacheFile);

          // Success!
          this.dirty = false;

          // FIX #5: Track success statistics
          const saveTime = Date.now() - startTime;
          this.stats.savesSucceeded++;
          this.stats.lastSaveError = null;
          this.stats.lastSaveTime = saveTime;
          this.stats.lastSaveTimestamp = new Date().toISOString();

          console.error(`[Cache] Saved cache (${Object.keys(data.embeddings).length} chunks, ${saveTime}ms${attempt > 0 ? `, attempt ${attempt + 1}` : ''})`);
          return true;

        } catch (error) {
          lastError = error;

          // Skip retries for errors that won't resolve with retrying
          // ENOSPC: Disk full - retrying won't help
          // EACCES/EPERM: Permission denied - retrying won't help
          if (error.code === 'ENOSPC' || error.code === 'EACCES' || error.code === 'EPERM') {
            console.error(`[Cache] Fatal error (${error.code}), skipping retries:`, error.message);
            break;
          }

          // If this is the last attempt, don't wait
          if (attempt === maxRetries - 1) {
            break;
          }

          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt) * 1000;
          console.error(`[Cache] Save attempt ${attempt + 1} failed: ${error.message}, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // All retries failed
      const saveTime = Date.now() - startTime;

      // FIX #3 & #5: Propagate errors and track failure statistics
      this.stats.savesFailed++;
      this.stats.lastSaveError = {
        message: this._sanitizeErrorMessage(lastError.message),
        code: lastError.code,
        name: lastError.name,
        time: new Date().toISOString()
      };
      this.stats.lastSaveTime = saveTime;
      this.stats.lastSaveTimestamp = new Date().toISOString();

      console.error(`[Cache] Failed to save cache after ${maxRetries} attempts (${saveTime}ms):`, lastError.message);

      // FIX #3: Throw error instead of silent failure
      throw new Error(`Cache save failed after ${maxRetries} attempts: ${lastError.message}`);

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
    const embedding = chunk?.embedding;

    // Handle null/undefined
    if (embedding === null || embedding === undefined) {
      return null;
    }

    // Already Float32Array - return as-is
    if (embedding instanceof Float32Array) {
      return embedding;
    }

    // Convert Array to Float32Array
    if (Array.isArray(embedding)) {
      return new Float32Array(embedding);
    }

    // Detect corruption: Object with numeric keys (from old/broken cache)
    if (typeof embedding === 'object' && !Array.isArray(embedding)) {
      console.error(`[Cache] Corrupted embedding detected for ${chunkId}: has object with numeric keys instead of Array/Float32Array`);
      // Invalidate and remove corrupted entry
      this.invalidateChunk(chunkId);
      return null;
    }

    // Unknown type - log error and return null
    console.error(`[Cache] Invalid embedding type for ${chunkId}: ${typeof embedding}`);
    return null;
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
      dirty: this.dirty,
      modelVersion: this.modelVersion
    };
  }

  /**
   * Set the model version (for cache invalidation)
   * Call this when the embedding model changes to invalidate existing cache
   */
  setModelVersion(modelVersion) {
    if (this.modelVersion !== modelVersion) {
      console.error(`[Cache] Model version changing from "${this.modelVersion}" to "${modelVersion}", clearing cache`);
      this.modelVersion = modelVersion;
      this.clear();  // Clear cache to prevent mixing embeddings from different models
    }
  }

  /**
   * Get the current model version
   */
  getModelVersion() {
    return this.modelVersion;
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
