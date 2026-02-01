/**
 * Error Sanitization Module
 *
 * Security-focused utilities for redacting sensitive data from error messages
 * Prevents API keys, tokens, passwords, and other credentials from leaking in logs
 *
 * @module utils/error-handling/error-sanitizer
 */

/**
 * Allowlist of safe context fields that won't leak sensitive data
 * Any field NOT in this list will be filtered out from error context
 * @constant {string[]}
 */
export const SAFE_CONTEXT_FIELDS = [
    'provider',
    'operation',
    'model',
    'maxTokens',
    'temperature',
    'timestamp',
    'code',
    'status',
    'attempt',
    'maxRetries',
];

/**
 * Regular expression patterns for detecting and redacting sensitive data
 * These patterns match common credential formats in error messages
 * @constant {Object<string,RegExp>}
 */
export const SENSITIVE_PATTERNS = {
    // API keys (sk-ant-, sk-or-, sk-proj-, etc.)
    // Matches short keys like sk-ant-1 and long keys like sk-ant-api03-1234567890abcdef
    // Minimum 5 chars after sk- prefix to catch edge cases in tests
    // Uses word boundary to prevent bypasses
    apiKey: /\bsk-[a-zA-Z0-9\-_]{5,}/gi,

    // Bearer tokens (short and long variants)
    // Reduced minimum length to catch shorter tokens in tests
    // More strict pattern to avoid false positives
    bearerToken: /Bearer\s+[a-zA-Z0-9_\-.=]{5,}/gi,

    // Passwords in various formats
    // Enhanced to catch more variations while avoiding bypasses
    password: /password["']?\s*[:=]\s*["']?[^\s"']{4,}/gi,

    // API key params in URLs
    // More robust pattern to prevent bypasses
    urlApiKey: /[?&]api[_-]?key["']?\s*[:=]\s*["']?[^\s"']{4,}/gi,

    // Token params
    // Enhanced to prevent bypasses
    urlToken: /[?&]token["']?\s*[:=]\s*["']?[^\s"']{4,}/gi,

    // Auth headers
    // More comprehensive pattern
    authHeader: /auth["']?\s*[:=]\s*["']?[^\s"']{4,}/gi,

    // Secret keys
    // Enhanced to prevent bypasses
    secret: /secret["']?\s*[:=]\s*["']?[^\s"']{4,}/gi,
};

/**
 * Sanitize a string by redacting sensitive data patterns
 * @param {string} message - The message to sanitize
 * @returns {string} Sanitized message with sensitive data redacted
 */
export function sanitizeMessage(message) {
    if (!message || typeof message !== 'string') {
        return message;
    }

    let sanitized = message;

    // Apply all redaction patterns
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.apiKey, '[REDACTED_API_KEY]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.bearerToken, 'Bearer [REDACTED_TOKEN]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.password, 'password=[REDACTED]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.urlApiKey, '?api_key=[REDACTED]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.urlToken, '&token=[REDACTED]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.authHeader, 'auth=[REDACTED]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.secret, 'secret=[REDACTED]');

    return sanitized;
}

/**
 * Sanitize a stack trace by redacting sensitive data patterns
 * Stack traces can contain file paths, URLs with query parameters, and other sensitive data
 * @param {string} stack - The stack trace to sanitize
 * @returns {string} Sanitized stack trace with sensitive data redacted
 */
export function sanitizeStack(stack) {
    if (!stack || typeof stack !== 'string') {
        return stack;
    }

    // Apply the same sanitization patterns to stack traces
    // Stack traces can contain API keys in URLs, file paths with sensitive info, etc.
    return sanitizeMessage(stack);
}

/**
 * Filter context metadata to only include safe fields
 * Also sanitizes string values to prevent sensitive data leakage
 * @param {Object} metadata - The metadata object to filter
 * @returns {Object} Filtered metadata with only safe fields and sanitized values
 */
export function sanitizeContext(metadata) {
    if (!metadata || typeof metadata !== 'object') {
        return {};
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(metadata)) {
        // Only include fields that are in the allowlist
        if (SAFE_CONTEXT_FIELDS.includes(key)) {
            // Sanitize string values to prevent sensitive data leakage
            if (typeof value === 'string') {
                sanitized[key] = sanitizeMessage(value);
            } else {
                sanitized[key] = value;
            }
        }
    }

    return sanitized;
}
