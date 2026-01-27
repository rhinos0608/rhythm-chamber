/**
 * Constants Index
 *
 * Central export point for all application constants.
 * Organized by domain for easy importing.
 *
 * Usage:
 * ```javascript
 * import { LIMITS, DELAYS, PRIORITY } from './constants/index.js';
 * // or
 * import Constants from './constants/index.js';
 * const { LIMITS, DELAYS, PRIORITY } = Constants;
 * ```
 *
 * @module constants
 */

// Import all constants
import { LIMITS, QUOTA_THRESHOLDS, CACHE_SIZES } from './limits.js';
import { DELAYS, POLL_INTERVALS, RATE_LIMITS } from './delays.js';
import { PRIORITY, RECOVERY_PRIORITY } from './priorities.js';
import { API_LIMITS, API_TIME_TO_LIVE, HTTP_STATUS } from './api.js';
import {
    ANOMALY_THRESHOLD,
    PERCENTAGE_MULTIPLIER,
    SCORE_PRECISION,
    COVERAGE_LEVELS,
    TELEMETRY_LIMITS
} from './percentages.js';
import SESSION from '../constants/session.js';

// Re-export for named imports
export { LIMITS, QUOTA_THRESHOLDS, CACHE_SIZES } from './limits.js';
export { DELAYS, POLL_INTERVALS, RATE_LIMITS } from './delays.js';
export { PRIORITY, RECOVERY_PRIORITY } from './priorities.js';
export { API_LIMITS, API_TIME_TO_LIVE, HTTP_STATUS } from './api.js';
export {
    ANOMALY_THRESHOLD,
    PERCENTAGE_MULTIPLIER,
    SCORE_PRECISION,
    COVERAGE_LEVELS,
    TELEMETRY_LIMITS
} from './percentages.js';
export { SESSION } from '../constants/session.js';

/**
 * Consolidated default export
 * Provides all constants as a single object
 */
const Constants = {
    // Limits
    LIMITS,
    QUOTA_THRESHOLDS,
    CACHE_SIZES,

    // Delays
    DELAYS,
    POLL_INTERVALS,
    RATE_LIMITS,

    // Priorities
    PRIORITY,
    RECOVERY_PRIORITY,

    // API
    API_LIMITS,
    API_TIME_TO_LIVE,
    HTTP_STATUS,

    // Percentages
    ANOMALY_THRESHOLD,
    PERCENTAGE_MULTIPLIER,
    SCORE_PRECISION,
    COVERAGE_LEVELS,
    TELEMETRY_LIMITS,

    // Session
    SESSION,
};

export default Constants;
