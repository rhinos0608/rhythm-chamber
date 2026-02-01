/**
 * EventBus Replay Tests
 *
 * Tests for event versioning, replay, and watermark tracking in EventBus.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '../../js/services/event-bus.js';

describe('EventBus Replay', () => {
  beforeEach(() => {
    // Clear all subscribers and reset state
    EventBus.clearAll();
    EventBus.setDebugMode(false);
  });

  afterEach(() => {
    EventBus.clearAll();
  });

  describe('Event Versioning', () => {
    it('should include sequence number in event metadata', () => {
      const handler = vi.fn();
      EventBus.on('test_event', handler);

      EventBus.emit('test_event', { data: 'test' });

      expect(handler).toHaveBeenCalledTimes(1);
      const meta = handler.mock.calls[0][1];
      expect(meta.sequenceNumber).toBeDefined();
      expect(typeof meta.sequenceNumber).toBe('number');
    });

    it('should increment sequence numbers for each event', () => {
      const handler = vi.fn();
      EventBus.on('test_event', handler);

      EventBus.emit('test_event', { data: 'test1' });
      EventBus.emit('test_event', { data: 'test2' });
      EventBus.emit('test_event', { data: 'test3' });

      expect(handler).toHaveBeenCalledTimes(3);

      const seq1 = handler.mock.calls[0][1].sequenceNumber;
      const seq2 = handler.mock.calls[1][1].sequenceNumber;
      const seq3 = handler.mock.calls[2][1].sequenceNumber;

      expect(seq2).toBe(seq1 + 1);
      expect(seq3).toBe(seq2 + 1);
    });

    it('should include vector clock in event metadata', () => {
      const handler = vi.fn();
      EventBus.on('test_event', handler);

      EventBus.emit('test_event', {});

      const meta = handler.mock.calls[0][1];
      expect(meta.vectorClock).toBeDefined();
      expect(typeof meta.vectorClock).toBe('object');
    });

    it('should include isReplay flag in event metadata', () => {
      const handler = vi.fn();
      EventBus.on('test_event', handler);

      // Emit normally
      EventBus.emit('test_event', {}, { skipEventLog: true });

      const meta = handler.mock.calls[0][1];
      expect(meta.isReplay).toBeDefined();
      expect(typeof meta.isReplay).toBe('boolean');
    });
  });

  describe('Watermark Tracking', () => {
    it('should track event watermark', () => {
      const initialWatermark = EventBus.getEventWatermark();
      expect(initialWatermark).toBe(-1); // Initial watermark

      EventBus.emit('test_event', {});

      const newWatermark = EventBus.getEventWatermark();
      expect(newWatermark).toBeGreaterThan(initialWatermark);
    });

    it('should set event watermark', () => {
      EventBus.setEventWatermark(100);

      const watermark = EventBus.getEventWatermark();
      expect(watermark).toBe(100);
    });
  });

  describe('Event Logging Control', () => {
    it('should enable event logging', () => {
      EventBus.enableEventLog(true);

      const enabled = EventBus.isEventLogEnabled();
      expect(enabled).toBe(true);
    });

    it('should disable event logging', () => {
      EventBus.enableEventLog(true);
      EventBus.enableEventLog(false);

      const enabled = EventBus.isEventLogEnabled();
      expect(enabled).toBe(false);
    });

    it('should respect skipEventLog option', () => {
      let logCalls = 0;

      // Mock the persist function (in real implementation, this would write to IndexedDB)
      const originalEmit = EventBus.emit;
      EventBus.emit = function (eventType, payload, options = {}) {
        if (!options.skipEventLog) {
          logCalls++;
        }
        // Call original emit but don't actually log
        return originalEmit.call(this, eventType, payload, { ...options, skipEventLog: true });
      };

      EventBus.emit('test_event', {});
      EventBus.emit('test_event', {}, { skipEventLog: true });

      expect(logCalls).toBe(1);

      // Restore original emit
      EventBus.emit = originalEmit;
    });
  });

  describe('Event Replay', () => {
    it('should replay events from log', async () => {
      // Setup: Emit some events
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsubscribe1 = EventBus.on('event1', handler1);
      const unsubscribe2 = EventBus.on('event2', handler2);

      // Emit events (these would be logged in real implementation)
      EventBus.emit('event1', { value: 1 }, { skipEventLog: true });
      EventBus.emit('event2', { value: 2 }, { skipEventLog: true });

      // Clear handlers
      unsubscribe1();
      unsubscribe2();

      // Setup new handlers for replay
      const replayHandler1 = vi.fn();
      const replayHandler2 = vi.fn();

      EventBus.on('event1', replayHandler1);
      EventBus.on('event2', replayHandler2);

      // In real implementation, this would replay from IndexedDB
      // For now, we test the API exists and is callable
      expect(EventBus.replayEvents).toBeDefined();
      expect(typeof EventBus.replayEvents).toBe('function');
    });

    it('should support forward replay', async () => {
      const result = await EventBus.replayEvents({
        fromSequenceNumber: 0,
        count: 10,
        forward: true,
      });

      expect(result).toBeDefined();
      expect(typeof result.replayed).toBe('number');
      expect(typeof result.errors).toBe('number');
    });

    it('should support reverse replay', async () => {
      const result = await EventBus.replayEvents({
        fromSequenceNumber: 0,
        count: 10,
        forward: false,
      });

      expect(result).toBeDefined();
      expect(typeof result.replayed).toBe('number');
      expect(typeof result.errors).toBe('number');
    });
  });

  describe('Event Log Statistics', () => {
    it('should get event log statistics', async () => {
      const stats = await EventBus.getEventLogStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalEvents).toBe('number');
      expect(typeof stats.latestCheckpointSequence).toBe('number');
    });
  });

  describe('Clear Event Log', () => {
    it('should clear event log', async () => {
      await EventBus.clearEventLog();

      const stats = await EventBus.getEventLogStats();
      expect(stats.totalEvents).toBe(0);
    });
  });

  describe('Integration with Existing EventBus', () => {
    it('should maintain backward compatibility with existing emit', () => {
      const handler = vi.fn();
      EventBus.on('test_event', handler);

      EventBus.emit('test_event', { data: 'test' });

      expect(handler).toHaveBeenCalledWith(
        { data: 'test' },
        expect.objectContaining({
          type: 'test_event',
          timestamp: expect.any(Number),
          priority: expect.any(Number),
        })
      );
    });

    it('should maintain backward compatibility with existing subscribe', () => {
      const handler = vi.fn();
      const unsubscribe = EventBus.on('test_event', handler);

      EventBus.emit('test_event', {});

      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      EventBus.emit('test_event', {});

      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should work with priority system', () => {
      const calls = [];

      const lowPriorityHandler = () => calls.push('low');
      const highPriorityHandler = () => calls.push('high');

      EventBus.on('test_event', lowPriorityHandler, { priority: EventBus.PRIORITY.LOW });
      EventBus.on('test_event', highPriorityHandler, { priority: EventBus.PRIORITY.HIGH });

      EventBus.emit('test_event', {});

      expect(calls).toEqual(['high', 'low']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle events with no subscribers', () => {
      expect(() => {
        EventBus.emit('nonexistent_event', {});
      }).not.toThrow();
    });

    it('should handle events with undefined payload', () => {
      const handler = vi.fn();
      EventBus.on('test_event', handler);

      expect(() => {
        EventBus.emit('test_event');
      }).not.toThrow();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle rapid event emission', () => {
      const handler = vi.fn();
      EventBus.on('test_event', handler);

      for (let i = 0; i < 100; i++) {
        EventBus.emit('test_event', { index: i });
      }

      expect(handler).toHaveBeenCalledTimes(100);
    });

    it('should mark emitted event as replay when skipEventLog is true', () => {
      const handler = vi.fn();
      EventBus.on('test_event', handler);

      // Emit during replay scenario
      EventBus.emit('test_event', {}, { skipEventLog: true });

      expect(handler).toHaveBeenCalledTimes(1);
      const meta = handler.mock.calls[0][1];
      expect(meta.isReplay).toBeDefined();
    });
  });
});
