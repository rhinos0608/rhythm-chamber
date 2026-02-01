/**
 * Resilient Retry Utility
 *
 * Unified retry logic with exponential backoff, jitter, and circuit breaker integration.
 * Prevents thundering herd problems and provides graceful degradation.
 *
 * HNW Considerations:
 * - Hierarchy: Single source of truth for retry strategies
 * - Network: Jitter prevents synchronized retry storms
 * - Wave: Exponential backoff respects system capacity over time
 *
 * @module utils/resilient-retry
 */

// ==========================================
// Retry Configuration
// ==========================================

/**
 * Default retry configuration
 */
export const RETRY_CONFIG = {
    MAX_RETRIES: 3,
    BASE_DELAY_MS: 1000,
    MAX_DELAY_MS: 30000,
    JITTER_MS: 200,
    EXPONENTIAL_BASE: 2,
};

/**
 * Error types classified for retry behavior
 */
export const ErrorType = {
    TRANSIENT: 'transient', // Network glitches, timeouts - retry with backoff
    RATE_LIMIT: 'rate_limit', // 429 - retry with longer delays
    SERVER_ERROR: 'server_error', // 5xx - retry with backoff
    CLIENT_ERROR: 'client_error', // 4xx (except 429) - don't retry
    AUTHENTICATION: 'auth', // 401/403 - don't retry, needs user action
    CIRCUIT_OPEN: 'circuit_open', // Circuit breaker open - don't retry
    UNKNOWN: 'unknown', // Default to transient
};

/**
 * Classify error for retry behavior
 * @param {Error} error - The error to classify
 * @returns {string} Error type from ErrorType enum
 */
export function classifyError(error) {
    if (!error) return ErrorType.UNKNOWN;

    const message = (error.message || '').toLowerCase();
    const name = error.name || '';

    // Circuit breaker errors
    if (message.includes('circuit') && message.includes('open')) {
        return ErrorType.CIRCUIT_OPEN;
    }

    // Authentication errors
    if (name === 'AbortError' && message.includes('timeout')) {
        return ErrorType.TRANSIENT; // Timeout is transient
    }
    if (message.includes('401') || message.includes('403') || message.includes('unauthorized')) {
        return ErrorType.AUTHENTICATION;
    }

    // Rate limit errors
    if (message.includes('429') || message.includes('rate limit')) {
        return ErrorType.RATE_LIMIT;
    }

    // Server errors
    if (
        message.includes('500') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504')
    ) {
        return ErrorType.SERVER_ERROR;
    }

    // Network errors
    if (name === 'TypeError' && message.includes('fetch')) {
        return ErrorType.TRANSIENT;
    }
    if (
        message.includes('network') ||
        message.includes('econnrefused') ||
        message.includes('etimedout') ||
        message.includes('connection')
    ) {
        return ErrorType.TRANSIENT;
    }

    // Default to transient for unknown errors
    return ErrorType.TRANSIENT;
}

/**
 * Check if error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} Whether the error should be retried
 */
export function isRetryable(error) {
    const errorType = classifyError(error);
    return [ErrorType.TRANSIENT, ErrorType.RATE_LIMIT, ErrorType.SERVER_ERROR].includes(errorType);
}

/**
 * Calculate delay with exponential backoff and jitter
 * Prevents thundering herd by adding randomness
 *
 * @param {number} attempt - Current attempt (0-indexed)
 * @param {Object} config - Retry configuration
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoff(attempt, config = RETRY_CONFIG) {
    // Exponential backoff: baseDelay * 2^attempt
    const exponentialDelay = Math.min(
        config.BASE_DELAY_MS * Math.pow(config.EXPONENTIAL_BASE, attempt),
        config.MAX_DELAY_MS
    );

    // Add jitter to prevent synchronized retries
    const jitter = Math.random() * config.JITTER_MS;

    return Math.floor(exponentialDelay + jitter);
}

/**
 * Calculate delay with rate limit awareness
 * For 429 errors, use longer base delays
 *
 * @param {number} attempt - Current attempt (0-indexed)
 * @param {Error} error - The error that occurred
 * @param {Object} config - Retry configuration
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoffForError(attempt, error, config = RETRY_CONFIG) {
    const errorType = classifyError(error);

    // Use longer delays for rate limits
    if (errorType === ErrorType.RATE_LIMIT) {
        const rateLimitConfig = {
            ...config,
            BASE_DELAY_MS: Math.max(config.BASE_DELAY_MS, 5000), // Minimum 5s
            JITTER_MS: 1000, // More jitter for rate limits
        };
        return calculateBackoff(attempt, rateLimitConfig);
    }

    // Use standard backoff for transient errors
    return calculateBackoff(attempt, config);
}

/**
 * Delay for specified milliseconds
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry context for tracking attempts
 */
export class RetryContext {
    constructor(maxRetries = RETRY_CONFIG.MAX_RETRIES, config = RETRY_CONFIG) {
        this.attempt = 0;
        this.maxRetries = maxRetries;
        this.config = config;
        this.lastError = null;
        this.startTime = Date.now();
        this.delays = [];
    }

    get shouldRetry() {
        return this.attempt <= this.maxRetries && isRetryable(this.lastError);
    }

    get elapsedTime() {
        return Date.now() - this.startTime;
    }

    get nextAttemptNumber() {
        return this.attempt + 1;
    }

    recordAttempt(error) {
        this.lastError = error;
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
            totalDelayTime: this.delays.reduce((sum, d) => sum + d, 0),
        };
    }
}

/**
 * Execute a function with resilient retry logic
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {Function} options.onRetry - Callback before each retry (error, attempt, delay)
 * @param {Function} options.shouldRetry - Custom retry predicate (error, attempt) => boolean
 * @param {Object} options.config - Retry configuration override
 * @param {AbortSignal} options.abortSignal - Optional abort signal for cancellation
 * @returns {Promise<{ result: any, context: RetryContext }>} Result with retry context
 */
export async function withRetry(fn, options = {}) {
    const {
        maxRetries = RETRY_CONFIG.MAX_RETRIES,
        onRetry = null,
        shouldRetry = null,
        config = RETRY_CONFIG,
        abortSignal = null,
    } = options;

    const context = new RetryContext(maxRetries, config);

    while (true) {
        // Check for abort before attempting
        if (abortSignal?.aborted) {
            throw new Error('Operation aborted');
        }

        try {
            const result = await fn();
            context.lastError = null; // Clear error on success
            return { result, context };
        } catch (error) {
            context.lastError = error;

            // Check custom retry predicate
            if (shouldRetry && !shouldRetry(error, context.attempt)) {
                throw error;
            }

            // Check if we should retry
            if (!context.shouldRetry) {
                throw error;
            }

            // Calculate backoff
            const backoff = context.recordAttempt(error);

            // Call retry callback
            if (onRetry) {
                try {
                    onRetry(error, context.attempt, backoff, context);
                } catch (callbackError) {
                    console.warn('[ResilientRetry] Retry callback error:', callbackError);
                }
            }

            // Log retry attempt
            const errorType = classifyError(error);
            console.log(
                `[ResilientRetry] Retry ${context.attempt}/${maxRetries} after ${backoff}ms ` +
                    `(type: ${errorType}, elapsed: ${context.elapsedTime}ms)`
            );

            // Wait before retry
            await delay(backoff);
        }
    }
}

/**
 * Execute multiple functions with parallel retry logic
 * All functions start simultaneously, each with independent retry logic
 *
 * @param {Array<Function>} fns - Array of async functions to execute
 * @param {Object} options - Retry options (same as withRetry)
 * @returns {Promise<Array<{ result: any, context: RetryContext }>>} Results array
 */
export async function withRetryParallel(fns, options = {}) {
    const promises = fns.map(fn => withRetry(fn, options));
    return Promise.all(promises);
}

/**
 * Execute functions with fallback chain
 * Try each function in sequence, falling back to next on failure
 *
 * @param {Array<Function>>} fns - Array of async functions to try in order
 * @param {Object} options - Options
 * @param {Function} options.onFallback - Callback when falling back (error, fnIndex)
 * @param {AbortSignal} options.abortSignal - Optional abort signal
 * @returns {Promise<{ result: any, fnIndex: number, errors: Array<Error> }>}
 */
export async function withFallback(fns, options = {}) {
    const { onFallback = null, abortSignal = null } = options;
    const errors = [];

    for (let i = 0; i < fns.length; i++) {
        // Check for abort
        if (abortSignal?.aborted) {
            throw new Error('Operation aborted');
        }

        try {
            const result = await fns[i]();
            return { result, fnIndex: i, errors };
        } catch (error) {
            errors.push(error);

            // Call fallback callback
            if (onFallback) {
                try {
                    onFallback(error, i);
                } catch (callbackError) {
                    console.warn('[ResilientRetry] Fallback callback error:', callbackError);
                }
            }

            // Log fallback
            console.warn(
                `[ResilientRetry] Fallback ${i + 1}/${fns.length} failed: ${error.message}`
            );

            // If this is the last function, throw
            if (i === fns.length - 1) {
                throw new Error(`All fallbacks exhausted. Last error: ${error.message}`, {
                    cause: error,
                });
            }
        }
    }
}

// ==========================================
// Common Retry Strategies
// ==========================================

/**
 * Retry strategy for network requests
 */
export const networkRetryStrategy = {
    maxRetries: 3,
    config: {
        BASE_DELAY_MS: 1000,
        MAX_DELAY_MS: 10000,
        JITTER_MS: 200,
        EXPONENTIAL_BASE: 2,
    },
    onRetry: (error, attempt, delay) => {
        console.log(
            `[Network] Retrying request (attempt ${attempt}) in ${delay}ms: ${error.message}`
        );
    },
};

/**
 * Retry strategy for database operations
 */
export const databaseRetryStrategy = {
    maxRetries: 2,
    config: {
        BASE_DELAY_MS: 500,
        MAX_DELAY_MS: 5000,
        JITTER_MS: 100,
        EXPONENTIAL_BASE: 2,
    },
    onRetry: (error, attempt, delay) => {
        console.log(
            `[Database] Retrying operation (attempt ${attempt}) in ${delay}ms: ${error.message}`
        );
    },
};

/**
 * Retry strategy for worker initialization
 */
export const workerRetryStrategy = {
    maxRetries: 3,
    config: {
        BASE_DELAY_MS: 2000,
        MAX_DELAY_MS: 15000,
        JITTER_MS: 500,
        EXPONENTIAL_BASE: 2,
    },
    onRetry: (error, attempt, delay) => {
        console.log(
            `[Worker] Retrying initialization (attempt ${attempt}) in ${delay}ms: ${error.message}`
        );
    },
};

/**
 * Retry strategy for LLM provider calls
 */
export const providerRetryStrategy = {
    maxRetries: 3,
    config: {
        BASE_DELAY_MS: 1000,
        MAX_DELAY_MS: 30000,
        JITTER_MS: 200,
        EXPONENTIAL_BASE: 2,
    },
    shouldRetry: (error, attempt) => {
        // Don't retry if circuit is open
        if (error.message?.includes('circuit open')) {
            return false;
        }
        // Don't retry authentication errors
        if (error.message?.includes('401') || error.message?.includes('403')) {
            return false;
        }
        return attempt < 3; // Max 3 retries
    },
    onRetry: (error, attempt, delay) => {
        console.log(
            `[Provider] Retrying call (attempt ${attempt}) in ${delay}ms: ${error.message}`
        );
    },
};

// Export default
export default {
    RETRY_CONFIG,
    ErrorType,
    classifyError,
    isRetryable,
    calculateBackoff,
    calculateBackoffForError,
    delay,
    RetryContext,
    withRetry,
    withRetryParallel,
    withFallback,
    networkRetryStrategy,
    databaseRetryStrategy,
    workerRetryStrategy,
    providerRetryStrategy,
};

console.log('[ResilientRetry] Module loaded with unified retry strategies');
