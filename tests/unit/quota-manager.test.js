/**
 * QuotaManager Unit Tests
 *
 * Tests for storage quota monitoring, thresholds, and event emissions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuotaManager } from '../../js/storage/quota-manager.js';
import { EventBus } from '../../js/services/event-bus.js';

// Store original navigator.storage
const originalStorage = navigator.storage;

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

describe('QuotaManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    QuotaManager.reset();
    EventBus.clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    QuotaManager.reset();
    EventBus.clearAll();
    restoreStorage();
  });

  describe('Configuration', () => {
    it('should have default warning threshold of 80%', () => {
      expect(QuotaManager.config.warningThreshold).toBe(0.8);
    });

    it('should have default critical threshold of 95%', () => {
      expect(QuotaManager.config.criticalThreshold).toBe(0.95);
    });

    it('should have default polling interval of 60 seconds', () => {
      expect(QuotaManager.config.pollIntervalMs).toBe(60000);
    });

    it('should have large write threshold of 1MB', () => {
      expect(QuotaManager.config.largeWriteThresholdBytes).toBe(1024 * 1024);
    });
  });

  describe('getStatus', () => {
    it('should return current quota status object with all properties', () => {
      const status = QuotaManager.getStatus();

      expect(status).toHaveProperty('usageBytes');
      expect(status).toHaveProperty('quotaBytes');
      expect(status).toHaveProperty('percentage');
      expect(status).toHaveProperty('availableBytes');
      expect(status).toHaveProperty('isBlocked');
      expect(status).toHaveProperty('tier');
    });

    it('should have initial tier set to normal', () => {
      const status = QuotaManager.getStatus();
      expect(status.tier).toBe('normal');
    });

    it('should have initial isBlocked set to false', () => {
      const status = QuotaManager.getStatus();
      expect(status.isBlocked).toBe(false);
    });

    it('should have initial availableBytes equal to fallback quota', () => {
      const status = QuotaManager.getStatus();
      expect(status.availableBytes).toBe(QuotaManager.config.fallbackQuotaBytes);
    });

    it('should return a copy so callers cannot mutate internal state', () => {
      const status1 = QuotaManager.getStatus();
      status1.tier = 'hacked';
      status1.usageBytes = 999999;

      const status2 = QuotaManager.getStatus();
      expect(status2.tier).toBe('normal');
      expect(status2.usageBytes).toBe(0);
    });
  });

  describe('isWriteBlocked', () => {
    it('should return false initially', () => {
      expect(QuotaManager.isWriteBlocked()).toBe(false);
    });
  });

  describe('Threshold setters', () => {
    it('should allow setting warning threshold', () => {
      const result = QuotaManager.setWarningThreshold(0.75);
      expect(result).toBe(true);
      expect(QuotaManager.config.warningThreshold).toBe(0.75);
    });

    it('should allow setting critical threshold', () => {
      const result = QuotaManager.setCriticalThreshold(0.9);
      expect(result).toBe(true);
      expect(QuotaManager.config.criticalThreshold).toBe(0.9);
    });

    it('should reject invalid threshold values', () => {
      const originalWarning = QuotaManager.config.warningThreshold;
      const originalCritical = QuotaManager.config.criticalThreshold;

      const result1 = QuotaManager.setWarningThreshold(1.5); // Invalid - > 1
      expect(result1).toBe(false);
      expect(QuotaManager.config.warningThreshold).toBe(originalWarning);

      const result2 = QuotaManager.setCriticalThreshold(-0.5); // Invalid - < 0
      expect(result2).toBe(false);
      expect(QuotaManager.config.criticalThreshold).toBe(originalCritical);
    });

    it('should reject warning threshold >= critical threshold', () => {
      // Try to set warning to 0.96 when critical is 0.95
      const result = QuotaManager.setWarningThreshold(0.96);
      expect(result).toBe(false);
      expect(QuotaManager.config.warningThreshold).toBe(0.8); // Unchanged
    });

    it('should reject critical threshold <= warning threshold', () => {
      // Try to set critical to 0.75 when warning is 0.80
      const result = QuotaManager.setCriticalThreshold(0.75);
      expect(result).toBe(false);
      expect(QuotaManager.config.criticalThreshold).toBe(0.95); // Unchanged
    });
  });

  describe('Polling lifecycle', () => {
    it('should stop polling when stopPolling is called', () => {
      QuotaManager.stopPolling();
      // Should not throw
      expect(true).toBe(true);
    });

    it('should reset state when reset is called', () => {
      QuotaManager.reset();
      const status = QuotaManager.getStatus();

      expect(status.tier).toBe('normal');
      expect(status.isBlocked).toBe(false);
      expect(status.percentage).toBe(0);
      expect(status.availableBytes).toBe(QuotaManager.config.fallbackQuotaBytes);
    });

    it('should restore config defaults when reset is called', () => {
      // Modify thresholds
      QuotaManager.setWarningThreshold(0.5);
      QuotaManager.setCriticalThreshold(0.6);

      expect(QuotaManager.config.warningThreshold).toBe(0.5);
      expect(QuotaManager.config.criticalThreshold).toBe(0.6);

      // Reset should restore defaults
      QuotaManager.reset();

      expect(QuotaManager.config.warningThreshold).toBe(0.8);
      expect(QuotaManager.config.criticalThreshold).toBe(0.95);
    });
  });

  describe('Event emissions', () => {
    it('should emit storage:quota_warning when crossing warning threshold', async () => {
      const warningHandler = vi.fn();
      EventBus.on('storage:quota_warning', warningHandler);

      // Mock storage at 85% usage (above 80% warning threshold)
      const quota = 100 * 1024 * 1024; // 100MB
      const usage = 85 * 1024 * 1024; // 85MB (85%)
      mockStorageEstimate(usage, quota);

      await QuotaManager.checkNow();

      expect(warningHandler).toHaveBeenCalled();
      const payload = warningHandler.mock.calls[0][0];
      expect(payload).toHaveProperty('usageBytes');
      expect(payload).toHaveProperty('quotaBytes');
      expect(payload).toHaveProperty('percentage');
      expect(typeof payload.usageBytes).toBe('number');
      expect(typeof payload.quotaBytes).toBe('number');
      expect(typeof payload.percentage).toBe('number');
      expect(payload.percentage).toBeGreaterThanOrEqual(80);
      expect(payload.percentage).toBeLessThan(95);
    });

    it('should emit storage:quota_critical when crossing critical threshold', async () => {
      const criticalHandler = vi.fn();
      EventBus.on('storage:quota_critical', criticalHandler);

      // Mock storage at 96% usage (above 95% critical threshold)
      const quota = 100 * 1024 * 1024; // 100MB
      const usage = 96 * 1024 * 1024; // 96MB (96%)
      mockStorageEstimate(usage, quota);

      await QuotaManager.checkNow();

      expect(criticalHandler).toHaveBeenCalled();
      const payload = criticalHandler.mock.calls[0][0];
      expect(payload).toHaveProperty('usageBytes');
      expect(payload).toHaveProperty('quotaBytes');
      expect(payload).toHaveProperty('percentage');
      expect(payload.percentage).toBeGreaterThanOrEqual(95);
    });

    it('should emit storage:quota_normal when recovered', async () => {
      const normalHandler = vi.fn();
      EventBus.on('storage:quota_normal', normalHandler);

      // First, put into warning state
      const quota = 100 * 1024 * 1024;
      mockStorageEstimate(85 * 1024 * 1024, quota); // 85%
      await QuotaManager.checkNow();

      // Then recover to normal
      mockStorageEstimate(50 * 1024 * 1024, quota); // 50%
      await QuotaManager.checkNow();

      expect(normalHandler).toHaveBeenCalled();
      const payload = normalHandler.mock.calls[0][0];
      expect(payload).toHaveProperty('usageBytes');
      expect(payload).toHaveProperty('quotaBytes');
      expect(payload).toHaveProperty('percentage');
      expect(payload.percentage).toBeLessThan(80);
    });

    it('should emit storage:quota_warning when transitioning from critical to warning', async () => {
      const warningHandler = vi.fn();
      EventBus.on('storage:quota_warning', warningHandler);

      const quota = 100 * 1024 * 1024;

      // First, put into critical state
      mockStorageEstimate(96 * 1024 * 1024, quota); // 96%
      await QuotaManager.checkNow();

      // Then recover to warning (but not normal)
      mockStorageEstimate(85 * 1024 * 1024, quota); // 85%
      await QuotaManager.checkNow();

      // Should have emitted warning event on critical->warning transition
      expect(warningHandler).toHaveBeenCalled();
    });
  });

  describe('Large write notification', () => {
    it('should not trigger immediate check for small writes', async () => {
      const checkNowSpy = vi.spyOn(QuotaManager, 'checkNow');

      // Small write under threshold
      await QuotaManager.notifyLargeWrite(512 * 1024); // 512KB

      // Should not have called checkNow (threshold is 1MB)
      expect(checkNowSpy).not.toHaveBeenCalled();

      checkNowSpy.mockRestore();
    });

    it('should trigger immediate check for large writes above threshold', async () => {
      // Mock storage estimate to avoid actual API calls and track calls
      mockStorageEstimate(0, 100 * 1024 * 1024);

      // Test 1: Small write below threshold (512KB) - should NOT trigger check
      let storageCheckCount = 0;
      const originalEstimate1 = navigator.storage.estimate;
      navigator.storage.estimate = vi.fn().mockImplementation(async () => {
        storageCheckCount++;
        return { usage: 0, quota: 100 * 1024 * 1024 };
      });

      await QuotaManager.notifyLargeWrite(512 * 1024); // 512KB
      expect(storageCheckCount).toBe(0); // No check should have been made

      // Test 2: Write exactly at threshold (1MB) - should trigger check
      storageCheckCount = 0;
      navigator.storage.estimate = vi.fn().mockImplementation(async () => {
        storageCheckCount++;
        return { usage: 0, quota: 100 * 1024 * 1024 };
      });

      await QuotaManager.notifyLargeWrite(1024 * 1024); // 1MB
      expect(storageCheckCount).toBe(1); // Exactly one check should have been made

      // Test 3: Large write above threshold (2MB) - should trigger check
      storageCheckCount = 0;
      navigator.storage.estimate = vi.fn().mockImplementation(async () => {
        storageCheckCount++;
        return { usage: 0, quota: 100 * 1024 * 1024 };
      });

      await QuotaManager.notifyLargeWrite(2 * 1024 * 1024); // 2MB
      expect(storageCheckCount).toBe(1); // Exactly one check should have been made

      // Restore original
      navigator.storage.estimate = originalEstimate1;
    });
  });

  describe('init function', () => {
    it('should return a shallow copy of status, not the internal reference', async () => {
      mockStorageEstimate(0, 100 * 1024 * 1024);

      const status = await QuotaManager.init();
      status.tier = 'hacked';
      status.usageBytes = 999999;

      const internalStatus = QuotaManager.getStatus();
      expect(internalStatus.tier).not.toBe('hacked');
      expect(internalStatus.usageBytes).not.toBe(999999);
    });
  });
});
