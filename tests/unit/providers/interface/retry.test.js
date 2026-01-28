/**
 * Retry Module Unit Tests
 *
 * Tests for the provider interface retry logic module.
 */

import { describe, it, expect } from 'vitest';
import {
    isRetryableError,
    calculateRetryDelay,
    delay,
    extractRetryAfter
} from '../../../../js/providers/interface/retry.js';

describe('Provider Interface Retry Logic', () => {
    describe('isRetryableError', () => {
        it('should return true for AbortError', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            expect(isRetryableError(error)).toBe(true);
        });

        it('should return true for timeout errors', () => {
            const error = new Error('Request timeout');
            expect(isRetryableError(error)).toBe(true);
        });

        it('should return true for 429 rate limit errors', () => {
            const error = new Error('429 Too Many Requests');
            expect(isRetryableError(error)).toBe(true);
        });

        it('should return true for 5xx server errors', () => {
            expect(isRetryableError(new Error('500 Internal Server Error'))).toBe(true);
            expect(isRetryableError(new Error('502 Bad Gateway'))).toBe(true);
            expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
            expect(isRetryableError(new Error('504 Gateway Timeout'))).toBe(true);
        });

        it('should return true for network errors', () => {
            expect(isRetryableError(new Error('network error'))).toBe(true);
            expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
            expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
        });

        it('should return false for non-retryable errors', () => {
            expect(isRetryableError(new Error('400 Bad Request'))).toBe(false);
            expect(isRetryableError(new Error('401 Unauthorized'))).toBe(false);
            expect(isRetryableError(new Error('404 Not Found'))).toBe(false);
        });

        it('should return false for null/undefined', () => {
            expect(isRetryableError(null)).toBe(false);
            expect(isRetryableError(undefined)).toBe(false);
        });
    });

    describe('calculateRetryDelay', () => {
        it('should calculate exponential backoff', () => {
            const delay0 = calculateRetryDelay(0);
            const delay1 = calculateRetryDelay(1);
            const delay2 = calculateRetryDelay(2);

            expect(delay1).toBeGreaterThan(delay0);
            expect(delay2).toBeGreaterThan(delay1);
        });

        it('should cap at max delay', () => {
            const delay10 = calculateRetryDelay(10);
            expect(delay10).toBeLessThanOrEqual(10000 + 100); // MAX_DELAY_MS + JITTER_MS
        });

        it('should add jitter', () => {
            const delay = calculateRetryDelay(0);
            // Base delay for attempt 0 is 1000ms, jitter is 0-100ms
            expect(delay).toBeGreaterThanOrEqual(1000);
            expect(delay).toBeLessThanOrEqual(1100);
        });
    });

    describe('delay', () => {
        it('should resolve after specified time', async () => {
            const start = Date.now();
            await delay(100);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(95); // Allow small margin
            expect(elapsed).toBeLessThan(200);
        });
    });

    describe('extractRetryAfter', () => {
        it('should extract seconds from Retry-After header', () => {
            const error = {
                response: {
                    headers: {
                        get: (header) => header === 'Retry-After' ? '120' : null
                    }
                }
            };
            const delay = extractRetryAfter(error);
            expect(delay).toBe(120000); // 120 seconds in ms
        });

        it('should parse HTTP-date format', () => {
            const futureDate = new Date(Date.now() + 60000);
            const error = {
                response: {
                    headers: {
                        get: (header) => header === 'Retry-After' ? futureDate.toUTCString() : null
                    }
                }
            };
            const delayMs = extractRetryAfter(error);
            expect(delayMs).toBeGreaterThan(0);
            expect(delayMs).toBeLessThanOrEqual(60000);
        });

        it('should cap HTTP-date delay at 1 hour', () => {
            const farFuture = new Date(Date.now() + 7200000); // 2 hours
            const error = {
                response: {
                    headers: {
                        get: (header) => header === 'Retry-After' ? farFuture.toUTCString() : null
                    }
                }
            };
            const delayMs = extractRetryAfter(error);
            expect(delayMs).toBe(3600000); // Capped at 1 hour
        });

        it('should return default delay for rate limit errors', () => {
            const error = {
                message: '429 rate limit exceeded'
            };
            const delay = extractRetryAfter(error);
            expect(delay).toBe(60000);
        });

        it('should return 0 when no Retry-After header', () => {
            const error = {
                response: {
                    headers: {
                        get: () => null
                    }
                }
            };
            const delay = extractRetryAfter(error);
            expect(delay).toBe(0);
        });

        it('should return 0 for errors without response', () => {
            const error = new Error('Some error');
            const delay = extractRetryAfter(error);
            expect(delay).toBe(0);
        });
    });
});
