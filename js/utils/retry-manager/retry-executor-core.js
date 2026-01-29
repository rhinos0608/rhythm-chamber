/**
 * Retry Executor Core - Core Retry Execution Engine
 *
 * Provides the core retry execution primitives including:
 * - withTimeout: Promise timeout wrapper
 * - RetryContext: Context tracking for retry attempts
 * - withRetry: Core retry execution loop
 *
 * This module contains the fundamental retry execution logic.
 * Pattern-based retry functions are in retry-executor-patterns.js
 *
 * Depends on: retry-config.js, retry-strategies.js
 *
 * @module utils/retry-manager/retry-executor-core
 */

import { EventBus } from '../../services/event-bus.js';
import { DEFAULT_RETRY_CONFIG, classifyError, isRetryable } from './retry-config.js';
import { calculateBackoffForError, calculateExponentialBackoff, delay } from './retry-strategies.js';

// ==========================================
// Timeout Wrapper
// ==========================================

/**
 * Wrap a promise with timeout
 * @param {Function} fn - Async function to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} [message] - Timeout error message
 * @returns {Promise<any>} Result of the function
 */
export async function withTimeout(fn, timeoutMs, message = `Operation timed out after ${timeoutMs}ms`) {
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    try {
        const result = await Promise.race([fn(), timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// ==========================================
// Retry Context
// ==========================================

/**
 * Retry context for tracking attempts and results
 */
export class RetryContext {
    constructor(maxRetries = DEFAULT_RETRY_CONFIG.maxRetries, config = DEFAULT_RETRY_CONFIG) {
        this.attempt = 0;
        this.maxRetries = maxRetries;
        this.config = config;
        this.lastError = null;
        this.startTime = Date.now();
        this.delays = [];
        this.errors = [];
    }

    get shouldRetry() {
        // CRIT-002: Fixed off-by-one error - use < instead of <=
        // With maxRetries=3, we allow attempts 0,1,2 (3 attempts total)
        // Previously: <= allowed 0,1,2,3 (4 attempts - one extra retry)
        return this.attempt < this.maxRetries && isRetryable(this.lastError);
    }

    get elapsedTime() {
        return Date.now() - this.startTime;
    }

    get nextAttemptNumber() {
        return this.attempt + 1;
    }

    get totalDelayTime() {
        return this.delays.reduce((sum, d) => sum + d, 0);
    }

    recordAttempt(error) {
        this.lastError = error;
        if (error) {
            this.errors.push(error);
        }
        const backoff = calculateBackoffForError(this.attempt, error, this.config);
        this.delays.push(backoff);
        this.attempt++;
        return backoff;
    }

    getSummary() {
        return {
            attempts: this.attempt,
            maxRetries: this.maxRetries,
            succeeded: this.attempt > 0 && !this.lastError,
            elapsedTime: this.elapsedTime,
            delays: [...this.delays],
            totalDelayTime: this.totalDelayTime,
            errors: [...this.errors]
        };
    }
}

// ==========================================
// Core Retry Function
// ==========================================

/**
 * Execute a function with retry logic
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {Object} options.config - Retry configuration override
 * @param {Function} options.shouldRetry - Custom retry predicate (error, attempt) => boolean
 * @param {Function} options.onRetry - Callback before each retry (error, attempt, delay, context)
 * @param {Function} options.onSuccess - Callback on success (result, context)
 * @param {Function} options.onFailure - Callback on failure (error, context)
 * @param {AbortSignal} options.abortSignal - Optional abort signal for cancellation
 * @param {number} options.timeoutMs - Optional timeout for each attempt
 * @param {boolean} options.useJitter - Whether to add jitter (default: true)
 * @returns {Promise<{ result: any, context: RetryContext }>} Result with retry context
 */
export async function withRetry(fn, options = {}) {
    const {
        maxRetries = DEFAULT_RETRY_CONFIG.maxRetries,
        config = DEFAULT_RETRY_CONFIG,
        shouldRetry = null,
        onRetry = null,
        onSuccess = null,
        onFailure = null,
        abortSignal = null,
        timeoutMs = null,
        useJitter = true
    } = options;

    // CRIT-001: Validate maxRetries to prevent infinite loop
    if (typeof maxRetries !== 'number' ||
        !Number.isFinite(maxRetries) ||
        maxRetries < 0) {
        throw new Error(`Invalid maxRetries: ${maxRetries}. Must be non-negative finite number.`);
    }

    const context = new RetryContext(maxRetries, config);

    while (true) {
        // Check for abort before attempting
        if (abortSignal?.aborted) {
            const error = new Error('Operation aborted');
            error.name = 'AbortError';
            context.recordAttempt(error);
            if (onFailure) {
                try { onFailure(error, context); } catch (e) { /* ignore */ }
            }
            throw error;
        }

        try {
            // Execute function (with optional timeout)
            const result = timeoutMs
                ? await withTimeout(() => fn(), timeoutMs)
                : await fn();

            context.lastError = null; // Clear error on success

            // Call success callback
            if (onSuccess) {
                try {
                    onSuccess(result, context);
                } catch (callbackError) {
                    console.warn('[RetryManager] Success callback error:', callbackError);
                }
            }

            return { result, context };
        } catch (error) {
            context.lastError = error;

            // Check custom retry predicate
            if (shouldRetry && !shouldRetry(error, context.attempt)) {
                if (onFailure) {
                    try { onFailure(error, context); } catch (e) { /* ignore */ }
                }
                throw error;
            }

            // Check if we should retry
            if (!context.shouldRetry) {
                if (onFailure) {
                    try { onFailure(error, context); } catch (e) { /* ignore */ }
                }
                throw error;
            }

            // Calculate backoff
            const backoff = useJitter
                ? calculateBackoffForError(context.attempt, error, config)
                : calculateExponentialBackoff(context.attempt, config);

            context.recordAttempt(error);

            // Call retry callback
            if (onRetry) {
                try {
                    onRetry(error, context.attempt, backoff, context);
                } catch (callbackError) {
                    console.warn('[RetryManager] Retry callback error:', callbackError);
                }
            }

            // Log retry attempt
            const errorType = classifyError(error);
            console.log(
                `[RetryManager] Retry ${context.attempt}/${maxRetries} after ${backoff}ms ` +
                `(type: ${errorType}, elapsed: ${context.elapsedTime}ms)`
            );

            // Emit retry event
            EventBus.emit('retry:attempt', {
                attempt: context.attempt,
                maxRetries,
                delay: backoff,
                errorType,
                errorMessage: error.message
            });

            // Wait before retry
            await delay(backoff);
        }
    }
}
