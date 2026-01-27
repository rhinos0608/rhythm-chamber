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

import {
    validateURL,
    validateEmail,
    escapeHTMLEntities,
    sanitizeHTML
} from './validation/format-validators.js';

import {
    validateState,
    validateStorageKey,
    validateStorageValue,
    validateBatch
} from './validation/storage-validators.js';

import {
    isObject,
    isPlainObject,
    isArray,
    isNonEmptyString,
    isFunction,
    isPromise,
    ensureNumber
} from './validation/type-guards.js';

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
    _validateObjectProperties,
    validateURL,
    validateEmail,
    escapeHTMLEntities,
    sanitizeHTML,
    validateState,
    validateStorageKey,
    validateStorageValue,
    validateBatch,
    isObject,
    isPlainObject,
    isArray,
    isNonEmptyString,
    isFunction,
    isPromise,
    ensureNumber
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

    // Format validation (imported from format-validators)
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
