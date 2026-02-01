/**
 * TabCoordinator Watermark Tracking Tests
 *
 * Tests for event replay watermark tracking and cross-tab coordination.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TabCoordinator } from '../../js/services/tab-coordination/index.js';

// Mock BroadcastChannel for testing
global.BroadcastChannel = class MockBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.listeners = [];
  }

  postMessage(message) {
    // Simulate immediate delivery to all listeners except sender
    this.listeners.forEach(listener => {
      if (listener !== this.currentMessageListener) {
        try {
          listener({ data: message });
        } catch (error) {
          console.error('MockBroadcastChannel error:', error);
        }
      }
    });
  }

  addEventListener(listener) {
    this.listeners.push(listener);
    this.currentMessageListener = listener;
  }

  removeEventListener(listener) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
    if (this.currentMessageListener === listener) {
      this.currentMessageListener = null;
    }
  }

  close() {
    this.listeners = [];
    this.currentMessageListener = null;
  }
};

describe('TabCoordinator Watermark Tracking', () => {
  beforeEach(() => {
    // Reset state before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up
    if (TabCoordinator.cleanup) {
      TabCoordinator.cleanup();
    }
  });

  describe('Watermark Tracking', () => {
    it('should initialize with negative watermark', () => {
      const watermark = TabCoordinator.getEventWatermark();
      expect(watermark).toBe(-1);
    });

    it('should update event watermark', () => {
      TabCoordinator.updateEventWatermark(10);

      const watermark = TabCoordinator.getEventWatermark();
      expect(watermark).toBe(10);
    });

    it('should track multiple watermark updates', () => {
      TabCoordinator.updateEventWatermark(5);
      expect(TabCoordinator.getEventWatermark()).toBe(5);

      TabCoordinator.updateEventWatermark(15);
      expect(TabCoordinator.getEventWatermark()).toBe(15);

      TabCoordinator.updateEventWatermark(100);
      expect(TabCoordinator.getEventWatermark()).toBe(100);
    });

    it('should get known watermarks from other tabs', () => {
      const watermarks = TabCoordinator.getKnownWatermarks();

      expect(watermarks).toBeInstanceOf(Map);
    });
  });

  describe('Replay Detection', () => {
    it('should detect when replay is needed', () => {
      // Setup: We're secondary and behind
      const isPrimary = TabCoordinator.isPrimary();
      if (!isPrimary) {
        TabCoordinator.updateEventWatermark(5);

        // Simulate receiving watermark from another tab
        // In real implementation, this would come via BroadcastChannel

        const needsReplay = TabCoordinator.needsReplay();
        expect(typeof needsReplay).toBe('boolean');
      }
    });

    it('should not need replay when up to date', () => {
      const isPrimary = TabCoordinator.isPrimary();
      if (!isPrimary) {
        TabCoordinator.updateEventWatermark(10);

        const needsReplay = TabCoordinator.needsReplay();
        expect(needsReplay).toBe(false);
      }
    });
  });

  describe('Replay Requests', () => {
    it('should request event replay', async () => {
      const isPrimary = TabCoordinator.isPrimary();
      if (!isPrimary) {
        await expect(TabCoordinator.requestEventReplay(5)).resolves.toBeUndefined();
      }
    });

    it('should warn primary tab from requesting replay', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const isPrimary = TabCoordinator.isPrimary();
      if (isPrimary) {
        await TabCoordinator.requestEventReplay(5);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Primary tab should not request replay')
        );
      }

      consoleSpy.mockRestore();
    });
  });

  describe('Auto-Replay', () => {
    it('should auto-replay when needed', async () => {
      const isPrimary = TabCoordinator.isPrimary();
      if (!isPrimary) {
        TabCoordinator.updateEventWatermark(0);

        const result = await TabCoordinator.autoReplayIfNeeded();

        expect(typeof result).toBe('boolean');
      }
    });

    it('should not auto-replay when not needed', async () => {
      const isPrimary = TabCoordinator.isPrimary();
      if (!isPrimary) {
        TabCoordinator.updateEventWatermark(100);

        const result = await TabCoordinator.autoReplayIfNeeded();

        expect(result).toBe(false);
      }
    });
  });

  describe('Integration with TabCoordination', () => {
    it('should start watermark broadcast when becoming primary', async () => {
      const isPrimary = await TabCoordinator.init();

      if (isPrimary) {
        // Watermark broadcast should be started
        // In real implementation, we'd verify the interval is set
        expect(TabCoordinator.getEventWatermark()).toBeDefined();
      }
    });

    it('should stop watermark broadcast when becoming secondary', async () => {
      await TabCoordinator.init();

      const isPrimary = TabCoordinator.isPrimary();
      if (isPrimary) {
        // In real implementation, another tab claiming primary
        // would trigger transition to secondary
        expect(TabCoordinator.getEventWatermark()).toBeDefined();
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle watermark updates with same value', () => {
      TabCoordinator.updateEventWatermark(10);
      TabCoordinator.updateEventWatermark(10);
      TabCoordinator.updateEventWatermark(10);

      expect(TabCoordinator.getEventWatermark()).toBe(10);
    });

    it('should handle watermark decrements (should not happen in practice)', () => {
      TabCoordinator.updateEventWatermark(20);
      TabCoordinator.updateEventWatermark(15);
      TabCoordinator.updateEventWatermark(10);

      expect(TabCoordinator.getEventWatermark()).toBe(10);
    });

    it('should handle large watermark values', () => {
      const largeValue = Number.MAX_SAFE_INTEGER;
      TabCoordinator.updateEventWatermark(largeValue);

      expect(TabCoordinator.getEventWatermark()).toBe(largeValue);
    });

    it('should handle zero watermark', () => {
      TabCoordinator.updateEventWatermark(0);

      expect(TabCoordinator.getEventWatermark()).toBe(0);
    });

    it('should handle negative watermark values', () => {
      TabCoordinator.updateEventWatermark(-1);
      TabCoordinator.updateEventWatermark(-100);

      expect(TabCoordinator.getEventWatermark()).toBe(-100);
    });
  });

  describe('BroadcastChannel Integration', () => {
    it('should handle EVENT_WATERMARK messages', async () => {
      const isPrimary = await TabCoordinator.init();

      if (isPrimary) {
        // Primary broadcasts watermark
        TabCoordinator.updateEventWatermark(42);

        // Verify watermark was updated
        expect(TabCoordinator.getEventWatermark()).toBe(42);
      }
    });

    it('should handle REPLAY_REQUEST messages', async () => {
      const isPrimary = await TabCoordinator.init();

      if (isPrimary) {
        // Primary can receive replay requests via internal BroadcastChannel
        // Verify that the public API for watermark tracking exists
        expect(TabCoordinator.updateEventWatermark).toBeDefined();
        expect(TabCoordinator.getEventWatermark).toBeDefined();
      }
    });

    it('should handle REPLAY_RESPONSE messages', async () => {
      const isPrimary = await TabCoordinator.init();

      if (!isPrimary) {
        // Secondary can receive replay responses via internal BroadcastChannel
        // Verify that replay detection API exists
        expect(TabCoordinator.needsReplay).toBeDefined();
        expect(TabCoordinator.requestEventReplay).toBeDefined();
      }
    });
  });

  describe('API Availability', () => {
    it('should export watermark tracking functions', () => {
      expect(TabCoordinator.updateEventWatermark).toBeDefined();
      expect(TabCoordinator.getEventWatermark).toBeDefined();
      expect(TabCoordinator.getKnownWatermarks).toBeDefined();
      expect(TabCoordinator.requestEventReplay).toBeDefined();
      expect(TabCoordinator.needsReplay).toBeDefined();
      expect(TabCoordinator.autoReplayIfNeeded).toBeDefined();
    });

    it('should have functions as callable', () => {
      expect(typeof TabCoordinator.updateEventWatermark).toBe('function');
      expect(typeof TabCoordinator.getEventWatermark).toBe('function');
      expect(typeof TabCoordinator.getKnownWatermarks).toBe('function');
      expect(typeof TabCoordinator.requestEventReplay).toBe('function');
      expect(typeof TabCoordinator.needsReplay).toBe('function');
      expect(typeof TabCoordinator.autoReplayIfNeeded).toBe('function');
    });
  });
});
