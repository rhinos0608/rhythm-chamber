/**
 * Unified Retry Manager
 *
 * Consolidates all retry patterns from across the codebase into a single,
 * comprehensive retry utility. Addresses the "Retry Logic Duplication" anti-pattern.
 *
 * Features:
 * - Multiple retry strategies (exponential, linear, custom)
 * - Unified retry configuration
 * - Retry condition builders
 * - Jitter utilities
 * - Circuit breaker integration
 * - Timeout wrapping
 * - Error classification
 * - Retry context tracking
 * - Parallel retry support
 * - Fallback chain execution
 *
 * HNW Considerations:
 * - Hierarchy: Single source of truth for all retry logic
 * - Network: Jitter prevents thundering herd
 * - Wave: Exponential backoff respects system capacity
 *
 * @module utils/retry-manager
 */

import { EventBus } from '../services/event-bus.js';

// ==========================================
// Error Classification
// ==========================================

/**
 * Error types for retry behavior determination
 */
export const ErrorType = {
    TRANSIENT: 'transient',           // Network glitches, timeouts - retry with backoff
    RATE_LIMIT: 'rate_limit',        // 429 - retry with longer delays
    SERVER_ERROR: 'server_error',    // 5xx - retry with backoff
    CLIENT_ERROR: 'client_error',    // 4xx (except 429) - don't retry
    AUTHENTICATION: 'auth',          // 401/403 - don't retry, needs user action
    CIRCUIT_OPEN: 'circuit_open',     // Circuit breaker open - don't retry
    QUOTA_EXCEEDED: 'quota',          // QuotaExceededError - don't retry
    INVALID_STATE: 'invalid_state',   // InvalidStateError - don't retry
    TIMEOUT: 'timeout',              // Timeout errors - retry with backoff
    ABORTED: 'aborted',              // AbortError - don't retry (intentional cancellation)
    UNKNOWN: 'unknown'               // Default to transient
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
    if (message.includes('401') || message.includes('403') ||
        message.includes('unauthorized') || message.includes('forbidden')) {
        return ErrorType.AUTHENTICATION;
    }

    // Rate limit errors
    if (message.includes('429') || message.includes('rate limit') ||
        message.includes('too many requests')) {
        return ErrorType.RATE_LIMIT;
    }

    // Server errors
    if (message.includes('500') || message.includes('502') ||
        message.includes('503') || message.includes('504')) {
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
    if (message.includes('network') || message.includes('econnrefused') ||
        message.includes('etimedout') || message.includes('connection') ||
        message.includes('enotfound')) {
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
        ErrorType.TIMEOUT
    ].includes(errorType);
}

// ==========================================
// Retry Configuration
// ==========================================

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterMs: 200,
    exponentialBase: 2,
    timeoutMs: 30000
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
        timeoutMs: 30000
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
        timeoutMs: 5000
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
        timeoutMs: 5000
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
        timeoutMs: 10000
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
        timeoutMs: 60000
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
        timeoutMs: 10000
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
        timeoutMs: 2000
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
        timeoutMs: 15000
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
        timeoutMs: 5000
    }
};

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
    const linearDelay = Math.min(
        config.baseDelayMs * (attempt + 1),
        config.maxDelayMs
    );
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
            jitterMs: 1000 // More jitter for rate limits
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
    // CRIT-003: Fix memory leak - clear timeout after operation completes
    let timeoutId;
    let settled = false;

    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            if (!settled) {
                settled = true;
                // Swallow the rejection if already settled
                try {
                    reject(new Error(message));
                } catch (e) {
                    // Ignore - promise already settled
                }
            }
        }, timeoutMs);
    });

    // Create a wrapper for the operation promise
    const operationPromise = (async () => {
        try {
            return await fn();
        } finally {
            // Mark as settled to prevent timeout from rejecting
            settled = true;
        }
    })();

    try {
        return await Promise.race([operationPromise, timeoutPromise]);
    } catch (error) {
        // Mark as settled to prevent timeout from rejecting
        settled = true;
        throw error;
    } finally {
        // Always clear timeout to prevent memory leak
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
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

// ==========================================
// Specialized Retry Functions
// ==========================================

/**
 * Retry with exponential backoff (convenience wrapper)
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of the function
 */
export async function retryExponential(fn, options = {}) {
    const { result } = await withRetry(fn, {
        ...options,
        useJitter: true
    });
    return result;
}

/**
 * Retry with linear backoff
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of the function
 */
export async function retryLinear(fn, options = {}) {
    const maxRetries = options.maxRetries || DEFAULT_RETRY_CONFIG.maxRetries;
    const config = options.config || DEFAULT_RETRY_CONFIG;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxRetries || !isRetryable(error)) {
                throw error;
            }

            const backoff = calculateLinearBackoff(attempt, config);
            const delayWithJitter = addJitter(backoff, config);

            console.log(`[RetryManager] Linear retry ${attempt + 1}/${maxRetries} after ${delayWithJitter}ms`);
            await delay(delayWithJitter);
        }
    }
}

/**
 * Retry with custom backoff function
 * @param {Function} fn - Async function to execute
 * @param {Function} backoffFn - Custom backoff function (attempt, config) => delay
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of the function
 */
export async function retryCustom(fn, backoffFn, options = {}) {
    const maxRetries = options.maxRetries || DEFAULT_RETRY_CONFIG.maxRetries;
    const config = options.config || DEFAULT_RETRY_CONFIG;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxRetries || !isRetryable(error)) {
                throw error;
            }

            const backoff = calculateCustomBackoff(attempt, backoffFn, config);
            const delayWithJitter = addJitter(backoff, config);

            console.log(`[RetryManager] Custom retry ${attempt + 1}/${maxRetries} after ${delayWithJitter}ms`);
            await delay(delayWithJitter);
        }
    }
}

/**
 * Execute multiple functions with parallel retry logic
 * All functions start simultaneously, each with independent retry logic
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
 * @param {Array<Function>} fns - Array of async functions to try in order
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
                    console.warn('[RetryManager] Fallback callback error:', callbackError);
                }
            }

            // Log fallback
            console.warn(
                `[RetryManager] Fallback ${i + 1}/${fns.length} failed: ${error.message}`
            );

            // If this is the last function, throw
            if (i === fns.length - 1) {
                throw new Error(
                    `All fallbacks exhausted. Last error: ${error.message}`,
                    { cause: error }
                );
            }
        }
    }
}

// ==========================================
// Circuit Breaker Integration
// ==========================================

/**
 * Execute with circuit breaker awareness
 * @param {Function} checkCircuit - Function to check circuit state: () => { allowed, reason }
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of the function
 */
export async function withCircuitBreaker(checkCircuit, fn, options = {}) {
    // Check circuit before attempting
    const circuitCheck = checkCircuit();
    if (!circuitCheck.allowed) {
        const error = new Error(circuitCheck.reason || 'Circuit breaker is open');
        error.code = 'CIRCUIT_OPEN';
        error.circuitState = circuitCheck.state;
        throw error;
    }

    try {
        return await withRetry(fn, options);
    } catch (error) {
        // Re-throw circuit breaker errors
        if (error.code === 'CIRCUIT_OPEN' || classifyError(error) === ErrorType.CIRCUIT_OPEN) {
            throw error;
        }
        throw error;
    }
}

// ==========================================
// Strategy-based Retry
// ==========================================

/**
 * Execute with predefined strategy
 * @param {Function} fn - Async function to execute
 * @param {string} strategyName - Strategy name from RetryStrategies
 * @param {Object} optionsOverride - Optional config overrides
 * @returns {Promise<any>} Result of the function
 */
export async function withStrategy(fn, strategyName, optionsOverride = {}) {
    const strategy = RetryStrategies[strategyName.toUpperCase()];
    if (!strategy) {
        throw new Error(`Unknown retry strategy: ${strategyName}`);
    }

    const { result } = await withRetry(fn, {
        config: strategy,
        ...optionsOverride
    });

    return result;
}

// ==========================================
// Convenience Functions for Common Patterns
// ==========================================

/**
 * Retry a storage operation
 * @param {Function} fn - Async storage operation
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of the operation
 */
export async function retryStorage(fn, options = {}) {
    return withStrategy(fn, 'DATABASE', options);
}

/**
 * Retry a network request
 * @param {Function} fn - Async network request
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of the request
 */
export async function retryNetwork(fn, options = {}) {
    return withStrategy(fn, 'NETWORK', options);
}

/**
 * Retry a function call
 * @param {Function} fn - Async function
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of the function
 */
export async function retryFunction(fn, options = {}) {
    return withStrategy(fn, 'FUNCTION', options);
}

/**
 * Retry a transaction
 * @param {Function} fn - Async transaction
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of the transaction
 */
export async function retryTransaction(fn, options = {}) {
    return withStrategy(fn, 'TRANSACTION', options);
}

// ==========================================
// Public API
// ==========================================

export const RetryManager = {
    // Configuration
    DEFAULT_RETRY_CONFIG,
    RetryStrategies,
    ErrorType,

    // Error classification
    classifyError,
    isRetryable,

    // Delay calculation
    calculateExponentialBackoff,
    calculateLinearBackoff,
    calculateCustomBackoff,
    addJitter,
    calculateBackoffWithJitter,
    calculateBackoffForError,
    delay,

    // Retry conditions
    retryOnErrorTypes,
    retryWithMaxAttempts,
    retryOnStatus,
    retryIfAll,
    retryIfAny,
    retryNever,
    retryAlways,

    // Core retry
    withRetry,
    retryExponential,
    retryLinear,
    retryCustom,

    // Advanced patterns
    withRetryParallel,
    withFallback,
    withCircuitBreaker,
    withStrategy,

    // Convenience functions
    retryStorage,
    retryNetwork,
    retryFunction,
    retryTransaction,

    // Utilities
    withTimeout,
    RetryContext
};

export default RetryManager;

console.log('[RetryManager] Unified retry utility loaded');
