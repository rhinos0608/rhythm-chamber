/**
 * RAG Configuration
 *
 * Central configuration for semantic search, hybrid search (RRF),
 * BM25 lexical search, and query expansion.
 *
 * Adapted from MCP server semantic search config for music domain.
 *
 * @module rag/config
 */

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
     */
    SCALING: 6000,
};

/**
 * Type Priority Configuration for Music Domain
 *
 * Used for reranking search results by chunk type.
 * Higher priority = more relevant for typical music queries.
 */
export const TYPE_PRIORITY = {
    pattern_result: 100, // Listening patterns are most actionable
    artist_profile: 90, // Artist-specific information
    monthly_summary: 85, // Time-based listening summaries
    pattern_summary: 80, // Overall pattern summaries
    track_info: 75, // Track-level data
    playlist: 70, // Playlist information
    genre_analysis: 65, // Genre breakdowns
    fallback: 5, // Catch-all for unknown types
};

/**
 * Per-Type Similarity Thresholds
 *
 * Different chunk types have different optimal similarity thresholds.
 * Music data tends to be more semantic, so thresholds are slightly lower.
 */
export const TYPE_THRESHOLDS = {
    pattern_result: 0.25, // Patterns have rich context
    artist_profile: 0.3, // Artist names are specific
    monthly_summary: 0.25, // Temporal context helps
    pattern_summary: 0.2, // Summaries are general
    track_info: 0.35, // Track names are very specific
    playlist: 0.3, // Playlist names are specific
    genre_analysis: 0.25, // Genres are semantic
    fallback: 0.15, // Most permissive
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
     */
    REDUCTION_MULTIPLIER: 0.7,

    /**
     * Minimum threshold to prevent runaway queries
     */
    MIN_THRESHOLD: 0.1,
};

/**
 * BM25 Configuration
 *
 * Parameters for lexical (keyword) search using BM25 algorithm.
 */
export const BM25_CONFIG = {
    /**
     * Term saturation parameter (k1)
     * Controls how quickly term frequency saturation occurs
     *
     * Default: 1.2
     * Range: 1.0-2.0
     */
    k1: 1.2,

    /**
     * Length normalization parameter (b)
     * Controls how much document length affects score
     *
     * Default: 0.75
     * Range: 0.0-1.0
     */
    b: 0.75,
};

/**
 * Query Expansion Configuration
 */
export const QUERY_EXPANSION = {
    /**
     * Maximum number of expanded queries to generate
     *
     * Default: 10 (balanced for performance)
     */
    MAX_EXPANSIONS: 10,

    /**
     * Number of expanded queries to use in adaptive threshold retry
     */
    RETRY_QUERY_COUNT: 3,
};

/**
 * Query Cache Configuration
 */
export const QUERY_CACHE = {
    /**
     * Semantic similarity threshold for cache hits
     * Queries with similarity >= this value are considered duplicates
     */
    SIMILARITY_THRESHOLD: 0.92,

    /**
     * Maximum number of cached queries
     */
    MAX_CACHE_SIZE: 500,

    /**
     * TTL for cache entries in milliseconds (1 hour)
     */
    CACHE_TTL: 60 * 60 * 1000,
};

/**
 * Hybrid Search Configuration
 */
export const HYBRID_SEARCH = {
    /**
     * Weight for vector (semantic) search results
     * Range: 0.0-1.0
     */
    VECTOR_WEIGHT: 0.7,

    /**
     * Weight for lexical (BM25) search results
     * Range: 0.0-1.0
     */
    LEXICAL_WEIGHT: 0.3,

    /**
     * Whether to use RRF (true) or weighted combination (false)
     */
    USE_RRF: true,

    /**
     * Minimum results from each source before combining
     */
    MIN_RESULTS_PER_SOURCE: 5,
};

/**
 * Default export for easy import
 */
export default {
    RRF_CONFIG,
    TYPE_PRIORITY,
    TYPE_THRESHOLDS,
    ADAPTIVE_THRESHOLD,
    BM25_CONFIG,
    QUERY_EXPANSION,
    QUERY_CACHE,
    HYBRID_SEARCH,
};
