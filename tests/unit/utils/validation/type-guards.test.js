/**
 * Type Guards Tests
 *
 * Comprehensive test suite for type checking utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  isObject,
  isPlainObject,
  isArray,
  isNonEmptyString,
  isFunction,
  isPromise,
  ensureNumber,
} from '../../../../js/utils/validation/type-guards.js';

describe('type-guards', () => {
  describe('isObject', () => {
    it('should return true for plain objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ a: 1 })).toBe(true);
      expect(isObject(Object.create(null))).toBe(true);
    });

    it('should return false for null', () => {
      expect(isObject(null)).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(isObject([])).toBe(false);
      expect(isObject([1, 2, 3])).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isObject(42)).toBe(false);
      expect(isObject('string')).toBe(false);
      expect(isObject(true)).toBe(false);
      expect(isObject(undefined)).toBe(false);
      expect(isObject(Symbol('sym'))).toBe(false);
    });

    it('should return false for functions', () => {
      expect(isObject(() => {})).toBe(false);
      expect(isObject(function () {})).toBe(false);
    });
  });

  describe('isPlainObject', () => {
    it('should return true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1, b: 2 })).toBe(true);
      expect(isPlainObject(Object.create(null))).toBe(true);
    });

    it('should return false for class instances', () => {
      class MyClass {}
      expect(isPlainObject(new MyClass())).toBe(false);
    });

    it('should return false for null', () => {
      expect(isPlainObject(null)).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject([1, 2, 3])).toBe(false);
    });

    it('should return false for built-in objects', () => {
      expect(isPlainObject(new Date())).toBe(false);
      expect(isPlainObject(/regex/)).toBe(false);
      expect(isPlainObject(new Map())).toBe(false);
      expect(isPlainObject(new Set())).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isPlainObject(42)).toBe(false);
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(true)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
    });
  });

  describe('isArray', () => {
    it('should return true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray(['a', 'b', 'c'])).toBe(true);
      expect(isArray(new Array())).toBe(true);
    });

    it('should return false for array-like objects', () => {
      expect(isArray({ 0: 'a', 1: 'b', length: 2 })).toBe(false);
      // Create array-like object
      function getArguments() {
        return arguments;
      }
      expect(isArray(getArguments())).toBe(false);
    });

    it('should return false for non-arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray(null)).toBe(false);
      expect(isArray(42)).toBe(false);
      expect(isArray('string')).toBe(false);
      expect(isArray(undefined)).toBe(false);
    });
  });

  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('a')).toBe(true);
      expect(isNonEmptyString('  spaces  ')).toBe(true);
      expect(isNonEmptyString('0')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isNonEmptyString('')).toBe(false);
    });

    it('should return false for whitespace-only strings', () => {
      expect(isNonEmptyString('   ')).toBe(false);
      expect(isNonEmptyString('\t\n\r')).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(isNonEmptyString(42)).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString({})).toBe(false);
      expect(isNonEmptyString([])).toBe(false);
      expect(isNonEmptyString(true)).toBe(false);
    });
  });

  describe('isFunction', () => {
    it('should return true for regular functions', () => {
      expect(isFunction(function () {})).toBe(true);
      expect(isFunction(() => {})).toBe(true);
      expect(isFunction(async function () {})).toBe(true);
      expect(isFunction(async () => {})).toBe(true);
      expect(isFunction(function* () {})).toBe(true);
      const fn = () => {};
      expect(isFunction(fn.bind(null))).toBe(true);
    });

    it('should return true for class constructors', () => {
      expect(isFunction(class MyClass {})).toBe(true);
      expect(isFunction(Date)).toBe(true);
      expect(isFunction(Object)).toBe(true);
    });

    it('should return true for methods', () => {
      const obj = {
        method() {},
      };
      expect(isFunction(obj.method)).toBe(true);
    });

    it('should return false for non-functions', () => {
      expect(isFunction(42)).toBe(false);
      expect(isFunction('string')).toBe(false);
      expect(isFunction(null)).toBe(false);
      expect(isFunction(undefined)).toBe(false);
      expect(isFunction({})).toBe(false);
      expect(isFunction([])).toBe(false);
    });
  });

  describe('isPromise', () => {
    it('should return true for native promises', () => {
      expect(isPromise(Promise.resolve())).toBe(true);
      expect(isPromise(new Promise(() => {}))).toBe(true);
      expect(isPromise(Promise.reject())).toBe(true);
    });

    it('should return true for promise-like objects (thenables)', () => {
      const thenable = {
        then: () => {},
      };
      expect(isPromise(thenable)).toBe(true);
    });

    it('should return false for objects without then method', () => {
      expect(isPromise({})).toBe(false);
      expect(isPromise({ catch: () => {} })).toBe(false);
      expect(isPromise({ then: 42 })).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isPromise(42)).toBe(false);
      expect(isPromise('string')).toBe(false);
      expect(isPromise(null)).toBe(false);
      expect(isPromise(undefined)).toBe(false);
      expect(isPromise(true)).toBe(false);
    });

    it('should return false for non-promise objects', () => {
      expect(isPromise([])).toBe(false);
      expect(isPromise(new Date())).toBe(false);
      expect(isPromise(new Map())).toBe(false);
    });
  });

  describe('ensureNumber', () => {
    it('should return valid numbers as-is', () => {
      expect(ensureNumber(42)).toBe(42);
      expect(ensureNumber(0)).toBe(0);
      expect(ensureNumber(-100)).toBe(-100);
      expect(ensureNumber(3.14)).toBe(3.14);
      expect(ensureNumber(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should parse numeric strings', () => {
      expect(ensureNumber('42')).toBe(42);
      expect(ensureNumber('0')).toBe(0);
      expect(ensureNumber('-100')).toBe(-100);
      expect(ensureNumber('3.14')).toBe(3.14);
    });

    it('should return fallback for NaN', () => {
      expect(ensureNumber(NaN)).toBe(0);
      expect(ensureNumber(NaN, 10)).toBe(10);
    });

    it('should return fallback for Infinity', () => {
      expect(ensureNumber(Infinity)).toBe(0);
      expect(ensureNumber(-Infinity)).toBe(0);
      expect(ensureNumber(Infinity, 10)).toBe(10);
    });

    it('should return fallback for non-numeric strings', () => {
      expect(ensureNumber('abc')).toBe(0);
      expect(ensureNumber('42abc')).toBe(0);
      expect(ensureNumber('abc42')).toBe(0);
      expect(ensureNumber('')).toBe(0);
    });

    it('should return fallback for non-numeric values', () => {
      expect(ensureNumber(null)).toBe(0);
      expect(ensureNumber(undefined)).toBe(0);
      expect(ensureNumber({})).toBe(0);
      expect(ensureNumber([])).toBe(0);
      expect(ensureNumber(true)).toBe(0);
      expect(ensureNumber(false)).toBe(0);
    });

    it('should use custom fallback value', () => {
      expect(ensureNumber(NaN, -1)).toBe(-1);
      expect(ensureNumber('abc', 100)).toBe(100);
      expect(ensureNumber(null, 50)).toBe(50);
      expect(ensureNumber(undefined, 99)).toBe(99);
    });

    it('should handle edge cases', () => {
      expect(ensureNumber('0x10')).toBe(16); // Parsed as hex by Number()
      expect(ensureNumber('1e5')).toBe(100000); // Scientific notation works
      expect(ensureNumber('   42   ')).toBe(42); // Whitespace trimmed
    });
  });

  describe('integration tests', () => {
    it('should work together for complex validation', () => {
      const data = {
        items: [1, 2, 3],
        name: 'test',
        count: 42,
        callback: () => {},
        result: Promise.resolve(),
        config: { setting: true },
      };

      expect(isPlainObject(data)).toBe(true);
      expect(isArray(data.items)).toBe(true);
      expect(isNonEmptyString(data.name)).toBe(true);
      expect(isFunction(data.callback)).toBe(true);
      expect(isPromise(data.result)).toBe(true);
      expect(isObject(data.config)).toBe(true);
    });

    it('should handle real-world data validation scenarios', () => {
      const userInput = '123';
      const config = { max: 100 };
      const data = [1, 2, 3];

      // Validate and convert user input
      const count = ensureNumber(userInput, 0);
      expect(count).toBe(123);

      // Validate config object
      expect(isPlainObject(config)).toBe(true);

      // Validate data array
      expect(isArray(data)).toBe(true);
    });
  });
});
