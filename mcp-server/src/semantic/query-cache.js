/**
 * Semantic Query Cache
 *
 * Caches query embeddings to reduce redundant API calls.
 * Uses semantic similarity deduplication: if a new query is semantically
 * similar (cosine similarity >= threshold) to a cached query, reuse the
 * cached embedding instead of generating a new one.
 *
 * Model-aware: Tracks which embedding model generated each cached embedding
 * to prevent cross-model similarity comparisons (which are meaningless).
 *
 * Expected performance improvement: 70-90% reduction in embedding API calls
 * for typical search patterns with query expansion.
 */

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG = {
  /**
   * Semantic similarity threshold for cache hits
   * Queries with similarity >= this value are considered duplicates
   *
   * Default: 0.92 (high precision to avoid false matches)
   * Range: 0.85-0.98
   */
  SIMILARITY_THRESHOLD: 0.92,

  /**
   * Maximum number of cached queries
   *
   * Default: 1000 (balances memory usage vs cache hit rate)
   */
  MAX_CACHE_SIZE: 1000,

  /**
   * TTL for cache entries in milliseconds
   *
   * Default: 1 hour (embeddings for same query remain valid)
   */
  CACHE_TTL: 60 * 60 * 1000,

  /**
   * Trigger cleanup when cache exceeds this fraction of MAX_CACHE_SIZE
   *
   * Default: 1.5 (cleanup starts at 150% capacity)
   */
  CLEANUP_TRIGGER_MULTIPLIER: 1.5,

  /**
   * Target size after LRU eviction (fraction of MAX_CACHE_SIZE)
   *
   * Default: 0.9 (evict to 90% capacity to avoid immediate re-eviction)
   */
  LRU_TARGET_SIZE_RATIO: 0.9
};

/**
 * Semantic Query Cache class
 */
export class SemanticQueryCache {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Cache storage: query -> { embedding, timestamp, accessCount, modelName }
    this.cache = new Map();

    // For similarity-based lookup: normalized query -> embedding
    // Stores lowercase, trimmed versions for quick exact match check
    this.normalizedCache = new Map();

    // FIX: Deduplicate concurrent requests for same query
    // Stores in-flight compute promises to prevent redundant API calls
    this.pendingComputes = new Map();

    // Track current model for cache validation
    this.currentModel = null;

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      semanticHits: 0,  // Hits via similarity (not exact match)
      evictions: 0,
      totalQueries: 0,
      deduplicatedHits: 0,  // Hits from pending computes
      modelMismatches: 0  // Count of cross-model cache misses
    };
  }

  /**
   * Normalize query for caching
   * @param {string} query - Original query
   * @returns {string} Normalized query
   */
  _normalizeQuery(query) {
    return query.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Calculate cosine similarity between two embeddings
   * @param {number[]} a - First embedding
   * @param {number[]} b - Second embedding
   * @returns {number} Cosine similarity (0-1)
   */
  _cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Check if cache entry is expired
   * @param {Object} entry - Cache entry
   * @returns {boolean} True if expired
   */
  _isExpired(entry) {
    return Date.now() - entry.timestamp > this.config.CACHE_TTL;
  }

  /**
   * Evict expired entries
   */
  _evictExpired() {
    const now = Date.now();
    for (const [query, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.CACHE_TTL) {
        this.cache.delete(query);
        this.normalizedCache.delete(this._normalizeQuery(query));
        this.stats.evictions++;
      }
    }
  }

  /**
   * Enforce cache size limit (LRU eviction)
   * FIX: Evict to target size (90% of max) instead of just below threshold
   * This prevents cache from repeatedly hitting the limit
   */
  _evictLRU() {
    const targetSize = Math.floor(this.config.MAX_CACHE_SIZE * this.config.LRU_TARGET_SIZE_RATIO);
    if (this.cache.size <= targetSize) return;

    // Sort entries by access time (oldest first)
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    // Evict oldest entries to reach target size
    const toEvict = entries.slice(0, this.cache.size - targetSize);
    for (const [query, _] of toEvict) {
      this.cache.delete(query);
      this.normalizedCache.delete(this._normalizeQuery(query));
      this.stats.evictions++;
    }
  }

  /**
   * Get or compute embedding for a query
   *
   * @param {string} query - Query text
   * @param {Function} computeFn - Async function to compute embedding
   * @param {Object} existingEmbedding - Optional existing embedding for similarity check
   * @param {string} modelName - Name of the embedding model being used (for model-aware caching)
   * @returns {Promise<number[]>} Embedding vector
   */
  async get(query, computeFn, existingEmbedding = null, modelName = null) {
    this.stats.totalQueries++;

    const normalized = this._normalizeQuery(query);

    // Check exact match first (fastest path)
    if (this.normalizedCache.has(normalized)) {
      const entry = this.cache.get(this.normalizedCache.get(normalized));

      // Validate model match if modelName is provided
      if (modelName && entry.modelName && entry.modelName !== modelName) {
        // Model changed - treat as cache miss
        console.error(`[QueryCache] Model mismatch for cached query "${query}": cached=${entry.modelName}, current=${modelName}`);
        this.stats.modelMismatches++;
        // Remove stale entry
        this.cache.delete(this.normalizedCache.get(normalized));
        this.normalizedCache.delete(normalized);
      } else {
        // Valid cache hit
        this.stats.hits++;
        entry.lastAccess = Date.now();
        entry.accessCount++;
        return entry.embedding;
      }
    }

    // CRITICAL FIX: Use atomic setDefault pattern for deduplication
    // Check if there's already a pending compute for this query
    if (this.pendingComputes.has(query)) {
      this.stats.deduplicatedHits++;
      console.error(`[QueryCache] Deduplicated concurrent request for: "${query}"`);
      return await this.pendingComputes.get(query);
    }

    // Check semantic similarity if we have an embedding to compare against
    // IMPORTANT: Only compare embeddings from the same model
    if (existingEmbedding) {
      for (const [cachedQuery, entry] of this.cache.entries()) {
        if (this._isExpired(entry)) continue;

        // Skip if models don't match (cross-model similarity is meaningless)
        if (modelName && entry.modelName && entry.modelName !== modelName) {
          continue;
        }

        const similarity = this._cosineSimilarity(existingEmbedding, entry.embedding);
        if (similarity >= this.config.SIMILARITY_THRESHOLD) {
          this.stats.semanticHits++;
          entry.lastAccess = Date.now();
          entry.accessCount++;

          // Also store this query as an alias for the cached embedding
          this.cache.set(query, entry);
          this.normalizedCache.set(normalized, query);

          console.error(`[QueryCache] Semantic hit: "${query}" ~ "${cachedQuery}" (similarity: ${similarity.toFixed(3)}, model: ${entry.modelName || 'unknown'})`);
          return entry.embedding;
        }
      }
    }

    // Cache miss - compute new embedding
    this.stats.misses++;

    // CRITICAL FIX: Create and store promise atomically before async work
    // This prevents race condition where multiple concurrent requests
    // could all pass the has() check before set() completes
    const computePromise = (async () => {
      try {
        // Periodic cleanup before computing
        if (this.cache.size > this.config.MAX_CACHE_SIZE * this.config.CLEANUP_TRIGGER_MULTIPLIER) {
          this._evictExpired();
          this._evictLRU();
        }

        // Compute embedding
        const embedding = await computeFn();

        // Store in cache with model tracking
        const entry = {
          embedding,
          timestamp: Date.now(),
          lastAccess: Date.now(),
          accessCount: 1,
          modelName: modelName || this.currentModel  // Track which model generated this
        };

        this.cache.set(query, entry);
        this.normalizedCache.set(normalized, query);

        // Update current model tracker
        if (modelName) {
          this.currentModel = modelName;
        }

        return embedding;
      } finally {
        // Always remove from pending computes, even if computation fails
        this.pendingComputes.delete(query);
      }
    })();

    // Store promise BEFORE awaiting (atomic deduplication)
    this.pendingComputes.set(query, computePromise);

    return await computePromise;
  }

  /**
   * Check if a query is cached (without computing)
   * @param {string} query - Query text
   * @returns {boolean} True if cached
   */
  has(query) {
    const normalized = this._normalizeQuery(query);
    return this.normalizedCache.has(normalized);
  }

  /**
   * Get cached entry without computing
   * @param {string} query - Query text
   * @returns {number[]|null} Cached embedding or null
   */
  getCached(query) {
    const normalized = this._normalizeQuery(query);
    if (this.normalizedCache.has(normalized)) {
      const entry = this.cache.get(this.normalizedCache.get(normalized));
      entry.lastAccess = Date.now();
      entry.accessCount++;
      return entry.embedding;
    }
    return null;
  }

  /**
   * Clear all cached entries
   */
  clear() {
    this.cache.clear();
    this.normalizedCache.clear();
    this.currentModel = null;
    this.stats = {
      hits: 0,
      misses: 0,
      semanticHits: 0,
      evictions: 0,
      totalQueries: 0,
      deduplicatedHits: 0,
      modelMismatches: 0
    };
  }

  /**
   * Get cache statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const hitRate = this.stats.totalQueries > 0
      ? (this.stats.hits / this.stats.totalQueries * 100).toFixed(1)
      : 0;

    const semanticHitRate = this.stats.totalQueries > 0
      ? (this.stats.semanticHits / this.stats.totalQueries * 100).toFixed(1)
      : 0;

    return {
      ...this.stats,
      cacheSize: this.cache.size,
      hitRate: `${hitRate}%`,
      semanticHitRate: `${semanticHitRate}%`,
      currentModel: this.currentModel
    };
  }

  /**
   * Pre-warm cache with queries
   * @param {Array<{query: string, embedding: number[], modelName?: string}>} entries
   */
  preWarm(entries) {
    for (const { query, embedding, modelName } of entries) {
      const normalized = this._normalizeQuery(query);

      const entry = {
        embedding,
        timestamp: Date.now(),
        lastAccess: Date.now(),
        accessCount: 0,
        modelName: modelName || this.currentModel
      };

      this.cache.set(query, entry);
      this.normalizedCache.set(normalized, query);
    }

    this._evictLRU();
  }

  /**
   * Set the current model (for cache tracking)
   * @param {string} modelName - Name of the current embedding model
   */
  setCurrentModel(modelName) {
    if (this.currentModel !== modelName) {
      console.error(`[QueryCache] Current model changed from "${this.currentModel}" to "${modelName}", clearing cache`);
      this.currentModel = modelName;
      this.clear();  // Clear cache to prevent cross-model pollution
    }
  }

  /**
   * Get the current model
   * @returns {string|null} Current model name
   */
  getCurrentModel() {
    return this.currentModel;
  }
}

/**
 * Default export
 */
export default SemanticQueryCache;
