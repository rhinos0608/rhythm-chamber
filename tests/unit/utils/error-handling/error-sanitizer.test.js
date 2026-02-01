/**
 * Tests for error-sanitizer module
 * Tests security-focused sanitization functions
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeMessage,
  sanitizeStack,
  sanitizeContext,
  SENSITIVE_PATTERNS,
  SAFE_CONTEXT_FIELDS,
} from '../../../../js/utils/error-handling/error-sanitizer.js';

describe('error-sanitizer', () => {
  describe('sanitizeMessage', () => {
    it('should redact API keys with sk- prefix', () => {
      const input = 'Error with API key: sk-ant-api03-1234567890abcdef';
      const result = sanitizeMessage(input);
      expect(result).toBe('Error with API key: [REDACTED_API_KEY]');
    });

    it('should redact short API keys (minimum 5 chars)', () => {
      const input = 'API key: sk-ant-1';
      const result = sanitizeMessage(input);
      expect(result).toBe('API key: [REDACTED_API_KEY]');
    });

    it('should redact bearer tokens', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const result = sanitizeMessage(input);
      expect(result).toBe('Authorization: Bearer [REDACTED_TOKEN]');
    });

    it('should redact passwords in various formats', () => {
      const input = 'password: "mySecret123"';
      const result = sanitizeMessage(input);
      expect(result).toContain('password=[REDACTED]');
    });

    it('should redact URL API key parameters', () => {
      const input = 'https://api.example.com?api_key=sk-12345';
      const result = sanitizeMessage(input);
      expect(result).toContain('api_key=[REDACTED]');
    });

    it('should redact URL token parameters', () => {
      const input = 'https://api.example.com?token=abc123def456';
      const result = sanitizeMessage(input);
      expect(result).toContain('token=[REDACTED]');
    });

    it('should redact auth headers', () => {
      const input = 'auth: "Bearer xyz789"';
      const result = sanitizeMessage(input);
      expect(result).toContain('auth=[REDACTED]');
    });

    it('should redact secret keys', () => {
      const input = 'secret: "topSecretKey123"';
      const result = sanitizeMessage(input);
      expect(result).toContain('secret=[REDACTED]');
    });

    it('should handle multiple sensitive patterns in one message', () => {
      const input = 'API key sk-12345 and password: pass123';
      const result = sanitizeMessage(input);
      expect(result).toContain('[REDACTED_API_KEY]');
      expect(result).toContain('password=[REDACTED]');
    });

    it('should return unchanged input if no sensitive patterns found', () => {
      const input = 'This is a safe error message';
      const result = sanitizeMessage(input);
      expect(result).toBe(input);
    });

    it('should handle null/undefined gracefully', () => {
      expect(sanitizeMessage(null)).toBeNull();
      expect(sanitizeMessage(undefined)).toBeUndefined();
    });

    it('should handle non-string input', () => {
      expect(sanitizeMessage(123)).toBe(123);
      expect(sanitizeMessage({})).toStrictEqual({});
    });

    it('should use word boundary to prevent bypasses', () => {
      const input = 'fake-sk-ant-api03'; // Has word boundary before sk-
      const result = sanitizeMessage(input);
      // Should redact because \b matches word boundary between 'fake' and 'sk-'
      expect(result).toContain('[REDACTED_API_KEY]');
    });
  });

  describe('sanitizeStack', () => {
    it('should sanitize stack traces containing API keys', () => {
      const input = `Error: Request failed
    at callAPI (https://example.com/api.js?key=sk-12345:10:5)
    at main (https://example.com/main.js:20:10)`;
      const result = sanitizeStack(input);
      expect(result).toContain('[REDACTED_API_KEY]');
      expect(result).not.toContain('sk-12345');
    });

    it('should sanitize stack traces with URLs containing tokens', () => {
      const input = `Error: Auth failed
    at auth (https://api.example.com?token=abc123:5:15)`;
      const result = sanitizeStack(input);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('abc123');
    });

    it('should return null/undefined unchanged', () => {
      expect(sanitizeStack(null)).toBeNull();
      expect(sanitizeStack(undefined)).toBeUndefined();
    });

    it('should handle empty stack trace', () => {
      const result = sanitizeStack('');
      expect(result).toBe('');
    });
  });

  describe('sanitizeContext', () => {
    it('should only include fields from SAFE_CONTEXT_FIELDS allowlist', () => {
      const metadata = {
        provider: 'openrouter',
        operation: 'chat',
        apiKey: 'sk-12345', // NOT in allowlist
        password: 'secret', // NOT in allowlist
      };

      const result = sanitizeContext(metadata);
      expect(result).toEqual({
        provider: 'openrouter',
        operation: 'chat',
      });
      expect(result).not.toHaveProperty('apiKey');
      expect(result).not.toHaveProperty('password');
    });

    it('should sanitize string values in allowed fields', () => {
      const metadata = {
        provider: 'openrouter',
        operation: 'chat with key sk-12345', // Contains API key
      };

      const result = sanitizeContext(metadata);
      expect(result.provider).toBe('openrouter');
      expect(result.operation).toContain('[REDACTED_API_KEY]');
      expect(result.operation).not.toContain('sk-12345');
    });

    it('should preserve non-string values', () => {
      const metadata = {
        maxTokens: 1000,
        temperature: 0.7,
        attempt: 3,
      };

      const result = sanitizeContext(metadata);
      expect(result).toEqual(metadata);
    });

    it('should handle empty object', () => {
      const result = sanitizeContext({});
      expect(result).toEqual({});
    });

    it('should handle null/undefined', () => {
      expect(sanitizeContext(null)).toEqual({});
      expect(sanitizeContext(undefined)).toEqual({});
    });

    it('should handle non-object input', () => {
      expect(sanitizeContext('string')).toEqual({});
      expect(sanitizeContext(123)).toEqual({});
    });

    it('should include all SAFE_CONTEXT_FIELDS', () => {
      const metadata = {
        provider: 'openrouter',
        operation: 'chat',
        model: 'gpt-4',
        maxTokens: 1000,
        temperature: 0.7,
        timestamp: '2024-01-27',
        code: 500,
        status: 'error',
        attempt: 1,
        maxRetries: 3,
      };

      const result = sanitizeContext(metadata);
      expect(Object.keys(result).length).toBe(10);
      expect(result).toEqual(metadata);
    });
  });

  describe('SENSITIVE_PATTERNS', () => {
    it('should export regex patterns for all sensitive data types', () => {
      expect(SENSITIVE_PATTERNS).toHaveProperty('apiKey');
      expect(SENSITIVE_PATTERNS).toHaveProperty('bearerToken');
      expect(SENSITIVE_PATTERNS).toHaveProperty('password');
      expect(SENSITIVE_PATTERNS).toHaveProperty('urlApiKey');
      expect(SENSITIVE_PATTERNS).toHaveProperty('urlToken');
      expect(SENSITIVE_PATTERNS).toHaveProperty('authHeader');
      expect(SENSITIVE_PATTERNS).toHaveProperty('secret');
    });

    it('should have RegExp values for all patterns', () => {
      Object.values(SENSITIVE_PATTERNS).forEach(pattern => {
        expect(pattern).toBeInstanceOf(RegExp);
      });
    });
  });

  describe('SAFE_CONTEXT_FIELDS', () => {
    it('should include expected safe fields', () => {
      expect(SAFE_CONTEXT_FIELDS).toContain('provider');
      expect(SAFE_CONTEXT_FIELDS).toContain('operation');
      expect(SAFE_CONTEXT_FIELDS).toContain('model');
      expect(SAFE_CONTEXT_FIELDS).toContain('timestamp');
    });

    it('should NOT include sensitive field names', () => {
      expect(SAFE_CONTEXT_FIELDS).not.toContain('apiKey');
      expect(SAFE_CONTEXT_FIELDS).not.toContain('password');
      expect(SAFE_CONTEXT_FIELDS).not.toContain('token');
      expect(SAFE_CONTEXT_FIELDS).not.toContain('secret');
    });

    it('should be an array', () => {
      expect(Array.isArray(SAFE_CONTEXT_FIELDS)).toBe(true);
    });
  });
});
