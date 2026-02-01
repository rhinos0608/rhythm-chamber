/**
 * Retry Strategies and Backoff Calculations
 *
 * Provides backoff calculation strategies (exponential, linear, custom),
 * jitter utilities to prevent thundering herd, and retry condition builders.
 *
 * Depends on: retry-config.js (for ErrorType, DEFAULT_RETRY_CONFIG)
 *
 * @module utils/retry-manager/retry-strategies
 */

import { ErrorType, DEFAULT_RETRY_CONFIG, classifyError, isRetryable } from './retry-config.js';

// ==========================================
// Delay Calculation
// ==========================================

/**
 * Calculate delay with exponential backoff
 * @param {number} attempt - Current attempt (0-indexed)
 * @param {Object} config - Retry configuration
 * @returns {number} Delay in milliseconds
 */
export function calculateExponentialBackoff(attempt, config = DEFAULT_RETRY_CONFIG) {
    const exponentialDelay = Math.min(
        config.baseDelayMs * Math.pow(config.exponentialBase, attempt),
        config.maxDelayMs
    );
    return exponentialDelay;
}

/**
 * Calculate delay with linear backoff
 * @param {number} attempt - Current attempt (0-indexed)
 * @param {Object} config - Retry configuration
 * @returns {number} Delay in milliseconds
 */
export function calculateLinearBackoff(attempt, config = DEFAULT_RETRY_CONFIG) {
    const linearDelay = Math.min(config.baseDelayMs * (attempt + 1), config.maxDelayMs);
    return linearDelay;
}

/**
 * Calculate delay with custom backoff function
 * @param {number} attempt - Current attempt (0-indexed)
 * @param {Function} backoffFn - Custom backoff function
 * @param {Object} config - Retry configuration
 * @returns {number} Delay in milliseconds
 */
export function calculateCustomBackoff(attempt, backoffFn, config = DEFAULT_RETRY_CONFIG) {
    const delay = backoffFn(attempt, config);
    return Math.min(delay, config.maxDelayMs);
}

/**
 * Add jitter to delay to prevent thundering herd
 * @param {number} delay - Base delay in milliseconds
 * @param {Object} config - Retry configuration
 * @returns {number} Delay with jitter in milliseconds
 */
export function addJitter(delay, config = DEFAULT_RETRY_CONFIG) {
    const jitter = Math.random() * config.jitterMs;
    return Math.floor(delay + jitter);
}

/**
 * Calculate delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt (0-indexed)
 * @param {Object} config - Retry configuration
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoffWithJitter(attempt, config = DEFAULT_RETRY_CONFIG) {
    const backoff = calculateExponentialBackoff(attempt, config);
    return addJitter(backoff, config);
}

/**
 * Calculate delay based on error type
 * Rate limits get longer delays, transient errors get standard backoff
 * @param {number} attempt - Current attempt (0-indexed)
 * @param {Error} error - The error that occurred
 * @param {Object} config - Retry configuration
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoffForError(attempt, error, config = DEFAULT_RETRY_CONFIG) {
    const errorType = classifyError(error);

    // Use longer delays for rate limits
    if (errorType === ErrorType.RATE_LIMIT) {
        const rateLimitConfig = {
            ...config,
            baseDelayMs: Math.max(config.baseDelayMs, 5000), // Minimum 5s
            jitterMs: 1000, // More jitter for rate limits
        };
        return calculateBackoffWithJitter(attempt, rateLimitConfig);
    }

    // Use standard backoff for other retryable errors
    return calculateBackoffWithJitter(attempt, config);
}

/**
 * Delay for specified milliseconds
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// Retry Condition Builders
// ==========================================

/**
 * Create a retry condition that checks error type
 * @param {string[]} allowedTypes - Error types that allow retry
 * @returns {Function} Retry condition function
 */
export function retryOnErrorTypes(...allowedTypes) {
    return (error, attempt) => {
        const errorType = classifyError(error);
        return allowedTypes.includes(errorType);
    };
}

/**
 * Create a retry condition that checks max attempts
 * @param {number} maxAttempts - Maximum number of attempts
 * @returns {Function} Retry condition function
 */
export function retryWithMaxAttempts(maxAttempts) {
    return (error, attempt) => {
        return attempt < maxAttempts && isRetryable(error);
    };
}

/**
 * Create a retry condition that checks HTTP status codes
 * @param {number[]} retryableStatuses - HTTP status codes that trigger retry
 * @returns {Function} Retry condition function
 */
export function retryOnStatus(...retryableStatuses) {
    return (error, attempt) => {
        if (error.message && error.message.includes('status')) {
            const statusMatch = error.message.match(/status (\d+)/);
            if (statusMatch) {
                const status = parseInt(statusMatch[1], 10);
                return retryableStatuses.includes(status);
            }
        }
        return isRetryable(error);
    };
}

/**
 * Create a retry condition that combines multiple conditions with AND
 * @param {...Function} conditions - Retry condition functions
 * @returns {Function} Combined retry condition function
 */
export function retryIfAll(...conditions) {
    return (error, attempt) => {
        return conditions.every(cond => cond(error, attempt));
    };
}

/**
 * Create a retry condition that combines multiple conditions with OR
 * @param {...Function} conditions - Retry condition functions
 * @returns {Function} Combined retry condition function
 */
export function retryIfAny(...conditions) {
    return (error, attempt) => {
        return conditions.some(cond => cond(error, attempt));
    };
}

/**
 * Create a retry condition that never retries
 * @returns {Function} Retry condition function
 */
export function retryNever() {
    return () => false;
}

/**
 * Create a retry condition that always retries (up to max)
 * @returns {Function} Retry condition function
 */
export function retryAlways() {
    return (error, attempt) => true;
}
