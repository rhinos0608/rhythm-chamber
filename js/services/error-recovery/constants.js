/**
 * Error Recovery Constants
 *
 * Centralized constants for error recovery system.
 * Extracted to avoid circular dependencies between modules.
 *
 * @module services/error-recovery/constants
 */

/**
 * Recovery priority levels (higher = more important)
 * @readonly
 * @enum {number}
 */
export const RecoveryPriority = Object.freeze({
    CRITICAL: 100,  // Security threats, data corruption
    HIGH: 75,       // Storage failures, data loss risk
    MEDIUM: 50,     // UI failures, user experience
    LOW: 25         // Operational issues, retries
});

/**
 * Recovery domain categories
 * @readonly
 * @enum {string}
 */
export const RecoveryDomain = Object.freeze({
    SECURITY: 'security',
    STORAGE: 'storage',
    UI: 'ui',
    OPERATIONAL: 'operational',
    NETWORK: 'network',
    PROVIDER: 'provider'
});

/**
 * Recovery state enumeration
 * @readonly
 * @enum {string}
 */
export const RecoveryState = Object.freeze({
    IDLE: 'idle',
    ASSESSING: 'assessing',
    RECOVERING: 'recovering',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
});

/**
 * Recovery TTL configuration
 * @readonly
 */
export const RECOVERY_TTL_MS = 60000; // 60 seconds

/**
 * Maximum delegation attempts
 * @readonly
 */
export const MAX_DELEGATION_ATTEMPTS = 3;
