/**
 * EventBus Service
 * 
 * Centralized event system with typed events, priority dispatch, and debugging.
 * Replaces scattered event patterns across modules with a unified pub/sub system.
 * 
 * HNW Considerations:
 * - Hierarchy: Single source of truth for all cross-module events
 * - Network: Decouples producers from consumers, reduces direct dependencies
 * - Wave: Priority ordering ensures critical events (errors, state changes) arrive first
 * 
 * @module services/event-bus
 */

import { VectorClock } from './vector-clock.js';
import { EventLogStore } from '../storage/event-log-store.js';
import { TabCoordinator } from './tab-coordination.js';
import { WaveTelemetry } from './wave-telemetry.js';

// ==========================================
// Event Contracts (Schemas)
// ==========================================

/**
 * Event type definitions for type-safety and documentation
 * Each event type has a defined payload schema
 */
const EVENT_SCHEMAS = {
    // Storage events
    'storage:updated': {
        description: 'Data saved to storage',
        payload: { store: 'string', key: 'string?', count: 'number?' }
    },
    'storage:cleared': {
        description: 'Storage cleared',
        payload: { store: 'string' }
    },
    'storage:connection_blocked': {
        description: 'Database upgrade blocked by other tabs',
        payload: { reason: 'string', message: 'string' }
    },
    'storage:connection_retry': {
        description: 'Database connection retry attempt',
        payload: { attempt: 'number', maxAttempts: 'number', nextRetryMs: 'number', error: 'string' }
    },
    'storage:connection_failed': {
        description: 'Database connection permanently failed',
        payload: { attempts: 'number', error: 'string', recoverable: 'boolean' }
    },
    'storage:connection_established': {
        description: 'Database connection successfully established',
        payload: { attempts: 'number' }
    },
    'storage:error': {
        description: 'Storage error occurred',
        payload: { type: 'string', error: 'string' }
    },
    'storage:quota_warning': {
        description: 'Storage quota warning (80% threshold)',
        payload: { usageBytes: 'number', quotaBytes: 'number', percentage: 'number' }
    },
    'storage:quota_critical': {
        description: 'Storage quota critical (95% threshold, writes blocked)',
        payload: { usageBytes: 'number', quotaBytes: 'number', percentage: 'number' }
    },
    'storage:quota_normal': {
        description: 'Storage quota returned to normal',
        payload: { usageBytes: 'number', quotaBytes: 'number', percentage: 'number' }
    },

    // Session events
    'session:created': {
        description: 'New chat session created',
        payload: { sessionId: 'string', title: 'string?' }
    },
    'session:loaded': {
        description: 'Session loaded from storage',
        payload: { sessionId: 'string', messageCount: 'number' }
    },
    'session:switched': {
        description: 'Active session changed',
        payload: { fromSessionId: 'string?', toSessionId: 'string' }
    },
    'session:updated': {
        description: 'Session data updated',
        payload: { sessionId: 'string', field: 'string?' }
    },
    'session:ended': {
        description: 'Chat session ended',
        payload: { reason: 'string' }
    },

    // Tab coordination events
    'tab:authority_changed': {
        description: 'Tab write authority changed (primary/secondary)',
        payload: { isPrimary: 'boolean', level: 'string', mode: 'string', message: 'string' }
    },

    // Tab coordination events
    'tab:primary_claimed': {
        description: 'Tab became primary',
        payload: { tabId: 'string' }
    },
    'tab:secondary_mode': {
        description: 'Tab entered secondary mode',
        payload: { primaryTabId: 'string' }
    },

    // Data provider events
    'data:provider_changed': {
        description: 'Data provider switched (demo/user/shared)',
        payload: { providerType: 'string' }
    },
    'data:streams_loaded': {
        description: 'Streams data loaded',
        payload: { count: 'number', source: 'string' }
    },

    // Pattern detection events
    'pattern:detected': {
        description: 'Single pattern detection completed',
        payload: { patternName: 'string', result: 'object' }
    },
    'pattern:all_complete': {
        description: 'All pattern detection finished',
        payload: { patterns: 'object', duration: 'number', aborted: 'boolean?' }
    },
    'pattern:aborted': {
        description: 'Pattern detection aborted before completion',
        payload: { patterns: 'object', duration: 'number', aborted: 'boolean?' }
    },

    // Chat events
    'chat:message_sent': {
        description: 'User message sent',
        payload: { messageId: 'string?', content: 'string' }
    },
    'chat:response_received': {
        description: 'Assistant response received',
        payload: { messageId: 'string?', content: 'string' }
    },
    'chat:error': {
        description: 'Chat error occurred',
        payload: { error: 'string', recoverable: 'boolean' }
    },

    // State machine events
    'state:transition': {
        description: 'State machine transition',
        payload: { event: 'string', from: 'object', to: 'object' }
    },

    // Error events (always critical priority)
    'error:critical': {
        description: 'Critical error requiring user attention',
        payload: { message: 'string', code: 'string?', recoveryAction: 'string?' }
    },

    // Circuit breaker events
    'CIRCUIT_BREAKER:DROPPED': {
        description: 'Event was dropped by circuit breaker',
        payload: { count: 'number', eventType: 'string', reason: 'string', totalDropped: 'number' }
    },
    'eventbus:storm': {
        description: 'Event storm detected',
        payload: { eventsPerSecond: 'number', threshold: 'number' }
    },

    // Embedding events
    'embedding:model_loaded': {
        description: 'Embedding model fully loaded',
        payload: { model: 'string', backend: 'string', quantization: 'string?', loadTimeMs: 'number' }
    },
    'embedding:mode_change': {
        description: 'Embedding mode changed (battery-aware switching)',
        payload: { from: 'string', to: 'string', batteryLevel: 'number?', charging: 'boolean?' }
    },
    'embedding:generation_start': {
        description: 'Embedding generation started',
        payload: { count: 'number', mode: 'string' }
    },
    'embedding:generation_complete': {
        description: 'Embedding generation completed',
        payload: { count: 'number', durationMs: 'number', avgTimePerEmbedding: 'number' }
    },
    'embedding:error': {
        description: 'Embedding error occurred',
        payload: { error: 'string', context: 'string?' }
    },

    // Backpressure signaling events (producer notifications)
    'eventbus:backpressure_warning': {
        description: 'Queue at 80% capacity, producers should slow down',
        payload: { queueSize: 'number', maxSize: 'number', percentFull: 'number' }
    },
    'eventbus:storm_start': {
        description: 'Event storm started, events may be dropped',
        payload: { eventsPerSecond: 'number', threshold: 'number', startTime: 'number' }
    },
    'eventbus:storm_end': {
        description: 'Event storm ended, normal processing resumed',
        payload: { durationMs: 'number', totalDropped: 'number' }
    },
    'eventbus:handler_circuit_open': {
        description: 'Handler circuit breaker opened due to failures',
        payload: { handlerId: 'string', failures: 'number', lastError: 'string' }
    },
    'eventbus:health_degraded': {
        description: 'EventBus health degraded',
        payload: { status: 'string', failureRate: 'number', stuckHandlers: 'number', pausedHandlers: 'number', avgLatencyMs: 'number' }
    },
    'event:persistence_failed': {
        description: 'Event persistence to storage failed',
        payload: { eventType: 'string', error: 'string' }
    }
};

// ==========================================
// Priority Levels
// ==========================================

const PRIORITY = {
    CRITICAL: 0,  // Errors, security events - processed first
    HIGH: 1,      // State changes, auth events
    NORMAL: 2,    // Standard events
    LOW: 3        // Analytics, logging events
};

// Map event types to default priorities
const EVENT_PRIORITIES = {
    'error:critical': PRIORITY.CRITICAL,
    'tab:secondary_mode': PRIORITY.HIGH,
    'state:transition': PRIORITY.HIGH,
    'session:switched': PRIORITY.HIGH
    // All other events default to NORMAL
};

// Edge case: Critical events that should never be dropped (EVENT BUS FIX)
// These events are essential for application stability and user experience
const CRITICAL_EVENTS = [
    'error:critical',
    'chat:error',
    'session:switched',
    'storage:quota_critical',
    'storage:error',
    'eventbus:handler_circuit_open'
];

// ==========================================
// Circuit Breaker Configuration
// ==========================================

const CIRCUIT_BREAKER_CONFIG = {
    maxQueueSize: 1000,              // Max pending events before overflow
    overflowStrategy: 'drop_low_priority', // 'drop_low_priority', 'drop_oldest', 'reject_all'
    stormThreshold: 100,             // Events per second to trigger storm warning
    stormWindowMs: 1000,             // Window for storm detection
    cooldownMs: 5000,                // Cooldown after storm
    backpressureWarningThreshold: 0.8 // Warn producers at 80% queue capacity
};

// ==========================================
// Circuit Breaker Helper
// ==========================================

/**
 * Circuit breaker check helper - extracts duplicate logic from emit() and emitAndAwait()
 * Handles storm detection, backpressure warnings, and queue overflow
 *
 * @param {string} eventType - Event type
 * @param {number} priority - Event priority
 * @param {number} timestamp - Event timestamp
 * @returns {{ allowed: boolean, dropped?: boolean, cleanupFn?: Function }} Result object
 */
function runCircuitBreakerChecks(eventType, priority, timestamp) {
    // Edge case: Never drop critical events regardless of circuit breaker state (EVENT BUS FIX)
    const isCritical = CRITICAL_EVENTS.includes(eventType);
    if (isCritical) {
        // Make room for critical events by dropping low-priority ones if needed
        while (pendingEvents.length >= CIRCUIT_BREAKER_CONFIG.maxQueueSize) {
            // Find and drop the lowest priority non-critical event
            let lowestIdx = -1;
            let lowestPriority = -1;
            for (let i = 0; i < pendingEvents.length; i++) {
                const ev = pendingEvents[i];
                if (!CRITICAL_EVENTS.includes(ev.eventType) && ev.priority > lowestPriority) {
                    lowestPriority = ev.priority;
                    lowestIdx = i;
                }
            }
            if (lowestIdx >= 0) {
                const dropped = pendingEvents.splice(lowestIdx, 1)[0];
                droppedCount++;
                console.warn(`[EventBus] Dropped event to make room for critical event: ${dropped.eventType}`);
            } else {
                // All events in queue are critical - can't make room
                console.error(`[EventBus] Cannot queue critical event ${eventType} - queue full of critical events`);
                return { allowed: false, dropped: true };
            }
        }
    }

    // Update storm window
    if (timestamp - windowStart > CIRCUIT_BREAKER_CONFIG.stormWindowMs) {
        // Check if storm threshold was exceeded
        if (eventsThisWindow > CIRCUIT_BREAKER_CONFIG.stormThreshold && !stormActive) {
            stormActive = true;
            stormStartTime = timestamp;
            stormDroppedAtStart = droppedCount;
            stormCooldownUntil = timestamp + CIRCUIT_BREAKER_CONFIG.cooldownMs;
            console.warn(`[EventBus] Event storm detected: ${eventsThisWindow} events in ${CIRCUIT_BREAKER_CONFIG.stormWindowMs}ms`);

            // Emit storm START event (producer notification)
            emit('eventbus:storm_start', {
                eventsPerSecond: eventsThisWindow,
                threshold: CIRCUIT_BREAKER_CONFIG.stormThreshold,
                startTime: stormStartTime
            }, { bypassCircuitBreaker: true, skipValidation: true });

            // Legacy event for backwards compatibility
            emit('eventbus:storm', {
                eventsPerSecond: eventsThisWindow,
                threshold: CIRCUIT_BREAKER_CONFIG.stormThreshold
            }, { bypassCircuitBreaker: true, skipValidation: true });
        }
        // Reset window
        windowStart = timestamp;
        eventsThisWindow = 0;
        backpressureWarningEmitted = false; // Reset backpressure warning each window

        // Check cooldown - emit storm END event when storm ends
        if (stormActive && timestamp > stormCooldownUntil) {
            const stormDuration = timestamp - stormStartTime;
            const totalDroppedDuringStorm = droppedCount - stormDroppedAtStart;

            // Emit storm END event (producer notification)
            emit('eventbus:storm_end', {
                durationMs: stormDuration,
                totalDropped: totalDroppedDuringStorm
            }, { bypassCircuitBreaker: true, skipValidation: true });

            stormActive = false;
            console.log(`[EventBus] Event storm ended (duration: ${stormDuration}ms, dropped: ${totalDroppedDuringStorm})`);
        }
    }
    eventsThisWindow++;

    // Proactive backpressure warning at 80% queue capacity
    const queuePercentFull = pendingEvents.length / CIRCUIT_BREAKER_CONFIG.maxQueueSize;
    if (queuePercentFull >= CIRCUIT_BREAKER_CONFIG.backpressureWarningThreshold && !backpressureWarningEmitted) {
        backpressureWarningEmitted = true;
        emit('eventbus:backpressure_warning', {
            queueSize: pendingEvents.length,
            maxSize: CIRCUIT_BREAKER_CONFIG.maxQueueSize,
            percentFull: queuePercentFull
        }, { bypassCircuitBreaker: true, skipValidation: true });
        console.warn(`[EventBus] Backpressure warning: queue at ${(queuePercentFull * 100).toFixed(1)}% capacity`);
    }

    // Queue overflow handling
    if (pendingEvents.length >= CIRCUIT_BREAKER_CONFIG.maxQueueSize) {
        const strategy = CIRCUIT_BREAKER_CONFIG.overflowStrategy;

        if (strategy === 'reject_all') {
            // Edge case: Never reject critical events (EVENT BUS FIX)
            if (isCritical) {
                // Already handled above - make room and continue
            } else {
                droppedCount++;
                // Emit drop event for monitoring
                emit('CIRCUIT_BREAKER:DROPPED', {
                    count: 1,
                    eventType,
                    reason: 'queue_full_reject_all',
                    totalDropped: droppedCount
                }, { bypassCircuitBreaker: true, skipValidation: true });
                if (debugMode) {
                    console.warn(`[EventBus] Event rejected (queue full): ${eventType}`);
                }
                return { allowed: false, dropped: true };
            }
        }

        if (strategy === 'drop_low_priority') {
            // Find lowest priority event to drop (excluding critical events)
            let lowestPriorityIndex = -1;
            for (let i = 0; i < pendingEvents.length; i++) {
                // Edge case: Never drop critical events (EVENT BUS FIX)
                if (CRITICAL_EVENTS.includes(pendingEvents[i].eventType)) {
                    continue;
                }
                if (lowestPriorityIndex === -1 ||
                    pendingEvents[i].priority > pendingEvents[lowestPriorityIndex].priority) {
                    lowestPriorityIndex = i;
                }
            }

            // If no non-critical event found to drop, queue is full of critical events
            if (lowestPriorityIndex === -1) {
                console.error(`[EventBus] Cannot drop events - queue full of critical events`);
                // Edge case: Still allow critical events through, reject non-critical
                if (!isCritical) {
                    droppedCount++;
                    emit('CIRCUIT_BREAKER:DROPPED', {
                        count: 1,
                        eventType,
                        reason: 'queue_full_critical_only',
                        totalDropped: droppedCount
                    }, { bypassCircuitBreaker: true, skipValidation: true });
                    return { allowed: false, dropped: true };
                }
            } else {
                // Only drop if new event has equal or lower priority (and is not critical)
                if (!isCritical && priority >= pendingEvents[lowestPriorityIndex].priority) {
                    droppedCount++;
                    // Emit drop event for monitoring
                    emit('CIRCUIT_BREAKER:DROPPED', {
                        count: 1,
                        eventType,
                        reason: 'priority_too_low',
                        totalDropped: droppedCount
                    }, { bypassCircuitBreaker: true, skipValidation: true });
                    if (debugMode) {
                        console.warn(`[EventBus] Event rejected (equal or lower priority than queue): ${eventType}`);
                    }
                    return { allowed: false, dropped: true };
                }

                // Drop lowest priority non-critical event
                const dropped = pendingEvents.splice(lowestPriorityIndex, 1)[0];
                droppedCount++;
                // Emit drop event for monitoring
                emit('CIRCUIT_BREAKER:DROPPED', {
                    count: 1,
                    eventType: dropped.eventType,
                    reason: 'displaced_by_higher_priority',
                    totalDropped: droppedCount
                }, { bypassCircuitBreaker: true, skipValidation: true });
                if (debugMode) {
                    console.warn(`[EventBus] Dropped low-priority event: ${dropped.eventType}`);
                }
            }
        } else if (strategy === 'drop_oldest') {
            // Edge case: Never drop critical events (EVENT BUS FIX)
            let oldestIndex = -1;
            let oldestTime = Infinity;
            for (let i = 0; i < pendingEvents.length; i++) {
                if (!CRITICAL_EVENTS.includes(pendingEvents[i].eventType) &&
                    pendingEvents[i].timestamp < oldestTime) {
                    oldestTime = pendingEvents[i].timestamp;
                    oldestIndex = i;
                }
            }

            if (oldestIndex >= 0) {
                const dropped = pendingEvents.splice(oldestIndex, 1)[0];
                droppedCount++;
                emit('CIRCUIT_BREAKER:DROPPED', {
                    count: 1,
                    eventType: dropped?.eventType || 'unknown',
                    reason: 'oldest_dropped',
                    totalDropped: droppedCount
                }, { bypassCircuitBreaker: true, skipValidation: true });
                if (debugMode) {
                    console.warn(`[EventBus] Dropped oldest non-critical event: ${dropped?.eventType}`);
                }
            } else if (!isCritical) {
                // No non-critical events to drop
                droppedCount++;
                emit('CIRCUIT_BREAKER:DROPPED', {
                    count: 1,
                    eventType,
                    reason: 'queue_full_critical_only',
                    totalDropped: droppedCount
                }, { bypassCircuitBreaker: true, skipValidation: true });
                return { allowed: false, dropped: true };
            }
        }
    }

    // Add to pending queue for tracking
    const pendingEventEntry = { eventType, timestamp, priority };
    pendingEvents.push(pendingEventEntry);

    // Trim queue to max size
    while (pendingEvents.length > CIRCUIT_BREAKER_CONFIG.maxQueueSize) {
        pendingEvents.shift();
    }

    // Return cleanup function to remove this pending event after handlers complete
    return {
        allowed: true,
        cleanupFn: () => {
            const pendingIndex = pendingEvents.findIndex(
                e => e.eventType === eventType && e.timestamp === timestamp && e.priority === priority
            );
            if (pendingIndex !== -1) {
                pendingEvents.splice(pendingIndex, 1);
            }
        }
    };
}

// ==========================================
// Internal State
// ==========================================

/** @type {Map<string, Array<{handler: Function, priority: number, id: string}>>} */
const subscribers = new Map();

/** @type {boolean} */
let debugMode = false;

/** @type {Array<{event: string, payload: object, timestamp: number}>} */
const eventTrace = [];
const MAX_TRACE_SIZE = 100;

/** @type {number} */
let handlerId = 0;

// Circuit breaker state
/** @type {Array<{eventType: string, timestamp: number, priority: number}>} */
const pendingEvents = [];
let eventsThisWindow = 0;
let windowStart = Date.now();
let stormActive = false;
let stormCooldownUntil = 0;
let stormStartTime = 0;         // Track storm start for lifecycle events
let stormDroppedAtStart = 0;    // Track drops at storm start
let backpressureWarningEmitted = false; // Prevent duplicate backpressure warnings
let droppedCount = 0;

// Wave tracking state
const activeWaves = new Map();

// Event versioning and replay state
let eventVectorClock = new VectorClock();
let eventSequenceNumber = 0;
let eventLogEnabled = false;
let eventReplayInProgress = false;
let lastEventWatermark = -1; // Last sequence number we processed
// FIX Issue #1: Track failed persist sequences for replay watermark compensation
const failedPersistSequences = new Set();

// ==========================================
// Health Monitoring State
// ==========================================

/**
 * Health monitoring configuration
 */
const HEALTH_CONFIG = {
    heartbeatIntervalMs: 5000,      // Internal health check interval
    handlerTimeoutMs: 10000,        // Consider handler stuck after this
    maxHandlerFailures: 5,          // Failures before handler is paused
    healthCheckWindowMs: 60000,     // Rolling window for health metrics
    degradedThreshold: 0.8,         // Failure rate threshold for degraded status
    criticalThreshold: 0.95         // Failure rate threshold for critical status
};

/**
 * Per-handler circuit breaker configuration
 */
const HANDLER_CIRCUIT_CONFIG = {
    failureThreshold: 5,           // Consecutive failures to open circuit
    successThresholdHalfOpen: 2,   // Successes in half-open to close circuit
    cooldownMs: 30000,             // Time before half-open test
    halfOpenMaxAttempts: 3         // Max attempts in half-open before re-opening
};

/**
 * Circuit breaker states for per-handler isolation
 */
const CIRCUIT_STATE = {
    CLOSED: 'closed',      // Normal operation
    OPEN: 'open',          // Failing, skip execution
    HALF_OPEN: 'half_open' // Testing recovery
};

/**
 * Handler execution metrics with per-handler circuit breaker
 * @type {Map<string, {
 *   totalCalls: number,
 *   failures: number,
 *   totalTimeMs: number,
 *   lastCallTime: number,
 *   isStuck: boolean,
 *   isPaused: boolean,
 *   circuitState: string,
 *   consecutiveFailures: number,
 *   consecutiveSuccesses: number,
 *   lastFailureTime: number,
 *   halfOpenAttempts: number
 * }>}
 */
const handlerMetrics = new Map();

/** @type {number} */
let healthCheckInterval = null;

/** @type {number} */
let totalEventsProcessed = 0;

/** @type {number} */
let totalEventsFailed = 0;

/** @type {Array<{timestamp: number, success: boolean, durationMs: number}>} */
const recentEventResults = [];
const MAX_RECENT_RESULTS = 1000;

// ==========================================
// Core Functions
// ==========================================

/**
 * Subscribe to an event type
 * 
 * @param {string} eventType - Event type to subscribe to (use '*' for all events)
 * @param {Function} handler - Handler function receiving (payload, eventMeta)
 * @param {Object} [options] - Subscription options
 * @param {number} [options.priority=PRIORITY.NORMAL] - Handler priority (lower = earlier)
 * @param {string} [options.domain='global'] - Domain filter (receives only events from this domain, 'global' receives all)
 * @returns {Function} Unsubscribe function
 */
function on(eventType, handler, options = {}) {
    const priority = options.priority ?? PRIORITY.NORMAL;
    const domain = options.domain ?? 'global'; // Default domain receives all events
    const id = `handler_${++handlerId}`;

    if (!subscribers.has(eventType)) {
        subscribers.set(eventType, []);
    }

    const handlers = subscribers.get(eventType);
    handlers.push({ handler, priority, id, domain });

    // Sort by priority (stable sort to maintain insertion order for same priority)
    handlers.sort((a, b) => a.priority - b.priority);

    if (debugMode) {
        console.log(`[EventBus] Subscribed to "${eventType}" with priority ${priority}, domain ${domain} (id: ${id})`);
    }

    // Return unsubscribe function
    return () => off(eventType, id);
}

/**
 * Subscribe to an event once (auto-unsubscribes after first call)
 * 
 * @param {string} eventType - Event type
 * @param {Function} handler - Handler function
 * @param {Object} [options] - Subscription options
 * @returns {Function} Unsubscribe function
 */
function once(eventType, handler, options = {}) {
    const unsubscribe = on(eventType, (payload, meta) => {
        unsubscribe();
        handler(payload, meta);
    }, options);
    return unsubscribe;
}

/**
 * Unsubscribe a handler by ID
 * 
 * @param {string} eventType - Event type
 * @param {string} handlerId - Handler ID returned by on()
 */
function off(eventType, handlerId) {
    const handlers = subscribers.get(eventType);
    if (!handlers) return;

    const index = handlers.findIndex(h => h.id === handlerId);
    if (index > -1) {
        handlers.splice(index, 1);
        if (debugMode) {
            console.log(`[EventBus] Unsubscribed handler ${handlerId} from "${eventType}"`);
        }
    }
}

/**
 * Emit an event
 * 
 * @param {string} eventType - Event type
 * @param {Object} [payload={}] - Event payload
 * @param {Object} [options] - Emit options
 * @param {boolean} [options.skipValidation=false] - Skip payload validation
 * @param {boolean} [options.bypassCircuitBreaker=false] - Skip circuit breaker checks
 * @param {string} [options.domain='global'] - Event domain for filtering (subscribers with matching domain or 'global' receive it)
 * @returns {boolean} True if any handlers were called
 */
function emit(eventType, payload = {}, options = {}) {
    const timestamp = Date.now();
    const priority = EVENT_PRIORITIES[eventType] ?? PRIORITY.NORMAL;
    const eventDomain = options.domain ?? 'global';

    // Circuit breaker: Storm detection and queue overflow
    let circuitBreakerResult;
    if (!options.bypassCircuitBreaker) {
        circuitBreakerResult = runCircuitBreakerChecks(eventType, priority, timestamp);
        if (!circuitBreakerResult.allowed) {
            return circuitBreakerResult.dropped ? false : true;
        }
    }

    // Event versioning: increment sequence and tick VectorClock ONLY after circuit breaker passes
    const currentVectorClock = eventVectorClock.tick();
    eventSequenceNumber++;
    const sequenceNumber = eventSequenceNumber;

    // FIX Issue #1: Track sequence number BEFORE persistence attempt
    // If persist fails, we track the gap for replay watermark compensation
    // Store event in log if enabled
    if (eventLogEnabled && !eventReplayInProgress && !options.skipEventLog) {
        // Track this sequence as pending persistence
        const persistenceRecord = { sequenceNumber, eventType, timestamp: Date.now() };

        persistEvent(eventType, payload, currentVectorClock, sequenceNumber, options)
            .then(() => {
                // Successful persistence - mark as completed
                if (debugMode) {
                    console.log(`[EventBus] Event ${sequenceNumber} persisted successfully`);
                }
            })
            .catch(err => {
                console.error('[EventBus] Failed to persist event:', err);
                // FIX Issue #1: Track the failed sequence for watermark compensation
                // This allows replay to know about gaps and handle them appropriately
                failedPersistSequences.add(sequenceNumber);
                // Skip event log for persistence_failed events to prevent recursive logging
                EventBus.emit('event:persistence_failed', {
                    eventType,
                    error: err.message || String(err),
                    sequenceNumber,
                    // Include gap info for replay compensation
                    gapInfo: {
                        failedAt: sequenceNumber,
                        totalFailedPersists: failedPersistSequences.size
                    }
                }, { skipEventLog: true });
                totalEventsFailed++;
            });
    }

    // Update watermark
    lastEventWatermark = sequenceNumber;

    // Validate payload against schema if available
    if (!options.skipValidation && EVENT_SCHEMAS[eventType]) {
        const validationResult = validatePayload(eventType, payload);
        if (!validationResult.valid && debugMode) {
            console.warn(`[EventBus] Payload validation warning for "${eventType}":`, validationResult.errors);
        }
    }

    // Add to trace
    if (debugMode || eventTrace.length < MAX_TRACE_SIZE) {
        eventTrace.push({
            event: eventType,
            payload: sanitizePayload(payload),
            timestamp
        });

        // Trim trace if over limit
        if (eventTrace.length > MAX_TRACE_SIZE) {
            eventTrace.shift();
        }
    }

    if (debugMode) {
        console.log(`[EventBus] Emit "${eventType}"`, sanitizePayload(payload));
    }

    // Get handlers for this event + wildcard handlers
    const eventHandlers = subscribers.get(eventType) || [];
    const wildcardHandlers = subscribers.get('*') || [];

    const allHandlers = [...eventHandlers, ...wildcardHandlers]
        .sort((a, b) => a.priority - b.priority);

    if (allHandlers.length === 0) {
        return false;
    }

    // Wave tracking: Create wave context for critical events
    let waveId = options.waveId || null;
    const isCritical = WaveTelemetry.isCriticalEvent(eventType);

    if (isCritical && !waveId) {
        // Start a new wave for critical events
        waveId = WaveTelemetry.startWave(eventType);
        activeWaves.set(waveId, eventType);
    }

    // Build eventMeta - only include waveId if we have one
    const eventMeta = {
        type: eventType,
        timestamp,
        priority,
        stormActive,
        domain: eventDomain, // Include domain in metadata
        vectorClock: currentVectorClock,
        sequenceNumber,
        isReplay: eventReplayInProgress
    };

    // Only add waveId to eventMeta if we have one (for critical events)
    if (waveId) {
        eventMeta.waveId = waveId;
    }

    // Additional safeguard - take snapshot of handler IDs at start
    const handlerSnapshot = allHandlers.map(h => ({ ...h }));

    // Call handlers in priority order, filtering by domain
    for (const { handler, id, domain: handlerDomain } of handlerSnapshot) {
        // Verify handler still exists and is active before execution
        // A handler could have been removed during iteration
        const currentHandler = subscribers.get(eventType)?.find(h => h.id === id) ||
                              subscribers.get('*')?.find(h => h.id === id);
        if (!currentHandler || currentHandler.handler !== handler) {
            continue; // Handler was removed or replaced during iteration
        }

        // Domain filtering: handler receives event if:
        // 1. Handler domain is 'global' (receives all events - catch-all handlers)
        // 2. Event domain matches handler domain (scoped delivery)
        const domainMatches = handlerDomain === 'global' ||
            handlerDomain === eventDomain;

        if (!domainMatches) {
            if (debugMode) {
                console.log(`[EventBus] Skipping handler ${id} (domain mismatch: ${handlerDomain} vs ${eventDomain})`);
            }
            continue;
        }

        // Get or initialize handler metrics with circuit breaker state
        let handlerHealthMetrics = handlerMetrics.get(id);
        if (!handlerHealthMetrics) {
            handlerHealthMetrics = initializeHandlerMetrics();
            handlerMetrics.set(id, handlerHealthMetrics);
        }

        // Skip paused handlers (health monitoring)
        if (handlerHealthMetrics.isPaused) {
            if (debugMode) {
                console.log(`[EventBus] Skipping paused handler ${id}`);
            }
            continue;
        }

        // Per-handler circuit breaker check
        const circuitState = checkHandlerCircuitState(id, handlerHealthMetrics);
        if (circuitState === CIRCUIT_STATE.OPEN) {
            if (debugMode) {
                console.log(`[EventBus] Skipping handler ${id} (circuit OPEN)`);
            }
            continue;
        }

        // Track handler execution for health monitoring
        const handlerStartTime = performance.now();
        markHandlerStarted(id);

        // Record handler execution in wave chain
        if (waveId) {
            WaveTelemetry.recordNode(`handler:${id}`, waveId);
        }

        try {
            handler(payload, eventMeta);
            const durationMs = performance.now() - handlerStartTime;
            recordHandlerSuccess(id, durationMs);
        } catch (error) {
            const durationMs = performance.now() - handlerStartTime;
            recordHandlerFailure(id, durationMs, error);
            console.error(`[EventBus] Handler ${id} threw error for "${eventType}":`, error);
            // Don't stop other handlers from executing - isolated by circuit breaker
        }
    }

    // End wave after all handlers complete
    if (waveId && isCritical) {
        try {
            WaveTelemetry.endWave(waveId);
            activeWaves.delete(waveId);
        } catch (error) {
            console.error(`[EventBus] Failed to end wave ${waveId}:`, error);
        }
    }

    // Remove the pending event entry after handlers complete
    if (!options.bypassCircuitBreaker && circuitBreakerResult?.cleanupFn) {
        circuitBreakerResult.cleanupFn();
    }

    return true;
}

/**
 * Emit an event asynchronously (next tick)
 * Useful for avoiding synchronous cascades
 * 
 * NOTE: This does NOT await async handlers - it just defers emit() to the next microtask.
 * For awaiting async handlers, use emitAndAwait() or emitParallel() instead.
 * 
 * @param {string} eventType - Event type
 * @param {Object} [payload={}] - Event payload
 * @returns {Promise<boolean>} Resolves when handlers complete
 */
function emitAsync(eventType, payload = {}) {
    return new Promise(resolve => {
        queueMicrotask(() => {
            const result = emit(eventType, payload);
            resolve(result);
        });
    });
}

/**
 * Emit an event and await all async handlers sequentially
 * 
 * Handlers are executed in priority order, one at a time.
 * If a handler returns a Promise, it is awaited before calling the next handler.
 * This ensures handlers complete in order and allows proper error isolation.
 * 
 * @param {string} eventType - Event type
 * @param {Object} [payload={}] - Event payload
 * @param {Object} [options] - Emit options
 * @param {boolean} [options.skipValidation=false] - Skip payload validation
 * @param {boolean} [options.bypassCircuitBreaker=false] - Skip circuit breaker checks
 * @param {string} [options.domain='global'] - Event domain for filtering
 * @param {boolean} [options.stopOnError=false] - Stop processing if a handler throws
 * @returns {Promise<{handled: boolean, results: Array<{handlerId: string, success: boolean, error?: Error, durationMs: number}>}>}
 */
async function emitAndAwait(eventType, payload = {}, options = {}) {
    const timestamp = Date.now();
    const priority = EVENT_PRIORITIES[eventType] ?? PRIORITY.NORMAL;
    const eventDomain = options.domain ?? 'global';
    const stopOnError = options.stopOnError ?? false;

    // Run circuit breaker checks (same as emit())
    let circuitBreakerResult;
    if (!options.bypassCircuitBreaker) {
        circuitBreakerResult = runCircuitBreakerChecks(eventType, priority, timestamp);
        if (!circuitBreakerResult.allowed) {
            return { handled: false, results: [], dropped: circuitBreakerResult.dropped ? true : false };
        }
    }

    // Event versioning
    const currentVectorClock = eventVectorClock.tick();
    eventSequenceNumber++;
    const sequenceNumber = eventSequenceNumber;

    // Store event in log if enabled
    if (eventLogEnabled && !eventReplayInProgress && !options.skipEventLog) {
        const persistPromise = persistEvent(eventType, payload, currentVectorClock, sequenceNumber, options)
            .catch(err => {
                console.error('[EventBus] Failed to persist event:', err);
                // Skip event log for persistence_failed events to prevent recursive logging
                EventBus.emit('event:persistence_failed', { eventType, error: err }, { skipEventLog: true });
                totalEventsFailed++;
            });
    }

    lastEventWatermark = sequenceNumber;

    // Validate payload
    if (!options.skipValidation && EVENT_SCHEMAS[eventType]) {
        const validationResult = validatePayload(eventType, payload);
        if (!validationResult.valid && debugMode) {
            console.warn(`[EventBus] Payload validation warning for "${eventType}":`, validationResult.errors);
        }
    }

    // Add to trace
    if (debugMode || eventTrace.length < MAX_TRACE_SIZE) {
        eventTrace.push({
            event: eventType,
            payload: sanitizePayload(payload),
            timestamp
        });
        if (eventTrace.length > MAX_TRACE_SIZE) {
            eventTrace.shift();
        }
    }

    if (debugMode) {
        console.log(`[EventBus] EmitAndAwait "${eventType}"`, sanitizePayload(payload));
    }

    // Get handlers
    const eventHandlers = subscribers.get(eventType) || [];
    const wildcardHandlers = subscribers.get('*') || [];
    const allHandlers = [...eventHandlers, ...wildcardHandlers]
        .sort((a, b) => a.priority - b.priority);

    if (allHandlers.length === 0) {
        // Clean up pending event entry even though no handlers ran
        if (!options.bypassCircuitBreaker && circuitBreakerResult?.cleanupFn) {
            circuitBreakerResult.cleanupFn();
        }
        return { handled: false, results: [] };
    }

    const eventMeta = {
        type: eventType,
        timestamp,
        priority,
        stormActive,
        domain: eventDomain,
        vectorClock: currentVectorClock,
        sequenceNumber,
        isReplay: eventReplayInProgress,
        isAsync: true
    };

    const results = [];

    // Execute handlers sequentially, awaiting each one
    for (const { handler, id, domain: handlerDomain } of allHandlers) {
        // Domain filtering
        const domainMatches = handlerDomain === 'global' || handlerDomain === eventDomain;
        if (!domainMatches) {
            continue;
        }

        // Get or initialize handler metrics
        let handlerHealthMetrics = handlerMetrics.get(id);
        if (!handlerHealthMetrics) {
            handlerHealthMetrics = initializeHandlerMetrics();
            handlerMetrics.set(id, handlerHealthMetrics);
        }

        // Skip paused handlers
        if (handlerHealthMetrics.isPaused) {
            continue;
        }

        // Per-handler circuit breaker check
        const circuitState = checkHandlerCircuitState(id, handlerHealthMetrics);
        if (circuitState === CIRCUIT_STATE.OPEN) {
            continue;
        }

        const handlerStartTime = performance.now();
        markHandlerStarted(id);

        try {
            // Await the handler if it returns a Promise
            const handlerResult = handler(payload, eventMeta);
            if (handlerResult && typeof handlerResult.then === 'function') {
                await handlerResult;
            }

            const durationMs = performance.now() - handlerStartTime;
            recordHandlerSuccess(id, durationMs);

            results.push({
                handlerId: id,
                success: true,
                durationMs
            });
        } catch (error) {
            const durationMs = performance.now() - handlerStartTime;
            recordHandlerFailure(id, durationMs, error);

            results.push({
                handlerId: id,
                success: false,
                error,
                durationMs
            });

            console.error(`[EventBus] Async handler ${id} threw error for "${eventType}":`, error);

            if (stopOnError) {
                break;
            }
        }
    }

    // Clean up pending event entry after handlers complete (FIX: was missing this cleanup)
    if (!options.bypassCircuitBreaker && circuitBreakerResult?.cleanupFn) {
        circuitBreakerResult.cleanupFn();
    }

    return {
        handled: results.length > 0,
        results
    };
}

/**
 * Emit an event and run all async handlers in parallel
 * 
 * All handlers are started simultaneously and the function resolves
 * when all handlers have completed (or failed).
 * 
 * Use this when handlers are independent and can run concurrently.
 * 
 * @param {string} eventType - Event type
 * @param {Object} [payload={}] - Event payload
 * @param {Object} [options] - Emit options
 * @param {boolean} [options.skipValidation=false] - Skip payload validation
 * @param {boolean} [options.bypassCircuitBreaker=false] - Skip circuit breaker checks
 * @param {string} [options.domain='global'] - Event domain for filtering
 * @param {number} [options.timeoutMs=30000] - Timeout for each handler (default 30s)
 * @returns {Promise<{handled: boolean, results: Array<{handlerId: string, success: boolean, error?: Error, durationMs: number, timedOut?: boolean}>}>}
 */
async function emitParallel(eventType, payload = {}, options = {}) {
    const timestamp = Date.now();
    const priority = EVENT_PRIORITIES[eventType] ?? PRIORITY.NORMAL;
    const eventDomain = options.domain ?? 'global';
    const timeoutMs = options.timeoutMs ?? 30000;
    
    // Run circuit breaker checks
    if (!options.bypassCircuitBreaker) {
        if (timestamp - windowStart > CIRCUIT_BREAKER_CONFIG.stormWindowMs) {
            windowStart = timestamp;
            eventsThisWindow = 0;
        }
        eventsThisWindow++;
        
        if (pendingEvents.length >= CIRCUIT_BREAKER_CONFIG.maxQueueSize) {
            if (CIRCUIT_BREAKER_CONFIG.overflowStrategy === 'reject_all') {
                droppedCount++;
                return { handled: false, results: [], dropped: true };
            }
        }
    }
    
    // Event versioning
    const currentVectorClock = eventVectorClock.tick();
    eventSequenceNumber++;
    const sequenceNumber = eventSequenceNumber;
    
    // Store event in log if enabled
    if (eventLogEnabled && !eventReplayInProgress && !options.skipEventLog) {
        const persistPromise = persistEvent(eventType, payload, currentVectorClock, sequenceNumber, options)
            .catch(err => {
                console.error('[EventBus] Failed to persist event:', err);
                // Skip event log for persistence_failed events to prevent recursive logging
                EventBus.emit('event:persistence_failed', { eventType, error: err }, { skipEventLog: true });
                totalEventsFailed++;
                // Rethrow to allow caller to handle the error
                throw err;
            });
    }

    lastEventWatermark = sequenceNumber;

    // Validate payload
    if (!options.skipValidation && EVENT_SCHEMAS[eventType]) {
        const validationResult = validatePayload(eventType, payload);
        if (!validationResult.valid && debugMode) {
            console.warn(`[EventBus] Payload validation warning for "${eventType}":`, validationResult.errors);
        }
    }
    
    // Add to trace
    if (debugMode || eventTrace.length < MAX_TRACE_SIZE) {
        eventTrace.push({
            event: eventType,
            payload: sanitizePayload(payload),
            timestamp
        });
        if (eventTrace.length > MAX_TRACE_SIZE) {
            eventTrace.shift();
        }
    }
    
    if (debugMode) {
        console.log(`[EventBus] EmitParallel "${eventType}"`, sanitizePayload(payload));
    }
    
    // Get handlers
    const eventHandlers = subscribers.get(eventType) || [];
    const wildcardHandlers = subscribers.get('*') || [];
    const allHandlers = [...eventHandlers, ...wildcardHandlers]
        .sort((a, b) => a.priority - b.priority);
    
    if (allHandlers.length === 0) {
        return { handled: false, results: [] };
    }
    
    const eventMeta = {
        type: eventType,
        timestamp,
        priority,
        stormActive,
        domain: eventDomain,
        vectorClock: currentVectorClock,
        sequenceNumber,
        isReplay: eventReplayInProgress,
        isAsync: true,
        isParallel: true
    };
    
    // Build list of handlers to execute
    const handlerPromises = [];
    
    for (const { handler, id, domain: handlerDomain } of allHandlers) {
        // Domain filtering
        const domainMatches = handlerDomain === 'global' || handlerDomain === eventDomain;
        if (!domainMatches) {
            continue;
        }
        
        // Get or initialize handler metrics
        let handlerHealthMetrics = handlerMetrics.get(id);
        if (!handlerHealthMetrics) {
            handlerHealthMetrics = initializeHandlerMetrics();
            handlerMetrics.set(id, handlerHealthMetrics);
        }
        
        // Skip paused handlers
        if (handlerHealthMetrics.isPaused) {
            continue;
        }
        
        // Per-handler circuit breaker check
        const circuitState = checkHandlerCircuitState(id, handlerHealthMetrics);
        if (circuitState === CIRCUIT_STATE.OPEN) {
            continue;
        }
        
        // Create a promise for this handler with timeout
        const handlerPromise = (async () => {
            const handlerStartTime = performance.now();
            markHandlerStarted(id);

            let timerId = null;

            try {
                // Create timeout promise
                const timeoutPromise = new Promise((_, reject) => {
                    timerId = setTimeout(() => reject(new Error(`Handler timeout after ${timeoutMs}ms`)), timeoutMs);
                });

                // Race handler against timeout
                const handlerResult = handler(payload, eventMeta);
                if (handlerResult && typeof handlerResult.then === 'function') {
                    await Promise.race([handlerResult, timeoutPromise]);
                }

                const durationMs = performance.now() - handlerStartTime;
                recordHandlerSuccess(id, durationMs);

                return {
                    handlerId: id,
                    success: true,
                    durationMs
                };
            } catch (error) {
                const durationMs = performance.now() - handlerStartTime;
                const timedOut = error.message.includes('Handler timeout');

                recordHandlerFailure(id, durationMs, error);

                if (!timedOut) {
                    console.error(`[EventBus] Parallel handler ${id} threw error for "${eventType}":`, error);
                } else {
                    console.warn(`[EventBus] Parallel handler ${id} timed out for "${eventType}"`);
                }

                return {
                    handlerId: id,
                    success: false,
                    error,
                    durationMs,
                    timedOut
                };
            } finally {
                // Clear timeout timer to prevent leaks
                if (timerId !== null) {
                    clearTimeout(timerId);
                    timerId = null;
                }
            }
        })();
        
        handlerPromises.push(handlerPromise);
    }
    
    if (handlerPromises.length === 0) {
        return { handled: false, results: [] };
    }
    
    // Wait for all handlers to complete
    const results = await Promise.all(handlerPromises);
    
    return {
        handled: true,
        results
    };
}

// ==========================================
// Validation
// ==========================================

/**
 * Validate payload against schema
 * 
 * @param {string} eventType - Event type
 * @param {Object} payload - Payload to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
function validatePayload(eventType, payload) {
    const schema = EVENT_SCHEMAS[eventType];
    if (!schema || !schema.payload) {
        return { valid: true, errors: [] };
    }

    const errors = [];
    const expectedFields = schema.payload;

    for (const [field, type] of Object.entries(expectedFields)) {
        const isOptional = type.endsWith('?');
        const actualType = type.replace('?', '');
        const value = payload[field];

        if (value === undefined || value === null) {
            if (!isOptional) {
                errors.push(`Missing required field: ${field}`);
            }
            continue;
        }

        // Basic type checking
        const valueType = typeof value;
        if (actualType === 'object' && valueType !== 'object') {
            errors.push(`Field ${field} expected object, got ${valueType}`);
        } else if (actualType !== 'object' && valueType !== actualType) {
            errors.push(`Field ${field} expected ${actualType}, got ${valueType}`);
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Sanitize payload for logging (remove sensitive data)
 * 
 * @param {Object} payload - Payload to sanitize
 * @returns {Object} Sanitized copy
 */
function sanitizePayload(payload) {
    const sanitized = { ...payload };
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'credential'];

    for (const key of Object.keys(sanitized)) {
        if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
            sanitized[key] = '[REDACTED]';
        }
    }

    return sanitized;
}

// ==========================================
// Debug & Diagnostics
// ==========================================

/**
 * Enable/disable debug mode
 * 
 * @param {boolean} enabled - Whether to enable debug mode
 */
function setDebugMode(enabled) {
    debugMode = enabled;
    console.log(`[EventBus] Debug mode ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Get event trace for debugging
 * 
 * @param {number} [limit=50] - Max events to return
 * @returns {Array} Recent events
 */
function getTrace(limit = 50) {
    return eventTrace.slice(-limit);
}

/**
 * Clear event trace
 */
function clearTrace() {
    eventTrace.length = 0;
}

/**
 * Get all registered event types
 * 
 * @returns {string[]} Registered event types
 */
function getRegisteredEvents() {
    return Array.from(subscribers.keys());
}

/**
 * Get subscriber count for an event type
 * 
 * @param {string} eventType - Event type
 * @returns {number} Subscriber count
 */
function getSubscriberCount(eventType) {
    return (subscribers.get(eventType) || []).length;
}

/**
 * Get all available event schemas
 * 
 * @returns {Object} Event schemas
 */
function getSchemas() {
    return { ...EVENT_SCHEMAS };
}

/**
 * Clear all subscribers (for testing)
 */
function clearAll() {
    subscribers.clear();
    eventTrace.length = 0;
    pendingEvents.length = 0;
    handlerId = 0;
    eventsThisWindow = 0;
    stormActive = false;
    droppedCount = 0;
    // Reset health monitoring state
    handlerMetrics.clear();
    totalEventsProcessed = 0;
    totalEventsFailed = 0;
    recentEventResults.length = 0;
    // Reset event versioning and replay state
    eventSequenceNumber = 0;
    lastEventWatermark = -1;
    eventLogEnabled = false;
    eventReplayInProgress = false;
    eventVectorClock = new VectorClock();
    // FIX Issue #1: Clear failed persist tracking
    failedPersistSequences.clear();
    // Reset wave tracking state
    activeWaves.clear();
    console.log('[EventBus] All subscribers and circuit breaker state cleared');
}

/**
 * Get active waves (for testing)
 * @returns {Map} Active waves map
 */
function _getActiveWaves() {
    return activeWaves;
}

/**
 * Clear active waves (for testing)
 */
function _clearWaves() {
    activeWaves.clear();
}

// ==========================================
// Health Monitoring Functions
// ==========================================

/**
 * Start health monitoring heartbeat
 */
function startHealthMonitoring() {
    if (healthCheckInterval) {
        return; // Already running
    }

    healthCheckInterval = setInterval(() => {
        performHealthCheck();
    }, HEALTH_CONFIG.heartbeatIntervalMs);

    console.log('[EventBus] Health monitoring started');
}

/**
 * Stop health monitoring
 */
function stopHealthMonitoring() {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
        console.log('[EventBus] Health monitoring stopped');
    }
}

/**
 * Perform internal health check
 * Detects stuck handlers and emits health events
 */
function performHealthCheck() {
    const now = Date.now();
    let stuckCount = 0;
    let pausedCount = 0;

    // Check for stuck handlers
    for (const [handlerId, metrics] of handlerMetrics) {
        // Check if handler is stuck (long running without completion)
        if (metrics.lastCallTime && !metrics.isStuck) {
            const elapsed = now - metrics.lastCallTime;
            if (elapsed > HEALTH_CONFIG.handlerTimeoutMs) {
                metrics.isStuck = true;
                console.warn(`[EventBus] Handler ${handlerId} appears stuck (${elapsed}ms elapsed)`);
            }
        }

        if (metrics.isStuck) stuckCount++;
        if (metrics.isPaused) pausedCount++;
    }

    // Calculate health status
    const status = calculateHealthStatus();

    // Emit health degraded event if needed
    if (status.status !== 'healthy') {
        emit('eventbus:health_degraded', {
            status: status.status,
            failureRate: status.failureRate,
            stuckHandlers: stuckCount,
            pausedHandlers: pausedCount,
            avgLatencyMs: status.avgLatencyMs
        }, { bypassCircuitBreaker: true, skipValidation: true, skipEventLog: true });
    }

    // Prune old metrics from rolling window
    pruneOldMetrics();
}

/**
 * Record handler execution metrics
 * @param {string} handlerId - Handler identifier
 * @param {number} durationMs - Execution time in milliseconds
 * @param {boolean} success - Whether the handler succeeded
 */
function recordHandlerMetrics(handlerId, durationMs, success) {
    if (!handlerMetrics.has(handlerId)) {
        handlerMetrics.set(handlerId, initializeHandlerMetrics());
    }

    const metrics = handlerMetrics.get(handlerId);
    metrics.totalCalls++;
    metrics.totalTimeMs += durationMs;
    metrics.lastCallTime = 0; // Clear - call completed
    metrics.isStuck = false; // Recovered if it was stuck

    if (!success) {
        metrics.failures++;
        totalEventsFailed++;

        // Pause handler if too many failures
        if (metrics.failures >= HEALTH_CONFIG.maxHandlerFailures && !metrics.isPaused) {
            metrics.isPaused = true;
            console.warn(`[EventBus] Handler ${handlerId} paused due to ${metrics.failures} failures`);
        }
    }

    totalEventsProcessed++;

    // Add to recent results for rolling calculation
    recentEventResults.push({
        timestamp: Date.now(),
        success,
        durationMs
    });

    // Trim results
    while (recentEventResults.length > MAX_RECENT_RESULTS) {
        recentEventResults.shift();
    }
}

/**
 * Initialize handler metrics with circuit breaker state
 * @returns {Object} Initialized metrics object
 */
function initializeHandlerMetrics() {
    return {
        totalCalls: 0,
        failures: 0,
        totalTimeMs: 0,
        lastCallTime: 0,
        isStuck: false,
        isPaused: false,
        // Per-handler circuit breaker state
        circuitState: CIRCUIT_STATE.CLOSED,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastFailureTime: 0,
        halfOpenAttempts: 0
    };
}

/**
 * Check and update handler circuit breaker state
 * @param {string} handlerId - Handler identifier
 * @param {Object} metrics - Handler metrics object
 * @returns {string} Current circuit state after evaluation
 */
function checkHandlerCircuitState(handlerId, metrics) {
    const now = Date.now();
    
    // CLOSED - normal operation
    if (metrics.circuitState === CIRCUIT_STATE.CLOSED) {
        return CIRCUIT_STATE.CLOSED;
    }
    
    // OPEN - check if cooldown expired for half-open transition
    if (metrics.circuitState === CIRCUIT_STATE.OPEN) {
        const timeSinceFailure = now - metrics.lastFailureTime;
        
        if (timeSinceFailure >= HANDLER_CIRCUIT_CONFIG.cooldownMs) {
            // Transition to HALF_OPEN for testing
            metrics.circuitState = CIRCUIT_STATE.HALF_OPEN;
            metrics.halfOpenAttempts = 0;
            metrics.consecutiveSuccesses = 0;
            console.log(`[EventBus] Handler ${handlerId} circuit: OPEN -> HALF_OPEN (testing recovery)`);
            return CIRCUIT_STATE.HALF_OPEN;
        }
        
        return CIRCUIT_STATE.OPEN;
    }
    
    // HALF_OPEN - allow limited attempts for testing
    if (metrics.circuitState === CIRCUIT_STATE.HALF_OPEN) {
        if (metrics.halfOpenAttempts >= HANDLER_CIRCUIT_CONFIG.halfOpenMaxAttempts) {
            // Too many attempts in half-open, re-open circuit
            metrics.circuitState = CIRCUIT_STATE.OPEN;
            metrics.lastFailureTime = now;
            console.warn(`[EventBus] Handler ${handlerId} circuit: HALF_OPEN -> OPEN (max attempts exceeded)`);
            return CIRCUIT_STATE.OPEN;
        }
        return CIRCUIT_STATE.HALF_OPEN;
    }
    
    return CIRCUIT_STATE.CLOSED;
}

/**
 * Record successful handler execution for circuit breaker
 * @param {string} handlerId - Handler identifier
 * @param {number} durationMs - Execution time in milliseconds
 */
function recordHandlerSuccess(handlerId, durationMs) {
    const metrics = handlerMetrics.get(handlerId);
    if (!metrics) return;

    // Update standard metrics
    recordHandlerMetrics(handlerId, durationMs, true);

    // Update circuit breaker state
    metrics.consecutiveFailures = 0;
    metrics.consecutiveSuccesses++;

    if (metrics.circuitState === CIRCUIT_STATE.HALF_OPEN) {
        // Check if enough successes to close circuit
        if (metrics.consecutiveSuccesses >= HANDLER_CIRCUIT_CONFIG.successThresholdHalfOpen) {
            metrics.circuitState = CIRCUIT_STATE.CLOSED;
            metrics.halfOpenAttempts = 0;
            console.log(`[EventBus] Handler ${handlerId} circuit: HALF_OPEN -> CLOSED (recovered)`);
        }
    }
}

/**
 * Record failed handler execution for circuit breaker
 * @param {string} handlerId - Handler identifier
 * @param {number} durationMs - Execution time in milliseconds
 * @param {Error} error - The error that occurred
 */
function recordHandlerFailure(handlerId, durationMs, error) {
    const metrics = handlerMetrics.get(handlerId);
    if (!metrics) return;
    
    // Update standard metrics
    recordHandlerMetrics(handlerId, durationMs, false);
    
    // Update circuit breaker state
    metrics.consecutiveSuccesses = 0;
    metrics.consecutiveFailures++;
    metrics.lastFailureTime = Date.now();
    
    if (metrics.circuitState === CIRCUIT_STATE.HALF_OPEN) {
        // Failure in half-open immediately re-opens circuit
        metrics.circuitState = CIRCUIT_STATE.OPEN;
        metrics.halfOpenAttempts = 0;
        console.warn(`[EventBus] Handler ${handlerId} circuit: HALF_OPEN -> OPEN (failure during test)`);
    } else if (metrics.circuitState === CIRCUIT_STATE.CLOSED) {
        // Check if we should open the circuit
        if (metrics.consecutiveFailures >= HANDLER_CIRCUIT_CONFIG.failureThreshold) {
            metrics.circuitState = CIRCUIT_STATE.OPEN;
            console.warn(`[EventBus] Handler ${handlerId} circuit: CLOSED -> OPEN (${metrics.consecutiveFailures} consecutive failures)`);
            
            // Emit circuit breaker event for monitoring
            emit('eventbus:handler_circuit_open', {
                handlerId,
                failures: metrics.consecutiveFailures,
                lastError: error?.message || 'Unknown error'
            }, { bypassCircuitBreaker: true, skipValidation: true, skipEventLog: true });
        }
    }
}

/**
 * Get circuit breaker state for a specific handler
 * @param {string} handlerId - Handler identifier
 * @returns {Object|null} Circuit breaker state or null if not found
 */
function getHandlerCircuitState(handlerId) {
    const metrics = handlerMetrics.get(handlerId);
    if (!metrics) return null;
    
    return {
        state: metrics.circuitState,
        consecutiveFailures: metrics.consecutiveFailures,
        consecutiveSuccesses: metrics.consecutiveSuccesses,
        lastFailureTime: metrics.lastFailureTime,
        halfOpenAttempts: metrics.halfOpenAttempts,
        cooldownRemaining: metrics.circuitState === CIRCUIT_STATE.OPEN
            ? Math.max(0, HANDLER_CIRCUIT_CONFIG.cooldownMs - (Date.now() - metrics.lastFailureTime))
            : 0
    };
}

/**
 * Force reset a handler's circuit breaker to CLOSED
 * @param {string} handlerId - Handler identifier
 * @returns {boolean} True if reset was successful
 */
function resetHandlerCircuit(handlerId) {
    const metrics = handlerMetrics.get(handlerId);
    if (!metrics) return false;
    
    const previousState = metrics.circuitState;
    metrics.circuitState = CIRCUIT_STATE.CLOSED;
    metrics.consecutiveFailures = 0;
    metrics.consecutiveSuccesses = 0;
    metrics.halfOpenAttempts = 0;
    metrics.isPaused = false;
    metrics.isStuck = false;
    
    console.log(`[EventBus] Handler ${handlerId} circuit manually reset: ${previousState} -> CLOSED`);
    return true;
}

/**
 * Get all handlers with their circuit breaker states
 * @returns {Object} Map of handler IDs to circuit states
 */
function getAllHandlerCircuitStates() {
    const states = {};
    for (const [handlerId, metrics] of handlerMetrics) {
        states[handlerId] = {
            circuitState: metrics.circuitState,
            consecutiveFailures: metrics.consecutiveFailures,
            isPaused: metrics.isPaused,
            isStuck: metrics.isStuck
        };
    }
    return states;
}

/**
 * Mark handler as starting execution
 * @param {string} handlerId - Handler identifier
 */
function markHandlerStarted(handlerId) {
    if (!handlerMetrics.has(handlerId)) {
        const metrics = initializeHandlerMetrics();
        metrics.lastCallTime = Date.now();
        handlerMetrics.set(handlerId, metrics);
    } else {
        const metrics = handlerMetrics.get(handlerId);
        metrics.lastCallTime = Date.now();
        
        // Increment half-open attempts if in that state
        if (metrics.circuitState === CIRCUIT_STATE.HALF_OPEN) {
            metrics.halfOpenAttempts++;
        }
    }
}

/**
 * Prune old metrics from rolling window
 */
function pruneOldMetrics() {
    const cutoff = Date.now() - HEALTH_CONFIG.healthCheckWindowMs;

    while (recentEventResults.length > 0 && recentEventResults[0].timestamp < cutoff) {
        recentEventResults.shift();
    }
}

/**
 * Calculate current health status
 * @returns {{status: 'healthy'|'degraded'|'critical', failureRate: number, avgLatencyMs: number, handlerCount: number, stuckCount: number, pausedCount: number}}
 */
function calculateHealthStatus() {
    // Calculate failure rate from recent events
    const total = recentEventResults.length;
    const failures = recentEventResults.filter(r => !r.success).length;
    const failureRate = total > 0 ? failures / total : 0;

    // Calculate average latency
    const avgLatencyMs = total > 0
        ? recentEventResults.reduce((sum, r) => sum + r.durationMs, 0) / total
        : 0;

    // Count handler states
    let stuckCount = 0;
    let pausedCount = 0;
    for (const metrics of handlerMetrics.values()) {
        if (metrics.isStuck) stuckCount++;
        if (metrics.isPaused) pausedCount++;
    }

    // Determine status
    let status = 'healthy';
    if (failureRate >= HEALTH_CONFIG.criticalThreshold || stuckCount >= 3) {
        status = 'critical';
    } else if (failureRate >= HEALTH_CONFIG.degradedThreshold || stuckCount >= 1 || pausedCount >= 2) {
        status = 'degraded';
    }

    return {
        status,
        failureRate,
        avgLatencyMs,
        handlerCount: subscribers.size,
        stuckCount,
        pausedCount
    };
}

/**
 * Get comprehensive health status
 * @returns {Object} Health status including all metrics
 */
function getHealthStatus() {
    const status = calculateHealthStatus();
    return {
        ...status,
        healthy: status.status === 'healthy',
        totalEventsProcessed,
        totalEventsFailed,
        recentEventCount: recentEventResults.length,
        circuitBreaker: getCircuitBreakerStatus(),
        config: { ...HEALTH_CONFIG }
    };
}

/**
 * Reset a stuck or paused handler (also resets circuit breaker)
 * @param {string} handlerId - Handler identifier
 * @returns {boolean} True if handler was reset
 */
function resetHandler(handlerId) {
    const metrics = handlerMetrics.get(handlerId);
    if (!metrics) return false;

    metrics.isStuck = false;
    metrics.isPaused = false;
    metrics.failures = 0;
    // Also reset circuit breaker state
    metrics.circuitState = CIRCUIT_STATE.CLOSED;
    metrics.consecutiveFailures = 0;
    metrics.consecutiveSuccesses = 0;
    metrics.halfOpenAttempts = 0;
    
    console.log(`[EventBus] Handler ${handlerId} fully reset (including circuit breaker)`);
    return true;
}

/**
 * Reset all health monitoring state
 */
function resetHealth() {
    handlerMetrics.clear();
    totalEventsProcessed = 0;
    totalEventsFailed = 0;
    recentEventResults.length = 0;
    console.log('[EventBus] Health monitoring state reset');
}

/**
 * Configure health monitoring
 * @param {Object} config - Configuration updates
 */
function configureHealth(config) {
    Object.assign(HEALTH_CONFIG, config);
    console.log('[EventBus] Health configuration updated:', HEALTH_CONFIG);
}

/**
 * Get circuit breaker status
 * @returns {Object}
 */
function getCircuitBreakerStatus() {
    return {
        pendingEventCount: pendingEvents.length,
        maxQueueSize: CIRCUIT_BREAKER_CONFIG.maxQueueSize,
        queueUtilization: (pendingEvents.length / CIRCUIT_BREAKER_CONFIG.maxQueueSize * 100).toFixed(1) + '%',
        stormActive,
        eventsThisWindow,
        droppedCount,
        overflowStrategy: CIRCUIT_BREAKER_CONFIG.overflowStrategy
    };
}

/**
 * Configure circuit breaker settings
 * @param {Object} config - Partial configuration
 */
function configureCircuitBreaker(config) {
    Object.assign(CIRCUIT_BREAKER_CONFIG, config);
    console.log('[EventBus] Circuit breaker configured:', CIRCUIT_BREAKER_CONFIG);
}

// ==========================================
// Event Persistence & Replay
// ==========================================

/**
 * Module-level reference to EventBus for internal use.
 * Set after EventBus object is created to avoid circular dependency.
 * @type {Object|null}
 */
let EventBusRef = null;

/**
 * Persist event to log
 * @param {string} eventType - Event type
 * @param {object} payload - Event payload
 * @param {object} vectorClock - Vector clock state
 * @param {number} sequenceNumber - Sequence number
 * @param {object} options - Emit options
 */
async function persistEvent(eventType, payload, vectorClock, sequenceNumber, options = {}) {
    try {
        const sourceTab = TabCoordinator.getTabId();
        const eventDomain = options.domain ?? 'global';
        await EventLogStore.appendEvent(eventType, payload, vectorClock, sourceTab, eventDomain);

        // Create periodic checkpoint
        if (sequenceNumber > 0 && sequenceNumber % EventLogStore.COMPACTION_CONFIG.checkpointInterval === 0) {
            await EventLogStore.createCheckpoint(sequenceNumber, { timestamp: Date.now() });
        }
    } catch (error) {
        console.error('[EventBus] Failed to persist event:', error);
        // Use module-level reference if available, otherwise log warning
        if (EventBusRef && EventBusRef.emit) {
            EventBusRef.emit('eventbus:persistence_error', {
                error: error.message,
                eventType
            }, { skipEventLog: true });
        } else {
            console.warn('[EventBus] Unable to emit persistence error - EventBusRef not initialized');
        }
    }
}

/**
 * Enable event logging
 * @param {boolean} enabled - Whether to enable event logging
 */
function enableEventLog(enabled = true) {
    eventLogEnabled = enabled;
    console.log(`[EventBus] Event logging ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Check if event logging is enabled
 * @returns {boolean}
 */
function isEventLogEnabled() {
    return eventLogEnabled;
}

/**
 * Get current event watermark
 * @returns {number} Current sequence number
 */
function getEventWatermark() {
    return lastEventWatermark;
}

/**
 * Set event watermark
 * @param {number} watermark - Watermark to set
 */
function setEventWatermark(watermark) {
    lastEventWatermark = watermark;
    console.log(`[EventBus] Event watermark set to ${watermark}`);
}

/**
 * Replay events from log
 * @param {object} options - Replay options
 * @param {number} [options.fromSequenceNumber=-1] - Start from this sequence
 * @param {number} [options.count=1000] - Maximum events to replay
 * @param {boolean} [options.forward=true] - Replay forward or reverse
 * @returns {Promise<{replayed: number, errors: number}>}
 */
async function replayEvents(options = {}) {
    const {
        fromSequenceNumber = -1,
        count = 1000,
        forward = true
    } = options;

    eventReplayInProgress = true;

    try {
        console.log(`[EventBus] Starting event replay from sequence ${fromSequenceNumber}`);
        const events = await EventLogStore.getEvents(fromSequenceNumber, count);

        if (forward) {
            events.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        } else {
            events.sort((a, b) => b.sequenceNumber - a.sequenceNumber);
        }

        let replayed = 0;
        let errors = 0;

        for (const event of events) {
            try {
                // Merge vector clock
                if (event.vectorClock) {
                    eventVectorClock.merge(event.vectorClock);
                }

                // Emit with replay flag using original event domain
                emit(event.type, event.payload, {
                    skipEventLog: true, // Don't log replayed events
                    domain: event.domain || 'global'
                });

                // Update watermark
                if (event.sequenceNumber > lastEventWatermark) {
                    lastEventWatermark = event.sequenceNumber;
                }

                replayed++;
            } catch (error) {
                console.error(`[EventBus] Error replaying event ${event.id}:`, error);
                errors++;
            }
        }

        console.log(`[EventBus] Event replay complete: ${replayed} events, ${errors} errors`);
        return { replayed, errors };
    } finally {
        eventReplayInProgress = false;
    }
}

/**
 * Get event log statistics
 * @returns {Promise<object>}
 */
async function getEventLogStats() {
    return EventLogStore.getEventLogStats();
}

/**
 * Clear event log
 * @returns {Promise<void>}
 */
async function clearEventLog() {
    await EventLogStore.clearEventLog();
    console.log('[EventBus] Event log cleared');
}

// ==========================================
// Public API
// ==========================================

export const EventBus = {
    // Core subscription
    on,
    once,
    off,

    // Emitting
    emit,
    emitAsync,
    emitAndAwait,
    emitParallel,

    // Debug & diagnostics
    setDebugMode,
    getTrace,
    clearTrace,
    getRegisteredEvents,
    getSubscriberCount,
    getSchemas,

    // Circuit breaker
    getCircuitBreakerStatus,
    configureCircuitBreaker,

    // Health monitoring
    getHealthStatus,
    startHealthMonitoring,
    stopHealthMonitoring,
    resetHandler,
    resetHealth,
    configureHealth,

    // Per-handler circuit breaker
    getHandlerCircuitState,
    resetHandlerCircuit,
    getAllHandlerCircuitStates,
    CIRCUIT_STATE,
    HANDLER_CIRCUIT_CONFIG,

    // Event versioning and replay
    enableEventLog,
    isEventLogEnabled,
    getEventWatermark,
    setEventWatermark,
    replayEvents,
    getEventLogStats,
    clearEventLog,
    // FIX Issue #1: Expose failed persist sequences for replay watermark compensation
    getFailedPersistSequences: () => new Set(failedPersistSequences),
    clearFailedPersistSequences: () => failedPersistSequences.clear(),

    // Testing
    clearAll,
    _getActiveWaves,
    _clearWaves,

    // Constants
    PRIORITY,
    EVENT_SCHEMAS
};

// Set module-level reference for internal use (e.g., persistEvent error handling)
EventBusRef = EventBus;

console.log('[EventBus] Centralized event system loaded');
