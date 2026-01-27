/**
 * Percentage and Score Constants
 *
 * Centralized constants for percentage calculations and score precision.
 * Used in telemetry, genre enrichment, and data normalization.
 *
 * @module constants/percentages
 */

/**
 * Anomaly detection thresholds
 * Used by WaveTelemetry to detect timing anomalies
 */
export const ANOMALY_THRESHOLD = Object.freeze({
    /**
     * Default variance threshold for anomaly detection
     * 20% variance from expected timing triggers anomaly
     */
    DEFAULT: 0.20,
});

/**
 * Multiplier for converting decimal to percentage
 */
export const PERCENTAGE_MULTIPLIER = 100;

/**
 * Score precision constants
 * Used for normalizing Spotify audio features and other scores
 */
export const SCORE_PRECISION = Object.freeze({
    /**
     * Multiplier for Spotify audio features (0-1 range)
     * Converts to 0-100 range for display
     */
    SPOTIFY_FEATURE_MULTIPLIER: 100,

    /**
     * Precision for loudness values
     * Spotify loudness is in dB, typically -60 to 0
     */
    LOUDNESS_PRECISION: 10,
});

/**
 * Coverage level thresholds
 * Used to assess how well data is enriched/covered
 */
export const COVERAGE_LEVELS = Object.freeze({
    /**
     * High coverage threshold
     * Static artist map covers ~80% of typical listening history
     */
    HIGH: 0.80,

    /**
     * Medium coverage threshold
     * Moderate coverage of listening history
     */
    MEDIUM: 0.50,

    /**
     * Low coverage threshold
     * Minimal coverage of listening history
     */
    LOW: 0.25,
});

/**
 * Limits for telemetry storage
 * Used by WaveTelemetry to limit memory usage
 */
export const TELEMETRY_LIMITS = Object.freeze({
    /**
     * Maximum number of samples to keep per metric
     */
    MAX_SAMPLES: 1000,

    /**
     * Maximum number of waves to track
     */
    MAX_WAVES: 100,
});

export default {
    ANOMALY_THRESHOLD,
    PERCENTAGE_MULTIPLIER,
    SCORE_PRECISION,
    COVERAGE_LEVELS,
    TELEMETRY_LIMITS,
};
