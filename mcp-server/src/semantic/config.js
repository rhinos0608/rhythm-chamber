/**
 * Semantic Search Configuration
 *
 * Central configuration for all semantic search magic numbers.
 * These values can be tuned without modifying core logic.
 *
 * NOTE: mcp-server is gitignored, so API keys can be stored here safely.
 */

// =============================================================================
// EMBEDDING DIMENSION (Single Source of Truth)
// =============================================================================
// All providers MUST output embeddings of this dimension.
// Changing this requires rebuilding the entire index.
export const EMBEDDING_DIMENSION = 768;

// =============================================================================
// EMBEDDING MODE
// =============================================================================
// 'local'  - Uses Transformers.js (primary) + LM Studio (fallback)
//            Free, private, requires local compute
// 'cloud'  - Uses OpenRouter only
//            Fast, paid, requires API key
// 'hybrid' - Uses local first, falls back to cloud if local fails
export const EMBEDDING_MODE = process.env.RC_EMBEDDING_MODE || 'local';

// =============================================================================
// PROVIDER PRIORITY (determined by mode)
// =============================================================================
export const PROVIDER_PRIORITY = (() => {
  switch (EMBEDDING_MODE) {
    case 'cloud':
      return ['openrouter'];
    case 'hybrid':
      return ['transformers', 'lmstudio', 'openrouter'];
    case 'local':
    default:
      // LM Studio first (GPU-accelerated), then Transformers.js fallback
      return ['lmstudio', 'transformers'];
  }
})();

// =============================================================================
// OPENROUTER CONFIGURATION
// =============================================================================
export const OPENROUTER_CONFIG = {
  // API key - set this to enable OpenRouter embeddings
  // Get your key at: https://openrouter.ai/keys
  apiKey:
    process.env.OPENROUTER_API_KEY ||
    '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',

  // Base URL for OpenRouter API
  baseUrl: 'https://openrouter.ai/api/v1',

  // Embedding model - OpenAI text-embedding-3-small with 768 dimensions
  model: 'openai/text-embedding-3-small',

  // Request dimensions matching EMBEDDING_DIMENSION
  dimensions: EMBEDDING_DIMENSION,

  // Timeout for API requests (ms)
  timeout: 30000,

  // Maximum texts per batch request
  maxBatchSize: 100,

  // Enable/disable this provider
  enabled: true,
};

// =============================================================================
// TRANSFORMERS.JS CONFIGURATION (Local)
// =============================================================================
export const TRANSFORMERS_CONFIG = {
  // Model for code queries - SOTA on code retrieval benchmarks (768 dim)
  codeModel: 'jinaai/jina-embeddings-v2-base-code',

  // Model for general text queries (768 dim)
  generalModel: 'Xenova/gte-base',

  // Enable/disable this provider
  enabled: true,

  // Force transformers-only mode (skip other providers)
  forceOnly: process.env.RC_FORCE_TRANSFORMERS === 'true',
};

// =============================================================================
// LM STUDIO CONFIGURATION (Local GPU)
// =============================================================================
export const LMSTUDIO_CONFIG = {
  // LM Studio API endpoint
  endpoint: process.env.RC_LMSTUDIO_ENDPOINT || 'http://localhost:1234/v1',

  // Model name - must output EMBEDDING_DIMENSION (768)
  // text-embedding-nomic-embed-code@q8_0 is a quantized code embedding model (768 dim)
  // Alternative: nomic-embed-text-v1.5 (also 768 dim)
  model: process.env.RC_EMBEDDING_MODEL || 'text-embedding-nomic-embed-code@q8_0',

  // Timeout for API requests (ms)
  timeout: 30000,

  // Enable/disable this provider
  enabled: true,

  // Truncate embeddings to EMBEDDING_DIMENSION if model outputs more
  // This ensures compatibility across different models
  truncateToDimension: true,
};

// =============================================================================
// EMBEDDING CACHE CONFIGURATION
// =============================================================================
export const EMBEDDING_CACHE_CONFIG = {
  // Cache TTL in milliseconds
  ttl: parseInt(process.env.RC_EMBEDDING_TTL || '600') * 1000,

  // Enable in-memory cache
  enabled: true,
};

// =============================================================================
// MODEL DIMENSIONS REGISTRY
// =============================================================================
// Maps model names to their output dimensions for validation
// Models with dimensions > 768 will be truncated to EMBEDDING_DIMENSION
export const MODEL_DIMENSIONS = {
  // Transformers.js models (768 dim - compatible)
  'jinaai/jina-embeddings-v2-base-code': EMBEDDING_DIMENSION,
  'Xenova/gte-base': EMBEDDING_DIMENSION,

  // LM Studio models (768 dim - compatible)
  'text-embedding-nomic-embed-code@q8_0': EMBEDDING_DIMENSION,
  'text-embedding-nomic-embed-code@q4_k_s': EMBEDDING_DIMENSION,
  'text-embedding-nomic-embed-text-v1.5': EMBEDDING_DIMENSION,
  'nomic-embed-text-v1.5': EMBEDDING_DIMENSION,
  'text-embedding-qwen3-embedding-0.6b': EMBEDDING_DIMENSION,
  'text-embedding-embeddinggemma-300m': EMBEDDING_DIMENSION,
  'embeddinggemma-300m': EMBEDDING_DIMENSION,

  // Models that output larger dimensions (will be truncated to 768)
  'nomic-ai/nomic-embed-text-v1.5': 768, // Actually 768
  'nomic-ai/nomic-embed-code-v1.5': 768, // Actually 768

  // OpenRouter models (768 dim - compatible)
  'qwen/qwen3-embedding-8b': EMBEDDING_DIMENSION,
  'qwen/qwen3-embedding-4b': EMBEDDING_DIMENSION,
  'qwen/qwen3-embedding-0.6b': EMBEDDING_DIMENSION,
  'openai/text-embedding-3-small': EMBEDDING_DIMENSION, // Configurable dimensions
  'openai/text-embedding-3-large': EMBEDDING_DIMENSION, // Configurable dimensions

  // Incompatible models (different dimensions - would require index rebuild)
  'Xenova/all-MiniLM-L6-v2': 384,
  'jinaai/jina-code-1b': 1024,
};

/**
 * Validate that a model is compatible with our embedding dimension
 */
export function isModelCompatible(modelName) {
  return MODEL_DIMENSIONS[modelName] === EMBEDDING_DIMENSION;
}

/**
 * Get the dimension for a specific model
 */
export function getModelDimension(modelName) {
  return MODEL_DIMENSIONS[modelName] || EMBEDDING_DIMENSION;
}

/**
 * Truncate or pad embedding to match EMBEDDING_DIMENSION
 * This ensures compatibility across different embedding models
 *
 * @param {Float32Array|Array} embedding - The embedding vector
 * @param {number} targetDimension - Target dimension (default: EMBEDDING_DIMENSION)
 * @returns {Float32Array} - Embedding truncated/padded to target dimension
 */
export function normalizeEmbeddingDimension(embedding, targetDimension = EMBEDDING_DIMENSION) {
  const arr = embedding instanceof Float32Array ? embedding : new Float32Array(embedding);

  // If already correct size, return as-is
  if (arr.length === targetDimension) {
    return arr;
  }

  // If larger, truncate to first N dimensions
  if (arr.length > targetDimension) {
    console.warn(
      `[Embeddings] Truncating embedding from ${arr.length} to ${targetDimension} dimensions`
    );
    return arr.slice(0, targetDimension);
  }

  // If smaller, pad with zeros (rare case)
  console.warn(
    `[Embeddings] Padding embedding from ${arr.length} to ${targetDimension} dimensions`
  );
  const result = new Float32Array(targetDimension);
  result.set(arr);
  return result;
}

/**
 * RRF (Reciprocal Rank Fusion) Configuration
 */
export const RRF_CONFIG = {
  /**
   * The k constant in RRF formula: 1 / (k + rank)
   * Higher values = more conservative rank fusion
   * Lower values = top results get more weight
   *
   * Default: 60 (standard in information retrieval literature)
   * Range: 10-100
   */
  k: 60,

  /**
   * Scaling factor to normalize RRF scores to 0-100 range
   * RRF produces ~0-0.0164, so multiply to get comparable scale
   *
   * Formula: RRF_score * SCALING
   * Default: 6000 (0.0164 * 6000 = 98.4, safely within 0-100)
   * Calculation: 1/(60+1) ≈ 0.0164, use 6000 to avoid exceeding 100
   */
  SCALING: 6000,
};

/**
 * Type Priority Configuration
 * Used for reranking search results by chunk type
 */
export const TYPE_PRIORITY = {
  function: 100, // Functions are most relevant
  method: 95, // Methods slightly less (often contextual)
  class: 90, // Class definitions
  'class-declaration': 85,
  variable: 60, // Variables less semantically dense
  export: 50,
  imports: 40,
  code: 10,
  fallback: 5,
  // Markdown chunk types (Phase 3.2)
  'md-section': 75,
  'md-code-block': 70,
  'md-list': 60,
  'md-blockquote': 55,
  'md-paragraph': 50,
  'md-table': 65,
  'md-document': 40,
};

/**
 * Per-Type Similarity Thresholds
 * Different chunk types have different optimal similarity thresholds
 */
export const TYPE_THRESHOLDS = {
  function: 0.25, // Functions have dense semantics
  method: 0.25, // Methods similar to functions
  class: 0.3, // Class definitions more specific
  'class-declaration': 0.3,
  variable: 0.35, // Variables less semantically dense
  export: 0.4, // Export statements need higher similarity
  imports: 0.4, // Import statements very specific
  code: 0.2, // Generic code chunks, more permissive
  fallback: 0.15, // Fallback chunks, most permissive
  // Markdown chunk types (Phase 3.3)
  'md-section': 0.28,
  'md-code-block': 0.3,
  'md-list': 0.3,
  'md-blockquote': 0.3,
  'md-paragraph': 0.35,
  'md-table': 0.32,
  'md-document': 0.2,
};

/**
 * Adaptive Threshold Configuration
 */
export const ADAPTIVE_THRESHOLD = {
  /**
   * Multiplier for reducing threshold when too few results
   * Lower = more aggressive retry, Higher = more conservative
   *
   * Default: 0.7 (30% reduction)
   * Range: 0.5-0.9
   */
  REDUCTION_MULTIPLIER: 0.7,

  /**
   * Minimum threshold to prevent runaway queries
   *
   * Default: 0.1
   */
  MIN_THRESHOLD: 0.1,
};

/**
 * Symbol Name Boost Configuration
 */
export const SYMBOL_BOOST = {
  /**
   * Multiplicative boost factor for symbol name matches
   * Applied as: similarity * (1 + nameMatch * FACTOR)
   *
   * Default: 0.2 (20% max boost for perfect match)
   * Range: 0.1-0.5
   */
  FACTOR: 0.2,

  /**
   * Score thresholds for different match types
   */
  EXACT_MATCH_SCORE: 1.0,
  PREFIX_MATCH_SCORE: 0.8,
  CAMEL_WORD_SCORE: 0.7,
  CONTAINS_MATCH_SCORE: 0.5,
};

/**
 * Call Frequency Bonus Configuration
 */
export const CALL_FREQUENCY = {
  /**
   * Maximum bonus for popular symbols (prevents domination)
   * Uses logarithmic-like scaling with actual meaningful caps
   *
   * Default: 20 (caps bonus even for very popular functions)
   */
  MAX_BONUS: 20,

  /**
   * Scaling factor for call frequency bonus
   * Formula: min(MAX_BONUS, floor(sqrt(count / 10)))
   * This gives: 1-9 calls=0, 10-99 calls=1-3, 100-999 calls=3-9, 1000+=10-20 (capped)
   */
  USE_SQRT_SCALING: true,
};

/**
 * Query Expansion Configuration
 */
export const QUERY_EXPANSION = {
  /**
   * Maximum number of expanded queries to generate
   * Higher = better recall but slower, Lower = faster
   *
   * Default: 10 (reduced from 20 for performance)
   * Range: 1-20
   */
  MAX_EXPANSIONS: 10,

  /**
   * Number of expanded queries to use in adaptive threshold retry
   *
   * Default: 3 (original + 2 expanded queries for better recall)
   * Range: 1-5
   */
  RETRY_QUERY_COUNT: 3,
};

/**
 * Chunking Configuration
 */
export const CHUNKING = {
  /**
   * Percentage of overlap between adjacent chunks
   * Stored in context, not embedded (to avoid biasing embeddings)
   *
   * Default: 0.2 (20%)
   */
  OVERLAP_PERCENTAGE: 0.2,

  /**
   * Lines of context before/after each chunk
   *
   * Default: 5
   */
  CONTEXT_LINES: 5,

  /**
   * Function length threshold for parent-child chunking
   * Functions exceeding this get both parent and child chunks
   *
   * Default: 50 lines
   */
  PARENT_CHUNK_THRESHOLD: 50,

  /**
   * Maximum chunk size in characters
   *
   * Default: 4000
   */
  MAX_CHUNK_SIZE: 4000,
};

/**
 * BM25 Configuration
 */
export const BM25_CONFIG = {
  /**
   * Term saturation parameter
   * Controls how quickly term frequency saturation occurs
   *
   * Default: 1.2
   * Range: 1.0-2.0
   */
  k1: 1.2,

  /**
   * Length normalization parameter
   * Controls how much document length affects score
   *
   * Default: 0.75
   * Range: 0.0-1.0
   */
  b: 0.75,
};

/**
 * Default export for easy import
 */
export default {
  // Embedding configuration (NEW)
  EMBEDDING_DIMENSION,
  EMBEDDING_MODE,
  PROVIDER_PRIORITY,
  OPENROUTER_CONFIG,
  TRANSFORMERS_CONFIG,
  LMSTUDIO_CONFIG,
  EMBEDDING_CACHE_CONFIG,
  MODEL_DIMENSIONS,
  isModelCompatible,
  getModelDimension,
  normalizeEmbeddingDimension,

  // Search configuration (existing)
  RRF_CONFIG,
  TYPE_PRIORITY,
  TYPE_THRESHOLDS,
  ADAPTIVE_THRESHOLD,
  SYMBOL_BOOST,
  CALL_FREQUENCY,
  QUERY_EXPANSION,
  CHUNKING,
  BM25_CONFIG,
};
