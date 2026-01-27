/**
 * API Constants
 *
 * Centralized constants for API limits, timeouts, and HTTP status codes.
 * These values are based on external API specifications and best practices.
 *
 * @module constants/api
 */

/**
 * API request limits
 * Based on external API specifications (Spotify, MusicBrainz, etc.)
 */
export const API_LIMITS = Object.freeze({
    /**
     * Maximum tracks per Spotify audio features request
     * Spotify API limit: 50 tracks per request
     */
    MAX_TRACKS_PER_REQUEST: 50,

    /**
     * Maximum batch size for API requests
     * Spotify API batch limit
     */
    MAX_BATCH_SIZE: 50,

    /**
     * Maximum results to return from queries
     * Prevents performance issues with large result sets
     */
    MAX_QUERY_RESULTS: 50,

    /**
     * Safe limit for query results
     * Conservative limit to ensure good performance
     */
    MAX_SAFE_QUERY_RESULTS: 25,

    /**
     * Default limit for queries when not specified
     * Reasonable default for most use cases
     */
    DEFAULT_LIMIT: 10,

    /**
     * Spotify search API limit per request
     */
    SPOTIFY_SEARCH_LIMIT: 1,

    /**
     * Maximum artists from Spotify Web API
     * Spotify's max for "current user's top artists"
     */
    SPOTIFY_MAX_TOP_ARTISTS: 50,
});

/**
 * Time-to-live constants for cached data
 */
export const API_TIME_TO_LIVE = Object.freeze({
    /**
     * Recovery attempt TTL
     * Recovery attempts expire after 1 minute
     */
    RECOVERY_TTL_MS: 60000,

    /**
     * Write reservation timeout
     * Auto-release stale reservations after 30 seconds
     */
    RESERVATION_TIMEOUT_MS: 30000,

    /**
     * Worker considered stale after this duration
     * Worker heartbeat not received for 15 seconds
     */
    STALE_WORKER_TIMEOUT_MS: 15000,

    /**
     * Connection considered stale after this duration
     * No heartbeat received for 30 seconds
     */
    STALE_CONNECTION_THRESHOLD_MS: 30000,

    /**
     * Leadership claim ACK timeout
     * Wait 3 seconds for other tabs to acknowledge leadership
     */
    CLAIM_ACK_TIMEOUT_MS: 3000,

    /**
     * Cache recommendation for license data
     * 30 days in seconds for HTTP cache headers
     */
    CACHE_RECOMMENDATION_SECONDS: 30 * 24 * 60 * 60, // 30 days
});

/**
 * HTTP status codes
 * Standard HTTP status codes used throughout the application
 */
export const HTTP_STATUS = Object.freeze({
    // Success responses
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,

    // Client error responses
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    TOO_MANY_REQUESTS: 429,

    // Server error responses
    INTERNAL_SERVER_ERROR: 500,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504,
});

export default { API_LIMITS, API_TIME_TO_LIVE, HTTP_STATUS };
