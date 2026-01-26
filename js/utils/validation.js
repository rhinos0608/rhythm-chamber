/**
 * Centralized Validation Utilities
 *
 * Provides reusable validation functions to address the "Validation Everywhere" anti-pattern.
 * Centralizes validation logic that was previously scattered across orchestrators.
 *
 * Features:
 * - Common validation functions (type, length, format)
 * - Reusable validation schemas
 * - Validation error formatters
 * - Type guards for common patterns
 *
 * @module utils/validation
 */

import {
    validateMessage,
    trackProcessedMessage,
    removeProcessedMessage,
    clearProcessedMessages,
    MESSAGE_CONFIG
} from './validation/message-validator.js';

import {
    _detectNestedQuantifiers,
    _validateRegexPattern,
    _createSafeRegex,
    _safeRegexTest
} from './validation/regex-validator.js';

import {
    validateSchema,
    _validateType,
    _validateEnum,
    _validateObjectProperties
} from './validation/schema-validator.js';

// Re-export for backward compatibility
export {
    validateMessage,
    trackProcessedMessage,
    removeProcessedMessage,
    clearProcessedMessages,
    MESSAGE_CONFIG,
    _detectNestedQuantifiers,
    _validateRegexPattern,
    _createSafeRegex,
    _safeRegexTest,
    validateSchema,
    _validateType,
    _validateEnum,
    _validateObjectProperties
};

// ==========================================
// Validation Result Types
// ==========================================

/**
 * Standard validation result structure
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string[]} [errors] - Array of error messages
 * @property {*} [normalizedValue] - Normalized/corrected value
 * @property {string} [error] - Single error message (alternative to errors array)
 */

export function ensureNumber(value, fallback = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
}

/**
 * Check if a value is a non-null object
 * @param {*} value - Value to check
 * @returns {boolean} True if value is a non-null object
 *
 * @example
 * if (isObject(data)) {
 *   console.log(data.property);
 * }
 */
export function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if a value is a plain object (not null, not array, not a special object)
 * @param {*} value - Value to check
 * @returns {boolean} True if value is a plain object
 *
 * @example
 * if (isPlainObject(config)) {
 *   // Safe to mutate
 *   config.newProperty = 'value';
 * }
 */
export function isPlainObject(value) {
    if (!isObject(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === null || proto === Object.prototype;
}

/**
 * Check if a value is an array
 * @param {*} value - Value to check
 * @returns {boolean} True if value is an array
 *
 * @example
 * if (isArray(items)) {
 *   items.forEach(item => console.log(item));
 * }
 */
export function isArray(value) {
    return Array.isArray(value);
}

/**
 * Check if a value is a non-empty string
 * @param {*} value - Value to check
 * @returns {boolean} True if value is a non-empty string
 *
 * @example
 * if (isNonEmptyString(input)) {
 *   processInput(input);
 * }
 */
export function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check if a value is a function
 * @param {*} value - Value to check
 * @returns {boolean} True if value is a function
 *
 * @example
 * if (isFunction(callback)) {
 *   callback();
 * }
 */
export function isFunction(value) {
    return typeof value === 'function';
}

/**
 * Check if a value is a promise
 * @param {*} value - Value to check
 * @returns {boolean} True if value is a promise
 *
 * @example
 * if (isPromise(result)) {
 *   await result;
 * }
 */
export function isPromise(value) {
    return isObject(value) && isFunction(value.then);
}

// ==========================================
// Input Validation
// ==========================================

/**
 * Escape HTML entities in a string for safe display
 *
 * ⚠️ **SECURITY WARNING**: This function ONLY escapes HTML entities (<, >, &, ", ').
 * It is NOT sufficient for complete XSS protection when used with untrusted input.
 *
 * **What it does:**
 * - Escapes: < → &lt;, > → &gt;, & → &amp;, " → &quot;, ' → &#39;
 *
 * **What it does NOT protect against:**
 * - XSS in attributes (href, src, onclick, etc.)
 * - XSS in CSS (style attributes)
 * - XSS in JavaScript (javascript: protocol)
 * - XSS from already-sanitized content (double-encoding issues)
 *
 * **For complete XSS protection with untrusted input:**
 * - Use a proper HTML sanitization library like DOMPurify
 * - Use textContent instead of innerHTML when possible
 * - Never insert untrusted content into attribute values
 *
 * @param {string} str - String to escape
 * @returns {string} String with HTML entities escaped
 *
 * @example
 * // SAFE: Escaping for text content display
 * const safe = escapeHTMLEntities(userInput);
 * element.textContent = userInput; // Better approach
 * element.innerHTML = safe; // Also safe, but textContent is preferred
 *
 * @example
 * // UNSAFE: Do not use for attributes without proper sanitization
 * const unsafe = escapeHTMLEntities(userInput); // Only escapes entities!
 * a.href = unsafe; // XSS vulnerability if input contains "javascript:alert(1)"
 *
 * @example
 * // For untrusted HTML, use a proper sanitization library
 * import DOMPurify from 'dompurify';
 * const safeHTML = DOMPurify.sanitize(untrustedHTML);
 * element.innerHTML = safeHTML; // Safe with proper library
 */
export function escapeHTMLEntities(str) {
    if (typeof str !== 'string') return '';

    // Escape in the correct order to avoid double-escaping
    return str
        .replace(/&/g, '&amp;')   // Must be first to avoid double-escaping
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * @deprecated Use escapeHTMLEntities() instead for clarity
 * This function name is misleading - it only escapes HTML entities,
 * it does NOT provide complete XSS protection.
 */
export const sanitizeHTML = escapeHTMLEntities;

/**
 * Validate and normalize a URL
 *
 * @param {*} url - URL to validate
 * @param {Object} [options] - Validation options
 * @param {string[]} [options.allowedProtocols=['http:', 'https:']] - Allowed URL protocols
 * @returns {ValidationResult} Validation result with normalized URL
 *
 * @example
 * const result = validateURL(userInput);
 * if (result.valid) {
 *   window.location.href = result.normalizedValue;
 * }
 */
export function validateURL(url, options = {}) {
    const { allowedProtocols = ['http:', 'https:'] } = options;

    if (typeof url !== 'string') {
        return { valid: false, error: 'URL must be a string' };
    }

    try {
        const normalized = new URL(url);

        if (!allowedProtocols.includes(normalized.protocol)) {
            return {
                valid: false,
                error: `URL protocol must be one of: ${allowedProtocols.join(', ')}`
            };
        }

        return { valid: true, normalizedValue: normalized.href };
    } catch (e) {
        return { valid: false, error: 'Invalid URL format' };
    }
}

/**
 * Validate an email address format
 *
 * @param {*} email - Email to validate
 * @returns {ValidationResult} Validation result
 *
 * @example
 * const result = validateEmail(userEmail);
 * if (!result.valid) {
 *   showError('Please enter a valid email address');
 * }
 */
export function validateEmail(email) {
    if (typeof email !== 'string') {
        return { valid: false, error: 'Email must be a string' };
    }

    // Basic email validation (not RFC-compliant but practical)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, error: 'Invalid email format' };
    }

    return { valid: true, normalizedValue: email.toLowerCase().trim() };
}

// ==========================================
// State Validation
// ==========================================

/**
 * Validate a state object
 * Checks for required properties and valid property types
 *
 * @param {*} state - State object to validate
 * @param {Object} schema - State schema definition
 * @param {Object} schema.properties - Property schemas
 * @param {string[]} [schema.requiredProperties] - Required property names
 * @param {boolean} [schema.allowExtraProperties=true] - Whether to allow properties not in schema
 * @returns {ValidationResult} Validation result
 *
 * @example
 * const schema = {
 *   properties: {
 *     status: { type: 'string', enum: ['idle', 'busy', 'error'] },
 *     progress: { type: 'number', min: 0, max: 100 }
 *   },
 *   requiredProperties: ['status']
 * };
 * const result = validateState(appState, schema);
 */
export function validateState(state, schema) {
    const { properties, requiredProperties = [], allowExtraProperties = true } = schema;

    if (!isPlainObject(state)) {
        return { valid: false, error: 'State must be a plain object' };
    }

    const objectValidation = _validateObjectProperties(state, properties, requiredProperties);
    if (!objectValidation.valid) {
        return objectValidation;
    }

    // Check for extra properties
    if (!allowExtraProperties) {
        const allowedProps = new Set(Object.keys(properties));
        const extraProps = Object.keys(state).filter(key => !allowedProps.has(key));
        if (extraProps.length > 0) {
            return {
                valid: false,
                errors: [`Unexpected properties: ${extraProps.join(', ')}`]
            };
        }
    }

    return { valid: true };
}

// ==========================================
// Storage Validation
// ==========================================

/**
 * Validate a storage key
 * Ensures key is a non-empty string with safe characters
 *
 * @param {*} key - Storage key to validate
 * @returns {ValidationResult} Validation result
 *
 * @example
 * const result = validateStorageKey(userKey);
 * if (result.valid) {
 *   localStorage.setItem(result.normalizedValue, data);
 * }
 */
export function validateStorageKey(key) {
    if (typeof key !== 'string') {
        return { valid: false, error: 'Storage key must be a string' };
    }

    if (key.length === 0) {
        return { valid: false, error: 'Storage key cannot be empty' };
    }

    // Check for safe characters (alphanumeric, underscore, dash, dot)
    const safeKeyRegex = /^[a-zA-Z0-9_.-]+$/;
    if (!safeKeyRegex.test(key)) {
        return { valid: false, error: 'Storage key contains invalid characters' };
    }

    return { valid: true, normalizedValue: key };
}

/**
 * Validate storage value size
 * Checks if value fits within storage quota limits
 *
 * @param {*} value - Value to check
 * @param {number} [maxSizeKB=5000] - Maximum size in kilobytes (default: 5MB)
 * @returns {ValidationResult} Validation result
 *
 * @example
 * const result = validateStorageValue(data);
 * if (!result.valid) {
 *   showError('Data too large for storage');
 * }
 */
export function validateStorageValue(value, maxSizeKB = 5000) {
    try {
        const serialized = JSON.stringify(value);
        const sizeKB = new Blob([serialized]).size / 1024;

        if (sizeKB > maxSizeKB) {
            return {
                valid: false,
                error: `Value too large (${sizeKB.toFixed(2)}KB exceeds ${maxSizeKB}KB limit)`
            };
        }

        return { valid: true };
    } catch (e) {
        return { valid: false, error: 'Value cannot be serialized' };
    }
}

// ==========================================
// Error Formatting
// ==========================================

/**
 * Format validation errors for display
 * Converts validation result to user-friendly message
 *
 * @param {ValidationResult} result - Validation result
 * @param {Object} [options] - Formatting options
 * @param {string} [options.prefix='Validation error'] - Message prefix
 * @param {string} [options.separator=', '] - Error separator
 * @returns {string} Formatted error message
 *
 * @example
 * const result = validateSchema(data, schema);
 * if (!result.valid) {
 *   showError(formatValidationError(result));
 * }
 */
export function formatValidationError(result, options = {}) {
    const { prefix = 'Validation error', separator = ', ' } = options;

    if (result.valid) {
        return '';
    }

    const errors = result.error ? [result.error] : (result.errors || []);
    return `${prefix}: ${errors.join(separator)}`;
}

/**
 * Create a validation error object
 * Useful for throwing typed validation errors
 *
 * @param {string} message - Error message
 * @param {*} [value] - The invalid value
 * @returns {Error} Validation error with metadata
 *
 * @example
 * if (!isValid(input)) {
 *   throw createValidationError('Invalid input format', input);
 * }
 */
export function createValidationError(message, value) {
    const error = new Error(message);
    error.name = 'ValidationError';
    error.value = value;
    error.isValidationError = true;
    return error;
}

/**
 * Check if an error is a validation error
 *
 * @param {*} error - Error to check
 * @returns {boolean} True if error is a validation error
 *
 * @example
 * try {
 *   validate(data);
 * } catch (e) {
 *   if (isValidationError(e)) {
 *     showUserError(e.message);
 *   } else {
 *     reportError(e);
 *   }
 * }
 */
export function isValidationError(error) {
    return error instanceof Error && error.isValidationError === true;
}

// ==========================================
// Batch Validation
// ==========================================

/**
 * Validate multiple values against their schemas
 *
 * @param {Object} items - Object mapping names to values
 * @param {Object} schemas - Object mapping names to schemas
 * @returns {{ valid: boolean, results: Object, errors: Object }} Validation results
 *
 * @example
 * const items = { name: 'John', age: '30', email: 'john@example.com' };
 * const schemas = {
 *   name: { type: 'string', minLength: 1 },
 *   age: { type: 'integer', min: 0 },
 *   email: { type: 'string' }
 * };
 * const { valid, results, errors } = validateBatch(items, schemas);
 */
export function validateBatch(items, schemas) {
    const results = {};
    const errors = {};
    let valid = true;

    for (const [name, value] of Object.entries(items)) {
        const schema = schemas[name];
        if (schema) {
            const result = validateSchema(value, schema);
            results[name] = result;
            if (!result.valid) {
                errors[name] = result;
                valid = false;
            }
        }
    }

    return { valid, results, errors };
}

// ==========================================
// Public API
// ==========================================

export const Validation = {
    // Message validation
    validateMessage,
    trackProcessedMessage,
    clearProcessedMessages,
    removeProcessedMessage,

    // Schema validation
    validateSchema,

    // Type guards
    ensureNumber,
    isObject,
    isPlainObject,
    isArray,
    isNonEmptyString,
    isFunction,
    isPromise,

    // Input validation
    escapeHTMLEntities,
    sanitizeHTML, // @deprecated alias for backward compatibility
    validateURL,
    validateEmail,

    // State validation
    validateState,

    // Storage validation
    validateStorageKey,
    validateStorageValue,

    // Error formatting
    formatValidationError,
    createValidationError,
    isValidationError,

    // Batch validation
    validateBatch,

    // Configuration
    MESSAGE_CONFIG
};

console.log('[Validation] Centralized validation utilities loaded');
