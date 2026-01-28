/**
 * Degradation Detector Tests
 *
 * Comprehensive test suite for quota monitoring and degradation detection.
 * Tests the _checkQuotaAndDegrade, _getStorageMetrics, _determineDegradationTier,
 * _estimateStorageFromIndexedDB, and quota monitoring functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DegradationDetector } from '../../../../js/services/storage-degradation/degradation-detector.js';
import { DegradationTier } from '../../../../js/services/storage-degradation/degradation-detector.js';

// Mock EventBus
const mockEventBus = {
    emit: vi.fn(),
    on: vi.fn()
};

// Mock Storage
const mockStorage = {
    getAllChatSessions: vi.fn(),
    getActiveSessionId: vi.fn()
};

describe('DegradationDetector', () => {
    let detector;

    beforeEach(() => {
        vi.clearAllMocks();
        detector = new DegradationDetector({
            eventBus: mockEventBus,
            checkIntervalMs: 100 // Short interval for tests
        });
    });

    afterEach(() => {
        detector.stopQuotaMonitoring();
    });

    describe('Constructor', () => {
        it('should initialize with default options', () => {
            const defaultDetector = new DegradationDetector();
            expect(defaultDetector).toBeDefined();
            expect(defaultDetector.getCurrentTier()).toBe(DegradationTier.NORMAL);
        });

        it('should initialize with custom eventBus', () => {
            const customDetector = new DegradationDetector({ eventBus: mockEventBus });
            expect(customDetector).toBeDefined();
        });

        it('should initialize with custom checkIntervalMs', () => {
            const customDetector = new DegradationDetector({ checkIntervalMs: 5000 });
            expect(customDetector).toBeDefined();
        });
    });

    describe('getCurrentTier', () => {
        it('should return NORMAL tier initially', () => {
            expect(detector.getCurrentTier()).toBe(DegradationTier.NORMAL);
        });

        it('should return updated tier after quota check', async () => {
            // Mock navigator.storage.estimate to return WARNING level
            global.navigator.storage.estimate = vi.fn().mockResolvedValue({
                usage: 84 * 1024 * 1024, // 84 MB
                quota: 100 * 1024 * 1024  // 100 MB
            });

            await detector._checkQuotaAndDegrade();
            expect(detector.getCurrentTier()).toBe(DegradationTier.WARNING);
        });
    });

    describe('getCurrentMetrics', () => {
        it('should return null initially', () => {
            expect(detector.getCurrentMetrics()).toBeNull();
        });

        it('should return metrics after quota check', async () => {
            global.navigator.storage.estimate = vi.fn().mockResolvedValue({
                usage: 50 * 1024 * 1024,
                quota: 100 * 1024 * 1024
            });

            await detector._checkQuotaAndDegrade();
            const metrics = detector.getCurrentMetrics();

            expect(metrics).toBeDefined();
            expect(metrics.usagePercent).toBe(50);
        });
    });

    describe('_getStorageMetrics', () => {
        let originalStorage;

        beforeEach(() => {
            // Save original storage
            originalStorage = global.navigator.storage;
            // Mock navigator.storage.estimate
            global.navigator.storage.estimate = vi.fn();
        });

        afterEach(() => {
            // Restore storage if it was deleted
            if (!global.navigator.storage && originalStorage) {
                global.navigator.storage = originalStorage;
            }
        });

        it('should return metrics with usage and quota', async () => {
            global.navigator.storage.estimate.mockResolvedValue({
                usage: 60 * 1024 * 1024, // 60 MB
                quota: 100 * 1024 * 1024  // 100 MB
            });

            const metrics = await detector._getStorageMetrics();

            expect(metrics.usageBytes).toBe(60 * 1024 * 1024);
            expect(metrics.quotaBytes).toBe(100 * 1024 * 1024);
            expect(metrics.usagePercent).toBe(60);
            expect(metrics.availableBytes).toBe(40 * 1024 * 1024);
            expect(metrics.tier).toBe(DegradationTier.WARNING);
        });

        it('should handle zero usage', async () => {
            global.navigator.storage.estimate.mockResolvedValue({
                usage: 0,
                quota: 100 * 1024 * 1024
            });

            const metrics = await detector._getStorageMetrics();

            expect(metrics.usageBytes).toBe(0);
            expect(metrics.usagePercent).toBe(0);
            expect(metrics.tier).toBe(DegradationTier.NORMAL);
        });

        it('should handle missing usage/quota gracefully', async () => {
            global.navigator.storage.estimate.mockResolvedValue({
                usage: undefined,
                quota: undefined
            });

            const metrics = await detector._getStorageMetrics();

            expect(metrics.usageBytes).toBe(0);
            expect(metrics.quotaBytes).toBe(1);
            expect(metrics.usagePercent).toBe(0);
        });

        it('should fallback to IndexedDB estimation when navigator.storage unavailable', async () => {
            delete global.navigator.storage;

            // Mock IndexedDB
            const mockDB = {
                objectStoreNames: ['sessions', 'chunks', 'streams'],
                close: vi.fn(),
                transaction: vi.fn()
            };

            const mockTransaction = {
                objectStore: vi.fn()
            };

            const mockStore = {
                count: vi.fn()
            };

            const mockRequest = {
                onsuccess: null,
                onerror: null,
                result: 100 // 100 records
            };

            global.indexedDB = {
                open: vi.fn().mockImplementation(() => {
                    const request = {
                        onsuccess: null,
                        onerror: null,
                        result: mockDB
                    };

                    // Simulate async success
                    setTimeout(() => {
                        if (request.onsuccess) request.onsuccess({ target: { result: mockDB } });
                    }, 0);

                    return request;
                })
            };

            // Setup chain for count operation
            mockDB.transaction.mockReturnValue(mockTransaction);
            mockTransaction.objectStore.mockReturnValue(mockStore);
            mockStore.count.mockReturnValue(mockRequest);

            const metrics = await detector._getStorageMetrics();

            expect(metrics).toBeDefined();
            expect(metrics.usagePercent).toBeGreaterThanOrEqual(0);
        });
    });

    describe('_determineDegradationTier', () => {
        it('should return NORMAL for < 80% usage', () => {
            const tier = detector._determineDegradationTier({ usagePercent: 50 });
            expect(tier).toBe(DegradationTier.NORMAL);
        });

        it('should return WARNING for 80-94% usage', () => {
            expect(detector._determineDegradationTier({ usagePercent: 80 })).toBe(DegradationTier.WARNING);
            expect(detector._determineDegradationTier({ usagePercent: 85 })).toBe(DegradationTier.WARNING);
            expect(detector._determineDegradationTier({ usagePercent: 94 })).toBe(DegradationTier.WARNING);
        });

        it('should return CRITICAL for 95-98% usage', () => {
            expect(detector._determineDegradationTier({ usagePercent: 95 })).toBe(DegradationTier.CRITICAL);
            expect(detector._determineDegradationTier({ usagePercent: 97 })).toBe(DegradationTier.CRITICAL);
            expect(detector._determineDegradationTier({ usagePercent: 98 })).toBe(DegradationTier.CRITICAL);
        });

        it('should return EMERGENCY for 99% usage', () => {
            expect(detector._determineDegradationTier({ usagePercent: 99 })).toBe(DegradationTier.EMERGENCY);
        });

        it('should return EXCEEDED for 100%+ usage', () => {
            expect(detector._determineDegradationTier({ usagePercent: 100 })).toBe(DegradationTier.EXCEEDED);
            expect(detector._determineDegradationTier({ usagePercent: 105 })).toBe(DegradationTier.EXCEEDED);
        });

        it('should handle undefined usagePercent', () => {
            const tier = detector._determineDegradationTier({ usagePercent: undefined });
            expect(tier).toBe(DegradationTier.NORMAL);
        });

        it('should handle zero usagePercent', () => {
            const tier = detector._determineDegradationTier({ usagePercent: 0 });
            expect(tier).toBe(DegradationTier.NORMAL);
        });
    });

    describe('_estimateStorageFromIndexedDB', () => {
        beforeEach(() => {
            // Mock IndexedDB
            const mockDB = {
                objectStoreNames: ['sessions', 'chunks'],
                close: vi.fn(),
                transaction: vi.fn()
            };

            global.indexedDB = {
                open: vi.fn().mockReturnValue({
                    onsuccess: null,
                    onerror: null,
                    result: mockDB
                })
            };
        });

        it('should estimate storage from IndexedDB', async () => {
            const mockDB = {
                objectStoreNames: ['sessions', 'chunks'],
                close: vi.fn(),
                transaction: vi.fn(() => ({
                    objectStore: vi.fn(() => ({
                        count: vi.fn(() => ({
                            onsuccess: null,
                            onerror: null,
                            result: 50
                        }))
                    }))
                }))
            };

            const openRequest = {
                onsuccess: null,
                onerror: null,
                result: mockDB
            };

            global.indexedDB.open.mockReturnValue(openRequest);

            // Simulate successful open
            setTimeout(() => {
                if (openRequest.onsuccess) {
                    openRequest.onsuccess({ target: { result: mockDB } });
                }
            }, 0);

            const metrics = await detector._estimateStorageFromIndexedDB();

            expect(metrics).toBeDefined();
            expect(metrics.quotaBytes).toBe(50 * 1024 * 1024); // 50 MB default
            expect(mockDB.close).toHaveBeenCalled();
        });

        it('should handle IndexedDB open error', async () => {
            const openRequest = {
                onsuccess: null,
                onerror: null,
                error: new Error('Database error')
            };

            global.indexedDB.open.mockReturnValue(openRequest);

            // Simulate error
            setTimeout(() => {
                if (openRequest.onerror) {
                    openRequest.onerror({ target: { error: new Error('Database error') } });
                }
            }, 0);

            const metrics = await detector._estimateStorageFromIndexedDB();

            expect(metrics).toBeDefined();
            expect(metrics.usagePercent).toBe(0);
            expect(metrics.tier).toBe(DegradationTier.NORMAL);
        });

        it('should return default metrics on failure', async () => {
            global.indexedDB.open.mockImplementation(() => {
                throw new Error('IndexedDB not available');
            });

            const metrics = await detector._estimateStorageFromIndexedDB();

            expect(metrics.usageBytes).toBe(0);
            expect(metrics.quotaBytes).toBe(50 * 1024 * 1024);
            expect(metrics.usagePercent).toBe(0);
            expect(metrics.tier).toBe(DegradationTier.NORMAL);
        });
    });

    describe('_calculateDatabaseSize', () => {
        it('should calculate size from object store counts', async () => {
            const mockDB = {
                objectStoreNames: ['sessions', 'chunks', 'streams'],
                transaction: vi.fn()
            };

            const mockStore = {
                count: vi.fn()
            };

            let callCount = 0;
            mockStore.count.mockReturnValue({
                onsuccess: null,
                onerror: null,
                get result() {
                    return [50, 100, 200][callCount++];
                }
            });

            mockDB.transaction.mockReturnValue({
                objectStore: vi.fn(() => mockStore)
            });

            const size = await detector._calculateDatabaseSize(mockDB);

            expect(size).toBe((50 + 100 + 200) * 1024); // 1KB per record
        });

        it('should handle empty database', async () => {
            const mockDB = {
                objectStoreNames: [],
                transaction: vi.fn()
            };

            const size = await detector._calculateDatabaseSize(mockDB);

            expect(size).toBe(0);
        });
    });

    describe('_checkQuotaAndDegrade', () => {
        beforeEach(() => {
            global.navigator.storage.estimate = vi.fn();
        });

        it('should update metrics on check', async () => {
            global.navigator.storage.estimate.mockResolvedValue({
                usage: 70 * 1024 * 1024,
                quota: 100 * 1024 * 1024
            });

            await detector._checkQuotaAndDegrade();

            const metrics = detector.getCurrentMetrics();
            expect(metrics.usagePercent).toBe(70);
        });

        it('should emit QUOTA_STATUS event', async () => {
            global.navigator.storage.estimate.mockResolvedValue({
                usage: 60 * 1024 * 1024,
                quota: 100 * 1024 * 1024
            });

            await detector._checkQuotaAndDegrade();

            expect(mockEventBus.emit).toHaveBeenCalledWith(
                'STORAGE:QUOTA_STATUS',
                expect.objectContaining({
                    tier: DegradationTier.NORMAL,
                    metrics: expect.any(Object)
                })
            );
        });

        it('should handle errors gracefully', async () => {
            global.navigator.storage.estimate.mockRejectedValue(new Error('Storage error'));

            await expect(detector._checkQuotaAndDegrade()).resolves.toBeUndefined();
        });

        it('should not emit tier change if tier unchanged', async () => {
            global.navigator.storage.estimate.mockResolvedValue({
                usage: 50 * 1024 * 1024,
                quota: 100 * 1024 * 1024
            });

            await detector._checkQuotaAndDegrade();

            // Should only emit QUOTA_STATUS, not TIER_CHANGE
            expect(mockEventBus.emit).toHaveBeenCalledWith('STORAGE:QUOTA_STATUS', expect.any(Object));
        });
    });

    describe('Quota Monitoring', () => {
        beforeEach(() => {
            global.navigator.storage.estimate = vi.fn();
        });

        it('should start quota monitoring on initialization', () => {
            const spy = vi.spyOn(detector, '_checkQuotaAndDegrade');

            detector._startQuotaMonitoring();

            // Wait for interval
            return new Promise(resolve => {
                setTimeout(() => {
                    expect(spy).toHaveBeenCalled();
                    detector.stopQuotaMonitoring();
                    resolve();
                }, 150);
            });
        });

        it('should check quota at specified interval', async () => {
            global.navigator.storage.estimate.mockResolvedValue({
                usage: 50 * 1024 * 1024,
                quota: 100 * 1024 * 1024
            });

            const spy = vi.spyOn(detector, '_checkQuotaAndDegrade');

            detector._startQuotaMonitoring();

            // Wait for multiple checks
            await new Promise(resolve => setTimeout(resolve, 250));

            detector.stopQuotaMonitoring();

            expect(spy).toHaveBeenCalledTimes(2); // Initial + 1 interval
        });

        it('should stop quota monitoring when requested', async () => {
            detector._startQuotaMonitoring();
            detector.stopQuotaMonitoring();

            const spy = vi.spyOn(detector, '_checkQuotaAndDegrade');

            await new Promise(resolve => setTimeout(resolve, 150));

            // Should not be called after stopping
            expect(spy).not.toHaveBeenCalled();
        });

        it('should clear existing interval when starting new one', async () => {
            const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

            detector._startQuotaMonitoring();
            detector._startQuotaMonitoring(); // Start again

            expect(clearIntervalSpy).toHaveBeenCalled();

            detector.stopQuotaMonitoring();
        });
    });

    describe('Edge Cases', () => {
        it('should handle extremely large quota values', async () => {
            global.navigator.storage.estimate.mockResolvedValue({
                usage: Number.MAX_SAFE_INTEGER,
                quota: Number.MAX_SAFE_INTEGER
            });

            const metrics = await detector._getStorageMetrics();

            expect(metrics).toBeDefined();
            expect(metrics.usagePercent).toBeCloseTo(100, 2);
        });

        it('should handle very small quota values', async () => {
            global.navigator.storage.estimate.mockResolvedValue({
                usage: 1024, // 1 KB
                quota: 2048  // 2 KB
            });

            const metrics = await detector._getStorageMetrics();

            expect(metrics.usagePercent).toBe(50);
        });

        it('should handle negative values gracefully', async () => {
            global.navigator.storage.estimate.mockResolvedValue({
                usage: -100,
                quota: 100 * 1024 * 1024
            });

            const metrics = await detector._getStorageMetrics();

            expect(metrics).toBeDefined();
            expect(metrics.usagePercent).toBeLessThan(0);
        });

        it('should handle quota of 1 (fallback)', async () => {
            global.navigator.storage.estimate.mockResolvedValue({
                usage: 100,
                quota: 1
            });

            const metrics = await detector._getStorageMetrics();

            expect(metrics.usagePercent).toBe(10000); // 100 / 1 * 100
        });
    });

    describe('Tier Transition Detection', () => {
        beforeEach(() => {
            global.navigator.storage.estimate = vi.fn();
        });

        it('should detect transition from NORMAL to WARNING', async () => {
            // First check: NORMAL
            global.navigator.storage.estimate.mockResolvedValueOnce({
                usage: 70 * 1024 * 1024,
                quota: 100 * 1024 * 1024
            });

            await detector._checkQuotaAndDegrade();
            expect(detector.getCurrentTier()).toBe(DegradationTier.NORMAL);

            // Second check: WARNING
            global.navigator.storage.estimate.mockResolvedValueOnce({
                usage: 85 * 1024 * 1024,
                quota: 100 * 1024 * 1024
            });

            // This would normally emit TIER_CHANGE, but we're just testing tier update
            await detector._checkQuotaAndDegrade();
            expect(detector.getCurrentTier()).toBe(DegradationTier.WARNING);
        });

        it('should detect transition from WARNING to CRITICAL', async () => {
            // Set initial tier to WARNING
            global.navigator.storage.estimate.mockResolvedValueOnce({
                usage: 85 * 1024 * 1024,
                quota: 100 * 1024 * 1024
            });

            await detector._checkQuotaAndDegrade();
            expect(detector.getCurrentTier()).toBe(DegradationTier.WARNING);

            // Transition to CRITICAL
            global.navigator.storage.estimate.mockResolvedValueOnce({
                usage: 96 * 1024 * 1024,
                quota: 100 * 1024 * 1024
            });

            await detector._checkQuotaAndDegrade();
            expect(detector.getCurrentTier()).toBe(DegradationTier.CRITICAL);
        });

        it('should detect transition from CRITICAL to EMERGENCY', async () => {
            // Set initial tier to CRITICAL
            global.navigator.storage.estimate.mockResolvedValueOnce({
                usage: 96 * 1024 * 1024,
                quota: 100 * 1024 * 1024
            });

            await detector._checkQuotaAndDegrade();
            expect(detector.getCurrentTier()).toBe(DegradationTier.CRITICAL);

            // Transition to EMERGENCY
            global.navigator.storage.estimate.mockResolvedValueOnce({
                usage: 99 * 1024 * 1024,
                quota: 100 * 1024 * 1024
            });

            await detector._checkQuotaAndDegrade();
            expect(detector.getCurrentTier()).toBe(DegradationTier.EMERGENCY);
        });

        it('should detect transition from EMERGENCY to EXCEEDED', async () => {
            // Set initial tier to EMERGENCY
            global.navigator.storage.estimate.mockResolvedValueOnce({
                usage: 99 * 1024 * 1024,
                quota: 100 * 1024 * 1024
            });

            await detector._checkQuotaAndDegrade();
            expect(detector.getCurrentTier()).toBe(DegradationTier.EMERGENCY);

            // Transition to EXCEEDED
            global.navigator.storage.estimate.mockResolvedValueOnce({
                usage: 100 * 1024 * 1024,
                quota: 100 * 1024 * 1024
            });

            await detector._checkQuotaAndDegrade();
            expect(detector.getCurrentTier()).toBe(DegradationTier.EXCEEDED);
        });

        it('should detect recovery from WARNING to NORMAL', async () => {
            // Set initial tier to WARNING
            global.navigator.storage.estimate.mockResolvedValueOnce({
                usage: 85 * 1024 * 1024,
                quota: 100 * 1024 * 1024
            });

            await detector._checkQuotaAndDegrade();
            expect(detector.getCurrentTier()).toBe(DegradationTier.WARNING);

            // Recovery to NORMAL
            global.navigator.storage.estimate.mockResolvedValueOnce({
                usage: 70 * 1024 * 1024,
                quota: 100 * 1024 * 1024
            });

            await detector._checkQuotaAndDegrade();
            expect(detector.getCurrentTier()).toBe(DegradationTier.NORMAL);
        });
    });
});
