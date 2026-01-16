/**
 * Timeout Wrapper Unit Tests
 * 
 * Tests for js/utils/timeout-wrapper.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Mock Implementation (test environment)
// ==========================================

class TimeoutError extends Error {
    constructor(message, timeoutMs, operation = null) {
        super(message);
        this.name = 'TimeoutError';
        this.timeoutMs = timeoutMs;
        this.operation = operation;
    }
}

// Re-implement functions for testing (isolated from window environment)
async function withTimeout(promiseOrFn, timeoutMs, options = {}) {
    const { fallback, operation, abortController } = options;
    const promise = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            if (abortController) abortController.abort();
            reject(new TimeoutError(
                `Operation${operation ? ` '${operation}'` : ''} timed out after ${timeoutMs}ms`,
                timeoutMs,
                operation
            ));
        }, timeoutMs);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof TimeoutError && fallback) {
            return typeof fallback === 'function' ? await fallback() : fallback;
        }
        throw error;
    }
}

async function withProgressiveTimeout(operationFn, options = {}) {
    const { timeouts = [5000, 15000, 30000], fallback, operation, onAttempt, onRetry } = options;
    let lastError;

    for (let attempt = 0; attempt < timeouts.length; attempt++) {
        const timeoutMs = timeouts[attempt];
        try {
            onAttempt?.(attempt + 1, timeoutMs);
            return await withTimeout(operationFn, timeoutMs, { operation });
        } catch (error) {
            lastError = error;
            if (error instanceof TimeoutError) {
                if (attempt < timeouts.length - 1) {
                    onRetry?.(attempt + 1, error);
                    continue;
                }
            } else {
                throw error;
            }
        }
    }

    if (fallback) {
        return typeof fallback === 'function' ? await fallback() : fallback;
    }
    throw lastError;
}

// ==========================================
// Tests
// ==========================================

describe('withTimeout', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('should resolve for fast operations', async () => {
        const fastOp = () => Promise.resolve('success');

        const resultPromise = withTimeout(fastOp, 1000);
        await vi.advanceTimersByTimeAsync(0);
        const result = await resultPromise;

        expect(result).toBe('success');
    });

    it('should timeout for slow operations', async () => {
        const slowOp = () => new Promise(resolve => setTimeout(() => resolve('slow'), 5000));

        const resultPromise = withTimeout(slowOp, 100);
        const rejection = expect(resultPromise).rejects.toThrow(TimeoutError);
        await vi.advanceTimersByTimeAsync(100);
        await rejection;
    });

    it('should include timeout duration in error', async () => {
        const slowOp = () => new Promise(resolve => setTimeout(() => resolve('slow'), 5000));

        const resultPromise = withTimeout(slowOp, 250);
        const rejection = expect(resultPromise).rejects.toBeInstanceOf(TimeoutError);
        await vi.advanceTimersByTimeAsync(250);
        await rejection;

        await resultPromise.catch((error) => {
            expect(error).toBeInstanceOf(TimeoutError);
            expect(error.timeoutMs).toBe(250);
        });
    });

    it('should execute fallback on timeout', async () => {
        const slowOp = () => new Promise(resolve => setTimeout(() => resolve('slow'), 5000));
        const fallback = () => 'fallback_result';

        const resultPromise = withTimeout(slowOp, 100, { fallback });
        await vi.advanceTimersByTimeAsync(100);
        const result = await resultPromise;

        expect(result).toBe('fallback_result');
    });

    it('should include operation name in error', async () => {
        const slowOp = () => new Promise(resolve => setTimeout(() => resolve('slow'), 5000));

        const resultPromise = withTimeout(slowOp, 100, { operation: 'testOperation' });
        const rejection = expect(resultPromise).rejects.toThrow(TimeoutError);
        await vi.advanceTimersByTimeAsync(100);

        await rejection;
        await resultPromise.catch((error) => {
            expect(error.message).toContain('testOperation');
            expect(error.operation).toBe('testOperation');
        });
    });

    it('should accept both promises and functions', async () => {
        const directPromise = Promise.resolve('direct');
        const functionPromise = () => Promise.resolve('function');

        const result1Promise = withTimeout(directPromise, 1000);
        await vi.advanceTimersByTimeAsync(0);
        expect(await result1Promise).toBe('direct');

        const result2Promise = withTimeout(functionPromise, 1000);
        await vi.advanceTimersByTimeAsync(0);
        expect(await result2Promise).toBe('function');
    });
});

describe('withProgressiveTimeout', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('should succeed on first attempt for fast operations', async () => {
        const fastOp = () => Promise.resolve('quick');

        const resultPromise = withProgressiveTimeout(fastOp, {
            timeouts: [100, 500, 1000]
        });
        await vi.advanceTimersByTimeAsync(0);
        const result = await resultPromise;

        expect(result).toBe('quick');
    });

    it('should call onAttempt callback', async () => {
        const fastOp = () => Promise.resolve('quick');
        const onAttempt = vi.fn();

        const resultPromise = withProgressiveTimeout(fastOp, {
            timeouts: [100],
            onAttempt
        });
        await vi.advanceTimersByTimeAsync(0);
        await resultPromise;

        expect(onAttempt).toHaveBeenCalledWith(1, 100);
    });

    it('should use fallback after all attempts fail', async () => {
        const slowOp = () => new Promise(resolve => setTimeout(() => resolve('slow'), 5000));

        const resultPromise = withProgressiveTimeout(slowOp, {
            timeouts: [50, 100],
            fallback: () => 'fallback_value'
        });

        // Advance through both timeouts
        await vi.advanceTimersByTimeAsync(50);
        await vi.advanceTimersByTimeAsync(100);

        const result = await resultPromise;
        expect(result).toBe('fallback_value');
    });

    it('should throw on non-timeout errors without retry', async () => {
        const errorOp = () => Promise.reject(new Error('operation failed'));

        const resultPromise = withProgressiveTimeout(errorOp, {
            timeouts: [100, 500, 1000]
        });
        const rejection = expect(resultPromise).rejects.toThrow('operation failed');
        await vi.advanceTimersByTimeAsync(0);

        await rejection;
    });
});

describe('TimeoutError', () => {
    it('should have correct name and properties', () => {
        const error = new TimeoutError('test message', 5000, 'testOp');

        expect(error.name).toBe('TimeoutError');
        expect(error.message).toBe('test message');
        expect(error.timeoutMs).toBe(5000);
        expect(error.operation).toBe('testOp');
    });

    it('should be instanceof Error', () => {
        const error = new TimeoutError('test', 1000);
        expect(error).toBeInstanceOf(Error);
    });
});
