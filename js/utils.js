/**
 * Utility Functions for Rhythm Chamber
 * 
 * Provides resilient network utilities with timeouts and retries.
 */

/**
 * Fetch with timeout support
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default 30s)
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error(`Request timed out after ${timeoutMs}ms`);
        }
        throw err;
    }
}

/**
 * Fetch with exponential backoff retry
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {object} retryConfig - Retry configuration
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options = {}, {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    timeoutMs = 30000,
    retryOnStatus = [429, 500, 502, 503, 504]
} = {}) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetchWithTimeout(url, options, timeoutMs);

            // Check if we should retry based on status
            if (retryOnStatus.includes(response.status) && attempt < maxRetries) {
                const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
                console.warn(`[Utils] Retrying after ${delay}ms (status ${response.status})`);
                await sleep(delay);
                continue;
            }

            return response;
        } catch (err) {
            lastError = err;

            // Don't retry on non-network errors
            if (err.message.includes('timed out') || err.name === 'TypeError') {
                if (attempt < maxRetries) {
                    const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
                    console.warn(`[Utils] Retrying after ${delay}ms (${err.message})`);
                    await sleep(delay);
                    continue;
                }
            }

            throw err;
        }
    }

    throw lastError;
}

/**
 * Fetch with authentication retry support
 * Automatically retries on 401 errors after calling token refresh callback
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {object} authConfig - Authentication configuration
 * @returns {Promise<Response>}
 */
async function fetchWithAuth(url, options = {}, {
    timeoutMs = 30000,
    onAuthError = null,     // Callback to refresh token on 401
    maxAuthRetries = 1,
    getAuthHeader = null    // Callback to get updated auth header after refresh
} = {}) {
    let authRetries = 0;
    let currentOptions = { ...options };

    while (authRetries <= maxAuthRetries) {
        try {
            const response = await fetchWithTimeout(url, currentOptions, timeoutMs);

            // Handle 401 Unauthorized - attempt token refresh
            if (response.status === 401 && onAuthError && authRetries < maxAuthRetries) {
                console.warn('[Utils] Got 401, attempting auth refresh...');
                authRetries++;

                const refreshed = await onAuthError();
                if (refreshed) {
                    // Update authorization header if callback provided
                    if (getAuthHeader) {
                        const newAuthHeader = await getAuthHeader();
                        if (newAuthHeader) {
                            currentOptions = {
                                ...currentOptions,
                                headers: {
                                    ...currentOptions.headers,
                                    'Authorization': newAuthHeader
                                }
                            };
                        }
                    }
                    continue; // Retry with refreshed token
                }

                // Refresh failed - return original response
                return response;
            }

            return response;
        } catch (err) {
            // Don't retry on network errors
            throw err;
        }
    }

    // Should not reach here, but safety fallback
    throw new Error('Max auth retries exceeded');
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a simple hash for data comparison
 * @param {any} data - Data to hash
 * @returns {string} Hash string
 */
function simpleHash(data) {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

/**
 * Debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} waitMs - Wait time in milliseconds
 */
function debounce(func, waitMs) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, waitMs);
    };
}

/**
 * Format duration for display
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted string
 */
function formatDuration(seconds) {
    if (seconds < 60) {
        return `${Math.round(seconds)} seconds`;
    } else if (seconds < 3600) {
        const mins = Math.round(seconds / 60);
        return `~${mins} minute${mins > 1 ? 's' : ''}`;
    } else {
        const hours = Math.round(seconds / 3600);
        return `~${hours} hour${hours > 1 ? 's' : ''}`;
    }
}

// ES Module export
export const Utils = {
    fetchWithTimeout,
    fetchWithRetry,
    fetchWithAuth,
    sleep,
    simpleHash,
    debounce,
    formatDuration
};

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.Utils = Utils;
}

console.log('[Utils] Module loaded');

