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
  }

  /**
   * Add or update a vector
   * Routes to Map or SQLite backend based on useSqlite flag
   */
  upsert(chunkId, embedding, metadata = {}) {
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

    this.chunkCount++; // Note: This is approximate; use getStats() for accurate count
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
      console.error(`[VectorStore] Starting migration to sqlite-vec (${this.chunkCount} chunks)...`);

      // Step 1: Create in-memory backup
      const backup = {
        vectors: new Map(this.vectors),
        metadata: new Map(this.metadata),
        chunkCount: this.chunkCount,
        useSqlite: false,
      };

      // Step 2: Initialize SQLite adapter
      if (!this.adapter) {
        this.adapter = new SqliteVectorAdapter();
      }
      this.adapter.initialize(this.dbPath, this.dimension);

      // Step 3: Batch migrate all vectors (100 chunks per batch)
      const batchSize = 100;
      const chunks = Array.from(this.vectors.keys());

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);

        for (const chunkId of batch) {
          const vector = this.vectors.get(chunkId);
          const metadata = this.metadata.get(chunkId);

          this.adapter.upsert(chunkId, vector, metadata);
        }

        if ((i + batchSize) % 500 === 0 || i + batchSize >= chunks.length) {
          const processed = Math.min(i + batchSize, chunks.length);
          console.error(`[VectorStore] Migration progress: ${processed}/${chunks.length} chunks`);
        }
      }

      // Step 4: Clear in-memory Maps
      this.vectors.clear();
      this.metadata.clear();

      // Step 5: Set useSqlite flag
      this.useSqlite = true;
      this.chunkCount = backup.chunkCount;

      // Step 6: Verify migration (use backup for comparison since Maps are cleared)
      await this._verifyMigration(10, backup);

      console.error(`[VectorStore] Migration complete: ${this.chunkCount} chunks migrated to sqlite-vec`);
      return true;
    } catch (error) {
      // Rollback: Restore from backup
      console.error(`[VectorStore] Migration failed, rolling back:`, error.message);
      this.vectors = backup.vectors;
      this.metadata = backup.metadata;
      this.useSqlite = false;

      // Clean up failed SQLite database
      if (this.adapter) {
        try {
          this.adapter.close();
        } catch (closeError) {
          // Ignore close errors during rollback
        }
        this.adapter = null;
      }

      throw error;
    } finally {
      this._migrationInProgress = false;
    }
  }

  /**
   * Verify migration by comparing sample data
   * @private
   * @param {number} sampleSize - Number of chunks to verify
   * @param {Object} backup - The backup data to compare against
   */
  async _verifyMigration(sampleSize = 10, backup = null) {
    if (!this.adapter) {
      throw new Error('Cannot verify: adapter not initialized');
    }

    // Use backup metadata if provided, otherwise use current metadata
    const metadataToCompare = backup ? backup.metadata : this.metadata;
    const allIds = Array.from(metadataToCompare.keys());
    const sample = allIds.sort(() => 0.5 - Math.random()).slice(0, sampleSize);

    console.error(`[VectorStore] Verifying migration with ${sample.length} samples...`);

    for (const chunkId of sample) {
      const fromAdapter = this.adapter.get(chunkId);
      const fromBackup = metadataToCompare.get(chunkId);

      if (!fromAdapter) {
        throw new Error(`Verification failed: ${chunkId} not found in SQLite`);
      }

      if (!fromBackup) {
        throw new Error(`Verification failed: ${chunkId} not found in backup metadata`);
      }

      // Compare metadata
      if (fromAdapter.metadata.text !== fromBackup.text) {
        throw new Error(`Verification failed: text mismatch for ${chunkId}`);
      }
    }

    console.error(`[VectorStore] Verification successful: ${sample.length}/${sample.length} chunks match`);
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
    const baseStats = {
      chunkCount: this.chunkCount,
      dimension: this.dimension,
      useSqlite: this.useSqlite,
      memoryBytes: this._estimateMemoryUsage(),
      upgradeThreshold: this.upgradeThreshold,
    };

    // Add SQLite-specific stats if using sqlite-vec
    if (this.useSqlite && this.adapter) {
      const adapterStats = this.adapter.getStats();

      return {
        ...baseStats,
        storageType: 'sqlite-vec',
        dbPath: this.dbPath,
        dbSizeBytes: adapterStats.dbSizeBytes,
        adapterReady: this.adapter.isInitialized,
      };
    }

    // Map storage stats
    return {
      ...baseStats,
      storageType: 'Map (in-memory)',
    };
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
   */
  getFiles() {
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
