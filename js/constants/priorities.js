/**
 * Priority Constants
 *
 * Centralized constants for priority levels across the application.
 * Used for queue ordering, recovery prioritization, and task scheduling.
 *
 * @module constants/priorities
 */

/**
 * General priority levels
 * Lower numbers = higher priority (for queue sorting)
 */
export const PRIORITY = Object.freeze({
    /**
     * Critical priority - must process immediately
     * Used for: Security operations, data corruption prevention
     */
    CRITICAL: 1,

    /**
     * High priority - process as soon as possible
     * Used for: Storage failures, data loss risk
     */
    HIGH: 2,

    /**
     * Normal priority - standard processing
     * Used for: Regular operations, user actions
     */
    NORMAL: 3,

    /**
     * Low priority - process when idle
     * Used for: Background tasks, optional operations
     */
    LOW: 4,
});

/**
 * Recovery priority levels
 * Higher numbers = more important (for recovery sorting)
 * Used by error recovery system to prioritize recovery attempts
 */
export const RECOVERY_PRIORITY = Object.freeze({
    /**
     * Critical recovery - security threats, data corruption
     * Must recover immediately to prevent harm
     */
    CRITICAL: 100,

    /**
     * High recovery - storage failures, data loss risk
     * Important for application functionality
     */
    HIGH: 75,

    /**
     * Medium recovery - UI failures, user experience
     * Affects usability but not core functionality
     */
    MEDIUM: 50,

    /**
     * Low recovery - operational issues, retries
     * Can be deferred without major impact
     */
    LOW: 25,
});

export default { PRIORITY, RECOVERY_PRIORITY };
