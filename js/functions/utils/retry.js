/**
 * Retry Utilities for Function Execution
 *
 * HNW Considerations:
 * - Wave: Exponential backoff prevents thundering herd
 * - Network: Transient error detection enables graceful degradation
 * - Hierarchy: Retry logic delegated to resilient-retry.js as single source of truth
 */

import {
    withRetry as resilientRetry,
    RETRY_CONFIG,
    classifyError,
    isRetryable,
    ErrorType,
} from '../../utils/resilient-retry.js';

// Legacy constants for backward compatibility
const MAX_FUNCTION_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

/**
 * Validate retry configuration values
 * Throws descriptive errors for invalid values
 *
 * @param {number} maxRetries - Maximum number of retry attempts (0-10)
 * @param {number} baseDelayMs - Base delay in milliseconds (0-60000)
 * @throws {Error} If values are outside valid ranges
 */
function validateRetryConfig(maxRetries, baseDelayMs) {
    if (typeof maxRetries !== 'number' || maxRetries < 0 || maxRetries > 10) {
        throw new Error('MAX_FUNCTION_RETRIES must be between 0 and 10');
    }
    if (typeof baseDelayMs !== 'number' || baseDelayMs < 0 || baseDelayMs > 60000) {
        throw new Error('RETRY_BASE_DELAY_MS must be between 0 and 60000');
    }
}

// Validate default values on module load
validateRetryConfig(MAX_FUNCTION_RETRIES, RETRY_BASE_DELAY_MS);

/**
 * Check if error is transient (worth retrying)
 * Now delegates to classifyError() from resilient-retry.js
 *
 * @param {Error} err - The error to check
 * @returns {boolean} Whether the error is transient
 */
function isTransientError(err) {
    // AbortError is NOT retryable - it indicates intentional cancellation
    // This check must come first to maintain backward compatibility
    if (err?.name === 'AbortError') {
        return false;
    }

    // Delegate to resilient-retry's classifyError for structured error typing
    const errorType = classifyError(err);

    // Transient errors, rate limits, and server errors are retryable
    return [ErrorType.TRANSIENT, ErrorType.RATE_LIMIT, ErrorType.SERVER_ERROR].includes(errorType);
}

/**
 * Execute a function with retry logic
 * Now delegates to resilient-retry.js's withRetry() for unified retry strategy
 *
 * @param {Function} fn - Async function to execute
 * @param {string} functionName - Name for logging
 * @returns {Promise<any>} Result of the function
 */
async function withRetry(fn, functionName = 'function') {
    try {
        // Delegate to resilient-retry with function-specific configuration
        // Note: resilient-retry's maxRetries means "max retry COUNT", not "max attempts"
        // So maxRetries: 2 means 1 initial + 2 retries = 3 total attempts
        // This matches the old behavior: for (attempt = 0; attempt <= 2; attempt++)
        const { result, context } = await resilientRetry(fn, {
            maxRetries: MAX_FUNCTION_RETRIES,
            config: {
                ...RETRY_CONFIG,
                BASE_DELAY_MS: RETRY_BASE_DELAY_MS, // Use legacy base delay for compatibility
            },
            // Custom retry predicate to maintain AbortError semantics
            shouldRetry: (error, attempt) => {
                // AbortError is NOT retryable - indicates intentional cancellation
                if (error?.name === 'AbortError') {
                    return false;
                }
                // Check if we've exceeded max retries (maintain old behavior)
                // resilient-retry calls this BEFORE incrementing attempt counter
                if (attempt >= MAX_FUNCTION_RETRIES) {
                    return false;
                }
                // Delegate to resilient-retry's isRetryable for other errors
                return isRetryable(error);
            },
            onRetry: (error, attempt, delay) => {
                // resilient-retry passes 1-based attempt number (already incremented)
                console.warn(
                    `[Functions] Attempt ${attempt}/${MAX_FUNCTION_RETRIES + 1} for ${functionName} failed:`,
                    error.message
                );
            },
        });

        // Log success with context
        if (context.attempt > 0) {
            console.log(
                `[Functions] ${functionName} succeeded after ${context.attempt + 1} attempts ` +
                    `(total delay: ${context.totalDelayTime}ms)`
            );
        }

        return result;
    } catch (error) {
        console.error(`[Functions] ${functionName} failed:`, error.message);
        throw error;
    }
}

// ES Module export
export const FunctionRetry = {
    MAX_RETRIES: MAX_FUNCTION_RETRIES,
    isTransientError,
    withRetry,
    validateRetryConfig,
};

console.log('[FunctionRetry] Module loaded (delegating to resilient-retry.js)');
