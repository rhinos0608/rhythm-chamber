/**
 * Query Router
 *
 * Intelligently routes queries to appropriate indexes based on intent analysis.
 * Optimizes search by selecting the best strategy for each query type.
 *
 * Features:
 * - Intent detection (code, docs, hybrid)
 * - Adaptive weight calculation
 * - Automatic index selection
 * - Performance optimization
 *
 * Phase 3: Hybrid Search
 */

import { isCodeFile, isDocFile } from './config.js';

/**
 * Intent types
 */
const INTENT_TYPES = {
  CODE: 'code', // Looking for code symbols/implementation
  DOCS: 'docs', // Looking for documentation
  HYBRID: 'hybrid', // Need both (API concepts, patterns)
};

/**
 * Query patterns for intent detection
 * Made more specific to avoid false positives
 */
const PATTERNS = {
  // Code-specific patterns - require explicit code keywords
  code: [
    // Keywords that clearly indicate code search
    /\b(function|class|method|variable|const|let|var|interface|type|enum|constructor)\b/i,
    /\b(export|import|require|include)\b/i,
    /\b(implementation|define|declare|initialize)\b/i,
    // Action phrases with code keywords
    /\b(how do i|how to).*\b(implement|create|build|write|define|declare)\b/i,
    // camelCase or PascalCase WITH code keyword (not just identifier alone)
    /\b(function|class|method|property)\s+[A-Z][a-zA-Z0-9]*$/i,
    /\b(function|class|method|property)\s+[a-z][a-zA-Z0-9]*\(/i,
  ],

  // Documentation-specific patterns
  docs: [
    /\b(documentation|docs|guide|tutorial|readme|examples?)\b/i,
    /\b(getting started|setup|install|configuration|usage)\b/i,
    /\b(architecture|design|overview|introduction|explanation)\b/i,
    /\b(explain|describe|what is|when to use|how does)\b/i,
  ],

  // API/concept queries benefit from both
  hybrid: [
    /\b(api|endpoint|service|provider|controller|handler)\b/i,
    /\b(pattern|architecture|design|workflow|pipeline|process)\b/i,
    /\b(integration|connection|relationship|mapping)\b/i,
  ],
};

/**
 * Query Router class
 */
export class QueryRouter {
  constructor(hybridEngine) {
    this.hybrid = hybridEngine;
    this._stats = {
      code: 0,
      docs: 0,
      hybrid: 0,
      total: 0,
    };
  }

  /**
   * Route and execute search based on query intent
   * @param {string} query - Search query
   * @param {Float32Array|Array} queryEmbedding - Query embedding vector
   * @param {Object} options - Search options
   * @returns {Array} Search results
   */
  async search(query, queryEmbedding, options = {}) {
    const intent = this._analyzeIntent(query);

    // Track stats
    this._stats.total++;
    this._stats[intent.type]++;

    // Route to appropriate search strategy
    switch (intent.type) {
      case INTENT_TYPES.CODE:
        return this._codeSearch(query, queryEmbedding, {
          ...options,
          weights: intent.weights,
        });

      case INTENT_TYPES.DOCS:
        return this._docsSearch(query, queryEmbedding, {
          ...options,
          weights: intent.weights,
        });

      case INTENT_TYPES.HYBRID:
      default:
        return this._hybridSearch(query, queryEmbedding, {
          ...options,
          weights: intent.weights,
        });
    }
  }

  /**
   * Code-focused search
   * @private
   */
  async _codeSearch(query, queryEmbedding, options) {
    const { limit = 10 } = options;

    // Search only code index
    return await this.hybrid.search(query, queryEmbedding, {
      ...options,
      indexType: 'code', // Use indexType for consistency with FTS5Adapter
      contentType: 'code', // Keep both for compatibility
      k: limit * 2, // Fetch more, we'll filter
    });
  }

  /**
   * Documentation-focused search
   * @private
   */
  async _docsSearch(query, queryEmbedding, options) {
    const { limit = 10 } = options;

    // Search only docs index
    return await this.hybrid.search(query, queryEmbedding, {
      ...options,
      indexType: 'docs', // Use indexType for consistency with FTS5Adapter
      contentType: 'docs', // Keep both for compatibility
      k: limit * 2,
    });
  }

  /**
   * Hybrid search (code + docs)
   * @private
   */
  async _hybridSearch(query, queryEmbedding, options) {
    return await this.hybrid.search(query, queryEmbedding, options);
  }

  /**
   * Analyze query to determine intent
   * @private
   */
  _analyzeIntent(query) {
    const trimmed = query.trim().toLowerCase();

    // Check for explicit file path
    if (this._isFilePath(query)) {
      return {
        type: INTENT_TYPES.CODE,
        weights: { vector: 0.2, keyword: 1.0 },
        confidence: 0.9,
      };
    }

    // Check code patterns
    for (const pattern of PATTERNS.code) {
      if (pattern.test(query)) {
        return {
          type: INTENT_TYPES.CODE,
          weights: { vector: 0.5, keyword: 1.0 },
          confidence: 0.7,
        };
      }
    }

    // Check docs patterns
    for (const pattern of PATTERNS.docs) {
      if (pattern.test(query)) {
        return {
          type: INTENT_TYPES.DOCS,
          weights: { vector: 1.0, keyword: 0.5 },
          confidence: 0.7,
        };
      }
    }

    // Check hybrid patterns
    for (const pattern of PATTERNS.hybrid) {
      if (pattern.test(query)) {
        return {
          type: INTENT_TYPES.HYBRID,
          weights: { vector: 1.0, keyword: 1.0 },
          confidence: 0.6,
        };
      }
    }

    // Check for code identifier (camelCase, snake_case)
    if (this._isCodeIdentifier(query)) {
      return {
        type: INTENT_TYPES.CODE,
        weights: { vector: 0.3, keyword: 1.0 },
        confidence: 0.8,
      };
    }

    // Check for natural language question
    if (this._isNaturalLanguage(query)) {
      return {
        type: INTENT_TYPES.DOCS,
        weights: { vector: 1.0, keyword: 0.3 },
        confidence: 0.6,
      };
    }

    // Default: hybrid with balanced weights
    return {
      type: INTENT_TYPES.HYBRID,
      weights: { vector: 1.0, keyword: 1.0 },
      confidence: 0.4,
    };
  }

  /**
   * Check if query is a file path
   * @private
   */
  _isFilePath(query) {
    return /[\/\\]/.test(query) && (/\.[a-z]{2,4}$/i.test(query) || /[\/\\]$/.test(query));
  }

  /**
   * Check if query is a code identifier
   * @private
   */
  _isCodeIdentifier(query) {
    return /^[a-zA-Z_][a-zA-Z0-9_\.]*$/.test(query) && /\w{2,}/.test(query);
  }

  /**
   * Check if query is natural language
   * @private
   */
  _isNaturalLanguage(query) {
    const words = query.trim().split(/\s+/);
    if (words.length < 3) return false; // Too short

    // Check for question words
    const questionWords = /\b(how|what|when|where|why|who|which|can|could|should|would|is|are|do|does)\b/i;
    return questionWords.test(query);
  }

  /**
   * Get routing statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this._stats,
      distribution: {
        code: this._stats.total > 0 ? this._stats.code / this._stats.total : 0,
        docs: this._stats.total > 0 ? this._stats.docs / this._stats.total : 0,
        hybrid: this._stats.total > 0 ? this._stats.hybrid / this._stats.total : 0,
      },
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this._stats = {
      code: 0,
      docs: 0,
      hybrid: 0,
      total: 0,
    };
  }
}

/**
 * Analyze query without instantiating router
 * Useful for debugging or testing
 * @param {string} query - Query to analyze
 * @returns {Object} Intent analysis
 */
export function analyzeQuery(query) {
  const router = new QueryRouter(null);
  return router._analyzeIntent(query);
}

/**
 * Detect if query should use code index
 * @param {string} query - Query to check
 * @returns {boolean} True if code-focused
 */
export function isCodeQuery(query) {
  const intent = analyzeQuery(query);
  return intent.type === INTENT_TYPES.CODE;
}

/**
 * Detect if query should use docs index
 * @param {string} query - Query to check
 * @returns {boolean} True if docs-focused
 */
export function isDocsQuery(query) {
  const intent = analyzeQuery(query);
  return intent.type === INTENT_TYPES.DOCS;
}

export default QueryRouter;
