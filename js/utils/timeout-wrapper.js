/**
 * Timeout Wrapper Utility
 * 
 * Provides timeout-based recovery with progressive escalation.
 * 
 * HNW Considerations:
 * - Hierarchy: Single authority for timeout enforcement
 * - Network: Prevents cascade failures from hanging operations
 * - Wave: Predictable timing behavior with fallback paths
 * 
 * @module utils/timeout-wrapper
 */

'use strict';

// ==========================================
// Error Classes
// ==========================================

/**
 * Custom error for timeout conditions
 */
export class TimeoutError extends Error {
    /**
     * @param {string} message - Error message
     * @param {number} timeoutMs - Timeout duration that was exceeded
     * @param {string} [operation] - Name of the operation that timed out
     */
    constructor(message, timeoutMs, operation = null) {
        super(message);
        this.name = 'TimeoutError';
        this.timeoutMs = timeoutMs;
        this.operation = operation;
    }
}

// ==========================================
// Core Timeout Functions
// ==========================================

/**
 * Wrap a promise with a timeout
 * 
 * @param {Promise|Function} promiseOrFn - Promise or async function to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {Object} [options] - Additional options
 * @param {Function} [options.fallback] - Fallback function if timeout occurs
 * @param {string} [options.operation] - Operation name for error context
 * @param {AbortController} [options.abortController] - AbortController for cleanup
 * @returns {Promise<*>} Result of the promise or fallback
 * @throws {TimeoutError} If timeout occurs and no fallback provided
 */
export async function withTimeout(promiseOrFn, timeoutMs, options = {}) {
    const { fallback, operation, abortController } = options;

    // Support both promises and functions
    const promise = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            // Signal abort if controller provided
            if (abortController) {
                abortController.abort();
            }
            reject(new TimeoutError(
                `Operation${operation ? ` '${operation}'` : ''} timed out after ${timeoutMs}ms`,
                timeoutMs,
                operation
            ));
        }, timeoutMs);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof TimeoutError && fallback) {
            console.warn(`[TimeoutWrapper] ${error.message}, executing fallback`);
            return typeof fallback === 'function' ? await fallback() : fallback;
        }

        throw error;
    }
}

/**
 * Wrap an operation with progressive timeout escalation
 * 
 * Tries the operation multiple times with increasing timeouts,
 * useful for operations that may succeed with more time.
 * 
 * @param {Function} operationFn - Async function to execute (called fresh each attempt)
 * @param {Object} [options] - Configuration options
 * @param {number[]} [options.timeouts] - Array of timeout durations in ms (default: [5000, 15000, 30000])
 * @param {Function} [options.fallback] - Fallback function if all attempts fail
 * @param {string} [options.operation] - Operation name for logging
 * @param {Function} [options.onAttempt] - Callback called before each attempt with (attemptNumber, timeoutMs)
 * @param {Function} [options.onRetry] - Callback called on retry with (attemptNumber, error)
 * @returns {Promise<*>} Result of the operation or fallback
 * @throws {TimeoutError} If all attempts timeout and no fallback provided
 */
export async function withProgressiveTimeout(operationFn, options = {}) {
    const {
        timeouts = [5000, 15000, 30000],
        fallback,
        operation,
        onAttempt,
        onRetry
    } = options;

    let lastError;

    for (let attempt = 0; attempt < timeouts.length; attempt++) {
        const timeoutMs = timeouts[attempt];

        try {
            onAttempt?.(attempt + 1, timeoutMs);

            if (attempt > 0) {
                console.log(`[TimeoutWrapper] Attempt ${attempt + 1}/${timeouts.length} with ${timeoutMs}ms timeout`);
            }

            return await withTimeout(operationFn, timeoutMs, { operation });

        } catch (error) {
            lastError = error;

            if (error instanceof TimeoutError) {
                // Only retry on timeout, not on other errors
                if (attempt < timeouts.length - 1) {
                    onRetry?.(attempt + 1, error);
                    console.warn(`[TimeoutWrapper] Attempt ${attempt + 1} timed out, will retry`);
                    continue;
                }
            } else {
                // Non-timeout error, don't retry
                throw error;
            }
        }
    }

    // All attempts exhausted
    if (fallback) {
        console.warn(`[TimeoutWrapper] All ${timeouts.length} attempts failed, executing fallback`);
        return typeof fallback === 'function' ? await fallback() : fallback;
    }

    throw lastError;
}

/**
 * Create a timeout-wrapped version of an async function
 * 
 * Useful for creating timeout-aware API clients.
 * 
 * @param {Function} fn - Async function to wrap
 * @param {number} timeoutMs - Default timeout in milliseconds
 * @param {Object} [options] - Default options for withTimeout
 * @returns {Function} Wrapped function that accepts same args plus optional timeout override
 */
export function createTimeoutWrapper(fn, timeoutMs, options = {}) {
    return async (...args) => {
        // Check if last argument is a timeout override object
        const lastArg = args[args.length - 1];
        let timeout = timeoutMs;
        let fnArgs = args;

        if (lastArg && typeof lastArg === 'object' && lastArg._timeoutOverride) {
            timeout = lastArg.timeout || timeoutMs;
            fnArgs = args.slice(0, -1);
        }

        return withTimeout(
            () => fn(...fnArgs),
            timeout,
            { ...options, operation: fn.name || 'wrapped function' }
        );
    };
}

/**
 * Race multiple operations with individual timeouts
 * 
 * Returns the first operation to complete successfully.
 * Useful for fallback chains (try fast operation, fall back to slower one).
 * 
 * @param {Array<{fn: Function, timeout: number, name?: string}>} operations - Operations to race
 * @returns {Promise<{result: *, operation: string}>} First successful result with operation name
 * @throws {Error} If all operations fail
 */
export async function raceWithTimeouts(operations) {
    const errors = [];

    for (const { fn, timeout, name = 'unnamed' } of operations) {
        try {
            const result = await withTimeout(fn, timeout, { operation: name });
            return { result, operation: name };
        } catch (error) {
            errors.push({ operation: name, error });
            console.warn(`[TimeoutWrapper] Operation '${name}' failed: ${error.message}`);
        }
    }

    const errorSummary = errors.map(e => `${e.operation}: ${e.error.message}`).join('; ');
    throw new Error(`All operations failed: ${errorSummary}`);
}

// ==========================================
// Utility Functions
// ==========================================

/**
 * Create an AbortController that auto-aborts after timeout
 * 
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {{controller: AbortController, cleanup: Function}} Controller and cleanup function
 */
export function createTimeoutAbortController(timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    return {
        controller,
        cleanup: () => clearTimeout(timeoutId)
    };
}

/**
 * Sleep utility
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// Public API
// ==========================================

export const TimeoutWrapper = {
    TimeoutError,
    withTimeout,
    withProgressiveTimeout,
    createTimeoutWrapper,
    raceWithTimeouts,
    createTimeoutAbortController,
    sleep
};

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.TimeoutWrapper = TimeoutWrapper;
    window.TimeoutError = TimeoutError;
}

console.log('[TimeoutWrapper] Module loaded');
