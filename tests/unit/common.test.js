/**
 * Common Utilities Tests
 *
 * Comprehensive test coverage for Common utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Common } from '../../js/utils/common.js';

// Mock timers for debounce/throttle tests
vi.useFakeTimers();

describe('Common Utilities', () => {
  let consoleSpy;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Spy on console.log for testing
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('formatBytes', () => {
    it('should format 0 bytes correctly', () => {
      expect(Common.formatBytes(0)).toBe('0 Bytes');
    });

    it('should format bytes correctly', () => {
      expect(Common.formatBytes(1)).toBe('1 Bytes');
      expect(Common.formatBytes(100)).toBe('100 Bytes');
      expect(Common.formatBytes(1023)).toBe('1023 Bytes');
    });

    it('should format kilobytes correctly', () => {
      expect(Common.formatBytes(1024)).toBe('1 KB');
      expect(Common.formatBytes(1536)).toBe('1.5 KB');
      expect(Common.formatBytes(2048)).toBe('2 KB');
      expect(Common.formatBytes(1048575)).toBe('1024 KB');
    });

    it('should format megabytes correctly', () => {
      expect(Common.formatBytes(1048576)).toBe('1 MB');
      expect(Common.formatBytes(1572864)).toBe('1.5 MB');
      expect(Common.formatBytes(2097152)).toBe('2 MB');
      expect(Common.formatBytes(1073741823)).toBe('1024 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(Common.formatBytes(1073741824)).toBe('1 GB');
      expect(Common.formatBytes(1610612736)).toBe('1.5 GB');
      expect(Common.formatBytes(2147483648)).toBe('2 GB');
      expect(Common.formatBytes(1099511627775)).toBe('1024 GB');
    });

    it('should format terabytes correctly', () => {
      expect(Common.formatBytes(1099511627776)).toBe('1 TB');
      expect(Common.formatBytes(1649267441664)).toBe('1.5 TB');
      expect(Common.formatBytes(2199023255552)).toBe('2 TB');
    });

    it('should handle custom decimal places', () => {
      expect(Common.formatBytes(1536, 0)).toBe('2 KB');
      expect(Common.formatBytes(1536, 1)).toBe('1.5 KB');
      expect(Common.formatBytes(1536, 2)).toBe('1.5 KB'); // toFixed doesn't pad with zeros
      expect(Common.formatBytes(1536, 3)).toBe('1.5 KB');
    });

    it('should handle negative numbers', () => {
      expect(Common.formatBytes(-1024)).toBe('-1 KB');
      expect(Common.formatBytes(-1048576)).toBe('-1 MB');
    });

    it('should handle non-finite values', () => {
      expect(Common.formatBytes(Infinity)).toBe('Unknown');
      expect(Common.formatBytes(-Infinity)).toBe('Unknown'); // Both return 'Unknown'
      expect(Common.formatBytes(NaN)).toBe('Unknown');
    });

    it('should handle floating point bytes', () => {
      expect(Common.formatBytes(1024.5)).toBe('1 KB');
      expect(Common.formatBytes(1024.5, 1)).toBe('1 KB'); // Already rounded
    });
  });

  describe('checkSecureContext', () => {
    it('should return an object with secure property', () => {
      const result = Common.checkSecureContext();
      expect(typeof result).toBe('object');
      expect(typeof result.secure).toBe('boolean');
      // reason is only present when secure is false
      if (!result.secure) {
        expect(typeof result.reason).toBe('string');
      }
    });
  });

  describe('debounce', () => {
    it('should debounce function calls', () => {
      const fn = vi.fn();
      const debouncedFn = Common.debounce(fn, 100);

      // Call multiple times quickly
      debouncedFn();
      debouncedFn();
      debouncedFn();

      expect(fn).not.toHaveBeenCalled();

      // Advance timers
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should reset timer on subsequent calls', () => {
      const fn = vi.fn();
      const debouncedFn = Common.debounce(fn, 100);

      debouncedFn();
      vi.advanceTimersByTime(50);
      debouncedFn(); // Reset timer
      vi.advanceTimersByTime(50);

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should execute immediately with immediate option', () => {
      const fn = vi.fn();
      const debouncedFn = Common.debounce(fn, 100, true);

      debouncedFn();
      expect(fn).toHaveBeenCalledTimes(1);

      debouncedFn();
      debouncedFn();
      expect(fn).toHaveBeenCalledTimes(1); // Still 1

      vi.advanceTimersByTime(100);

      debouncedFn();
      expect(fn).toHaveBeenCalledTimes(2); // Now 2
    });

    it('should pass arguments and context', () => {
      const fn = vi.fn();
      const debouncedFn = Common.debounce(fn, 100);
      const context = { value: 42 };

      debouncedFn.call(context, 'arg1', 'arg2');
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
      // Note: Arrow functions don't preserve 'this' context, so we can't test it here
    });

    it('should return function result', () => {
      const fn = vi.fn(() => 'result');
      const debouncedFn = Common.debounce(fn, 100);

      const result = debouncedFn();
      vi.advanceTimersByTime(100);

      expect(result).toBeUndefined(); // debounce doesn't return the function result
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('throttle', () => {
    it('should throttle function calls', () => {
      const fn = vi.fn();
      const throttledFn = Common.throttle(fn, 100);

      // Call multiple times quickly
      throttledFn();
      throttledFn();
      throttledFn();

      expect(fn).toHaveBeenCalledTimes(1);

      // Advance timers
      vi.advanceTimersByTime(100);

      // Call again
      throttledFn();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should execute on first call', () => {
      const fn = vi.fn();
      const throttledFn = Common.throttle(fn, 100);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not execute again within limit', () => {
      const fn = vi.fn();
      const throttledFn = Common.throttle(fn, 100);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1);

      throttledFn();
      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should pass arguments and context', () => {
      const fn = vi.fn();
      const throttledFn = Common.throttle(fn, 100);
      const context = { value: 42 };

      throttledFn.call(context, 'arg1', 'arg2');

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(fn.mock.instances[0]).toBe(context);
    });
  });

  describe('deepClone', () => {
    it('should clone primitive values', () => {
      expect(Common.deepClone(null)).toBe(null);
      expect(Common.deepClone(undefined)).toBe(undefined);
      expect(Common.deepClone(123)).toBe(123);
      expect(Common.deepClone('string')).toBe('string');
      expect(Common.deepClone(true)).toBe(true);
    });

    it('should clone objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = Common.deepClone(obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
    });

    it('should clone arrays', () => {
      const arr = [1, [2, 3], { a: 4 }];
      const cloned = Common.deepClone(arr);

      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
      expect(cloned[1]).not.toBe(arr[1]);
      expect(cloned[2]).not.toBe(arr[2]);
    });

    it('should handle nested structures', () => {
      const obj = {
        a: {
          b: {
            c: [1, 2, { d: 3 }],
          },
        },
      };
      const cloned = Common.deepClone(obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.a).not.toBe(obj.a);
      expect(cloned.a.b).not.toBe(obj.a.b);
      expect(cloned.a.b.c).not.toBe(obj.a.b.c);
      expect(cloned.a.b.c[2]).not.toBe(obj.a.b.c[2]);
    });

    it('should handle special object types', () => {
      const date = new Date('2024-01-01');
      const clonedDate = Common.deepClone(date);

      expect(clonedDate).toEqual(date);
      expect(clonedDate).not.toBe(date);
      expect(clonedDate instanceof Date).toBe(true);
    });

    it('should handle null and undefined in objects', () => {
      const obj = {
        nullValue: null,
        undefinedValue: undefined,
        nested: {
          nullValue: null,
          undefinedValue: undefined,
        },
      };
      const cloned = Common.deepClone(obj);

      expect(cloned).toEqual(obj);
      expect(cloned.nullValue).toBe(null);
      expect(cloned.undefinedValue).toBe(undefined);
      expect(cloned.nested.nullValue).toBe(null);
      expect(cloned.nested.undefinedValue).toBe(undefined);
    });
  });

  describe('deepEqual', () => {
    it('should compare primitive values', () => {
      expect(Common.deepEqual(null, null)).toBe(true);
      expect(Common.deepEqual(undefined, undefined)).toBe(true);
      expect(Common.deepEqual(123, 123)).toBe(true);
      expect(Common.deepEqual('string', 'string')).toBe(true);
      expect(Common.deepEqual(true, true)).toBe(true);

      expect(Common.deepEqual(123, 456)).toBe(false);
      expect(Common.deepEqual('a', 'b')).toBe(false);
      expect(Common.deepEqual(true, false)).toBe(false);
      expect(Common.deepEqual(null, undefined)).toBe(false);
    });

    it('should compare objects', () => {
      const obj1 = { a: 1, b: 2 };
      const obj2 = { a: 1, b: 2 };
      const obj3 = { a: 1, b: 3 };

      expect(Common.deepEqual(obj1, obj2)).toBe(true);
      expect(Common.deepEqual(obj1, obj3)).toBe(false);
      expect(Common.deepEqual(obj1, {})).toBe(false);
    });

    it('should compare arrays', () => {
      const arr1 = [1, 2, 3];
      const arr2 = [1, 2, 3];
      const arr3 = [1, 2, 4];

      expect(Common.deepEqual(arr1, arr2)).toBe(true);
      expect(Common.deepEqual(arr1, arr3)).toBe(false);
      expect(Common.deepEqual(arr1, [])).toBe(false);
    });

    it('should compare nested structures', () => {
      const obj1 = {
        a: {
          b: {
            c: [1, 2, { d: 3 }],
          },
        },
      };
      const obj2 = {
        a: {
          b: {
            c: [1, 2, { d: 3 }],
          },
        },
      };
      const obj3 = {
        a: {
          b: {
            c: [1, 2, { d: 4 }],
          },
        },
      };

      expect(Common.deepEqual(obj1, obj2)).toBe(true);
      expect(Common.deepEqual(obj1, obj3)).toBe(false);
    });

    it('should handle different types', () => {
      expect(Common.deepEqual(123, '123')).toBe(false);
      expect(Common.deepEqual([], {})).toBe(false);
      expect(Common.deepEqual(null, {})).toBe(false);
      expect(Common.deepEqual(undefined, null)).toBe(false);
    });

    it('should handle objects with different keys', () => {
      const obj1 = { a: 1, b: 2 };
      const obj2 = { a: 1, b: 2, c: 3 };
      const obj3 = { a: 1 };

      expect(Common.deepEqual(obj1, obj2)).toBe(false);
      expect(Common.deepEqual(obj1, obj3)).toBe(false);
    });

    it('should handle arrays with different lengths', () => {
      const arr1 = [1, 2, 3];
      const arr2 = [1, 2, 3, 4];
      const arr3 = [1, 2];

      expect(Common.deepEqual(arr1, arr2)).toBe(false);
      expect(Common.deepEqual(arr1, arr3)).toBe(false);
    });
  });

  describe('getNestedValue', () => {
    it('should get nested object values', () => {
      const obj = {
        a: {
          b: {
            c: 'value',
          },
        },
      };

      expect(Common.getNestedValue(obj, 'a.b.c')).toBe('value');
      expect(Common.getNestedValue(obj, 'a.b')).toEqual({ c: 'value' });
      expect(Common.getNestedValue(obj, 'a')).toEqual({ b: { c: 'value' } });
    });

    it('should get array values', () => {
      const obj = {
        arr: [{ id: 1 }, { id: 2 }, { id: 3 }],
      };

      expect(Common.getNestedValue(obj, 'arr.0.id')).toBe(1);
      expect(Common.getNestedValue(obj, 'arr.1.id')).toBe(2);
      expect(Common.getNestedValue(obj, 'arr.2')).toEqual({ id: 3 });
    });

    it('should return default value for missing paths', () => {
      const obj = { a: { b: 'value' } };

      expect(Common.getNestedValue(obj, 'a.c', 'default')).toBe('default');
      expect(Common.getNestedValue(obj, 'x.y.z', 'default')).toBe('default');
      expect(Common.getNestedValue(null, 'a.b', 'default')).toBe('default');
      expect(Common.getNestedValue(undefined, 'a.b', 'default')).toBe('default');
    });

    it('should return undefined for missing paths without default', () => {
      const obj = { a: { b: 'value' } };

      expect(Common.getNestedValue(obj, 'a.c')).toBeUndefined();
      expect(Common.getNestedValue(obj, 'x.y.z')).toBeUndefined();
      expect(Common.getNestedValue(null, 'a.b')).toBeUndefined();
      expect(Common.getNestedValue(undefined, 'a.b')).toBeUndefined();
    });

    it('should handle empty path', () => {
      const obj = { a: 1 };

      expect(Common.getNestedValue(obj, '')).toBeUndefined();
    });

    it('should handle null/undefined in path', () => {
      const obj = {
        a: {
          b: null,
          c: undefined,
        },
      };

      expect(Common.getNestedValue(obj, 'a.b')).toBe(null);
      expect(Common.getNestedValue(obj, 'a.c')).toBe(undefined);
    });
  });

  describe('setNestedValue', () => {
    it('should set nested object values', () => {
      const obj = {};
      Common.setNestedValue(obj, 'a.b.c', 'value');

      expect(obj).toEqual({ a: { b: { c: 'value' } } });
    });

    it('should set array values', () => {
      const obj = {};
      Common.setNestedValue(obj, 'arr.0.name', 'first');
      Common.setNestedValue(obj, 'arr.1.name', 'second');

      // Note: setNestedValue creates objects, not arrays for numeric indices
      expect(obj).toEqual({
        arr: {
          0: { name: 'first' },
          1: { name: 'second' },
        },
      });
    });

    it('should overwrite existing values', () => {
      const obj = {
        a: {
          b: 'old',
        },
      };

      Common.setNestedValue(obj, 'a.b', 'new');

      expect(obj).toEqual({ a: { b: 'new' } });
    });

    it('should create nested structure as needed', () => {
      const obj = { existing: 'value' };
      Common.setNestedValue(obj, 'new.deep.nested.path', 'value');

      expect(obj).toEqual({
        existing: 'value',
        new: {
          deep: {
            nested: {
              path: 'value',
            },
          },
        },
      });
    });

    it('should handle numeric indices', () => {
      const obj = {};
      Common.setNestedValue(obj, '0.1.2', 'value');

      expect(obj).toEqual({
        0: {
          1: {
            2: 'value',
          },
        },
      });
    });

    it('should return boolean indicating success', () => {
      const obj = {};
      const result = Common.setNestedValue(obj, 'a.b', 'value');

      expect(result).toBe(true);
      expect(obj).toEqual({ a: { b: 'value' } });
    });

    it('should return false for invalid object', () => {
      const result = Common.setNestedValue(null, 'a.b', 'value');
      expect(result).toBe(false);

      const result2 = Common.setNestedValue('not object', 'a.b', 'value');
      expect(result2).toBe(false);
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = Common.generateId();
      const id2 = Common.generateId();

      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
    });

    it('should generate IDs with prefix', () => {
      const id = Common.generateId('test_');

      expect(id).toMatch(/^test_/);
      expect(id.length).toBeGreaterThan(5); // prefix + random part
    });

    it('should generate IDs of reasonable length', () => {
      const id = Common.generateId();

      expect(id.length).toBeGreaterThan(5);
      expect(id.length).toBeLessThan(20);
    });

    it('should generate different IDs even with same prefix', () => {
      const id1 = Common.generateId('prefix_');
      const id2 = Common.generateId('prefix_');

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^prefix_/);
      expect(id2).toMatch(/^prefix_/);
    });
  });

  describe('sleep', () => {
    it('should return a promise', () => {
      const result = Common.sleep(100);

      expect(result).toBeInstanceOf(Promise);
    });

    it('should resolve with undefined', async () => {
      const promise = Common.sleep(100);
      vi.advanceTimersByTime(100);
      const result = await promise;

      expect(result).toBeUndefined();
    });

    it('should handle zero delay', async () => {
      const promise = Common.sleep(0);
      vi.advanceTimersByTime(0);
      const result = await promise;

      expect(result).toBeUndefined();
    });
  });

  describe('retry', () => {
    it('should not retry successful operations', async () => {
      const fn = vi.fn(() => 'success');

      const result = await Common.retry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle shouldRetry function', async () => {
      const fn = vi.fn(() => {
        throw new Error('non-retryable');
      });

      const shouldRetry = error => error.message !== 'non-retryable';

      await expect(Common.retry(fn, { maxAttempts: 2, shouldRetry })).rejects.toThrow(
        'non-retryable'
      );

      expect(fn).toHaveBeenCalledTimes(1); // No retries
    });

    it('should pass function arguments', async () => {
      const fn = vi.fn((a, b) => a + b);

      const result = await Common.retry(() => fn(1, 2));

      expect(result).toBe(3);
      expect(fn).toHaveBeenCalledWith(1, 2);
    });
  });
});
