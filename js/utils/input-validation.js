/**
 * Input Validation Utilities
 *
 * Centralized validation for all user inputs following HNW principles:
 * - Hierarchy: Validation at entry point, not scattered through code
 * - Network: Clear error messages propagate up to user
 * - Wave: Fail fast before expensive operations
 *
 * @module utils/input-validation
 */

'use strict';

// ==========================================
// Validation Result Type
// ==========================================

/**
 * Create a validation result
 * @param {boolean} valid - Whether validation passed
 * @param {*} [value] - Normalized/sanitized value
 * @param {string} [error] - Error message if invalid
 * @returns {{valid: boolean, value?: *, error?: string}}
 */
function result(valid, value = undefined, error = undefined) {
    return { valid, value, error };
}

// ==========================================
// API Key Validation
// ==========================================

/**
 * API key format patterns by provider
 * Patterns are lenient to avoid false positives while catching obvious errors
 */
const API_KEY_PATTERNS = {
    openrouter: {
        pattern: /^sk-or-v1-[a-zA-Z0-9]{32,}$/,
        minLength: 40,
        description: 'OpenRouter API key (sk-or-v1-...)',
    },
    gemini: {
        pattern: /^AIza[a-zA-Z0-9_-]{33,}$/,
        minLength: 35,
        description: 'Google AI Studio API key (AIza...)',
    },
    claude: {
        pattern: /^sk-ant-[a-zA-Z0-9_-]{40,}$/,
        minLength: 45,
        description: 'Anthropic API key (sk-ant-...)',
    },
    openai: {
        pattern: /^sk-[a-zA-Z0-9]{48,}$/,
        minLength: 51,
        description: 'OpenAI API key (sk-...)',
    },
    spotify: {
        pattern: /^[a-zA-Z0-9]{32,}$/,
        minLength: 32,
        description: 'Spotify Client ID',
    },
};

/**
 * Validate API key format by provider
 * @param {string} provider - Provider name (openrouter, gemini, etc.)
 * @param {string} key - API key to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateApiKey(provider, key) {
    // Handle empty/placeholder keys
    if (!key || typeof key !== 'string') {
        return result(false, null, 'API key is required');
    }

    const trimmed = key.trim();

    // Check for placeholder values
    const placeholders = ['your-api-key-here', 'your-spotify-client-id', 'enter-api-key'];
    if (placeholders.some(p => trimmed.toLowerCase() === p)) {
        return result(false, null, 'Please enter a valid API key (not a placeholder)');
    }

    // Get validation rules for provider
    const rules = API_KEY_PATTERNS[provider.toLowerCase()];
    if (!rules) {
        // Unknown provider - do basic validation only
        if (trimmed.length < 20) {
            return result(false, null, 'API key seems too short');
        }
        return result(true, trimmed);
    }

    // Check minimum length
    if (trimmed.length < rules.minLength) {
        return result(
            false,
            null,
            `${rules.description} must be at least ${rules.minLength} characters`
        );
    }

    // Check format pattern
    if (!rules.pattern.test(trimmed)) {
        return result(false, null, `Invalid ${rules.description} format`);
    }

    return result(true, trimmed);
}

// ==========================================
// URL Validation
// ==========================================

/**
 * Validate URL format and scheme
 * @param {string} urlString - URL string to validate
 * @param {string[]} [allowedSchemes=['http','https']] - Allowed URL schemes
 * @returns {{valid: boolean, value?: string, error?: string}}
 */
function validateUrl(urlString, allowedSchemes = ['http', 'https']) {
    if (!urlString || typeof urlString !== 'string') {
        return result(false, null, 'URL is required');
    }

    const trimmed = urlString.trim();

    try {
        const url = new URL(trimmed);
        const scheme = url.protocol.replace(':', '');

        if (!allowedSchemes.includes(scheme)) {
            return result(false, null, `URL must use ${allowedSchemes.join(' or ')} scheme`);
        }

        // For localhost, allow http without warning
        const isLocalhost =
            url.hostname === 'localhost' ||
            url.hostname === '127.0.0.1' ||
            url.hostname === '[::1]';

        if (scheme === 'http' && !isLocalhost) {
            console.warn('[InputValidation] Using HTTP instead of HTTPS is insecure');
        }

        return result(true, url.toString());
    } catch (e) {
        return result(false, null, 'Invalid URL format');
    }
}

// ==========================================
// Numeric Range Validation
// ==========================================

/**
 * Validate numeric value within range
 * @param {*} value - Value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {number} [defaultValue] - Default value if invalid
 * @returns {{valid: boolean, value?: number, error?: string}}
 */
function validateNumber(value, min, max, defaultValue = min) {
    if (value === undefined || value === null) {
        return result(true, defaultValue, undefined);
    }

    const num = Number(value);

    if (isNaN(num)) {
        return result(false, defaultValue, 'Value must be a number');
    }

    if (num < min || num > max) {
        return result(
            false,
            Math.min(Math.max(num, min), max),
            `Value must be between ${min} and ${max}`
        );
    }

    return result(true, num);
}

// ==========================================
// String Length Validation
// ==========================================

/**
 * Validate string length and sanitize
 * @param {*} value - Value to validate
 * @param {number} min - Minimum length
 * @param {number} max - Maximum length
 * @returns {{valid: boolean, value?: string, error?: string}}
 */
function validateStringLength(value, min = 0, max = 1000) {
    if (value === undefined || value === null) {
        return result(true, '', undefined);
    }

    const str = String(value).trim();

    if (str.length < min) {
        return result(false, str, `Value must be at least ${min} characters`);
    }

    if (str.length > max) {
        return result(
            false,
            str.slice(0, max),
            `Value exceeds maximum length of ${max} characters (truncated)`
        );
    }

    return result(true, str);
}

// ==========================================
// File Upload Validation
// ==========================================

/**
 * File type validation rules
 */
const FILE_TYPE_RULES = {
    json: {
        extensions: ['.json'],
        mimeTypes: ['application/json'],
        magicBytes: [
            { offset: 0, bytes: [0x7b] },
            { offset: 0, bytes: [0x5b] },
        ], // { or [
        maxSize: 500 * 1024 * 1024, // 500MB - matches FileUploadController limit
    },
    zip: {
        extensions: ['.zip'],
        mimeTypes: ['application/zip', 'application/x-zip-compressed'],
        magicBytes: [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }], // PK..
        maxSize: 100 * 1024 * 1024, // 100MB
    },
};

/**
 * Validate file upload
 * @param {File} file - File object from file input
 * @param {string} expectedType - Expected file type ('json' or 'zip')
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
async function validateFileUpload(file, expectedType) {
    if (!file) {
        return { valid: false, error: 'No file selected' };
    }

    const rules = FILE_TYPE_RULES[expectedType];
    if (!rules) {
        return { valid: false, error: `Unknown file type: ${expectedType}` };
    }

    // Check file extension
    const hasValidExtension = rules.extensions.some(ext => file.name.toLowerCase().endsWith(ext));
    if (!hasValidExtension) {
        return {
            valid: false,
            error: `File must have ${rules.extensions.join(' or ')} extension`,
        };
    }

    // Check file size
    if (file.size > rules.maxSize) {
        const maxSizeMB = (rules.maxSize / 1024 / 1024).toFixed(0);
        return {
            valid: false,
            error: `File too large (maximum ${maxSizeMB}MB)`,
        };
    }

    // Check magic bytes (file signature)
    try {
        const slice = file.slice(0, 8);
        const buffer = await slice.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        const hasValidMagicBytes = rules.magicBytes.some(rule => {
            for (let i = 0; i < rule.bytes.length; i++) {
                if (bytes[rule.offset + i] !== rule.bytes[i]) {
                    return false;
                }
            }
            return true;
        });

        if (!hasValidMagicBytes) {
            return {
                valid: false,
                error: `File content does not match ${expectedType.toUpperCase()} format`,
            };
        }
    } catch (e) {
        console.warn('[InputValidation] Could not read file for magic byte check:', e);
        // Continue anyway - this is a client-side check that might fail
    }

    return { valid: true };
}

// ==========================================
// URL Parameter Validation
// ==========================================

/**
 * Validate URL parameter using whitelist
 * @param {string} param - Parameter name
 * @param {*} value - Parameter value
 * @param {string[]} [allowedValues] - Allowed values (whitelist)
 * @returns {{valid: boolean, value?: string, error?: string}}
 */
function validateUrlParam(param, value, allowedValues = null) {
    if (value === null || value === undefined) {
        return result(true, '', undefined);
    }

    const str = String(value);

    // Check whitelist if provided
    if (allowedValues && !allowedValues.includes(str)) {
        return result(false, null, `Invalid ${param} value. Allowed: ${allowedValues.join(', ')}`);
    }

    // Sanitize to prevent XSS if ever rendered
    // Remove potentially dangerous characters
    const sanitized = str.replace(/[<>"']/g, '');

    if (sanitized !== str) {
        console.warn(`[InputValidation] Sanitized dangerous characters from ${param}`);
    }

    return result(true, sanitized);
}

// ==========================================
// Model ID Validation
// ==========================================

/**
 * Validate model ID format
 * @param {string} modelId - Model ID to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateModelId(modelId) {
    if (!modelId || typeof modelId !== 'string') {
        return result(false, null, 'Model ID is required');
    }

    const trimmed = modelId.trim();

    // Basic format: provider/model-name:tag
    // Examples: anthropic/claude-3.5-sonnet, xiaomi/mimo-v2-flash:free
    const validPatterns = [
        /^[a-z]+\/[a-z0-9_-]+(:[a-z0-9_-]+)?$/, // standard format
        /^[a-z0-9_-]+$/, // simple format
    ];

    const isValid = validPatterns.some(p => p.test(trimmed));

    if (!isValid) {
        return result(false, null, 'Invalid model ID format (e.g., "provider/model-name:tag")');
    }

    return result(true, trimmed);
}

// ==========================================
// Public API
// ==========================================

export const InputValidation = {
    // API key validation
    validateApiKey,

    // URL validation
    validateUrl,

    // Numeric validation
    validateNumber,

    // String validation
    validateStringLength,

    // File upload validation
    validateFileUpload,

    // URL parameter validation
    validateUrlParam,

    // Model ID validation
    validateModelId,

    // Export patterns for testing
    _patterns: {
        API_KEY_PATTERNS,
        FILE_TYPE_RULES,
    },
};

export default InputValidation;

console.log('[InputValidation] Validation utilities loaded');
