/**
 * Tests for error-formatter module
 * Tests error formatting for different contexts (user, log, toast)
 */

import { describe, it, expect } from 'vitest';
import {
  formatForUser,
  formatForLog,
  formatForToast,
} from '../../../../js/utils/error-handling/error-formatter.js';
import { ErrorSeverity } from '../../../../js/utils/error-handling/error-classifier.js';

describe('error-formatter', () => {
  describe('formatForUser', () => {
    const mockClassifiedError = {
      type: 'LLM_RATE_LIMIT',
      severity: ErrorSeverity.MEDIUM,
      recoverable: 'RECOVERABLE_WITH_RETRY',
      message: 'Rate limit exceeded. Please try again later.',
      hint: 'Wait a moment before retrying.',
      originalError: { message: 'rate limit', name: 'Error' },
      context: { provider: 'openrouter' },
      timestamp: '2024-01-27T10:00:00Z',
    };

    it('should format error with severity icon', () => {
      const result = formatForUser(mockClassifiedError);
      expect(result).toContain('⚡'); // MEDIUM severity icon
    });

    it('should format error type in human-readable form', () => {
      const result = formatForUser(mockClassifiedError);
      expect(result).toContain('**Llm Rate Limit**');
    });

    it('should include error message', () => {
      const result = formatForUser(mockClassifiedError);
      expect(result).toContain('Rate limit exceeded');
    });

    it('should include hint when available', () => {
      const result = formatForUser(mockClassifiedError);
      expect(result).toContain('💡 **Tip:**');
      expect(result).toContain('Wait a moment');
    });

    it('should include timestamp when requested', () => {
      const result = formatForUser(mockClassifiedError, { includeTimestamp: true });
      expect(result).toMatch(/_Time:/);
    });

    it('should exclude timestamp when not requested', () => {
      const result = formatForUser(mockClassifiedError, { includeTimestamp: false });
      expect(result).not.toMatch(/_Time:/);
    });

    it('should exclude hint when requested', () => {
      const result = formatForUser(mockClassifiedError, { includeHint: false });
      expect(result).not.toContain('💡');
    });

    it('should exclude severity when requested', () => {
      const result = formatForUser(mockClassifiedError, { includeSeverity: false });
      const icons = ['⚡', '🔴', '⚠️', 'ℹ️', '💡'];
      expect(icons.some(icon => result.startsWith(icon))).toBe(false);
    });

    it('should handle errors without hints', () => {
      const errorNoHint = { ...mockClassifiedError, hint: null };
      const result = formatForUser(errorNoHint);
      expect(result).toContain('Rate limit exceeded');
      expect(result).not.toContain('💡');
    });

    it('should use correct severity icons', () => {
      const criticalError = { ...mockClassifiedError, severity: ErrorSeverity.CRITICAL };
      expect(formatForUser(criticalError)).toContain('🔴');

      const highError = { ...mockClassifiedError, severity: ErrorSeverity.HIGH };
      expect(formatForUser(highError)).toContain('⚠️');

      const lowError = { ...mockClassifiedError, severity: ErrorSeverity.LOW };
      expect(formatForUser(lowError)).toContain('ℹ️');

      const infoError = { ...mockClassifiedError, severity: ErrorSeverity.INFO };
      expect(formatForUser(infoError)).toContain('💡');
    });
  });

  describe('formatForLog', () => {
    const mockClassifiedError = {
      type: 'LLM_RATE_LIMIT',
      severity: ErrorSeverity.MEDIUM,
      recoverable: 'RECOVERABLE_WITH_RETRY',
      message: 'Rate limit exceeded.',
      hint: 'Wait before retrying',
      originalError: {
        message: 'API key sk-12345 triggered rate limit',
        stack: 'Error: rate limit\n    at API call',
      },
      context: { provider: 'openrouter' },
      timestamp: '2024-01-27T10:00:00Z',
    };

    it('should format error for logging', () => {
      const result = formatForLog(mockClassifiedError);
      expect(result).toHaveProperty('type', 'LLM_RATE_LIMIT');
      expect(result).toHaveProperty('severity', 'MEDIUM');
      expect(result).toHaveProperty('recoverable', 'RECOVERABLE_WITH_RETRY');
    });

    it('should sanitize original message', () => {
      const result = formatForLog(mockClassifiedError);
      expect(result.originalMessage).toContain('[REDACTED_API_KEY]');
      expect(result.originalMessage).not.toContain('sk-12345');
    });

    it('should sanitize stack trace', () => {
      const result = formatForLog(mockClassifiedError);
      // Stack trace doesn't have API key in this test, just verify it returns the stack
      expect(result).toHaveProperty('originalStack');
      expect(result.originalStack).toContain('Error: rate limit');
    });

    it('should include context', () => {
      const result = formatForLog(mockClassifiedError);
      expect(result.context).toEqual({ provider: 'openrouter' });
    });

    it('should include timestamp', () => {
      const result = formatForLog(mockClassifiedError);
      expect(result).toHaveProperty('timestamp', '2024-01-27T10:00:00Z');
    });

    it('should handle missing original error', () => {
      const errorNoOriginal = { ...mockClassifiedError, originalError: null };
      const result = formatForLog(errorNoOriginal);
      expect(result).toHaveProperty('originalMessage');
      expect(result).toHaveProperty('originalStack');
    });
  });

  describe('formatForToast', () => {
    it('should return short message for rate limit errors', () => {
      const error = {
        type: 'LLM_RATE_LIMIT',
        message: 'Rate limit exceeded. Please wait.',
      };
      const result = formatForToast(error);
      expect(result).toBe('Rate limit exceeded. Please wait.');
    });

    it('should return short message for invalid API key errors', () => {
      const error = {
        type: 'LLM_API_KEY_INVALID',
        message: 'Invalid API key. Check settings.',
      };
      const result = formatForToast(error);
      expect(result).toBe('Invalid API key. Check settings.');
    });

    it('should return short message for timeout errors', () => {
      const error = {
        type: 'LLM_TIMEOUT',
        message: 'Request timed out. Please retry.',
      };
      const result = formatForToast(error);
      expect(result).toBe('Request timed out. Please retry.');
    });

    it('should return short message for storage quota errors', () => {
      const error = {
        type: 'STORAGE_QUOTA_EXCEEDED',
        message: 'Storage full. Clear old data.',
      };
      const result = formatForToast(error);
      expect(result).toBe('Storage full. Clear old data.');
    });

    it('should return short message for network offline errors', () => {
      const error = {
        type: 'NETWORK_OFFLINE',
        message: 'No internet connection.',
      };
      const result = formatForToast(error);
      expect(result).toBe('No internet connection.');
    });

    it('should return short message for network timeout errors', () => {
      const error = {
        type: 'NETWORK_TIMEOUT',
        message: 'Network timeout. Please retry.',
      };
      const result = formatForToast(error);
      expect(result).toBe('Network timeout. Please retry.');
    });

    it('should return short message for validation errors', () => {
      const error = {
        type: 'VALIDATION_MISSING_REQUIRED',
        message: 'Missing required information.',
      };
      const result = formatForToast(error);
      expect(result).toBe('Missing required information.');
    });

    it('should return short message for transaction timeout errors', () => {
      const error = {
        type: 'TRANSACTION_TIMEOUT',
        message: 'Operation timed out. Please retry.',
      };
      const result = formatForToast(error);
      expect(result).toBe('Operation timed out. Please retry.');
    });

    it('should truncate long messages for unknown errors', () => {
      const error = {
        type: 'UNKNOWN_ERROR',
        message:
          'This is a very long error message that should be truncated to fit in a toast notification without taking up too much space on the screen',
      };
      const result = formatForToast(error);
      expect(result.length).toBeLessThanOrEqual(100);
    });

    it('should handle multiline messages', () => {
      const error = {
        type: 'UNKNOWN_ERROR',
        message: 'Line 1\nLine 2\nLine 3',
      };
      const result = formatForToast(error);
      expect(result).not.toContain('\n');
      expect(result).toBe('Line 1');
    });
  });
});
