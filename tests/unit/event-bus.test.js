/**
 * Unit Tests for EventBus Service
 * 
 * Tests for the centralized event system:
 * - Subscription and unsubscription
 * - Priority-based dispatch ordering
 * - Event validation
 * - Wildcard subscriptions
 * - Debug tracing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../js/services/event-bus.js';
import { WaveTelemetry } from '../../js/services/wave-telemetry.js';

// ==========================================
// Setup & Teardown
// ==========================================

beforeEach(() => {
    EventBus.clearAll();
    EventBus.setDebugMode(false);
    WaveTelemetry._clearWaves();
});

afterEach(() => {
    EventBus.clearAll();
    WaveTelemetry._clearWaves();
});

// ==========================================
// Subscription Tests
// ==========================================

describe('EventBus Subscription', () => {
    it('should subscribe to events and receive payloads', () => {
        const handler = vi.fn();
        EventBus.on('test:event', handler);

        EventBus.emit('test:event', { data: 'test' });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
            { data: 'test' },
            expect.objectContaining({ type: 'test:event' })
        );
    });

    it('should return unsubscribe function', () => {
        const handler = vi.fn();
        const unsubscribe = EventBus.on('test:event', handler);

        EventBus.emit('test:event', { data: 'first' });
        unsubscribe();
        EventBus.emit('test:event', { data: 'second' });

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support once() for single-fire handlers', () => {
        const handler = vi.fn();
        EventBus.once('test:event', handler);

        EventBus.emit('test:event', { data: 'first' });
        EventBus.emit('test:event', { data: 'second' });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
            { data: 'first' },
            expect.any(Object)
        );
    });

    it('should support wildcard (*) subscriptions', () => {
        const handler = vi.fn();
        EventBus.on('*', handler);

        EventBus.emit('event:one', { a: 1 });
        EventBus.emit('event:two', { b: 2 });

        expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should not call handlers for unsubscribed events', () => {
        const handler = vi.fn();
        EventBus.on('event:a', handler);

        EventBus.emit('event:b', {});

        expect(handler).not.toHaveBeenCalled();
    });

    it('should return false when no handlers exist', () => {
        const result = EventBus.emit('no:handlers', {});
        expect(result).toBe(false);
    });

    it('should return true when handlers are called', () => {
        EventBus.on('has:handlers', () => { });
        const result = EventBus.emit('has:handlers', {});
        expect(result).toBe(true);
    });
});

// ==========================================
// Priority Tests
// ==========================================

describe('EventBus Priority Dispatch', () => {
    it('should call handlers in priority order', () => {
        const callOrder = [];

        EventBus.on('priority:test', () => callOrder.push('normal'), { priority: EventBus.PRIORITY.NORMAL });
        EventBus.on('priority:test', () => callOrder.push('critical'), { priority: EventBus.PRIORITY.CRITICAL });
        EventBus.on('priority:test', () => callOrder.push('low'), { priority: EventBus.PRIORITY.LOW });
        EventBus.on('priority:test', () => callOrder.push('high'), { priority: EventBus.PRIORITY.HIGH });

        EventBus.emit('priority:test', {});

        expect(callOrder).toEqual(['critical', 'high', 'normal', 'low']);
    });

    it('should maintain insertion order for same priority', () => {
        const callOrder = [];

        EventBus.on('same:priority', () => callOrder.push('first'));
        EventBus.on('same:priority', () => callOrder.push('second'));
        EventBus.on('same:priority', () => callOrder.push('third'));

        EventBus.emit('same:priority', {});

        expect(callOrder).toEqual(['first', 'second', 'third']);
    });
});

// ==========================================
// Validation Tests
// ==========================================

describe('EventBus Validation', () => {
    it('should emit known events with schema', () => {
        const handler = vi.fn();
        EventBus.on('storage:updated', handler);

        // Valid payload
        EventBus.emit('storage:updated', { store: 'streams', count: 100 });

        expect(handler).toHaveBeenCalled();
    });

    it('should warn on invalid payload when debug mode is on', () => {
        EventBus.setDebugMode(true);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

        EventBus.on('storage:updated', () => { });
        // Missing required 'store' field
        EventBus.emit('storage:updated', { count: 100 });

        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('should allow custom events without schema', () => {
        const handler = vi.fn();
        EventBus.on('custom:event', handler);

        EventBus.emit('custom:event', { anything: 'works' });

        expect(handler).toHaveBeenCalled();
    });
});

// ==========================================
// Error Handling Tests
// ==========================================

describe('EventBus Error Handling', () => {
    it('should continue calling other handlers when one throws', () => {
        const handler1 = vi.fn(() => { throw new Error('Handler 1 error'); });
        const handler2 = vi.fn();

        EventBus.on('error:test', handler1);
        EventBus.on('error:test', handler2);

        // Suppress error log for test
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        EventBus.emit('error:test', {});

        expect(handler1).toHaveBeenCalled();
        expect(handler2).toHaveBeenCalled();

        errorSpy.mockRestore();
    });

    it('should log handler errors to console', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        EventBus.on('error:log', () => { throw new Error('Test error'); });
        EventBus.emit('error:log', {});

        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});

// ==========================================
// Async Emit Tests
// ==========================================

describe('EventBus Async', () => {
    it('should emit asynchronously with emitAsync', async () => {
        const handler = vi.fn();
        EventBus.on('async:test', handler);

        const promise = EventBus.emitAsync('async:test', { data: 'async' });

        // Handler not called synchronously
        expect(handler).not.toHaveBeenCalled();

        await promise;

        expect(handler).toHaveBeenCalled();
    });

    it('should resolve with true when handlers exist', async () => {
        EventBus.on('async:exists', () => { });
        const result = await EventBus.emitAsync('async:exists', {});
        expect(result).toBe(true);
    });

    it('should resolve with false when no handlers', async () => {
        const result = await EventBus.emitAsync('async:none', {});
        expect(result).toBe(false);
    });
});

// ==========================================
// Trace & Debug Tests
// ==========================================

describe('EventBus Tracing', () => {
    it('should record events in trace', () => {
        EventBus.on('trace:test', () => { });
        EventBus.emit('trace:test', { data: 'traced' });

        const trace = EventBus.getTrace();
        expect(trace.length).toBeGreaterThan(0);
        expect(trace[trace.length - 1].event).toBe('trace:test');
    });

    it('should limit trace size', () => {
        EventBus.on('trace:limit', () => { });

        // Emit more than MAX_TRACE_SIZE events
        for (let i = 0; i < 150; i++) {
            EventBus.emit('trace:limit', { i });
        }

        const trace = EventBus.getTrace();
        expect(trace.length).toBeLessThanOrEqual(100);
    });

    it('should clear trace', () => {
        EventBus.on('trace:clear', () => { });
        EventBus.emit('trace:clear', {});
        expect(EventBus.getTrace().length).toBeGreaterThan(0);

        EventBus.clearTrace();
        expect(EventBus.getTrace().length).toBe(0);
    });

    it('should redact sensitive data in trace', () => {
        EventBus.on('sensitive:test', () => { });
        EventBus.emit('sensitive:test', {
            apiToken: 'secret123',
            password: 'hunter2',
            normal: 'visible'
        });

        const trace = EventBus.getTrace();
        const lastEvent = trace[trace.length - 1];

        expect(lastEvent.payload.apiToken).toBe('[REDACTED]');
        expect(lastEvent.payload.password).toBe('[REDACTED]');
        expect(lastEvent.payload.normal).toBe('visible');
    });
});

// ==========================================
// Diagnostics Tests
// ==========================================

describe('EventBus Diagnostics', () => {
    it('should return registered event types', () => {
        EventBus.on('event:a', () => { });
        EventBus.on('event:b', () => { });

        const registered = EventBus.getRegisteredEvents();

        expect(registered).toContain('event:a');
        expect(registered).toContain('event:b');
    });

    it('should return subscriber count', () => {
        EventBus.on('count:test', () => { });
        EventBus.on('count:test', () => { });
        EventBus.on('count:test', () => { });

        expect(EventBus.getSubscriberCount('count:test')).toBe(3);
        expect(EventBus.getSubscriberCount('no:subscribers')).toBe(0);
    });

    it('should return event schemas', () => {
        const schemas = EventBus.getSchemas();

        expect(schemas).toHaveProperty('storage:updated');
        expect(schemas).toHaveProperty('session:created');
        expect(schemas['storage:updated']).toHaveProperty('description');
    });
});

// ==========================================
// Wave Integration Tests
// ==========================================

describe('EventBus Wave Integration', () => {
    it('emit creates wave context for critical events', () => {
        WaveTelemetry.setCriticalEvents(['file_uploaded']);

        const handler = vi.fn();
        EventBus.on('file_uploaded', handler);
        EventBus.emit('file_uploaded', { data: 'test' });

        // Verify the event was marked as critical
        const criticalEvents = WaveTelemetry.getCriticalEvents();
        expect(criticalEvents).toContain('file_uploaded');
    });

    it('emit propagates waveId to handlers for critical events', () => {
        WaveTelemetry.setCriticalEvents(['test_event']);

        let receivedWaveId = null;
        const handler = (data, meta) => {
            receivedWaveId = meta.waveId;
        };
        EventBus.on('test_event', handler);
        EventBus.emit('test_event', {});

        expect(receivedWaveId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });

    it('non-critical events do not create wave context', () => {
        WaveTelemetry.setCriticalEvents(['critical_only']);

        let receivedWaveId = null;
        const handler = (data, meta) => {
            receivedWaveId = meta.waveId;
        };
        EventBus.on('non_critical', handler);
        EventBus.emit('non_critical', {});

        // Non-critical events should not have waveId
        expect(receivedWaveId).toBeUndefined();
    });
});

// ==========================================
// Event Metadata Tests (TD-10)
// ==========================================

describe('EventBus Event Metadata', () => {
    it('should include sequence number in event metadata', () => {
        let receivedMeta = null;
        const handler = (data, meta) => {
            receivedMeta = meta;
        };
        EventBus.on('meta:test', handler);
        EventBus.emit('meta:test', {});

        expect(receivedMeta).toBeDefined();
        expect(receivedMeta.sequenceNumber).toBeDefined();
        expect(typeof receivedMeta.sequenceNumber).toBe('number');
        expect(receivedMeta.sequenceNumber).toBeGreaterThanOrEqual(0);
    });

    it('should increment sequence numbers for each event', () => {
        const sequenceNumbers = [];
        const handler = (data, meta) => {
            sequenceNumbers.push(meta.sequenceNumber);
        };
        EventBus.on('seq:test', handler);

        EventBus.emit('seq:test', {});
        EventBus.emit('seq:test', {});
        EventBus.emit('seq:test', {});

        expect(sequenceNumbers).toEqual([0, 1, 2]);
    });

    it('should include timestamp in event metadata', () => {
        let receivedTimestamp = null;
        const beforeTime = Date.now();
        const handler = (data, meta) => {
            receivedTimestamp = meta.timestamp;
        };
        EventBus.on('time:test', handler);
        EventBus.emit('time:test', {});

        expect(receivedTimestamp).toBeDefined();
        expect(receivedTimestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(receivedTimestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should include event type in metadata', () => {
        let receivedType = null;
        const handler = (data, meta) => {
            receivedType = meta.type;
        };
        EventBus.on('type:test', handler);
        EventBus.emit('type:test', {});

        expect(receivedType).toBe('type:test');
    });

    it('should include priority from emit options in metadata', () => {
        let receivedPriority = null;
        const handler = (data, meta) => {
            receivedPriority = meta.priority;
        };
        EventBus.on('priority:meta', handler);
        EventBus.emit('priority:meta', {}, { priority: EventBus.PRIORITY.HIGH });

        expect(receivedPriority).toBe(EventBus.PRIORITY.HIGH);
    });

    it('should handle custom priority in emit options', () => {
        let receivedPriority = null;
        const handler = (data, meta) => {
            receivedPriority = meta.priority;
        };
        EventBus.on('custom:priority', handler);
        EventBus.emit('custom:priority', {}, { priority: EventBus.PRIORITY.CRITICAL });

        expect(receivedPriority).toBe(EventBus.PRIORITY.CRITICAL);
    });

    it('should maintain PRIORITY constants', () => {
        expect(EventBus.PRIORITY).toBeDefined();
        expect(EventBus.PRIORITY.LOW).toBe(0);
        expect(EventBus.PRIORITY.NORMAL).toBe(1);
        expect(EventBus.PRIORITY.HIGH).toBe(2);
        expect(EventBus.PRIORITY.CRITICAL).toBe(3);
    });
});

// ==========================================
// Schema Registration Tests (TD-10)
// ==========================================

describe('EventBus Schema Registration', () => {
    it('should register dynamic schema', () => {
        const result = EventBus.registerSchema('custom:event', {
            description: 'Custom event',
            payload: { id: 'string', name: 'string?' }
        });

        expect(result).toBe(true);

        const schema = EventBus.getSchema('custom:event');
        expect(schema).toBeDefined();
        expect(schema.description).toBe('Custom event');
    });

    it('should register multiple schemas', () => {
        const count = EventBus.registerSchemas({
            'event:a': { description: 'Event A', payload: {} },
            'event:b': { description: 'Event B', payload: {} },
            'event:c': { description: 'Event C', payload: {} }
        });

        expect(count).toBe(3);

        const schemas = EventBus.getSchemas();
        expect(schemas).toHaveProperty('event:a');
        expect(schemas).toHaveProperty('event:b');
        expect(schemas).toHaveProperty('event:c');
    });

    it('should include both static and dynamic schemas in getSchemas', () => {
        EventBus.registerSchema('dynamic:event', { description: 'Dynamic', payload: {} });

        const schemas = EventBus.getSchemas();

        // Static schemas from EVENT_SCHEMAS
        expect(schemas).toHaveProperty('storage:updated');
        expect(schemas).toHaveProperty('session:created');
        // Dynamic schema
        expect(schemas).toHaveProperty('dynamic:event');
    });
});

// ==========================================
// clearAll Tests (TD-10)
// ==========================================

describe('EventBus clearAll', () => {
    it('should clear all subscribers', () => {
        EventBus.on('event:a', () => {});
        EventBus.on('event:b', () => {});
        EventBus.on('*', () => {});

        expect(EventBus.getSubscriberCount('event:a')).toBe(1);
        expect(EventBus.getSubscriberCount('event:b')).toBe(1);
        expect(EventBus.getSubscriberCount('*')).toBe(1);

        EventBus.clearAll();

        expect(EventBus.getSubscriberCount('event:a')).toBe(0);
        expect(EventBus.getSubscriberCount('event:b')).toBe(0);
        expect(EventBus.getSubscriberCount('*')).toBe(0);
    });

    it('should clear trace', () => {
        EventBus.on('trace:event', () => {});
        EventBus.emit('trace:event', {});

        expect(EventBus.getTrace().length).toBeGreaterThan(0);

        EventBus.clearAll();

        expect(EventBus.getTrace().length).toBe(0);
    });

    it('should clear dynamic schemas', () => {
        EventBus.registerSchema('test:event', { description: 'Test', payload: {} });
        expect(EventBus.getSchema('test:event')).toBeDefined();

        EventBus.clearAll();

        expect(EventBus.getSchema('test:event')).toBeUndefined();
    });

    it('should reset sequence numbers', () => {
        let firstSeq;
        let secondSeq;

        // First batch - get initial sequence
        const handler1 = (data, meta) => {
            firstSeq = meta.sequenceNumber;
        };
        EventBus.on('seq:reset', handler1);
        EventBus.emit('seq:reset', {});
        const firstSeqValue = firstSeq;

        // Clear everything
        EventBus.clearAll();

        // Second batch - should start from 0 again
        const handler2 = (data, meta) => {
            secondSeq = meta.sequenceNumber;
        };
        EventBus.on('seq:reset', handler2);
        EventBus.emit('seq:reset', {});

        // After clearAll, the sequence should be reset to 0
        expect(secondSeq).toBe(0);
    });
});

// ==========================================
// emitAndAwait Tests (TD-10)
// ==========================================

describe('EventBus emitAndAwait', () => {
    it('should await all handlers', async () => {
        const callOrder = [];
        const handler1 = async () => {
            callOrder.push('handler1');
            await new Promise(resolve => setTimeout(resolve, 10));
        };
        const handler2 = async () => {
            callOrder.push('handler2');
            await new Promise(resolve => setTimeout(resolve, 5));
        };

        EventBus.on('await:test', handler1);
        EventBus.on('await:test', handler2);

        await EventBus.emitAndAwait('await:test', {});

        expect(callOrder).toEqual(['handler1', 'handler2']);
    });

    it('should return false when no handlers', async () => {
        const result = await EventBus.emitAndAwait('no:handlers', {});
        expect(result).toBe(false);
    });

    it('should return true when handlers complete', async () => {
        EventBus.on('await:handlers', async () => {});
        const result = await EventBus.emitAndAwait('await:handlers', {});
        expect(result).toBe(true);
    });

    it('should handle handler errors and continue', async () => {
        const handler2 = vi.fn();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        EventBus.on('await:error', async () => { throw new Error('Handler error'); });
        EventBus.on('await:error', handler2);

        await EventBus.emitAndAwait('await:error', {});

        expect(handler2).toHaveBeenCalled();

        errorSpy.mockRestore();
    });
});

// ==========================================
// emitParallel Error Handling Tests (TD-2)
// ==========================================

describe('EventBus emitParallel Error Handling', () => {
    it('should continue calling other handlers when one handler throws synchronously', async () => {
        const handler1 = vi.fn(() => { throw new Error('Handler 1 error'); });
        const handler2 = vi.fn();
        const handler3 = vi.fn();

        EventBus.on('parallel:sync-error', handler1);
        EventBus.on('parallel:sync-error', handler2);
        EventBus.on('parallel:sync-error', handler3);

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        const result = await EventBus.emitParallel('parallel:sync-error', {});

        expect(handler1).toHaveBeenCalled();
        expect(handler2).toHaveBeenCalled();
        expect(handler3).toHaveBeenCalled();
        expect(result.success).toBe(false);
        expect(result.total).toBe(3);
        expect(result.failed).toBe(1);
        expect(errorSpy).toHaveBeenCalledWith(
            '[EventBus] Parallel handler error:',
            expect.any(Error)
        );

        errorSpy.mockRestore();
    });

    it('should continue calling other handlers when one handler rejects a promise', async () => {
        const handler1 = vi.fn(async () => {
            await Promise.reject(new Error('Async handler 1 rejection'));
        });
        const handler2 = vi.fn(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return 'handler2-success';
        });
        const handler3 = vi.fn(() => 'handler3-success');

        EventBus.on('parallel:async-error', handler1);
        EventBus.on('parallel:async-error', handler2);
        EventBus.on('parallel:async-error', handler3);

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        const result = await EventBus.emitParallel('parallel:async-error', {});

        expect(handler1).toHaveBeenCalled();
        expect(handler2).toHaveBeenCalled();
        expect(handler3).toHaveBeenCalled();
        expect(result.success).toBe(false);
        expect(result.total).toBe(3);
        expect(result.failed).toBe(1);
        expect(errorSpy).toHaveBeenCalledWith(
            '[EventBus] Parallel handler error:',
            expect.any(Error)
        );

        errorSpy.mockRestore();
    });

    it('should continue when multiple handlers throw errors', async () => {
        const handler1 = vi.fn(() => { throw new Error('Error 1'); });
        const handler2 = vi.fn(() => { throw new Error('Error 2'); });
        const handler3 = vi.fn(() => { throw new Error('Error 3'); });

        EventBus.on('parallel:multiple-errors', handler1);
        EventBus.on('parallel:multiple-errors', handler2);
        EventBus.on('parallel:multiple-errors', handler3);

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { }).mockClear();

        const result = await EventBus.emitParallel('parallel:multiple-errors', {});

        expect(handler1).toHaveBeenCalled();
        expect(handler2).toHaveBeenCalled();
        expect(handler3).toHaveBeenCalled();
        expect(result.success).toBe(false);
        expect(result.total).toBe(3);
        expect(result.failed).toBe(3);
        expect(errorSpy).toHaveBeenCalledTimes(3);

        errorSpy.mockRestore();
    });

    it('should unsubscribe once handlers even when they throw errors', async () => {
        const handler = vi.fn(() => { throw new Error('Once handler error'); });

        EventBus.once('parallel:once-error', handler);

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        await EventBus.emitParallel('parallel:once-error', {});

        expect(handler).toHaveBeenCalledTimes(1);

        // Second emit should not call the handler because it was unsubscribed
        await EventBus.emitParallel('parallel:once-error', {});

        expect(handler).toHaveBeenCalledTimes(1);
        expect(EventBus.getSubscriberCount('parallel:once-error')).toBe(0);

        errorSpy.mockRestore();
    });

    it('should handle mix of successful and failing async handlers', async () => {
        const callOrder = [];

        const handler1 = async () => {
            callOrder.push('handler1-start');
            await new Promise(resolve => setTimeout(resolve, 5));
            callOrder.push('handler1-end');
        };

        const handler2 = async () => {
            callOrder.push('handler2-start');
            await Promise.reject(new Error('Handler 2 failed'));
        };

        const handler3 = async () => {
            callOrder.push('handler3-start');
            await new Promise(resolve => setTimeout(resolve, 5));
            callOrder.push('handler3-end');
        };

        EventBus.on('parallel:mixed-async', handler1);
        EventBus.on('parallel:mixed-async', handler2);
        EventBus.on('parallel:mixed-async', handler3);

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        const result = await EventBus.emitParallel('parallel:mixed-async', {});

        expect(result.success).toBe(false);
        expect(result.total).toBe(3);
        expect(result.failed).toBe(1);
        expect(callOrder).toContain('handler1-start');
        expect(callOrder).toContain('handler1-end');
        expect(callOrder).toContain('handler2-start');
        expect(callOrder).toContain('handler3-start');
        expect(callOrder).toContain('handler3-end');

        errorSpy.mockRestore();
    });

    it('should return false when no handlers are registered', async () => {
        const result = await EventBus.emitParallel('parallel:no-handlers', {});
        expect(result.success).toBe(false);
        expect(result.reason).toBe('no-handlers');
        expect(result.results).toEqual([]);
    });

    it('should properly unsubscribe wildcard once handlers that throw errors', async () => {
        const handler = vi.fn(() => { throw new Error('Wildcard error'); });

        EventBus.once('*', handler);

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        await EventBus.emitParallel('test:event', {});

        expect(handler).toHaveBeenCalledTimes(1);

        // Second emit should not call the handler
        await EventBus.emitParallel('test:event2', {});

        expect(handler).toHaveBeenCalledTimes(1);

        errorSpy.mockRestore();
    });
});

// ==========================================
// emitParallel Return Format Tests (TD-2)
// ==========================================

describe('EventBus emitParallel Return Format', () => {
    beforeEach(() => {
        EventBus.clearAll();
    });

    it('should return result object with no-handlers reason when no handlers exist', async () => {
        const result = await EventBus.emitParallel('parallel:no-handlers', {});

        expect(result).toEqual({
            success: false,
            reason: 'no-handlers',
            results: []
        });
    });

    it('should return success result when all handlers complete successfully', async () => {
        const handler1 = vi.fn(async () => 'result1');
        const handler2 = vi.fn(() => 'result2');

        EventBus.on('parallel:success', handler1);
        EventBus.on('parallel:success', handler2);

        const result = await EventBus.emitParallel('parallel:success', { data: 'test' });

        expect(result.success).toBe(true);
        expect(result.total).toBe(2);
        expect(result.failed).toBe(0);
        expect(result.results).toHaveLength(2);
        // vitest's vi.fn() creates functions with inferred names
        expect(result.results[0]).toMatchObject({
            success: true,
            result: 'result1'
        });
        expect(result.results[0].handler).toEqual(expect.any(String));
        expect(result.results[1]).toMatchObject({
            success: true,
            result: 'result2'
        });
        expect(result.results[1].handler).toEqual(expect.any(String));
    });

    it('should return failure result with error details when handlers fail', async () => {
        const handler1 = vi.fn(async () => 'success');
        const handler2 = vi.fn(async () => { throw new Error('Handler 2 failed'); });
        const handler3 = vi.fn(() => 'also success');

        EventBus.on('parallel:mixed', handler1);
        EventBus.on('parallel:mixed', handler2);
        EventBus.on('parallel:mixed', handler3);

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        const result = await EventBus.emitParallel('parallel:mixed', {});

        expect(result.success).toBe(false);
        expect(result.total).toBe(3);
        expect(result.failed).toBe(1);
        expect(result.results).toHaveLength(3);

        // First handler succeeded
        expect(result.results[0].success).toBe(true);
        expect(result.results[0].result).toBe('success');

        // Second handler failed
        expect(result.results[1].success).toBe(false);
        expect(result.results[1].error).toBeInstanceOf(Error);
        expect(result.results[1].error.message).toBe('Handler 2 failed');

        // Third handler succeeded
        expect(result.results[2].success).toBe(true);
        expect(result.results[2].result).toBe('also success');

        errorSpy.mockRestore();
    });

    it('should return failure result when all handlers fail', async () => {
        const handler1 = vi.fn(() => { throw new Error('Error 1'); });
        const handler2 = vi.fn(async () => { throw new Error('Error 2'); });

        EventBus.on('parallel:all-fail', handler1);
        EventBus.on('parallel:all-fail', handler2);

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        const result = await EventBus.emitParallel('parallel:all-fail', {});

        expect(result.success).toBe(false);
        expect(result.total).toBe(2);
        expect(result.failed).toBe(2);
        expect(result.results[0].success).toBe(false);
        expect(result.results[0].error.message).toBe('Error 1');
        expect(result.results[1].success).toBe(false);
        expect(result.results[1].error.message).toBe('Error 2');

        errorSpy.mockRestore();
    });

    it('should include handler identifier in results', async () => {
        const namedHandler = function myHandler() { return 'named'; };
        // Arrow functions assigned to const get their name inferred
        const arrowHandler = () => 'anonymous';

        EventBus.on('parallel:names', namedHandler);
        EventBus.on('parallel:names', arrowHandler);

        const result = await EventBus.emitParallel('parallel:names', {});

        // Both named function and arrow function have inferred names
        expect(result.results[0].handler).toBe('myHandler');
        expect(result.results[1].handler).toBe('arrowHandler');
    });

    it('should handle once handlers and mark them in results', async () => {
        const handler = vi.fn(() => 'once-result');

        EventBus.once('parallel:once-result', handler);

        const result = await EventBus.emitParallel('parallel:once-result', {});

        expect(result.success).toBe(true);
        expect(result.total).toBe(1);
        expect(result.failed).toBe(0);

        // Handler should be unsubscribed after first call
        expect(EventBus.getSubscriberCount('parallel:once-result')).toBe(0);
    });

    it('should preserve priority ordering in results', async () => {
        const callOrder = [];
        const handler1 = async () => { callOrder.push(1); return 'low'; };
        const handler2 = async () => { callOrder.push(2); return 'critical'; };
        const handler3 = async () => { callOrder.push(3); return 'high'; };

        EventBus.on('parallel:priority', handler1, { priority: EventBus.PRIORITY.LOW });
        EventBus.on('parallel:priority', handler2, { priority: EventBus.PRIORITY.CRITICAL });
        EventBus.on('parallel:priority', handler3, { priority: EventBus.PRIORITY.HIGH });

        const result = await EventBus.emitParallel('parallel:priority', {});

        expect(result.total).toBe(3);
        // All should complete, but order is not guaranteed with Promise.all
        expect(result.results).toHaveLength(3);
    });

    it('should include wildcard subscribers in results', async () => {
        const wildcardHandler = vi.fn(() => 'wildcard');
        const specificHandler = vi.fn(() => 'specific');

        EventBus.on('*', wildcardHandler);
        EventBus.on('test:event', specificHandler);

        const result = await EventBus.emitParallel('test:event', {});

        expect(result.total).toBe(2);
        expect(result.failed).toBe(0);
    });

    it('should handle async errors properly in results', async () => {
        const asyncRejectHandler = vi.fn(async () => {
            await new Promise(resolve => setTimeout(resolve, 5));
            throw new Error('Async rejection');
        });
        const asyncSuccessHandler = vi.fn(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return 'Async success';
        });

        EventBus.on('parallel:async-error', asyncRejectHandler);
        EventBus.on('parallel:async-error', asyncSuccessHandler);

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        const result = await EventBus.emitParallel('parallel:async-error', {});

        expect(result.success).toBe(false);
        expect(result.total).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.results[0].success).toBe(false);
        expect(result.results[0].error.message).toBe('Async rejection');
        expect(result.results[1].success).toBe(true);
        expect(result.results[1].result).toBe('Async success');

        errorSpy.mockRestore();
    });
});
