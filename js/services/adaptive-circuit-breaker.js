/**
 * Adaptive Circuit Breaker with Performance-Based Timeout
 *
 * Circuit breaker that adapts timeout thresholds based on historical performance data.
 * Prevents wasting time on consistently slow providers while allowing recovery.
 *
 * HNW Considerations:
 * - Hierarchy: Single authority for provider circuit breaking
 * - Network: Prevents cascade failures and wasted time
 * - Wave: Adaptive timeouts based on historical performance percentiles
 *
 * @module services/adaptive-circuit-breaker
 */

import { EventBus } from './event-bus.js';

// ==========================================
// Circuit Breaker States
// ==========================================

/**
 * Circuit states
 */
export const CircuitState = {
    CLOSED: 'closed',       // Normal operation
    OPEN: 'open',           // Failing - requests blocked
    HALF_OPEN: 'half_open'  // Recovery testing
};

// ==========================================
// Circuit Configuration
// ==========================================

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CONFIG = {
    failureThreshold: 5,           // Consecutive failures before opening
    successThreshold: 2,           // Successes in half-open to close
    timeout: 60000,                // Cooldown before half-open (ms)
    halfOpenMaxRequests: 3,        // Max requests in half-open
    volumeThreshold: 5,            // Min requests before circuit can open
    adaptiveTimeout: true,         // Enable adaptive timeout
    p95Multiplier: 1.5,           // Timeout = p95 * multiplier
    minSamples: 10,                // Min samples for p95 calculation
    defaultTimeout: 30000,         // Default timeout (ms)
    minTimeout: 5000,              // Minimum adaptive timeout (ms)
    maxTimeout: 120000             // Maximum adaptive timeout (ms)
};

// ==========================================
// Per-Circuit State
// ==========================================

/**
 * Circuit registry
 * @type {Map<string, CircuitState>}
 */
const circuitRegistry = new Map();

/**
 * Circuit state entry
 * @typedef {Object} CircuitEntry
 * @property {string} circuitId - Unique circuit identifier
 * @property {CircuitState} state - Current circuit state
 * @property {number} failures - Consecutive failure count
 * @property {number} successes - Successes in half-open state
 * @property {number} lastFailureTime - Timestamp of last failure
 * @property {number} requestCount - Total requests in current window
 * @property {number} halfOpenRequests - Requests made in half-open state
 * @property {Array<number>} successDurations - Successful request durations (ms)
 * @property {number} createdAt - Circuit creation timestamp
 * @property {number} lastStateChange - Last state change timestamp
 */

/**
 * Get or create circuit entry
 *
 * @param {string} circuitId - Circuit identifier
 * @param {Object} config - Circuit configuration
 * @returns {CircuitEntry} Circuit entry
 */
function getCircuit(circuitId, config = DEFAULT_CONFIG) {
    if (!circuitRegistry.has(circuitId)) {
        circuitRegistry.set(circuitId, {
            circuitId,
            state: CircuitState.CLOSED,
            failures: 0,
            successes: 0,
            lastFailureTime: null,
            requestCount: 0,
            halfOpenRequests: 0,
            successDurations: [],
            createdAt: Date.now(),
            lastStateChange: Date.now(),
            config: { ...DEFAULT_CONFIG, ...config }
        });

        console.log(`[AdaptiveCircuitBreaker] Circuit created: ${circuitId}`);
    }

    return circuitRegistry.get(circuitId);
}

/**
 * Calculate adaptive timeout based on performance history
 *
 * @param {CircuitEntry} circuit - Circuit entry
 * @returns {number} Adaptive timeout in milliseconds
 */
function calculateAdaptiveTimeout(circuit) {
    const config = circuit.config;

    if (!config.adaptiveTimeout || circuit.successDurations.length < config.minSamples) {
        return config.defaultTimeout;
    }

    // Calculate p95 from successful request durations
    const sortedDurations = [...circuit.successDurations].sort((a, b) => a - b);
    const p95Index = Math.ceil(sortedDurations.length * 0.95) - 1;
    const p95 = sortedDurations[Math.max(0, p95Index)];

    // Apply multiplier and clamp to min/max
    const adaptiveTimeout = Math.min(
        Math.max(p95 * config.p95Multiplier, config.minTimeout),
        config.maxTimeout
    );

    console.log(`[AdaptiveCircuitBreaker] ${circuit.circuitId} adaptive timeout: ${adaptiveTimeout}ms (p95: ${p95}ms)`);

    return adaptiveTimeout;
}

/**
 * Check if a request can be executed
 *
 * @param {string} circuitId - Circuit identifier
 * @param {Object} config - Optional config override
 * @returns {{ allowed: boolean, state: string, reason?: string, timeout: number }}
 */
export function canExecute(circuitId, config = {}) {
    const circuit = getCircuit(circuitId, config);
    const cfg = circuit.config;

    // Always allow in closed state
    if (circuit.state === CircuitState.CLOSED) {
        return {
            allowed: true,
            state: circuit.state,
            timeout: calculateAdaptiveTimeout(circuit)
        };
    }

    // Check cooldown in open state
    if (circuit.state === CircuitState.OPEN) {
        const elapsed = Date.now() - circuit.lastFailureTime;
        if (elapsed >= cfg.timeout) {
            // Transition to half-open
            setState(circuit, CircuitState.HALF_OPEN);
            circuit.halfOpenRequests = 0;
            circuit.successes = 0;
            console.log(`[AdaptiveCircuitBreaker] ${circuitId}: OPEN → HALF_OPEN (cooldown elapsed)`);
            return {
                allowed: true,
                state: circuit.state,
                timeout: calculateAdaptiveTimeout(circuit)
            };
        }
        return {
            allowed: false,
            state: circuit.state,
            reason: `Circuit open for ${circuitId}. Retry in ${Math.ceil((cfg.timeout - elapsed) / 1000)}s`,
            cooldownRemaining: cfg.timeout - elapsed,
            timeout: cfg.defaultTimeout
        };
    }

    // Limit requests in half-open state
    if (circuit.state === CircuitState.HALF_OPEN) {
        if (circuit.halfOpenRequests >= cfg.halfOpenMaxRequests) {
            return {
                allowed: false,
                state: circuit.state,
                reason: `Circuit half-open for ${circuitId}. Waiting for test requests.`,
                timeout: cfg.defaultTimeout
            };
        }
        return {
            allowed: true,
            state: circuit.state,
            timeout: calculateAdaptiveTimeout(circuit)
        };
    }

    return {
        allowed: true,
        state: circuit.state,
        timeout: calculateAdaptiveTimeout(circuit)
    };
}

/**
 * Record a successful request
 *
 * @param {string} circuitId - Circuit identifier
 * @param {number} durationMs - Request duration in milliseconds
 * @param {Object} config - Optional config override
 */
export function recordSuccess(circuitId, durationMs = 0, config = {}) {
    const circuit = getCircuit(circuitId, config);
    const cfg = circuit.config;

    circuit.requestCount++;

    // Track successful request duration
    if (durationMs > 0) {
        circuit.successDurations.push(durationMs);

        // Keep only last 100 durations to prevent memory growth
        if (circuit.successDurations.length > 100) {
            circuit.successDurations = circuit.successDurations.slice(-100);
        }
    }

    // Handle half-open state
    if (circuit.state === CircuitState.HALF_OPEN) {
        circuit.successes++;
        if (circuit.successes >= cfg.successThreshold) {
            // Recovered! Close the circuit
            setState(circuit, CircuitState.CLOSED);
            circuit.failures = 0;
            circuit.successes = 0;
            circuit.halfOpenRequests = 0;

            console.log(`[AdaptiveCircuitBreaker] ${circuitId}: HALF_OPEN → CLOSED (recovered)`);

            // Emit recovery event
            EventBus.emit('CIRCUIT_BREAKER:RECOVERED', {
                circuitId,
                state: CircuitState.CLOSED,
                failureCount: circuit.failures,
                adaptiveTimeout: calculateAdaptiveTimeout(circuit)
            });
        }
    } else if (circuit.state === CircuitState.CLOSED) {
        // Reset failure count on success in closed state
        circuit.failures = 0;
    }
}

/**
 * Record a failed request
 *
 * @param {string} circuitId - Circuit identifier
 * @param {string} errorMessage - Error message for logging
 * @param {Object} config - Optional config override
 */
export function recordFailure(circuitId, errorMessage = '', config = {}) {
    const circuit = getCircuit(circuitId, config);
    const cfg = circuit.config;

    circuit.requestCount++;
    circuit.failures++;
    circuit.lastFailureTime = Date.now();

    if (circuit.state === CircuitState.HALF_OPEN) {
        // Any failure in half-open returns to open
        setState(circuit, CircuitState.OPEN);
        circuit.halfOpenRequests = 0;
        console.warn(`[AdaptiveCircuitBreaker] ${circuitId}: HALF_OPEN → OPEN (test request failed: ${errorMessage})`);
    } else if (circuit.state === CircuitState.CLOSED) {
        // Check if we should open the circuit
        if (circuit.requestCount >= cfg.volumeThreshold && circuit.failures >= cfg.failureThreshold) {
            setState(circuit, CircuitState.OPEN);
            console.warn(`[AdaptiveCircuitBreaker] ${circuitId}: CLOSED → OPEN (${circuit.failures} consecutive failures)`);

            // Emit trip event
            EventBus.emit('CIRCUIT_BREAKER:TRIPPED', {
                circuitId,
                state: CircuitState.OPEN,
                failureCount: circuit.failures,
                reason: errorMessage,
                cooldownMs: cfg.timeout
            });
        }
    }
}

/**
 * Execute a function with circuit breaker protection
 *
 * @param {string} circuitId - Circuit identifier
 * @param {Function} fn - Async function to execute
 * @param {Object} config - Optional config override
 * @returns {Promise<{ success: boolean, result?: any, error?: string, blocked?: boolean, durationMs?: number }>}
 */
export async function execute(circuitId, fn, config = {}) {
    const checkResult = canExecute(circuitId, config);

    if (!checkResult.allowed) {
        return {
            success: false,
            error: checkResult.reason,
            blocked: true,
            state: checkResult.state
        };
    }

    const circuit = getCircuit(circuitId, config);
    if (circuit.state === CircuitState.HALF_OPEN) {
        circuit.halfOpenRequests++;
    }

    const startTime = Date.now();
    const timeout = checkResult.timeout;

    try {
        // Execute with adaptive timeout
        const result = await Promise.race([
            fn(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Adaptive timeout after ${timeout}ms`)), timeout)
            )
        ]);

        const durationMs = Date.now() - startTime;
        recordSuccess(circuitId, durationMs, config);

        return {
            success: true,
            result,
            durationMs,
            state: circuit.state,
            adaptiveTimeout: timeout
        };
    } catch (error) {
        const durationMs = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);

        // Check if this was a timeout
        const isTimeout = message.includes('timeout') || message.includes('timed out');

        if (isTimeout) {
            // Treat timeouts as failures
            recordFailure(circuitId, `Timeout after ${durationMs}ms`, config);
        } else {
            recordFailure(circuitId, message, config);
        }

        return {
            success: false,
            error: message,
            state: circuit.state,
            durationMs,
            isTimeout
        };
    }
}

/**
 * Get circuit status
 *
 * @param {string} circuitId - Circuit identifier
 * @returns {Object} Circuit status
 */
export function getStatus(circuitId) {
    const circuit = circuitRegistry.get(circuitId);
    if (!circuit) {
        return {
            circuitId,
            exists: false
        };
    }

    const now = Date.now();
    const cfg = circuit.config;

    // Calculate statistics
    const successDurations = circuit.successDurations;
    const avgDuration = successDurations.length > 0
        ? Math.round(successDurations.reduce((a, b) => a + b, 0) / successDurations.length)
        : 0;

    const sortedDurations = [...successDurations].sort((a, b) => a - b);
    const p95Duration = successDurations.length > 0
        ? sortedDurations[Math.max(0, Math.ceil(successDurations.length * 0.95) - 1)]
        : 0;

    const adaptiveTimeout = calculateAdaptiveTimeout(circuit);

    return {
        circuitId,
        exists: true,
        state: circuit.state,
        failures: circuit.failures,
        successes: circuit.successes,
        requestCount: circuit.requestCount,
        isOpen: circuit.state === CircuitState.OPEN,
        isHalfOpen: circuit.state === CircuitState.HALF_OPEN,
        isClosed: circuit.state === CircuitState.CLOSED,
        lastFailureTime: circuit.lastFailureTime,
        cooldownRemaining: circuit.state === CircuitState.OPEN && circuit.lastFailureTime
            ? Math.max(0, cfg.timeout - (now - circuit.lastFailureTime))
            : 0,
        performance: {
            avgDuration,
            p95Duration,
            adaptiveTimeout,
            sampleCount: successDurations.length
        },
        age: now - circuit.createdAt,
        lastStateChange: now - circuit.lastStateChange
    };
}

/**
 * Get all circuit statuses
 *
 * @returns {Object} Map of circuit IDs to status
 */
export function getAllStatus() {
    const statuses = {};
    for (const circuitId of circuitRegistry.keys()) {
        statuses[circuitId] = getStatus(circuitId);
    }
    return statuses;
}

/**
 * Reset a circuit
 *
 * @param {string} circuitId - Circuit identifier
 */
export function reset(circuitId) {
    circuitRegistry.delete(circuitId);
    console.log(`[AdaptiveCircuitBreaker] ${circuitId}: Circuit reset`);
}

/**
 * Reset all circuits
 */
export function resetAll() {
    circuitRegistry.clear();
    console.log('[AdaptiveCircuitBreaker] All circuits reset');
}

/**
 * Force circuit into specific state (for testing/recovery)
 *
 * @param {string} circuitId - Circuit identifier
 * @param {CircuitState} newState - Target state
 */
export function forceState(circuitId, newState) {
    const circuit = getCircuit(circuitId);
    const oldState = circuit.state;
    setState(circuit, newState);

    console.warn(`[AdaptiveCircuitBreaker] ${circuitId}: Force ${oldState} → ${newState}`);
}

/**
 * Set circuit state (internal)
 *
 * @param {CircuitEntry} circuit - Circuit entry
 * @param {CircuitState} newState - New state
 */
function setState(circuit, newState) {
    circuit.state = newState;
    circuit.lastStateChange = Date.now();

    // Reset failures on closed
    if (newState === CircuitState.CLOSED) {
        circuit.failures = 0;
        circuit.successes = 0;
    }
}

// Export
export default {
    CircuitState,
    DEFAULT_CONFIG,
    canExecute,
    execute,
    recordSuccess,
    recordFailure,
    getStatus,
    getAllStatus,
    reset,
    resetAll,
    forceState
};

console.log('[AdaptiveCircuitBreaker] Module loaded with adaptive timeout support');
