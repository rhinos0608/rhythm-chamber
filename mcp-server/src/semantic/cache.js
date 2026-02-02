/**
 * Embedding Cache
 *
 * Provides persistent caching for embeddings and indexed data.
 * Tracks file modification times to invalidate stale cache entries.
 * Tracks model version to invalidate cache when embedding model changes.
 */

import { mkdir, readFile, stat, readdir, rename, unlink, open } from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import { join, basename } from 'path';
import { Mutex } from 'async-mutex';

/**
 * Current cache format version
 * Increment this when cache structure changes incompatibly
 */
const CACHE_VERSION = 2; // Bumped from 1 to 2 for modelVersion tracking

/**
 * Default cache filename
 */
const DEFAULT_CACHE_FILE = 'semantic-embeddings.json';

// Debug: cache save timing instrumentation
// Enable with RC_DEBUG_CACHE_SAVE=true
const DEBUG_CACHE_SAVE = process.env.RC_DEBUG_CACHE_SAVE === 'true';

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
    this.files = new Map(); // filePath -> { mtime, chunks[] }
    this.embeddings = new HybridEmbeddingMap();

    // Model version tracking for cache invalidation
    this.modelVersion = options.modelVersion || null;

    this.loaded = false;
    this.dirty = false;
    this._saveMutex = new Mutex(); // Use async-mutex for proper concurrency control
    this._dirtyToken = 0; // Monotonic counter to detect mutations during save()
    this._fileLock = null; // File handle for filesystem-level advisory lock

    // Save statistics for monitoring and debugging
    this.stats = {
      savesSucceeded: 0,
      savesSkipped: 0, // Track no-op saves (when dirty=false)
      savesFailed: 0,
      lastSaveError: null,
      lastSaveTime: null,
      lastSaveTimestamp: null,
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
      // Guard against loading extremely large caches into memory.
      // If the file is too large, we treat it as invalid and let indexing rebuild.
      const cacheStats = await stat(this.cacheFile);
      const maxBytes = 1024 * 1024 * 512; // 512MB
      if (cacheStats.size > maxBytes) {
        console.error(
          `[Cache] Cache file too large to load (${cacheStats.size} bytes > ${maxBytes}), deleting ${basename(this.cacheFile)}`
        );
        await unlink(this.cacheFile).catch(() => {});
        return false;
      }

      const data = JSON.parse(await readFile(this.cacheFile, 'utf-8'));

      // Validate version - delete old cache on mismatch
      if (data.version !== CACHE_VERSION) {
        console.error(
          `[Cache] Cache version mismatch: ${data.version} vs ${CACHE_VERSION}, deleting old cache`
        );
        await unlink(this.cacheFile).catch(() => {}); // Best effort delete
        return false;
      }

      // Validate model version - invalidate cache if embedding model changed
      // This ensures embeddings from different models aren't mixed
      if (this.modelVersion !== null && data.modelVersion !== undefined) {
        if (data.modelVersion !== this.modelVersion) {
          console.error(
            `[Cache] Model version mismatch: cache has "${data.modelVersion}" but current is "${this.modelVersion}", deleting old cache`
          );
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
        let loadedCount = 0;
        let corruptedCount = 0;
        let recoveredCount = 0;
        const totalCount = Object.keys(data.embeddings).length;

        for (const [chunkId, chunkData] of Object.entries(data.embeddings)) {
        // JSON object keys are strings; keep our map keys normalized to string.
          // Validate and convert embedding to Float32Array
          if (chunkData.embedding) {
            if (Array.isArray(chunkData.embedding)) {
              // Standard array format - convert to Float32Array
              chunkData.embedding = new Float32Array(chunkData.embedding);
            } else if (
              typeof chunkData.embedding === 'object' &&
              !Array.isArray(chunkData.embedding)
            ) {
              // Corrupted cache: object with numeric keys instead of array
              // This happens when Float32Array was serialized without Array.from()
              // RECOVERY: Convert object with numeric keys back to array
              const keys = Object.keys(chunkData.embedding);
              if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
                // Valid numeric keys - recover the embedding
                const maxIndex = Math.max(...keys.map(k => parseInt(k, 10)));
                const recovered = new Float32Array(maxIndex + 1);
                for (const [idx, val] of Object.entries(chunkData.embedding)) {
                  recovered[parseInt(idx, 10)] = val;
                }
                chunkData.embedding = recovered;
                recoveredCount++;
              } else {
                // Truly corrupted - cannot recover
                corruptedCount++;
                delete data.embeddings[chunkId];
                continue;
              }
            } else if (chunkData.embedding instanceof Float32Array) {
              // Already Float32Array (shouldn't happen from JSON but handle it)
              // Already in correct format, nothing to do
            } else {
              console.warn(
                `[Cache] Unexpected embedding type for ${chunkId}: ${typeof chunkData.embedding}`
              );
              corruptedCount++;
              delete data.embeddings[chunkId];
              continue;
            }
          }
          this.embeddings.set(String(chunkId), chunkData);
          loadedCount++;
        }

        // Log recovery and corruption statistics for visibility
        if (recoveredCount > 0) {
          console.error(
            `[Cache] Recovered ${recoveredCount} embeddings from object format (Float32Array serialization bug)`
          );
          this.dirty = true; // Mark dirty to save repaired cache
        }
        if (corruptedCount > 0) {
          const corruptionRate = ((corruptedCount / totalCount) * 100).toFixed(1);
          console.error(
            `[Cache] WARNING: ${corruptedCount}/${totalCount} embeddings corrupted and discarded (${corruptionRate}%)`
          );
          console.error('[Cache] Corrupted embeddings will be regenerated on next indexing run');
          this.dirty = true; // Mark dirty to save cleaned cache
        }
        console.error(
          `[Cache] Loaded ${loadedCount} embeddings from cache${recoveredCount > 0 ? ` (${recoveredCount} recovered)` : ''}`
        );
      }

      return true;
    } catch (error) {
      console.error('[Cache] Failed to load cache:', error.message);

      // FIX #4: Cache corruption recovery
      // Move corrupted file for analysis instead of deleting
      if (existsSync(this.cacheFile)) {
        // Add random suffix to prevent collisions
        const backupFile =
          this.cacheFile + `.corrupted.${Date.now()}.${Math.random().toString(36).slice(2)}`;
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
        .map(f => {
          const parts = f.split('.');
          // Filename format: semantic-embeddings.json.corrupted.<timestamp>.<random>
          // Timestamp is the second-to-last segment.
          const time = parseInt(parts[parts.length - 2], 10) || 0;
          return {
            name: f,
            path: join(this.cacheDir, f),
            time,
          };
        })
        .sort((a, b) => b.time - a.time); // Newest first

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
   * Acquire filesystem-level advisory lock for this cache file
   * Uses exclusive file creation for cross-process protection
   * @returns {Promise<function>} Release function that MUST be called when done
   * @private
   */
  async _acquireFileLock() {
    const lockFile = this.cacheFile + '.lock';
    const lockId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const maxAttempts = 10;
    const retryDelay = 100; // ms

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Try to create lock file exclusively (fails if exists)
        const handle = await open(lockFile, 'wx'); // 'wx' = create new file, fail if exists

        // Write our lock ID to the file
        await handle.writeFile(lockId, 'utf-8');
        await handle.sync(); // Ensure it's written to disk

        console.error(`[Cache] Acquired file lock for ${this.cacheFile} (ID: ${lockId})`);

        // Return release function
        return async () => {
          try {
            await handle.close();
            await unlink(lockFile);
            console.error(`[Cache] Released file lock for ${this.cacheFile}`);
          } catch (error) {
            // Best effort cleanup - lock may have been stolen by another process
            console.warn(`[Cache] Failed to release file lock: ${error.message}`);
          }
        };
      } catch (error) {
        if (error.code === 'EEXIST') {
          // Lock file exists - check if it's stale (process died)
          try {
            const lockContent = await readFile(lockFile, 'utf-8');
            const lockPid = parseInt(lockContent.split('-')[0]);

            // Check if the locking process is still running
            try {
              process.kill(lockPid, 0); // Signal 0 checks if process exists
              // Process is still alive - wait and retry
              if (attempt < maxAttempts - 1) {
                console.warn(`[Cache] File lock held by PID ${lockPid}, waiting... (${attempt + 1}/${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                continue;
              } else {
                throw new Error(`Failed to acquire file lock after ${maxAttempts} attempts (held by PID ${lockPid})`);
              }
            } catch (killError) {
              // Process is dead - steal the lock
              console.warn(`[Cache] Stale lock detected (PID ${lockPid} not running), stealing lock`);
              await unlink(lockFile);
              continue; // Retry acquisition
            }
          } catch (readError) {
            // Can't read lock file - try to delete and retry
            console.warn('[Cache] Corrupt lock file, removing and retrying');
            try {
              await unlink(lockFile);
            } catch (unlinkError) {
              // Ignore unlink errors
            }
            continue;
          }
        } else {
          // Other error (permissions, disk full, etc.)
          throw new Error(`Failed to acquire file lock: ${error.message}`);
        }
      }
    }

    throw new Error('Failed to acquire file lock: max attempts exceeded');
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
    const saveStartWall = Date.now();

    // FIX #12: Validate maxRetries parameter
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new Error(`maxRetries must be a non-negative integer, got: ${maxRetries}`);
    }
    if (maxRetries > 10) {
      console.warn(`[Cache] WARNING: maxRetries=${maxRetries} is unusually high, capping at 10`);
      maxRetries = 10;
    }

    // CRITICAL FIX: Use async-mutex for proper concurrency control
    // This prevents race conditions where multiple saves think dirty=true
    // The Mutex provides: FIFO queue, proper timeout support, no race conditions
    const releaseMutex = await this._saveMutex.acquire();

    const startTime = Date.now();
    let releaseFileLock = null;

    try {
      // Now check dirty flag while holding lock
      if (!this.enabled || !this.dirty) {
        this.stats.savesSkipped = (this.stats.savesSkipped || 0) + 1;
        releaseMutex(); // Release lock before returning
        return false;
      }

      const dirtyTokenAtStart = this._dirtyToken;
      // FIX #4: Acquire filesystem-level lock for cross-process protection
      try {
        releaseFileLock = await this._acquireFileLock();
      } catch (lockError) {
        console.error(`[Cache] Failed to acquire file lock: ${lockError.message}`);
        // Continue without file lock - will rely on in-memory lock and atomic rename
      }

      const data = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        modelVersion: this.modelVersion, // Track embedding model for cache invalidation
        files: {},
      };

      // CRITICAL FIX: Don't create full snapshots - iterate directly to avoid memory bloat
      // Creating new Map(this.embeddings.entries()) copies 17,000+ embedding references
      // Each reference points to a Float32Array (3KB), causing 51MB+ per snapshot
      // With 42 checkpoints, this equals 2GB+ of uncollectable memory
      // Instead, iterate directly and only hold what we need for serialization
      const chunkCount = this.embeddings.size;

      // Serialize files directly (no snapshot needed - files are small)
      for (const [file, info] of this.files.entries()) {
        data.files[file] = info;
      }

      if (DEBUG_CACHE_SAVE) {
        console.error('[Cache] DEBUG save(): stats', {
          files: this.files.size,
          embeddings: chunkCount,
          dirty: this.dirty,
          cacheFile: this.cacheFile,
        });
      }

      // Safety check for unreasonably large caches
      const MAX_EMBEDDINGS = 1000000; // 1 million chunks
      if (chunkCount > MAX_EMBEDDINGS) {
        throw new Error(`Cache too large to save: ${chunkCount} chunks exceeds limit of ${MAX_EMBEDDINGS}`);
      }

      // FIX #2: Retry logic with exponential backoff
      let lastError;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        // Declare stream here so catch can safely destroy it.
        let stream = null;

        try {
          // Write to temp file first, then rename for atomicity
          const tempFile = this.cacheFile + '.tmp';

          const writeStart = Date.now();

          // FIX: Check memory pressure before starting large save operation
          const mem = process.memoryUsage();
          if (mem.heapUsed > mem.heapTotal * 0.9) {
            console.warn('[Cache] High memory pressure before save:', {
              heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,
              heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`,
              heapUsedPercent: `${((mem.heapUsed / mem.heapTotal) * 100).toFixed(1)}%`
            });
          }

          // Stream-write JSON to avoid building a massive in-memory string.
          // This significantly reduces peak heap usage and avoids RangeError / OOM
          // when caches are large.
          stream = createWriteStream(tempFile, { encoding: 'utf-8' });

          // Attach a single error listener to avoid MaxListenersExceededWarning.
          // All writes race against this promise.
          let rejectStreamError;
          const streamErrorPromise = new Promise((_, reject) => {
            rejectStreamError = reject;
          });
          stream.once('error', err => rejectStreamError(err));

          const streamWrite = async str => {
            const ok = stream.write(str, 'utf-8');
            if (ok) return;
            await Promise.race([
              new Promise(resolve => stream.once('drain', resolve)),
              streamErrorPromise,
            ]);
          };

          const streamEnd = async () => {
            stream.end();
            await Promise.race([
              new Promise(resolve => stream.once('finish', resolve)),
              streamErrorPromise,
            ]);
            // CRITICAL FIX: Wait for 'close' NOT 'finish' to ensure all buffers flushed
            // 'finish' fires when stream.end() is called but data may still be in buffers
            // 'close' fires after all data is flushed to the OS and file descriptor is released
            await Promise.race([
              new Promise(resolve => stream.once('close', resolve)),
              streamErrorPromise,
            ]);
            // CRITICAL FIX: Additional yield to ensure OS flushes file system cache
            // Without this, the file may exist in OS cache but not be fully on disk
            // The subsequent datasync() on a different fd may see incomplete data
            await new Promise(resolve => setTimeout(resolve, 10));
          };

          // Header
          await streamWrite('{');
          await streamWrite(`"version":${JSON.stringify(data.version)},`);
          await streamWrite(`"timestamp":${JSON.stringify(data.timestamp)},`);
          await streamWrite(`"modelVersion":${JSON.stringify(data.modelVersion)},`);

          // CRITICAL FIX: Yield before serializing large files object
          // JSON.stringify(data.files) for 400+ files can block event loop for 200-500ms
          // This causes stdio transport timeout and MCP disconnection
          await new Promise(resolve => setTimeout(resolve, 0));

          await streamWrite(`"files":${JSON.stringify(data.files)},`);

          // Yield again after files serialization before embeddings loop
          await new Promise(resolve => setTimeout(resolve, 0));

          await streamWrite('"embeddings":{');

          // CRITICAL FIX: Iterate directly over embeddings to avoid memory bloat
          // Don't create a snapshot Map - iterate and stream immediately
          let wroteAny = false;
          // CRITICAL FIX: Reduced from 100 to 50 for more frequent event loop yielding
          // This prevents stdio transport timeout during large cache saves
          const EMBEDDINGS_BATCH_SIZE = 50;
          let batchCount = 0;

          for (const [chunkId, embData] of this.embeddings.entries()) {
            const serializable = { ...embData };
            if (serializable.embedding instanceof Float32Array) {
              serializable.embedding = Array.from(serializable.embedding);
            }

            const prefix = wroteAny ? ',' : '';
            wroteAny = true;

            await streamWrite(
              prefix + JSON.stringify(String(chunkId)) + ':' + JSON.stringify(serializable)
            );

            batchCount++;
            if (batchCount >= EMBEDDINGS_BATCH_SIZE) {
              batchCount = 0;
              // FIX: Force GC after each batch to free temporary Array.from() arrays
              // Array.from() creates ~3MB temporary arrays per 100 embeddings
              // Without GC hints, these accumulate and cause OOM for large codebases
              if (global.gc) {
                global.gc();
              }
              // Yield to event loop to keep MCP responsive.
              await new Promise(resolve => setTimeout(resolve, 0));
            }
          }

          // Close JSON document
          await streamWrite('}}');
          await streamEnd();

          const writeMs = Date.now() - writeStart;
          if (DEBUG_CACHE_SAVE) {
            console.error('[Cache] DEBUG save(): wrote temp file (stream)', {
              attempt: attempt + 1,
              ms: writeMs,
              tempFile,
              chunks: chunkCount,
            });
          }

          // CRITICAL: Sync to disk to ensure data is actually written
          // FIX: Close the datasync handle BEFORE renaming to avoid filesystem issues
          // The stream has already fully closed and flushed, so we just need to ensure OS persistence
          const datasyncStart = Date.now();
          const renameStart = Date.now();
          let handle;
          try {
            // Open temp file to sync it to disk
            handle = await open(tempFile, 'r+');
            await handle.datasync(); // Sync data + metadata to disk
            await handle.close(); // CRITICAL: Close handle BEFORE rename
            handle = null;

            // Now rename after all handles are closed
            await rename(tempFile, this.cacheFile);

            // FIX: Post-rename validation to detect corruption immediately
            // This catches issues like: partial writes, filesystem corruption, rename race conditions
            try {
              const validation = JSON.parse(await readFile(this.cacheFile, 'utf-8'));
              if (!validation.version || !validation.embeddings) {
                throw new Error('Invalid cache structure after rename: missing version or embeddings');
              }
              if (validation.version !== CACHE_VERSION) {
                throw new Error(`Version mismatch after rename: ${validation.version} vs ${CACHE_VERSION}`);
              }
            } catch (validationError) {
              console.error('[Cache] CRITICAL: Validation failed after rename!', validationError.message);
              // Backup corrupted file for forensic analysis
              const backupFile = this.cacheFile + '.invalid.' + Date.now();
              try {
                await rename(this.cacheFile, backupFile);
                console.error('[Cache] Backed up invalid cache to:', backupFile);
              } catch (backupError) {
                console.error('[Cache] Failed to backup invalid cache:', backupError.message);
              }
              throw new Error(`Cache validation failed after rename: ${validationError.message}`);
            }
          } finally {
            // Ensure handle is closed if we error before explicit close
            if (handle) {
              try {
                await handle.close();
              } catch {
                // Ignore close errors
              }
            }
          }
          const datasyncMs = Date.now() - datasyncStart;
          if (DEBUG_CACHE_SAVE) {
            console.error('[Cache] DEBUG save(): datasync+rename complete', {
              attempt: attempt + 1,
              ms: datasyncMs,
            });
          }
          const renameMs = Date.now() - renameStart;
          if (DEBUG_CACHE_SAVE) {
            console.error('[Cache] DEBUG save(): rename complete', {
              attempt: attempt + 1,
              ms: renameMs,
              cacheFile: this.cacheFile,
            });
          }

          // Success!
          // Only clear dirty if nothing changed during the save.
          // If another writer mutated the cache while we were streaming,
          // keep dirty=true so the next save persists the new data.
          if (this._dirtyToken === dirtyTokenAtStart) {
            this.dirty = false;
          }

          // FIX #5: Track success statistics
          const saveTime = Date.now() - startTime;
          this.stats.savesSucceeded++;
          this.stats.lastSaveError = null;
          this.stats.lastSaveTime = saveTime;
          this.stats.lastSaveTimestamp = new Date().toISOString();

          console.error(
            `[Cache] Saved cache (${chunkCount} chunks, ${saveTime}ms${attempt > 0 ? `, attempt ${attempt + 1}` : ''})`
          );

          if (DEBUG_CACHE_SAVE) {
            console.error('[Cache] DEBUG save(): total wall time', {
              ms: Date.now() - saveStartWall,
              chunks: chunkCount,
            });
          }

          return true;
        } catch (error) {
          lastError = error;

          try {
            // FIX: EventEmitter cleanup - explicitly remove all listeners before destroying
            // This prevents MaxListenersExceededWarning on retries
            if (stream) {
              // Remove all event listeners to prevent memory leaks
              stream.removeAllListeners();
              // Then destroy the stream
              stream.destroy();
            }
            // Clean up temp file
            await unlink(this.cacheFile + '.tmp').catch(() => {});
          } catch {
            // ignore cleanup errors
          }

          // Skip retries for errors that won't resolve with retrying
          // ENOSPC: Disk full - retrying won't help
          // EACCES/EPERM: Permission denied - retrying won't help
          // RangeError with "Invalid string length" or "string length exceeded": data too large - retrying won't help
          const isStringLengthError =
            error.name === 'RangeError' &&
            (error.message?.includes('Invalid string length') ||
             error.message?.includes('string length exceeded') ||
             error.message?.includes('String length exceeded'));

          if (error.code === 'ENOSPC' || error.code === 'EACCES' || error.code === 'EPERM' ||
              isStringLengthError) {
            console.error(`[Cache] Fatal error (${error.code || error.name}), skipping retries:`, error.message);
            break;
          }

          // If this is the last attempt, don't wait
          if (attempt === maxRetries - 1) {
            break;
          }

          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt) * 1000;
          console.error(
            `[Cache] Save attempt ${attempt + 1} failed: ${error.message}, retrying in ${delay}ms...`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // All retries failed
      const saveTime = Date.now() - startTime;

      // FIX #3 & #5: Propagate errors and track failure statistics
      this.stats.savesFailed++;
      this.stats.lastSaveError = {
        message: this._sanitizeErrorMessage(lastError?.message),
        code: lastError?.code,
        name: lastError?.name,
        time: new Date().toISOString(),
      };
      this.stats.lastSaveTime = saveTime;
      this.stats.lastSaveTimestamp = new Date().toISOString();

      console.error(
        `[Cache] Failed to save cache after ${maxRetries} attempts (${saveTime}ms):`,
        lastError?.message
      );

      // FIX #3: Throw error instead of silent failure
      throw new Error(`Cache save failed after ${maxRetries} attempts: ${lastError?.message}`);
    } finally {
      // Release file lock if acquired
      if (releaseFileLock) {
        try {
          await releaseFileLock();
        } catch (releaseError) {
          console.error('[Cache] Error releasing file lock:', releaseError.message);
        }
      }

      // Release the mutex (always executes, even if above errors)
      releaseMutex();
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
    return this.embeddings.get(String(chunkId));
  }

  /**
   * Get embedding vector for a chunk
   * @param {string} chunkId - Chunk ID
   * @returns {Float32Array|null} Embedding vector or null if not cached
   */
  getChunkEmbedding(chunkId) {
    const chunk = this.embeddings.get(String(chunkId));
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
      console.error(
        `[Cache] Corrupted embedding detected for ${chunkId}: has object with numeric keys instead of Array/Float32Array`
      );
      // Invalidate and remove corrupted entry
      this.embeddings.delete(String(chunkId));
      this.dirty = true;
      this._dirtyToken++;
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
      const chunk = this.embeddings.get(String(id));
      if (chunk) {
        results.push({ chunkId: String(id), ...chunk });
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
      const chunkId = String(chunk.id);
      chunkIds.push(chunkId);

      // Store chunk data WITH embedding
      // FIX: Don't store null embeddings - skip storing if embedding is missing/invalid
      const embeddingData = {
        text: chunk.text,
        type: chunk.type,
        name: chunk.name,
        metadata: chunk.metadata,
      };

      // Only store embedding if it's valid (non-null and has elements)
      if (embeddings[i] && embeddings[i].length > 0) {
        // FIX: Validate embedding type to prevent silent data corruption
        const emb = embeddings[i];
        if (!emb || typeof emb.length !== 'number') {
          throw new Error(`Invalid embedding at index ${i} for chunk ${chunkId}: ${typeof emb}`);
        }
        if (emb.length === 0) {
          throw new Error(`Empty embedding at index ${i} for chunk ${chunkId}`);
        }

        // Store as Float32Array in memory to minimize heap usage.
        // save() will convert Float32Array → Array for JSON serialization.
        embeddingData.embedding = emb instanceof Float32Array ? emb : new Float32Array(emb);
      }
      // If embedding is missing/invalid, don't set the field - getChunkEmbedding will return null

      this.embeddings.set(chunkId, embeddingData);
    }

    // Store file info
    this.files.set(filePath, {
      mtime: fileMtime,
      chunks: chunkIds,
      chunkCount: chunkIds.length,
    });

    this.dirty = true;
    this._dirtyToken++;
  }

  /**
   * Invalidate a file's cache
   */
  invalidateFile(filePath) {
    const cached = this.files.get(filePath);
    if (cached) {
      // Remove chunk data
      for (const chunkId of cached.chunks) {
        this.embeddings.delete(String(chunkId));
      }

      // Remove file entry
      this.files.delete(filePath);
      this.dirty = true;
      this._dirtyToken++;
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
      modelVersion: this.modelVersion,
    };
  }

  /**
   * Set the model version (for cache invalidation)
   * Call this when the embedding model changes to invalidate existing cache
   */
  setModelVersion(modelVersion) {
    // FIX: Don't clear cache on initial set (when modelVersion is null/null/undefined)
    // Only clear when changing from one non-null model version to another
    // This prevents clearing the cache on first initialization
    if (this.modelVersion !== null && this.modelVersion !== modelVersion) {
      console.error(
        `[Cache] Model version changing from "${this.modelVersion}" to "${modelVersion}", clearing cache`
      );
      this.modelVersion = modelVersion;
      this.clear(); // Clear cache to prevent mixing embeddings from different models
    } else {
      // First time setting the model version (or same version) - just set it without clearing
      this.modelVersion = modelVersion;
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
    this._dirtyToken++;
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
