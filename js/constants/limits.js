/**
 * Limit Constants
 *
 * Centralized constants for limits, thresholds, and maximum values.
 * These values are chosen to balance performance, memory usage, and user experience.
 *
 * @module constants/limits
 */

/**
 * General application limits
 */
export const LIMITS = Object.freeze({
    /**
     * Maximum number of messages saved per session
     * Messages beyond this limit are truncated when saving to disk
     * Chosen to prevent excessive memory usage while maintaining conversation context
     */
    MAX_SAVED_MESSAGES: 100,

    /**
     * Maximum number of waves to keep in WaveTelemetry memory before LRU eviction
     * Chosen to balance memory usage with telemetry visibility
     */
    MAX_WAVES: 1000,

    /**
     * Maximum length for session IDs
     * Session IDs must be between 1 and 64 characters
     * Limited to prevent DoS attacks and ensure display compatibility
     */
    MAX_ID_LENGTH: 64,

    /**
     * Maximum number of retry attempts before giving up
     * Chosen based on exponential backoff best practices
     */
    MAX_RETRIES: 3,

    /**
     * Maximum number of samples to keep per metric in WaveTelemetry
     * Chosen to provide statistical significance while limiting memory
     */
    MAX_SAMPLES: 100,

    /**
     * Maximum iterations for API queue processing
     * Guard against infinite loops in MusicBrainz API enrichment
     */
    MAX_ITERATIONS: 100,

    /**
     * Maximum artist bio length in characters
     * Chosen to prevent excessive display space usage
     */
    MAX_ARTIST_BIO_LENGTH: 500,
});

/**
 * Storage quota thresholds
 * Used by QuotaManager to trigger warnings and block writes
 */
export const QUOTA_THRESHOLDS = Object.freeze({
    /**
     * Warning threshold (80% of quota)
     * Warn user to clean up data when quota usage exceeds this
     */
    WARNING_THRESHOLD: 0.80,

    /**
     * Critical threshold (95% of quota)
     * Block writes when quota usage exceeds this to prevent quota errors
     */
    CRITICAL_THRESHOLD: 0.95,

    /**
     * Minimum bytes written to trigger post-write quota check
     * Chosen to balance performance with quota accuracy
     */
    LARGE_WRITE_THRESHOLD_BYTES: 1024 * 1024, // 1MB

    /**
     * Default quota if navigator.storage.estimate() fails
     * Conservative estimate for browser localStorage/IndexedDB
     */
    FALLBACK_QUOTA_BYTES: 50 * 1024 * 1024, // 50MB
});

/**
 * Cache size limits
 */
export const CACHE_SIZES = Object.freeze({
    /**
     * Default LRU cache size for vector embeddings
     * Chosen to balance memory usage with cache hit rate
     */
    DEFAULT_LRU_CACHE_SIZE: 5000,

    /**
     * Turn queue history size for metrics calculation
     * Chosen to provide meaningful statistics without excessive memory
     */
    METRICS_HISTORY_SIZE: 100,

    /**
     * Queue depth samples to track over time
     * Chosen to show trends without excessive memory
     */
    DEPTH_SAMPLES_SIZE: 100,
});

export default { LIMITS, QUOTA_THRESHOLDS, CACHE_SIZES };
