/**
 * QuotaManager Enhanced Unit Tests (TD-14)
 *
 * TDD tests for localStorage quota checking with:
 * - Pre-write quota validation
 * - Tier-based behavior (NORMAL, WARNING, CRITICAL, EXCEEDED)
 * - Cleanup strategies (LRU eviction, old data removal)
 * - Error handling for quota-exceeded scenarios
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuotaManager } from '../../../js/storage/quota-manager.js';
import { EventBus } from '../../../js/services/event-bus.js';

// Store original navigator.storage
const originalStorage = navigator.storage;
const originalLocalStorage = window.localStorage;

// Mock storage estimate function
function mockStorageEstimate(usage, quota) {
  Object.defineProperty(navigator, 'storage', {
    value: {
      estimate: vi.fn().mockResolvedValue({ usage, quota }),
    },
    writable: true,
    configurable: true,
  });
}

// Restore original navigator.storage
function restoreStorage() {
  Object.defineProperty(navigator, 'storage', {
    value: originalStorage,
    writable: true,
    configurable: true,
  });
}

// Mock localStorage with quota tracking
class MockLocalStorage {
  constructor(quotaBytes = 5 * 1024 * 1024) {
    this.quotaBytes = quotaBytes;
    this.store = new Map();
    this.usedBytes = 0;
  }

  get length() {
    return this.store.size;
  }

  key(index) {
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }

  getItem(key) {
    return this.store.get(key) || null;
  }

  setItem(key, value) {
    const size = new Blob([value]).size;
    const existingSize = this.store.has(key) ? new Blob([this.store.get(key)]).size : 0;
    const newSize = this.usedBytes - existingSize + size;

    if (newSize > this.quotaBytes) {
      const error = new Error('QuotaExceededError');
      error.name = 'QuotaExceededError';
      error.code = 22;
      throw error;
    }

    this.store.set(key, value);
    this.usedBytes = newSize;
    return true;
  }

  removeItem(key) {
    if (this.store.has(key)) {
      const size = new Blob([this.store.get(key)]).size;
      this.store.delete(key);
      this.usedBytes -= size;
    }
  }

  clear() {
    this.store.clear();
    this.usedBytes = 0;
  }

  getUsage() {
    return this.usedBytes;
  }

  getQuota() {
    return this.quotaBytes;
  }
}

describe('QuotaManager - Enhanced Tests (TD-14)', () => {
  let mockLS;

  beforeEach(() => {
    vi.useFakeTimers();
    QuotaManager.reset();
    EventBus.clearAll();
    mockLS = new MockLocalStorage(5 * 1024 * 1024); // 5MB default
  });

  afterEach(() => {
    vi.useRealTimers();
    QuotaManager.reset();
    EventBus.clearAll();
    restoreStorage();
  });

  describe('Pre-write quota validation', () => {
    it('should return fits=true when write size is within available quota', async () => {
      const quota = 100 * 1024 * 1024; // 100MB
      const usage = 50 * 1024 * 1024; // 50MB (50%)
      mockStorageEstimate(usage, quota);

      const result = await QuotaManager.checkWriteFits(10 * 1024 * 1024); // 10MB write

      expect(result.fits).toBe(true);
      expect(result.currentStatus.availableBytes).toBeGreaterThanOrEqual(10 * 1024 * 1024);
      expect(result.reservationId).toBeDefined();
    });

    it('should return fits=false when write size exceeds available quota', async () => {
      const quota = 100 * 1024 * 1024; // 100MB
      const usage = 95 * 1024 * 1024; // 95MB (95%)
      mockStorageEstimate(usage, quota);

      const result = await QuotaManager.checkWriteFits(10 * 1024 * 1024); // 10MB write

      expect(result.fits).toBe(false);
      expect(result.currentStatus.isBlocked).toBe(true);
      expect(result.reservationId).toBeUndefined();
    });

    it('should create a reservation when checkWriteFits passes', async () => {
      const quota = 100 * 1024 * 1024;
      const usage = 50 * 1024 * 1024;
      mockStorageEstimate(usage, quota);

      const result1 = await QuotaManager.checkWriteFits(5 * 1024 * 1024);
      const result2 = await QuotaManager.checkWriteFits(5 * 1024 * 1024);

      expect(result1.reservationId).toBeDefined();
      expect(result2.reservationId).toBeDefined();
      expect(result1.reservationId).not.toBe(result2.reservationId);

      // Total reserved should be 10MB
      const totalReserved = QuotaManager.getTotalReservedBytes();
      expect(totalReserved).toBe(10 * 1024 * 1024);
    });

    it('should account for reservations in subsequent quota checks', async () => {
      const quota = 100 * 1024 * 1024;
      const usage = 85 * 1024 * 1024;
      mockStorageEstimate(usage, quota);

      // First write of 5MB should fit (85MB + 5MB = 90MB, still below 95% critical)
      const result1 = await QuotaManager.checkWriteFits(5 * 1024 * 1024);
      expect(result1.fits).toBe(true);

      // Second write of 5MB should also fit (85MB + 10MB reserved = 95MB, at critical but allowed)
      const result2 = await QuotaManager.checkWriteFits(5 * 1024 * 1024);
      expect(result2.fits).toBe(true);

      // Third write should fail due to reservations
      const result3 = await QuotaManager.checkWriteFits(5 * 1024 * 1024);
      expect(result3.fits).toBe(false);
    });

    it('should release reservation after write completes', async () => {
      const quota = 100 * 1024 * 1024;
      const usage = 50 * 1024 * 1024;
      mockStorageEstimate(usage, quota);

      const result = await QuotaManager.checkWriteFits(5 * 1024 * 1024);
      expect(result.reservationId).toBeDefined();

      expect(QuotaManager.getTotalReservedBytes()).toBe(5 * 1024 * 1024);

      // Release the reservation
      QuotaManager.releaseReservation(result.reservationId);
      expect(QuotaManager.getTotalReservedBytes()).toBe(0);
    });

    it('should auto-release stale reservations after timeout', async () => {
      const quota = 100 * 1024 * 1024;
      const usage = 50 * 1024 * 1024;
      mockStorageEstimate(usage, quota);

      const result = await QuotaManager.checkWriteFits(5 * 1024 * 1024);
      expect(QuotaManager.getTotalReservedBytes()).toBe(5 * 1024 * 1024);

      // Fast-forward past reservation timeout (30 seconds)
      vi.advanceTimersByTime(31000);

      // Trigger cleanup (happens automatically in checkNow)
      await QuotaManager.checkNow();

      expect(QuotaManager.getTotalReservedBytes()).toBe(0);
    });
  });

  describe('Tier-based behavior', () => {
    it('should be in NORMAL tier when usage is below 80%', async () => {
      const quota = 100 * 1024 * 1024;
      const usage = 50 * 1024 * 1024; // 50%
      mockStorageEstimate(usage, quota);

      const status = await QuotaManager.checkNow();

      expect(status.tier).toBe('normal');
      expect(status.isBlocked).toBe(false);
      expect(status.percentage).toBeLessThan(80);
    });

    it('should be in WARNING tier when usage is 80-95%', async () => {
      const quota = 100 * 1024 * 1024;
      const usage = 85 * 1024 * 1024; // 85%
      mockStorageEstimate(usage, quota);

      const status = await QuotaManager.checkNow();

      expect(status.tier).toBe('warning');
      expect(status.isBlocked).toBe(false);
      expect(status.percentage).toBeGreaterThanOrEqual(80);
      expect(status.percentage).toBeLessThan(95);
    });

    it('should be in CRITICAL tier when usage is 95% or above', async () => {
      const quota = 100 * 1024 * 1024;
      const usage = 96 * 1024 * 1024; // 96%
      mockStorageEstimate(usage, quota);

      const status = await QuotaManager.checkNow();

      expect(status.tier).toBe('critical');
      expect(status.isBlocked).toBe(true);
      expect(status.percentage).toBeGreaterThanOrEqual(95);
    });

    it('should emit appropriate events on tier transitions', async () => {
      const quota = 100 * 1024 * 1024;
      const warningHandler = vi.fn();
      const criticalHandler = vi.fn();

      EventBus.on('storage:quota_warning', warningHandler);
      EventBus.on('storage:quota_critical', criticalHandler);

      // Start at normal
      mockStorageEstimate(50 * 1024 * 1024, quota);
      await QuotaManager.checkNow();
      expect(warningHandler).not.toHaveBeenCalled();
      expect(criticalHandler).not.toHaveBeenCalled();

      // Move to warning
      mockStorageEstimate(85 * 1024 * 1024, quota);
      await QuotaManager.checkNow();
      expect(warningHandler).toHaveBeenCalledTimes(1);

      // Move to critical
      mockStorageEstimate(96 * 1024 * 1024, quota);
      await QuotaManager.checkNow();
      expect(criticalHandler).toHaveBeenCalledTimes(1);
    });

    it('should emit recovery event when returning to NORMAL tier', async () => {
      const quota = 100 * 1024 * 1024;
      const normalHandler = vi.fn();
      EventBus.on('storage:quota_normal', normalHandler);

      // Start at warning
      mockStorageEstimate(85 * 1024 * 1024, quota);
      await QuotaManager.checkNow();

      // Return to normal
      mockStorageEstimate(50 * 1024 * 1024, quota);
      await QuotaManager.checkNow();

      expect(normalHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Write blocking behavior', () => {
    it('should allow writes in NORMAL tier', async () => {
      const quota = 100 * 1024 * 1024;
      mockStorageEstimate(50 * 1024 * 1024, quota);

      const result = await QuotaManager.checkWriteFits(10 * 1024 * 1024);
      expect(result.fits).toBe(true);
      expect(QuotaManager.isWriteBlocked()).toBe(false);
    });

    it('should allow writes in WARNING tier with reservation', async () => {
      const quota = 100 * 1024 * 1024;
      mockStorageEstimate(85 * 1024 * 1024, quota);

      await QuotaManager.checkNow();
      expect(QuotaManager.isWriteBlocked()).toBe(false);

      const result = await QuotaManager.checkWriteFits(5 * 1024 * 1024);
      expect(result.fits).toBe(true);
    });

    it('should block writes in CRITICAL tier', async () => {
      const quota = 100 * 1024 * 1024;
      mockStorageEstimate(96 * 1024 * 1024, quota);

      await QuotaManager.checkNow();
      expect(QuotaManager.isWriteBlocked()).toBe(true);

      const result = await QuotaManager.checkWriteFits(1 * 1024 * 1024);
      expect(result.fits).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should handle navigator.storage.estimate() failures gracefully', async () => {
      // Remove storage API
      Object.defineProperty(navigator, 'storage', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const status = await QuotaManager.checkNow();

      // Should return fallback status
      expect(status).toHaveProperty('usageBytes');
      expect(status).toHaveProperty('quotaBytes');
      expect(status.quotaBytes).toBe(QuotaManager.config.fallbackQuotaBytes);
    });

    it('should handle null/undefined quota in estimate', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: vi.fn().mockResolvedValue({ usage: null, quota: null }),
        },
        writable: true,
        configurable: true,
      });

      const status = await QuotaManager.checkNow();

      expect(status.quotaBytes).toBeGreaterThan(0);
      expect(status.usageBytes).toBe(0);
    });
  });

  describe('Data size estimation', () => {
    it('should estimate size of JSON data correctly', () => {
      const testData = {
        id: 'test-id',
        data: 'x'.repeat(1000),
        timestamp: Date.now(),
        nested: { a: 1, b: [1, 2, 3] },
      };

      const jsonString = JSON.stringify(testData);
      const byteSize = new Blob([jsonString]).size;

      expect(byteSize).toBeGreaterThan(1000);
      expect(byteSize).toBeLessThan(2000);
    });

    it('should estimate size of binary-like data', () => {
      // Test with base64 encoded data (common for embeddings)
      const base64Data = 'A'.repeat(10000);
      const byteSize = new Blob([base64Data]).size;

      expect(byteSize).toBe(10000);
    });
  });

  describe('Large write detection', () => {
    it('should not return status for small writes', async () => {
      const quota = 100 * 1024 * 1024;
      mockStorageEstimate(50 * 1024 * 1024, quota);

      // Small write below threshold
      const result = await QuotaManager.notifyLargeWrite(512 * 1024);

      // Should return undefined for small writes
      expect(result).toBeUndefined();
    });

    it('should return status for large writes at threshold', async () => {
      const quota = 100 * 1024 * 1024;
      mockStorageEstimate(50 * 1024 * 1024, quota);

      // Large write at threshold (1MB)
      const result = await QuotaManager.notifyLargeWrite(1024 * 1024);

      // Should return status object
      expect(result).toBeDefined();
      expect(result).toHaveProperty('usageBytes');
      expect(result).toHaveProperty('quotaBytes');
      expect(result).toHaveProperty('percentage');
    });

    it('should include pending bytes in quota check after large write', async () => {
      const quota = 100 * 1024 * 1024;
      const usage = 85 * 1024 * 1024;
      mockStorageEstimate(usage, quota);

      const status = await QuotaManager.notifyLargeWrite(10 * 1024 * 1024, 5 * 1024 * 1024);

      // notifyLargeWrite should return status when large enough
      expect(status).toBeDefined();
      expect(status.usageBytes).toBeGreaterThanOrEqual(usage + 5 * 1024 * 1024);
    });
  });

  describe('Cleanup threshold behavior', () => {
    it('should emit threshold_exceeded event at 90%', async () => {
      const quota = 100 * 1024 * 1024;
      const thresholdHandler = vi.fn();

      // Listen to the EventBus (this is the real integration)
      EventBus.on('storage:threshold_exceeded', thresholdHandler);

      mockStorageEstimate(91 * 1024 * 1024, quota);
      await QuotaManager.checkNow();

      expect(thresholdHandler).toHaveBeenCalled();
      const payload = thresholdHandler.mock.calls[0][0];
      expect(payload.percent).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Configuration validation', () => {
    it('should validate warning threshold is less than critical', () => {
      QuotaManager.setCriticalThreshold(0.9);
      const result = QuotaManager.setWarningThreshold(0.91);

      expect(result).toBe(false);
      expect(QuotaManager.config.warningThreshold).not.toBe(0.91);
    });

    it('should validate critical threshold is greater than warning', () => {
      QuotaManager.setWarningThreshold(0.8);
      const result = QuotaManager.setCriticalThreshold(0.75);

      expect(result).toBe(false);
      expect(QuotaManager.config.criticalThreshold).not.toBe(0.75);
    });
  });

  describe('Integration with EventBus', () => {
    it('should emit quota status events with proper payload structure', async () => {
      const quota = 100 * 1024 * 1024;
      mockStorageEstimate(96 * 1024 * 1024, quota);

      const handler = vi.fn();
      EventBus.on('storage:quota_critical', handler);

      // Reset to ensure we're not already in critical tier
      QuotaManager.reset();

      await QuotaManager.checkNow();

      expect(handler).toHaveBeenCalled();
      // EventBus emits with metadata as second argument
      const payload = handler.mock.calls[0][0];
      expect(payload).toHaveProperty('usageBytes', expect.any(Number));
      expect(payload).toHaveProperty('quotaBytes', expect.any(Number));
      expect(payload).toHaveProperty('percentage', expect.any(Number));
    });
  });

  describe('Status immutability', () => {
    it('should return copies of status to prevent external mutation', async () => {
      const quota = 100 * 1024 * 1024;
      mockStorageEstimate(50 * 1024 * 1024, quota);

      const status1 = QuotaManager.getStatus();
      status1.tier = 'hacked';
      status1.usageBytes = 999999;
      status1.isBlocked = true;

      const status2 = QuotaManager.getStatus();
      expect(status2.tier).not.toBe('hacked');
      expect(status2.usageBytes).not.toBe(999999);
      expect(status2.isBlocked).toBe(false);
    });
  });
});

describe('QuotaManager - Cleanup Strategies', () => {
  beforeEach(() => {
    QuotaManager.reset();
    EventBus.clearAll();
  });

  afterEach(() => {
    QuotaManager.reset();
    EventBus.clearAll();
  });

  describe('Reservation cleanup', () => {
    it('should handle empty reservation list gracefully', () => {
      expect(() => QuotaManager.cleanupStaleReservations()).not.toThrow();
      expect(QuotaManager.getTotalReservedBytes()).toBe(0);
    });

    it('should create and release reservations correctly', () => {
      const reservation1 = QuotaManager.createReservation(5 * 1024 * 1024);
      const reservation2 = QuotaManager.createReservation(3 * 1024 * 1024);

      expect(QuotaManager.getTotalReservedBytes()).toBe(8 * 1024 * 1024);

      QuotaManager.releaseReservation(reservation1);
      expect(QuotaManager.getTotalReservedBytes()).toBe(3 * 1024 * 1024);

      QuotaManager.releaseReservation(reservation2);
      expect(QuotaManager.getTotalReservedBytes()).toBe(0);
    });
  });
});
