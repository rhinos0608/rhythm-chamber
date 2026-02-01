/**
 * Retry Configuration
 *
 * Foundation module for retry behavior. Provides configuration constants,
 * predefined strategies, and error type classification for retry logic.
 *
 * Exports:
 * - ErrorType enum for error classification
 * - DEFAULT_RETRY_CONFIG with standard retry settings
 * - RetryStrategies with predefined configurations for common use cases
 *
 * @module utils/retry-manager/retry-config
 */

/**
 * Error types for retry behavior determination
 */
export const ErrorType = {
    TRANSIENT: 'transient', // Network glitches, timeouts - retry with backoff
    RATE_LIMIT: 'rate_limit', // 429 - retry with longer delays
    SERVER_ERROR: 'server_error', // 5xx - retry with backoff
    CLIENT_ERROR: 'client_error', // 4xx (except 429) - don't retry
    AUTHENTICATION: 'auth', // 401/403 - don't retry, needs user action
    CIRCUIT_OPEN: 'circuit_open', // Circuit breaker open - don't retry
    QUOTA_EXCEEDED: 'quota', // QuotaExceededError - don't retry
    INVALID_STATE: 'invalid_state', // InvalidStateError - don't retry
    TIMEOUT: 'timeout', // Timeout errors - retry with backoff
    ABORTED: 'aborted', // AbortError - don't retry (intentional cancellation)
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

    // CRIT-004: Check AbortError FIRST (before message checks)
    // AbortError.name is authoritative, message can vary
    if (name === 'AbortError') {
        return ErrorType.ABORTED;
    }

    // Circuit breaker errors
    if (message.includes('circuit') && message.includes('open')) {
        return ErrorType.CIRCUIT_OPEN;
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
        return ErrorType.TIMEOUT;
    }

    // Quota exceeded errors
    if (name === 'QuotaExceededError') {
        return ErrorType.QUOTA_EXCEEDED;
    }

    // Invalid state errors
    if (name === 'InvalidStateError') {
        return ErrorType.INVALID_STATE;
    }

    // Authentication errors
    if (
        message.includes('401') ||
        message.includes('403') ||
        message.includes('unauthorized') ||
        message.includes('forbidden')
    ) {
        return ErrorType.AUTHENTICATION;
    }

    // Rate limit errors
    if (
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('too many requests')
    ) {
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

    // Client errors (4xx except 429)
    if (message.match(/4[0-9]{2}/)) {
        return ErrorType.CLIENT_ERROR;
    }

    // Network errors
    if (name === 'TypeError' && message.includes('fetch')) {
        return ErrorType.TRANSIENT;
    }
    if (
        message.includes('network') ||
        message.includes('econnrefused') ||
        message.includes('etimedout') ||
        message.includes('connection') ||
        message.includes('enotfound')
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
    return [
        ErrorType.TRANSIENT,
        ErrorType.RATE_LIMIT,
        ErrorType.SERVER_ERROR,
        ErrorType.TIMEOUT,
    ].includes(errorType);
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterMs: 200,
    exponentialBase: 2,
    timeoutMs: 30000,
};

/**
 * Predefined retry strategies for common use cases
 */
export const RetryStrategies = {
    /**
     * Network operations (API calls, fetch, etc.)
     */
    NETWORK: {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        jitterMs: 200,
        exponentialBase: 2,
        timeoutMs: 30000,
    },

    /**
     * Database operations (IndexedDB, localStorage)
     */
    DATABASE: {
        maxRetries: 2,
        baseDelayMs: 500,
        maxDelayMs: 5000,
        jitterMs: 100,
        exponentialBase: 2,
        timeoutMs: 5000,
    },

    /**
     * Storage transaction operations
     */
    TRANSACTION: {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 5000,
        jitterMs: 50,
        exponentialBase: 2,
        timeoutMs: 5000,
    },

    /**
     * Function execution
     */
    FUNCTION: {
        maxRetries: 2,
        baseDelayMs: 500,
        maxDelayMs: 5000,
        jitterMs: 100,
        exponentialBase: 2,
        timeoutMs: 10000,
    },

    /**
     * Provider calls (LLM providers)
     */
    PROVIDER: {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterMs: 200,
        exponentialBase: 2,
        timeoutMs: 60000,
    },

    /**
     * Worker initialization
     */
    WORKER: {
        maxRetries: 3,
        baseDelayMs: 2000,
        maxDelayMs: 15000,
        jitterMs: 500,
        exponentialBase: 2,
        timeoutMs: 10000,
    },

    /**
     * Lock acquisition
     */
    LOCK: {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        jitterMs: 50,
        exponentialBase: 2,
        timeoutMs: 2000,
    },

    /**
     * Aggressive retry for critical operations
     */
    AGGRESSIVE: {
        maxRetries: 5,
        baseDelayMs: 500,
        maxDelayMs: 10000,
        jitterMs: 100,
        exponentialBase: 2,
        timeoutMs: 15000,
    },

    /**
     * Conservative retry for non-critical operations
     */
    CONSERVATIVE: {
        maxRetries: 1,
        baseDelayMs: 1000,
        maxDelayMs: 3000,
        jitterMs: 200,
        exponentialBase: 2,
        timeoutMs: 5000,
    },
};
