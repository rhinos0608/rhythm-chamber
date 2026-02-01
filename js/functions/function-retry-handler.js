/**
 * Function Retry Handler Module
 *
 * Centralizes retry logic coordination for function execution.
 * Delegates to the existing FunctionRetry module for actual retry implementation.
 *
 * Responsibilities:
 * - Delegate to FunctionRetry.withRetry for retry logic
 * - Execute with or without retry based on availability
 * - Handle retry-specific errors
 * - Provide fallback execution without retry
 *
 * @module FunctionRetryHandler
 */

import { FunctionRetry } from './utils/retry.js';

// ==========================================
// Public API
// ==========================================

/**
 * Function Retry Handler
 * Coordinates retry logic for function execution
 */
export const FunctionRetryHandler = {
    /**
     * Execute a function with retry logic
     * Delegates to FunctionRetry.withRetry if available
     *
     * @param {Function} executorFn - Function to execute (should return Promise)
     * @param {string} functionName - Name of function (for logging)
     * @returns {Promise<any>} Result from executor function
     * @throws {Error} If execution fails after retries
     */
    async executeWithRetry(executorFn, functionName) {
        // Check if retry is available
        if (FunctionRetry?.withRetry) {
            return await FunctionRetry.withRetry(executorFn, functionName);
        }

        // Fallback: execute without retry
        console.warn(
            `[FunctionRetryHandler] Retry not available for ${functionName}, executing without retry`
        );
        return await Promise.resolve(executorFn());
    },

    /**
     * Execute a function without retry logic
     * Used as fallback when retry is not available or not desired
     *
     * @param {Function} executorFn - Function to execute (should return Promise)
     * @param {string} functionName - Name of function (for error context)
     * @returns {Promise<any>} Result from executor function
     * @throws {Error} If execution fails
     */
    async executeWithoutRetry(executorFn, functionName) {
        try {
            return await Promise.resolve(executorFn());
        } catch (err) {
            throw new Error(`Failed to execute ${functionName}: ${err.message}`);
        }
    },

    /**
     * Check if retry is available
     * @returns {boolean} True if retry logic is available
     */
    isRetryAvailable() {
        return !!FunctionRetry?.withRetry;
    },
};

console.log('[FunctionRetryHandler] Module loaded');
