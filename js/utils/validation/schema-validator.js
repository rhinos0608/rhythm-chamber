/**
 * Schema Validator Module
 *
 * Provides JSON Schema-like validation functionality with support for:
 * - Type validation (string, number, integer, boolean, array, object)
 * - Enum validation with case-insensitive normalization
 * - Range validation (min/max for numbers)
 * - Length validation (minLength/maxLength for strings/arrays)
 * - Pattern validation (regex for strings)
 * - Object property validation with nested schemas
 * - Required field validation
 * - Value normalization (type coercion, case normalization)
 *
 * @module schema-validator
 */

import { _safeRegexTest } from './regex-validator.js';

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
        } else if (typeValidation.normalizedValue !== undefined) {
            // Use normalized value even when validation passes
            normalizedValue = typeValidation.normalizedValue;
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
        } else if (enumValidation.normalizedValue !== undefined) {
            // Use normalized value even when validation passes
            normalizedValue = enumValidation.normalizedValue;
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
 * @param {*} value - Value to validate
 * @param {string} expectedType - Expected type
 * @returns {{ valid: boolean, error?: string, normalizedValue?: * }} Validation result
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
 * @param {*} value - Value to validate
 * @param {Array} enumValues - Array of allowed values
 * @returns {{ valid: boolean, error?: string, normalizedValue?: * }} Validation result
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

        // Only call toLowerCase on string enum values
        const caseMatch = enumValues.find(e => typeof e === 'string' && e.toLowerCase() === normalized.toLowerCase());
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
 * @param {Object} obj - Object to validate
 * @param {Object} properties - Property schemas
 * @param {string[]} [requiredProperties=[]] - Required property names
 * @returns {{ valid: boolean, errors: string[] }} Validation result
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
                const propErrors = result.errors || [`Property ${propName} is invalid`];
                errors.push(...propErrors.map(e => `Property ${propName}: ${e}`));
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

// Export internal functions for testing
export { _validateType, _validateEnum, _validateObjectProperties };
