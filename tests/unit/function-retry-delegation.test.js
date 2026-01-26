/**
 * Tests for FunctionRetry module delegation to resilient-retry.js
 *
 * Verifies that the refactored retry.js correctly delegates to resilient-retry.js
 * while maintaining backward compatibility.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FunctionRetry } from '../../js/functions/utils/retry.js';

describe('FunctionRetry Delegation to resilient-retry.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('isTransientError()', () => {
        it('should return true for transient network errors', () => {
            const error = new Error('network error');
            expect(FunctionRetry.isTransientError(error)).toBe(true);
        });

        it('should return true for timeout errors', () => {
            const error = new Error('request timeout');
            expect(FunctionRetry.isTransientError(error)).toBe(true);
        });

        it('should return true for 429 rate limit errors', () => {
            const error = new Error('429 rate limit exceeded');
            expect(FunctionRetry.isTransientError(error)).toBe(true);
        });

        it('should return true for 503 server errors', () => {
            const error = new Error('503 service unavailable');
            expect(FunctionRetry.isTransientError(error)).toBe(true);
        });

        it('should return false for AbortError (intentional cancellation)', () => {
            const error = new Error('AbortError');
            error.name = 'AbortError';
            expect(FunctionRetry.isTransientError(error)).toBe(false);
        });

        it('should return false for authentication errors (401)', () => {
            const error = new Error('401 unauthorized');
            expect(FunctionRetry.isTransientError(error)).toBe(false);
        });

        it('should return false for authentication errors (403)', () => {
            const error = new Error('403 forbidden');
            expect(FunctionRetry.isTransientError(error)).toBe(false);
        });

        it('should return true for fetch-related TypeErrors', () => {
            const error = new TypeError('Failed to fetch');
            error.name = 'TypeError';
            expect(FunctionRetry.isTransientError(error)).toBe(true);
        });
    });

    describe('withRetry()', () => {
        it('should succeed on first attempt for successful function', async () => {
            const mockFn = vi.fn().mockResolvedValue('success');
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            const result = await FunctionRetry.withRetry(mockFn, 'testFunction');

            expect(result).toBe('success');
            expect(mockFn).toHaveBeenCalledTimes(1);
            consoleSpy.mockRestore();
        });

        it('should retry transient errors and eventually succeed', async () => {
            let attempts = 0;
            const mockFn = vi.fn().mockImplementation(() => {
                attempts++;
                if (attempts < 2) {
                    throw new Error('network timeout');
                }
                return 'success';
            });

            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            const result = await FunctionRetry.withRetry(mockFn, 'testFunction');

            expect(result).toBe('success');
            expect(mockFn).toHaveBeenCalledTimes(2);
            expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
            // Verify the first argument contains the expected prefix
            expect(consoleWarnSpy.mock.calls[0][0]).toContain('[Functions] Attempt');
            expect(consoleWarnSpy.mock.calls[0][0]).toContain('testFunction failed');
            expect(consoleWarnSpy.mock.calls[0][1]).toBe('network timeout');

            consoleWarnSpy.mockRestore();
            consoleLogSpy.mockRestore();
        });

        it('should throw after max retries for persistent errors', async () => {
            const mockFn = vi.fn().mockRejectedValue(new Error('persistent error'));
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await expect(FunctionRetry.withRetry(mockFn, 'testFunction'))
                .rejects.toThrow('persistent error');

            expect(mockFn).toHaveBeenCalledTimes(3); // initial + 2 retries
            consoleSpy.mockRestore();
        });

        it('should not retry authentication errors', async () => {
            const mockFn = vi.fn().mockRejectedValue(new Error('401 unauthorized'));
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await expect(FunctionRetry.withRetry(mockFn, 'testFunction'))
                .rejects.toThrow('401 unauthorized');

            // Should only be called once (no retries for auth errors)
            expect(mockFn).toHaveBeenCalledTimes(1);
            consoleSpy.mockRestore();
        });

        it('should respect MAX_RETRIES constant', () => {
            expect(FunctionRetry.MAX_RETRIES).toBe(2);
        });
    });

    describe('Backward Compatibility', () => {
        it('should export FunctionRetry with expected API', () => {
            expect(FunctionRetry).toHaveProperty('MAX_RETRIES');
            expect(FunctionRetry).toHaveProperty('isTransientError');
            expect(FunctionRetry).toHaveProperty('withRetry');
        });

        it('should not export backoffDelay (removed in refactor)', () => {
            expect(FunctionRetry).not.toHaveProperty('backoffDelay');
        });

        it('should maintain positional arguments API: (fn, functionName)', async () => {
            const mockFn = vi.fn().mockResolvedValue('result');
            const result = await FunctionRetry.withRetry(mockFn, 'myFunction');
            expect(result).toBe('result');
        });
    });

    describe('Configuration Validation', () => {
        describe('validateRetryConfig()', () => {
            it('should throw error when MAX_FUNCTION_RETRIES < 0', () => {
                expect(() => {
                    FunctionRetry.validateRetryConfig(-1, 500);
                }).toThrow('MAX_FUNCTION_RETRIES must be between 0 and 10');
            });

            it('should throw error when MAX_FUNCTION_RETRIES > 10', () => {
                expect(() => {
                    FunctionRetry.validateRetryConfig(11, 500);
                }).toThrow('MAX_FUNCTION_RETRIES must be between 0 and 10');
            });

            it('should throw error when RETRY_BASE_DELAY_MS < 0', () => {
                expect(() => {
                    FunctionRetry.validateRetryConfig(2, -1);
                }).toThrow('RETRY_BASE_DELAY_MS must be between 0 and 60000');
            });

            it('should throw error when RETRY_BASE_DELAY_MS > 60000', () => {
                expect(() => {
                    FunctionRetry.validateRetryConfig(2, 60001);
                }).toThrow('RETRY_BASE_DELAY_MS must be between 0 and 60000');
            });

            it('should accept valid MAX_FUNCTION_RETRIES = 0', () => {
                expect(() => {
                    FunctionRetry.validateRetryConfig(0, 500);
                }).not.toThrow();
            });

            it('should accept valid MAX_FUNCTION_RETRIES = 10', () => {
                expect(() => {
                    FunctionRetry.validateRetryConfig(10, 500);
                }).not.toThrow();
            });

            it('should accept valid RETRY_BASE_DELAY_MS = 0', () => {
                expect(() => {
                    FunctionRetry.validateRetryConfig(2, 0);
                }).not.toThrow();
            });

            it('should accept valid RETRY_BASE_DELAY_MS = 60000', () => {
                expect(() => {
                    FunctionRetry.validateRetryConfig(2, 60000);
                }).not.toThrow();
            });

            it('should accept current default values', () => {
                expect(() => {
                    FunctionRetry.validateRetryConfig(FunctionRetry.MAX_RETRIES, 500);
                }).not.toThrow();
            });
        });
    });
});
