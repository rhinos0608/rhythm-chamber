/**
 * Retry Executor Patterns - Specialized Retry Patterns
 *
 * Provides specialized retry patterns and convenience functions:
 * - Basic patterns: retryExponential, retryLinear, retryCustom
 * - Advanced patterns: withRetryParallel, withFallback, withCircuitBreaker, withStrategy
 * - Convenience functions: retryStorage, retryNetwork, retryFunction, retryTransaction
 *
 * This module depends on retry-executor-core.js for core retry logic.
 *
 * Depends on: retry-config.js, retry-strategies.js, retry-executor-core.js
 *
 * @module utils/retry-manager/retry-executor-patterns
 */

import { DEFAULT_RETRY_CONFIG, classifyError, isRetryable, ErrorType, RetryStrategies } from './retry-config.js';
import { calculateLinearBackoff, calculateCustomBackoff, addJitter, delay } from './retry-strategies.js';
import { withRetry } from './retry-executor-core.js';

// ==========================================
// Basic Retry Patterns
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

    // MED-001: Fix off-by-one error - use < instead of <=
    // With maxRetries=3, we want attempts 0,1,2 (3 attempts total)
    // Previously: <= allowed 0,1,2,3 (4 attempts - one extra)
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            // MED-001: Check against maxRetries-1 since we're counting from 0
            if (attempt === maxRetries - 1 || !isRetryable(error)) {
                throw error;
            }

            const backoff = calculateLinearBackoff(attempt, config);
            const delayWithJitter = addJitter(backoff, config);

            const DEBUG = globalThis.DEBUG ?? false;
            if (DEBUG) {
                console.log(`[RetryManager] Linear retry ${attempt + 1}/${maxRetries} after ${delayWithJitter}ms`);
            }
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

    // MED-001: Fix off-by-one error - use < instead of <=
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            // MED-001: Check against maxRetries-1 since we're counting from 0
            if (attempt === maxRetries - 1 || !isRetryable(error)) {
                throw error;
            }

            const backoff = calculateCustomBackoff(attempt, backoffFn, config);
            const delayWithJitter = addJitter(backoff, config);

            const DEBUG = globalThis.DEBUG ?? false;
            if (DEBUG) {
                console.log(`[RetryManager] Custom retry ${attempt + 1}/${maxRetries} after ${delayWithJitter}ms`);
            }
            await delay(delayWithJitter);
        }
    }
}

// ==========================================
// Advanced Retry Patterns
// ==========================================

/**
 * Execute multiple functions with parallel retry logic
 * All functions start simultaneously, each with independent retry logic
 * @param {Array<Function>} fns - Array of async functions to execute
 * @param {Object} options - Retry options (same as withRetry)
 * @returns {Promise<Array<{ result: any, context: import('./retry-executor-core.js').RetryContext }>>} Results array
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
                    // Emit error event for monitoring
                    // Note: withFallback doesn't have EventBus imported, so we use console.warn
                    // to maintain backward compatibility. In production, this should be replaced
                    // with proper event emission.
                    console.warn('[RetryManager] Fallback callback error:', callbackError);
                    // Re-throw to surface callback errors
                    throw callbackError;
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

/**
 * Execute with circuit breaker awareness
 * @param {Function} checkCircuit - Function to check circuit state: () => { allowed, reason }
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of the function
 */
export async function withCircuitBreaker(checkCircuit, fn, options = {}) {
    // HIGH-002: Static import instead of dynamic import
    // ErrorType is now imported at module level

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

/**
 * Execute with predefined strategy
 * @param {Function} fn - Async function to execute
 * @param {string} strategyName - Strategy name from RetryStrategies
 * @param {Object} optionsOverride - Optional config overrides
 * @returns {Promise<any>} Result of the function
 */
export async function withStrategy(fn, strategyName, optionsOverride = {}) {
    // HIGH-003: Static import instead of dynamic import
    // RetryStrategies is now imported at module level
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
