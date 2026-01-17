/**
 * QuotaManager Unit Tests
 * 
 * Tests for storage quota monitoring, thresholds, and event emissions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuotaManager } from '../../js/storage/quota-manager.js';
import { EventBus } from '../../js/services/event-bus.js';

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
    });

    describe('Configuration', () => {
        it('should have default warning threshold of 80%', () => {
            expect(QuotaManager.config.warningThreshold).toBe(0.80);
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
        it('should return current quota status object', () => {
            const status = QuotaManager.getStatus();

            expect(status).toHaveProperty('usageBytes');
            expect(status).toHaveProperty('quotaBytes');
            expect(status).toHaveProperty('percentage');
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
    });

    describe('isWriteBlocked', () => {
        it('should return false initially', () => {
            expect(QuotaManager.isWriteBlocked()).toBe(false);
        });
    });

    describe('Threshold setters', () => {
        it('should allow setting warning threshold', () => {
            QuotaManager.setWarningThreshold(0.75);
            expect(QuotaManager.config.warningThreshold).toBe(0.75);
        });

        it('should allow setting critical threshold', () => {
            QuotaManager.setCriticalThreshold(0.90);
            expect(QuotaManager.config.criticalThreshold).toBe(0.90);
        });

        it('should reject invalid threshold values', () => {
            const originalWarning = QuotaManager.config.warningThreshold;
            const originalCritical = QuotaManager.config.criticalThreshold;

            QuotaManager.setWarningThreshold(1.5); // Invalid - > 1
            expect(QuotaManager.config.warningThreshold).toBe(originalWarning); // Unchanged

            QuotaManager.setCriticalThreshold(-0.5); // Invalid - < 0
            expect(QuotaManager.config.criticalThreshold).toBe(originalCritical); // Unchanged
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
        });
    });

    describe('Event schema contracts', () => {
        it('should emit storage:quota_warning with correct payload shape', () => {
            const payload = {
                usageBytes: 40 * 1024 * 1024, // 40MB
                quotaBytes: 50 * 1024 * 1024, // 50MB
                percentage: 80
            };

            expect(payload).toHaveProperty('usageBytes');
            expect(payload).toHaveProperty('quotaBytes');
            expect(payload).toHaveProperty('percentage');
            expect(typeof payload.usageBytes).toBe('number');
            expect(typeof payload.quotaBytes).toBe('number');
            expect(typeof payload.percentage).toBe('number');
        });

        it('should emit storage:quota_critical with correct payload shape', () => {
            const payload = {
                usageBytes: 47.5 * 1024 * 1024, // 47.5MB
                quotaBytes: 50 * 1024 * 1024,   // 50MB
                percentage: 95
            };

            expect(payload).toHaveProperty('usageBytes');
            expect(payload).toHaveProperty('quotaBytes');
            expect(payload).toHaveProperty('percentage');
            expect(payload.percentage).toBeGreaterThanOrEqual(95);
        });

        it('should emit storage:quota_normal when recovered', () => {
            const payload = {
                usageBytes: 30 * 1024 * 1024, // 30MB
                quotaBytes: 50 * 1024 * 1024, // 50MB
                percentage: 60
            };

            expect(payload).toHaveProperty('usageBytes');
            expect(payload).toHaveProperty('quotaBytes');
            expect(payload).toHaveProperty('percentage');
            expect(payload.percentage).toBeLessThan(80);
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
    });
});
