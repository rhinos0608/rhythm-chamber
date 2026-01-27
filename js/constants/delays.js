/**
 * Delay and Interval Constants
 *
 * Centralized constants for delays, intervals, and timing values.
 * These values are chosen based on UX requirements, API rate limits, and system constraints.
 *
 * @module constants/delays
 */

/**
 * Delay constants for various operations
 */
export const DELAYS = Object.freeze({
    /**
     * Base delay for retry attempts
     * Starting point for exponential backoff
     */
    BASE_RETRY_DELAY_MS: 1000,

    /**
     * Maximum delay between retry attempts
     * Prevents excessively long waits while allowing recovery
     */
    MAX_RETRY_DELAY_MS: 30000,

    /**
     * Delay before attempting to reconnect
     * Applied after connection loss (workers, tabs)
     */
    RECONNECT_DELAY_MS: 1000,

    /**
     * Delay before WAL (Write-Ahead Log) replay
     * Allows database to settle before replaying logs
     */
    WAL_REPLAY_DELAY_MS: 1000,

    /**
     * Circuit breaker cooldown duration
     * Time to wait before allowing requests after circuit opens
     */
    COOLDOWN_MS: 30000,

    /**
     * Half-open timeout for circuit breaker
     * Fast timeout when testing if service has recovered
     */
    HALF_OPEN_TIMEOUT_MS: 5000,

    /**
     * Jitter amount for retry delays
     * Prevents thundering herd by randomizing delays
     */
    JITTER_MS: 100,

    /**
     * Short toast notification duration
     * For informational messages
     */
    TOAST_SHORT_MS: 3000,

    /**
     * Long toast notification duration
     * For warnings and important messages
     */
    TOAST_LONG_MS: 6000,

    /**
     * Small delay for polling/iteration
     * Used in lock acquisition loops and heartbeat checks
     */
    POLL_ITERATION_MS: 100,
});

/**
 * Polling interval constants
 */
export const POLL_INTERVALS = Object.freeze({
    /**
     * Interval between quota usage checks
     * Balances performance with timely quota updates
     */
    QUOTA_CHECK_MS: 60000,

    /**
     * Interval between provider health checks
     * Allows providers to recover while detecting failures promptly
     */
    HEALTH_CHECK_MS: 60000,

    /**
     * Interval between storage degradation checks
     * Monitors storage health for tier-based degradation
     */
    STORAGE_DEGRADATION_CHECK_MS: 30000,

    /**
     * Interval between observability metric updates
     * Updates dev panel performance metrics
     */
    OBSERVABILITY_UPDATE_MS: 5000,

    /**
     * Interval between worker heartbeat messages
     * Used to detect worker liveness
     */
    HEARTBEAT_INTERVAL_MS: 5000,

    /**
     * Interval between heartbeat checks during operations
     * Short interval to quickly detect missed heartbeats
     */
    HEARTBEAT_CHECK_INTERVAL_MS: 100,

    /**
     * Maximum wait time for tab calibration
     * Time to wait for all tabs to synchronize
     */
    CALIBRATION_MS: 5000,
});

/**
 * Rate limiting constants
 */
export const RATE_LIMITS = Object.freeze({
    /**
     * Minimum delay between MusicBrainz API requests
     * MusicBrainz requires 1 request/second, slightly over for safety
     */
    API_RATE_LIMIT_MS: 1100,

    /**
     * Duration to blacklist failed provider
     * Prevents repeated attempts to failing provider
     */
    PROVIDER_BLACKLIST_MS: 300000, // 5 minutes

    /**
     * Minimum pause interval between pattern worker operations
     * Prevents overwhelming the system with pattern processing
     */
    MIN_PAUSE_INTERVAL_MS: 5000,
});

export default { DELAYS, POLL_INTERVALS, RATE_LIMITS };
