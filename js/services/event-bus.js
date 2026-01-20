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

// Event versioning and replay state
let eventVectorClock = new VectorClock();
let eventSequenceNumber = 0;
let eventLogEnabled = false;
let eventReplayInProgress = false;
let lastEventWatermark = -1; // Last sequence number we processed

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
 * Handler execution metrics
 * @type {Map<string, {totalCalls: number, failures: number, totalTimeMs: number, lastCallTime: number, isStuck: boolean, isPaused: boolean}>}
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

    // Circuit breaker: Storm detection
    if (!options.bypassCircuitBreaker) {
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
                return false;
            } else if (strategy === 'drop_low_priority') {
                // Find lowest priority event to drop
                const lowestPriorityIndex = pendingEvents.reduce((lowest, event, index) => {
                    if (pendingEvents[lowest].priority < event.priority) {
                        return index;
                    }
                    return lowest;
                }, 0);

                // Only drop if new event has equal or lower priority
                if (priority >= pendingEvents[lowestPriorityIndex].priority) {
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
                    return false;
                }

                // Drop lowest priority event
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
            } else if (strategy === 'drop_oldest') {
                const dropped = pendingEvents.shift();
                droppedCount++;
                // Emit drop event for monitoring
                emit('CIRCUIT_BREAKER:DROPPED', {
                    count: 1,
                    eventType: dropped?.eventType || 'unknown',
                    reason: 'oldest_dropped',
                    totalDropped: droppedCount
                }, { bypassCircuitBreaker: true, skipValidation: true });
                if (debugMode) {
                    console.warn(`[EventBus] Dropped oldest event: ${dropped?.eventType}`);
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
    }

    // Event versioning: increment sequence and tick VectorClock ONLY after circuit breaker passes
    const currentVectorClock = eventVectorClock.tick();
    eventSequenceNumber++;
    const sequenceNumber = eventSequenceNumber;

    // Store event in log if enabled
    if (eventLogEnabled && !eventReplayInProgress && !options.skipEventLog) {
        persistEvent(eventType, payload, currentVectorClock, sequenceNumber, options)
            .catch(err => console.warn('[EventBus] Failed to persist event:', err));
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

    // Call handlers in priority order, filtering by domain
    for (const { handler, id, domain: handlerDomain } of allHandlers) {
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

        // Skip paused handlers (health monitoring)
        const handlerHealthMetrics = handlerMetrics.get(id);
        if (handlerHealthMetrics?.isPaused) {
            if (debugMode) {
                console.log(`[EventBus] Skipping paused handler ${id}`);
            }
            continue;
        }

        // Track handler execution for health monitoring
        const handlerStartTime = performance.now();
        markHandlerStarted(id);

        try {
            handler(payload, eventMeta);
            const durationMs = performance.now() - handlerStartTime;
            recordHandlerMetrics(id, durationMs, true);
        } catch (error) {
            const durationMs = performance.now() - handlerStartTime;
            recordHandlerMetrics(id, durationMs, false);
            console.error(`[EventBus] Handler ${id} threw error for "${eventType}":`, error);
            // Don't stop other handlers from executing
        }
    }

    // Remove the pending event entry after handlers complete
    if (!options.bypassCircuitBreaker) {
        const pendingIndex = pendingEvents.findIndex(
            e => e.eventType === eventType && e.timestamp === timestamp && e.priority === priority
        );
        if (pendingIndex !== -1) {
            pendingEvents.splice(pendingIndex, 1);
        }
    }

    return true;
}

/**
 * Emit an event asynchronously (next tick)
 * Useful for avoiding synchronous cascades
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
    console.log('[EventBus] All subscribers and circuit breaker state cleared');
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
        handlerMetrics.set(handlerId, {
            totalCalls: 0,
            failures: 0,
            totalTimeMs: 0,
            lastCallTime: 0,
            isStuck: false,
            isPaused: false
        });
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
 * Mark handler as starting execution
 * @param {string} handlerId - Handler identifier
 */
function markHandlerStarted(handlerId) {
    if (!handlerMetrics.has(handlerId)) {
        handlerMetrics.set(handlerId, {
            totalCalls: 0,
            failures: 0,
            totalTimeMs: 0,
            lastCallTime: Date.now(),
            isStuck: false,
            isPaused: false
        });
    } else {
        handlerMetrics.get(handlerId).lastCallTime = Date.now();
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
 * Reset a stuck or paused handler
 * @param {string} handlerId - Handler identifier
 * @returns {boolean} True if handler was reset
 */
function resetHandler(handlerId) {
    const metrics = handlerMetrics.get(handlerId);
    if (!metrics) return false;

    metrics.isStuck = false;
    metrics.isPaused = false;
    metrics.failures = 0;
    console.log(`[EventBus] Handler ${handlerId} reset`);
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

    // Event versioning and replay
    enableEventLog,
    isEventLogEnabled,
    getEventWatermark,
    setEventWatermark,
    replayEvents,
    getEventLogStats,
    clearEventLog,

    // Testing
    clearAll,

    // Constants
    PRIORITY,
    EVENT_SCHEMAS
};

// Set module-level reference for internal use (e.g., persistEvent error handling)
EventBusRef = EventBus;

console.log('[EventBus] Centralized event system loaded');
