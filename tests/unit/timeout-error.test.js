/**
 * Network Timeout Error Tests (TD-15)
 *
 * Test suite for enhanced timeout error handling with:
 * - Detailed error context
 * - Retry information
 * - User-friendly error messages
 * - Differentiation between timeout types (connection, read, write)
 *
 * TDD Approach: Tests written before implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';

// We'll import the actual implementation after creating it
// For now, we define what we expect the API to be

describe('TimeoutError', () => {
  let TimeoutError;

  beforeEach(async () => {
    // Import the module to test
    const module = await import('../../js/services/timeout-error.js');
    TimeoutError = module.TimeoutError;
  });

  describe('Constructor and Properties', () => {
    it('should create TimeoutError with message and options', () => {
      const error = new TimeoutError('Request timed out', {
        timeout: 60000,
        operation: 'sendMessage',
        provider: 'OpenAI',
        retryable: true,
        retryAfter: 1000,
      });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('Request timed out');
    });

    it('should include timeout property', () => {
      const error = new TimeoutError('Request timed out', {
        timeout: 60000,
        operation: 'sendMessage',
      });

      expect(error.timeout).toBe(60000);
    });

    it('should include operation property', () => {
      const error = new TimeoutError('Request timed out', {
        timeout: 60000,
        operation: 'sendMessage',
      });

      expect(error.operation).toBe('sendMessage');
    });

    it('should include provider property', () => {
      const error = new TimeoutError('Request timed out', {
        timeout: 60000,
        provider: 'OpenAI',
      });

      expect(error.provider).toBe('OpenAI');
    });

    it('should include retryable property (default true)', () => {
      const error1 = new TimeoutError('Request timed out', {
        timeout: 60000,
        retryable: true,
      });

      const error2 = new TimeoutError('Request timed out', {
        timeout: 60000,
      });

      expect(error1.retryable).toBe(true);
      expect(error2.retryable).toBe(true); // default
    });

    it('should include retryable property when false', () => {
      const error = new TimeoutError('Request timed out', {
        timeout: 60000,
        retryable: false,
      });

      expect(error.retryable).toBe(false);
    });

    it('should include retryAfter property', () => {
      const error = new TimeoutError('Request timed out', {
        timeout: 60000,
        retryAfter: 1000,
      });

      expect(error.retryAfter).toBe(1000);
    });

    it('should have retryAfter as null when not specified', () => {
      const error = new TimeoutError('Request timed out', {
        timeout: 60000,
      });

      expect(error.retryAfter).toBeNull();
    });
  });

  describe('Timeout Types', () => {
    it('should support connection timeout type', () => {
      const error = new TimeoutError('Connection timed out', {
        timeout: 5000,
        timeoutType: 'connection',
      });

      expect(error.timeoutType).toBe('connection');
    });

    it('should support read timeout type', () => {
      const error = new TimeoutError('Read timed out', {
        timeout: 30000,
        timeoutType: 'read',
      });

      expect(error.timeoutType).toBe('read');
    });

    it('should support write timeout type', () => {
      const error = new TimeoutError('Write timed out', {
        timeout: 10000,
        timeoutType: 'write',
      });

      expect(error.timeoutType).toBe('write');
    });

    it('should default to general timeout type when not specified', () => {
      const error = new TimeoutError('Request timed out', {
        timeout: 60000,
      });

      expect(error.timeoutType).toBe('general');
    });

    it('should include timeout type in error name when specified', () => {
      const connectionError = new TimeoutError('Connection timed out', {
        timeout: 5000,
        timeoutType: 'connection',
      });

      expect(connectionError.getTimeoutTypeLabel()).toBe('Connection');
    });
  });

  describe('Error Serialization', () => {
    it('should serialize to JSON correctly', () => {
      const error = new TimeoutError('Request timed out', {
        timeout: 60000,
        operation: 'sendMessage',
        provider: 'OpenAI',
        retryable: true,
        retryAfter: 1000,
        timeoutType: 'connection',
      });

      const serialized = JSON.parse(JSON.stringify(error));

      expect(serialized.name).toBe('TimeoutError');
      expect(serialized.message).toBe('Request timed out');
      expect(serialized.timeout).toBe(60000);
      expect(serialized.operation).toBe('sendMessage');
      expect(serialized.provider).toBe('OpenAI');
      expect(serialized.retryable).toBe(true);
      expect(serialized.retryAfter).toBe(1000);
      expect(serialized.timeoutType).toBe('connection');
    });
  });

  describe('Static Factory Methods', () => {
    it('should create connection timeout via factory', () => {
      const error = TimeoutError.connection({
        timeout: 5000,
        provider: 'OpenAI',
        operation: 'sendMessage',
      });

      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.timeoutType).toBe('connection');
      expect(error.timeout).toBe(5000);
      expect(error.provider).toBe('OpenAI');
      expect(error.operation).toBe('sendMessage');
    });

    it('should create read timeout via factory', () => {
      const error = TimeoutError.read({
        timeout: 30000,
        provider: 'OpenAI',
        operation: 'streamResponse',
      });

      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.timeoutType).toBe('read');
      expect(error.timeout).toBe(30000);
    });

    it('should create write timeout via factory', () => {
      const error = TimeoutError.write({
        timeout: 10000,
        provider: 'OpenAI',
        operation: 'sendMessage',
      });

      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.timeoutType).toBe('write');
      expect(error.timeout).toBe(10000);
    });
  });
});

describe('getUserMessage - User-Friendly Error Messages', () => {
  let getUserMessage;
  let TimeoutError;

  beforeEach(async () => {
    const module = await import('../../js/services/timeout-error.js');
    getUserMessage = module.getUserMessage;
    TimeoutError = module.TimeoutError;
  });

  describe('Retryable Timeout Messages', () => {
    it('should show connection timeout message with retry', () => {
      const error = new TimeoutError('Connection timed out', {
        timeout: 5000,
        timeoutType: 'connection',
        retryable: true,
        provider: 'OpenAI',
      });

      const message = getUserMessage(error);

      expect(message.toLowerCase()).toContain('timed out');
      expect(message.toLowerCase()).toContain('connecting');
      expect(message).toContain('5s');
      expect(message.toLowerCase()).toContain('try again');
    });

    it('should show read timeout message with retry', () => {
      const error = new TimeoutError('Read timed out', {
        timeout: 30000,
        timeoutType: 'read',
        retryable: true,
      });

      const message = getUserMessage(error);

      expect(message.toLowerCase()).toContain('timed out');
      expect(message.toLowerCase()).toContain('reading');
      expect(message).toContain('30s');
      expect(message.toLowerCase()).toContain('try again');
    });

    it('should show write timeout message with retry', () => {
      const error = new TimeoutError('Write timed out', {
        timeout: 10000,
        timeoutType: 'write',
        retryable: true,
      });

      const message = getUserMessage(error);

      expect(message.toLowerCase()).toContain('timed out');
      expect(message.toLowerCase()).toContain('sending');
      expect(message).toContain('10s');
      expect(message.toLowerCase()).toContain('try again');
    });

    it('should show general timeout message with retry', () => {
      const error = new TimeoutError('Request timed out', {
        timeout: 60000,
        timeoutType: 'general',
        retryable: true,
      });

      const message = getUserMessage(error);

      expect(message.toLowerCase()).toContain('timed out');
      expect(message).toContain('60s');
      expect(message.toLowerCase()).toContain('try again');
    });
  });

  describe('Non-Retryable Timeout Messages', () => {
    it('should show connection timeout message without retry', () => {
      const error = new TimeoutError('Connection timed out', {
        timeout: 5000,
        timeoutType: 'connection',
        retryable: false,
      });

      const message = getUserMessage(error);

      expect(message.toLowerCase()).toContain('timed out');
      expect(message.toLowerCase()).not.toContain('try again');
      expect(message.toLowerCase()).toContain('contact support');
    });

    it('should show read timeout message without retry', () => {
      const error = new TimeoutError('Read timed out', {
        timeout: 30000,
        timeoutType: 'read',
        retryable: false,
      });

      const message = getUserMessage(error);

      expect(message.toLowerCase()).toContain('timed out');
      expect(message.toLowerCase()).not.toContain('try again');
      expect(message.toLowerCase()).toContain('contact support');
    });

    it('should show write timeout message without retry', () => {
      const error = new TimeoutError('Write timed out', {
        timeout: 10000,
        timeoutType: 'write',
        retryable: false,
      });

      const message = getUserMessage(error);

      expect(message.toLowerCase()).toContain('timed out');
      expect(message.toLowerCase()).not.toContain('try again');
      expect(message.toLowerCase()).toContain('contact support');
    });
  });

  describe('Provider-Specific Messages', () => {
    it('should include provider name in message', () => {
      const error = new TimeoutError('Request timed out', {
        timeout: 60000,
        provider: 'OpenAI',
        retryable: true,
      });

      const message = getUserMessage(error);

      expect(message).toContain('OpenAI');
    });

    it('should show different message for local providers', () => {
      const error = new TimeoutError('Request timed out', {
        timeout: 60000,
        provider: 'Ollama',
        isLocalProvider: true,
        retryable: true,
      });

      const message = getUserMessage(error);

      expect(message).toContain('local');
      expect(message.toLowerCase()).toContain('ollama');
    });
  });

  describe('Retry Information', () => {
    it('should include retryAfter information when available', () => {
      const error = new TimeoutError('Request timed out', {
        timeout: 60000,
        retryAfter: 2000,
        retryable: true,
      });

      const message = getUserMessage(error);

      expect(message).toContain('2');
      expect(message.toLowerCase()).toContain('second');
    });

    it('should handle retryAfter of 1 second', () => {
      const error = new TimeoutError('Request timed out', {
        timeout: 60000,
        retryAfter: 1000,
        retryable: true,
      });

      const message = getUserMessage(error);

      expect(message).toContain('1');
      expect(message.toLowerCase()).toContain('second');
    });
  });

  describe('Operation Context', () => {
    it('should include operation in message when available', () => {
      const error = new TimeoutError('Request timed out', {
        timeout: 60000,
        operation: 'generatePlaylist',
        retryable: true,
      });

      const message = getUserMessage(error);

      expect(message.toLowerCase()).toContain('generate');
      expect(message.toLowerCase()).toContain('playlist');
    });
  });

  describe('Non-TimeoutError Handling', () => {
    it('should handle generic Error objects', () => {
      const error = new Error('Some other error');

      const message = getUserMessage(error);

      expect(message).toContain('Some other error');
    });

    it('should handle null/undefined gracefully', () => {
      const message = getUserMessage(null);

      expect(message).toBeTruthy();
      expect(message.toLowerCase()).toContain('error');
    });

    it('should handle string errors', () => {
      const message = getUserMessage('Something went wrong');

      expect(message).toContain('Something went wrong');
    });
  });
});

describe('isTimeoutError - Type Guard', () => {
  let isTimeoutError;
  let TimeoutError;

  beforeEach(async () => {
    const module = await import('../../js/services/timeout-error.js');
    isTimeoutError = module.isTimeoutError;
    TimeoutError = module.TimeoutError;
  });

  it('should return true for TimeoutError instances', () => {
    const error = new TimeoutError('Request timed out', {
      timeout: 60000,
    });

    expect(isTimeoutError(error)).toBe(true);
  });

  it('should return false for generic Error', () => {
    const error = new Error('Some error');

    expect(isTimeoutError(error)).toBe(false);
  });

  it('should return false for null', () => {
    expect(isTimeoutError(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isTimeoutError(undefined)).toBe(false);
  });

  it('should return false for plain objects', () => {
    expect(isTimeoutError({ timeout: 60000 })).toBe(false);
  });
});

describe('formatTimeoutDuration - Utility', () => {
  let formatTimeoutDuration;

  beforeEach(async () => {
    const module = await import('../../js/services/timeout-error.js');
    formatTimeoutDuration = module.formatTimeoutDuration;
  });

  it('should format milliseconds to seconds', () => {
    expect(formatTimeoutDuration(1000)).toBe('1s');
    expect(formatTimeoutDuration(5000)).toBe('5s');
    expect(formatTimeoutDuration(10000)).toBe('10s');
  });

  it('should format large milliseconds to seconds', () => {
    expect(formatTimeoutDuration(60000)).toBe('60s');
    expect(formatTimeoutDuration(120000)).toBe('120s');
  });

  it('should handle sub-second durations', () => {
    expect(formatTimeoutDuration(500)).toBe('500ms');
    expect(formatTimeoutDuration(100)).toBe('100ms');
  });

  it('should handle zero duration', () => {
    expect(formatTimeoutDuration(0)).toBe('0ms');
  });
});
