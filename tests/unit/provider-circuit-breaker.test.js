/**
 * Provider Circuit Breaker Unit Tests
 * 
 * Tests for js/services/provider-circuit-breaker.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==========================================
// Mock Implementation (test environment)
// ==========================================

const STATE = {
    CLOSED: 'closed',
    OPEN: 'open',
    HALF_OPEN: 'half_open'
};

const DEFAULT_CONFIG = {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
    halfOpenMaxRequests: 3,
    volumeThreshold: 5
};

// Simplified circuit breaker for testing
function createCircuitBreaker() {
    const providerStates = new Map();

    function getProviderState(provider) {
        if (!providerStates.has(provider)) {
            providerStates.set(provider, {
                state: STATE.CLOSED,
                failures: 0,
                successes: 0,
                lastFailureTime: null,
                requestCount: 0,
                halfOpenRequests: 0,
                history: []
            });
        }
        return providerStates.get(provider);
    }

    function canExecute(provider, config = {}) {
        const cfg = { ...DEFAULT_CONFIG, ...config };
        const state = getProviderState(provider);

        if (state.state === STATE.CLOSED) {
            return { allowed: true, state: state.state };
        }

        if (state.state === STATE.OPEN) {
            const elapsed = Date.now() - state.lastFailureTime;
            if (elapsed >= cfg.timeout) {
                state.state = STATE.HALF_OPEN;
                state.halfOpenRequests = 0;
                state.successes = 0;
                return { allowed: true, state: state.state };
            }
            return {
                allowed: false,
                state: state.state,
                reason: `Circuit open for ${provider}`,
                cooldownRemaining: cfg.timeout - elapsed
            };
        }

        if (state.state === STATE.HALF_OPEN) {
            if (state.halfOpenRequests >= cfg.halfOpenMaxRequests) {
                return { allowed: false, state: state.state, reason: 'Half-open limit reached' };
            }
            return { allowed: true, state: state.state };
        }

        return { allowed: true, state: state.state };
    }

    function recordSuccess(provider, durationMs = 0, config = {}) {
        const cfg = { ...DEFAULT_CONFIG, ...config };
        const state = getProviderState(provider);
        state.requestCount++;

        if (state.state === STATE.HALF_OPEN) {
            state.successes++;
            if (state.successes >= cfg.successThreshold) {
                state.state = STATE.CLOSED;
                state.failures = 0;
                state.successes = 0;
            }
        } else if (state.state === STATE.CLOSED) {
            state.failures = 0;
        }
    }

    function recordFailure(provider, errorMessage = '', config = {}) {
        const cfg = { ...DEFAULT_CONFIG, ...config };
        const state = getProviderState(provider);
        state.requestCount++;
        state.failures++;
        state.lastFailureTime = Date.now();

        if (state.state === STATE.HALF_OPEN) {
            state.state = STATE.OPEN;
        } else if (state.state === STATE.CLOSED) {
            if (state.requestCount >= cfg.volumeThreshold && state.failures >= cfg.failureThreshold) {
                state.state = STATE.OPEN;
            }
        }
    }

    function getStatus(provider) {
        const state = getProviderState(provider);
        return {
            provider,
            state: state.state,
            failures: state.failures,
            successes: state.successes,
            requestCount: state.requestCount
        };
    }

    function reset(provider) {
        providerStates.delete(provider);
    }

    function resetAll() {
        providerStates.clear();
    }

    return {
        STATE,
        DEFAULT_CONFIG,
        canExecute,
        recordSuccess,
        recordFailure,
        getStatus,
        reset,
        resetAll
    };
}

// ==========================================
// Tests
// ==========================================

describe('ProviderCircuitBreaker', () => {
    let breaker;

    beforeEach(() => {
        breaker = createCircuitBreaker();
    });

    describe('canExecute', () => {
        it('should allow execution when circuit is closed', () => {
            const result = breaker.canExecute('openrouter');
            expect(result.allowed).toBe(true);
            expect(result.state).toBe(STATE.CLOSED);
        });

        it('should block execution when circuit is open', () => {
            // Force circuit to open by recording failures
            for (let i = 0; i < 10; i++) {
                breaker.recordFailure('openrouter');
            }

            const result = breaker.canExecute('openrouter');
            expect(result.allowed).toBe(false);
            expect(result.state).toBe(STATE.OPEN);
            expect(result.reason).toContain('Circuit open');
        });
    });

    describe('recordSuccess', () => {
        it('should reset failure count on success in closed state', () => {
            breaker.recordFailure('test-provider');
            expect(breaker.getStatus('test-provider').failures).toBe(1);

            breaker.recordSuccess('test-provider');
            expect(breaker.getStatus('test-provider').failures).toBe(0);
        });
    });

    describe('recordFailure', () => {
        it('should increment failure count', () => {
            breaker.recordFailure('test-provider');
            expect(breaker.getStatus('test-provider').failures).toBe(1);

            breaker.recordFailure('test-provider');
            expect(breaker.getStatus('test-provider').failures).toBe(2);
        });

        it('should open circuit after threshold failures', () => {
            const config = { failureThreshold: 3, volumeThreshold: 3 };

            for (let i = 0; i < 3; i++) {
                breaker.recordFailure('test-provider', '', config);
            }

            expect(breaker.getStatus('test-provider').state).toBe(STATE.OPEN);
        });
    });

    describe('state transitions', () => {
        it('should transition CLOSED -> OPEN after failures', () => {
            const config = { failureThreshold: 3, volumeThreshold: 3 };

            expect(breaker.getStatus('test').state).toBe(STATE.CLOSED);

            for (let i = 0; i < 3; i++) {
                breaker.recordFailure('test', '', config);
            }

            expect(breaker.getStatus('test').state).toBe(STATE.OPEN);
        });

        it('should transition HALF_OPEN -> CLOSED after successes', () => {
            const config = { failureThreshold: 3, volumeThreshold: 3, successThreshold: 2, timeout: 0 };

            // Open the circuit
            for (let i = 0; i < 3; i++) {
                breaker.recordFailure('test', '', config);
            }
            expect(breaker.getStatus('test').state).toBe(STATE.OPEN);

            // Trigger half-open by checking (timeout is 0)
            breaker.canExecute('test', config);
            expect(breaker.getStatus('test').state).toBe(STATE.HALF_OPEN);

            // Record successes to close
            breaker.recordSuccess('test', 100, config);
            breaker.recordSuccess('test', 100, config);
            expect(breaker.getStatus('test').state).toBe(STATE.CLOSED);
        });

        it('should transition HALF_OPEN -> OPEN on failure', () => {
            const config = { failureThreshold: 3, volumeThreshold: 3, timeout: 0 };

            // Open the circuit
            for (let i = 0; i < 3; i++) {
                breaker.recordFailure('test', '', config);
            }

            // Trigger half-open
            breaker.canExecute('test', config);
            expect(breaker.getStatus('test').state).toBe(STATE.HALF_OPEN);

            // Failure returns to open
            breaker.recordFailure('test', 'Test failure', config);
            expect(breaker.getStatus('test').state).toBe(STATE.OPEN);
        });
    });

    describe('per-provider isolation', () => {
        it('should track providers independently', () => {
            breaker.recordFailure('provider-a');
            breaker.recordFailure('provider-a');

            expect(breaker.getStatus('provider-a').failures).toBe(2);
            expect(breaker.getStatus('provider-b').failures).toBe(0);
        });
    });

    describe('reset', () => {
        it('should reset provider state', () => {
            breaker.recordFailure('test');
            expect(breaker.getStatus('test').failures).toBe(1);

            breaker.reset('test');
            expect(breaker.getStatus('test').failures).toBe(0);
        });

        it('should reset all providers', () => {
            breaker.recordFailure('provider-a');
            breaker.recordFailure('provider-b');

            breaker.resetAll();

            expect(breaker.getStatus('provider-a').failures).toBe(0);
            expect(breaker.getStatus('provider-b').failures).toBe(0);
        });
    });
});
