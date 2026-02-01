/**
 * Common Utility Functions
 *
 * Shared utility functions to eliminate code duplication across the codebase.
 * Provides consistent implementations for common operations.
 *
 * @module utils/common
 */

/**
 * Format bytes for human readable output
 * @param {number} bytes - Number of bytes
 * @param {number} [decimals=1] - Number of decimal places
 * @returns {string} Formatted string (e.g., "45.2 MB")
 *
 * @example
 * formatBytes(1024); // "1 KB"
 * formatBytes(1234567); // "1.2 MB"
 * formatBytes(0); // "0 Bytes"
 */
export function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';

    // Handle non-finite values
    if (!Number.isFinite(bytes)) return 'Unknown';

    // Handle negative values
    const negative = bytes < 0;
    const absBytes = Math.abs(bytes);

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(absBytes) / Math.log(k));

    // Prevent array index overflow for very large numbers
    const sizeIndex = Math.min(i, sizes.length - 1);

    const formattedValue = parseFloat((absBytes / Math.pow(k, sizeIndex)).toFixed(dm));
    const result = `${formattedValue} ${sizes[sizeIndex]}`;

    return negative ? `-${result}` : result;
}

/**
 * Check if running in a secure context
 * Validates various security requirements for cryptographic operations
 * @returns {Object} Result object with secure status and optional reason
 * @property {boolean} secure - Whether context is secure
 * @property {string} [reason] - Reason if not secure
 *
 * @example
 * const { secure, reason } = checkSecureContext();
 * if (!secure) {
 *   console.warn('Insecure context:', reason);
 * }
 */
export function checkSecureContext() {
    // Check for secure context in browser
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
        return {
            secure: false,
            reason: 'Insecure context: App must be accessed via HTTPS or localhost',
        };
    }

    // Check for crypto.subtle availability
    if (!crypto?.subtle) {
        return {
            secure: false,
            reason: 'crypto.subtle unavailable: Cryptographic operations unavailable',
        };
    }

    // Additional checks for specific environments
    if (typeof window !== 'undefined') {
        // Check if running in a cross-origin iframe
        try {
            // This will throw in cross-origin iframes
            window.top.location.href;
        } catch (e) {
            return {
                secure: false,
                reason: 'Cross-origin iframe: Security features restricted',
            };
        }

        // Check for data: or blob: protocols which are insecure
        if (window.location.protocol === 'data:' || window.location.protocol === 'blob:') {
            return {
                secure: false,
                reason: 'Insecure protocol: data:// or blob:// URLs are not secure',
            };
        }
    }

    return { secure: true };
}

/**
 * Debounce function execution
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to delay
 * @param {boolean} [immediate=false] - Execute immediately on first call
 * @returns {Function} Debounced function
 *
 * @example
 * const debouncedSearch = debounce(searchFunction, 300);
 * input.addEventListener('input', debouncedSearch);
 */
export function debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func(...args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func(...args);
    };
}

/**
 * Throttle function execution
 * @param {Function} func - Function to throttle
 * @param {number} limit - Milliseconds between executions
 * @returns {Function} Throttled function
 *
 * @example
 * const throttledScroll = throttle(scrollHandler, 100);
 * window.addEventListener('scroll', throttledScroll);
 */
export function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

/**
 * Deep clone an object
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 *
 * @example
 * const cloned = deepClone(original);
 * cloned.property = 'new value'; // Doesn't affect original
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags);

    const cloned = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            cloned[key] = deepClone(obj[key]);
        }
    }
    return cloned;
}

/**
 * Check if two values are deeply equal
 * @param {*} a - First value
 * @param {*} b - Second value
 * @returns {boolean} True if values are deeply equal
 *
 * @example
 * const equal = deepEqual(obj1, obj2);
 */
export function deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
        if (Array.isArray(a) !== Array.isArray(b)) return false;

        if (Array.isArray(a)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (!deepEqual(a[i], b[i])) return false;
            }
            return true;
        }

        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;

        for (const key of keysA) {
            if (!keysB.includes(key)) return false;
            if (!deepEqual(a[key], b[key])) return false;
        }
        return true;
    }

    return false;
}

/**
 * Get a nested property value safely
 * @param {Object} obj - Object to get property from
 * @param {string} path - Property path (e.g., 'user.profile.name')
 * @param {*} [defaultValue] - Default value if property doesn't exist
 * @returns {*} Property value or default
 *
 * @example
 * const name = getNestedValue(user, 'profile.name', 'Unknown');
 */
export function getNestedValue(obj, path, defaultValue) {
    if (!obj || typeof obj !== 'object') return defaultValue;

    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
        if (value === null || value === undefined || !(key in value)) {
            return defaultValue;
        }
        value = value[key];
    }

    return value === undefined ? defaultValue : value;
}

/**
 * Set a nested property value safely
 * @param {Object} obj - Object to set property on
 * @param {string} path - Property path (e.g., 'user.profile.name')
 * @param {*} value - Value to set
 * @returns {boolean} True if property was set
 *
 * @example
 * const success = setNestedValue(user, 'profile.name', 'John');
 */
export function setNestedValue(obj, path, value) {
    if (!obj || typeof obj !== 'object') return false;

    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = obj;

    for (const key of keys) {
        if (!(key in current) || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }

    current[lastKey] = value;
    return true;
}

/**
 * Generate a unique ID
 * @param {string} [prefix=''] - Prefix for the ID
 * @returns {string} Unique ID
 *
 * @example
 * const id = generateId('user_'); // "user_abc123"
 */
export function generateId(prefix = '') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `${prefix}${timestamp}_${random}`;
}

/**
 * Wait for a specified duration
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after the duration
 *
 * @example
 * await sleep(1000); // Wait 1 second
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} [options] - Retry options
 * @param {number} [options.maxAttempts=3] - Maximum retry attempts
 * @param {number} [options.initialDelay=100] - Initial delay in ms
 * @param {number} [options.maxDelay=5000] - Maximum delay in ms
 * @param {Function} [options.shouldRetry] - Function to determine if should retry
 * @returns {*} Function result
 *
 * @example
 * const result = await retry(async () => fetchData(), {
 *   maxAttempts: 5,
 *   initialDelay: 200
 * });
 */
export async function retry(fn, options = {}) {
    const {
        maxAttempts = 3,
        initialDelay = 100,
        maxDelay = 5000,
        shouldRetry = () => true,
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt === maxAttempts || !shouldRetry(error)) {
                throw error;
            }

            await sleep(delay);
            delay = Math.min(delay * 2, maxDelay);
        }
    }

    throw lastError;
}

// ==========================================
// Public API
// ==========================================

export const Common = {
    formatBytes,
    checkSecureContext,
    debounce,
    throttle,
    deepClone,
    deepEqual,
    getNestedValue,
    setNestedValue,
    generateId,
    sleep,
    retry,
};

console.log('[Common] Common utility functions loaded');
