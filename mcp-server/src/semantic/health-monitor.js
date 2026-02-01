/**
 * Health Monitor for Semantic Index
 *
 * Automatically detects index corruption and triggers recovery.
 * Monitors vector store mismatches, cache degradation, and orphaned data.
 *
 * @module semantic/health-monitor
 */

/**
 * Health Monitor class
 * Detects and auto-recovers from corrupted index data
 */
export class HealthMonitor {
  constructor(indexer, fileWatcher, options = {}) {
    this.indexer = indexer;
    this.fileWatcher = fileWatcher;
    this.options = {
      checkInterval: 60000, // 1 minute default
      autoHeal: true, // Auto-recover when issues detected
      ...options,
    };

    this.timer = null;
    this.initialTimer = null;
    this.lastCheck = null;
    this.issueCount = 0;
    this._checkInProgress = false;
  }

  /**
   * Start health monitoring
   */
  start() {
    if (this.timer) {
      console.warn('[HealthMonitor] Already running');
      return;
    }

    console.error(
      `[HealthMonitor] Starting health checks every ${this.options.checkInterval}ms...`
    );

    this.timer = setInterval(() => {
      this._checkHealth().catch(error => {
        console.error('[HealthMonitor] Health check failed:', error);
      });
    }, this.options.checkInterval);

    // Run initial check after a short delay
    this.initialTimer = setTimeout(() => {
      this._checkHealth().catch(error => {
        console.error('[HealthMonitor] Initial health check failed:', error);
      });
    }, 5000);
  }

  /**
   * Stop health monitoring
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }

    console.error('[HealthMonitor] Health monitor stopped');
  }

  /**
   * Perform health check and auto-recover if needed
   * @private
   */
  async _checkHealth() {
    if (this._checkInProgress) {
      return;
    }

    this._checkInProgress = true;

    try {
      const issues = [];
      const stats = this.indexer.stats || {};
      const now = Date.now();
      this.lastCheck = now;

      // Check 1: Vector store mismatch
      const vectorCount = this.indexer.vectorStore?.chunkCount || 0;
      const expectedCount = stats.chunksIndexed || 0;
      if (vectorCount < expectedCount && expectedCount > 0) {
        const missing = expectedCount - vectorCount;
        issues.push({
          type: 'vector_mismatch',
          severity: 'HIGH',
          message: `${missing} chunks indexed but not stored in vector store`,
          missing,
          action: 'reindex_missing',
        });
      }

      // Check 2: Cache degradation
      if (stats.cacheFailures > 0 && stats.filesIndexed > 0) {
        const failureRate = stats.cacheFailures / stats.filesIndexed;
        const lastFailureTime = stats.lastCacheFailureTime || 0;
        const failureAge = now - lastFailureTime;
        const isRecent = failureAge < 3600000; // 1 hour

        if (failureRate > 0.1 && isRecent) {
          issues.push({
            type: 'cache_degradation',
            severity: 'MEDIUM',
            message: `Cache failure rate: ${(failureRate * 100).toFixed(1)}% (${stats.cacheFailures}/${stats.filesIndexed} files)`,
            failureRate,
            action: 'reindex_corrupted',
          });
        }
      }

      // Check 3: Stale indexer (indexed but not cached)
      const cacheStats = this.indexer.cache?.getStats() || {};
      if (stats.filesIndexed > 0 && cacheStats.fileCount === 0) {
        issues.push({
          type: 'stale_cache',
          severity: 'HIGH',
          message: 'Files indexed but cache is empty - cache was cleared',
          action: 'reindex_all',
        });
      }

      // Handle detected issues
      if (issues.length > 0) {
        this.issueCount++;
        console.error(`[HealthMonitor] ⚠️  Detected ${issues.length} issue(s):`);
        for (const issue of issues) {
          console.error(`  - [${issue.severity}] ${issue.message}`);
        }

        if (this.options.autoHeal) {
          await this._autoRecover(issues);
        }
      }
    } finally {
      this._checkInProgress = false;
    }
  }

  /**
   * Auto-recover from detected issues
   * @private
   * @param {Array} issues - List of detected issues
   */
  async _autoRecover(issues) {
    console.error('[HealthMonitor] Auto-healing enabled, attempting recovery...');

    for (const issue of issues) {
      try {
        switch (issue.action) {
          case 'reindex_missing': {
            // Reindex only files with missing vector data
            const filesWithMissing = await this._findFilesWithMissingChunks();
            if (filesWithMissing.length > 0) {
              console.error(
                `[HealthMonitor] Reindexing ${filesWithMissing.length} files with missing chunks...`
              );
              await this.indexer.reindexFiles(filesWithMissing);
              console.error(`[HealthMonitor] ✅ Recovered ${filesWithMissing.length} files`);
            }
            break;
          }

          case 'reindex_corrupted':
            // Cache has high failure rate, need full reindex with cache bypass
            console.error('[HealthMonitor] Cache corrupted, forcing full reindex...');
            await this.indexer.indexAll({
              force: true,
              bypassCache: true,
            });
            console.error('[HealthMonitor] ✅ Full reindex completed');
            break;

          case 'reindex_all':
            // General reindex
            console.error('[HealthMonitor] Running full reindex...');
            await this.indexer.indexAll({ force: true });
            console.error('[HealthMonitor] ✅ Reindex completed');
            break;
        }
      } catch (error) {
        console.error(`[HealthMonitor] Failed to recover from ${issue.type}:`, error);
      }
    }
  }

  /**
   * Find files that have chunks indexed but missing vector data
   * @private
   * @returns {Promise<Array>} List of file paths with missing chunks
   */
  async _findFilesWithMissingChunks() {
    const filesWithMissing = [];

    if (!this.indexer.cache || !this.indexer.vectorStore) {
      return filesWithMissing;
    }

    // EmbeddingCache.getCachedFiles() returns file path strings.
    const cachedFiles = this.indexer.cache.getCachedFiles
      ? this.indexer.cache.getCachedFiles()
      : [];

    for (const file of cachedFiles) {
      if (!file) {
        continue;
      }

      try {
        const storedChunks = this.indexer.vectorStore.getByFile(file);
        const expectedChunkIds = this.indexer.cache.getFileChunks(file) || [];

        if (storedChunks.length < expectedChunkIds.length) {
          filesWithMissing.push(file);
        }
      } catch {
        // Error accessing file data indicates corruption
        filesWithMissing.push(file);
      }
    }

    return filesWithMissing;
  }

  /**
   * Get health statistics
   */
  getStats() {
    return {
      lastCheck: this.lastCheck,
      issueCount: this.issueCount,
      isMonitoring: this.timer !== null,
      checkInterval: this.options.checkInterval,
    };
  }
}

export default HealthMonitor;
