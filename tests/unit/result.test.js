/**
 * Unit Tests for Result Utility
 *
 * Tests for the Result type used for consistent error handling.
 */

import { describe, it, expect, vi } from 'vitest';
import { Result, Ok, Err } from '../../js/utils/result.js';

// ==========================================
// Basic Result Creation Tests
// ==========================================

describe('Result Creation', () => {
  it('should create a successful Ok result', () => {
    const result = Ok(42);

    expect(result.success).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.data).toBe(42);
    expect(result.isOk()).toBe(true);
    expect(result.isErr()).toBe(false);
  });

  it('should create a failed Err result', () => {
    const error = new Error('Something went wrong');
    const result = Err(error);

    expect(result.success).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(error);
    expect(result.isOk()).toBe(false);
    expect(result.isErr()).toBe(true);
  });

  it('should create success with Result.success factory', () => {
    const result = Result.success('data');

    expect(result.success).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.data).toBe('data');
  });

  it('should create failure with Result.failure factory', () => {
    const result = Result.failure('error', { context: 'test' });

    expect(result.success).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('error');
    expect(result.context).toEqual({ context: 'test' });
  });

  it('should create ok with Result.ok factory (alias)', () => {
    const result = Result.ok({ id: 1 });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ id: 1 });
  });

  it('should create error with Result.error factory (alias)', () => {
    const result = Result.error('failed');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('failed');
  });
});

// ==========================================
// Method Chain Tests
// ==========================================

describe('Result Method Chaining', () => {
  it('should map over successful result', () => {
    const result = Ok(5)
      .map(x => x * 2)
      .map(x => x + 1);

    expect(result.data).toBe(11);
    expect(result.ok).toBe(true);
  });

  it('should not map over failed result', () => {
    const result = Err('error').map(x => x * 2);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('error');
  });

  it('should mapErr over failed result', () => {
    const result = Err('original error').mapErr(e => `Modified: ${e}`);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Modified: original error');
  });

  it('should not mapErr over successful result', () => {
    const result = Ok(42).mapErr(e => 'modified');

    expect(result.ok).toBe(true);
    expect(result.data).toBe(42);
  });

  it('should andThen chain successful results', () => {
    const result = Ok(5)
      .andThen(x => Ok(x * 2))
      .andThen(x => Ok(x + 1));

    expect(result.data).toBe(11);
  });

  it('should short-circuit andThen on error', () => {
    const result = Ok(5)
      .andThen(x => Err('failed'))
      .andThen(x => Ok('never reached'));

    expect(result.ok).toBe(false);
    expect(result.error).toBe('failed');
  });

  it('should orElse provide fallback on error', () => {
    const result = Err('error').orElse(e => Ok(42));

    expect(result.ok).toBe(true);
    expect(result.data).toBe(42);
  });

  it('should not call orElse on success', () => {
    const fallback = vi.fn(() => Ok(99));
    const result = Ok(5).orElse(fallback);

    expect(result.data).toBe(5);
    expect(fallback).not.toHaveBeenCalled();
  });
});

// ==========================================
// Unwrap Tests
// ==========================================

describe('Result Unwrap Methods', () => {
  it('should unwrap successful result', () => {
    const result = Ok(42);
    expect(result.unwrap()).toBe(42);
  });

  it('should throw when unwrapping failed result', () => {
    const result = Err('error');
    expect(() => result.unwrap()).toThrow('error');
  });

  it('should unwrapOr with default on error', () => {
    expect(Err('error').unwrapOr(42)).toBe(42);
    expect(Ok(10).unwrapOr(42)).toBe(10);
  });

  it('should unwrapOrElse with function on error', () => {
    const result = Err('error').unwrapOrElse((e, ctx) => `fallback: ${e}`);
    expect(result).toBe('fallback: error');
  });

  it('should not call unwrapOrElse on success', () => {
    const fn = vi.fn(() => 'fallback');
    const result = Ok('success').unwrapOrElse(fn);
    expect(result).toBe('success');
    expect(fn).not.toHaveBeenCalled();
  });
});

// ==========================================
// Match Tests
// ==========================================

describe('Result Match', () => {
  it('should match ok pattern', () => {
    const result = Ok(42).match({
      ok: value => `got: ${value}`,
      err: error => `error: ${error}`,
    });

    expect(result).toBe('got: 42');
  });

  it('should match err pattern', () => {
    const result = Err('failed').match({
      ok: value => `got: ${value}`,
      err: error => `error: ${error}`,
    });

    expect(result).toBe('error: failed');
  });

  it('should use wildcard pattern when specific not provided', () => {
    const result = Ok(42).match({
      _: value => `wildcard: ${value}`,
    });

    expect(result).toBe('wildcard: 42');
  });

  it('should prefer specific pattern over wildcard', () => {
    const result = Ok(42).match({
      ok: value => `specific: ${value}`,
      _: value => `wildcard: ${value}`,
    });

    expect(result).toBe('specific: 42');
  });
});

// ==========================================
// Result Factory Methods Tests
// ==========================================

describe('Result Factory Methods', () => {
  it('should wrap synchronous function that succeeds', () => {
    const fn = (a, b) => a + b;
    const wrapped = Result.wrapSync(fn);

    const result = wrapped(2, 3);
    expect(result.ok).toBe(true);
    expect(result.data).toBe(5);
  });

  it('should wrap synchronous function that throws', () => {
    const fn = () => {
      throw new Error('test error');
    };
    const wrapped = Result.wrapSync(fn);

    const result = wrapped();
    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('test error');
  });

  it('should wrap async function that succeeds', async () => {
    const fn = async x => x * 2;
    const wrapped = Result.wrapAsync(fn);

    const result = await wrapped(5);
    expect(result.ok).toBe(true);
    expect(result.data).toBe(10);
  });

  it('should wrap async function that rejects', async () => {
    const fn = async () => {
      throw new Error('async error');
    };
    const wrapped = Result.wrapAsync(fn);

    const result = await wrapped();
    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('async error');
  });

  it('should combine all successful results', () => {
    const results = [Ok(1), Ok(2), Ok(3)];
    const combined = Result.all(results);

    expect(combined.ok).toBe(true);
    expect(combined.data).toEqual([1, 2, 3]);
  });

  it('should return first error when combining results with failure', () => {
    const results = [Ok(1), Err('error'), Ok(3)];
    const combined = Result.all(results);

    expect(combined.ok).toBe(false);
    expect(combined.error).toBe('error');
  });

  it('should collect all errors with allWithErrors', () => {
    const results = [Ok(1), Err('e1'), Ok(2), Err('e2')];
    const combined = Result.allWithErrors(results);

    expect(combined.ok).toBe(false);
    expect(combined.error).toEqual(['e1', 'e2']);
    expect(combined.context?.count).toBe(2);
  });

  it('should convert promise to result with fromPromise', async () => {
    const promise = Promise.resolve('success');
    const result = await Result.fromPromise(promise);

    expect(result.ok).toBe(true);
    expect(result.data).toBe('success');
  });

  it('should convert rejected promise to error result', async () => {
    const promise = Promise.reject(new Error('rejected'));
    const result = await Result.fromPromise(promise);

    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('rejected');
  });
});

// ==========================================
// Type Guard Tests
// ==========================================

describe('Result Type Guards', () => {
  it('should identify ok results with isOk', () => {
    expect(Result.isOk(Ok(1))).toBe(true);
    expect(Result.isOk(Err('error'))).toBe(false);
    expect(Result.isOk(null)).toBe(false);
    // Note: isOk checks if result.ok === true, not if it's a true Result type
    expect(Result.isOk({ ok: true })).toBe(true); // Has ok property
  });

  it('should identify err results with isErr', () => {
    expect(Result.isErr(Err('error'))).toBe(true);
    expect(Result.isErr(Ok(1))).toBe(false);
    expect(Result.isErr(null)).toBe(false);
  });
});

// ==========================================
// Real-world Usage Examples
// ==========================================

describe('Result Real-world Patterns', () => {
  it('should handle validation chain', () => {
    const validateEmail = email => {
      if (!email.includes('@')) return Err('Invalid email');
      return Ok(email);
    };

    const validateLength = email => {
      if (email.length < 5) return Err('Email too short');
      return Ok(email);
    };

    const result = validateEmail('test@example.com').andThen(validateLength);

    expect(result.ok).toBe(true);
  });

  it('should handle data transformation pipeline', () => {
    const parse = str => {
      const num = parseInt(str, 10);
      if (isNaN(num)) return Err('Not a number');
      return Ok(num);
    };

    const double = n => Ok(n * 2);
    const toString = n => Ok(String(n));

    const result = parse('21').andThen(double).andThen(toString);

    expect(result.ok).toBe(true);
    expect(result.data).toBe('42');
  });

  it('should handle fallback with orElse', () => {
    const getConfig = key => {
      if (key === 'missing') return Err('Not found');
      return Ok('value');
    };

    const result = getConfig('missing').orElse(() => Ok('default'));

    expect(result.ok).toBe(true);
    expect(result.data).toBe('default');
  });
});
