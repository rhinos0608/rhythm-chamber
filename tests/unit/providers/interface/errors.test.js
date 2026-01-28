/**
 * Errors Module Unit Tests
 *
 * Tests for the provider interface error handling module.
 */

import { describe, it, expect } from 'vitest';
import { normalizeProviderError, safeJSONParse } from '../../../../js/providers/interface/errors.js';

describe('Provider Interface Error Handling', () => {
    describe('normalizeProviderError', () => {
        it('should normalize timeout errors', () => {
            const error = new Error('Request timed out');
            error.name = 'AbortError';

            const normalized = normalizeProviderError(error, 'openrouter');

            expect(normalized.type).toBe('timeout');
            expect(normalized.recoverable).toBe(true);
            expect(normalized.provider).toBe('openrouter');
            expect(normalized.suggestion).toContain('Try again');
        });

        it('should normalize auth errors (401)', () => {
            const error = new Error('401 Unauthorized');

            const normalized = normalizeProviderError(error, 'openrouter');

            expect(normalized.type).toBe('auth');
            expect(normalized.recoverable).toBe(true);
            expect(normalized.suggestion).toContain('API key');
        });

        it('should normalize rate limit errors (429)', () => {
            const error = new Error('429 Rate limit exceeded');

            const normalized = normalizeProviderError(error, 'openrouter');

            expect(normalized.type).toBe('rate_limit');
            expect(normalized.recoverable).toBe(true);
            expect(normalized.suggestion).toContain('Wait');
        });

        it('should normalize connection errors', () => {
            const error = new Error('ECONNREFUSED');

            const normalized = normalizeProviderError(error, 'ollama');

            expect(normalized.type).toBe('connection');
            expect(normalized.recoverable).toBe(true);
            expect(normalized.suggestion).toContain('Start ollama');
        });

        it('should handle unknown errors', () => {
            const error = new Error('Unknown error');

            const normalized = normalizeProviderError(error, 'openrouter');

            expect(normalized.type).toBe('unknown');
            expect(normalized.recoverable).toBe(false);
        });

        it('should preserve original error', () => {
            const originalError = new Error('Original error');
            const normalized = normalizeProviderError(originalError, 'test');

            expect(normalized.originalError).toBe(originalError);
        });

        it('should include provider name', () => {
            const error = new Error('Some error');
            const normalized = normalizeProviderError(error, 'gemini');

            expect(normalized.provider).toBe('gemini');
        });
    });

    describe('safeJSONParse', () => {
        it('should parse valid JSON', async () => {
            const response = {
                headers: {
                    get: (header) => header === 'content-type' ? 'application/json' : null
                },
                json: async () => ({ data: 'test' }),
                clone: function() { return this; }
            };

            const result = await safeJSONParse(response);
            expect(result).toEqual({ data: 'test' });
        });

        it('should return fallback for non-JSON content type', async () => {
            const response = {
                headers: {
                    get: (header) => header === 'content-type' ? 'text/html' : null
                },
                clone: function() { return this; }
            };

            const result = await safeJSONParse(response, { fallback: true });
            expect(result).toEqual({ fallback: true });
        });

        it('should return fallback for JSON parse errors', async () => {
            const response = {
                headers: {
                    get: (header) => header === 'content-type' ? 'application/json' : null
                },
                json: async () => {
                    throw new SyntaxError('Invalid JSON');
                },
                text: async () => 'invalid json',
                clone: function() { return this; }
            };

            const result = await safeJSONParse(response, null);
            expect(result).toBeNull();
        });

        it('should use default fallback if not provided', async () => {
            const response = {
                headers: {
                    get: (header) => header === 'content-type' ? 'application/json' : null
                },
                json: async () => {
                    throw new SyntaxError('Invalid JSON');
                },
                text: async () => 'invalid json',
                clone: function() { return this; }
            };

            const result = await safeJSONParse(response);
            expect(result).toBeNull();
        });

        it('should handle missing content-type header', async () => {
            const response = {
                headers: {
                    get: () => null
                },
                json: async () => ({ data: 'test' }),
                clone: function() { return this; }
            };

            const result = await safeJSONParse(response);
            expect(result).toEqual({ data: 'test' });
        });
    });
});
