/**
 * Error Recovery Constants
 *
 * Centralized constants for error recovery system.
 * Extracted to avoid circular dependencies between modules.
 *
 * @module services/error-recovery/constants
 */

import { RECOVERY_PRIORITY } from '../../constants/priorities.js';
import { API_TIME_TO_LIVE } from '../../constants/api.js';
import { LIMITS } from '../../constants/limits.js';

// Re-export for backwards compatibility
export const RecoveryPriority = RECOVERY_PRIORITY;

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
 * Uses centralized constant
 * @readonly
 */
export const RECOVERY_TTL_MS = API_TIME_TO_LIVE.RECOVERY_TTL_MS;

/**
 * Maximum delegation attempts
 * Uses centralized constant
 * @readonly
 */
export const MAX_DELEGATION_ATTEMPTS = LIMITS.MAX_RETRIES;
