/**
 * Unit Tests for HNW Advanced Improvements
 *
 * Tests for:
 * - Lamport Clock
 * - Cascading Abort Controller
 * - EventBus Circuit Breaker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LamportClock } from '../../js/services/lamport-clock.js';
import {
  CascadingAbort,
  CascadingAbortError,
} from '../../js/services/cascading-abort-controller.js';
import { EventBus } from '../../js/services/event-bus.js';

// ==========================================
// Lamport Clock Tests
// ==========================================

describe('LamportClock', () => {
  beforeEach(() => {
    LamportClock.reset();
  });

  describe('tick', () => {
    it('should increment counter on each tick', () => {
      LamportClock.init();
      expect(LamportClock.tick()).toBe(1);
      expect(LamportClock.tick()).toBe(2);
      expect(LamportClock.tick()).toBe(3);
    });
  });

  describe('update', () => {
    it('should update to max(local, received) + 1', () => {
      LamportClock.init();
      LamportClock.tick(); // counter = 1

      // Received timestamp higher than local
      const result = LamportClock.update(10);
      expect(result).toBe(11);
      expect(LamportClock.current()).toBe(11);
    });

    it('should increment past local when received is lower', () => {
      LamportClock.init();
      for (let i = 0; i < 10; i++) LamportClock.tick(); // counter = 10

      // Received timestamp lower than local
      const result = LamportClock.update(5);
      expect(result).toBe(11); // max(10, 5) + 1
    });
  });

  describe('compare', () => {
    it('should compare by timestamp first', () => {
      const a = { lamportTimestamp: 5, senderId: 'bbb' };
      const b = { lamportTimestamp: 10, senderId: 'aaa' };
      expect(LamportClock.compare(a, b)).toBeLessThan(0);
    });

    it('should use senderId as tie-breaker', () => {
      const a = { lamportTimestamp: 5, senderId: 'aaa' };
      const b = { lamportTimestamp: 5, senderId: 'bbb' };
      expect(LamportClock.compare(a, b)).toBeLessThan(0);
    });
  });

  describe('happenedBefore', () => {
    it('should return true when a < b', () => {
      const a = { lamportTimestamp: 5, senderId: 'aaa' };
      const b = { lamportTimestamp: 10, senderId: 'bbb' };
      expect(LamportClock.happenedBefore(a, b)).toBe(true);
      expect(LamportClock.happenedBefore(b, a)).toBe(false);
    });
  });

  describe('stamp', () => {
    it('should add timestamp and senderId to message', () => {
      LamportClock.init('test-tab');
      LamportClock.tick();

      const stamped = LamportClock.stamp({ type: 'TEST', data: 'hello' });
      expect(stamped.type).toBe('TEST');
      expect(stamped.data).toBe('hello');
      expect(stamped.lamportTimestamp).toBe(2);
      expect(stamped.senderId).toBe('test-tab');
    });
  });
});

// ==========================================
// Cascading Abort Controller Tests
// ==========================================

describe('CascadingAbort', () => {
  beforeEach(() => {
    CascadingAbort.abortAll();
  });

  describe('create', () => {
    it('should create a new controller', () => {
      const controller = CascadingAbort.create('test_operation');
      expect(controller).toBeDefined();
      expect(controller.operation).toBe('test_operation');
      expect(controller.aborted).toBe(false);
    });

    it('should replace existing controller with same name', () => {
      const first = CascadingAbort.create('duplicate');
      const second = CascadingAbort.create('duplicate');

      expect(first.aborted).toBe(true);
      expect(first.abortReason).toBe('Replaced by new operation');
      expect(second.aborted).toBe(false);
    });
  });

  describe('child', () => {
    it('should create child controller linked to parent', () => {
      const parent = CascadingAbort.create('parent');
      const child = parent.child('child_op');

      expect(child.operation).toBe('child_op');
      expect(child.parent).toBe(parent);
      expect(child.aborted).toBe(false);
    });

    it('should throw when creating child of aborted controller', () => {
      const parent = CascadingAbort.create('parent');
      parent.abort('Cancelled');

      expect(() => parent.child('child')).toThrow(CascadingAbortError);
    });
  });

  describe('parent abort propagation', () => {
    it('should abort children when parent aborts', () => {
      const parent = CascadingAbort.create('parent');
      const child1 = parent.child('child1');
      const child2 = parent.child('child2');
      const grandchild = child1.child('grandchild');

      parent.abort('User cancelled');

      expect(parent.aborted).toBe(true);
      expect(child1.aborted).toBe(true);
      expect(child2.aborted).toBe(true);
      expect(grandchild.aborted).toBe(true);
    });

    it('should not affect parent when child aborts', () => {
      const parent = CascadingAbort.create('parent');
      const child = parent.child('child');

      child.abort('Child-only');

      expect(child.aborted).toBe(true);
      expect(parent.aborted).toBe(false);
    });
  });

  describe('cleanup handlers', () => {
    it('should run cleanup handlers on abort', () => {
      const parent = CascadingAbort.create('parent');
      const cleanupFn = vi.fn();

      parent.onCleanup(cleanupFn);
      parent.abort('Test abort');

      expect(cleanupFn).toHaveBeenCalledWith('Test abort');
    });

    it('should allow removing cleanup handlers', () => {
      const parent = CascadingAbort.create('parent');
      const cleanupFn = vi.fn();

      const remove = parent.onCleanup(cleanupFn);
      remove();
      parent.abort('Test abort');

      expect(cleanupFn).not.toHaveBeenCalled();
    });
  });

  describe('setTimeout', () => {
    it('should auto-abort after timeout', async () => {
      const controller = CascadingAbort.create('timeout_test');
      controller.setTimeout(50, 'Timeout reached');

      expect(controller.aborted).toBe(false);

      await new Promise(r => setTimeout(r, 100));

      expect(controller.aborted).toBe(true);
      expect(controller.abortReason).toBe('Timeout reached');
    });

    it('should allow cancelling timeout', async () => {
      const controller = CascadingAbort.create('cancel_test');
      const cancel = controller.setTimeout(50);

      cancel(); // Cancel the timeout

      await new Promise(r => setTimeout(r, 100));

      expect(controller.aborted).toBe(false);
    });
  });
});

// ==========================================
// EventBus Health Status Tests (TD-10)
// ==========================================

describe('EventBus Health Status', () => {
  beforeEach(() => {
    EventBus.clearAll();
    EventBus.setDebugMode(false);
  });

  describe('getHealthStatus', () => {
    it('should return ok status', () => {
      const status = EventBus.getHealthStatus();
      expect(status).toHaveProperty('status');
      expect(status.status).toBe('ok');
    });
  });

  describe('core event functionality', () => {
    it('should publish and subscribe to events', () => {
      const handler = vi.fn();
      EventBus.on('test:event', handler);
      EventBus.emit('test:event', { data: 'test' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        { data: 'test' },
        expect.objectContaining({ type: 'test:event' })
      );
    });

    it('should respect priority dispatch order', () => {
      const callOrder = [];

      EventBus.on('priority:test', () => callOrder.push('normal'), {
        priority: EventBus.PRIORITY.NORMAL,
      });
      EventBus.on('priority:test', () => callOrder.push('critical'), {
        priority: EventBus.PRIORITY.CRITICAL,
      });
      EventBus.on('priority:test', () => callOrder.push('low'), {
        priority: EventBus.PRIORITY.LOW,
      });

      EventBus.emit('priority:test', {});

      expect(callOrder).toEqual(['critical', 'normal', 'low']);
    });

    it('should support wildcard subscriptions', () => {
      const handler = vi.fn();
      EventBus.on('*', handler);

      EventBus.emit('event:one', { a: 1 });
      EventBus.emit('event:two', { b: 2 });

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});
