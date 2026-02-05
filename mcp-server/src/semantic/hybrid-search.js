/**
 * Hybrid Search Engine
 *
 * Combines vector semantic search with FTS5 keyword search using
 * Reciprocal Rank Fusion (RRF) algorithm.
 *
 * Benefits:
 * - Vector search finds conceptually similar code
 * - Keyword search finds exact matches and identifiers
 * - RRF merges rankings intelligently
 * - Adaptive weights based on query analysis
 *
 * Research:
 * - MongoDB RRF: https://www.mongodb.com/resources/basics/reciprocal-rank-fusion
 * - Alex Garcia Hybrid Search: https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html
 *
 * Phase 3: Hybrid Search
 */

/**
 * Default RRF configuration
 */
const DEFAULT_RRF_K = 60; // RRF constant (standard in IR literature)
const DEFAULT_WEIGHT_VECTOR = 1.0;
const DEFAULT_WEIGHT_KEYWORD = 1.0;
const MAX_TOTAL_RESULTS = 100; // Maximum total results to prevent memory exhaustion

/**
 * Validate search result structure
 * Ensures results have required fields before processing
 * @param {*} result - Result to validate
 * @returns {boolean} True if valid
 */
function validateResult(result) {
  if (!result || typeof result !== 'object') {
    return false;
  }

  // Must have either chunkId or id
  if (!result.chunkId && !result.id) {
    return false;
  }

  return true;
}

/**
 * Normalize ID from result
 * Handles both chunkId and id fields
 * @param {Object} result - Search result
 * @returns {string} Normalized ID
 */
function normalizeResultId(result) {
  return result.chunkId || result.id;
}

/**
 * Hybrid Search Engine class
 */
export class HybridSearchEngine {
  constructor(vectorAdapter, ftsAdapter) {
    this.vector = vectorAdapter;
    this.fts = ftsAdapter;
  }

  /**
   * Search with RRF merging
   * @param {string} query - Search query
   * @param {Float32Array|Array} queryEmbedding - Query embedding vector
   * @param {Object} options - Search options
   * @returns {Array} Merged and ranked results
   */
  async search(query, queryEmbedding, options = {}) {
    if (!this.vector && !this.fts) {
      throw new Error('HybridSearchEngine requires at least one adapter (vector or fts)');
    }

    const {
      k = 20, // Results per system
      rrf_k = DEFAULT_RRF_K, // RRF constant
      weights = null, // Auto-calculate if not provided
      contentType = 'all', // 'code', 'docs', 'all'
    } = options;

    // Calculate perSearchLimit to prevent memory exhaustion
    // If k is large, limit it to avoid loading too many results
    const perSearchLimit = Math.min(k, MAX_TOTAL_RESULTS / 2);

    // Calculate adaptive weights if not provided
    const finalWeights = weights || this.calculateWeights(query);

    // Execute searches in parallel with graceful degradation
    const results = await Promise.allSettled([
      this._vectorSearch(queryEmbedding, { k: perSearchLimit, contentType, ...options }),
      this._keywordSearch(query, { k: perSearchLimit, contentType, ...options }),
    ]);

    // Extract results, using empty arrays for failed searches
    const vectorResults = results[0].status === 'fulfilled' ? results[0].value : [];
    const keywordResults = results[1].status === 'fulfilled' ? results[1].value : [];

    // Log failures for monitoring
    if (results[0].status === 'rejected') {
      console.warn('[HybridSearchEngine] Vector search failed, continuing with keyword results:', results[0].reason?.message);
    }
    if (results[1].status === 'rejected') {
      console.warn('[HybridSearchEngine] Keyword search failed, continuing with vector results:', results[1].reason?.message);
    }

    // RRF merging with result limit
    const merged = this._mergeRRF(vectorResults, keywordResults, {
      rrf_k,
      weights: finalWeights,
    });

    // Limit total results to prevent memory exhaustion
    return merged.slice(0, MAX_TOTAL_RESULTS);
  }

  /**
   * Vector search only
   * @private
   */
  async _vectorSearch(queryEmbedding, options) {
    if (!this.vector) {
      return [];
    }

    try {
      return this.vector.search(queryEmbedding, options);
    } catch (error) {
      console.error('[HybridSearchEngine] Vector search error:', error.message);
      return [];
    }
  }

  /**
   * Keyword search only
   * @private
   */
  async _keywordSearch(query, options) {
    if (!this.fts) {
      return [];
    }

    try {
      return await this.fts.search(query, options);
    } catch (error) {
      console.error('[HybridSearchEngine] Keyword search error:', error.message);
      return [];
    }
  }

  /**
   * Reciprocal Rank Fusion algorithm
   * Based on: https://www.mongodb.com/resources/basics/reciprocal-rank-fusion
   *
   * Formula: score = weight / (k + rank)
   *
   * @private
   */
  _mergeRRF(vectorResults, keywordResults, { rrf_k, weights }) {
    // Validate inputs
    if (!Array.isArray(vectorResults) || !Array.isArray(keywordResults)) {
      throw new Error('[HybridSearchEngine] Results must be arrays');
    }

    // Validate all results have required fields
    const allResults = [...vectorResults, ...keywordResults];
    for (const result of allResults) {
      if (!validateResult(result)) {
        throw new Error(`[HybridSearchEngine] Invalid result structure: missing required field (chunkId or id)`);
      }
    }

    const scores = new Map();
    const details = new Map();

    // Vector contributions
    vectorResults.forEach((result, index) => {
      const rank = index + 1;
      const score = weights.vector / (rrf_k + rank);
      const id = normalizeResultId(result);

      scores.set(id, (scores.get(id) || 0) + score);

      details.set(id, {
        id,
        chunkId: result.chunkId || id,
        text: result.text || result.content,
        file: result.file,
        line: result.line,
        type: result.type,
        layer: result.layer,
        vec_rank: rank,
        vec_distance: result.distance,
        vec_similarity: result.similarity,
        fts_rank: null,
        fts_score: null,
        combined_score: 0,
        sources: ['vector'],
      });
    });

    // Keyword contributions
    keywordResults.forEach((result, index) => {
      const rank = index + 1;
      const score = weights.keyword / (rrf_k + rank);
      const id = normalizeResultId(result);

      scores.set(id, (scores.get(id) || 0) + score);

      if (details.has(id)) {
        const detail = details.get(id);
        detail.fts_rank = rank;
        detail.fts_score = result.score;
        detail.highlighted = result.highlighted || result.highlighted;
        if (!detail.sources.includes('keyword')) {
          detail.sources.push('keyword');
        }
      } else {
        details.set(id, {
          id,
          chunkId: result.chunkId || id,
          text: result.text,
          highlighted: result.highlighted,
          file: result.file,
          line: result.line,
          type: result.type,
          fts_rank: rank,
          fts_score: result.score,
          vec_rank: null,
          vec_distance: null,
          vec_similarity: null,
          combined_score: 0,
          sources: ['keyword'],
        });
      }
    });

    // Update combined scores
    details.forEach((detail, id) => {
      detail.combined_score = scores.get(id);
    });

    // Sort by combined score (descending)
    return Array.from(details.values()).sort((a, b) => b.combined_score - a.combined_score);
  }

  /**
   * Adaptive weight calculation based on query analysis
   * Research shows 35% improvement over static weights
   *
   * @param {string} query - Search query
   * @returns {Object} Weights { vector, keyword }
   */
  calculateWeights(query) {
    const analysis = this._analyzeQuery(query);

    if (analysis.isExactMatch || analysis.isCodeIdentifier) {
      // Favor keyword for exact matches
      return { vector: 0.3, keyword: 1.0 };
    }

    if (analysis.isNaturalLanguage) {
      // Favor semantic for natural language
      return { vector: 1.0, keyword: 0.5 };
    }

    if (analysis.isFilePath) {
      // Favor keyword for file paths
      return { vector: 0.2, keyword: 1.0 };
    }

    // Default: balanced
    return { vector: DEFAULT_WEIGHT_VECTOR, keyword: DEFAULT_WEIGHT_KEYWORD };
  }

  /**
   * Analyze query to determine search strategy
   * @private
   */
  _analyzeQuery(query) {
    const trimmed = query.trim();

    return {
      // Exact match in quotes
      isExactMatch: /^["'].*["']$/.test(trimmed),

      // Code identifier (camelCase, snake_case, dot.notation)
      isCodeIdentifier: /^[a-zA-Z_][a-zA-Z0-9_\.]*$/.test(trimmed) && /\w{2,}/.test(trimmed),

      // Natural language question
      isNaturalLanguage: /\b(how|what|when|where|why|who|which|can|could|should|would|is|are|do|does)\b/i.test(query),

      // File path
      isFilePath: /[\/\\]/.test(query) && /\.[a-z]{2,4}$/i.test(query),
    };
  }

  /**
   * Symbol-aware hybrid search
   * Combines symbol search with hybrid search for code navigation
   *
   * @param {string} query - Symbol name or query
   * @param {Float32Array|Array} queryEmbedding - Query embedding
   * @param {Object} symbolIndex - SymbolIndex instance
   * @param {Object} options - Search options
   * @returns {Array} Combined symbol + hybrid results
   */
  async searchSymbols(query, queryEmbedding, symbolIndex, options = {}) {
    const { limit = 10 } = options;

    // 1. FTS5 symbol search
    let symbolResults = [];
    if (symbolIndex && symbolIndex.searchSymbols) {
      symbolResults = symbolIndex.searchSymbols(query, { limit: limit * 2 });
    }

    // 2. Hybrid search for context
    const hybridResults = await this.search(query, queryEmbedding, {
      ...options,
      k: limit * 2,
    });

    // 3. Merge: boost symbol matches
    return this._mergeSymbolHybrid(symbolResults, hybridResults);
  }

  /**
   * Merge symbol results with hybrid results
   * Symbol matches get boosted
   * @private
   */
  _mergeSymbolHybrid(symbolResults, hybridResults) {
    const boosted = new Map();

    // Add hybrid results with base score
    for (const result of hybridResults) {
      const id = result.chunkId || result.id;
      boosted.set(id, {
        ...result,
        symbol_match: false,
      });
    }

    // Boost or add symbol results
    for (const symbol of symbolResults) {
      const id = symbol.chunkId;

      if (boosted.has(id)) {
        // Boost existing result
        const existing = boosted.get(id);
        existing.combined_score *= 1.5; // 50% boost
        existing.symbol_match = true;
        existing.symbol_name = symbol.name;
        existing.symbol_type = symbol.type;
      } else {
        // Add new result from symbols
        boosted.set(id, {
          id,
          chunkId: id,
          text: symbol.text || '',
          file: symbol.file,
          line: symbol.line,
          type: symbol.type,
          combined_score: 0.8, // High base score for symbol matches
          sources: ['symbol'],
          symbol_match: true,
          symbol_name: symbol.name,
          symbol_type: symbol.type,
        });
      }
    }

    // Sort by combined score
    return Array.from(boosted.values()).sort((a, b) => b.combined_score - a.combined_score);
  }

  /**
   * Get statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const stats = {
      vector: null,
      fts: null,
    };

    if (this.vector) {
      stats.vector = this.vector.getStats ? this.vector.getStats() : { type: 'vector' };
    }

    if (this.fts) {
      stats.fts = this.fts.getStats ? this.fts.getStats() : { type: 'fts5' };
    }

    return stats;
  }
}

export default HybridSearchEngine;
