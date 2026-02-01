/**
 * Characterization Tests for RetryManager
 *
 * These tests characterize the CURRENT behavior of retry-manager.js before refactoring.
 * They serve as a safety net to detect any regressions during the modularization process.
 *
 * Coverage:
 * - All exported functions and constants
 * - Error classification
 * - Backoff calculations
 * - Retry strategies
 * - Specialized retry functions
 * - Convenience functions
 *
 * @file retry-manager.characterization.spec.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RetryManager from '../../../js/utils/retry-manager.js';
import * as RetryModule from '../../../js/utils/retry-manager.js';

describe('RetryManager Characterization Tests', () => {
  // ==========================================
  // Module Structure
  // ==========================================

  describe('Module Structure', () => {
    it('should export default RetryManager object', () => {
      expect(RetryManager).toBeDefined();
      expect(typeof RetryManager).toBe('object');
    });

    it('should export named exports', () => {
      expect(RetryModule.ErrorType).toBeDefined();
      expect(RetryModule.DEFAULT_RETRY_CONFIG).toBeDefined();
      expect(RetryModule.RetryStrategies).toBeDefined();
    });

    it('should export error classification functions', () => {
      expect(typeof RetryModule.classifyError).toBe('function');
      expect(typeof RetryModule.isRetryable).toBe('function');
    });

    it('should export delay calculation functions', () => {
      expect(typeof RetryModule.calculateExponentialBackoff).toBe('function');
      expect(typeof RetryModule.calculateLinearBackoff).toBe('function');
      expect(typeof RetryModule.calculateCustomBackoff).toBe('function');
      expect(typeof RetryModule.addJitter).toBe('function');
      expect(typeof RetryModule.calculateBackoffWithJitter).toBe('function');
      expect(typeof RetryModule.calculateBackoffForError).toBe('function');
      expect(typeof RetryModule.delay).toBe('function');
    });

    it('should export retry condition builders', () => {
      expect(typeof RetryModule.retryOnErrorTypes).toBe('function');
      expect(typeof RetryModule.retryWithMaxAttempts).toBe('function');
      expect(typeof RetryModule.retryOnStatus).toBe('function');
      expect(typeof RetryModule.retryIfAll).toBe('function');
      expect(typeof RetryModule.retryIfAny).toBe('function');
      expect(typeof RetryModule.retryNever).toBe('function');
      expect(typeof RetryModule.retryAlways).toBe('function');
    });

    it('should export core retry functions', () => {
      expect(typeof RetryModule.withRetry).toBe('function');
      expect(typeof RetryModule.retryExponential).toBe('function');
      expect(typeof RetryModule.retryLinear).toBe('function');
      expect(typeof RetryModule.retryCustom).toBe('function');
    });

    it('should export advanced pattern functions', () => {
      expect(typeof RetryModule.withRetryParallel).toBe('function');
      expect(typeof RetryModule.withFallback).toBe('function');
      expect(typeof RetryModule.withCircuitBreaker).toBe('function');
      expect(typeof RetryModule.withStrategy).toBe('function');
    });

    it('should export convenience functions', () => {
      expect(typeof RetryModule.retryStorage).toBe('function');
      expect(typeof RetryModule.retryNetwork).toBe('function');
      expect(typeof RetryModule.retryFunction).toBe('function');
      expect(typeof RetryModule.retryTransaction).toBe('function');
    });

    it('should export utilities', () => {
      expect(typeof RetryModule.withTimeout).toBe('function');
      expect(typeof RetryModule.RetryContext).toBe('function');
    });

    it('should export all functions on default object', () => {
      expect(RetryManager.classifyError).toBeDefined();
      expect(RetryManager.isRetryable).toBeDefined();
      expect(RetryManager.withRetry).toBeDefined();
      expect(RetryManager.retryExponential).toBeDefined();
      expect(RetryManager.withTimeout).toBeDefined();
      expect(RetryManager.RetryContext).toBeDefined();
    });
  });

  // ==========================================
  // Constants
  // ==========================================

  describe('Constants', () => {
    it('should define ErrorType enum', () => {
      expect(RetryModule.ErrorType.TRANSIENT).toBe('transient');
      expect(RetryModule.ErrorType.RATE_LIMIT).toBe('rate_limit');
      expect(RetryModule.ErrorType.SERVER_ERROR).toBe('server_error');
      expect(RetryModule.ErrorType.CLIENT_ERROR).toBe('client_error');
      expect(RetryModule.ErrorType.AUTHENTICATION).toBe('auth');
      expect(RetryModule.ErrorType.CIRCUIT_OPEN).toBe('circuit_open');
      expect(RetryModule.ErrorType.QUOTA_EXCEEDED).toBe('quota');
      expect(RetryModule.ErrorType.INVALID_STATE).toBe('invalid_state');
      expect(RetryModule.ErrorType.TIMEOUT).toBe('timeout');
      expect(RetryModule.ErrorType.ABORTED).toBe('aborted');
      expect(RetryModule.ErrorType.UNKNOWN).toBe('unknown');
    });

    it('should define DEFAULT_RETRY_CONFIG', () => {
      const config = RetryModule.DEFAULT_RETRY_CONFIG;
      expect(config.maxRetries).toBe(3);
      expect(config.baseDelayMs).toBe(1000);
      expect(config.maxDelayMs).toBe(30000);
      expect(config.jitterMs).toBe(200);
      expect(config.exponentialBase).toBe(2);
      expect(config.timeoutMs).toBe(30000);
    });

    it('should define RetryStrategies', () => {
      const strategies = RetryModule.RetryStrategies;
      expect(strategies.NETWORK).toBeDefined();
      expect(strategies.DATABASE).toBeDefined();
      expect(strategies.TRANSACTION).toBeDefined();
      expect(strategies.FUNCTION).toBeDefined();
      expect(strategies.PROVIDER).toBeDefined();
      expect(strategies.WORKER).toBeDefined();
      expect(strategies.LOCK).toBeDefined();
      expect(strategies.AGGRESSIVE).toBeDefined();
      expect(strategies.CONSERVATIVE).toBeDefined();
    });

    it('should have valid RetryStrategies configurations', () => {
      const strategies = RetryModule.RetryStrategies;

      Object.entries(strategies).forEach(([name, config]) => {
        expect(config.maxRetries).toBeGreaterThanOrEqual(0);
        expect(config.baseDelayMs).toBeGreaterThan(0);
        expect(config.maxDelayMs).toBeGreaterThan(0);
        expect(config.jitterMs).toBeGreaterThanOrEqual(0);
        expect(config.exponentialBase).toBeGreaterThan(0);
        expect(config.timeoutMs).toBeGreaterThan(0);
      });
    });
  });

  // ==========================================
  // Error Classification
  // ==========================================

  describe('Error Classification', () => {
    describe('classifyError', () => {
      it('should classify transient network errors', () => {
        const errors = [
          new Error('Network error'),
          new Error('ECONNREFUSED'),
          new Error('ETIMEDOUT'),
          new Error('Connection lost'),
          new Error('ENOTFOUND'),
        ];

        errors.forEach(error => {
          expect(RetryModule.classifyError(error)).toBe(RetryModule.ErrorType.TRANSIENT);
        });
      });

      it('should classify rate limit errors', () => {
        const errors = [
          new Error('429'),
          new Error('Rate limit exceeded'),
          new Error('Too many requests'),
        ];

        errors.forEach(error => {
          expect(RetryModule.classifyError(error)).toBe(RetryModule.ErrorType.RATE_LIMIT);
        });
      });

      it('should classify server errors', () => {
        const errors = [new Error('500'), new Error('502'), new Error('503'), new Error('504')];

        errors.forEach(error => {
          expect(RetryModule.classifyError(error)).toBe(RetryModule.ErrorType.SERVER_ERROR);
        });
      });

      it('should classify client errors', () => {
        const errors = [new Error('400'), new Error('404'), new Error('422')];

        errors.forEach(error => {
          expect(RetryModule.classifyError(error)).toBe(RetryModule.ErrorType.CLIENT_ERROR);
        });
      });

      it('should classify authentication errors', () => {
        const errors = [
          new Error('401'),
          new Error('403'),
          new Error('Unauthorized'),
          new Error('Forbidden'),
        ];

        errors.forEach(error => {
          expect(RetryModule.classifyError(error)).toBe(RetryModule.ErrorType.AUTHENTICATION);
        });
      });

      it('should classify AbortError by name', () => {
        const error = new Error('Some message');
        error.name = 'AbortError';

        expect(RetryModule.classifyError(error)).toBe(RetryModule.ErrorType.ABORTED);
      });

      it('should classify timeout errors', () => {
        const errors = [new Error('Timeout'), new Error('Timed out')];

        errors.forEach(error => {
          expect(RetryModule.classifyError(error)).toBe(RetryModule.ErrorType.TIMEOUT);
        });
      });

      it('should classify QuotaExceededError', () => {
        const error = new Error('Quota exceeded');
        error.name = 'QuotaExceededError';

        expect(RetryModule.classifyError(error)).toBe(RetryModule.ErrorType.QUOTA_EXCEEDED);
      });

      it('should classify InvalidStateError', () => {
        const error = new Error('Invalid state');
        error.name = 'InvalidStateError';

        expect(RetryModule.classifyError(error)).toBe(RetryModule.ErrorType.INVALID_STATE);
      });

      it('should classify circuit open errors', () => {
        const error = new Error('Circuit breaker is open');

        expect(RetryModule.classifyError(error)).toBe(RetryModule.ErrorType.CIRCUIT_OPEN);
      });

      it('should classify unknown errors as TRANSIENT by default', () => {
        const error = new Error('Unknown error');

        expect(RetryModule.classifyError(error)).toBe(RetryModule.ErrorType.TRANSIENT);
      });

      it('should handle null/undefined error', () => {
        expect(RetryModule.classifyError(null)).toBe(RetryModule.ErrorType.UNKNOWN);
        expect(RetryModule.classifyError(undefined)).toBe(RetryModule.ErrorType.UNKNOWN);
      });
    });

    describe('isRetryable', () => {
      it('should return true for retryable errors', () => {
        const retryableErrors = [
          new Error('Network error'),
          new Error('429'),
          new Error('500'),
          new Error('Timeout'),
        ];

        retryableErrors.forEach(error => {
          expect(RetryModule.isRetryable(error)).toBe(true);
        });
      });

      it('should return false for non-retryable errors', () => {
        const nonRetryableErrors = [new Error('400'), new Error('401'), new Error('404')];

        nonRetryableErrors.forEach(error => {
          expect(RetryModule.isRetryable(error)).toBe(false);
        });
      });

      it('should return false for AbortError', () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';

        expect(RetryModule.isRetryable(error)).toBe(false);
      });
    });
  });

  // ==========================================
  // Delay Calculation
  // ==========================================

  describe('Delay Calculation', () => {
    describe('calculateExponentialBackoff', () => {
      it('should calculate exponential backoff correctly', () => {
        const config = { baseDelayMs: 1000, maxDelayMs: 10000, exponentialBase: 2 };

        expect(RetryModule.calculateExponentialBackoff(0, config)).toBe(1000);
        expect(RetryModule.calculateExponentialBackoff(1, config)).toBe(2000);
        expect(RetryModule.calculateExponentialBackoff(2, config)).toBe(4000);
        expect(RetryModule.calculateExponentialBackoff(3, config)).toBe(8000);
      });

      it('should cap at maxDelayMs', () => {
        const config = { baseDelayMs: 1000, maxDelayMs: 3000, exponentialBase: 2 };

        expect(RetryModule.calculateExponentialBackoff(5, config)).toBe(3000);
      });

      it('should use DEFAULT_RETRY_CONFIG when no config provided', () => {
        const delay = RetryModule.calculateExponentialBackoff(2);
        expect(delay).toBeGreaterThan(0);
      });
    });

    describe('calculateLinearBackoff', () => {
      it('should calculate linear backoff correctly', () => {
        const config = { baseDelayMs: 1000, maxDelayMs: 10000 };

        expect(RetryModule.calculateLinearBackoff(0, config)).toBe(1000);
        expect(RetryModule.calculateLinearBackoff(1, config)).toBe(2000);
        expect(RetryModule.calculateLinearBackoff(2, config)).toBe(3000);
      });

      it('should cap at maxDelayMs', () => {
        const config = { baseDelayMs: 1000, maxDelayMs: 2000 };

        expect(RetryModule.calculateLinearBackoff(5, config)).toBe(2000);
      });
    });

    describe('calculateCustomBackoff', () => {
      it('should use custom backoff function', () => {
        const backoffFn = attempt => attempt * 500;
        const config = { maxDelayMs: 10000 };

        expect(RetryModule.calculateCustomBackoff(2, backoffFn, config)).toBe(1000);
        expect(RetryModule.calculateCustomBackoff(5, backoffFn, config)).toBe(2500);
      });

      it('should cap custom backoff at maxDelayMs', () => {
        const backoffFn = attempt => attempt * 5000;
        const config = { maxDelayMs: 2000 };

        expect(RetryModule.calculateCustomBackoff(10, backoffFn, config)).toBe(2000);
      });
    });

    describe('addJitter', () => {
      it('should add random jitter to delay', () => {
        const config = { jitterMs: 100 };
        const baseDelay = 1000;

        const delayWithJitter = RetryModule.addJitter(baseDelay, config);

        expect(delayWithJitter).toBeGreaterThanOrEqual(baseDelay);
        expect(delayWithJitter).toBeLessThan(baseDelay + config.jitterMs);
      });

      it('should floor the result', () => {
        const config = { jitterMs: 50 };
        const baseDelay = 1000;

        const delayWithJitter = RetryModule.addJitter(baseDelay, config);

        expect(Number.isInteger(delayWithJitter)).toBe(true);
      });
    });

    describe('calculateBackoffWithJitter', () => {
      it('should combine exponential backoff with jitter', () => {
        const config = {
          baseDelayMs: 1000,
          maxDelayMs: 10000,
          exponentialBase: 2,
          jitterMs: 100,
        };

        const delay = RetryModule.calculateBackoffWithJitter(2, config);

        expect(delay).toBeGreaterThanOrEqual(4000); // 1000 * 2^2
        expect(delay).toBeLessThan(4100); // + jitter
      });
    });

    describe('calculateBackoffForError', () => {
      it('should use longer delays for rate limit errors', () => {
        const config = { baseDelayMs: 1000, maxDelayMs: 30000, jitterMs: 200 };
        const error = new Error('429');

        const delay = RetryModule.calculateBackoffForError(0, error, config);

        expect(delay).toBeGreaterThanOrEqual(5000); // Minimum 5s for rate limits
      });

      it('should use standard backoff for other errors', () => {
        const config = {
          baseDelayMs: 1000,
          maxDelayMs: 30000,
          jitterMs: 200,
          exponentialBase: 2,
        };
        const error = new Error('Network error');

        const delay = RetryModule.calculateBackoffForError(1, error, config);

        // With jitter, delay should be between baseDelay and baseDelay + jitter
        // calculateBackoffForError(1) = exponential(1) = 2000, then + jitter
        expect(delay).toBeGreaterThanOrEqual(2000);
        expect(delay).toBeLessThan(2200);
      });
    });

    describe('delay', () => {
      it('should resolve after specified milliseconds', async () => {
        const start = Date.now();
        await RetryModule.delay(100);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(100);
        expect(elapsed).toBeLessThan(150); // Allow some margin
      });
    });
  });

  // ==========================================
  // Retry Condition Builders
  // ==========================================

  describe('Retry Condition Builders', () => {
    describe('retryOnErrorTypes', () => {
      it('should create predicate for specific error types', () => {
        const predicate = RetryModule.retryOnErrorTypes(
          RetryModule.ErrorType.TRANSIENT,
          RetryModule.ErrorType.TIMEOUT
        );

        expect(predicate(new Error('Network error'), 0)).toBe(true);
        expect(predicate(new Error('Timeout'), 0)).toBe(true);
        expect(predicate(new Error('401'), 0)).toBe(false);
      });
    });

    describe('retryWithMaxAttempts', () => {
      it('should create predicate with max attempts', () => {
        const predicate = RetryModule.retryWithMaxAttempts(3);

        expect(predicate(new Error('Error'), 0)).toBe(true);
        expect(predicate(new Error('Error'), 1)).toBe(true);
        expect(predicate(new Error('Error'), 2)).toBe(true);
        expect(predicate(new Error('Error'), 3)).toBe(false);
      });
    });

    describe('retryOnStatus', () => {
      it('should create predicate for HTTP status codes', () => {
        const predicate = RetryModule.retryOnStatus(500, 503);

        const error1 = new Error('Request failed with status 500');
        const error2 = new Error('Request failed with status 503');
        const error3 = new Error('Request failed with status 404');

        expect(predicate(error1, 0)).toBe(true);
        expect(predicate(error2, 0)).toBe(true);
        expect(predicate(error3, 0)).toBe(false);
      });
    });

    describe('retryIfAll', () => {
      it('should combine predicates with AND logic', () => {
        const pred1 = () => true;
        const pred2 = () => true;
        const pred3 = () => false;

        const allTrue = RetryModule.retryIfAll(pred1, pred2);
        const withFalse = RetryModule.retryIfAll(pred1, pred3);

        expect(allTrue(null, 0)).toBe(true);
        expect(withFalse(null, 0)).toBe(false);
      });
    });

    describe('retryIfAny', () => {
      it('should combine predicates with OR logic', () => {
        const pred1 = () => false;
        const pred2 = () => true;
        const pred3 = () => false;

        const predicate = RetryModule.retryIfAny(pred1, pred2, pred3);

        expect(predicate(null, 0)).toBe(true);
      });
    });

    describe('retryNever', () => {
      it('should create predicate that never retries', () => {
        const predicate = RetryModule.retryNever();

        expect(predicate(new Error('Error'), 0)).toBe(false);
        expect(predicate(new Error('Error'), 10)).toBe(false);
      });
    });

    describe('retryAlways', () => {
      it('should create predicate that always retries', () => {
        const predicate = RetryModule.retryAlways();

        expect(predicate(new Error('Error'), 0)).toBe(true);
        expect(predicate(new Error('Error'), 10)).toBe(true);
      });
    });
  });

  // ==========================================
  // RetryContext
  // ==========================================

  describe('RetryContext', () => {
    it('should initialize with defaults', () => {
      const context = new RetryModule.RetryContext();

      expect(context.attempt).toBe(0);
      expect(context.maxRetries).toBe(3);
      expect(context.lastError).toBeNull();
      expect(context.delays).toEqual([]);
      expect(context.errors).toEqual([]);
    });

    it('should accept custom config', () => {
      const config = { maxRetries: 5, baseDelayMs: 2000 };
      const context = new RetryModule.RetryContext(5, config);

      expect(context.maxRetries).toBe(5);
      expect(context.config).toBe(config);
    });

    it('should calculate shouldRetry correctly', () => {
      const context = new RetryModule.RetryContext(3);
      const error = new Error('Test error');

      expect(context.shouldRetry).toBe(false); // No error yet

      context.recordAttempt(error);
      expect(context.shouldRetry).toBe(true); // 1 < 3

      context.recordAttempt(error);
      expect(context.shouldRetry).toBe(true); // 2 < 3

      context.recordAttempt(error);
      expect(context.shouldRetry).toBe(false); // 3 < 3 is false
    });

    it('should calculate elapsedTime', () => {
      const context = new RetryModule.RetryContext();

      const elapsed = context.elapsedTime;
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });

    it('should calculate nextAttemptNumber', () => {
      const context = new RetryModule.RetryContext();

      expect(context.nextAttemptNumber).toBe(1);

      context.recordAttempt(new Error('Error'));
      expect(context.nextAttemptNumber).toBe(2);
    });

    it('should calculate totalDelayTime', () => {
      const context = new RetryModule.RetryContext();
      const error = new Error('Test error');

      context.recordAttempt(error);
      context.recordAttempt(error);

      const totalDelay = context.totalDelayTime;
      expect(totalDelay).toBeGreaterThan(0);
    });

    it('should generate summary', () => {
      const context = new RetryModule.RetryContext(3);
      const error = new Error('Test error');

      context.recordAttempt(error);
      context.recordAttempt(error);

      const summary = context.getSummary();

      expect(summary.attempts).toBe(2);
      expect(summary.maxRetries).toBe(3);
      expect(summary.succeeded).toBe(false);
      expect(summary.elapsedTime).toBeGreaterThanOrEqual(0);
      expect(summary.delays).toHaveLength(2);
      expect(summary.errors).toHaveLength(2);
    });
  });

  // ==========================================
  // Core Retry Functions
  // ==========================================

  describe('Core Retry Functions', () => {
    describe('withRetry', () => {
      it('should execute function successfully without retry', async () => {
        const fn = vi.fn().mockResolvedValue('success');

        const { result, context } = await RetryModule.withRetry(fn);

        expect(result).toBe('success');
        expect(context.attempt).toBe(0);
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should retry on retryable errors', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValue('success');

        const { result, context } = await RetryModule.withRetry(fn, { maxRetries: 3 });

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should stop retrying after maxRetries', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('Network error'));

        await expect(RetryModule.withRetry(fn, { maxRetries: 2 })).rejects.toThrow('Network error');

        expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
      });

      it('should not retry non-retryable errors', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('401'));

        await expect(RetryModule.withRetry(fn, { maxRetries: 3 })).rejects.toThrow('401');

        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should call onRetry callback', async () => {
        const fn = vi.fn().mockRejectedValueOnce(new Error('Error')).mockResolvedValue('success');

        const onRetry = vi.fn();

        await RetryModule.withRetry(fn, { maxRetries: 3, onRetry });

        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onRetry).toHaveBeenCalledWith(
          expect.any(Error),
          1, // attempt number
          expect.any(Number), // delay
          expect.any(Object) // context
        );
      });

      it('should call onSuccess callback', async () => {
        const fn = vi.fn().mockResolvedValue('success');
        const onSuccess = vi.fn();

        await RetryModule.withRetry(fn, { onSuccess });

        expect(onSuccess).toHaveBeenCalledWith('success', expect.any(Object));
      });

      it('should call onFailure callback', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('Error'));
        const onFailure = vi.fn();

        try {
          await RetryModule.withRetry(fn, { maxRetries: 1, onFailure });
        } catch (e) {
          // Expected
        }

        expect(onFailure).toHaveBeenCalledWith(expect.any(Error), expect.any(Object));
      });

      it('should respect abortSignal', async () => {
        const controller = new AbortController();
        const fn = vi.fn().mockResolvedValue('success');

        controller.abort();

        await expect(RetryModule.withRetry(fn, { abortSignal: controller.signal })).rejects.toThrow(
          'Operation aborted'
        );
      });

      it('should apply timeout to each attempt', async () => {
        let attemptCount = 0;
        const fn = vi.fn().mockImplementation(async () => {
          attemptCount++;
          // Create a promise that never resolves
          return new Promise(() => {});
        });

        const promise = RetryModule.withRetry(fn, {
          maxRetries: 1,
          timeoutMs: 100,
        });

        await expect(promise).rejects.toThrow('timed out');
        // Timeout errors are retryable, so it should retry once
        expect(attemptCount).toBe(2); // Initial + 1 retry (timeout is retryable)
      }, 15000);
    });

    describe('retryExponential', () => {
      it('should retry with exponential backoff', async () => {
        vi.useFakeTimers();

        const fn = vi.fn().mockRejectedValueOnce(new Error('Error')).mockResolvedValue('success');

        const promise = RetryModule.retryExponential(fn, { maxRetries: 2 });
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);

        vi.useRealTimers();
      });
    });

    describe('retryLinear', () => {
      it('should retry with linear backoff', async () => {
        vi.useFakeTimers();

        const fn = vi.fn().mockRejectedValueOnce(new Error('Error')).mockResolvedValue('success');

        const promise = RetryModule.retryLinear(fn, { maxRetries: 2 });
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);

        vi.useRealTimers();
      });
    });

    describe('retryCustom', () => {
      it('should retry with custom backoff', async () => {
        vi.useFakeTimers();

        const backoffFn = vi.fn(attempt => attempt * 100);
        const fn = vi.fn().mockRejectedValueOnce(new Error('Error')).mockResolvedValue('success');

        const promise = RetryModule.retryCustom(fn, backoffFn, { maxRetries: 2 });
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
        expect(backoffFn).toHaveBeenCalled();

        vi.useRealTimers();
      });
    });
  });

  // ==========================================
  // Advanced Patterns
  // ==========================================

  describe('Advanced Patterns', () => {
    describe('withRetryParallel', () => {
      it('should execute multiple functions in parallel with retry', async () => {
        const fn1 = vi.fn().mockResolvedValue('result1');
        const fn2 = vi.fn().mockResolvedValue('result2');
        const fn3 = vi.fn().mockResolvedValue('result3');

        const results = await RetryModule.withRetryParallel([fn1, fn2, fn3], { maxRetries: 2 });

        expect(results).toHaveLength(3);
        expect(results[0].result).toBe('result1');
        expect(results[1].result).toBe('result2');
        expect(results[2].result).toBe('result3');
      });
    });

    describe('withFallback', () => {
      it('should try functions in sequence', async () => {
        const fn1 = vi.fn().mockRejectedValue(new Error('Failed'));
        const fn2 = vi.fn().mockResolvedValue('success');

        const { result, fnIndex, errors } = await RetryModule.withFallback([fn1, fn2]);

        expect(result).toBe('success');
        expect(fnIndex).toBe(1);
        expect(errors).toHaveLength(1);
      });

      it('should throw when all functions fail', async () => {
        const fn1 = vi.fn().mockRejectedValue(new Error('Failed 1'));
        const fn2 = vi.fn().mockRejectedValue(new Error('Failed 2'));

        await expect(RetryModule.withFallback([fn1, fn2])).rejects.toThrow(
          'All fallbacks exhausted'
        );
      });

      it('should call onFallback callback', async () => {
        const fn1 = vi.fn().mockRejectedValue(new Error('Failed'));
        const fn2 = vi.fn().mockResolvedValue('success');
        const onFallback = vi.fn();

        await RetryModule.withFallback([fn1, fn2], { onFallback });

        expect(onFallback).toHaveBeenCalledWith(expect.any(Error), 0);
      });
    });

    describe('withStrategy', () => {
      it('should execute with predefined strategy', async () => {
        const fn = vi.fn().mockResolvedValue('success');

        const result = await RetryModule.withStrategy(fn, 'NETWORK');

        expect(result).toBe('success');
      });

      it('should throw for unknown strategy', async () => {
        const fn = vi.fn().mockResolvedValue('success');

        await expect(RetryModule.withStrategy(fn, 'UNKNOWN')).rejects.toThrow(
          'Unknown retry strategy'
        );
      });
    });

    describe('withCircuitBreaker', () => {
      it('should check circuit before executing', async () => {
        const checkCircuit = vi.fn().mockReturnValue({ allowed: true });
        const fn = vi.fn().mockResolvedValue('success');

        const { result } = await RetryModule.withCircuitBreaker(checkCircuit, fn);

        expect(result).toBe('success');
        expect(checkCircuit).toHaveBeenCalled();
      });

      it('should throw when circuit is open', async () => {
        const checkCircuit = vi.fn().mockReturnValue({
          allowed: false,
          reason: 'Circuit breaker is open',
          state: 'open',
        });
        const fn = vi.fn().mockResolvedValue('success');

        await expect(RetryModule.withCircuitBreaker(checkCircuit, fn)).rejects.toThrow(
          'Circuit breaker is open'
        );

        expect(fn).not.toHaveBeenCalled();
      });
    });
  });

  // ==========================================
  // Convenience Functions
  // ==========================================

  describe('Convenience Functions', () => {
    it('retryStorage should use DATABASE strategy', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await RetryModule.retryStorage(fn);

      expect(result).toBe('success');
    });

    it('retryNetwork should use NETWORK strategy', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await RetryModule.retryNetwork(fn);

      expect(result).toBe('success');
    });

    it('retryFunction should use FUNCTION strategy', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await RetryModule.retryFunction(fn);

      expect(result).toBe('success');
    });

    it('retryTransaction should use TRANSACTION strategy', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await RetryModule.retryTransaction(fn);

      expect(result).toBe('success');
    });
  });

  // ==========================================
  // Utilities
  // ==========================================

  describe('Utilities', () => {
    describe('withTimeout', () => {
      it('should resolve when function completes before timeout', async () => {
        vi.useFakeTimers();

        const fn = vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'success';
        });

        const promise = RetryModule.withTimeout(fn, 1000);
        await vi.advanceTimersByTimeAsync(100);

        const result = await promise;
        expect(result).toBe('success');

        await vi.runAllTimersAsync();
        vi.useRealTimers();
      });

      it('should timeout when function takes too long', async () => {
        vi.useFakeTimers();

        const fn = vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 10000));
          return 'success';
        });

        const promise = RetryModule.withTimeout(fn, 1000);
        await vi.advanceTimersByTimeAsync(1000);

        await expect(promise).rejects.toThrow('timed out');

        await vi.runAllTimersAsync();
        vi.useRealTimers();
      });

      it('should use custom timeout message', async () => {
        vi.useFakeTimers();

        const fn = vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 10000));
          return 'success';
        });

        const promise = RetryModule.withTimeout(fn, 1000, 'Custom timeout message');
        await vi.advanceTimersByTimeAsync(1000);

        await expect(promise).rejects.toThrow('Custom timeout message');

        await vi.runAllTimersAsync();
        vi.useRealTimers();
      });
    });
  });

  // ==========================================
  // Backward Compatibility
  // ==========================================

  describe('Backward Compatibility', () => {
    it('should support both default and named exports', () => {
      expect(RetryManager.withRetry).toBe(RetryModule.withRetry);
      expect(RetryManager.ErrorType).toBe(RetryModule.ErrorType);
    });

    it('should allow destructuring from default export', () => {
      const { withRetry, classifyError, ErrorType } = RetryManager;

      expect(withRetry).toBeDefined();
      expect(classifyError).toBeDefined();
      expect(ErrorType).toBeDefined();
    });

    it('should allow importing all functions from named exports', () => {
      const funcs = [
        'withRetry',
        'retryExponential',
        'retryLinear',
        'retryCustom',
        'withRetryParallel',
        'withFallback',
        'withCircuitBreaker',
        'withStrategy',
        'retryStorage',
        'retryNetwork',
        'retryFunction',
        'retryTransaction',
      ];

      funcs.forEach(funcName => {
        expect(RetryManager[funcName]).toBeDefined();
        expect(typeof RetryManager[funcName]).toBe('function');
      });
    });
  });
});
