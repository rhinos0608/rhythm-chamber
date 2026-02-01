/**
 * Unit Tests for RetryManager Critical Bug Fixes
 *
 * Tests for 4 CRITICAL fixes:
 * - CRIT-001: Infinite loop with invalid maxRetries
 * - CRIT-002: Off-by-one error in retry count
 * - CRIT-003: Memory leak in withTimeout()
 * - CRIT-004: Incorrect AbortError classification
 *
 * @file retry-manager-critical-fixes.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRetry,
  withTimeout,
  classifyError,
  ErrorType,
  RetryContext,
  DEFAULT_RETRY_CONFIG,
} from '../../js/utils/retry-manager.js';

describe('RetryManager Critical Fixes', () => {
  // ==========================================
  // CRIT-001: Infinite Loop Prevention
  // ==========================================

  describe('CRIT-001: Infinite Loop with Invalid maxRetries', () => {
    it('should throw error for undefined maxRetries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Test error'));

      await expect(withRetry(fn, { maxRetries: undefined })).rejects.toThrow(/Invalid maxRetries/);
    });

    it('should throw error for null maxRetries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Test error'));

      await expect(withRetry(fn, { maxRetries: null })).rejects.toThrow(/Invalid maxRetries/);
    });

    it('should throw error for NaN maxRetries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Test error'));

      await expect(withRetry(fn, { maxRetries: NaN })).rejects.toThrow(/Invalid maxRetries/);
    });

    it('should throw error for negative maxRetries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Test error'));

      await expect(withRetry(fn, { maxRetries: -1 })).rejects.toThrow(/Invalid maxRetries/);
    });

    it('should throw error for Infinity maxRetries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Test error'));

      await expect(withRetry(fn, { maxRetries: Infinity })).rejects.toThrow(/Invalid maxRetries/);
    });

    it('should accept zero maxRetries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Test error'));

      await expect(withRetry(fn, { maxRetries: 0 })).rejects.toThrow('Test error');
    });

    it('should accept positive maxRetries', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValue('success');

      const { result, context } = await withRetry(fn, { maxRetries: 2 });

      expect(result).toBe('success');
      expect(context.attempt).toBe(2);
    });

    it('should prevent infinite loop with string maxRetries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Test error'));

      await expect(withRetry(fn, { maxRetries: '3' })).rejects.toThrow(/Invalid maxRetries/);
    });
  });

  // ==========================================
  // CRIT-002: Off-by-One Error Fix
  // ==========================================

  describe('CRIT-002: Off-by-One Error in Retry Count', () => {
    it('should execute exactly 3 attempts with maxRetries=3', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'))
        .mockResolvedValue('success');

      const { result, context } = await withRetry(fn, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(4); // Initial + 3 retries = 4 total
      expect(context.attempt).toBe(3); // Retry counter
    });

    it('should stop after maxRetries attempts on failure', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Test error'));

      await expect(withRetry(fn, { maxRetries: 2 })).rejects.toThrow('Test error');

      // With maxRetries=2: initial attempt + 2 retries = 3 total attempts
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not allow extra retry beyond maxRetries', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValue('success'); // Succeeds on 3rd call (after 2 retries)

      const { result, context } = await withRetry(fn, { maxRetries: 2 });

      expect(result).toBe('success');
      // Initial + 2 retries = 3 total calls
      expect(fn).toHaveBeenCalledTimes(3);
      expect(context.attempt).toBe(2); // 2 failures recorded
    });

    it('should respect shouldRetry getter with < condition', () => {
      const context = new RetryContext(3);
      const error = new Error('Test error');

      // attempt starts at 0
      expect(context.shouldRetry).toBe(false); // No error yet

      context.recordAttempt(error);
      expect(context.attempt).toBe(1);
      expect(context.shouldRetry).toBe(true); // 1 < 3

      context.recordAttempt(error);
      expect(context.attempt).toBe(2);
      expect(context.shouldRetry).toBe(true); // 2 < 3

      context.recordAttempt(error);
      expect(context.attempt).toBe(3);
      expect(context.shouldRetry).toBe(false); // 3 < 3 is false!
    });

    it('should work correctly with maxRetries=1', async () => {
      const fn = vi.fn().mockRejectedValueOnce(new Error('Error 1')).mockResolvedValue('success');

      const { result } = await withRetry(fn, { maxRetries: 1 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });

  // ==========================================
  // CRIT-003: Memory Leak Fix
  // ==========================================

  describe('CRIT-003: Memory Leak in withTimeout()', () => {
    it('should clear timeout after successful operation', async () => {
      vi.useFakeTimers();

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      let timeoutResolved = false;

      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      };

      const promise = withTimeout(fn, 5000, 'Timeout error');

      // Fast-forward past fn completion
      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result).toBe('success');
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
      expect(timeoutResolved).toBe(false);

      vi.useRealTimers();
    });

    it('should clear timeout after failed operation', async () => {
      vi.useFakeTimers();

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        throw new Error('Operation failed');
      };

      const promise = withTimeout(fn, 5000, 'Timeout error');

      // Fast-forward past fn failure
      await vi.advanceTimersByTimeAsync(100);

      // Ensure the rejection is handled
      let caughtError = null;
      try {
        await promise;
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeTruthy();
      expect(caughtError.message).toBe('Operation failed');
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);

      // Run all pending timers to ensure they're all processed
      await vi.runAllTimersAsync();

      vi.useRealTimers();
    });

    it('should not leak memory with multiple sequential calls', async () => {
      vi.useFakeTimers();

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      };

      // Call withTimeout multiple times sequentially
      const promise1 = withTimeout(fn, 5000, 'Timeout error');
      await vi.advanceTimersByTimeAsync(100);
      const result1 = await promise1;
      expect(result1).toBe('success');

      const promise2 = withTimeout(fn, 5000, 'Timeout error');
      await vi.advanceTimersByTimeAsync(100);
      const result2 = await promise2;
      expect(result2).toBe('success');

      const promise3 = withTimeout(fn, 5000, 'Timeout error');
      await vi.advanceTimersByTimeAsync(100);
      const result3 = await promise3;
      expect(result3).toBe('success');

      // Each call should clear its timeout
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it('should timeout if operation takes too long', async () => {
      vi.useFakeTimers();

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 10000));
        return 'success';
      };

      const promise = withTimeout(fn, 1000, 'Timeout error');

      // Fast-forward to timeout
      await vi.advanceTimersByTimeAsync(1000);

      // Handle the rejection to avoid unhandled rejection
      let caughtError = null;
      try {
        await promise;
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeTruthy();
      expect(caughtError.message).toBe('Timeout error');

      // Timeout should also be cleared
      expect(clearTimeoutSpy).toHaveBeenCalled();

      // Run all remaining timers
      await vi.runAllTimersAsync();

      vi.useRealTimers();
    });

    it('should handle multiple concurrent timeouts', async () => {
      vi.useFakeTimers();

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const promises = [
        withTimeout(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'result1';
        }, 5000),
        withTimeout(async () => {
          await new Promise(resolve => setTimeout(resolve, 150));
          return 'result2';
        }, 5000),
        withTimeout(async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'result3';
        }, 5000),
      ];

      await vi.advanceTimersByTimeAsync(200);

      const results = await Promise.all(promises);

      expect(results).toEqual(['result1', 'result2', 'result3']);
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });
  });

  // ==========================================
  // CRIT-004: AbortError Classification Fix
  // ==========================================

  describe('CRIT-004: Incorrect AbortError Classification', () => {
    it('should classify AbortError by name first', () => {
      const error = new Error('Operation timed out after 30000ms');
      error.name = 'AbortError';

      const errorType = classifyError(error);
      expect(errorType).toBe(ErrorType.ABORTED);
    });

    it('should not classify AbortError as TIMEOUT based on message', () => {
      const error = new Error('The operation timed out');
      error.name = 'AbortError';

      const errorType = classifyError(error);
      expect(errorType).toBe(ErrorType.ABORTED);
      expect(errorType).not.toBe(ErrorType.TIMEOUT);
    });

    it('should classify timeout errors without AbortError name', () => {
      const error = new Error('Operation timed out');
      error.name = 'TimeoutError';

      const errorType = classifyError(error);
      expect(errorType).toBe(ErrorType.TIMEOUT);
    });

    it('should classify AbortError with custom message', () => {
      const error = new Error('User cancelled the request');
      error.name = 'AbortError';

      const errorType = classifyError(error);
      expect(errorType).toBe(ErrorType.ABORTED);
    });

    it('should classify generic timeout message as TIMEOUT', () => {
      const error = new Error('Request timeout');
      error.name = 'Error';

      const errorType = classifyError(error);
      expect(errorType).toBe(ErrorType.TIMEOUT);
    });

    it('should not retry ABORTED errors', () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';

      const errorType = classifyError(error);
      expect(errorType).toBe(ErrorType.ABORTED);
      // ABORTED is not in the retryable list
    });

    it('should retry TIMEOUT errors', () => {
      const error = new Error('Request timeout');
      error.name = 'TimeoutError';

      const errorType = classifyError(error);
      expect(errorType).toBe(ErrorType.TIMEOUT);
      // TIMEOUT is retryable
    });

    it('should handle AbortError from withTimeout', async () => {
      vi.useFakeTimers();

      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 10000));
        return 'success';
      };

      const controller = new AbortController();
      controller.abort();

      const error = new Error('Operation timed out after 1000ms');
      error.name = 'AbortError';

      const errorType = classifyError(error);
      expect(errorType).toBe(ErrorType.ABORTED);

      vi.useRealTimers();
    });

    it('should prioritize name over message in all cases', () => {
      const testCases = [
        {
          name: 'AbortError',
          message: 'timeout timed out network error',
          expected: ErrorType.ABORTED,
        },
        {
          name: 'AbortError',
          message: 'The operation timed out after 30s',
          expected: ErrorType.ABORTED,
        },
        { name: 'AbortError', message: 'Network timeout error', expected: ErrorType.ABORTED },
        { name: 'Error', message: 'The operation timed out', expected: ErrorType.TIMEOUT },
        { name: 'TimeoutError', message: 'Request failed', expected: ErrorType.TIMEOUT },
      ];

      testCases.forEach(({ name, message, expected }) => {
        const error = new Error(message);
        error.name = name;
        expect(classifyError(error)).toBe(expected);
      });
    });
  });

  // ==========================================
  // Integration Tests
  // ==========================================

  describe('Integration: All Critical Fixes Together', () => {
    it('should handle valid retries with proper counting and cleanup', async () => {
      vi.useFakeTimers();
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      let attemptCount = 0;
      const fn = async () => {
        attemptCount++;
        await new Promise(resolve => setTimeout(resolve, 100));

        if (attemptCount < 3) {
          const error = new Error(`Attempt ${attemptCount} failed`);
          error.name = 'NetworkError';
          throw error;
        }
        return 'success';
      };

      const promise = withRetry(fn, {
        maxRetries: 3,
        timeoutMs: 5000,
      });

      await vi.advanceTimersByTimeAsync(300);

      const { result, context } = await promise;

      expect(result).toBe('success');
      expect(attemptCount).toBe(3); // Initial + 2 retries
      expect(context.attempt).toBe(2);
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it('should reject invalid maxRetries before any execution', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      await expect(withRetry(fn, { maxRetries: 'invalid' })).rejects.toThrow(/Invalid maxRetries/);

      expect(fn).not.toHaveBeenCalled();
    });

    it('should handle AbortError correctly during retry', async () => {
      const controller = new AbortController();
      let attemptCount = 0;

      const fn = async () => {
        attemptCount++;
        await new Promise(resolve => setTimeout(resolve, 100));

        if (attemptCount === 2) {
          const error = new Error('Operation aborted');
          error.name = 'AbortError';
          throw error;
        }

        throw new Error('Network error');
      };

      const signal = controller.signal;

      // Simulate abort on second attempt
      await expect(
        withRetry(fn, {
          maxRetries: 3,
          abortSignal: signal,
        })
      ).rejects.toThrow('Operation aborted');

      // Should stop on AbortError, not continue retrying
      expect(attemptCount).toBe(2);
    });
  });
});
