/**
 * Utility Functions for Rhythm Chamber
 *
 * Provides resilient network utilities with timeouts and retries.
 */
import { withRetry, RETRY_CONFIG, classifyError } from './utils/resilient-retry.js';

/**
 * Fetch with timeout support and external abort signal
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Fetch options (can include external signal)
 * @param {number} timeoutMs - Timeout in milliseconds (default 30s)
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Support external abort signal (for user-initiated cancellation)
    let externalAbortHandler;
    if (options.signal) {
        // Check for pre-aborted signal to avoid unnecessary operations
        if (options.signal.aborted) {
            clearTimeout(timeoutId);
            controller.abort();
            throw new Error('Request cancelled');
        }

        // Store handler reference for cleanup
        externalAbortHandler = () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
        options.signal.addEventListener('abort', externalAbortHandler);
    }

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
            // Distinguish between timeout and user cancellation
            if (options.signal?.aborted) {
                throw new Error('Request cancelled');
            }
            throw new Error(`Request timed out after ${timeoutMs}ms`);
        }
        throw err;
    } finally {
        // Clean up external signal listener in all code paths
        if (externalAbortHandler && options.signal) {
            options.signal.removeEventListener('abort', externalAbortHandler);
        }
    }
}

/**
 * Fetch with exponential backoff retry
 * @param {string} url - URL to fetch
 * @param {object} config - Combined configuration
 * @param {RequestInit} config.options - Fetch options
 * @param {number} config.maxRetries - Maximum retry attempts
 * @param {number} config.baseDelayMs - Base delay for exponential backoff
 * @param {number} config.maxDelayMs - Maximum delay between retries
 * @param {number} config.timeoutMs - Timeout for each fetch attempt
 * @param {number[]} config.retryOnStatus - HTTP status codes that trigger retry
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, config = {}) {
    const {
        options = {},
        maxRetries = 3,
        baseDelayMs = 1000,
        maxDelayMs = 10000,
        timeoutMs = 30000,
        retryOnStatus = [429, 500, 502, 503, 504]
    } = config;

    // Build retry config from provided parameters
    const retryConfig = {
        ...RETRY_CONFIG,
        MAX_RETRIES: maxRetries,
        BASE_DELAY_MS: baseDelayMs,
        MAX_DELAY_MS: maxDelayMs
    };

    // Create shouldRetry callback that checks both error classification and HTTP status
    const createShouldRetry = (retryStatuses) => {
        return (error, attempt) => {
            // First check if the error itself is retryable
            const errorType = classifyError(error);

            // Don't retry authentication or client errors
            if (errorType === 'auth' || errorType === 'client_error') {
                return false;
            }

            // For HTTP status errors, check if status is in retry list
            if (error.message && error.message.includes('status')) {
                const statusMatch = error.message.match(/status (\d+)/);
                if (statusMatch) {
                    const status = parseInt(statusMatch[1], 10);
                    return retryStatuses.includes(status);
                }
            }

            // For other errors, use classification
            const retryableTypes = ['transient', 'rate_limit', 'server_error'];
            return retryableTypes.includes(errorType);
        };
    };

    // Use withRetry from resilient-retry module
    const { result } = await withRetry(
        async () => {
            const response = await fetchWithTimeout(url, options, timeoutMs);

            // Check if response status should trigger retry
            if (retryOnStatus.includes(response.status)) {
                // Create an error that will be caught and retried
                const error = new Error(`HTTP error: status ${response.status}`);
                error.status = response.status;
                error.response = response;
                throw error;
            }

            return response;
        },
        {
            maxRetries,
            config: retryConfig,
            shouldRetry: createShouldRetry(retryOnStatus),
            onRetry: (error, attempt, delay) => {
                console.warn(
                    `[Utils] Retrying after ${delay}ms ` +
                    `(attempt ${attempt}/${maxRetries}, ${error.message})`
                );
            }
        }
    );

    return result;
}

/**
 * Fetch with authentication retry support
 * Automatically retries on 401 errors after calling token refresh callback
 * @param {string} url - URL to fetch
 * @param {object} config - Combined configuration
 * @param {RequestInit} config.options - Fetch options
 * @param {number} config.timeoutMs - Timeout for each fetch attempt
 * @param {Function} config.onAuthError - Callback to refresh token on 401
 * @param {number} config.maxAuthRetries - Maximum auth retry attempts
 * @param {Function} config.getAuthHeader - Callback to get updated auth header after refresh
 * @returns {Promise<Response>}
 */
async function fetchWithAuth(url, config = {}) {
    const {
        options = {},
        timeoutMs = 30000,
        onAuthError = null,     // Callback to refresh token on 401
        maxAuthRetries = 1,
        getAuthHeader = null    // Callback to get updated auth header after refresh
    } = config;
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
 * Delays function execution until after waitMs have elapsed since the last call
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
 * Throttle function calls
 * Ensures function is called at most once per limitMs interval
 * Use for high-frequency events like dragover, resize, scroll
 * @param {Function} func - Function to throttle
 * @param {number} limitMs - Minimum time between calls in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, limitMs) {
    let inThrottle;
    let lastArgs;
    let lastThis;

    return function executedFunction(...args) {
        lastArgs = args;
        lastThis = this;

        if (!inThrottle) {
            func.apply(lastThis, lastArgs);
            inThrottle = true;

            setTimeout(() => {
                inThrottle = false;
                // Optionally call with last args on trailing edge
                // Uncomment below for trailing-edge throttle:
                // if (lastArgs) func.apply(lastThis, lastArgs);
                // lastArgs = null;
                // lastThis = null;
            }, limitMs);
        }
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

// ==========================================
// Storage Circuit Breaker
// ==========================================

/**
 * Circuit breaker for storage fallback operations
 * 
 * Prevents 4 serial timeout attempts (2+ min waits) during onboarding
 * by failing fast after consecutive failures.
 * 
 * Usage:
 *   const breaker = StorageCircuitBreaker.getBreaker('indexeddb');
 *   if (breaker.canAttempt()) {
 *       try {
 *           const result = await indexedDBOperation();
 *           breaker.recordSuccess();
 *           return result;
 *       } catch (e) {
 *           breaker.recordFailure();
 *           // Fall back to next storage option
 *       }
 *   }
 */
const StorageCircuitBreaker = {
    // Breaker instances by name
    _breakers: {},

    // Configuration
    MAX_FAILURES: 2,           // Max consecutive failures before circuit opens
    COOLDOWN_MS: 30000,        // 30 second cooldown before retry
    HALF_OPEN_TIMEOUT_MS: 5000, // Fast timeout when testing after cooldown

    /**
     * Get or create a circuit breaker for a storage type
     * @param {string} name - Storage type name (e.g., 'indexeddb', 'localStorage')
     * @returns {Object} Circuit breaker instance
     */
    getBreaker(name) {
        if (!this._breakers[name]) {
            this._breakers[name] = {
                name,
                state: 'closed',      // closed, open, half-open
                failureCount: 0,
                lastFailureTime: null,
                lastSuccessTime: null
            };
        }
        return this._breakers[name];
    },

    /**
     * Check if an operation can be attempted
     * @param {string} name - Storage type name
     * @returns {boolean} True if operation should be attempted
     */
    canAttempt(name) {
        const breaker = this.getBreaker(name);

        if (breaker.state === 'closed') {
            return true;
        }

        if (breaker.state === 'open') {
            // Check if cooldown has passed
            if (Date.now() - breaker.lastFailureTime >= this.COOLDOWN_MS) {
                breaker.state = 'half-open';
                console.log(`[StorageCircuitBreaker] ${name}: Transitioning to half-open`);
                return true;
            }
            return false;
        }

        // half-open: allow one test attempt
        return true;
    },

    /**
     * Record a successful operation
     * @param {string} name - Storage type name
     */
    recordSuccess(name) {
        const breaker = this.getBreaker(name);
        breaker.failureCount = 0;
        breaker.lastSuccessTime = Date.now();

        if (breaker.state !== 'closed') {
            breaker.state = 'closed';
            console.log(`[StorageCircuitBreaker] ${name}: Circuit closed (success)`);
        }
    },

    /**
     * Record a failed operation
     * @param {string} name - Storage type name
     */
    recordFailure(name) {
        const breaker = this.getBreaker(name);
        breaker.failureCount++;
        breaker.lastFailureTime = Date.now();

        if (breaker.state === 'half-open') {
            // Failed during test - back to open
            breaker.state = 'open';
            console.log(`[StorageCircuitBreaker] ${name}: Back to open (test failed)`);
        } else if (breaker.failureCount >= this.MAX_FAILURES) {
            breaker.state = 'open';
            console.warn(`[StorageCircuitBreaker] ${name}: Circuit opened after ${breaker.failureCount} failures`);
        }
    },

    /**
     * Get timeout for current attempt (shorter in half-open state)
     * @param {string} name - Storage type name
     * @param {number} defaultTimeout - Default timeout in ms
     * @returns {number} Timeout to use
     */
    getTimeout(name, defaultTimeout = 30000) {
        const breaker = this.getBreaker(name);
        return breaker.state === 'half-open' ? this.HALF_OPEN_TIMEOUT_MS : defaultTimeout;
    },

    /**
     * Get status of all breakers
     * @returns {Object} Status object
     */
    getStatus() {
        const status = {};
        for (const [name, breaker] of Object.entries(this._breakers)) {
            status[name] = {
                state: breaker.state,
                failures: breaker.failureCount,
                lastFailure: breaker.lastFailureTime,
                lastSuccess: breaker.lastSuccessTime
            };
        }
        return status;
    },

    /**
     * Reset a specific breaker
     * @param {string} name - Storage type name
     */
    reset(name) {
        if (this._breakers[name]) {
            this._breakers[name].state = 'closed';
            this._breakers[name].failureCount = 0;
            console.log(`[StorageCircuitBreaker] ${name}: Reset`);
        }
    },

    /**
     * Reset all breakers
     */
    resetAll() {
        for (const name of Object.keys(this._breakers)) {
            this.reset(name);
        }
    }
};

/**
 * Safely truncate a string to a maximum length, handling Unicode surrogate pairs correctly.
 * This prevents splitting multi-byte characters like emojis or rare CJK characters.
 * @param {string} str - The string to truncate
 * @param {number} maxLength - Maximum length in characters
 * @param {string} suffix - Optional suffix to add when truncated (default: '...')
 * @returns {string} Truncated string
 */
function safeTruncate(str, maxLength, suffix = '...') {
    if (!str || str.length <= maxLength) return str || '';
    // Use Array.from to properly handle Unicode surrogate pairs
    // This iterates by code points rather than UTF-16 code units
    const chars = Array.from(str);
    if (chars.length <= maxLength) return str;
    const suffixLength = suffix.length;
    const truncateLength = Math.max(0, maxLength - suffixLength);
    return chars.slice(0, truncateLength).join('') + suffix;
}

// ES Module export
export const Utils = {
    fetchWithTimeout,
    fetchWithRetry,
    fetchWithAuth,
    sleep,
    simpleHash,
    debounce,
    throttle,
    formatDuration,
    safeTruncate,
    StorageCircuitBreaker
};


console.log('[Utils] Module loaded with StorageCircuitBreaker');
