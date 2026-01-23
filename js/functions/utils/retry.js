/**
 * Retry Utilities for Function Execution
 * 
 * HNW Considerations:
 * - Wave: Exponential backoff prevents thundering herd
 * - Network: Transient error detection enables graceful degradation
 * - Hierarchy: Retry logic isolated from business logic
 */

const MAX_FUNCTION_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

/**
 * Check if error is transient (worth retrying)
 * @param {Error} err - The error to check
 * @returns {boolean} Whether the error is transient
 */
function isTransientError(err) {
    if (!err) return false;

    // AbortError is NOT retryable - it indicates intentional cancellation (timeout)
    if (err.name === 'AbortError') {
        return false;
    }

    const msg = (err.message || '').toLowerCase();
    return msg.includes('timeout') ||
        msg.includes('rate limit') ||
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('network') ||
        msg.includes('fetch');
}

/**
 * Exponential backoff delay with jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {Promise<void>}
 */
async function backoffDelay(attempt) {
    const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
    const jitter = Math.random() * 100; // Prevent thundering herd
    await new Promise(r => setTimeout(r, delay + jitter));
}

/**
 * Execute a function with retry logic
 * @param {Function} fn - Async function to execute
 * @param {string} functionName - Name for logging
 * @returns {Promise<any>} Result of the function
 */
async function withRetry(fn, functionName = 'function') {
    let lastError;

    for (let attempt = 0; attempt <= MAX_FUNCTION_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            console.warn(`[Functions] Attempt ${attempt + 1}/${MAX_FUNCTION_RETRIES + 1} for ${functionName} failed:`, err.message);

            if (isTransientError(err) && attempt < MAX_FUNCTION_RETRIES) {
                await backoffDelay(attempt);
                continue;
            }
            break;
        }
    }

    console.error(`[Functions] ${functionName} failed after ${MAX_FUNCTION_RETRIES + 1} attempts:`, lastError);
    throw lastError;
}

// ES Module export
export const FunctionRetry = {
    MAX_RETRIES: MAX_FUNCTION_RETRIES,
    isTransientError,
    backoffDelay,
    withRetry
};


console.log('[FunctionRetry] Module loaded');

