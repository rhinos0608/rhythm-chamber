/**
 * Tests for schema-validator module
 * Tests JSON Schema-like validation functionality
 */

import { describe, it, expect } from 'vitest';
import {
  validateSchema,
  _validateType,
  _validateEnum,
  _validateObjectProperties,
} from '../../../../js/utils/validation/schema-validator.js';

describe('schema-validator', () => {
  describe('validateSchema', () => {
    it('should validate correct type', () => {
      const result = validateSchema('hello', { type: 'string' });
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe('hello');
    });

    it('should reject wrong type', () => {
      const result = validateSchema(123, { type: 'string' });
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors[0]).toContain('Expected type string');
    });

    it('should normalize string to number', () => {
      const result = validateSchema('123', { type: 'number' });
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(123);
    });

    it('should normalize string to integer', () => {
      const result = validateSchema('42', { type: 'integer' });
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(42);
    });

    it('should reject non-integer string for integer type', () => {
      const result = validateSchema('12.3', { type: 'integer' });
      expect(result.valid).toBe(false);
    });

    it('should handle required field with null value', () => {
      const result = validateSchema(null, { type: 'string', required: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should handle optional field with null value', () => {
      const result = validateSchema(null, { type: 'string' });
      expect(result.valid).toBe(true);
    });

    it('should validate number range (min)', () => {
      const result = validateSchema(5, { type: 'number', min: 10 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at least 10');
    });

    it('should validate number range (max)', () => {
      const result = validateSchema(15, { type: 'number', max: 10 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at most 10');
    });

    it('should accept number within range', () => {
      const result = validateSchema(5, { type: 'number', min: 0, max: 10 });
      expect(result.valid).toBe(true);
    });

    it('should validate string length (minLength)', () => {
      const result = validateSchema('hi', { type: 'string', minLength: 5 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at least 5');
    });

    it('should validate string length (maxLength)', () => {
      const result = validateSchema('hello world', { type: 'string', maxLength: 5 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at most 5');
    });

    it('should accept string within length range', () => {
      const result = validateSchema('hello', { type: 'string', minLength: 3, maxLength: 10 });
      expect(result.valid).toBe(true);
    });

    it('should validate pattern', () => {
      const result = validateSchema('abc123', { type: 'string', pattern: '^[a-z]+$' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('pattern');
    });

    it('should accept matching pattern', () => {
      const result = validateSchema('hello', { type: 'string', pattern: '^[a-z]+$' });
      expect(result.valid).toBe(true);
    });

    it('should validate enum (exact match)', () => {
      const result = validateSchema('pending', {
        type: 'string',
        enum: ['pending', 'active', 'completed'],
      });
      expect(result.valid).toBe(true);
    });

    it('should normalize case-insensitive enum', () => {
      const result = validateSchema('PENDING', {
        type: 'string',
        enum: ['pending', 'active', 'completed'],
      });
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe('pending');
    });

    it('should reject invalid enum value', () => {
      const result = validateSchema('invalid', {
        type: 'string',
        enum: ['pending', 'active', 'completed'],
      });
      expect(result.valid).toBe(false);
    });

    it('should validate object properties', () => {
      const result = validateSchema(
        { name: 'John', age: 30 },
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'integer', min: 0 },
          },
          requiredProperties: ['name'],
        }
      );
      expect(result.valid).toBe(true);
    });

    it('should reject missing required property', () => {
      const result = validateSchema(
        { age: 30 },
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'integer' },
          },
          requiredProperties: ['name', 'age'],
        }
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('should validate nested property schemas', () => {
      const result = validateSchema(
        { user: { name: 'John', age: 30 } },
        {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'integer' },
              },
            },
          },
        }
      );
      expect(result.valid).toBe(true);
    });

    it('should handle complex validation with multiple constraints', () => {
      const result = validateSchema('test@example.com', {
        type: 'string',
        pattern: '^[\\w\\.]+@[\\w\\.]+\\.[a-zA-Z]{2,}$',
        minLength: 5,
        maxLength: 100,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('_validateType', () => {
    it('should accept matching types', () => {
      expect(_validateType('hello', 'string').valid).toBe(true);
      expect(_validateType(123, 'number').valid).toBe(true);
      expect(_validateType(true, 'boolean').valid).toBe(true);
    });

    it('should accept array type', () => {
      expect(_validateType([1, 2, 3], 'array').valid).toBe(true);
    });

    it('should accept integer as number', () => {
      expect(_validateType(42, 'integer').valid).toBe(true);
    });

    it('should reject non-integer number for integer type', () => {
      const result = _validateType(3.14, 'integer');
      expect(result.valid).toBe(false);
    });

    it('should normalize string to number', () => {
      const result = _validateType('123', 'number');
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(123);
    });

    it('should normalize string to integer', () => {
      const result = _validateType('42', 'integer');
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe(42);
    });

    it('should reject invalid string conversion', () => {
      const result = _validateType('abc', 'number');
      expect(result.valid).toBe(false);
    });

    it('should reject type mismatch', () => {
      const result = _validateType('hello', 'number');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Expected type number');
    });
  });

  describe('_validateEnum', () => {
    it('should accept exact match', () => {
      const result = _validateEnum('pending', ['pending', 'active', 'completed']);
      expect(result.valid).toBe(true);
    });

    it('should normalize trimmed string', () => {
      const result = _validateEnum('  pending  ', ['pending', 'active']);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe('pending');
    });

    it('should normalize case-insensitive', () => {
      const result = _validateEnum('PENDING', ['pending', 'active']);
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe('pending');
    });

    it('should reject invalid value', () => {
      const result = _validateEnum('invalid', ['pending', 'active']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be one of');
    });

    it('should handle numeric enums', () => {
      const result = _validateEnum(1, [0, 1, 2]);
      expect(result.valid).toBe(true);
    });

    it('should reject non-numeric value for numeric enum', () => {
      const result = _validateEnum('1', [0, 1, 2]);
      expect(result.valid).toBe(false);
    });
  });

  describe('_validateObjectProperties', () => {
    it('should accept valid object', () => {
      const result = _validateObjectProperties(
        { name: 'John', age: 30 },
        { name: { type: 'string' }, age: { type: 'number' } },
        ['name']
      );
      expect(result.valid).toBe(true);
    });

    it('should reject non-object', () => {
      const result = _validateObjectProperties('not an object', { name: { type: 'string' } });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be an object');
    });

    it('should reject null', () => {
      const result = _validateObjectProperties(null, { name: { type: 'string' } });
      expect(result.valid).toBe(false);
    });

    it('should check required properties', () => {
      const result = _validateObjectProperties(
        { age: 30 },
        { name: { type: 'string' }, age: { type: 'number' } },
        ['name', 'age']
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('should validate property schemas', () => {
      const result = _validateObjectProperties({ name: 123 }, { name: { type: 'string' } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('should ignore missing optional properties', () => {
      const result = _validateObjectProperties(
        { name: 'John' },
        { name: { type: 'string' }, age: { type: 'number' } },
        ['name']
      );
      expect(result.valid).toBe(true);
    });

    it('should handle empty properties object', () => {
      const result = _validateObjectProperties({ name: 'John', age: 30 }, {}, []);
      expect(result.valid).toBe(true);
    });

    it('should handle no required properties', () => {
      const result = _validateObjectProperties(
        { name: 'John' },
        { name: { type: 'string' }, age: { type: 'number' } }
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Real-world validation scenarios', () => {
    it('should validate user input schema', () => {
      const userInput = {
        username: 'john_doe',
        email: 'john@example.com',
        age: 25,
      };

      const schema = {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 20 },
          email: { type: 'string', pattern: '^[\\w\\.]+@[\\w\\.]+\\.[a-zA-Z]{2,}$' },
          age: { type: 'integer', min: 13, max: 120 },
        },
        requiredProperties: ['username', 'email', 'age'],
      };

      const result = validateSchema(userInput, schema);
      expect(result.valid).toBe(true);
    });

    it('should validate configuration object', () => {
      const config = {
        port: 3000,
        host: 'localhost',
        ssl: false,
      };

      const schema = {
        type: 'object',
        properties: {
          port: { type: 'integer', min: 1, max: 65535 },
          host: { type: 'string' },
          ssl: { type: 'boolean' },
        },
      };

      const result = validateSchema(config, schema);
      expect(result.valid).toBe(true);
    });

    it('should validate enum-based status', () => {
      const result = validateSchema('IN_PROGRESS', {
        type: 'string',
        enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'],
      });
      expect(result.valid).toBe(true);
      expect(result.normalizedValue).toBe('IN_PROGRESS');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const result = validateSchema('', { type: 'string', minLength: 0 });
      expect(result.valid).toBe(true);
    });

    it('should handle empty array', () => {
      const result = validateSchema([], { type: 'array' });
      expect(result.valid).toBe(true);
    });

    it('should handle empty object', () => {
      const result = validateSchema({}, { type: 'object' });
      expect(result.valid).toBe(true);
    });

    it('should handle zero values', () => {
      expect(validateSchema(0, { type: 'number' }).valid).toBe(true);
      expect(validateSchema('', { type: 'string', minLength: 0 }).valid).toBe(true);
    });

    it('should handle boolean false', () => {
      const result = validateSchema(false, { type: 'boolean', required: true });
      expect(result.valid).toBe(true);
    });

    it('should handle special characters in pattern', () => {
      const result = validateSchema('test@example.com', {
        type: 'string',
        pattern: '^[\\w\\.+-]+@[\\w\\.+-]+\\.[a-zA-Z]{2,}$',
      });
      expect(result.valid).toBe(true);
    });
  });
});
