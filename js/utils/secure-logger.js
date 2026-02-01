/**
 * Secure Logging Utility
 *
 * SECURITY FIX (HIGH Issue #5): Prevents sensitive data exposure in console logs
 *
 * This module provides a secure logging function that:
 * - Redacts sensitive data (API keys, tokens, secrets, passwords)
 * - Can be disabled in production
 * - Provides development-only logging for sensitive operations
 *
 * @module utils/secure-logger
 */

// Determine if we're in development mode
const IS_DEV = typeof import.meta !== 'undefined' && import.meta?.env?.MODE === 'dev';
const IS_DEV_LEGACY = typeof window !== 'undefined' && window.location?.hostname === 'localhost';

/**
 * Sensitive key patterns that should be redacted from logs
 */
const SENSITIVE_PATTERNS = [
    'apikey',
    'apitoken',
    'api_key',
    'api_token',
    'token',
    'secret',
    'password',
    'credential',
    'refresh',
    'authorization',
    'bearer',
    'session',
];

/**
 * Patterns that indicate a value might be sensitive
 */
const SENSITIVE_VALUE_PATTERNS = [
    /^sk-/, // Stripe/Service keys
    /^sk-or-/, // OpenRouter keys
    /^Bearer\s+/i, // Bearer tokens
    /^Basic\s+/i, // Basic auth
    /^ssh-\w+/, // SSH keys
    /^\w{20,}$/, // Long alphanumeric (likely tokens)
    /[\w-]{32,}/, // Very long strings (likely secrets)
];

/**
 * Check if a key name indicates sensitive data
 */
function isSensitiveKey(key) {
    if (!key || typeof key !== 'string') return false;
    const lowerKey = key.toLowerCase();
    return SENSITIVE_PATTERNS.some(pattern => lowerKey.includes(pattern));
}

/**
 * Check if a value looks like sensitive data
 */
function looksLikeSensitiveValue(value) {
    if (!value || typeof value !== 'string') return false;

    // Check for sensitive patterns
    for (const pattern of SENSITIVE_VALUE_PATTERNS) {
        if (pattern.test(value)) return true;
    }

    // Very long base64-like strings are likely tokens
    if (value.length > 50 && /^[A-Za-z0-9+/=_-]+$/.test(value)) {
        return true;
    }

    return false;
}

/**
 * Redact a value if it looks sensitive
 */
function redactValue(value, key) {
    // Check if key indicates sensitivity
    if (isSensitiveKey(key)) {
        return '[REDACTED]';
    }

    // Check if value itself looks sensitive
    if (typeof value === 'string' && looksLikeSensitiveValue(value)) {
        // Show only first/last few characters for debugging
        if (value.length <= 10) {
            return '[REDACTED]';
        }
        return `${value.substring(0, 4)}...${value.slice(-4)}`;
    }

    return value;
}

/**
 * Recursively redact sensitive data from an object
 */
function redactObject(obj, depth = 0, maxDepth = 5) {
    // Prevent infinite recursion
    if (depth > maxDepth) return '[MAX_DEPTH]';

    // Handle primitives
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
        return obj.map(item => redactObject(item, depth + 1, maxDepth));
    }

    // Handle objects
    const redacted = {};
    for (const [key, value] of Object.entries(obj)) {
        if (isSensitiveKey(key)) {
            redacted[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
            redacted[key] = redactObject(value, depth + 1, maxDepth);
        } else if (typeof value === 'string') {
            redacted[key] = redactValue(value, key);
        } else {
            redacted[key] = value;
        }
    }
    return redacted;
}

/**
 * Secure logging function - redacts sensitive data
 *
 * Usage:
 *   secureLog('User logged in', { username: 'alice' });
 *   secureLog('API request', { url: '/api/data', token: 'sk-abc123...' });
 *     // Logs: { url: '/api/data', token: 'sk-a...23' }
 *
 * @param {string} message - Log message
 * @param {object} data - Optional data to log (will be redacted)
 * @param {string} level - Log level ('log', 'warn', 'error', 'debug')
 */
function secureLog(message, data = null, level = 'log') {
    // In production, only log errors and warnings
    if (!IS_DEV && !IS_DEV_LEGACY && level === 'debug') {
        return;
    }

    // Redact sensitive data
    let redactedData = data;
    if (data !== null && typeof data === 'object') {
        redactedData = redactObject(data);
    } else if (typeof data === 'string' && looksLikeSensitiveValue(data)) {
        redactedData = redactValue(data, '');
    }

    // Get the console method
    const consoleMethod = console[level] || console.log;

    // Log with redacted data
    if (redactedData !== null) {
        consoleMethod(`[SecureLog] ${message}`, redactedData);
    } else {
        consoleMethod(`[SecureLog] ${message}`);
    }
}

/**
 * Convenience functions for different log levels
 */
const secureLogger = {
    log: (message, data) => secureLog(message, data, 'log'),
    warn: (message, data) => secureLog(message, data, 'warn'),
    error: (message, data) => secureLog(message, data, 'error'),
    debug: (message, data) => {
        // Only debug in development
        if (IS_DEV || IS_DEV_LEGACY) {
            secureLog(message, data, 'debug');
        }
    },

    /**
     * Check if secure logging is enabled
     */
    isEnabled: () => IS_DEV || IS_DEV_LEGACY,

    /**
     * Redact a single value (for external use)
     */
    redact: (value, key = '') => redactValue(value, key),

    /**
     * Redact an object (for external use)
     */
    redactObject: obj => redactObject(obj),
};

// Export the secure logger
export { secureLogger, secureLog, isSensitiveKey, looksLikeSensitiveValue, redactObject };
