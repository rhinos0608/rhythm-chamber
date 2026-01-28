/**
 * Provider Interface Retry Logic
 *
 * Error detection and retry delay calculation for provider requests.
 * Part of the refactored ProviderInterface module.
 *
 * @module providers/interface/retry
 */

import { RETRY_CONFIG } from './config.js';

/**
 * Check if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} Whether the error is retryable
 */
export function isRetryableError(error) {
    if (!error) return false;

    const msg = (error.message || '').toLowerCase();
    const name = error.name || '';

    // Network errors
    if (name === 'AbortError' || msg.includes('timeout') || msg.includes('fetch')) {
        return true;
    }

    // HTTP errors
    if (msg.includes('429') || msg.includes('rate limit')) {
        return true;
    }

    // Server errors (5xx)
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
        return true;
    }

    // Network errors
    if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('etimedout')) {
        return true;
    }

    return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-based)
 * @returns {number} Delay in milliseconds
 */
export function calculateRetryDelay(attempt) {
    const exponentialDelay = Math.min(
        RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt),
        RETRY_CONFIG.MAX_DELAY_MS
    );
    const jitter = Math.random() * RETRY_CONFIG.JITTER_MS;
    return exponentialDelay + jitter;
}

/**
 * Delay for a specified amount of time
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract Retry-After value from error if present
 * @param {Error} error - The error object
 * @returns {number} Milliseconds to wait, or 0 if no Retry-After
 */
export function extractRetryAfter(error) {
    // Check if error has a response with Retry-After header
    if (error.response && error.response.headers) {
        const retryAfter = error.response.headers.get('Retry-After');
        if (retryAfter) {
            // HIGH FIX #6: Parse both seconds and HTTP-date formats
            // RFC 7231 specifies Retry-After can be:
            // - Delay-seconds: decimal integer (e.g., "120")
            // - HTTP-date: RFC 1123 date (e.g., "Wed, 21 Oct 2015 07:28:00 GMT")
            const seconds = parseInt(retryAfter, 10);
            if (!isNaN(seconds)) {
                return seconds * 1000;
            }

            // Try parsing as HTTP-date
            const date = new Date(retryAfter);
            if (!isNaN(date.getTime())) {
                const delayMs = Math.max(0, date.getTime() - Date.now());
                // Cap at 1 hour to prevent excessive waits
                return Math.min(delayMs, 3600000);
            }

            // If parsing fails, use default
            return 60000;
        }
    }

    // Check for rate limit in message and use default delay
    if (error.message && (error.message.includes('429') || error.message.includes('rate limit'))) {
        return 60000; // Default to 1 minute for rate limits
    }

    return 0;
}
