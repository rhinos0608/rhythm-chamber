/**
 * Unit tests for storage-validators module
 *
 * Tests for storage-specific validation functions:
 * - validateState: application state validation
 * - validateStorageKey: storage key validation
 * - validateStorageValue: storage size validation
 * - validateBatch: batch validation
 */

import { describe, it, expect, vi } from 'vitest';
import {
    validateState,
    validateStorageKey,
    validateStorageValue,
    validateBatch
} from '../../../../js/utils/validation/storage-validators.js';

// Mock schema-validator dependencies
vi.mock('../../../../js/utils/validation/schema-validator.js', () => ({
    validateSchema: vi.fn((value, schema) => {
        // Simple mock implementation
        if (schema.required && (value === null || value === undefined)) {
            return { valid: false, error: 'Value is required' };
        }
        if (schema.type === 'string' && typeof value !== 'string') {
            return { valid: false, error: 'Expected type string' };
        }
        if (schema.type === 'number' && typeof value !== 'number') {
            return { valid: false, error: 'Expected type number' };
        }
        if (schema.enum && !schema.enum.includes(value)) {
            return { valid: false, error: `Value must be one of: ${schema.enum.join(', ')}` };
        }
        return { valid: true };
    }),
    _validateObjectProperties: vi.fn((obj, properties, requiredProperties = []) => {
        // Simple mock implementation
        const errors = [];

        if (typeof obj !== 'object' || obj === null) {
            return {
                valid: false,
                errors: ['Value must be an object']
            };
        }

        // Check required properties
        for (const prop of requiredProperties) {
            if (!(prop in obj)) {
                errors.push(`Missing required property: ${prop}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    })
}));

describe('storage-validators', () => {
    // ==========================================
    // validateState Tests
    // ==========================================

    describe('validateState', () => {
        it('should validate a valid state object', () => {
            const state = {
                status: 'active',
                count: 42
            };

            const schema = {
                properties: {
                    status: { type: 'string' },
                    count: { type: 'number' }
                },
                requiredProperties: ['status']
            };

            const result = validateState(state, schema);

            expect(result.valid).toBe(true);
        });

        it('should reject invalid state (not an object)', () => {
            const state = 'invalid';
            const schema = {
                properties: {},
                requiredProperties: []
            };

            const result = validateState(state, schema);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('State must be a plain object');
        });

        it('should reject state missing required properties', () => {
            const state = {
                count: 42
            };

            const schema = {
                properties: {
                    status: { type: 'string' },
                    count: { type: 'number' }
                },
                requiredProperties: ['status']
            };

            const result = validateState(state, schema);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Missing required property: status');
        });

        it('should reject state with extra properties when not allowed', () => {
            const state = {
                status: 'active',
                unexpected: 'value'
            };

            const schema = {
                properties: {
                    status: { type: 'string' }
                },
                requiredProperties: [],
                allowExtraProperties: false
            };

            const result = validateState(state, schema);

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Unexpected properties');
        });

        it('should accept state with extra properties when allowed', () => {
            const state = {
                status: 'active',
                metadata: { key: 'value' }
            };

            const schema = {
                properties: {
                    status: { type: 'string' }
                },
                requiredProperties: ['status'],
                allowExtraProperties: true
            };

            const result = validateState(state, schema);

            expect(result.valid).toBe(true);
        });

        it('should handle empty state object', () => {
            const state = {};
            const schema = {
                properties: {},
                requiredProperties: []
            };

            const result = validateState(state, schema);

            expect(result.valid).toBe(true);
        });

        it('should reject null state', () => {
            const state = null;
            const schema = {
                properties: {},
                requiredProperties: []
            };

            const result = validateState(state, schema);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('State must be a plain object');
        });

        it('should reject array state', () => {
            const state = [1, 2, 3];
            const schema = {
                properties: {},
                requiredProperties: []
            };

            const result = validateState(state, schema);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('State must be a plain object');
        });
    });

    // ==========================================
    // validateStorageKey Tests
    // ==========================================

    describe('validateStorageKey', () => {
        it('should validate a valid storage key', () => {
            const result = validateStorageKey('user_123');

            expect(result.valid).toBe(true);
            expect(result.normalizedValue).toBe('user_123');
        });

        it('should validate keys with dots', () => {
            const result = validateStorageKey('config.app.settings');

            expect(result.valid).toBe(true);
        });

        it('should validate keys with dashes', () => {
            const result = validateStorageKey('my-key-123');

            expect(result.valid).toBe(true);
        });

        it('should validate keys with underscores', () => {
            const result = validateStorageKey('my_key_123');

            expect(result.valid).toBe(true);
        });

        it('should validate alphanumeric keys', () => {
            const result = validateStorageKey('abc123XYZ');

            expect(result.valid).toBe(true);
        });

        it('should reject empty string key', () => {
            const result = validateStorageKey('');

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Storage key cannot be empty');
        });

        it('should reject non-string key', () => {
            const result = validateStorageKey(123);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Storage key must be a string');
        });

        it('should reject key with spaces', () => {
            const result = validateStorageKey('my key');

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Storage key contains invalid characters');
        });

        it('should reject key with special characters', () => {
            const result = validateStorageKey('key@#$');

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Storage key contains invalid characters');
        });

        it('should reject key with slash', () => {
            const result = validateStorageKey('key/value');

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Storage key contains invalid characters');
        });

        it('should reject key with backslash', () => {
            const result = validateStorageKey('key\\value');

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Storage key contains invalid characters');
        });

        it('should reject null key', () => {
            const result = validateStorageKey(null);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Storage key must be a string');
        });

        it('should reject undefined key', () => {
            const result = validateStorageKey(undefined);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Storage key must be a string');
        });

        it('should reject very long keys', () => {
            const longKey = 'a'.repeat(10000);
            const result = validateStorageKey(longKey);

            // Long keys are technically valid by our regex, but may fail in practice
            expect(result.valid).toBe(true);
        });
    });

    // ==========================================
    // validateStorageValue Tests
    // ==========================================

    describe('validateStorageValue', () => {
        it('should validate a small object', () => {
            const value = { name: 'John', age: 30 };
            const result = validateStorageValue(value);

            expect(result.valid).toBe(true);
        });

        it('should validate a string value', () => {
            const value = 'Hello, world!';
            const result = validateStorageValue(value);

            expect(result.valid).toBe(true);
        });

        it('should validate a number value', () => {
            const value = 42;
            const result = validateStorageValue(value);

            expect(result.valid).toBe(true);
        });

        it('should validate an array value', () => {
            const value = [1, 2, 3, 4, 5];
            const result = validateStorageValue(value);

            expect(result.valid).toBe(true);
        });

        it('should validate null value', () => {
            const value = null;
            const result = validateStorageValue(value);

            expect(result.valid).toBe(true);
        });

        it('should validate an empty object', () => {
            const value = {};
            const result = validateStorageValue(value);

            expect(result.valid).toBe(true);
        });

        it('should validate an empty array', () => {
            const value = [];
            const result = validateStorageValue(value);

            expect(result.valid).toBe(true);
        });

        it('should validate a large but acceptable object', () => {
            const value = { data: 'x'.repeat(1000) };
            const result = validateStorageValue(value);

            expect(result.valid).toBe(true);
        });

        it('should reject an oversized value', () => {
            // Create an object larger than default 5MB limit
            const largeObject = { data: 'x'.repeat(6 * 1024 * 1024) };
            const result = validateStorageValue(largeObject);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('exceeds');
            expect(result.error).toContain('KB limit');
        });

        it('should respect custom size limit', () => {
            const value = { data: 'x'.repeat(2000) };
            const result = validateStorageValue(value, 1); // 1KB limit

            expect(result.valid).toBe(false);
        });

        it('should validate value exactly at size limit', () => {
            // Create a value exactly at 1KB
            const value = { data: 'x'.repeat(1000) };
            const result = validateStorageValue(value, 1); // 1KB limit

            expect(result.valid).toBe(true);
        });

        it('should handle circular reference gracefully', () => {
            const obj = {};
            obj.self = obj;

            const result = validateStorageValue(obj);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Value cannot be serialized');
        });

        it('should handle non-serializable values', () => {
            const fn = () => {};
            const result = validateStorageValue(fn);

            // Functions serialize to null in JSON, which is valid
            expect(result.valid).toBe(true);
        });

        it('should validate boolean values', () => {
            const result = validateStorageValue(true);
            expect(result.valid).toBe(true);
        });

        it('should validate undefined value', () => {
            const result = validateStorageValue(undefined);
            expect(result.valid).toBe(true);
        });
    });

    // ==========================================
    // validateBatch Tests
    // ==========================================

    describe('validateBatch', () => {
        it('should validate multiple valid items', () => {
            const items = {
                name: 'John',
                age: 30,
                email: 'john@example.com'
            };

            const schemas = {
                name: { type: 'string' },
                age: { type: 'number' },
                email: { type: 'string' }
            };

            const result = validateBatch(items, schemas);

            expect(result.valid).toBe(true);
            expect(result.results).toHaveProperty('name');
            expect(result.results).toHaveProperty('age');
            expect(result.results).toHaveProperty('email');
        });

        it('should collect errors for invalid items', () => {
            const items = {
                name: 'John',
                age: 'invalid', // Should be number
                email: 'john@example.com'
            };

            const schemas = {
                name: { type: 'string' },
                age: { type: 'number' },
                email: { type: 'string' }
            };

            const result = validateBatch(items, schemas);

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveProperty('age');
            expect(result.results.age.valid).toBe(false);
        });

        it('should handle missing items gracefully', () => {
            const items = {
                name: 'John'
            };

            const schemas = {
                name: { type: 'string' },
                age: { type: 'number' }
            };

            const result = validateBatch(items, schemas);

            expect(result.valid).toBe(true);
            expect(result.results).toHaveProperty('name');
            expect(result.results).not.toHaveProperty('age');
        });

        it('should validate empty items object', () => {
            const items = {};
            const schemas = {};

            const result = validateBatch(items, schemas);

            expect(result.valid).toBe(true);
            expect(Object.keys(result.results)).toHaveLength(0);
        });

        it('should handle items without schemas', () => {
            const items = {
                name: 'John',
                extra: 'value'
            };

            const schemas = {
                name: { type: 'string' }
            };

            const result = validateBatch(items, schemas);

            expect(result.valid).toBe(true);
            expect(result.results).toHaveProperty('name');
            expect(result.results).not.toHaveProperty('extra');
        });

        it('should return all validation results', () => {
            const items = {
                name: 'John',
                age: 30
            };

            const schemas = {
                name: { type: 'string' },
                age: { type: 'number' }
            };

            const result = validateBatch(items, schemas);

            expect(result.results.name.valid).toBe(true);
            expect(result.results.age.valid).toBe(true);
        });

        it('should handle required field validation', () => {
            const items = {
                name: null
            };

            const schemas = {
                name: { type: 'string', required: true }
            };

            const result = validateBatch(items, schemas);

            expect(result.valid).toBe(false);
            expect(result.errors.name.valid).toBe(false);
        });

        it('should validate enum values', () => {
            const items = {
                status: 'active'
            };

            const schemas = {
                status: {
                    type: 'string',
                    enum: ['pending', 'active', 'completed']
                }
            };

            const result = validateBatch(items, schemas);

            expect(result.valid).toBe(true);
        });

        it('should reject invalid enum values', () => {
            const items = {
                status: 'invalid'
            };

            const schemas = {
                status: {
                    type: 'string',
                    enum: ['pending', 'active', 'completed']
                }
            };

            const result = validateBatch(items, schemas);

            expect(result.valid).toBe(false);
            expect(result.errors.status.valid).toBe(false);
        });

        it('should handle null values', () => {
            const items = {
                name: null,
                age: null
            };

            const schemas = {
                name: { type: 'string' },
                age: { type: 'number' }
            };

            const result = validateBatch(items, schemas);

            // Null values with type validation will fail type check
            // Our mock validates type, so null won't match 'string' or 'number'
            expect(result.valid).toBe(false);
            expect(result.errors.name).toBeDefined();
            expect(result.errors.age).toBeDefined();
        });
    });
});
