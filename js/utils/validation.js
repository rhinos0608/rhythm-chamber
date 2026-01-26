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
    _safeRegexTest
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

// ==========================================
// Schema Validation
// ==========================================

/**
 * Validate an object against a schema definition
 * Based on JSON Schema-like validation
 *
 * @param {*} value - Value to validate
 * @param {Object} schema - Schema definition
 * @param {string} [schema.type] - Expected type ('string', 'number', 'integer', 'boolean', 'array', 'object')
 * @param {*} [schema.enum] - Enum of allowed values
 * @param {number} [schema.min] - Minimum value (for numbers)
 * @param {number} [schema.max] - Maximum value (for numbers)
 * @param {number} [schema.minLength] - Minimum length (for strings/arrays)
 * @param {number} [schema.maxLength] - Maximum length (for strings/arrays)
 * @param {string} [schema.pattern] - Regex pattern (for strings)
 * @param {boolean} [schema.required] - Whether value is required (non-null/non-undefined)
 * @param {Object} [schema.properties] - Property schemas (for objects)
 * @param {string[]} [schema.requiredProperties] - Required property names (for objects)
 * @returns {ValidationResult} Validation result with optional normalized value
 *
 * @example
 * // Validate a string
 * const result = validateSchema(input, { type: 'string', minLength: 1, maxLength: 100 });
 *
 * @example
 * // Validate an enum
 * const result = validateSchema(status, {
 *   type: 'string',
 *   enum: ['pending', 'active', 'completed']
 * });
 *
 * @example
 * // Validate an object
 * const result = validateSchema(data, {
 *   type: 'object',
 *   properties: {
 *     name: { type: 'string', required: true },
 *     age: { type: 'integer', min: 0, max: 120 }
 *   },
 *   requiredProperties: ['name']
 * });
 */
export function validateSchema(value, schema) {
    const errors = [];
    let normalizedValue = value;

    // Check required
    if (schema.required && (value === null || value === undefined)) {
        return {
            valid: false,
            error: 'Value is required'
        };
    }

    // Skip validation if value is null/undefined and not required
    if (value === null || value === undefined) {
        return { valid: true, normalizedValue };
    }

    // Type validation
    if (schema.type) {
        const typeValidation = _validateType(value, schema.type);
        if (!typeValidation.valid) {
            errors.push(typeValidation.error);
            // Try to normalize
            if (typeValidation.normalizedValue !== undefined) {
                normalizedValue = typeValidation.normalizedValue;
            } else {
                return { valid: false, errors };
            }
        }
    }

    // Enum validation
    if (schema.enum && Array.isArray(schema.enum)) {
        const enumValidation = _validateEnum(normalizedValue, schema.enum);
        if (!enumValidation.valid) {
            // Try to normalize
            if (enumValidation.normalizedValue !== undefined) {
                normalizedValue = enumValidation.normalizedValue;
            } else {
                errors.push(enumValidation.error);
            }
        }
    }

    // Range validation (numbers)
    if (schema.type === 'number' || schema.type === 'integer') {
        if (schema.min !== undefined && normalizedValue < schema.min) {
            errors.push(`Value must be at least ${schema.min}`);
        }
        if (schema.max !== undefined && normalizedValue > schema.max) {
            errors.push(`Value must be at most ${schema.max}`);
        }
    }

    // Length validation (strings/arrays)
    if (schema.type === 'string' || schema.type === 'array') {
        const length = normalizedValue.length;
        if (schema.minLength !== undefined && length < schema.minLength) {
            errors.push(`Length must be at least ${schema.minLength}`);
        }
        if (schema.maxLength !== undefined && length > schema.maxLength) {
            errors.push(`Length must be at most ${schema.maxLength}`);
        }
    }

    // Pattern validation (strings)
    if (schema.type === 'string' && schema.pattern) {
        try {
            if (!_safeRegexTest(normalizedValue, schema.pattern)) {
                errors.push(`Value does not match required pattern`);
            }
        } catch (error) {
            errors.push(`Pattern validation error: ${error.message}`);
        }
    }

    // Object validation
    if (schema.type === 'object' && schema.properties) {
        const objectValidation = _validateObjectProperties(
            normalizedValue,
            schema.properties,
            schema.requiredProperties
        );
        if (!objectValidation.valid) {
            errors.push(...objectValidation.errors);
        }
    }

    return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        normalizedValue
    };
}

/**
 * Validate type of a value
 * @private
 */
function _validateType(value, expectedType) {
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    // Type matches
    if (actualType === expectedType) {
        return { valid: true };
    }

    // Special case: integer is a subtype of number
    if (expectedType === 'integer' && actualType === 'number' && Number.isInteger(value)) {
        return { valid: true };
    }

    // Try to normalize string to number
    if (expectedType === 'number' || expectedType === 'integer') {
        if (actualType === 'string' && !isNaN(Number(value))) {
            const normalized = Number(value);
            if (expectedType === 'integer' && !Number.isInteger(normalized)) {
                return {
                    valid: false,
                    error: `Expected ${expectedType}, got string that cannot be converted to integer`
                };
            }
            return { valid: true, normalizedValue: normalized };
        }
    }

    return {
        valid: false,
        error: `Expected type ${expectedType}, got ${actualType}`
    };
}

/**
 * Validate enum value
 * @private
 */
function _validateEnum(value, enumValues) {
    // Exact match
    if (enumValues.includes(value)) {
        return { valid: true };
    }

    // Try case-insensitive normalization for strings
    if (typeof value === 'string') {
        const normalized = value.trim();
        const exactMatch = enumValues.find(e => e === normalized);
        if (exactMatch) {
            return { valid: true, normalizedValue: exactMatch };
        }

        const caseMatch = enumValues.find(e => e.toLowerCase() === normalized.toLowerCase());
        if (caseMatch) {
            return { valid: true, normalizedValue: caseMatch };
        }
    }

    return {
        valid: false,
        error: `Value must be one of: ${enumValues.join(', ')}`
    };
}

/**
 * Validate object properties
 * @private
 */
function _validateObjectProperties(obj, properties, requiredProperties = []) {
    const errors = [];

    if (typeof obj !== 'object' || obj === null) {
        return {
            valid: false,
            errors: ['Value must be an object']
        };
    }

    // Check required properties
    for (const prop of requiredProperties) {
        if (!(prop in obj) || obj[prop] === null || obj[prop] === undefined) {
            errors.push(`Missing required property: ${prop}`);
        }
    }

    // Validate each property if schema is provided
    for (const [propName, propSchema] of Object.entries(properties)) {
        if (propName in obj) {
            const propValue = obj[propName];
            const result = validateSchema(propValue, propSchema);
            if (!result.valid) {
                errors.push(...(result.errors || [`Property ${propName} is invalid`]));
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

// ==========================================
// Type Guards
// ==========================================

/**
 * Ensure a value is a number, with fallback
 * @param {*} value - Value to convert to number
 * @param {number} [fallback=0] - Fallback value if conversion fails
 * @returns {number} Number value or fallback
 *
 * @example
 * const count = ensureNumber(streams.length, 0);
 * const price = ensureNumber(userInput, 0);
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
