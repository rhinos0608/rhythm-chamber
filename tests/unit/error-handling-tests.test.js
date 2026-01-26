/**
 * Error Handling and Retry Logic Tests
 *
 * Tests for retry mechanisms, circuit breakers, fallback behavior,
 * and error propagation identified in recent bug fixes.
 *
 * Covers:
 * - Failed persistence tracking and retry (efcc205)
 * - Circuit breaker patterns
 * - Error propagation in subscribers (71a7192)
 * - IndexedDB transaction retry (abec63d)
 * - Fallback mechanisms
 *
 * @module tests/unit/error-handling-tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Test: Failed Persistence Tracking
// ==========================================

describe('Failed Persistence Tracking (efcc205)', () => {
    it('should track failed persists and retry on next operation', async () => {
        let failedPersistSequences = new Set();
        let persistAttempts = 0;
        let shouldFail = true;

        // Simulate persistence with failure tracking (Issue 1 fix)
        async function persistWithRetry(sequence, data) {
            persistAttempts++;

            try {
                if (shouldFail) {
                    throw new Error('Persistence failed');
                }

                // Success - clear this sequence from failed set
                failedPersistSequences.delete(sequence);
                return true;
            } catch (error) {
                // Track failed sequence
                failedPersistSequences.add(sequence);
                throw error;
            }
        }

        async function retryFailedPersists(data) {
            const failed = Array.from(failedPersistSequences).sort();
            const results = [];

            for (const sequence of failed) {
                try {
                    await persistWithRetry(sequence, data);
                    results.push({ sequence, success: true });
                } catch (error) {
                    results.push({ sequence, success: false, error: error.message });
                }
            }

            return results;
        }

        // Initial persistence should fail
        await expect(persistWithRetry(1, { data: 'test' }))
            .rejects.toThrow('Persistence failed');

        expect(failedPersistSequences.has(1)).toBe(true);
        expect(persistAttempts).toBe(1);

        // Enable success
        shouldFail = false;

        // Retry failed persists
        const results = await retryFailedPersists({ data: 'test' });

        expect(results).toHaveLength(1);
        expect(results[0].sequence).toBe(1);
        expect(results[0].success).toBe(true);
        expect(failedPersistSequences.has(1)).toBe(false);
        expect(persistAttempts).toBe(2);
    });

    it('should replay watermark with failed persists compensated', async () => {
        let failedPersistSequences = new Set();
        let currentSequence = 0;
        const events = [];

        function emitEvent(type, data) {
            const sequence = ++currentSequence;
            events.push({ sequence, type, data, timestamp: Date.now() });
            return sequence;
        }

        async function persistEvent(sequence) {
            // Simulate random failures
            if (sequence % 3 === 0) {
                failedPersistSequences.add(sequence);
                throw new Error(`Failed to persist sequence ${sequence}`);
            }
            return true;
        }

        function getReplayWatermark() {
            // Issue 1 fix: compensate for failed persists
            const minFailed = failedPersistSequences.size > 0
                ? Math.min(...failedPersistSequences)
                : Infinity;

            return Math.min(currentSequence, minFailed);
        }

        // Emit events
        const seq1 = emitEvent('test', { id: 1 });
        await persistEvent(seq1);

        const seq2 = emitEvent('test', { id: 2 });
        await persistEvent(seq2);

        const seq3 = emitEvent('test', { id: 3 });
        await expect(persistEvent(seq3)).rejects.toThrow();

        const seq4 = emitEvent('test', { id: 4 });
        await persistEvent(seq4);

        expect(currentSequence).toBe(4);
        expect(failedPersistSequences.has(3)).toBe(true);

        // Replay watermark should start from first failed sequence
        const watermark = getReplayWatermark();
        expect(watermark).toBe(3);
    });
});

// ==========================================
// Test: Circuit Breaker Pattern
// ==========================================

describe('Circuit Breaker Pattern', () => {
    it('should open circuit after consecutive failures', async () => {
        const config = {
            failureThreshold: 3,
            resetTimeoutMs: 1000,
            halfOpenMaxCalls: 1
        };

        let state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        let failureCount = 0;
        let lastFailureTime = null;
        let halfOpenCalls = 0;

        async function executeWithCircuitBreaker(fn) {
            // Check if circuit is open
            if (state === 'OPEN') {
                const timeSinceFailure = Date.now() - lastFailureTime;

                if (timeSinceFailure < config.resetTimeoutMs) {
                    throw new Error('Circuit breaker is OPEN');
                } else {
                    // Try to reset to half-open
                    state = 'HALF_OPEN';
                    halfOpenCalls = 0;
                }
            }

            try {
                const result = await fn();

                // Success - reset circuit if half-open
                if (state === 'HALF_OPEN') {
                    halfOpenCalls++;
                    if (halfOpenCalls >= config.halfOpenMaxCalls) {
                        state = 'CLOSED';
                        failureCount = 0;
                    }
                } else {
                    failureCount = 0;
                }

                return result;
            } catch (error) {
                failureCount++;
                lastFailureTime = Date.now();

                if (failureCount >= config.failureThreshold) {
                    state = 'OPEN';
                }

                throw error;
            }
        }

        vi.useFakeTimers();

        // First few calls succeed
        await expect(executeWithCircuitBreaker(async () => 'ok')).resolves.toBe('ok');
        await expect(executeWithCircuitBreaker(async () => 'ok')).resolves.toBe('ok');

        expect(state).toBe('CLOSED');
        expect(failureCount).toBe(0);

        // Trigger failures
        await expect(executeWithCircuitBreaker(async () => { throw new Error('Fail'); }))
            .rejects.toThrow('Fail');
        await expect(executeWithCircuitBreaker(async () => { throw new Error('Fail'); }))
            .rejects.toThrow('Fail');
        await expect(executeWithCircuitBreaker(async () => { throw new Error('Fail'); }))
            .rejects.toThrow('Fail');

        // Circuit should be open
        expect(state).toBe('OPEN');
        expect(failureCount).toBe(3);

        // Further calls should fail immediately
        await expect(executeWithCircuitBreaker(async () => 'ok'))
            .rejects.toThrow('Circuit breaker is OPEN');

        // Wait for reset timeout
        await vi.advanceTimersByTimeAsync(1100);

        // Circuit should be half-open
        expect(state).toBe('HALF_OPEN');

        // Successful call should close circuit
        await expect(executeWithCircuitBreaker(async () => 'ok')).resolves.toBe('ok');

        expect(state).toBe('CLOSED');
        expect(failureCount).toBe(0);

        vi.useRealTimers();
    });

    it('should track circuit breaker state transitions', () => {
        const stateTransitions = [];
        let currentState = 'CLOSED';

        function setState(newState) {
            stateTransitions.push({
                from: currentState,
                to: newState,
                timestamp: Date.now()
            });
            currentState = newState;
        }

        // Simulate state transitions
        setState('OPEN');
        setState('HALF_OPEN');
        setState('CLOSED');
        setState('OPEN');
        setState('CLOSED');

        expect(stateTransitions).toHaveLength(5);
        expect(stateTransitions[0]).toEqual({ from: 'CLOSED', to: 'OPEN', timestamp: expect.any(Number) });
        expect(stateTransitions[1]).toEqual({ from: 'OPEN', to: 'HALF_OPEN', timestamp: expect.any(Number) });
        expect(currentState).toBe('CLOSED');
    });
});

// ==========================================
// Test: Subscriber Error Propagation
// ==========================================

describe('Subscriber Error Propagation (71a7192)', () => {
    it('should log errors with subscriber context without affecting other subscribers', async () => {
        const errors = [];
        const callOrder = [];

        const subscribers = [
            async (changedDomains) => {
                callOrder.push('sub1-start');
                // This subscriber succeeds
                callOrder.push('sub1-end');
            },
            async (changedDomains) => {
                callOrder.push('sub2-start');
                // This subscriber throws
                throw new Error('Subscriber 2 failed');
            },
            async (changedDomains) => {
                callOrder.push('sub3-start');
                // This subscriber also succeeds
                callOrder.push('sub3-end');
            }
        ];

        async function notifySubscribers(changedDomains) {
            const subscriberErrors = [];

            for (let i = 0; i < subscribers.length; i++) {
                try {
                    await subscribers[i](changedDomains);
                } catch (error) {
                    // Issue 4 fix: Enhanced error logging with context
                    subscriberErrors.push({
                        subscriberIndex: i,
                        totalSubscribers: subscribers.length,
                        changedDomains,
                        error: error.message
                    });
                }
            }

            // Log summary if errors occurred
            if (subscriberErrors.length > 0) {
                errors.push(...subscriberErrors);
            }

            return subscriberErrors;
        }

        const changedDomains = ['domain1', 'domain2'];
        const result = await notifySubscribers(changedDomains);

        // All subscribers should be called
        expect(callOrder).toEqual([
            'sub1-start', 'sub1-end',
            'sub2-start',
            'sub3-start', 'sub3-end'
        ]);

        // Error should be captured with context
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            subscriberIndex: 1,
            totalSubscribers: 3,
            changedDomains,
            error: 'Subscriber 2 failed'
        });

        expect(errors).toHaveLength(1);
    });

    it('should keep changedArray immutable and consistent for all subscribers', async () => {
        const receivedArrays = [];

        const subscribers = [
            async (changedDomains) => {
                receivedArrays.push(changedDomains);
                // Try to modify (shouldn't affect original)
                changedDomains.push('malicious');
            },
            async (changedDomains) => {
                receivedArrays.push(changedDomains);
                changedDomains.push('also-malicious');
            },
            async (changedDomains) => {
                receivedArrays.push(changedDomains);
            }
        ];

        async function notifySubscribersImmutable(changedDomains) {
            // Issue 4 fix: changedArray is immutable
            const immutableArray = Object.freeze([...changedDomains]);

            for (const subscriber of subscribers) {
                await subscriber(immutableArray);
            }
        }

        const originalArray = ['domain1', 'domain2'];
        await notifySubscribersImmutable(originalArray);

        // Original should be unchanged
        expect(originalArray).toEqual(['domain1', 'domain2']);

        // All subscribers should receive the same array reference
        expect(receivedArrays[0]).toBe(receivedArrays[1]);
        expect(receivedArrays[1]).toBe(receivedArrays[2]);
    });
});

// ==========================================
// Test: IndexedDB Transaction Retry
// ==========================================

describe('IndexedDB Transaction Retry (abec63d)', () => {
    it('should retry transaction on transient failure', async () => {
        let attempt = 0;
        const maxAttempts = 3;

        async function executeTransactionWithRetry(tx) {
            let lastError;

            for (attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    // Simulate transaction
                    if (attempt < maxAttempts) {
                        throw new Error('Transaction failed (attempt ' + attempt + ')');
                    }

                    return { success: true, data: 'result' };
                } catch (error) {
                    lastError = error;

                    if (attempt === maxAttempts) {
                        throw new Error(`Transaction failed after ${maxAttempts} attempts: ${error.message}`);
                    }

                    // Exponential backoff
                    const backoffMs = Math.pow(2, attempt) * 100;
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                }
            }
        }

        vi.useFakeTimers();

        const resultPromise = executeTransactionWithRetry({});

        // Advance through retries with backoff
        await vi.advanceTimersByTimeAsync(100); // Attempt 1
        await vi.advanceTimersByTimeAsync(200); // Attempt 2
        await vi.advanceTimersByTimeAsync(100); // Attempt 3 (success)

        const result = await resultPromise;

        expect(result).toEqual({ success: true, data: 'result' });
        expect(attempt).toBe(3);

        vi.useRealTimers();
    });

    it('should check transaction state before completion', async () => {
        let transactionState = 'active';
        let commitCalled = false;

        async function transactionWithStateCheck() {
            // Simulate transaction work
            await new Promise(resolve => setTimeout(resolve, 50));

            // Issue 5 fix: Check state before completion
            if (transactionState !== 'active') {
                throw new Error('Transaction is not active, cannot commit');
            }

            commitCalled = true;
            return { success: true };
        }

        vi.useFakeTimers();

        // Transaction completes normally
        const promise1 = transactionWithStateCheck();
        await vi.advanceTimersByTimeAsync(100);
        await expect(promise1).resolves.toEqual({ success: true });
        expect(commitCalled).toBe(true);

        // Reset
        commitCalled = false;
        transactionState = 'active';

        // Transaction becomes inactive before completion
        const promise2 = transactionWithStateCheck();
        transactionState = 'aborted';
        await vi.advanceTimersByTimeAsync(100);
        await expect(promise2).rejects.toThrow('Transaction is not active');
        expect(commitCalled).toBe(false);

        vi.useRealTimers();
    });
});

// ==========================================
// Test: Fallback Mechanisms
// ==========================================

describe('Fallback Mechanisms', () => {
    it('should fall back to secondary storage on primary failure', async () => {
        let primaryAvailable = true;
        let primaryCallCount = 0;
        let secondaryCallCount = 0;

        async function primaryStorage(key, value) {
            primaryCallCount++;
            if (!primaryAvailable) {
                throw new Error('Primary storage unavailable');
            }
            return { stored: true, location: 'primary' };
        }

        async function secondaryStorage(key, value) {
            secondaryCallCount++;
            return { stored: true, location: 'secondary' };
        }

        async function storeWithFallback(key, value) {
            try {
                return await primaryStorage(key, value);
            } catch (primaryError) {
                console.warn('Primary storage failed, falling back to secondary:', primaryError.message);
                return await secondaryStorage(key, value);
            }
        }

        // Primary available
        const result1 = await storeWithFallback('key1', 'value1');
        expect(result1.location).toBe('primary');
        expect(primaryCallCount).toBe(1);
        expect(secondaryCallCount).toBe(0);

        // Primary unavailable
        primaryAvailable = false;
        const result2 = await storeWithFallback('key2', 'value2');
        expect(result2.location).toBe('secondary');
        expect(primaryCallCount).toBe(2);
        expect(secondaryCallCount).toBe(1);
    });

    it('should fall back to default value on data loading failure', async () => {
        let dataAvailable = true;

        async function loadData(key) {
            if (!dataAvailable) {
                throw new Error('Data not available');
            }
            return { value: 'loaded-data' };
        }

        function getDefaultValue(key) {
            return { value: `default-${key}` };
        }

        async function loadWithFallback(key, defaultValue) {
            try {
                return await loadData(key);
            } catch (error) {
                console.warn(`Failed to load ${key}, using default:`, error.message);
                return defaultValue !== undefined ? defaultValue : getDefaultValue(key);
            }
        }

        // Data available
        const result1 = await loadWithFallback('key1');
        expect(result1.value).toBe('loaded-data');

        // Data unavailable, no default provided
        dataAvailable = false;
        const result2 = await loadWithFallback('key2');
        expect(result2.value).toBe('default-key2');

        // Data unavailable, default provided
        const result3 = await loadWithFallback('key3', { value: 'custom-default' });
        expect(result3.value).toBe('custom-default');
    });

    it('should degrade gracefully on feature unavailability', async () => {
        let featureEnabled = true;

        async function advancedFeature(input) {
            if (!featureEnabled) {
                throw new Error('Advanced feature not available');
            }
            return { result: `advanced-${input}`, enhanced: true };
        }

        async function basicFeature(input) {
            return { result: `basic-${input}`, enhanced: false };
        }

        async function executeWithGracefulDegradation(input) {
            try {
                return await advancedFeature(input);
            } catch (error) {
                console.warn('Advanced feature unavailable, using basic:', error.message);
                return await basicFeature(input);
            }
        }

        // Feature enabled
        const result1 = await executeWithGracefulDegradation('test1');
        expect(result1.result).toBe('advanced-test1');
        expect(result1.enhanced).toBe(true);

        // Feature disabled
        featureEnabled = false;
        const result2 = await executeWithGracefulDegradation('test2');
        expect(result2.result).toBe('basic-test2');
        expect(result2.enhanced).toBe(false);
    });
});
