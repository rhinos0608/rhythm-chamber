/**
 * Provider Circuit Breaker
 *
 * @deprecated This module is DEPRECATED. Use ProviderHealthAuthority instead.
 *
 * ProviderHealthAuthority unifies:
 * - Circuit breaker state (this module)
 * - Blacklist management (from ProviderFallbackChain)
 * - Health metrics (from ProviderFallbackChain._providerHealth)
 * - Health status for UI (from ProviderHealthMonitor)
 *
 * Migration:
 *   // Before (deprecated):
 *   import { ProviderCircuitBreaker } from './provider-circuit-breaker.js';
 *   ProviderCircuitBreaker.canExecute(provider);
 *   ProviderCircuitBreaker.recordSuccess(provider, latencyMs);
 *   ProviderCircuitBreaker.recordFailure(provider, error);
 *
 *   // After (use this):
 *   import { ProviderHealthAuthority } from './provider-health-authority.js';
 *   ProviderHealthAuthority.canExecute(provider);
 *   ProviderHealthAuthority.recordSuccess(provider, latencyMs);
 *   ProviderHealthAuthority.recordFailure(provider, error);
 *
 * Key improvements in ProviderHealthAuthority:
 * - Emits CIRCUIT_BREAKER:TRIPPED and CIRCUIT_BREAKER:RECOVERED events (this module didn't!)
 * - Unified blacklist and circuit breaker state (no duplicate tracking)
 * - Single source of truth for all health data
 *
 * This module is kept for backwards compatibility during transition.
 * It will be removed in a future version.
 *
 * Per-provider circuit breaker to prevent cascade failures when external
 * LLM services are degraded or unavailable.
 *
 * HNW Considerations:
 * - Hierarchy: Single authority for provider health decisions
 * - Network: Prevents cascade failures from unhealthy providers
 * - Wave: Time-based cooldown for recovery testing
 *
 * @module services/provider-circuit-breaker
 */

'use strict';

// ==========================================
// Constants
// ==========================================

/**
 * Circuit breaker states
 * @enum {string}
 */
const STATE = {
    CLOSED: 'closed', // Normal operation - requests allowed
    OPEN: 'open', // Failing - requests blocked
    HALF_OPEN: 'half_open', // Recovery testing - limited requests
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
    failureThreshold: 5, // Consecutive failures before opening circuit
    successThreshold: 2, // Successes in half-open to close circuit
    timeout: 60000, // Cooldown before transitioning to half-open (ms)
    halfOpenMaxRequests: 3, // Max requests allowed in half-open state
    volumeThreshold: 5, // Minimum requests before circuit can open
};

// ==========================================
// Per-Provider State
// ==========================================

/**
 * Provider state tracking
 * @type {Map<string, ProviderState>}
 */
const providerStates = new Map();

/**
 * @typedef {Object} ProviderState
 * @property {string} state - Current circuit state
 * @property {number} failures - Consecutive failure count
 * @property {number} successes - Successes in half-open state
 * @property {number} lastFailureTime - Timestamp of last failure
 * @property {number} requestCount - Total requests in current window
 * @property {number} halfOpenRequests - Requests made in half-open state
 * @property {Array<{timestamp: number, success: boolean, durationMs: number}>} history
 */

/**
 * Get or create provider state
 * @param {string} provider - Provider name
 * @returns {ProviderState}
 */
function getProviderState(provider) {
    if (!providerStates.has(provider)) {
        providerStates.set(provider, {
            state: STATE.CLOSED,
            failures: 0,
            successes: 0,
            lastFailureTime: null,
            requestCount: 0,
            halfOpenRequests: 0,
            history: [],
        });
    }
    return providerStates.get(provider);
}

// ==========================================
// Core Circuit Breaker Functions
// ==========================================

/**
 * Check if a request can be made to a provider
 * @param {string} provider - Provider name
 * @param {Object} [config] - Override default config
 * @returns {{ allowed: boolean, state: string, reason?: string }}
 */
function canExecute(provider, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const state = getProviderState(provider);

    // Always allow in closed state
    if (state.state === STATE.CLOSED) {
        return { allowed: true, state: state.state };
    }

    // Check cooldown in open state
    if (state.state === STATE.OPEN) {
        const elapsed = Date.now() - state.lastFailureTime;
        if (elapsed >= cfg.timeout) {
            // Transition to half-open
            state.state = STATE.HALF_OPEN;
            state.halfOpenRequests = 0;
            state.successes = 0;
            console.log(
                `[ProviderCircuitBreaker] ${provider}: OPEN → HALF_OPEN (cooldown elapsed)`
            );
            return { allowed: true, state: state.state };
        }
        return {
            allowed: false,
            state: state.state,
            reason: `Circuit open for ${provider}. Retry in ${Math.ceil((cfg.timeout - elapsed) / 1000)}s`,
            cooldownRemaining: cfg.timeout - elapsed,
        };
    }

    // Limit requests in half-open state
    if (state.state === STATE.HALF_OPEN) {
        if (state.halfOpenRequests >= cfg.halfOpenMaxRequests) {
            return {
                allowed: false,
                state: state.state,
                reason: `Circuit half-open for ${provider}. Waiting for test requests to complete.`,
            };
        }
        return { allowed: true, state: state.state };
    }

    return { allowed: true, state: state.state };
}

/**
 * Record a successful request
 * @param {string} provider - Provider name
 * @param {number} [durationMs] - Request duration in ms
 * @param {Object} [config] - Override default config
 */
function recordSuccess(provider, durationMs = 0, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const state = getProviderState(provider);

    state.requestCount++;
    state.history.push({ timestamp: Date.now(), success: true, durationMs });

    // Trim history to last 100 entries
    if (state.history.length > 100) {
        state.history = state.history.slice(-100);
    }

    if (state.state === STATE.HALF_OPEN) {
        state.successes++;
        if (state.successes >= cfg.successThreshold) {
            // Recovered! Close the circuit
            state.state = STATE.CLOSED;
            state.failures = 0;
            state.successes = 0;
            state.halfOpenRequests = 0;
            console.log(`[ProviderCircuitBreaker] ${provider}: HALF_OPEN → CLOSED (recovered)`);
        }
    } else if (state.state === STATE.CLOSED) {
        // Reset failure count on success in closed state
        state.failures = 0;
    }
}

/**
 * Record a failed request
 * @param {string} provider - Provider name
 * @param {string} [errorMessage] - Error message for logging
 * @param {Object} [config] - Override default config
 */
function recordFailure(provider, errorMessage = '', config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const state = getProviderState(provider);

    state.requestCount++;
    state.failures++;
    state.lastFailureTime = Date.now();
    state.history.push({ timestamp: Date.now(), success: false, error: errorMessage });

    // Trim history
    if (state.history.length > 100) {
        state.history = state.history.slice(-100);
    }

    if (state.state === STATE.HALF_OPEN) {
        // Any failure in half-open returns to open
        state.state = STATE.OPEN;
        state.halfOpenRequests = 0;
        console.warn(
            `[ProviderCircuitBreaker] ${provider}: HALF_OPEN → OPEN (test request failed: ${errorMessage})`
        );
    } else if (state.state === STATE.CLOSED) {
        // Check if we should open the circuit
        if (state.requestCount >= cfg.volumeThreshold && state.failures >= cfg.failureThreshold) {
            state.state = STATE.OPEN;
            console.warn(
                `[ProviderCircuitBreaker] ${provider}: CLOSED → OPEN (${state.failures} consecutive failures)`
            );
        }
    }
}

/**
 * Execute a function with circuit breaker protection
 * @param {string} provider - Provider name
 * @param {Function} fn - Async function to execute
 * @param {Object} [config] - Override default config
 * @returns {Promise<{ success: boolean, result?: any, error?: string, blocked?: boolean }>}
 */
async function execute(provider, fn, config = {}) {
    const checkResult = canExecute(provider, config);

    if (!checkResult.allowed) {
        return {
            success: false,
            error: checkResult.reason,
            blocked: true,
            state: checkResult.state,
        };
    }

    const state = getProviderState(provider);
    let incrementedHalfOpen = false;

    // FIX: Track if we incremented to ensure we always decrement
    if (state.state === STATE.HALF_OPEN) {
        state.halfOpenRequests++;
        incrementedHalfOpen = true;
    }

    const startTime = Date.now();

    try {
        const result = await fn();
        const durationMs = Date.now() - startTime;
        recordSuccess(provider, durationMs, config);
        return { success: true, result, durationMs, state: state.state };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        recordFailure(provider, message, config);
        return { success: false, error: message, state: state.state };
    } finally {
        // FIX: Ensure halfOpenRequests is always decremented if we incremented it
        // This prevents counter leaks if state changes mid-execution
        if (incrementedHalfOpen && state.halfOpenRequests > 0) {
            state.halfOpenRequests--;
        }
    }
}

/**
 * Get current status of a provider's circuit breaker
 * @param {string} provider - Provider name
 * @returns {Object} Circuit breaker status
 */
function getStatus(provider) {
    const state = getProviderState(provider);
    const now = Date.now();

    return {
        provider,
        state: state.state,
        failures: state.failures,
        successes: state.successes,
        requestCount: state.requestCount,
        isOpen: state.state === STATE.OPEN,
        isHalfOpen: state.state === STATE.HALF_OPEN,
        isClosed: state.state === STATE.CLOSED,
        lastFailureTime: state.lastFailureTime,
        cooldownRemaining:
            state.state === STATE.OPEN && state.lastFailureTime
                ? Math.max(0, DEFAULT_CONFIG.timeout - (now - state.lastFailureTime))
                : 0,
        recentHistory: state.history.slice(-10),
    };
}

/**
 * Get status of all tracked providers
 * @returns {Object} Map of provider names to status
 */
function getAllStatus() {
    const status = {};
    for (const provider of providerStates.keys()) {
        status[provider] = getStatus(provider);
    }
    return status;
}

/**
 * Reset a provider's circuit breaker
 * @param {string} provider - Provider name
 */
function reset(provider) {
    providerStates.delete(provider);
    console.log(`[ProviderCircuitBreaker] ${provider}: Circuit reset`);
}

/**
 * Reset all circuit breakers
 */
function resetAll() {
    providerStates.clear();
    console.log('[ProviderCircuitBreaker] All circuits reset');
}

/**
 * Force a provider into a specific state (for testing/recovery)
 * @param {string} provider - Provider name
 * @param {string} newState - Target state (STATE.CLOSED, STATE.OPEN, STATE.HALF_OPEN)
 */
function forceState(provider, newState) {
    const state = getProviderState(provider);
    const oldState = state.state;
    state.state = newState;

    if (newState === STATE.CLOSED) {
        state.failures = 0;
        state.successes = 0;
    }

    console.warn(`[ProviderCircuitBreaker] ${provider}: Force ${oldState} → ${newState}`);
}

/**
 * Get health metrics for all providers
 * @returns {Object} Health metrics
 */
function getHealthMetrics() {
    const metrics = {
        providers: {},
        summary: {
            total: 0,
            healthy: 0,
            degraded: 0,
            unhealthy: 0,
        },
    };

    for (const provider of providerStates.keys()) {
        const state = getProviderState(provider);
        metrics.providers[provider] = {
            state: state.state,
            failureRate: calculateFailureRate(state.history),
            avgResponseTime: calculateAvgResponseTime(state.history),
        };

        metrics.summary.total++;
        if (state.state === STATE.CLOSED) metrics.summary.healthy++;
        else if (state.state === STATE.HALF_OPEN) metrics.summary.degraded++;
        else metrics.summary.unhealthy++;
    }

    return metrics;
}

/**
 * Calculate failure rate from history
 * @param {Array} history - Request history
 * @returns {number} Failure rate (0-1)
 */
function calculateFailureRate(history) {
    if (history.length === 0) return 0;
    const failures = history.filter(h => !h.success).length;
    return failures / history.length;
}

/**
 * Calculate average response time from history
 * @param {Array} history - Request history
 * @returns {number} Average response time in ms
 */
function calculateAvgResponseTime(history) {
    const successfulRequests = history.filter(h => h.success && h.durationMs);
    if (successfulRequests.length === 0) return 0;
    const total = successfulRequests.reduce((sum, h) => sum + h.durationMs, 0);
    return Math.round(total / successfulRequests.length);
}

// ==========================================
// Public API
// ==========================================

export const ProviderCircuitBreaker = {
    // Constants
    STATE,
    DEFAULT_CONFIG,

    // Core operations
    canExecute,
    execute,
    recordSuccess,
    recordFailure,

    // Status
    getStatus,
    getAllStatus,
    getHealthMetrics,

    // Management
    reset,
    resetAll,
    forceState,
};

console.warn(
    '[ProviderCircuitBreaker] DEPRECATED: This module is deprecated. Use ProviderHealthAuthority instead.'
);
console.log('[ProviderCircuitBreaker] Module loaded (legacy - prefer ProviderHealthAuthority)');
