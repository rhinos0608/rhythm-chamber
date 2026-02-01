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
   * Minimum interval between full expired-entry sweeps.
   *
   * The cache must enforce TTL, but sweeping the entire cache on every query
   * creates an O(n) hot path. This interval bounds sweep frequency.
   */
  CLEANUP_INTERVAL_MS: 60 * 1000,

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
  LRU_TARGET_SIZE_RATIO: 0.9,
};

/**
 * Semantic Query Cache class
 */
export class SemanticQueryCache {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Cache storage: cacheKey -> { embedding, timestamp, accessCount, modelName, query }
    // cacheKey is model-scoped to prevent cross-model reuse.
    this.cache = new Map();

    // For exact lookup: model::normalizedQuery -> cacheKey
    this.normalizedCache = new Map();

    // Reverse index: cacheKey -> Set(model::normalizedQuery)
    // Used so evictions remove all alias normalized keys, not just canonical.
    this.normalizedRefs = new Map();

    // Deduplicate concurrent requests for same (model, normalizedQuery)
    this.pendingComputes = new Map();

    // Track current model for convenience defaults in has()/getCached()
    this.currentModel = null;

    // Periodic cleanup tracking
    this._lastExpiredSweep = 0;

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      semanticHits: 0, // Hits via similarity (not exact match)
      evictions: 0,
      totalQueries: 0,
      deduplicatedHits: 0, // Hits from pending computes
      modelMismatches: 0, // Retained for backward compatibility in stats
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

  _getModelKey(modelName) {
    return modelName || this.currentModel || 'unknown';
  }

  _makeCacheKey(modelKey, query) {
    return `${modelKey}::${query}`;
  }

  _makeNormalizedKey(modelKey, normalizedQuery) {
    return `${modelKey}::${normalizedQuery}`;
  }

  _addNormalizedRef(cacheKey, normalizedKey) {
    this.normalizedCache.set(normalizedKey, cacheKey);

    let refs = this.normalizedRefs.get(cacheKey);
    if (!refs) {
      refs = new Set();
      this.normalizedRefs.set(cacheKey, refs);
    }
    refs.add(normalizedKey);
  }

  _removeNormalizedKey(normalizedKey) {
    const cacheKey = this.normalizedCache.get(normalizedKey);
    if (!cacheKey) {
      this.normalizedCache.delete(normalizedKey);
      return;
    }

    this.normalizedCache.delete(normalizedKey);

    const refs = this.normalizedRefs.get(cacheKey);
    if (refs) {
      refs.delete(normalizedKey);
      if (refs.size === 0) {
        this.normalizedRefs.delete(cacheKey);
      }
    }
  }

  _removeCacheKey(cacheKey) {
    this.cache.delete(cacheKey);

    const refs = this.normalizedRefs.get(cacheKey);
    if (refs) {
      for (const normalizedKey of refs) {
        this.normalizedCache.delete(normalizedKey);
      }
      this.normalizedRefs.delete(cacheKey);
    }
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
    for (const [cacheKey, entry] of Array.from(this.cache.entries())) {
      if (now - entry.timestamp > this.config.CACHE_TTL) {
        this._removeCacheKey(cacheKey);
        this.stats.evictions++;
      }
    }
  }

  /**
   * Enforce cache size limit (LRU eviction)
   */
  _evictLRU() {
    const targetSize = Math.floor(this.config.MAX_CACHE_SIZE * this.config.LRU_TARGET_SIZE_RATIO);
    if (this.cache.size <= targetSize) return;

    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].lastAccess - b[1].lastAccess
    );

    const toEvict = entries.slice(0, this.cache.size - targetSize);
    for (const [cacheKey] of toEvict) {
      this._removeCacheKey(cacheKey);
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

    // If callers supply a model, treat it as the default for subsequent
    // has()/getCached() calls (which may omit modelName).
    if (modelName) {
      this.currentModel = modelName;
    }

    // Periodically sweep expired entries (avoid O(n) on every get).
    if (
      !this._lastExpiredSweep ||
      Date.now() - this._lastExpiredSweep > this.config.CLEANUP_INTERVAL_MS
    ) {
      this._evictExpired();
      this._lastExpiredSweep = Date.now();
    }

    const normalized = this._normalizeQuery(query);
    const modelKey = this._getModelKey(modelName);

    const normalizedKey = this._makeNormalizedKey(modelKey, normalized);
    const pendingKey = normalizedKey;

    if (this.pendingComputes.has(pendingKey)) {
      this.stats.deduplicatedHits++;
      console.error(`[QueryCache] Deduplicated concurrent request for: "${query}"`);
      return await this.pendingComputes.get(pendingKey);
    }

    // Exact match (fast path)
    if (this.normalizedCache.has(normalizedKey)) {
      const cacheKey = this.normalizedCache.get(normalizedKey);
      const entry = this.cache.get(cacheKey);

      if (!entry) {
        this._removeNormalizedKey(normalizedKey);
      } else if (this._isExpired(entry)) {
        this._removeCacheKey(cacheKey);
        this.stats.evictions++;
      } else {
        this.stats.hits++;
        entry.lastAccess = Date.now();
        entry.accessCount++;
        return entry.embedding;
      }
    }

    // Semantic similarity check (same model only)
    if (existingEmbedding) {
      for (const [cacheKey, entry] of this.cache.entries()) {
        if (entry.modelName !== modelKey) continue;
        if (this._isExpired(entry)) continue;

        const similarity = this._cosineSimilarity(existingEmbedding, entry.embedding);
        if (similarity >= this.config.SIMILARITY_THRESHOLD) {
          this.stats.semanticHits++;
          entry.lastAccess = Date.now();
          entry.accessCount++;

          // Alias this normalized query to the same cache entry.
          this._addNormalizedRef(cacheKey, normalizedKey);

          console.error(
            `[QueryCache] Semantic hit: "${query}" ~ "${entry.query}" (similarity: ${similarity.toFixed(3)}, model: ${entry.modelName || 'unknown'})`
          );
          return entry.embedding;
        }
      }
    }

    // Cache miss
    this.stats.misses++;

    const cacheKey = this._makeCacheKey(modelKey, query);

    const computePromise = (async () => {
      try {
        if (this.cache.size > this.config.MAX_CACHE_SIZE * this.config.CLEANUP_TRIGGER_MULTIPLIER) {
          this._evictExpired();
          this._evictLRU();
        }

        const embedding = await computeFn();

        const entry = {
          embedding,
          timestamp: Date.now(),
          lastAccess: Date.now(),
          accessCount: 1,
          modelName: modelKey,
          query,
        };

        this.cache.set(cacheKey, entry);
        this._addNormalizedRef(cacheKey, normalizedKey);

        return embedding;
      } finally {
        this.pendingComputes.delete(pendingKey);
      }
    })();

    this.pendingComputes.set(pendingKey, computePromise);
    return await computePromise;
  }

  /**
   * Check if a query is cached (without computing)
   * @param {string} query - Query text
   * @param {string} modelName - Optional model name to scope the cache lookup
   * @returns {boolean} True if cached
   */
  has(query, modelName = null) {
    const normalized = this._normalizeQuery(query);
    const modelKey = this._getModelKey(modelName);
    const normalizedKey = this._makeNormalizedKey(modelKey, normalized);

    if (!this.normalizedCache.has(normalizedKey)) {
      return false;
    }

    const cacheKey = this.normalizedCache.get(normalizedKey);
    const entry = this.cache.get(cacheKey);

    if (!entry || this._isExpired(entry)) {
      this._removeCacheKey(cacheKey);
      return false;
    }

    return true;
  }

  /**
   * Get cached entry without computing
   * @param {string} query - Query text
   * @param {string} modelName - Optional model name to scope the cache lookup
   * @returns {number[]|null} Cached embedding or null
   */
  getCached(query, modelName = null) {
    const normalized = this._normalizeQuery(query);
    const modelKey = this._getModelKey(modelName);
    const normalizedKey = this._makeNormalizedKey(modelKey, normalized);

    if (!this.normalizedCache.has(normalizedKey)) {
      return null;
    }

    const cacheKey = this.normalizedCache.get(normalizedKey);
    const entry = this.cache.get(cacheKey);

    if (!entry || this._isExpired(entry)) {
      this._removeCacheKey(cacheKey);
      return null;
    }

    entry.lastAccess = Date.now();
    entry.accessCount++;
    return entry.embedding;
  }

  /**
   * Clear all cached entries
   */
  clear() {
    this.cache.clear();
    this.normalizedCache.clear();
    this.normalizedRefs.clear();
    this.pendingComputes.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      semanticHits: 0,
      evictions: 0,
      totalQueries: 0,
      deduplicatedHits: 0,
      modelMismatches: 0,
    };
  }

  /**
   * Get cache statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const hitRate =
      this.stats.totalQueries > 0
        ? ((this.stats.hits / this.stats.totalQueries) * 100).toFixed(1)
        : 0;

    const semanticHitRate =
      this.stats.totalQueries > 0
        ? ((this.stats.semanticHits / this.stats.totalQueries) * 100).toFixed(1)
        : 0;

    return {
      ...this.stats,
      cacheSize: this.cache.size,
      hitRate: `${hitRate}%`,
      semanticHitRate: `${semanticHitRate}%`,
      currentModel: this.currentModel,
    };
  }

  /**
   * Pre-warm cache with queries
   * @param {Array<{query: string, embedding: number[], modelName?: string}>} entries
   */
  preWarm(entries) {
    for (const { query, embedding, modelName } of entries) {
      const normalized = this._normalizeQuery(query);
      const modelKey = this._getModelKey(modelName);
      const normalizedKey = this._makeNormalizedKey(modelKey, normalized);
      const cacheKey = this._makeCacheKey(modelKey, query);

      const entry = {
        embedding,
        timestamp: Date.now(),
        lastAccess: Date.now(),
        accessCount: 0,
        modelName: modelKey,
        query,
      };

      this.cache.set(cacheKey, entry);
      this._addNormalizedRef(cacheKey, normalizedKey);
    }

    this._evictLRU();
  }

  /**
   * Set the current model (used only as a default for has()/getCached())
   * @param {string} modelName - Name of the current embedding model
   */
  setCurrentModel(modelName) {
    this.currentModel = modelName;
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
