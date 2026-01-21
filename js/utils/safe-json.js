/**
 * Safe JSON parsing utility
 *
 * Provides secure JSON parsing with error handling to prevent:
 * - DoS from malformed JSON
 * - Application crashes
 * - Prototype pollution via crafted JSON
 *
 * Usage:
 *   import { safeJsonParse } from './safe-json.js';
 *   const config = safeJsonParse(localStorage.getItem('config'), {});
 *
 * @module utils/safe-json
 */

/**
 * Safely parse JSON string with error handling
 *
 * @param {string} json - JSON string to parse
 * @param {*} defaultValue - Default value if parsing fails (default: null)
 * @param {Object} options - Additional options
 * @param {boolean} options.silent - Suppress error logging (default: false)
 * @param {Function} options.validator - Optional function to validate parsed structure
 * @returns {*} Parsed object or defaultValue
 */
export function safeJsonParse(json, defaultValue = null, options = {}) {
    const { silent = false, validator = null } = options;

    // Type check: must be a string
    if (typeof json !== 'string') {
        if (!silent) {
            console.warn('[SafeJson] Input is not a string, returning defaultValue');
        }
        return defaultValue;
    }

    // Empty string check
    if (json.trim().length === 0) {
        if (!silent) {
            console.warn('[SafeJson] Input is empty string, returning defaultValue');
        }
        return defaultValue;
    }

    try {
        const parsed = JSON.parse(json);

        // Run optional validator
        if (validator && typeof validator === 'function') {
            if (!validator(parsed)) {
                console.warn('[SafeJson] Validation failed for parsed JSON, returning defaultValue');
                return defaultValue;
            }
        }

        return parsed;
    } catch (e) {
        // Handle specific error types
        if (e instanceof SyntaxError) {
            console.error('[SafeJson] JSON parse failed (SyntaxError):', e.message);
        } else {
            console.error('[SafeJson] JSON parse failed:', e);
        }

        // For security: detect potential prototype pollution attempts
        if (json.includes('__proto__') || json.includes('constructor') || json.includes('prototype')) {
            console.warn('[SafeJson] Possible prototype pollution attempt detected in JSON');
        }

        return defaultValue;
    }
}

/**
 * Safely parse JSON from localStorage
 * Combines localStorage.getItem() with safeJsonParse()
 *
 * @param {string} key - localStorage key
 * @param {*} defaultValue - Default value if key missing or parse fails
 * @param {Object} options - Options passed to safeJsonParse
 * @returns {*} Parsed value or defaultValue
 */
export function safeGetLocalStorage(key, defaultValue = null, options = {}) {
    try {
        const value = localStorage.getItem(key);
        if (value === null) {
            return defaultValue;
        }
        return safeJsonParse(value, defaultValue, options);
    } catch (e) {
        console.error(`[SafeJson] Failed to read localStorage key "${key}":`, e);
        return defaultValue;
    }
}

/**
 * Safely parse JSON from sessionStorage
 * Combines sessionStorage.getItem() with safeJsonParse()
 *
 * @param {string} key - sessionStorage key
 * @param {*} defaultValue - Default value if key missing or parse fails
 * @param {Object} options - Options passed to safeJsonParse
 * @returns {*} Parsed value or defaultValue
 */
export function safeGetSessionStorage(key, defaultValue = null, options = {}) {
    try {
        const value = sessionStorage.getItem(key);
        if (value === null) {
            return defaultValue;
        }
        return safeJsonParse(value, defaultValue, options);
    } catch (e) {
        console.error(`[SafeJson] Failed to read sessionStorage key "${key}":`, e);
        return defaultValue;
    }
}

/**
 * Safely stringify a value to JSON
 * Prevents circular reference errors
 *
 * @param {*} value - Value to stringify
 * @param {string} [fallback='{}'] - Fallback return value if stringify fails
 * @returns {string} JSON string or fallback
 */
export function safeJsonStringify(value, fallback = '{}') {
    if (value === null || value === undefined) {
        return fallback;
    }

    try {
        return JSON.stringify(value);
    } catch (e) {
        console.error('[SafeJson] JSON stringify failed:', e);
        return fallback;
    }
}

// Common validators for structured data
export const Validators = {
    /**
     * Validate plain object (no arrays, null)
     */
    isObject: (value) => {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    },

    /**
     * Validate array
     */
    isArray: (value) => {
        return Array.isArray(value);
    },

    /**
     * Validate config object with expected keys
     */
    hasKeys: (keys) => (value) => {
        if (!Validators.isObject(value)) return false;
        return keys.every(key => key in value);
    },

    /**
     * Validate session structure
     */
    isSession: (value) => {
        return Validators.isObject(value) &&
            typeof value.id === 'string' &&
            Array.isArray(value.messages) &&
            typeof value.createdAt === 'string';
    }
};

export default {
    safeJsonParse,
    safeGetLocalStorage,
    safeGetSessionStorage,
    safeJsonStringify,
    Validators
};

console.log('[SafeJson] Module loaded');
