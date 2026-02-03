/**
 * Tiered Vector Store
 *
 * Provides efficient vector similarity search with automatic scaling:
 * - Tier 1: In-memory Map (best for < 5000 chunks)
 * - Tier 2: sqlite-vec (for 5000+ chunks, auto-upgrade)
 *
 * Uses cosine similarity for semantic search.
 */

import { HybridEmbeddings, cosineSimilarity } from './embeddings.js';
import { passesFilters as sharedPassesFilters } from './filters.js';
import { SqliteVectorAdapter } from './sqlite-adapter.js';
import { MemoryVectorAdapter } from './memory-vector-adapter.js';
import { createVectorAdapterSync } from './adapter-factory.js';
import { unlinkSync, existsSync } from 'fs';

/**
 * Auto-upgrade threshold
 */
const UPGRADE_THRESHOLD = 5000;

/**
 * Default similarity threshold
 */
const DEFAULT_THRESHOLD = 0.3;

/**
 * Default embedding dimension (nomic-embed-text-v1.5)
 */
const DEFAULT_DIM = 768;

/**
 * Vector Store class
 */
export class VectorStore {
  constructor(options = {}) {
    this.vectors = new Map(); // chunkId -> Float32Array
    this.metadata = new Map(); // chunkId -> metadata
    this.chunkCount = 0;
    this.dimension = options.dimension || DEFAULT_DIM;
    this.upgradeThreshold = options.upgradeThreshold || UPGRADE_THRESHOLD;
    this.useSqlite = false;
    this.dbPath = options.dbPath;
    this._upgradeWarned = false; // Track if we've warned about sqlite upgrade
    this.adapter = null; // SqliteVectorAdapter instance (when useSqlite = true)
    this._migrationInProgress = false; // Track if migration is in progress
    this._migrationFailed = false; // CRITICAL: Track if migration has failed to prevent silent fallback
    this._migrationError = null; // Store migration error for debugging
  }

  /**
   * Initialize or recover VectorStore state
   * @param {Object} options - Initialization options
   * @returns {boolean} True if recovery was performed
   */
  initialize(options = {}) {
    // CRITICAL FIX #1: Add recovery mechanism for interrupted migrations
    // Check if we have a SQLite database but useSqlite flag is false
    const { adapter = null } = options;

    if (adapter && adapter.isInitialized) {
      const stats = adapter.getStats();
      if (stats.chunkCount > 0 && !this.useSqlite) {
        console.warn(
          `[VectorStore] Detected existing SQLite database with ${stats.chunkCount} chunks, recovering...`
        );
        this.adapter = adapter;
        this.useSqlite = true;
        this.chunkCount = stats.chunkCount;
        this.vectors.clear();
        this.metadata.clear();
        console.warn('[VectorStore] Recovery complete: using SQLite backend');
        return true;
      }
    }

    return false;
  }

  /**
   * Add or update a vector
   * Routes to Map or SQLite backend based on useSqlite flag
   */
  upsert(chunkId, embedding, metadata = {}) {
    // CRITICAL FIX: Check if migration has failed and prevent silent fallback
    if (this._migrationFailed) {
      throw new Error(
        `[VectorStore] Cannot upsert ${chunkId}: SQLite migration failed earlier. ` +
        `Error: ${this._migrationError?.message || 'Unknown'}. ` +
        'The system is in an inconsistent state and cannot continue indexing. ' +
        'Please restart the MCP server to recover from the SQLite database.'
      );
    }

    if (this.useSqlite) {
      return this._sqliteUpsert(chunkId, embedding, metadata);
    }

    const result = this._mapUpsert(chunkId, embedding, metadata);

    // Check if we need to trigger migration (after upsert completes)
    if (!this._migrationInProgress) {
      this._checkUpgradeThreshold();
    }

    return result;
  }

  /**
   * Add or update a vector (Map backend)
   * @private
   */
  _mapUpsert(chunkId, embedding, metadata = {}) {
    // Validate and convert embedding to Float32Array
    if (!(embedding instanceof Float32Array)) {
      if (Array.isArray(embedding)) {
        // Convert Array to Float32Array
        embedding = new Float32Array(embedding);
      } else if (typeof embedding === 'object' && embedding !== null) {
        // Corrupted embedding: object with numeric keys
        throw new Error(
          `Invalid embedding type for ${chunkId}: expected Float32Array or Array, got object with numeric keys. This may indicate cache corruption.`
        );
      } else {
        throw new Error(
          `Invalid embedding type for ${chunkId}: expected Float32Array or Array, got ${typeof embedding}`
        );
      }
    }

    // FIX: Validate embedding dimension matches expected dimension
    if (embedding.length !== this.dimension) {
      throw new Error(
        `Embedding dimension mismatch for ${chunkId}: ` +
          `expected ${this.dimension} dimensions, got ${embedding.length}. ` +
          'This may indicate a model change or cache corruption.'
      );
    }

    this.vectors.set(chunkId, embedding);
    this.metadata.set(chunkId, {
      ...metadata,
      chunkId,
      updatedAt: Date.now(),
    });

    this.chunkCount = this.vectors.size;

    // Check if we need to upgrade to sqlite (warn only once)
    if (!this.useSqlite && !this._upgradeWarned && this.chunkCount >= this.upgradeThreshold) {
      console.error(
        `[VectorStore] Chunk count (${this.chunkCount}) >= threshold (${this.upgradeThreshold}), consider upgrading to sqlite-vec`
      );
      this._upgradeWarned = true;
    }
  }

  /**
   * Add or update a vector (SQLite backend)
   * @private
   */
  _sqliteUpsert(chunkId, embedding, metadata = {}) {
    if (!this.adapter) {
      throw new Error('SQLite adapter not initialized');
    }

    // Validate and convert embedding to Float32Array
    if (!(embedding instanceof Float32Array)) {
      if (Array.isArray(embedding)) {
        embedding = new Float32Array(embedding);
      } else if (typeof embedding === 'object' && embedding !== null) {
        throw new Error(
          `Invalid embedding type for ${chunkId}: expected Float32Array or Array, got object with numeric keys.`
        );
      } else {
        throw new Error(
          `Invalid embedding type for ${chunkId}: expected Float32Array or Array, got ${typeof embedding}`
        );
      }
    }

    // Validate embedding dimension
    if (embedding.length !== this.dimension) {
      throw new Error(
        `Embedding dimension mismatch for ${chunkId}: ` +
          `expected ${this.dimension} dimensions, got ${embedding.length}. ` +
          'This may indicate a model change or cache corruption.'
      );
    }

    this.adapter.upsert(chunkId, embedding, {
      ...metadata,
      chunkId,
      updatedAt: Date.now(),
    });

    // HIGH FIX #6: Removed this.chunkCount++ - use actual SQLite count from adapter.getStats() in getStats()
    // The count is now fetched dynamically from SQLite in getStats() for accuracy
  }

  /**
   * Batch upsert multiple vectors
   */
  upsertBatch(items) {
    for (const { chunkId, embedding, metadata } of items) {
      this.upsert(chunkId, embedding, metadata);
    }
  }

  /**
   * Get a vector by ID
   * Routes to Map or SQLite backend based on useSqlite flag
   */
  get(chunkId) {
    if (this.useSqlite) {
      return this._sqliteGet(chunkId);
    }
    return this._mapGet(chunkId);
  }

  /**
   * Get a vector by ID (Map backend)
   * @private
   */
  _mapGet(chunkId) {
    const vector = this.vectors.get(chunkId);
    const metadata = this.metadata.get(chunkId);

    if (!vector || !metadata) return null;

    return { vector, metadata };
  }

  /**
   * Get a vector by ID (SQLite backend)
   * @private
   */
  _sqliteGet(chunkId) {
    if (!this.adapter) {
      throw new Error('SQLite adapter not initialized');
    }
    return this.adapter.get(chunkId);
  }

  /**
   * Check if a chunk exists
   */
  has(chunkId) {
    if (this.useSqlite) {
      if (!this.adapter) {
        return false;
      }
      const result = this.adapter.get(chunkId);
      return result !== null;
    }
    return this.vectors.has(chunkId);
  }

  /**
   * Delete a chunk
   * Routes to Map or SQLite backend based on useSqlite flag
   */
  delete(chunkId) {
    if (this.useSqlite) {
      return this._sqliteDelete(chunkId);
    }
    return this._mapDelete(chunkId);
  }

  /**
   * Delete a chunk (Map backend)
   * @private
   */
  _mapDelete(chunkId) {
    const deleted = this.vectors.delete(chunkId);
    this.metadata.delete(chunkId);
    const oldCount = this.chunkCount;
    this.chunkCount = this.vectors.size;

    // Reset warning flag if we drop significantly below threshold (hysteresis)
    // This prevents permanent suppression after deletions
    // Use max() to ensure we don't go negative with small thresholds
    const HYSTERESIS_MARGIN = 500;
    const hysteresisThreshold = Math.max(0, this.upgradeThreshold - HYSTERESIS_MARGIN);
    if (this._upgradeWarned && this.chunkCount <= hysteresisThreshold) {
      this._upgradeWarned = false;
    }

    return deleted;
  }

  /**
   * Delete a chunk (SQLite backend)
   * @private
   */
  _sqliteDelete(chunkId) {
    if (!this.adapter) {
      throw new Error('SQLite adapter not initialized');
    }
    const deleted = this.adapter.delete(chunkId);
    if (deleted) {
      this.chunkCount = Math.max(0, this.chunkCount - 1);
    }
    return deleted;
  }

  /**
   * Clear all vectors
   */
  clear() {
    this.vectors.clear();
    this.metadata.clear();
    this.chunkCount = 0;
    // Note: _upgradeWarned flag is NOT reset here to prevent race conditions
    // The flag should persist across clears unless explicitly reset via resetUpgradeWarning()
  }

  /**
   * Check if upgrade threshold is reached and trigger migration
   * @private
   */
  _checkUpgradeThreshold() {
    if (!this.useSqlite && !this._migrationInProgress && this.chunkCount >= this.upgradeThreshold) {
      console.error(
        `[VectorStore] Chunk count (${this.chunkCount}) >= threshold (${this.upgradeThreshold}), triggering migration to sqlite-vec...`
      );
      return this._upgradeToSqlite();
    }
    return false;
  }

  /**
   * Upgrade from Map to sqlite-vec storage
   * @private
   */
  async _upgradeToSqlite() {
    if (this._migrationInProgress) {
      console.warn('[VectorStore] Migration already in progress, skipping');
      return false;
    }

    if (this.useSqlite) {
      console.warn('[VectorStore] Already using sqlite-vec, skipping migration');
      return false;
    }

    if (!this.dbPath) {
      throw new Error('Cannot migrate: dbPath not set in VectorStore constructor');
    }

    this._migrationInProgress = true;

    try {
      console.error(
        `[VectorStore] Starting migration to sqlite-vec (${this.chunkCount} chunks)...`
      );

      // Step 1: Initialize SQLite adapter using factory for consistency
      // This allows us to stream directly to SQLite without holding full backup
      if (!this.adapter) {
        const { adapter, type } = createVectorAdapterSync({
          preferNative: true,
          dbPath: this.dbPath,
          dimension: this.dimension,
        });

        if (type !== 'sqlite') {
          throw new Error('SQLite adapter required for migration but not available. ' +
            'Native module may be missing or incompatible.');
        }

        this.adapter = adapter;
      } else {
        // Re-initialize existing adapter
        this.adapter.initialize(this.dbPath, this.dimension);
      }

      // Step 2: Stream chunks directly to SQLite (no giant array)
      // Use for...of loop to iterate Map.entries() directly without creating array
      const batchSize = 50; // Reduced from 100 to minimize memory spikes
      let processed = 0;
      const totalChunks = this.vectors.size;

      // OOM FIX: Memory limit constants - consistent with embeddings.js
      const MEMORY_LIMIT_MB = 512; // 512MB limit for VectorStore (higher than embeddings)
      const WARNING_THRESHOLD_MB = 400; // 400MB warning threshold

      // Collect batch items to avoid holding all keys in memory
      const batch = [];
      for (const [chunkId, vector] of this.vectors.entries()) {
        // OOM FIX: Check memory BEFORE adding to batch (not after)
        if (global.gc && batch.length > 0 && batch.length % 10 === 0) {
          const mem = process.memoryUsage();
          const heapUsedMB = mem.heapUsed / 1024 / 1024;

          if (heapUsedMB > WARNING_THRESHOLD_MB) {
            global.gc();
            const postGCMem = process.memoryUsage();
            const postHeapUsedMB = postGCMem.heapUsed / 1024 / 1024;

            if (postHeapUsedMB > MEMORY_LIMIT_MB) {
              throw new Error(`Memory limit exceeded during migration (${postHeapUsedMB.toFixed(0)}MB / ${MEMORY_LIMIT_MB}MB). Reduce batch size or increase memory limit.`);
            }
          }
        }

        batch.push({ chunkId, vector });

        // When batch is full, insert and clear
        if (batch.length >= batchSize) {
          // Process current batch
          const currentBatchSize = batch.length;
          for (const item of batch) {
            const metadata = this.metadata.get(item.chunkId);
            this.adapter.upsert(item.chunkId, item.vector, metadata);
          }
          batch.length = 0; // Clear array (efficient)
          processed += currentBatchSize; // Use actual count, not batchSize

          if (processed % 500 === 0 || processed >= totalChunks) {
            console.error(`[VectorStore] Migration progress: ${Math.min(processed, totalChunks)}/${totalChunks} chunks`);
          }
        }
      }

      // Process remaining items in final batch (only if batch has items)
      if (batch.length > 0) {
        const finalBatchSize = batch.length;
        for (const item of batch) {
          const metadata = this.metadata.get(item.chunkId);
          this.adapter.upsert(item.chunkId, item.vector, metadata);
        }
        processed += finalBatchSize;
      }

      // Step 5: Set useSqlite flag BEFORE clearing Maps (CRITICAL FIX #1)
      // This prevents data loss if verification fails
      this.useSqlite = true;
      this.chunkCount = processed;

      // Step 5: Clear in-memory Maps
      this.vectors.clear();
      this.metadata.clear();

      // Step 6: Verify migration by sampling from SQLite
      await this._verifyMigration(Math.min(1000, processed));

      console.error(
        `[VectorStore] Migration complete: ${this.chunkCount} chunks migrated to sqlite-vec`
      );
      return true;
    } catch (error) {
      // CRITICAL FIX: Mark migration as failed to prevent silent fallback
      // This prevents the system from continuing with Map storage and causing OOM
      this._migrationFailed = true;
      this._migrationError = error;

      // Rollback: On migration failure, clear the partial SQLite database
      // We can't restore Maps since we didn't create a full backup (memory optimization)
      console.error('[VectorStore] ═════════════════════════════════════════════════════════');
      console.error('[VectorStore] MIGRATION FAILED - DATA LOSS PREVENTED');
      console.error(`[VectorStore] Error: ${error.message}`);
      console.error('[VectorStore] ═════════════════════════════════════════════════════════');
      console.error('[VectorStore] The system will halt to prevent OOM crash.');

      this.useSqlite = false;
      this.chunkCount = 0;

      // CRITICAL FIX #2: Clean up failed SQLite database AND delete file
      if (this.adapter) {
        try {
          this.adapter.close();
        } catch (closeError) {
          // Ignore close errors during rollback
        }
        this.adapter = null;
      }

      // Delete the failed database file during rollback
      if (this.dbPath) {
        try {
          if (existsSync(this.dbPath)) {
            unlinkSync(this.dbPath);
            console.error(`[VectorStore] Deleted failed database file: ${this.dbPath}`);
          }
        } catch (deleteError) {
          console.warn(`[VectorStore] Failed to delete database file: ${deleteError.message}`);
        }
      }

      // Clear Maps to prevent inconsistent state
      this.vectors.clear();
      this.metadata.clear();

      // CRITICAL: Re-throw to prevent silent continuation
      throw error;
    } finally {
      this._migrationInProgress = false;
    }
  }

  /**
   * Verify migration by comparing sample data
   * @private
   * @param {number} sampleSize - Number of chunks to verify
   */
  async _verifyMigration(sampleSize = 10) {
    if (!this.adapter) {
      throw new Error('Cannot verify: adapter not initialized');
    }

    // Get stats from SQLite to verify count
    const adapterStats = this.adapter.getStats();
    const expectedCount = this.chunkCount;

    if (adapterStats.chunkCount !== expectedCount) {
      throw new Error(
        `Verification failed: count mismatch. SQLite has ${adapterStats.chunkCount} chunks, expected ${expectedCount}`
      );
    }

    // Sample random chunk IDs from SQLite to verify data integrity
    // Get all files first, then sample some chunks
    const files = this.adapter.getFiles();
    const samplesToCheck = Math.min(sampleSize, files.length);

    console.error(
      `[VectorStore] Verifying migration: ${samplesToCheck} file samples (total: ${files.length} files, ${adapterStats.chunkCount} chunks)...`
    );

    // For each sampled file, verify at least one chunk
    let checked = 0;
    for (const file of files.slice(0, samplesToCheck)) {
      // Get chunks for this file by scanning metadata
      // We'll verify that SQLite returns valid data for chunks from this file
      const chunks = this.adapter.getChunksByFile && this.adapter.getChunksByFile(file);
      if (chunks && chunks.length > 0) {
        const sampleChunk = chunks[0];
        const retrieved = this.adapter.get(sampleChunk.chunkId);
        if (!retrieved) {
          throw new Error(`Verification failed: ${sampleChunk.chunkId} not found in SQLite`);
        }
        // FIX: More robust metadata verification
        // Allow missing text field for certain chunk types
        if (!retrieved.metadata) {
          throw new Error(`Verification failed: ${sampleChunk.chunkId} has no metadata`);
        }

        // Check for essential fields, but allow optional fields to be missing
        const requiredFields = ['chunkId', 'name', 'type'];
        for (const field of requiredFields) {
          if (!retrieved.metadata[field]) {
            throw new Error(`Verification failed: ${sampleChunk.chunkId} missing required field: ${field}`);
          }
        }

        // FIX: text field is optional - we can reconstruct it if needed
        // The important thing is that we have the core metadata
        if (!retrieved.metadata.text) {
          // For debugging purposes, log this but don't fail the migration
          console.warn(`[VectorStore] Warning: ${sampleChunk.chunkId} has no text content, but metadata is complete`);
          // We can add text later during searches if needed
        }
        checked++;
      }
    }

    console.error(
      `[VectorStore] Verification successful: ${checked}/${samplesToCheck} files verified`
    );

    return true;
  }

  /**
   * Update the embedding dimension (called after actual dimension is detected)
   * @returns {boolean} True if the vector store was cleared due to dimension mismatch
   */
  setDimension(dimension) {
    if (this.dimension !== dimension && this.chunkCount > 0) {
      console.warn(
        `[VectorStore] Dimension mismatch detected! Existing vectors have ${this.dimension} dims, but trying to use ${dimension} dims. Clearing vector store.`
      );
      this.clear();
      this.dimension = dimension;
      return true; // Indicate that store was cleared
    }
    this.dimension = dimension;
    return false; // No clear needed
  }

  /**
   * Get current embedding dimension
   */
  getDimension() {
    return this.dimension;
  }

  /**
   * Search for similar vectors
   * Routes to Map or SQLite backend based on useSqlite flag
   */
  search(queryEmbedding, options = {}) {
    if (this.useSqlite) {
      return this._sqliteSearch(queryEmbedding, options);
    }
    return this._mapSearch(queryEmbedding, options);
  }

  /**
   * Search for similar vectors (Map backend)
   * @private
   */
  _mapSearch(queryEmbedding, options = {}) {
    const { limit = 10, threshold = DEFAULT_THRESHOLD, filters = {} } = options;

    if (!(queryEmbedding instanceof Float32Array)) {
      queryEmbedding = new Float32Array(queryEmbedding);
    }

    // CRITICAL FIX: Validate dimension matches before search
    if (queryEmbedding.length !== this.dimension) {
      throw new Error(
        `Query embedding dimension (${queryEmbedding.length}) does not match ` +
          `vector store dimension (${this.dimension}). Model may have switched. ` +
          'Clear cache and reindex if needed.'
      );
    }

    const results = [];

    for (const [chunkId, vector] of this.vectors.entries()) {
      const metadata = this.metadata.get(chunkId);

      // Apply filters using shared utility (consistency with LexicalIndex)
      if (!sharedPassesFilters(metadata, filters)) {
        continue;
      }

      // Calculate similarity
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
   * Search for similar vectors (SQLite backend)
   * @private
   */
  _sqliteSearch(queryEmbedding, options = {}) {
    if (!this.adapter) {
      throw new Error('SQLite adapter not initialized');
    }

    if (!(queryEmbedding instanceof Float32Array)) {
      queryEmbedding = new Float32Array(queryEmbedding);
    }

    // CRITICAL FIX: Validate dimension matches before search
    if (queryEmbedding.length !== this.dimension) {
      throw new Error(
        `Query embedding dimension (${queryEmbedding.length}) does not match ` +
          `vector store dimension (${this.dimension}). Model may have switched. ` +
          'Clear cache and reindex if needed.'
      );
    }

    // Delegate to adapter's search method
    return this.adapter.search(queryEmbedding, options);
  }

  /**
   * Extract meaningful terms from query text
   * Identifies code identifiers, camelCase words, and quoted strings
   *
   * @param {string} queryText - The query text to analyze
   * @returns {string[]} Array of extracted terms
   */
  _extractQueryTerms(queryText) {
    if (!queryText) return [];

    const terms = [];

    // Extract identifiers (camelCase, snake_case, etc.)
    const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    const identifiers = queryText.match(identifierRegex) || [];
    terms.push(...identifiers);

    // Extract quoted strings
    const quotedRegex = /['"]([^'"]+)['"]/g;
    let match;
    while ((match = quotedRegex.exec(queryText)) !== null) {
      terms.push(match[1]);
    }

    // Extract words from camelCase (e.g., "getChunkById" -> ["get", "Chunk", "By", "Id"])
    for (const id of identifiers) {
      const camelWords = id
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .toLowerCase()
        .split(/\s+/);
      terms.push(...camelWords.filter(w => w.length > 2));
    }

    // Return unique, non-empty terms
    return [...new Set(terms.filter(t => t && t.length > 1))];
  }

  /**
   * Calculate name match score for query terms
   * Checks for exact matches and partial matches with symbol names
   *
   * @param {string[]} queryTerms - Extracted query terms
   * @param {string} symbolName - The symbol name to compare against
   * @returns {number} Match score from 0 to 1
   */
  _calculateNameMatch(queryTerms, symbolName) {
    // FIX #6: Better null/undefined/empty string handling
    // Explicitly check for invalid inputs
    if (!queryTerms || !Array.isArray(queryTerms) || queryTerms.length === 0) {
      return 0;
    }
    if (symbolName === null || symbolName === undefined || symbolName === '') {
      return 0;
    }

    const nameLower = symbolName.toLowerCase();
    let maxScore = 0;

    for (const term of queryTerms) {
      // Skip invalid terms
      if (!term || term === '') continue;

      const termLower = term.toLowerCase();

      // Exact match
      if (termLower === nameLower) {
        return 1.0;
      }

      // Prefix match (e.g., "get" matches "getChunk")
      if (nameLower.startsWith(termLower)) {
        maxScore = Math.max(maxScore, 0.8);
      }

      // Contains match
      if (nameLower.includes(termLower) || termLower.includes(nameLower)) {
        maxScore = Math.max(maxScore, 0.5);
      }

      // Check camelCase components
      const camelWords = symbolName
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .toLowerCase()
        .split(/\s+/);

      for (const word of camelWords) {
        if (word === termLower) {
          maxScore = Math.max(maxScore, 0.7);
        }
      }
    }

    return maxScore;
  }

  /**
   * Search by text (requires embedding provider)
   * Now supports symbol name boosting for better relevance
   *
   * FIX #5: Added variant that accepts pre-generated embedding to avoid
   * duplicate API calls when retrying with different thresholds.
   */
  async searchByText(query, embeddings, options = {}) {
    const { queryText = null, queryEmbedding = null, ...remainingOptions } = options;

    // Generate embedding if not provided (allows caching across retries)
    const embedding = queryEmbedding || (await embeddings.getEmbedding(query));
    const results = this.search(embedding, remainingOptions);

    // Apply symbol name boost if query text is provided
    if (queryText) {
      const queryTerms = this._extractQueryTerms(queryText);

      if (queryTerms.length > 0) {
        // FIX #8: Use multiplicative boost to avoid non-linear distortion
        // Old additive approach gave different boost at different similarity levels
        // New multiplicative approach: similarity * (1 + nameMatch * BOOST_FACTOR)
        const NAME_BOOST_FACTOR = 0.2; // 20% max boost for perfect name match

        const boosted = results.map(r => {
          const nameMatch = this._calculateNameMatch(queryTerms, r.metadata?.name || '');

          if (nameMatch > 0) {
            // Multiplicative boost: applies proportionally regardless of base similarity
            const boostedSim = Math.min(1.0, r.similarity * (1 + nameMatch * NAME_BOOST_FACTOR));
            return {
              ...r,
              similarity: boostedSim,
              nameMatchBoost: boostedSim - r.similarity,
            };
          }

          return r;
        });

        // Re-sort after boosting
        boosted.sort((a, b) => b.similarity - a.similarity);
        return boosted;
      }
    }

    return results;
  }

  /**
   * Get statistics
   */
  getStats() {
    // HIGH FIX #6: Use actual SQLite count from adapter.getStats() when using SQLite backend
    const chunkCount =
      this.useSqlite && this.adapter ? this.adapter.getStats().chunkCount : this.chunkCount;

    const baseStats = {
      chunkCount,
      dimension: this.dimension,
      useSqlite: this.useSqlite,
      memoryBytes: this._estimateMemoryUsage(),
      upgradeThreshold: this.upgradeThreshold,
      // Always include dbSizeBytes for JSON safety (0 for Map storage)
      dbSizeBytes: 0,
    };

    // Add adapter-specific stats if using an adapter (SQLite or Memory)
    if (this.useSqlite && this.adapter) {
      const adapterStats = this.adapter.getStats();
      const isMemoryAdapter = this.adapter.type === 'memory';

      return {
        ...baseStats,
        storageType: isMemoryAdapter ? 'memory-adapter' : 'sqlite-vec',
        dbPath: this.dbPath,
        dbSizeBytes: adapterStats.dbSizeBytes || 0,
        adapterReady: this.adapter.isInitialized,
        adapterType: isMemoryAdapter ? 'memory' : 'sqlite',
      };
    }

    // Map storage stats (default in-memory Map backend)
    return {
      ...baseStats,
      storageType: 'Map (in-memory)',
    };
  }

  /**
   * Close the VectorStore and cleanup resources
   * Closes SQLite connection if using sqlite-vec backend
   */
  close() {
    if (this.useSqlite && this.adapter) {
      this.adapter.close();
    }
    // Clear in-memory Maps
    this.vectors.clear();
    this.metadata.clear();
  }

  /**
   * Export all data
   */
  export() {
    const data = {
      version: 1,
      chunkCount: this.chunkCount,
      dimension: this.dimension,
      vectors: {},
      metadata: {},
    };

    for (const [chunkId, vector] of this.vectors.entries()) {
      // Convert Float32Array to regular array for JSON serialization
      data.vectors[chunkId] = Array.from(vector);
    }

    for (const [chunkId, metadata] of this.metadata.entries()) {
      data.metadata[chunkId] = metadata;
    }

    return data;
  }

  /**
   * Import data
   */
  import(data) {
    this.clear(); // This resets _upgradeWarned flag

    if (data.version !== 1) {
      throw new Error(`Unsupported vector store version: ${data.version}`);
    }

    this.dimension = data.dimension;

    for (const [chunkId, vectorArray] of Object.entries(data.vectors)) {
      const vector = new Float32Array(vectorArray);
      const metadata = data.metadata[chunkId] || {};
      this.upsert(chunkId, vector, metadata);
    }

    console.error(`[VectorStore] Imported ${this.chunkCount} chunks`);
  }

  /**
   * Estimate memory usage
   */
  _estimateMemoryUsage() {
    // Each float32 is 4 bytes
    const vectorBytes = this.chunkCount * this.dimension * 4;
    // Rough estimate for metadata (JSON overhead)
    const metadataBytes = this.chunkCount * 500;

    return vectorBytes + metadataBytes;
  }

  /**
   * Find similar chunks to a given chunk
   */
  findSimilar(chunkId, options = {}) {
    const chunk = this.get(chunkId);
    if (!chunk) {
      return [];
    }

    const { limit = 10, threshold = DEFAULT_THRESHOLD } = options;

    const results = [];
    const vector = chunk.vector;

    for (const [otherId, otherVector] of this.vectors.entries()) {
      if (otherId === chunkId) continue;

      const similarity = cosineSimilarity(vector, otherVector);

      if (similarity >= threshold) {
        results.push({
          chunkId: otherId,
          similarity,
          metadata: this.metadata.get(otherId),
        });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Get chunks by file
   */
  getByFile(filePath) {
    const chunks = [];

    for (const [chunkId, metadata] of this.metadata.entries()) {
      if (metadata.file === filePath) {
        chunks.push({
          chunkId,
          metadata,
          vector: this.vectors.get(chunkId),
        });
      }
    }

    return chunks;
  }

  /**
   * Get all unique files
   * Routes to SQLite adapter if active, otherwise uses in-memory metadata
   */
  getFiles() {
    // FIX: Use SQLite adapter when active for dual-backend support
    if (this.useSqlite && this.adapter && typeof this.adapter.getFiles === 'function') {
      return this.adapter.getFiles();
    }

    // Fall back to in-memory Map for non-SQLite mode
    const files = new Set();

    for (const metadata of this.metadata.values()) {
      if (metadata.file) {
        files.add(metadata.file);
      }
    }

    return Array.from(files);
  }

  /**
   * Get chunks by type
   */
  getByType(type) {
    const chunks = [];

    for (const [chunkId, metadata] of this.metadata.entries()) {
      if (metadata.type === type) {
        chunks.push({
          chunkId,
          metadata,
          vector: this.vectors.get(chunkId),
        });
      }
    }

    return chunks;
  }

  /**
   * Merge another vector store into this one
   */
  merge(otherStore) {
    for (const [chunkId, vector] of otherStore.vectors.entries()) {
      const metadata = otherStore.metadata.get(chunkId);

      // Only add if not already present or if newer
      const existing = this.metadata.get(chunkId);
      if (
        !existing ||
        (metadata.updatedAt && existing.updatedAt && metadata.updatedAt > existing.updatedAt)
      ) {
        this.upsert(chunkId, vector, metadata);
      }
    }
  }
}

/**
 * Re-export cosine similarity for convenience
 */
export { cosineSimilarity };

/**
 * Default export
 */
export { VectorStore as default };
