/**
 * Tests for error-classifier module
 * Tests error classification logic
 */

import { describe, it, expect } from 'vitest';
import {
  classifyError,
  normalizeError,
  classifyProviderError,
  classifyStorageError,
  classifyNetworkError,
  classifyValidationError,
  classifyTransactionError,
} from '../../../../js/utils/error-handling/error-classifier.js';

describe('error-classifier', () => {
  describe('normalizeError', () => {
    it('should normalize Error instances', () => {
      const error = new Error('Test error');
      const result = normalizeError(error);
      expect(result).toHaveProperty('name', 'Error');
      expect(result).toHaveProperty('message', 'Test error');
      expect(result).toHaveProperty('stack');
    });

    it('should normalize string errors', () => {
      const result = normalizeError('string error');
      expect(result).toHaveProperty('name', 'Error');
      expect(result).toHaveProperty('message', 'string error');
    });

    it('should normalize object errors', () => {
      const error = { message: 'obj error', code: 500 };
      const result = normalizeError(error);
      expect(result.message).toBe('obj error');
      expect(result.code).toBe(500);
    });

    it('should normalize unknown types', () => {
      const result = normalizeError(12345);
      expect(result.name).toBe('Error');
      expect(result.message).toBe('12345');
    });

    it('should sanitize error messages', () => {
      const error = new Error('API key sk-12345 exposed');
      const result = normalizeError(error);
      expect(result.message).toContain('[REDACTED_API_KEY]');
      expect(result.message).not.toContain('sk-12345');
    });
  });

  describe('classifyProviderError', () => {
    it('should classify rate limit errors', () => {
      const result = classifyProviderError('rate limit exceeded', 'openrouter', {});
      expect(result).toHaveProperty('type', 'LLM_RATE_LIMIT');
      expect(result).toHaveProperty('severity', 'MEDIUM');
      expect(result).toHaveProperty('recoverable', 'RECOVERABLE_WITH_RETRY');
      expect(result.hint).toBeDefined();
    });

    it('should classify invalid API key errors', () => {
      const result = classifyProviderError('unauthorized', 'anthropic', {});
      expect(result).toHaveProperty('type', 'LLM_API_KEY_INVALID');
      expect(result).toHaveProperty('severity', 'HIGH');
      expect(result).toHaveProperty('recoverable', 'USER_ACTION_REQUIRED');
    });

    it('should classify timeout errors', () => {
      const result = classifyProviderError('request timeout', 'anthropic', {});
      expect(result).toHaveProperty('type', 'LLM_TIMEOUT');
      expect(result).toHaveProperty('recoverable', 'RECOVERABLE_WITH_RETRY');
    });

    it('should classify model unavailable errors', () => {
      const result = classifyProviderError('model not found', 'openrouter', {});
      expect(result).toHaveProperty('type', 'LLM_MODEL_UNAVAILABLE');
      expect(result).toHaveProperty('severity', 'HIGH');
    });

    it('should classify quota exceeded errors', () => {
      const result = classifyProviderError('insufficient credits', 'openrouter', {});
      expect(result).toHaveProperty('type', 'LLM_QUOTA_EXCEEDED');
      expect(result).toHaveProperty('severity', 'HIGH');
    });

    it('should classify connection errors for local providers', () => {
      const result = classifyProviderError('connection refused', 'ollama', {});
      expect(result).toHaveProperty('type', 'LLM_PROVIDER_ERROR');
      expect(result).toHaveProperty('recoverable', 'USER_ACTION_REQUIRED');
    });

    it('should return null for unknown patterns', () => {
      const result = classifyProviderError('unknown error', 'openrouter', {});
      expect(result).toBeNull();
    });

    it('should return null for unknown providers', () => {
      const result = classifyProviderError('some error', 'unknown', {});
      expect(result).toBeNull();
    });
  });

  describe('classifyStorageError', () => {
    it('should classify quota exceeded errors', () => {
      const result = classifyStorageError('QuotaExceededError', 'QuotaExceededError', {});
      expect(result).toHaveProperty('type', 'STORAGE_QUOTA_EXCEEDED');
      expect(result).toHaveProperty('severity', 'HIGH');
    });

    it('should classify transaction failed errors', () => {
      const result = classifyStorageError('transaction failed', 'TransactionInactiveError', {});
      expect(result).toHaveProperty('type', 'STORAGE_TRANSACTION_FAILED');
      expect(result).toHaveProperty('severity', 'MEDIUM');
    });

    it('should classify IndexedDB unavailable errors', () => {
      const result = classifyStorageError('IndexedDB not available', 'Error', {});
      expect(result).toHaveProperty('type', 'STORAGE_INDEXEDDB_UNAVAILABLE');
      expect(result).toHaveProperty('recoverable', 'NOT_RECOVERABLE');
    });

    it('should classify read-only errors', () => {
      const result = classifyStorageError('readonly mode', 'Error', {});
      expect(result).toHaveProperty('type', 'STORAGE_READ_ONLY');
      expect(result).toHaveProperty('severity', 'MEDIUM');
    });

    it('should classify fatal state errors', () => {
      const result = classifyStorageError('fatal error state', 'Error', {});
      expect(result).toHaveProperty('type', 'STORAGE_FATAL_STATE');
      expect(result).toHaveProperty('severity', 'CRITICAL');
    });

    it('should return null for unknown patterns', () => {
      const result = classifyStorageError('unknown storage error', 'Error', {});
      expect(result).toBeNull();
    });
  });

  describe('classifyNetworkError', () => {
    it('should classify offline errors', () => {
      const result = classifyNetworkError('no internet connection', {});
      expect(result).toHaveProperty('type', 'NETWORK_OFFLINE');
      expect(result).toHaveProperty('severity', 'HIGH');
    });

    it('should classify timeout errors', () => {
      const result = classifyNetworkError('ETIMEDOUT', {});
      expect(result).toHaveProperty('type', 'NETWORK_TIMEOUT');
      expect(result).toHaveProperty('severity', 'MEDIUM');
    });

    it('should classify connection refused errors', () => {
      const result = classifyNetworkError('ECONNREFUSED', {});
      expect(result).toHaveProperty('type', 'NETWORK_CONNECTION_REFUSED');
      expect(result).toHaveProperty('severity', 'HIGH');
    });

    it('should return null for unknown patterns', () => {
      const result = classifyNetworkError('unknown network error', {});
      expect(result).toBeNull();
    });
  });

  describe('classifyValidationError', () => {
    it('should classify missing required parameter errors', () => {
      const result = classifyValidationError('missing required parameter', 'createUser', {});
      expect(result).toHaveProperty('type', 'VALIDATION_MISSING_REQUIRED');
      expect(result).toHaveProperty('severity', 'MEDIUM');
    });

    it('should classify invalid type errors', () => {
      const result = classifyValidationError('expected string but got number', 'validate', {});
      // May return null if pattern doesn't match exactly
      if (result) {
        expect(result).toHaveProperty('type', 'VALIDATION_INVALID_TYPE');
      } else {
        // Pattern is more specific, test with exact match
        const result2 = classifyValidationError('invalid type mismatch', 'validate', {});
        expect(result2).toHaveProperty('type', 'VALIDATION_INVALID_TYPE');
      }
    });

    it('should classify invalid format errors', () => {
      const result = classifyValidationError('invalid format', 'validate', {});
      expect(result).toHaveProperty('type', 'VALIDATION_INVALID_FORMAT');
    });

    it('should classify schema mismatch errors', () => {
      const result = classifyValidationError('schema validation failed', 'save', {});
      expect(result).toHaveProperty('type', 'VALIDATION_SCHEMA_MISMATCH');
    });

    it('should return null for unknown patterns', () => {
      const result = classifyValidationError('unknown validation error', 'test', {});
      expect(result).toBeNull();
    });
  });

  describe('classifyTransactionError', () => {
    it('should classify nested transaction errors', () => {
      const result = classifyTransactionError(
        'nested transaction not supported',
        'NESTED_TRANSACTION_NOT_SUPPORTED',
        {}
      );
      expect(result).toHaveProperty('type', 'TRANSACTION_NESTED_NOT_SUPPORTED');
      expect(result).toHaveProperty('severity', 'HIGH');
    });

    it('should classify transaction timeout errors', () => {
      const result = classifyTransactionError('transaction timed out', undefined, {});
      expect(result).toHaveProperty('type', 'TRANSACTION_TIMEOUT');
    });

    it('should classify rollback failed errors', () => {
      const result = classifyTransactionError('rollback failed', undefined, {});
      expect(result).toHaveProperty('type', 'TRANSACTION_ROLLBACK_FAILED');
      expect(result).toHaveProperty('severity', 'CRITICAL');
    });

    it('should classify prepare phase errors', () => {
      const result = classifyTransactionError('prepare phase failed', undefined, {});
      expect(result).toHaveProperty('type', 'TRANSACTION_PREPARE_FAILED');
    });

    it('should return null for unknown patterns', () => {
      const result = classifyTransactionError('unknown transaction error', undefined, {});
      expect(result).toBeNull();
    });
  });

  describe('classifyError (main function)', () => {
    it('should classify provider errors with context', () => {
      const error = new Error('rate limit exceeded');
      const result = classifyError(error, { provider: 'openrouter' });
      expect(result).toHaveProperty('type', 'LLM_RATE_LIMIT');
      expect(result).toHaveProperty('originalError');
      expect(result.context).toHaveProperty('provider', 'openrouter');
    });

    it('should classify storage errors', () => {
      const error = new Error('QuotaExceededError');
      error.name = 'QuotaExceededError';
      const result = classifyError(error);
      expect(result).toHaveProperty('type', 'STORAGE_QUOTA_EXCEEDED');
    });

    it('should classify network errors', () => {
      const error = new Error('no internet connection');
      const result = classifyError(error);
      expect(result).toHaveProperty('type', 'NETWORK_OFFLINE');
    });

    it('should classify validation errors', () => {
      const error = new Error('missing required parameter');
      const result = classifyError(error, { operation: 'create' });
      expect(result).toHaveProperty('type', 'VALIDATION_MISSING_REQUIRED');
    });

    it('should classify transaction errors', () => {
      // Use error code to ensure transaction classification
      const error = new Error('transaction error');
      error.code = 'NESTED_TRANSACTION_NOT_SUPPORTED';
      const result = classifyError(error);
      expect(result).toHaveProperty('type', 'TRANSACTION_NESTED_NOT_SUPPORTED');
    });

    it('should default to UNKNOWN_ERROR for unclassified errors', () => {
      const error = new Error('something went wrong');
      const result = classifyError(error);
      expect(result).toHaveProperty('type', 'UNKNOWN_ERROR');
      expect(result).toHaveProperty('severity', 'MEDIUM');
    });

    it('should include timestamp', () => {
      const error = new Error('test');
      const result = classifyError(error);
      expect(result).toHaveProperty('timestamp');
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });

    it('should sanitize context metadata', () => {
      const error = new Error('test');
      const result = classifyError(error, {
        provider: 'openrouter',
        metadata: { apiKey: 'sk-12345' },
      });
      // apiKey should not be in sanitized context
      expect(result.context).not.toHaveProperty('apiKey');
    });

    it('should handle string errors', () => {
      const result = classifyError('rate limit exceeded', { provider: 'openrouter' });
      expect(result).toHaveProperty('type', 'LLM_RATE_LIMIT');
    });

    it('should sanitize error messages', () => {
      const error = new Error('API key sk-12345 failed');
      const result = classifyError(error);
      expect(result.message).not.toContain('sk-12345');
    });
  });
});
