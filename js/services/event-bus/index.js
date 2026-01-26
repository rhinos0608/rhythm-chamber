import { VectorClock } from '../vector-clock.js';
import { WaveTelemetry } from '../wave-telemetry.js';
import { EventLogStore } from '../../storage/event-log-store.js';

const PRIORITY = Object.freeze({
    LOW: 0,
    NORMAL: 1,
    HIGH: 2,
    CRITICAL: 3
});

const EVENT_SCHEMAS = {
    'storage:updated': {
        description: 'Data saved to storage',
        payload: { store: 'string', key: 'string?', count: 'number?' }
    },
    'session:created': {
        description: 'New chat session created',
        payload: { sessionId: 'string', title: 'string?' }
    }
};

const _dynamicSchemas = new Map();

let debugMode = false;

const subscribers = new Map();
const wildcardSubscribers = [];
let subscriptionSeq = 0;

const MAX_TRACE_SIZE = 100;
const trace = [];

const eventVectorClock = new VectorClock();
let sequenceNumber = 0;
let lastEventWatermark = -1;

let eventLogEnabled = false;
let eventReplayInProgress = false;
const failedPersistSequences = new Set();

const circuitBreakerConfig = {
    maxQueueSize: 1000,
    stormWindowMs: 1000,
    stormThreshold: 100,
    backpressureWarningRatio: 0.8
};

let circuitWindowStart = Date.now();
let eventsThisWindow = 0;
let stormActive = false;
let droppedCount = 0;
const pendingEvents = [];

const CIRCUIT_STATE = Object.freeze({
    CLOSED: 'closed',
    OPEN: 'open',
    HALF_OPEN: 'half_open'
});

const HANDLER_CIRCUIT_CONFIG = Object.freeze({
    failureThreshold: 5,
    openMs: 5000
});

function setDebugMode(enabled) {
    debugMode = !!enabled;
}

function registerSchema(eventType, schema) {
    if (!eventType || typeof eventType !== 'string') return false;
    if (!schema || typeof schema !== 'object') return false;
    _dynamicSchemas.set(eventType, schema);
    return true;
}

function registerSchemas(schemaMap) {
    if (!schemaMap || typeof schemaMap !== 'object') return 0;
    let count = 0;
    for (const [eventType, schema] of Object.entries(schemaMap)) {
        if (registerSchema(eventType, schema)) count++;
    }
    return count;
}

function getSchema(eventType) {
    if (_dynamicSchemas.has(eventType)) {
        return _dynamicSchemas.get(eventType);
    }
    return EVENT_SCHEMAS[eventType];
}

function getSchemas() {
    const merged = { ...EVENT_SCHEMAS };
    for (const [eventType, schema] of _dynamicSchemas.entries()) {
        merged[eventType] = schema;
    }
    return merged;
}

function validateAgainstSchema(eventType, payload) {
    const schema = getSchema(eventType);
    if (!schema || !schema.payload) return { valid: true };
    if (!payload || typeof payload !== 'object') return { valid: false, error: 'Payload must be an object' };

    for (const [key, typeSpec] of Object.entries(schema.payload)) {
        const optional = typeof typeSpec === 'string' && typeSpec.endsWith('?');
        const expectedType = optional ? typeSpec.slice(0, -1) : typeSpec;
        const value = payload[key];

        if (value === undefined || value === null) {
            if (!optional) return { valid: false, error: `Missing required field '${key}'` };
            continue;
        }

        if (expectedType === 'array') {
            if (!Array.isArray(value)) return { valid: false, error: `Field '${key}' must be array` };
            continue;
        }

        if (expectedType === 'object') {
            if (typeof value !== 'object') return { valid: false, error: `Field '${key}' must be object` };
            continue;
        }

        if (typeof value !== expectedType) {
            return { valid: false, error: `Field '${key}' must be ${expectedType}` };
        }
    }

    return { valid: true };
}

function redactSensitive(value) {
    if (!value || typeof value !== 'object') return value;
    const SENSITIVE_KEYS = new Set(['apiToken', 'apiKey', 'token', 'password', 'secret', 'authorization']);
    const out = Array.isArray(value) ? [] : {};
    for (const [k, v] of Object.entries(value)) {
        if (SENSITIVE_KEYS.has(k)) {
            out[k] = '[REDACTED]';
        } else if (v && typeof v === 'object') {
            out[k] = redactSensitive(v);
        } else {
            out[k] = v;
        }
    }
    return out;
}

function addTrace(eventType, payload, meta) {
    trace.push({
        event: eventType,
        payload: redactSensitive(payload),
        meta: { ...meta }
    });
    if (trace.length > MAX_TRACE_SIZE) {
        trace.splice(0, trace.length - MAX_TRACE_SIZE);
    }
}

function getTrace() {
    return [...trace];
}

function clearTrace() {
    trace.length = 0;
}

function on(eventType, handler, options = {}) {
    if (!eventType || typeof handler !== 'function') {
        return () => {};
    }

    const sub = {
        id: ++subscriptionSeq,
        handler,
        once: false,
        priority: options.priority ?? PRIORITY.NORMAL
    };

    if (eventType === '*') {
        wildcardSubscribers.push(sub);
        return () => off(eventType, handler);
    }

    const list = subscribers.get(eventType) || [];
    list.push(sub);
    subscribers.set(eventType, list);
    return () => off(eventType, handler);
}

function once(eventType, handler, options = {}) {
    const unsubscribe = on(eventType, handler, options);
    const list = eventType === '*' ? wildcardSubscribers : (subscribers.get(eventType) || []);
    const sub = list.find(s => s.handler === handler);
    if (sub) sub.once = true;
    return unsubscribe;
}

function off(eventType, handler) {
    if (!eventType) return;
    if (eventType === '*') {
        const idx = wildcardSubscribers.findIndex(s => s.handler === handler);
        if (idx >= 0) wildcardSubscribers.splice(idx, 1);
        return;
    }
    const list = subscribers.get(eventType);
    if (!list) return;
    subscribers.set(eventType, list.filter(s => s.handler !== handler));
}

function clearAll() {
    subscribers.clear();
    wildcardSubscribers.length = 0;
    clearTrace();
    _dynamicSchemas.clear();
    debugMode = false;
    sequenceNumber = 0;
    lastEventWatermark = -1;
    eventLogEnabled = false;
    eventReplayInProgress = false;
    failedPersistSequences.clear();
    pendingEvents.length = 0;
    droppedCount = 0;
    stormActive = false;
    circuitWindowStart = Date.now();
    eventsThisWindow = 0;
}

function getRegisteredEvents() {
    return [...subscribers.keys()];
}

function getSubscriberCount(eventType) {
    if (!eventType) return 0;
    if (eventType === '*') return wildcardSubscribers.length;
    return (subscribers.get(eventType) || []).length;
}

function computeWaveId(eventType) {
    const critical = WaveTelemetry.getCriticalEvents?.() || [];
    if (!critical.includes(eventType)) return undefined;
    const waveId = WaveTelemetry.startWave?.(`event:${eventType}`);
    if (!waveId) return undefined;
    WaveTelemetry.recordNode?.(`event:${eventType}`, waveId);
    return waveId;
}

function updateCircuitBreakerCounters() {
    const now = Date.now();
    if (now - circuitWindowStart > circuitBreakerConfig.stormWindowMs) {
        stormActive = eventsThisWindow > circuitBreakerConfig.stormThreshold;
        circuitWindowStart = now;
        eventsThisWindow = 0;
    }
    eventsThisWindow++;
}

function getCircuitBreakerStatus() {
    const pendingEventCount = pendingEvents.length;
    const maxQueueSize = circuitBreakerConfig.maxQueueSize;
    const queueUtilization = maxQueueSize > 0 ? pendingEventCount / maxQueueSize : 0;
    return {
        pendingEventCount,
        maxQueueSize,
        queueUtilization,
        stormActive,
        droppedCount
    };
}

function configureCircuitBreaker(config = {}) {
    Object.assign(circuitBreakerConfig, config);
}

async function maybePersistEvent(eventType, payload, meta, options) {
    if (!eventLogEnabled || eventReplayInProgress || options.skipEventLog) return;
    try {
        const stored = await EventLogStore.appendEvent(
            eventType,
            payload,
            meta.vectorClock,
            options.sourceTab || 'local',
            options.domain || 'global'
        );
        if (typeof stored?.sequenceNumber === 'number') {
            lastEventWatermark = Math.max(lastEventWatermark, stored.sequenceNumber);
        }
    } catch (e) {
        failedPersistSequences.add(meta.sequenceNumber);
        EventBus.emit('event:persistence_failed', { eventType, error: e?.message || String(e) }, { skipEventLog: true });
    }
}

function dispatchHandlers(eventType, payload, meta) {
    const list = (subscribers.get(eventType) || []).slice();
    const wild = wildcardSubscribers.slice();
    const combined = list.concat(wild);

    combined.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.id - b.id;
    });

    let called = 0;
    for (const sub of combined) {
        try {
            sub.handler(payload, meta);
        } catch (e) {
            console.error('[EventBus] Handler error:', e);
        } finally {
            called++;
            if (sub.once) {
                off(eventType === '*' ? '*' : eventType, sub.handler);
            }
        }
    }

    return called > 0;
}

function emit(eventType, payload = {}, options = {}) {
    if (!eventType) return false;

    updateCircuitBreakerCounters();

    const hasAnyHandlers =
        (subscribers.get(eventType)?.length || 0) > 0 || wildcardSubscribers.length > 0;

    const waveId = computeWaveId(eventType);
    const meta = {
        type: eventType,
        timestamp: Date.now(),
        priority: options.priority ?? PRIORITY.NORMAL,
        sequenceNumber: sequenceNumber++,
        vectorClock: eventVectorClock.tick(),
        isReplay: !!options.skipEventLog,
        waveId
    };

    const validation = validateAgainstSchema(eventType, payload);
    if (!validation.valid && debugMode) {
        console.warn(`[EventBus] Invalid payload for ${eventType}: ${validation.error}`);
    }

    addTrace(eventType, payload, meta);
    void maybePersistEvent(eventType, payload, meta, options);

    if (meta.sequenceNumber > lastEventWatermark) {
        lastEventWatermark = meta.sequenceNumber;
    }

    if (!hasAnyHandlers) {
        return false;
    }

    return dispatchHandlers(eventType, payload, meta);
}

function emitAsync(eventType, payload = {}, options = {}) {
    return new Promise(resolve => {
        setTimeout(() => resolve(emit(eventType, payload, options)), 0);
    });
}

async function emitAndAwait(eventType, payload = {}, options = {}) {
    const handlers = (subscribers.get(eventType) || []).slice().concat(wildcardSubscribers.slice());
    if (handlers.length === 0) return false;

    const meta = {
        type: eventType,
        timestamp: Date.now(),
        priority: options.priority ?? PRIORITY.NORMAL,
        sequenceNumber: sequenceNumber++,
        vectorClock: eventVectorClock.tick(),
        isReplay: !!options.skipEventLog,
        waveId: computeWaveId(eventType)
    };

    addTrace(eventType, payload, meta);
    await maybePersistEvent(eventType, payload, meta, options);

    const sorted = handlers.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.id - b.id;
    });

    let called = 0;
    for (const sub of sorted) {
        called++;
        try {
            await sub.handler(payload, meta);
        } catch (e) {
            console.error('[EventBus] Handler error:', e);
        } finally {
            if (sub.once) off(eventType === '*' ? '*' : eventType, sub.handler);
        }
    }
    return called > 0;
}

async function emitParallel(eventType, payload = {}, options = {}) {
    const handlers = (subscribers.get(eventType) || []).slice().concat(wildcardSubscribers.slice());
    if (handlers.length === 0) return false;

    const meta = {
        type: eventType,
        timestamp: Date.now(),
        priority: options.priority ?? PRIORITY.NORMAL,
        sequenceNumber: sequenceNumber++,
        vectorClock: eventVectorClock.tick(),
        isReplay: !!options.skipEventLog,
        waveId: computeWaveId(eventType)
    };

    addTrace(eventType, payload, meta);
    await maybePersistEvent(eventType, payload, meta, options);

    const sorted = handlers.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.id - b.id;
    });

    await Promise.all(sorted.map(async (sub) => {
        try {
            await sub.handler(payload, meta);
        } catch (e) {
            console.error('[EventBus] Handler error:', e);
        } finally {
            if (sub.once) off(eventType === '*' ? '*' : eventType, sub.handler);
        }
    }));

    return true;
}

function enableEventLog(enabled) {
    eventLogEnabled = !!enabled;
}

function isEventLogEnabled() {
    return eventLogEnabled;
}

function getEventWatermark() {
    return lastEventWatermark;
}

function setEventWatermark(watermark) {
    lastEventWatermark = watermark;
}

async function replayEvents(options = {}) {
    const { fromSequenceNumber = -1, count = 1000, forward = true } = options;
    eventReplayInProgress = true;
    try {
        const events = await EventLogStore.getEvents(fromSequenceNumber, count);
        events.sort((a, b) => forward ? (a.sequenceNumber - b.sequenceNumber) : (b.sequenceNumber - a.sequenceNumber));
        let replayed = 0;
        let errors = 0;
        for (const evt of events) {
            try {
                emit(evt.type, evt.payload, { skipEventLog: true, domain: evt.domain || 'global' });
                lastEventWatermark = Math.max(lastEventWatermark, evt.sequenceNumber);
                replayed++;
            } catch (e) {
                errors++;
            }
        }
        return { replayed, errors };
    } finally {
        eventReplayInProgress = false;
    }
}

async function getEventLogStats() {
    return EventLogStore.getEventLogStats();
}

async function clearEventLog() {
    await EventLogStore.clearEventLog();
}

function getHealthStatus() {
    return { status: 'ok' };
}

function startHealthMonitoring() {}
function stopHealthMonitoring() {}
function resetHandler() {}
function resetHealth() {}
function configureHealth() {}

function getHandlerCircuitState() {
    return { state: CIRCUIT_STATE.CLOSED };
}
function resetHandlerCircuit() {}
function getAllHandlerCircuitStates() {
    return new Map();
}

function _getActiveWaves() {
    return WaveTelemetry.getActiveWaves?.() || [];
}

function _clearWaves() {
    WaveTelemetry._clearWaves?.();
}

export const EventBus = {
    on,
    once,
    off,

    emit,
    emitAsync,
    emitAndAwait,
    emitParallel,

    registerSchema,
    registerSchemas,
    getSchema,
    getSchemas,

    setDebugMode,
    getTrace,
    clearTrace,
    getRegisteredEvents,
    getSubscriberCount,

    getCircuitBreakerStatus,
    configureCircuitBreaker,

    getHealthStatus,
    startHealthMonitoring,
    stopHealthMonitoring,
    resetHandler,
    resetHealth,
    configureHealth,

    getHandlerCircuitState,
    resetHandlerCircuit,
    getAllHandlerCircuitStates,
    CIRCUIT_STATE,
    HANDLER_CIRCUIT_CONFIG,

    enableEventLog,
    isEventLogEnabled,
    getEventWatermark,
    setEventWatermark,
    replayEvents,
    getEventLogStats,
    clearEventLog,
    getFailedPersistSequences: () => new Set(failedPersistSequences),
    clearFailedPersistSequences: () => failedPersistSequences.clear(),

    clearAll,
    _getActiveWaves,
    _clearWaves,

    PRIORITY,
    EVENT_SCHEMAS
};
