/**
 * Storage Validators Module
 *
 * Storage-specific validation functions for validating application state,
 * storage keys, storage values, and batch operations.
 *
 * Features:
 * - validateState: application state validation
 * - validateStorageKey: storage key validation (safe characters)
 * - validateStorageValue: storage size validation (quota limits)
 * - validateBatch: batch validation for multiple items
 *
 * @module storage-validators
 */

import { validateSchema, _validateObjectProperties } from './schema-validator.js';

// ==========================================
// Type Guards
// ==========================================

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
function isPlainObject(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === null || proto === Object.prototype;
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
                errors: [`Unexpected properties: ${extraProps.join(', ')}`],
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
                error: `Value too large (${sizeKB.toFixed(2)}KB exceeds ${maxSizeKB}KB limit)`,
            };
        }

        return { valid: true };
    } catch (e) {
        return { valid: false, error: 'Value cannot be serialized' };
    }
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
