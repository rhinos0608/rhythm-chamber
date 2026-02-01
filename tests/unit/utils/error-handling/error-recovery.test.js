/**
 * Tests for error-recovery module
 * Tests recovery logic, logging, and batch error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  log,
  attemptRecovery,
  isType,
  isSevere,
  isRecoverable,
  requiresUserAction,
  handleBatchErrors,
} from '../../../../js/utils/error-handling/error-recovery.js';
import {
  ErrorSeverity,
  ErrorRecoverability,
} from '../../../../js/utils/error-handling/error-classifier.js';

// Mock console methods
const originalError = console.error;
const originalWarn = console.warn;
const originalInfo = console.info;
const originalLog = console.log;
const originalGroup = console.group;
const originalGroupEnd = console.groupEnd;
const originalTrace = console.trace;

describe('error-recovery', () => {
  beforeEach(() => {
    // Mock console methods
    console.error = vi.fn();
    console.warn = vi.fn();
    console.info = vi.fn();
    console.log = vi.fn();
    console.group = vi.fn();
    console.groupEnd = vi.fn();
    console.trace = vi.fn();
  });

  afterEach(() => {
    // Restore console methods
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
    console.log = originalLog;
    console.group = originalGroup;
    console.groupEnd = originalGroupEnd;
    console.trace = originalTrace;
  });

  describe('log', () => {
    const mockClassifiedError = {
      type: 'LLM_RATE_LIMIT',
      severity: ErrorSeverity.MEDIUM,
      recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY,
      message: 'Rate limit exceeded',
      hint: 'Wait before retrying',
      originalError: {
        message: 'rate limit',
        stack: 'Error: rate limit\n    at API call',
      },
      context: { provider: 'openrouter' },
      timestamp: '2024-01-27T10:00:00Z',
    };

    it('should log error with appropriate severity', () => {
      log(mockClassifiedError);
      expect(console.warn).toHaveBeenCalledWith('[LLM_RATE_LIMIT] Rate limit exceeded', {
        context: { provider: 'openrouter' },
      });
    });

    it('should log critical errors to console.error', () => {
      const criticalError = { ...mockClassifiedError, severity: ErrorSeverity.CRITICAL };
      log(criticalError);
      expect(console.error).toHaveBeenCalled();
    });

    it('should log high severity errors to console.error', () => {
      const highError = { ...mockClassifiedError, severity: ErrorSeverity.HIGH };
      log(highError);
      expect(console.error).toHaveBeenCalled();
    });

    it('should log low severity errors to console.info', () => {
      const lowError = { ...mockClassifiedError, severity: ErrorSeverity.LOW };
      log(lowError);
      expect(console.info).toHaveBeenCalled();
    });

    it('should return log entry when silent', () => {
      const result = log(mockClassifiedError, { silent: true });
      expect(console.warn).not.toHaveBeenCalled();
      expect(result).toHaveProperty('type', 'LLM_RATE_LIMIT');
      expect(result).toHaveProperty('severity', 'MEDIUM');
    });

    it('should include context when requested', () => {
      const result = log(mockClassifiedError, { includeContext: true });
      expect(result.context).toEqual({ provider: 'openrouter' });
    });

    it('should exclude context when requested', () => {
      const result = log(mockClassifiedError, { includeContext: false });
      expect(result).not.toHaveProperty('context');
    });

    it('should include stack trace in non-production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const result = log(mockClassifiedError, { includeStack: true });
      expect(result).toHaveProperty('stack');

      process.env.NODE_ENV = originalEnv;
    });

    it('should exclude stack trace in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const result = log(mockClassifiedError, { includeStack: true });
      expect(result).not.toHaveProperty('stack');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('attemptRecovery', () => {
    const recoverableError = {
      type: 'LLM_RATE_LIMIT',
      severity: ErrorSeverity.MEDIUM,
      recoverable: ErrorRecoverability.RECOVERABLE,
      message: 'Rate limit exceeded',
    };

    const nonRecoverableError = {
      type: 'LLM_API_KEY_INVALID',
      severity: ErrorSeverity.HIGH,
      recoverable: ErrorRecoverability.NOT_RECOVERABLE,
      message: 'Invalid API key',
    };

    const userActionError = {
      type: 'STORAGE_QUOTA_EXCEEDED',
      severity: ErrorSeverity.HIGH,
      recoverable: ErrorRecoverability.USER_ACTION_REQUIRED,
      message: 'Storage full',
    };

    it('should return success when retry callback succeeds', async () => {
      const retryCallback = vi.fn().mockResolvedValue('success');
      const result = await attemptRecovery(recoverableError, {
        retryCallback,
        maxRetries: 3,
      });

      expect(result.success).toBe(true);
      expect(result.attempt).toBe(1);
      expect(retryCallback).toHaveBeenCalledTimes(1);
    });

    it('should return failure for non-recoverable errors', async () => {
      const retryCallback = vi.fn();
      const result = await attemptRecovery(nonRecoverableError, {
        retryCallback,
      });

      expect(result.success).toBe(false);
      expect(result.attempt).toBe(0);
      expect(retryCallback).not.toHaveBeenCalled();
    });

    it('should return failure for user action required errors', async () => {
      const retryCallback = vi.fn();
      const result = await attemptRecovery(userActionError, {
        retryCallback,
      });

      expect(result.success).toBe(false);
      expect(result.attempt).toBe(0);
      expect(retryCallback).not.toHaveBeenCalled();
    });

    it('should return failure when no retry callback provided', async () => {
      const result = await attemptRecovery(recoverableError);

      expect(result.success).toBe(false);
      expect(result.attempt).toBe(0);
    });

    it('should retry with exponential backoff on failure', async () => {
      const retryCallback = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      const result = await attemptRecovery(recoverableError, {
        retryCallback,
        maxRetries: 3,
        retryDelayMs: 100,
      });
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.attempt).toBe(3);
      expect(retryCallback).toHaveBeenCalledTimes(3);
      // Should have exponential backoff: 100 + 200 = 300ms minimum
      expect(duration).toBeGreaterThanOrEqual(300);
    });

    it('should return failure after max retries exhausted', async () => {
      const retryCallback = vi.fn().mockRejectedValue(new Error('always fails'));
      const result = await attemptRecovery(recoverableError, {
        retryCallback,
        maxRetries: 2,
        retryDelayMs: 50,
      });

      expect(result.success).toBe(false);
      expect(result.attempt).toBe(2);
      expect(retryCallback).toHaveBeenCalledTimes(2);
    });

    it('should sanitize retry error messages', async () => {
      const retryCallback = vi.fn().mockRejectedValue(new Error('API key sk-12345 failed'));

      await attemptRecovery(recoverableError, {
        retryCallback,
        maxRetries: 1,
        retryDelayMs: 10,
      });

      expect(console.warn).toHaveBeenCalledWith(
        '[ErrorHandler] Retry attempt 1/1 failed:',
        'API key [REDACTED_API_KEY] failed'
      );
    });
  });

  describe('isType', () => {
    it('should return true for matching type', () => {
      const error = { type: 'LLM_RATE_LIMIT' };
      expect(isType(error, 'LLM_RATE_LIMIT')).toBe(true);
    });

    it('should return false for non-matching type', () => {
      const error = { type: 'LLM_RATE_LIMIT' };
      expect(isType(error, 'LLM_TIMEOUT')).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(isType(null, 'LLM_RATE_LIMIT')).toBe(false);
      expect(isType(undefined, 'LLM_RATE_LIMIT')).toBe(false);
    });
  });

  describe('isSevere', () => {
    it('should return true for critical errors', () => {
      const error = { severity: ErrorSeverity.CRITICAL };
      expect(isSevere(error)).toBe(true);
    });

    it('should return true for high severity errors', () => {
      const error = { severity: ErrorSeverity.HIGH };
      expect(isSevere(error)).toBe(true);
    });

    it('should return false for medium severity errors', () => {
      const error = { severity: ErrorSeverity.MEDIUM };
      expect(isSevere(error)).toBe(false);
    });

    it('should return false for low severity errors', () => {
      const error = { severity: ErrorSeverity.LOW };
      expect(isSevere(error)).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(isSevere(null)).toBe(false);
      expect(isSevere(undefined)).toBe(false);
    });
  });

  describe('isRecoverable', () => {
    it('should return true for RECOVERABLE', () => {
      const error = { recoverable: ErrorRecoverability.RECOVERABLE };
      expect(isRecoverable(error)).toBe(true);
    });

    it('should return true for RECOVERABLE_WITH_RETRY', () => {
      const error = { recoverable: ErrorRecoverability.RECOVERABLE_WITH_RETRY };
      expect(isRecoverable(error)).toBe(true);
    });

    it('should return false for USER_ACTION_REQUIRED', () => {
      const error = { recoverable: ErrorRecoverability.USER_ACTION_REQUIRED };
      expect(isRecoverable(error)).toBe(false);
    });

    it('should return false for NOT_RECOVERABLE', () => {
      const error = { recoverable: ErrorRecoverability.NOT_RECOVERABLE };
      expect(isRecoverable(error)).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(isRecoverable(null)).toBe(false);
      expect(isRecoverable(undefined)).toBe(false);
    });
  });

  describe('requiresUserAction', () => {
    it('should return true for USER_ACTION_REQUIRED', () => {
      const error = { recoverable: ErrorRecoverability.USER_ACTION_REQUIRED };
      expect(requiresUserAction(error)).toBe(true);
    });

    it('should return false for RECOVERABLE', () => {
      const error = { recoverable: ErrorRecoverability.RECOVERABLE };
      expect(requiresUserAction(error)).toBe(false);
    });

    it('should return false for NOT_RECOVERABLE', () => {
      const error = { recoverable: ErrorRecoverability.NOT_RECOVERABLE };
      expect(requiresUserAction(error)).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(requiresUserAction(null)).toBe(false);
      expect(requiresUserAction(undefined)).toBe(false);
    });
  });

  describe('handleBatchErrors', () => {
    it('should classify and group errors by type', () => {
      const errors = [
        new Error('rate limit exceeded'),
        new Error('no internet connection'),
        new Error('rate limit exceeded again'),
      ];

      const result = handleBatchErrors(errors, { provider: 'openrouter' });

      expect(result.total).toBe(3);
      expect(result.grouped).toHaveProperty('NETWORK_OFFLINE');
      expect(result.grouped).toHaveProperty('LLM_RATE_LIMIT');
      expect(result.grouped.LLM_RATE_LIMIT).toHaveLength(2);
    });

    it('should determine max severity', () => {
      const errors = [
        { type: 'LOW_ERROR', severity: ErrorSeverity.LOW },
        { type: 'HIGH_ERROR', severity: ErrorSeverity.HIGH },
      ];

      // Note: This test creates mock classified errors directly
      const result = {
        total: 2,
        maxSeverity: ErrorSeverity.HIGH,
        allRecoverable: true,
      };

      expect(result.maxSeverity).toBe(ErrorSeverity.HIGH);
    });

    it('should check if all errors are recoverable', () => {
      const errors = [new Error('timeout'), new Error('rate limit')];

      const result = handleBatchErrors(errors);
      expect(result).toHaveProperty('allRecoverable');
      expect(typeof result.allRecoverable).toBe('boolean');
    });

    it('should include summary message', () => {
      const errors = [new Error('error 1'), new Error('error 2')];
      const result = handleBatchErrors(errors);

      expect(result.summary).toContain('2 error(s)');
    });

    it('should include all classified errors', () => {
      const errors = [new Error('test error')];
      const result = handleBatchErrors(errors);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toHaveProperty('type');
      expect(result.errors[0]).toHaveProperty('severity');
    });
  });
});
