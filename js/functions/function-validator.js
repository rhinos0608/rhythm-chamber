/**
 * Function Validator Module
 *
 * Centralizes schema validation and argument normalization for function calls.
 * Performs defensive validation to catch schema drift and invalid LLM outputs.
 *
 * Responsibilities:
 * - Validate function arguments against schema
 * - Required parameter checking
 * - Type validation with coercion (string → number)
 * - Enum validation with case-insensitive matching
 * - Argument normalization
 *
 * @module FunctionValidator
 */

import { SchemaRegistry } from './schema-registry.js';
import { DataQuery } from '../data-query.js';

// Import validation utilities if available
let FunctionValidation;
try {
    const module = await import('./utils/validation.js');
    FunctionValidation = module.FunctionValidation;
} catch (e) {
    // Handle different error types gracefully
    if (e instanceof SyntaxError) {
        console.warn('[FunctionValidator] Validation utils module has syntax errors, using basic validation');
    } else if (e instanceof TypeError && e.message.includes('Failed to fetch')) {
        console.warn('[FunctionValidator] Validation utils module not found, using basic validation');
    } else {
        console.warn('[FunctionValidator] Validation utils not available:', e.message, '- using basic validation');
    }
    // FunctionValidation remains undefined, falling back to basic validation
}

// ==========================================
// Public API
// ==========================================

/**
 * Function Validator
 * Provides schema validation and argument normalization
 */
export const FunctionValidator = {
    /**
     * Validate function arguments against schema definition
     * HNW Defensive: Catches schema drift and invalid LLM outputs
     *
     * Performs comprehensive validation including:
     * - Required parameter checking
     * - Type validation with automatic coercion
     * - Enum validation with case-insensitive matching
     * - Argument normalization
     *
     * @param {string} functionName - Name of function
     * @param {Object} args - Arguments to validate
     * @returns {{ valid: boolean, errors: string[], normalizedArgs: Object }}
     */
    validateFunctionArgs(functionName, args) {
        const errors = [];

        // Defensive check: Handle null or undefined args BEFORE attempting to spread
        if (args == null || typeof args !== 'object') {
            // If args is null, undefined, or not an object, reject as invalid
            // This prevents TypeError when accessing args properties
            console.warn(`[FunctionValidator] Invalid args type for ${functionName}: ${args === null ? 'null' : typeof args}`);
            return {
                valid: false,
                errors: [`Invalid arguments: expected object, got ${args === null ? 'null' : typeof args}`],
                normalizedArgs: {}
            };
        }

        const normalizedArgs = { ...args }; // Copy for normalization

        // Get schema for this function
        const schema = SchemaRegistry.getFunctionSchema(functionName);
        if (!schema) {
            // No schema = no validation (fail-open for backwards compatibility)
            return { valid: true, errors: [], normalizedArgs: args };
        }

        const properties = schema.function?.parameters?.properties || {};
        const required = schema.function?.parameters?.required || [];

        // Check required parameters
        for (const param of required) {
            if (args?.[param] === undefined || args?.[param] === null) {
                errors.push(`Missing required parameter: ${param}`);
            }
        }

        // Validate parameter types and normalize values
        if (args && typeof args === 'object') {
            for (const [key, value] of Object.entries(args)) {
                const paramSchema = properties[key];

                // Unknown parameter (not in schema) - log but don't fail
                if (!paramSchema) {
                    console.warn(`[FunctionValidator] Unknown parameter '${key}' for ${functionName}`);
                    continue;
                }

                // Type validation with normalization
                const expectedType = paramSchema.type;
                const actualType = Array.isArray(value) ? 'array' : typeof value;

                if (expectedType && actualType !== expectedType) {
                    // Allow string to number coercion for LLM outputs
                    if (expectedType === 'integer' && typeof value === 'number') {
                        continue; // integers are numbers in JS
                    }
                    if (expectedType === 'number' && typeof value === 'string' && !isNaN(Number(value))) {
                        normalizedArgs[key] = Number(value); // Normalize string numbers
                        continue;
                    }

                    errors.push(`Parameter '${key}' expected ${expectedType}, got ${actualType}`);
                }

                // Enum validation with normalization
                if (paramSchema.enum && !paramSchema.enum.includes(value)) {
                    // Try to normalize: case-insensitive match for strings
                    if (typeof value === 'string') {
                        const normalized = value.trim();
                        const exactMatch = paramSchema.enum.find(e => e === normalized);
                        const caseMatch = paramSchema.enum.find(e => e.toLowerCase() === normalized.toLowerCase());

                        if (exactMatch) {
                            normalizedArgs[key] = exactMatch;
                        } else if (caseMatch) {
                            console.warn(`[FunctionValidator] Normalized '${key}' from "${value}" to "${caseMatch}"`);
                            normalizedArgs[key] = caseMatch;
                        } else {
                            errors.push(`Parameter '${key}' must be one of: ${paramSchema.enum.join(', ')}`);
                        }
                    } else {
                        errors.push(`Parameter '${key}' must be one of: ${paramSchema.enum.join(', ')}`);
                    }
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            normalizedArgs: Object.keys(normalizedArgs).length > 0 ? normalizedArgs : args
        };
    },

    /**
     * Validate streams array for data functions
     * @param {Array} streams - User's streaming data
     * @returns {{ valid: boolean, error: string }}
     */
    validateStreams(streams) {
        // Use validation utils if available
        if (FunctionValidation?.validateStreams) {
            return FunctionValidation.validateStreams(streams);
        }

        // Basic validation
        const valid = Array.isArray(streams) && streams.length > 0;
        return {
            valid,
            error: valid ? '' : "No streaming data available."
        };
    },

    /**
     * Validate DataQuery module is available
     * @returns {{ valid: boolean, error: string }}
     */
    validateDataQuery() {
        // Use validation utils if available
        if (FunctionValidation?.validateDataQuery) {
            return FunctionValidation.validateDataQuery();
        }

        // Basic validation
        const valid = !!DataQuery;
        return {
            valid,
            error: valid ? '' : "DataQuery module not loaded."
        };
    }
};

console.log('[FunctionValidator] Module loaded');
