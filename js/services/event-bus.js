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
    'session:deleted': {
        description: 'Session deleted',
        payload: { sessionId: 'string' }
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
    cooldownMs: 5000                 // Cooldown after storm
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
let droppedCount = 0;

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
 * @returns {Function} Unsubscribe function
 */
function on(eventType, handler, options = {}) {
    const priority = options.priority ?? PRIORITY.NORMAL;
    const id = `handler_${++handlerId}`;

    if (!subscribers.has(eventType)) {
        subscribers.set(eventType, []);
    }

    const handlers = subscribers.get(eventType);
    handlers.push({ handler, priority, id });

    // Sort by priority (stable sort to maintain insertion order for same priority)
    handlers.sort((a, b) => a.priority - b.priority);

    if (debugMode) {
        console.log(`[EventBus] Subscribed to "${eventType}" with priority ${priority} (id: ${id})`);
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
 * @returns {boolean} True if any handlers were called
 */
function emit(eventType, payload = {}, options = {}) {
    const timestamp = Date.now();
    const priority = EVENT_PRIORITIES[eventType] ?? PRIORITY.NORMAL;

    // Circuit breaker: Storm detection
    if (!options.bypassCircuitBreaker) {
        // Update storm window
        if (timestamp - windowStart > CIRCUIT_BREAKER_CONFIG.stormWindowMs) {
            // Check if storm threshold was exceeded
            if (eventsThisWindow > CIRCUIT_BREAKER_CONFIG.stormThreshold && !stormActive) {
                stormActive = true;
                stormCooldownUntil = timestamp + CIRCUIT_BREAKER_CONFIG.cooldownMs;
                console.warn(`[EventBus] Event storm detected: ${eventsThisWindow} events in ${CIRCUIT_BREAKER_CONFIG.stormWindowMs}ms`);
                // Emit storm warning (bypass circuit breaker to avoid recursion)
                emit('eventbus:storm', {
                    eventsPerSecond: eventsThisWindow,
                    threshold: CIRCUIT_BREAKER_CONFIG.stormThreshold
                }, { bypassCircuitBreaker: true, skipValidation: true });
            }
            // Reset window
            windowStart = timestamp;
            eventsThisWindow = 0;
            // Check cooldown
            if (stormActive && timestamp > stormCooldownUntil) {
                stormActive = false;
                console.log('[EventBus] Event storm cooldown complete');
            }
        }
        eventsThisWindow++;

        // Queue overflow handling
        if (pendingEvents.length >= CIRCUIT_BREAKER_CONFIG.maxQueueSize) {
            const strategy = CIRCUIT_BREAKER_CONFIG.overflowStrategy;

            if (strategy === 'reject_all') {
                droppedCount++;
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
                    if (debugMode) {
                        console.warn(`[EventBus] Event rejected (equal or lower priority than queue): ${eventType}`);
                    }
                    return false;
                }

                // Drop lowest priority event
                const dropped = pendingEvents.splice(lowestPriorityIndex, 1)[0];
                droppedCount++;
                if (debugMode) {
                    console.warn(`[EventBus] Dropped low-priority event: ${dropped.eventType}`);
                }
            } else if (strategy === 'drop_oldest') {
                const dropped = pendingEvents.shift();
                droppedCount++;
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
        stormActive
    };

    // Call handlers in priority order
    for (const { handler, id } of allHandlers) {
        try {
            handler(payload, eventMeta);
        } catch (error) {
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
    console.log('[EventBus] All subscribers and circuit breaker state cleared');
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

    // Testing
    clearAll,

    // Constants
    PRIORITY,
    EVENT_SCHEMAS
};

console.log('[EventBus] Centralized event system loaded');
