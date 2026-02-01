/**
 * Security Tests for Error Handling Utilities
 *
 * Tests for sensitive data redaction, context sanitization, and stack trace protection
 *
 * @module tests/unit/error-handling-security
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorHandler, ErrorType, ErrorSeverity } from '../../js/utils/error-handling.js';

// Mock console methods to avoid cluttering test output
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
  trace: console.trace,
  group: console.group,
  groupEnd: console.groupEnd,
};

describe('Error Handling Security Tests', () => {
  beforeEach(() => {
    // Mock console methods
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
    console.info = vi.fn();
    console.trace = vi.fn();
    console.group = vi.fn();
    console.groupEnd = vi.fn();
  });

  afterEach(() => {
    // Restore console methods
    Object.assign(console, originalConsole);
  });

  describe('1. Sensitive Data Redaction in normalizeError()', () => {
    it('should redact API keys from error messages', () => {
      const errorMessage = 'Invalid API key: sk-ant-api03-1234567890abcdef';
      const error = new Error(errorMessage);
      const classified = ErrorHandler.classify(error, { provider: 'anthropic' });

      expect(classified.originalError.message).not.toContain('sk-ant-api03-1234567890abcdef');
      expect(classified.originalError.message).toContain('[REDACTED_API_KEY]');
    });

    it('should redact OpenRouter API keys', () => {
      const errorMessage = 'Error: sk-or-v1-1234567890abcdefghijklmno';
      const error = new Error(errorMessage);
      const classified = ErrorHandler.classify(error, { provider: 'openrouter' });

      expect(classified.originalError.message).not.toContain('sk-or-v1-1234567890abcdefghijklmno');
      expect(classified.originalError.message).toContain('[REDACTED_API_KEY]');
    });

    it('should redact bearer tokens', () => {
      const errorMessage = 'Unauthorized: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
      const error = new Error(errorMessage);
      const classified = ErrorHandler.classify(error);

      expect(classified.originalError.message).not.toContain(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      );
      expect(classified.originalError.message).toContain('[REDACTED_TOKEN]');
    });

    it('should redact passwords', () => {
      const errorMessage = 'Authentication failed: password="SuperSecret123!"';
      const error = new Error(errorMessage);
      const classified = ErrorHandler.classify(error);

      expect(classified.originalError.message).not.toContain('SuperSecret123');
      expect(classified.originalError.message).toContain('password=[REDACTED]');
    });

    it('should redact URL parameters with sensitive data', () => {
      const errorMessage =
        'Request failed: https://api.example.com?api_key=secret12345&token=abcxyz';
      const error = new Error(errorMessage);
      const classified = ErrorHandler.classify(error);

      expect(classified.originalError.message).not.toContain('api_key=secret12345');
      expect(classified.originalError.message).not.toContain('token=abcxyz');
      expect(classified.originalError.message).toContain('[REDACTED]');
    });

    it('should redact auth headers', () => {
      const errorMessage = 'Authorization failed: auth=BasicYW1vbmlhOnBhc3N3b3Jk';
      const error = new Error(errorMessage);
      const classified = ErrorHandler.classify(error);

      expect(classified.originalError.message).not.toContain('BasicYW1vbmlhOnBhc3N3b3Jk');
      expect(classified.originalError.message).toContain('auth=[REDACTED]');
    });

    it('should redact secret keys', () => {
      const errorMessage = 'Config error: secret=my_super_secret_key_12345';
      const error = new Error(errorMessage);
      const classified = ErrorHandler.classify(error);

      expect(classified.originalError.message).not.toContain('my_super_secret_key_12345');
      expect(classified.originalError.message).toContain('secret=[REDACTED]');
    });

    it('should handle multiple sensitive patterns in one message', () => {
      const errorMessage = 'Error: API key sk-ant-12345 and password=secret123 failed';
      const error = new Error(errorMessage);
      const classified = ErrorHandler.classify(error);

      expect(classified.originalError.message).not.toContain('sk-ant-12345');
      expect(classified.originalError.message).not.toContain('secret123');
      expect(classified.originalError.message).toContain('[REDACTED_API_KEY]');
      expect(classified.originalError.message).toContain('[REDACTED]');
    });

    it('should not modify non-sensitive error messages', () => {
      const errorMessage = 'Network timeout occurred after 30 seconds';
      const error = new Error(errorMessage);
      const classified = ErrorHandler.classify(error);

      expect(classified.originalError.message).toBe(errorMessage);
    });
  });

  describe('2. Context Metadata Allowlist Filtering', () => {
    it('should only include safe fields in context', () => {
      const error = new Error('Test error');
      const classified = ErrorHandler.classify(error, {
        provider: 'anthropic',
        operation: 'chat_completion',
        metadata: {
          apiKey: 'sk-ant-secret', // Should be filtered
          model: 'claude-3-opus', // Should be included
          temperature: 0.7, // Should be included
          userId: 'user@example.com', // Should be filtered
        },
      });

      expect(classified.context).toHaveProperty('provider', 'anthropic');
      expect(classified.context).toHaveProperty('operation', 'chat_completion');
      expect(classified.context).toHaveProperty('model', 'claude-3-opus');
      expect(classified.context).toHaveProperty('temperature', 0.7);
      expect(classified.context).not.toHaveProperty('apiKey');
      expect(classified.context).not.toHaveProperty('userId');
    });

    it('should include all safe context fields', () => {
      const error = new Error('Test error');
      const metadata = {
        provider: 'openrouter',
        operation: 'completion',
        model: 'gpt-4',
        maxTokens: 4096,
        temperature: 0.7,
        timestamp: '2024-01-01T00:00:00Z',
        code: 500,
        status: 'error',
        attempt: 1,
        maxRetries: 3,
      };

      const classified = ErrorHandler.classify(error, { metadata });

      // All safe fields should be present
      Object.keys(metadata).forEach(key => {
        expect(classified.context).toHaveProperty(key, metadata[key]);
      });
    });

    it('should filter unsafe fields even with safe fields present', () => {
      const error = new Error('Test error');
      const classified = ErrorHandler.classify(error, {
        provider: 'anthropic',
        metadata: {
          operation: 'chat',
          apiKey: 'secret', // Unsafe
          secret: 'my-secret', // Unsafe
          password: 'pass123', // Unsafe
          token: 'abc123', // Unsafe
          model: 'claude-3', // Safe
        },
      });

      expect(classified.context).toHaveProperty('operation', 'chat');
      expect(classified.context).toHaveProperty('model', 'claude-3');
      expect(classified.context).not.toHaveProperty('apiKey');
      expect(classified.context).not.toHaveProperty('secret');
      expect(classified.context).not.toHaveProperty('password');
      expect(classified.context).not.toHaveProperty('token');
    });

    it('should handle empty metadata', () => {
      const error = new Error('Test error');
      const classified = ErrorHandler.classify(error, { metadata: {} });

      expect(classified.context).toEqual({});
    });

    it('should handle null or undefined metadata', () => {
      const error = new Error('Test error');
      const classified1 = ErrorHandler.classify(error, { metadata: null });
      const classified2 = ErrorHandler.classify(error, { metadata: undefined });

      expect(classified1.context).toEqual({});
      expect(classified2.context).toEqual({});
    });
  });

  describe('3. Sanitization of originalError.message in formatForLog()', () => {
    it('should sanitize originalMessage in formatForLog', () => {
      const error = new Error('Invalid API key: sk-ant-api03-1234567890abcdef');
      const classified = ErrorHandler.classify(error);
      const logEntry = ErrorHandler.formatForLog(classified);

      expect(logEntry.originalMessage).not.toContain('sk-ant-api03-1234567890abcdef');
      expect(logEntry.originalMessage).toContain('[REDACTED_API_KEY]');
    });

    it('should sanitize multiple sensitive patterns in log output', () => {
      const error = new Error('Auth failed with Bearer token123 and password=secret456');
      const classified = ErrorHandler.classify(error);
      const logEntry = ErrorHandler.formatForLog(classified);

      expect(logEntry.originalMessage).not.toContain('token123');
      expect(logEntry.originalMessage).not.toContain('secret456');
      expect(logEntry.originalMessage).toContain('[REDACTED_TOKEN]');
      expect(logEntry.originalMessage).toContain('[REDACTED]');
    });

    it('should preserve non-sensitive parts of error messages', () => {
      const error = new Error('Network timeout after 30 seconds');
      const classified = ErrorHandler.classify(error);
      const logEntry = ErrorHandler.formatForLog(classified);

      expect(logEntry.originalMessage).toBe('Network timeout after 30 seconds');
    });

    it('should handle null originalError gracefully', () => {
      const error = new Error('Test error');
      const classified = ErrorHandler.classify(error);
      classified.originalError = null;
      const logEntry = ErrorHandler.formatForLog(classified);

      expect(logEntry.originalMessage).toBeUndefined();
    });
  });

  describe('4. Stack Trace Protection in Production', () => {
    it('should exclude stack traces in production mode', () => {
      // Mock NODE_ENV as production
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10:15';
      const classified = ErrorHandler.classify(error);
      const logEntry = ErrorHandler.log(classified, { silent: true });

      expect(logEntry.stack).toBeUndefined();

      // Restore NODE_ENV
      process.env.NODE_ENV = originalEnv;
    });

    it('should not call console.trace in production mode', () => {
      // Mock NODE_ENV as production
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10:15';
      const classified = ErrorHandler.classify(error);
      ErrorHandler.log(classified, { silent: false });

      expect(console.trace).not.toHaveBeenCalled();

      // Restore NODE_ENV
      process.env.NODE_ENV = originalEnv;
    });

    it('should include stack traces in development mode', () => {
      // Mock NODE_ENV as development
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10:15';
      const classified = ErrorHandler.classify(error);
      const logEntry = ErrorHandler.log(classified, { silent: true });

      expect(logEntry.stack).toBe('Error: Test error\n    at test.js:10:15');

      // Restore NODE_ENV
      process.env.NODE_ENV = originalEnv;
    });

    it('should call console.trace in development mode', () => {
      // Mock NODE_ENV as development
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10:15';
      const classified = ErrorHandler.classify(error);
      ErrorHandler.log(classified, { silent: false });

      expect(console.trace).toHaveBeenCalled();

      // Restore NODE_ENV
      process.env.NODE_ENV = originalEnv;
    });

    it('should respect includeStack=false even in development', () => {
      // Mock NODE_ENV as development
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10:15';
      const classified = ErrorHandler.classify(error);
      const logEntry = ErrorHandler.log(classified, { includeStack: false, silent: true });

      expect(logEntry.stack).toBeUndefined();

      // Restore NODE_ENV
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('5. Retry Error Sanitization', () => {
    it('should sanitize retry errors before logging', async () => {
      // Use a rate limit error which is RECOVERABLE_WITH_RETRY
      const error = new Error('rate limit exceeded');
      const classified = ErrorHandler.classify(error, { provider: 'anthropic' });

      const retryCallback = vi.fn(() => {
        throw new Error('Bearer token-abc-123 failed');
      });

      await ErrorHandler.attemptRecovery(classified, {
        maxRetries: 1,
        retryDelayMs: 10,
        retryCallback,
      });

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Retry attempt'),
        expect.stringContaining('[REDACTED_TOKEN]')
      );
      expect(console.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Retry attempt'),
        expect.stringContaining('token-abc-123')
      );
    });

    it('should sanitize multiple retry attempts', async () => {
      // Use a timeout error which is RECOVERABLE_WITH_RETRY
      const error = new Error('timeout occurred');
      const classified = ErrorHandler.classify(error, { provider: 'anthropic' });

      let attemptCount = 0;
      const retryCallback = vi.fn(() => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error(`API key sk-ant-${attemptCount} failed`);
        }
        throw new Error(`password=secret${attemptCount} failed`);
      });

      await ErrorHandler.attemptRecovery(classified, {
        maxRetries: 2,
        retryDelayMs: 10,
        retryCallback,
      });

      const warnCalls = console.warn.mock.calls;
      expect(warnCalls.length).toBeGreaterThan(0);

      // Check that all warnings are sanitized
      warnCalls.forEach(call => {
        const message = String(call[1]);
        expect(message).not.toMatch(/sk-ant-/);
        expect(message).not.toMatch(/password=\w+/);
      });
    });
  });

  describe('6. Integration Tests', () => {
    it('should protect against all attack scenarios from review', () => {
      // Scenario 1: API key in provider error
      const apiError = new Error('Invalid API key: sk-ant-api03-1234567890abcdef');
      const apiClassified = ErrorHandler.classify(apiError, {
        provider: 'anthropic',
        operation: 'chat_completion',
        metadata: { apiKey: 'sk-ant-secret', model: 'claude-3' },
      });

      expect(apiClassified.originalError.message).not.toContain('sk-ant-api03-1234567890abcdef');
      expect(apiClassified.context).not.toHaveProperty('apiKey');
      expect(apiClassified.context).toHaveProperty('model', 'claude-3');

      // Scenario 2: Sensitive data in metadata
      const metadataError = new Error('Operation failed');
      const metaClassified = ErrorHandler.classify(metadataError, {
        provider: 'openrouter',
        metadata: {
          apiKey: 'sk-or-secret',
          userId: 'user@example.com',
          operation: 'completion',
          model: 'gpt-4',
        },
      });

      expect(metaClassified.context).toHaveProperty('operation', 'completion');
      expect(metaClassified.context).toHaveProperty('model', 'gpt-4');
      expect(metaClassified.context).not.toHaveProperty('apiKey');
      expect(metaClassified.context).not.toHaveProperty('userId');

      // Scenario 3: Stack trace exposure
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const stackError = new Error('Error with stack');
      stackError.stack = 'Error: Error with stack\n    at /app/src/module.js:42:10';
      const stackClassified = ErrorHandler.classify(stackError);
      const stackLog = ErrorHandler.log(stackClassified, { silent: true });

      expect(stackLog.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle real-world error scenarios', () => {
      // Anthropic API error with API key
      const anthropicError = new Error(
        'anthropic.APIError: Invalid API key: sk-ant-api03-1234567890abcdef provided'
      );
      const anthropicClassified = ErrorHandler.classify(anthropicError, {
        provider: 'anthropic',
        operation: 'stream_chat',
      });

      expect(anthropicClassified.originalError.message).not.toContain(
        'sk-ant-api03-1234567890abcdef'
      );
      expect(anthropicClassified.type).toBe(ErrorType.LLM_API_KEY_INVALID);

      // Network error with bearer token
      const networkError = new Error(
        'Request failed: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      );
      const networkClassified = ErrorHandler.classify(networkError);

      expect(networkClassified.originalError.message).not.toContain(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      );
      expect(networkClassified.originalError.message).toContain('[REDACTED_TOKEN]');

      // Storage error with potential path disclosure
      const storageError = new Error(
        'QuotaExceededError: Failed to execute "put" on "IDBRequest" at /Users/username/app/index.js:123'
      );
      const storageClassified = ErrorHandler.classify(storageError);

      // Should still be classified correctly
      expect(storageClassified.type).toBe(ErrorType.STORAGE_QUOTA_EXCEEDED);
    });
  });
});
