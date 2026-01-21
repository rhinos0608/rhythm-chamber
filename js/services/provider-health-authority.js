/**
 * ProviderHealthAuthority - Single Source of Truth for Provider Health
 *
 * Unifies health tracking that was previously scattered across:
 * - ProviderCircuitBreaker (circuit state, failure thresholds)
 * - ProviderFallbackChain (_providerHealth, _providerBlacklist)
 * - ProviderHealthMonitor (aggregated health data)
 *
 * This module is the SINGLE AUTHORITY for:
 * - Circuit breaker state (CLOSED/OPEN/HALF_OPEN)
 * - Blacklist management (time-based blocking)
 * - Health metrics (success/failure counts, latency tracking)
 * - Health status events (CIRCUIT_BREAKER:TRIPPED, CIRCUIT_BREAKER:RECOVERED)
 *
 * HNW Considerations:
 * - Hierarchy: Single authority eliminates duplicate state tracking
 * - Network: Consistent health signals across all consumers
 * - Wave: Time-based recovery with half-open probing
 *
 * @module services/provider-health-authority
 * @author Rhythm Chamber Architecture Team
 * @version 1.0.0
 */

'use strict';

import { EventBus } from './event-bus.js';

// ==========================================
// Constants & Enums
// ==========================================

/**
 * Circuit breaker states
 * @enum {string}
 */
export const CircuitState = Object.freeze({
    CLOSED: 'closed',      // Normal operation - requests allowed
    OPEN: 'open',          // Failing - requests blocked
    HALF_OPEN: 'half_open' // Recovery testing - limited requests
});

/**
 * Provider health status (for UI display)
 * @enum {string}
 */
export const HealthStatus = Object.freeze({
    HEALTHY: 'healthy',        // Provider working normally
    DEGRADED: 'degraded',      // Provider slow but functional
    UNHEALTHY: 'unhealthy',    // Provider failing
    BLACKLISTED: 'blacklisted', // Provider temporarily blocked
    UNKNOWN: 'unknown'         // Status not yet determined
});

/**
 * Default configuration for circuit breaker behavior
 */
const DEFAULT_CONFIG = Object.freeze({
    // Circuit breaker thresholds
    failureThreshold: 5,       // Consecutive failures before opening circuit
    successThreshold: 2,       // Successes in half-open to close circuit
    volumeThreshold: 5,        // Minimum requests before circuit can open
    
    // Timing
    cooldownMs: 60000,         // Time in OPEN state before trying HALF_OPEN
    blacklistDurationMs: 300000, // 5 minutes default blacklist
    
    // Half-open constraints
    halfOpenMaxRequests: 3,    // Max concurrent requests in half-open state
    
    // Latency thresholds
    degradedLatencyMs: 5000,   // Latency above this = DEGRADED status
    
    // History
    historySize: 100           // Max entries in request history
});

// ==========================================
// Type Definitions
// ==========================================

/**
 * @typedef {Object} ProviderHealthRecord
 * @property {string} provider - Provider name
 * @property {CircuitState} circuitState - Current circuit breaker state
 * @property {HealthStatus} healthStatus - Derived health status for UI
 * @property {number} consecutiveFailures - Consecutive failure count
 * @property {number} consecutiveSuccesses - Consecutive success count (in half-open)
 * @property {number} totalSuccesses - Lifetime success count
 * @property {number} totalFailures - Lifetime failure count
 * @property {number} avgLatencyMs - Exponential moving average latency
 * @property {number} lastSuccessTime - Timestamp of last success
 * @property {number} lastFailureTime - Timestamp of last failure
 * @property {number} circuitOpenedAt - When circuit transitioned to OPEN
 * @property {number|null} blacklistExpiry - Blacklist expiry timestamp (null if not blacklisted)
 * @property {number} halfOpenRequests - Current requests in half-open state
 * @property {number} requestCount - Total requests in current circuit window
 * @property {Array<{timestamp: number, success: boolean, durationMs?: number, error?: string}>} history
 */

// ==========================================
// Module State
// ==========================================

/**
 * Provider health records - the single source of truth
 * @type {Map<string, ProviderHealthRecord>}
 */
const providerStates = new Map();

/**
 * Configuration (can be overridden per-call)
 * @type {Object}
 */
let config = { ...DEFAULT_CONFIG };

/**
 * UI update callbacks
 * @type {Set<Function>}
 */
const healthUpdateCallbacks = new Set();

// ==========================================
// Internal Helpers
// ==========================================

/**
 * Create initial health record for a provider
 * @param {string} provider - Provider name
 * @returns {ProviderHealthRecord}
 */
function createHealthRecord(provider) {
    return {
        provider,
        circuitState: CircuitState.CLOSED,
        healthStatus: HealthStatus.UNKNOWN,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        avgLatencyMs: 0,
        lastSuccessTime: 0,
        lastFailureTime: 0,
        circuitOpenedAt: 0,
        blacklistExpiry: null,
        halfOpenRequests: 0,
        requestCount: 0,
        history: []
    };
}

/**
 * Get or create provider state
 * @param {string} provider - Provider name
 * @returns {ProviderHealthRecord}
 */
function getOrCreateState(provider) {
    if (!providerStates.has(provider)) {
        providerStates.set(provider, createHealthRecord(provider));
    }
    return providerStates.get(provider);
}

/**
 * Derive health status from circuit state and metrics
 * @param {ProviderHealthRecord} state - Provider state
 * @returns {HealthStatus}
 */
function deriveHealthStatus(state) {
    // Blacklist takes precedence
    if (state.blacklistExpiry && Date.now() < state.blacklistExpiry) {
        return HealthStatus.BLACKLISTED;
    }
    
    // Circuit state mapping
    if (state.circuitState === CircuitState.OPEN) {
        return HealthStatus.UNHEALTHY;
    }
    
    if (state.circuitState === CircuitState.HALF_OPEN) {
        return HealthStatus.DEGRADED;
    }
    
    // In CLOSED state, check performance metrics
    const total = state.totalSuccesses + state.totalFailures;
    if (total === 0) {
        return HealthStatus.UNKNOWN;
    }
    
    const successRate = state.totalSuccesses / total;
    
    // High latency = degraded
    if (state.avgLatencyMs > config.degradedLatencyMs) {
        return HealthStatus.DEGRADED;
    }
    
    // Success rate thresholds
    if (successRate >= 0.8) {
        return HealthStatus.HEALTHY;
    } else if (successRate >= 0.5) {
        return HealthStatus.DEGRADED;
    } else {
        return HealthStatus.UNHEALTHY;
    }
}

/**
 * Trim history to configured size
 * @param {Array} history - Request history array
 */
function trimHistory(history) {
    if (history.length > config.historySize) {
        history.splice(0, history.length - config.historySize);
    }
}

/**
 * Notify UI callbacks of health update
 * @param {string} provider - Provider name
 * @param {ProviderHealthRecord} state - Updated state
 */
function notifyHealthUpdate(provider, state) {
    const snapshot = getProviderSnapshot(provider);
    
    for (const callback of healthUpdateCallbacks) {
        try {
            callback(provider, snapshot);
        } catch (error) {
            console.error('[ProviderHealthAuthority] Health callback error:', error);
        }
    }
}

/**
 * Emit circuit breaker event
 * @param {string} eventType - 'TRIPPED' or 'RECOVERED'
 * @param {string} provider - Provider name
 * @param {Object} details - Additional details
 */
function emitCircuitEvent(eventType, provider, details = {}) {
    const eventName = `CIRCUIT_BREAKER:${eventType}`;
    
    EventBus.emit(eventName, {
        provider,
        timestamp: Date.now(),
        ...details
    });
    
    console.log(`[ProviderHealthAuthority] Emitted ${eventName} for ${provider}`);
}

// ==========================================
// Core Public API
// ==========================================

/**
 * Check if a request can be made to a provider
 * Returns whether the request is allowed based on circuit state and blacklist
 * 
 * @param {string} provider - Provider name
 * @returns {{ allowed: boolean, state: CircuitState, reason?: string, cooldownRemaining?: number }}
 */
export function canExecute(provider) {
    const state = getOrCreateState(provider);
    const now = Date.now();
    
    // Check blacklist first
    if (state.blacklistExpiry && now < state.blacklistExpiry) {
        return {
            allowed: false,
            state: state.circuitState,
            reason: `Provider ${provider} is blacklisted`,
            blacklistRemaining: state.blacklistExpiry - now
        };
    } else if (state.blacklistExpiry && now >= state.blacklistExpiry) {
        // Blacklist expired - clear it
        state.blacklistExpiry = null;
    }
    
    // CLOSED state - always allow
    if (state.circuitState === CircuitState.CLOSED) {
        return { allowed: true, state: state.circuitState };
    }
    
    // OPEN state - check if cooldown elapsed
    if (state.circuitState === CircuitState.OPEN) {
        const elapsed = now - state.circuitOpenedAt;
        
        if (elapsed >= config.cooldownMs) {
            // Transition to HALF_OPEN
            state.circuitState = CircuitState.HALF_OPEN;
            state.halfOpenRequests = 0;
            state.consecutiveSuccesses = 0;
            state.healthStatus = deriveHealthStatus(state);
            
            console.log(`[ProviderHealthAuthority] ${provider}: OPEN → HALF_OPEN (cooldown elapsed)`);
            
            return { allowed: true, state: state.circuitState };
        }
        
        return {
            allowed: false,
            state: state.circuitState,
            reason: `Circuit open for ${provider}. Retry in ${Math.ceil((config.cooldownMs - elapsed) / 1000)}s`,
            cooldownRemaining: config.cooldownMs - elapsed
        };
    }
    
    // HALF_OPEN state - limit concurrent requests
    if (state.circuitState === CircuitState.HALF_OPEN) {
        if (state.halfOpenRequests >= config.halfOpenMaxRequests) {
            return {
                allowed: false,
                state: state.circuitState,
                reason: `Circuit half-open for ${provider}. Waiting for test requests to complete.`
            };
        }
        
        return { allowed: true, state: state.circuitState };
    }
    
    return { allowed: true, state: state.circuitState };
}

/**
 * Record a successful request
 * Updates metrics and potentially closes the circuit
 * 
 * @param {string} provider - Provider name
 * @param {number} [durationMs=0] - Request duration in milliseconds
 */
export function recordSuccess(provider, durationMs = 0) {
    const state = getOrCreateState(provider);
    const now = Date.now();
    
    // Update metrics
    state.requestCount++;
    state.totalSuccesses++;
    state.consecutiveFailures = 0; // Reset failure streak
    state.lastSuccessTime = now;
    
    // Update latency (exponential moving average)
    if (state.avgLatencyMs === 0) {
        state.avgLatencyMs = durationMs;
    } else {
        state.avgLatencyMs = (state.avgLatencyMs * 0.9) + (durationMs * 0.1);
    }
    
    // Record in history
    state.history.push({ timestamp: now, success: true, durationMs });
    trimHistory(state.history);
    
    // Handle HALF_OPEN state
    if (state.circuitState === CircuitState.HALF_OPEN) {
        state.consecutiveSuccesses++;
        
        if (state.consecutiveSuccesses >= config.successThreshold) {
            // Circuit recovered!
            const previousState = state.circuitState;
            state.circuitState = CircuitState.CLOSED;
            state.consecutiveSuccesses = 0;
            state.halfOpenRequests = 0;
            state.circuitOpenedAt = 0;
            
            console.log(`[ProviderHealthAuthority] ${provider}: HALF_OPEN → CLOSED (recovered)`);
            
            // Emit recovery event (this was missing from the old circuit breaker!)
            emitCircuitEvent('RECOVERED', provider, {
                previousState,
                successCount: state.totalSuccesses
            });
        }
    }
    
    // Update derived health status
    state.healthStatus = deriveHealthStatus(state);
    
    // Emit health update event
    EventBus.emit('PROVIDER:HEALTH_UPDATE', {
        provider,
        health: state.healthStatus,
        circuitState: state.circuitState
    });
    
    notifyHealthUpdate(provider, state);
}

/**
 * Record a failed request
 * Updates metrics and potentially opens the circuit
 * 
 * @param {string} provider - Provider name
 * @param {string|Error} [error] - Error message or Error object
 */
export function recordFailure(provider, error) {
    const state = getOrCreateState(provider);
    const now = Date.now();
    const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
    
    // Update metrics
    state.requestCount++;
    state.totalFailures++;
    state.consecutiveFailures++;
    state.consecutiveSuccesses = 0; // Reset success streak
    state.lastFailureTime = now;
    
    // Record in history
    state.history.push({ timestamp: now, success: false, error: errorMessage });
    trimHistory(state.history);
    
    // Handle state transitions
    if (state.circuitState === CircuitState.HALF_OPEN) {
        // Any failure in half-open → back to OPEN
        state.circuitState = CircuitState.OPEN;
        state.circuitOpenedAt = now;
        state.halfOpenRequests = 0;
        
        console.warn(`[ProviderHealthAuthority] ${provider}: HALF_OPEN → OPEN (test request failed: ${errorMessage})`);
        
        // Emit tripped event
        emitCircuitEvent('TRIPPED', provider, {
            reason: 'half_open_failure',
            error: errorMessage,
            consecutiveFailures: state.consecutiveFailures
        });
        
    } else if (state.circuitState === CircuitState.CLOSED) {
        // Check if we should open the circuit
        if (state.requestCount >= config.volumeThreshold && 
            state.consecutiveFailures >= config.failureThreshold) {
            
            state.circuitState = CircuitState.OPEN;
            state.circuitOpenedAt = now;
            
            console.warn(`[ProviderHealthAuthority] ${provider}: CLOSED → OPEN (${state.consecutiveFailures} consecutive failures)`);
            
            // Emit tripped event (THIS WAS THE MISSING EVENT!)
            emitCircuitEvent('TRIPPED', provider, {
                reason: 'failure_threshold',
                error: errorMessage,
                consecutiveFailures: state.consecutiveFailures,
                failureThreshold: config.failureThreshold
            });
        }
    }
    
    // Update derived health status
    state.healthStatus = deriveHealthStatus(state);
    
    // Emit health update event
    EventBus.emit('PROVIDER:HEALTH_UPDATE', {
        provider,
        health: state.healthStatus,
        circuitState: state.circuitState
    });
    
    notifyHealthUpdate(provider, state);
}

/**
 * Mark a half-open request as started (increment counter)
 * Call this BEFORE executing the request in half-open state
 * 
 * @param {string} provider - Provider name
 */
export function markHalfOpenRequestStarted(provider) {
    const state = getOrCreateState(provider);
    if (state.circuitState === CircuitState.HALF_OPEN) {
        state.halfOpenRequests++;
    }
}

/**
 * Mark a half-open request as completed (decrement counter)
 * Call this in finally block after executing request in half-open state
 * 
 * @param {string} provider - Provider name
 */
export function markHalfOpenRequestCompleted(provider) {
    const state = getOrCreateState(provider);
    if (state.circuitState === CircuitState.HALF_OPEN && state.halfOpenRequests > 0) {
        state.halfOpenRequests--;
    }
}

// ==========================================
// Blacklist Management
// ==========================================

/**
 * Blacklist a provider for a duration
 * 
 * @param {string} provider - Provider name
 * @param {number} [durationMs] - Duration in milliseconds (default: config.blacklistDurationMs)
 */
export function blacklist(provider, durationMs = config.blacklistDurationMs) {
    const state = getOrCreateState(provider);
    const expiry = Date.now() + durationMs;
    
    state.blacklistExpiry = expiry;
    state.healthStatus = HealthStatus.BLACKLISTED;
    
    console.warn(`[ProviderHealthAuthority] Blacklisted ${provider} for ${durationMs}ms`);
    
    EventBus.emit('PROVIDER:BLACKLISTED', {
        provider,
        expiry: new Date(expiry).toISOString(),
        durationMs
    });
    
    notifyHealthUpdate(provider, state);
}

/**
 * Remove a provider from the blacklist
 * 
 * @param {string} provider - Provider name
 */
export function unblacklist(provider) {
    const state = getOrCreateState(provider);
    
    if (state.blacklistExpiry) {
        state.blacklistExpiry = null;
        state.healthStatus = deriveHealthStatus(state);
        
        console.log(`[ProviderHealthAuthority] Removed ${provider} from blacklist`);
        
        EventBus.emit('PROVIDER:UNBLACKLISTED', { provider });
        
        notifyHealthUpdate(provider, state);
    }
}

/**
 * Check if a provider is currently blacklisted
 * 
 * @param {string} provider - Provider name
 * @returns {boolean}
 */
export function isBlacklisted(provider) {
    const state = providerStates.get(provider);
    if (!state || !state.blacklistExpiry) return false;
    
    const now = Date.now();
    if (now >= state.blacklistExpiry) {
        // Expired - clean up
        state.blacklistExpiry = null;
        state.healthStatus = deriveHealthStatus(state);
        
        console.log(`[ProviderHealthAuthority] ${provider} blacklist expired`);
        
        EventBus.emit('PROVIDER:UNBLACKLISTED', { provider });
        notifyHealthUpdate(provider, state);
        
        return false;
    }
    
    return true;
}

// ==========================================
// Status & Metrics
// ==========================================

/**
 * Get current status for a provider
 * 
 * @param {string} provider - Provider name
 * @returns {Object} Provider status
 */
export function getStatus(provider) {
    const state = getOrCreateState(provider);
    const now = Date.now();
    
    return {
        provider,
        circuitState: state.circuitState,
        healthStatus: deriveHealthStatus(state),
        consecutiveFailures: state.consecutiveFailures,
        consecutiveSuccesses: state.consecutiveSuccesses,
        totalSuccesses: state.totalSuccesses,
        totalFailures: state.totalFailures,
        successRate: state.totalSuccesses + state.totalFailures > 0
            ? state.totalSuccesses / (state.totalSuccesses + state.totalFailures)
            : 0,
        avgLatencyMs: Math.round(state.avgLatencyMs),
        lastSuccessTime: state.lastSuccessTime,
        lastFailureTime: state.lastFailureTime,
        isOpen: state.circuitState === CircuitState.OPEN,
        isHalfOpen: state.circuitState === CircuitState.HALF_OPEN,
        isClosed: state.circuitState === CircuitState.CLOSED,
        isBlacklisted: state.blacklistExpiry ? now < state.blacklistExpiry : false,
        blacklistExpiry: state.blacklistExpiry,
        cooldownRemaining: state.circuitState === CircuitState.OPEN && state.circuitOpenedAt
            ? Math.max(0, config.cooldownMs - (now - state.circuitOpenedAt))
            : 0,
        recentHistory: state.history.slice(-10)
    };
}

/**
 * Get a snapshot of provider health for UI
 * 
 * @param {string} provider - Provider name
 * @returns {Object} Provider health snapshot
 */
export function getProviderSnapshot(provider) {
    const status = getStatus(provider);
    
    return {
        provider: status.provider,
        status: status.healthStatus,
        circuitState: status.circuitState,
        successCount: status.totalSuccesses,
        failureCount: status.totalFailures,
        successRate: status.successRate,
        avgLatencyMs: status.avgLatencyMs,
        lastSuccessTime: status.lastSuccessTime,
        lastFailureTime: status.lastFailureTime,
        blacklistExpiry: status.blacklistExpiry
            ? new Date(status.blacklistExpiry).toISOString()
            : null,
        cooldownRemaining: status.cooldownRemaining
    };
}

/**
 * Get status of all tracked providers
 * 
 * @returns {Object} Map of provider names to status
 */
export function getAllStatus() {
    const status = {};
    for (const provider of providerStates.keys()) {
        status[provider] = getStatus(provider);
    }
    return status;
}

/**
 * Get health snapshot for all providers (for UI)
 * 
 * @returns {Object} Map of provider names to health snapshots
 */
export function getAllSnapshots() {
    const snapshots = {};
    for (const provider of providerStates.keys()) {
        snapshots[provider] = getProviderSnapshot(provider);
    }
    return snapshots;
}

/**
 * Get health summary across all providers
 * 
 * @returns {Object} Summary statistics
 */
export function getHealthSummary() {
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;
    let blacklisted = 0;
    let unknown = 0;
    
    for (const state of providerStates.values()) {
        switch (state.healthStatus) {
            case HealthStatus.HEALTHY: healthy++; break;
            case HealthStatus.DEGRADED: degraded++; break;
            case HealthStatus.UNHEALTHY: unhealthy++; break;
            case HealthStatus.BLACKLISTED: blacklisted++; break;
            case HealthStatus.UNKNOWN: unknown++; break;
        }
    }
    
    const total = providerStates.size;
    let overallStatus = HealthStatus.UNKNOWN;
    
    if (total === 0) {
        overallStatus = HealthStatus.UNKNOWN;
    } else if (blacklisted > 0 || unhealthy > 0) {
        overallStatus = HealthStatus.UNHEALTHY;
    } else if (degraded > 0) {
        overallStatus = HealthStatus.DEGRADED;
    } else if (healthy === total) {
        overallStatus = HealthStatus.HEALTHY;
    }
    
    return {
        total,
        healthy,
        degraded,
        unhealthy,
        blacklisted,
        unknown,
        overallStatus
    };
}

// ==========================================
// Management & Configuration
// ==========================================

/**
 * Reset a provider's circuit breaker and health state
 * 
 * @param {string} provider - Provider name
 */
export function reset(provider) {
    providerStates.delete(provider);
    console.log(`[ProviderHealthAuthority] Reset health state for ${provider}`);
}

/**
 * Reset all providers
 */
export function resetAll() {
    providerStates.clear();
    console.log('[ProviderHealthAuthority] Reset all health states');
}

/**
 * Force a provider into a specific circuit state (for testing/recovery)
 * 
 * @param {string} provider - Provider name
 * @param {CircuitState} newState - Target state
 */
export function forceState(provider, newState) {
    const state = getOrCreateState(provider);
    const oldState = state.circuitState;
    
    state.circuitState = newState;
    
    if (newState === CircuitState.CLOSED) {
        state.consecutiveFailures = 0;
        state.consecutiveSuccesses = 0;
        state.halfOpenRequests = 0;
        state.circuitOpenedAt = 0;
    } else if (newState === CircuitState.OPEN) {
        state.circuitOpenedAt = Date.now();
    } else if (newState === CircuitState.HALF_OPEN) {
        state.halfOpenRequests = 0;
        state.consecutiveSuccesses = 0;
    }
    
    state.healthStatus = deriveHealthStatus(state);
    
    console.warn(`[ProviderHealthAuthority] ${provider}: Force ${oldState} → ${newState}`);
    
    notifyHealthUpdate(provider, state);
}

/**
 * Update configuration
 * 
 * @param {Object} newConfig - Partial config to merge
 */
export function configure(newConfig) {
    config = { ...config, ...newConfig };
    console.log('[ProviderHealthAuthority] Configuration updated:', config);
}

/**
 * Get current configuration
 * 
 * @returns {Object} Current config
 */
export function getConfig() {
    return { ...config };
}

// ==========================================
// UI Integration
// ==========================================

/**
 * Register a callback for health updates
 * 
 * @param {Function} callback - Function(provider, snapshot) to call on updates
 * @returns {Function} Unsubscribe function
 */
export function onHealthUpdate(callback) {
    if (typeof callback === 'function') {
        healthUpdateCallbacks.add(callback);
        return () => healthUpdateCallbacks.delete(callback);
    }
    return () => {};
}

/**
 * Unregister a health update callback
 * 
 * @param {Function} callback - Callback to remove
 */
export function offHealthUpdate(callback) {
    healthUpdateCallbacks.delete(callback);
}

// ==========================================
// Execute with Protection (Convenience)
// ==========================================

/**
 * Execute a function with circuit breaker protection
 * Combines canExecute check, execution, and recording atomically
 * 
 * @param {string} provider - Provider name
 * @param {Function} fn - Async function to execute
 * @returns {Promise<{ success: boolean, result?: any, error?: string, blocked?: boolean, durationMs?: number }>}
 */
export async function execute(provider, fn) {
    const checkResult = canExecute(provider);
    
    if (!checkResult.allowed) {
        return {
            success: false,
            error: checkResult.reason,
            blocked: true,
            state: checkResult.state
        };
    }
    
    const state = getOrCreateState(provider);
    if (state.circuitState === CircuitState.HALF_OPEN) {
        markHalfOpenRequestStarted(provider);
    }
    
    const startTime = Date.now();
    
    try {
        const result = await fn();
        const durationMs = Date.now() - startTime;
        
        recordSuccess(provider, durationMs);
        
        return {
            success: true,
            result,
            durationMs,
            state: state.circuitState
        };
    } catch (error) {
        const durationMs = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);
        
        recordFailure(provider, message);
        
        return {
            success: false,
            error: message,
            durationMs,
            state: state.circuitState
        };
    } finally {
        if (state.circuitState === CircuitState.HALF_OPEN) {
            markHalfOpenRequestCompleted(provider);
        }
    }
}

// ==========================================
// Named Export Object (for compatibility)
// ==========================================

export const ProviderHealthAuthority = {
    // Constants
    CircuitState,
    HealthStatus,
    DEFAULT_CONFIG,
    
    // Core operations
    canExecute,
    execute,
    recordSuccess,
    recordFailure,
    markHalfOpenRequestStarted,
    markHalfOpenRequestCompleted,
    
    // Blacklist management
    blacklist,
    unblacklist,
    isBlacklisted,
    
    // Status & metrics
    getStatus,
    getProviderSnapshot,
    getAllStatus,
    getAllSnapshots,
    getHealthSummary,
    
    // Management
    reset,
    resetAll,
    forceState,
    configure,
    getConfig,
    
    // UI integration
    onHealthUpdate,
    offHealthUpdate
};

console.log('[ProviderHealthAuthority] Module loaded - Single source of truth for provider health');
