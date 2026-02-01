/**
 * Write-Ahead Log Configuration
 *
 * Central constants and configuration for the WAL system.
 * Extracted from write-ahead-log.js for better modularity.
 *
 * @module storage/write-ahead-log/config
 */

/**
 * WAL entry status
 * @enum {string}
 */
export const WalStatus = Object.freeze({
    PENDING: 'pending', // Not yet processed
    PROCESSING: 'processing', // Currently being processed
    COMMITTED: 'committed', // Successfully committed
    FAILED: 'failed', // Failed to commit (will retry)
});

/**
 * WAL entry priority levels
 * @enum {string}
 */
export const WalPriority = Object.freeze({
    CRITICAL: 'critical', // Must be processed immediately (credentials, tokens)
    HIGH: 'high', // User-visible data (streams, personality)
    NORMAL: 'normal', // Background data (analytics, telemetry)
    LOW: 'low', // Optional data (cache, preferences)
});

/**
 * Storage keys for localStorage
 */
export const STORAGE_KEYS = Object.freeze({
    WAL: 'rhythm_chamber_wal',
    SEQUENCE: 'rhythm_chamber_wal_sequence',
    RESULTS: 'rhythm_chamber_wal_results',
});

/**
 * WAL configuration limits
 */
export const CONFIG = Object.freeze({
    MAX_SIZE: 100, // Maximum number of entries in WAL
    MAX_AGE_MS: 24 * 60 * 60 * 1000, // 24 hours
    MAX_SIZE_BYTES: 4 * 1024 * 1024, // 4MB buffer (localStorage has ~5MB limit)
    REPLAY_DELAY_MS: 1000, // Delay before replay to avoid conflicts
    RESULTS_MAX_AGE_MS: 5 * 60 * 1000, // Keep results for 5 minutes
    CLEANUP_AGE_MS: 60000, // Keep committed entries for 1 minute
    BATCH_SIZE: 10, // Process up to 10 entries at a time
    MAX_ATTEMPTS: 3, // Maximum retry attempts before giving up
    CLEANUP_INTERVAL_MS: 5 * 60 * 1000, // Cleanup every 5 minutes
});

/**
 * Priority order for processing (lower = higher priority)
 */
export const PRIORITY_ORDER = Object.freeze({
    [WalPriority.CRITICAL]: 0,
    [WalPriority.HIGH]: 1,
    [WalPriority.NORMAL]: 2,
    [WalPriority.LOW]: 3,
});
