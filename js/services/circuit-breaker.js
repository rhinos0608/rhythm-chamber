/**
 * Circuit Breaker for Function Calling
 * 
 * Limits function calls per turn to prevent runaway tool execution.
 * Implements max 5 function calls per turn with 5s timeout per function.
 * 
 * HNW Considerations:
 * - Hierarchy: Single authority for function call limits
 * - Network: Prevents cascade failures from excessive tool calls
 * - Wave: Resets on each new message turn
 * 
 * @module services/circuit-breaker
 */

'use strict';

// ==========================================
// Constants
// ==========================================

// Note: MAX_CALLS_PER_TURN removed per user request.
// Function calls are now sequential (async/await), not limited.
// Only timeout and circuit open/close states are enforced.
const TIMEOUT_MS = 5000;       // 5 second timeout per function
const COOLDOWN_MS = 60000;     // 1 minute cooldown after trip

// ==========================================
// State
// ==========================================

/**
 * Circuit breaker states
 * @enum {string}
 */
const STATE = {
    CLOSED: 'closed',     // Normal operation
    OPEN: 'open',         // Reject all calls
    HALF_OPEN: 'half_open' // Testing after cooldown
};

let currentState = STATE.CLOSED;
let turnCallCount = 0;
let lastTripTime = null;
let turnStartTime = null;

// Statistics
let stats = {
    totalCalls: 0,
    tripsThisTurn: 0,
    totalTrips: 0
};

// ==========================================
// Core Functions
// ==========================================

/**
 * Check if a function call is allowed
 * @returns {{ allowed: boolean, reason?: string, callsRemaining?: number }}
 */
function check() {
    // Check cooldown if circuit is open
    if (currentState === STATE.OPEN) {
        const elapsed = Date.now() - lastTripTime;
        if (elapsed >= COOLDOWN_MS) {
            // Transition to half-open for testing
            currentState = STATE.HALF_OPEN;
            console.log('[CircuitBreaker] Transitioned to HALF_OPEN');
        } else {
            return {
                allowed: false,
                reason: 'circuit_open',
                cooldownRemaining: COOLDOWN_MS - elapsed
            };
        }
    }

    // No call count limit - calls are sequential via async/await
    return {
        allowed: true
    };
}

/**
 * Record a function call
 * Call this before executing each function
 */
function recordCall() {
    turnCallCount++;
    stats.totalCalls++;

    console.log(`[CircuitBreaker] Call #${turnCallCount}`);
    // Note: State transition moved to recordSuccess() - only transition after fn() succeeds
}

/**
 * Record a successful function execution
 * @param {string} functionName - Name of the function
 * @param {number} durationMs - Execution time in milliseconds
 */
function recordSuccess(functionName, durationMs) {
    console.log(`[CircuitBreaker] ${functionName} succeeded in ${durationMs}ms`);

    // If half-open and call succeeds, transition to closed
    if (currentState === STATE.HALF_OPEN) {
        currentState = STATE.CLOSED;
        console.log('[CircuitBreaker] Test call succeeded, circuit CLOSED');
    }
}

/**
 * Record a failed function execution
 * @param {string} functionName - Name of the function
 * @param {string} error - Error message
 */
function recordFailure(functionName, error) {
    console.warn(`[CircuitBreaker] ${functionName} failed: ${error}`);

    // If in HALF_OPEN, transition back to OPEN on failure
    if (currentState === STATE.HALF_OPEN) {
        trip('half_open_failure');
        console.log('[CircuitBreaker] Test call failed, returning to OPEN');
    }
}

/**
 * Trip the circuit breaker
 * @param {string} reason - Reason for tripping
 */
function trip(reason) {
    currentState = STATE.OPEN;
    lastTripTime = Date.now();
    stats.tripsThisTurn++;
    stats.totalTrips++;

    console.warn(`[CircuitBreaker] TRIPPED: ${reason} (Turn calls: ${turnCallCount})`);
}

/**
 * Reset for a new message turn
 * Call this at the start of each new user message
 */
function resetTurn() {
    turnCallCount = 0;
    stats.tripsThisTurn = 0;
    turnStartTime = Date.now();

    // Don't reset circuit state - that's managed by cooldown
    console.log('[CircuitBreaker] Turn reset');
}

/**
 * Force reset the circuit (emergency use)
 */
function forceReset() {
    currentState = STATE.CLOSED;
    turnCallCount = 0;
    lastTripTime = null;
    turnStartTime = null;
    stats.tripsThisTurn = 0;

    console.warn('[CircuitBreaker] Force reset');
}

/**
 * Get current circuit breaker status
 * @returns {{ state: string, turnCalls: number, maxCalls: number, totalTrips: number }}
 */
function getStatus() {
    return {
        state: currentState,
        turnCalls: turnCallCount,
        totalCalls: stats.totalCalls,
        totalTrips: stats.totalTrips,
        tripsThisTurn: stats.tripsThisTurn,
        lastTripTime,
        turnStartTime,
        isOpen: currentState === STATE.OPEN,
        timeoutMs: TIMEOUT_MS
    };
}

/**
 * Execute a function with circuit breaker protection
 * @param {string} functionName - Name of the function
 * @param {Function} fn - Async function to execute
 * @returns {Promise<{ success: boolean, result?: any, error?: string }>}
 */
async function execute(functionName, fn) {
    const checkResult = check();
    if (!checkResult.allowed) {
        return {
            success: false,
            error: `Circuit breaker: ${checkResult.reason}`,
            blocked: true
        };
    }

    recordCall();
    const startTime = Date.now();
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
    });

    try {
        // Execute with timeout
        const result = await Promise.race([fn(), timeoutPromise]);
        clearTimeout(timeoutId);

        const duration = Date.now() - startTime;
        recordSuccess(functionName, duration);

        return { success: true, result, durationMs: duration };
    } catch (error) {
        clearTimeout(timeoutId);
        const message = error instanceof Error ? error.message : String(error);
        recordFailure(functionName, message);
        return { success: false, error: message };
    }
}

/**
 * Get user-friendly error message for circuit breaker trips
 * @param {string} reason - Trip reason
 * @returns {string}
 */
function getErrorMessage(reason) {
    switch (reason) {
        case 'circuit_open':
            return '⚠️ Function calling temporarily disabled. Please wait a moment and try again.';
        default:
            return `⚠️ Function calling unavailable: ${reason}`;
    }
}

// ==========================================
// Public API
// ==========================================

export const CircuitBreaker = {
    // Constants
    TIMEOUT_MS,
    STATE,

    // Core
    check,
    recordCall,
    recordSuccess,
    recordFailure,
    trip,

    // Lifecycle
    resetTurn,
    forceReset,

    // Status
    getStatus,

    // Execution
    execute,

    // Helpers
    getErrorMessage
};


console.log('[CircuitBreaker] Module loaded (' + TIMEOUT_MS + 'ms timeout, no call limit)');

