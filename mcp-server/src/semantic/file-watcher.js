/**
 * File Watcher Daemon
 *
 * Automatically reindexes files when they change using Chokidar.
 * Implements intelligent debouncing and batch processing for efficiency.
 *
 * Features:
 * - Three-level debouncing (per-file, coalescing, queue limit)
 * - Bounded event queue with memory management
 * - Graceful shutdown with queue processing
 * - Comprehensive error handling (critical vs per-file)
 * - Periodic stats logging
 */

import { watch } from 'chokidar';
import { relative, join } from 'path';
import { existsSync } from 'fs';

/**
 * Default configuration options
 */
const DEFAULT_OPTIONS = {
  debounceDelay: 300, // ms to wait after last change
  coalesceWindow: 1000, // ms window to batch changes
  maxQueueSize: 1000, // max pending changes
  statsInterval: 300000, // 5 minutes
  ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.mcp-cache/**', '**/.git/**'],
};

/**
 * Critical error codes that should stop the watcher
 */
const CRITICAL_ERRORS = new Set([
  'ENOSPC', // File watch limit exceeded
  'EACCES', // Permission denied on critical directory
  'EINTR', // Interrupted system call
]);

/**
 * FileWatcher class - watches for file changes and triggers reindexing
 */
export class FileWatcher {
  constructor(projectRoot, indexer, options = {}) {
    this.projectRoot = projectRoot;
    this.indexer = indexer;

    // Merge options with defaults
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      ignore: [...DEFAULT_OPTIONS.ignore, ...(options.ignore || [])],
    };

    // State
    this.running = false;
    this.paused = false;
    this.watcher = null;

    // Debouncing state (per-file timers)
    this.debounceTimers = new Map();

    // Change queue for batching
    this.changeQueue = new Map(); // filePath -> timestamp
    this.coalesceTimer = null;
    this.nextProcessTime = null;

    // Statistics
    this.stats = {
      filesChanged: 0,
      batchesProcessed: 0,
      totalFilesReindexed: 0,
      errors: 0,
      lastError: null,
      startTime: null,
      lastActivityTime: null,
    };

    // Activity log (last 10 events)
    this.activityLog = [];
    this.maxLogEntries = 10;

    // Periodic stats timer
    this.statsTimer = null;
  }

  /**
   * Start the file watcher
   */
  async start() {
    if (this.running) {
      console.error('[FileWatcher] Already running');
      return;
    }

    console.error('[FileWatcher] Starting file watcher daemon...');
    console.error(`[FileWatcher] Project root: ${this.projectRoot}`);
    console.error(`[FileWatcher] Patterns: ${this.indexer.patterns.join(', ')}`);

    this.running = true;
    this.paused = false;
    this.stats.startTime = Date.now();

    try {
      await this._initializeWatcher();
      this._startStatsTimer();
      console.error('[FileWatcher] File watcher started successfully');
    } catch (error) {
      this.running = false;
      console.error('[FileWatcher] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Stop the file watcher gracefully
   */
  async stop() {
    if (!this.running) {
      return;
    }

    console.error('[FileWatcher] Stopping file watcher...');
    this.paused = true;

    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Clear coalesce timer
    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = null;
    }

    // Process remaining queue
    if (this.changeQueue.size > 0) {
      console.error(`[FileWatcher] Processing ${this.changeQueue.size} remaining changes...`);
      await this._processChangeQueue();
    }

    // Stop Chokidar watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    // Stop stats timer
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }

    this.running = false;
    this.nextProcessTime = null;

    console.error('[FileWatcher] File watcher stopped');
  }

  /**
   * Check if watcher is running
   */
  isRunning() {
    return this.running;
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      running: this.running,
      paused: this.paused,
      uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
      config: {
        debounceDelay: this.options.debounceDelay,
        coalesceWindow: this.options.coalesceWindow,
        maxQueueSize: this.options.maxQueueSize,
        patterns: this.indexer.patterns,
        ignore: this.options.ignore,
      },
      stats: { ...this.stats },
      queue: {
        size: this.changeQueue.size,
        nextProcessTime: this.nextProcessTime,
      },
      recentActivity: [...this.activityLog],
    };
  }

  /**
   * Get statistics only
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Initialize Chokidar watcher
   * @private
   */
  async _initializeWatcher() {
    // Create Chokidar instance
    this.watcher = watch(this.indexer.patterns, {
      cwd: this.projectRoot,
      ignored: this.options.ignore,
      persistent: true,
      ignoreInitial: true, // Don't emit events for initial scan
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    // Set up event handlers
    this.watcher
      .on('add', path => this._handleFileEvent('add', path))
      .on('change', path => this._handleFileEvent('change', path))
      .on('unlink', path => this._handleFileEvent('unlink', path))
      .on('error', error => this._handleError(error, 'chokidar'))
      .on('ready', () => console.error('[FileWatcher] Ready for changes'));
  }

  /**
   * Handle file events (add/change/unlink)
   * @private
   */
  _handleFileEvent(event, path) {
    if (!this.running || this.paused) {
      return;
    }

    // CRITICAL: Validate file matches patterns before processing
    // Chokidar may report changes for files that don't match our patterns
    const matchesPattern = this._matchesPattern(path);
    if (!matchesPattern) {
      return; // Skip files that don't match our patterns
    }

    // Convert to absolute path
    const absPath = join(this.projectRoot, path);

    // Debounce this file
    this._debounceReindex(absPath, event);
  }

  /**
   * Check if a file path matches any of the configured patterns
   * @private
   */
  _matchesPattern(filePath) {
    return this.indexer.patterns.some(pattern => {
      // Convert glob pattern to regex
      // **/ -> .* (any chars including /)
      // * -> [^/]* (any chars except /)
      // ? -> [^/] (single char except /)
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');

      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(filePath);
    });
  }

  /**
   * Debounce file changes with per-file timer
   * @private
   */
  _debounceReindex(filePath, event) {
    // Clear existing timer for this file
    if (this.debounceTimers.has(filePath)) {
      clearTimeout(this.debounceTimers.get(filePath));
      this.debounceTimers.delete(filePath); // CRITICAL: Delete immediately
    }

    // Set new timer
    const timer = setTimeout(() => {
      try {
        // Add to queue when timer expires
        this.changeQueue.set(filePath, Date.now());

        // Log activity
        this._logActivity(event, filePath);

        // Update stats
        this.stats.filesChanged++;
        this.stats.lastActivityTime = Date.now();

        // Check if queue is getting large
        if (this.changeQueue.size >= this.options.maxQueueSize) {
          console.error(
            `[FileWatcher] Queue size (${this.changeQueue.size}) at limit, processing immediately`
          );
          this._processChangeQueue();
          return;
        }

        // Start coalesce timer if not running
        if (!this.coalesceTimer) {
          this.coalesceTimer = setTimeout(() => {
            this._processChangeQueue();
          }, this.options.coalesceWindow);

          this.nextProcessTime = Date.now() + this.options.coalesceWindow;
        }
      } finally {
        // Ensure cleanup even on error
        this.debounceTimers.delete(filePath);
      }
    }, this.options.debounceDelay);

    this.debounceTimers.set(filePath, timer);

    // CRITICAL: Safety check - prevent unbounded timer growth
    if (this.debounceTimers.size > this.options.maxQueueSize * 2) {
      console.error(
        `[FileWatcher] Timer count (${this.debounceTimers.size}) exceeds safety threshold, forcing immediate processing`
      );
      this._processChangeQueue();
    }
  }

  /**
   * Process all changes in the queue as a batch
   * @private
   */
  async _processChangeQueue() {
    if (this.changeQueue.size === 0) {
      this.coalesceTimer = null;
      this.nextProcessTime = null;
      return;
    }

    console.error(`[FileWatcher] Processing batch of ${this.changeQueue.size} files...`);

    // Get all files to process
    const filesToProcess = Array.from(this.changeQueue.keys());
    this.changeQueue.clear();
    this.coalesceTimer = null;
    this.nextProcessTime = null;

    // Separate by operation type
    const toReindex = [];
    const toDelete = [];

    for (const absPath of filesToProcess) {
      if (existsSync(absPath)) {
        toReindex.push(absPath);
      } else {
        // File was deleted
        const relPath = relative(this.projectRoot, absPath);
        toDelete.push(relPath);
      }
    }

    try {
      // Handle deletions
      if (toDelete.length > 0) {
        console.error(`[FileWatcher] Removing ${toDelete.length} deleted files from index...`);
        const failedDeletions = [];

        for (const relPath of toDelete) {
          try {
            // Invalidate cache
            this.indexer.cache.invalidateFile(relPath);

            // CRITICAL: Also remove from vector store and dependency graph
            // to prevent orphaned data and search returning non-existent chunks
            const chunks = this.indexer.vectorStore.getByFile(relPath);
            for (const chunk of chunks) {
              this.indexer.vectorStore.delete(chunk.chunkId);
              this.indexer.dependencyGraph.removeChunk(chunk.chunkId);
            }

            console.error(`[FileWatcher] Removed ${chunks.length} chunks for ${relPath}`);
          } catch (error) {
            console.warn(`[FileWatcher] Failed to invalidate ${relPath}: ${error.message}`);
            this.stats.errors++;

            // CRITICAL: Requeue failed deletions for transient errors
            if (this._isTransientError(error)) {
              console.warn(`[FileWatcher] Transient error for ${relPath}, will retry`);
              failedDeletions.push(relPath);
            }
          }
        }

        // Requeue failed deletions for retry
        if (failedDeletions.length > 0) {
          console.warn(
            `[FileWatcher] Requeueing ${failedDeletions.length} failed deletions for retry`
          );
          for (const relPath of failedDeletions) {
            this.changeQueue.set(join(this.projectRoot, relPath), Date.now());
          }
        }
      }

      // Handle reindexing
      if (toReindex.length > 0) {
        console.error(`[FileWatcher] Reindexing ${toReindex.length} files...`);
        const result = await this.indexer.reindexFiles(toReindex);
        this.stats.totalFilesReindexed += result.reindexed;
      }

      // Save cache
      await this.indexer._saveCache();

      this.stats.batchesProcessed++;
      console.error(
        `[FileWatcher] Batch complete: ${toReindex.length} reindexed, ${toDelete.length} removed`
      );

      // CRITICAL: Check error rate and alert if degraded
      const totalProcessed = this.stats.filesChanged + this.stats.batchesProcessed;
      if (totalProcessed > 10) {
        // Only check after minimum sample size
        const errorRate = this.stats.errors / totalProcessed;
        if (errorRate > 0.5) {
          console.error(
            `[FileWatcher] ⚠️  HIGH ERROR RATE: ${(errorRate * 100).toFixed(1)}% (${this.stats.errors}/${totalProcessed}) - Consider stopping watcher`
          );
        } else if (errorRate > 0.2) {
          console.warn(
            `[FileWatcher] Elevated error rate: ${(errorRate * 100).toFixed(1)}% (${this.stats.errors}/${totalProcessed})`
          );
        }
      }
    } catch (error) {
      console.error('[FileWatcher] Batch processing error:', error);
      this._handleError(error, 'batch-processing');
    }
  }

  /**
   * Handle errors with critical vs per-file distinction
   * @private
   */
  _handleError(error, context) {
    const errorCode = error.code || 'UNKNOWN';

    if (CRITICAL_ERRORS.has(errorCode)) {
      // Critical error - stop watcher
      console.error(`[FileWatcher] Critical error (${context}):`, error);
      this.stats.lastError = {
        code: errorCode,
        message: error.message,
        context,
        timestamp: new Date().toISOString(),
      };

      // Stop watcher
      this.stop().catch(() => {
        // Already stopping
      });

      throw error;
    } else {
      // Per-file error - continue watching
      console.warn(`[FileWatcher] Non-critical error (${context}): ${error.message}`);
      this.stats.errors++;
      this.stats.lastError = {
        code: errorCode,
        message: error.message,
        context,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check if an error is transient (should retry)
   * @private
   */
  _isTransientError(error) {
    const transientCodes = new Set(['EBUSY', 'ETIMEDOUT', 'EAGAIN', 'ENOSPC']);
    return transientCodes.has(error.code);
  }

  /**
   * Log activity to in-memory log
   * @private
   */
  _logActivity(event, filePath) {
    const relPath = relative(this.projectRoot, filePath);

    this.activityLog.push({
      event,
      file: relPath,
      timestamp: new Date().toISOString(),
    });

    // Keep only last N entries
    if (this.activityLog.length > this.maxLogEntries) {
      this.activityLog.shift();
    }
  }

  /**
   * Start periodic stats logging
   * @private
   */
  _startStatsTimer() {
    this.statsTimer = setInterval(() => {
      this._logStats();
    }, this.options.statsInterval);
  }

  /**
   * Log current statistics
   * @private
   */
  _logStats() {
    const memory = this._getMemoryUsage();
    const uptime = this.stats.startTime
      ? Math.floor((Date.now() - this.stats.startTime) / 1000)
      : 0;

    console.error('[FileWatcher] Stats:', {
      uptime: `${uptime}s`,
      filesChanged: this.stats.filesChanged,
      batchesProcessed: this.stats.batchesProcessed,
      totalReindexed: this.stats.totalFilesReindexed,
      errors: this.stats.errors,
      queueSize: this.changeQueue.size,
      memory,
    });
  }

  /**
   * Get memory usage information
   * @private
   */
  _getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      rss: `${(usage.rss / 1024 / 1024).toFixed(2)} MB`,
    };
  }
}

export default FileWatcher;
