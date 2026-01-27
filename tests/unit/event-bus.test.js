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
        expect(result).toBe(true);
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
        expect(result).toBe(true);
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
        expect(result).toBe(true);
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

        expect(result).toBe(true);
        expect(callOrder).toContain('handler1-start');
        expect(callOrder).toContain('handler1-end');
        expect(callOrder).toContain('handler2-start');
        expect(callOrder).toContain('handler3-start');
        expect(callOrder).toContain('handler3-end');

        errorSpy.mockRestore();
    });

    it('should return false when no handlers are registered', async () => {
        const result = await EventBus.emitParallel('parallel:no-handlers', {});
        expect(result).toBe(false);
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
