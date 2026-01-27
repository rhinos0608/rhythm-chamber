/**
 * Tier Handlers Tests
 *
 * Comprehensive test suite for tier-specific response handling.
 * Tests tier handlers for WARNING, CRITICAL, EXCEEDED, EMERGENCY, and NORMAL tiers,
 * as well as tier transitions and event emissions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TierHandlers } from '../../../../js/services/storage-degradation/tier-handlers.js';
import { DegradationTier } from '../../../../js/services/storage-degradation/degradation-detector.js';
import { CleanupPriority } from '../../../../js/services/storage-degradation/cleanup-strategies.js';

// Mock EventBus
const mockEventBus = {
    emit: vi.fn(),
    on: vi.fn()
};

// Mock CleanupStrategies
const mockCleanupStrategies = {
    setCurrentTier: vi.fn(),
    setCurrentMetrics: vi.fn(),
    _performCleanup: vi.fn(),
    _performEmergencyCleanup: vi.fn(),
    triggerCleanup: vi.fn()
};

describe('TierHandlers', () => {
    let handlers;

    beforeEach(() => {
        vi.clearAllMocks();
        handlers = new TierHandlers({
            eventBus: mockEventBus,
            cleanupStrategies: mockCleanupStrategies
        });
    });

    describe('Constructor', () => {
        it('should initialize with default options', () => {
            const defaultHandlers = new TierHandlers();
            expect(defaultHandlers).toBeDefined();
        });

        it('should initialize with custom eventBus', () => {
            const customHandlers = new TierHandlers({ eventBus: mockEventBus });
            expect(customHandlers).toBeDefined();
        });

        it('should initialize with custom cleanupStrategies', () => {
            const customHandlers = new TierHandlers({ cleanupStrategies: mockCleanupStrategies });
            expect(customHandlers).toBeDefined();
        });

        it('should initialize mode flags', () => {
            expect(handlers.isEmergencyMode()).toBe(false);
            expect(handlers.isReadOnlyMode()).toBe(false);
        });
    });

    describe('isEmergencyMode', () => {
        it('should return false initially', () => {
            expect(handlers.isEmergencyMode()).toBe(false);
        });

        it('should return true after entering emergency mode', async () => {
            await handlers._handleEmergencyMode();
            expect(handlers.isEmergencyMode()).toBe(true);
        });
    });

    describe('isReadOnlyMode', () => {
        it('should return false initially', () => {
            expect(handlers.isReadOnlyMode()).toBe(false);
        });

        it('should return true after entering critical tier', async () => {
            await handlers._handleCriticalTier();
            expect(handlers.isReadOnlyMode()).toBe(true);
        });
    });

    describe('_handleWarningTier', () => {
        it('should emit warning toast', async () => {
            await handlers._handleWarningTier();

            expect(mockEventBus.emit).toHaveBeenCalledWith('UI:TOAST', expect.objectContaining({
                type: 'warning',
                message: expect.stringContaining('Storage space is getting low')
            }));
        });

        it('should enable aggressive LRU eviction', async () => {
            await handlers._handleWarningTier();

            expect(mockEventBus.emit).toHaveBeenCalledWith('LRU:EVICTION_POLICY', expect.objectContaining({
                mode: 'aggressive',
                targetRatio: 0.7
            }));
        });

        it('should trigger HIGH priority cleanup', async () => {
            mockCleanupStrategies.triggerCleanup.mockResolvedValue({
                success: true,
                bytesFreed: 1024,
                itemsDeleted: 1
            });

            await handlers._handleWarningTier();

            expect(mockCleanupStrategies.triggerCleanup).toHaveBeenCalledWith(CleanupPriority.HIGH);
        });
    });

    describe('_handleCriticalTier', () => {
        it('should emit error toast with actions', async () => {
            await handlers._handleCriticalTier();

            expect(mockEventBus.emit).toHaveBeenCalledWith('UI:TOAST', expect.objectContaining({
                type: 'error',
                message: expect.stringContaining('critically low'),
                actions: expect.arrayContaining([
                    expect.objectContaining({ label: 'Export Data' }),
                    expect.objectContaining({ label: 'Clear Old Sessions' })
                ])
            }));
        });

        it('should enable read-only mode', async () => {
            await handlers._handleCriticalTier();

            expect(mockEventBus.emit).toHaveBeenCalledWith('STORAGE:READ_ONLY_MODE', { enabled: true });
            expect(handlers.isReadOnlyMode()).toBe(true);
        });

        it('should trigger AGGRESSIVE priority cleanup', async () => {
            mockCleanupStrategies.triggerCleanup.mockResolvedValue({
                success: true,
                bytesFreed: 1024,
                itemsDeleted: 1
            });

            await handlers._handleCriticalTier();

            expect(mockCleanupStrategies.triggerCleanup).toHaveBeenCalledWith(CleanupPriority.AGGRESSIVE);
        });
    });

    describe('_handleQuotaExceeded', () => {
        it('should trigger emergency cleanup', async () => {
            mockCleanupStrategies.triggerEmergencyCleanup.mockResolvedValue({
                success: true,
                bytesFreed: 1024,
                itemsDeleted: 1
            });

            await handlers._handleQuotaExceeded();

            expect(mockCleanupStrategies.triggerEmergencyCleanup).toHaveBeenCalled();
        });

        it('should enter emergency mode if cleanup fails', async () => {
            const emergencySpy = vi.spyOn(handlers, '_handleEmergencyMode');

            mockCleanupStrategies.triggerEmergencyCleanup.mockResolvedValue({
                success: false,
                bytesFreed: 0,
                itemsDeleted: 0
            });

            await handlers._handleQuotaExceeded();

            expect(emergencySpy).toHaveBeenCalled();
        });

        it('should enter emergency mode if no space freed', async () => {
            const emergencySpy = vi.spyOn(handlers, '_handleEmergencyMode');

            mockCleanupStrategies.triggerEmergencyCleanup.mockResolvedValue({
                success: true,
                bytesFreed: 0,
                itemsDeleted: 0
            });

            await handlers._handleQuotaExceeded();

            expect(emergencySpy).toHaveBeenCalled();
        });
    });

    describe('_handleEmergencyMode', () => {
        it('should set emergency mode flag', async () => {
            await handlers._handleEmergencyMode();
            expect(handlers.isEmergencyMode()).toBe(true);
        });

        it('should emit emergency modal', async () => {
            await handlers._handleEmergencyMode();

            expect(mockEventBus.emit).toHaveBeenCalledWith('UI:MODAL', expect.objectContaining({
                type: 'emergency',
                title: 'Storage Full - Action Required',
                message: expect.stringContaining('quota has been exceeded'),
                options: expect.arrayContaining([
                    expect.objectContaining({ label: 'Clear Old Data (Keep Active Session)', primary: true }),
                    expect.objectContaining({ label: 'Export and Clear' }),
                    expect.objectContaining({ label: 'Continue in Session-Only Mode' })
                ])
            }));
        });

        it('should pause non-critical operations', async () => {
            await handlers._handleEmergencyMode();

            expect(mockEventBus.emit).toHaveBeenCalledWith('STORAGE:PAUSE_NON_CRITICAL');
        });
    });

    describe('_handleNormalTier', () => {
        beforeEach(() => {
            // Set up emergency and read-only modes
            handlers._isEmergencyMode = true;
            handlers._isReadOnlyMode = true;
        });

        it('should disable emergency mode', async () => {
            await handlers._handleNormalTier();
            expect(handlers.isEmergencyMode()).toBe(false);
        });

        it('should disable read-only mode', async () => {
            await handlers._handleNormalTier();
            expect(handlers.isReadOnlyMode()).toBe(false);
        });

        it('should emit read-only mode disabled', async () => {
            await handlers._handleNormalTier();

            expect(mockEventBus.emit).toHaveBeenCalledWith('STORAGE:READ_ONLY_MODE', { enabled: false });
        });

        it('should resume non-critical operations', async () => {
            await handlers._handleNormalTier();

            expect(mockEventBus.emit).toHaveBeenCalledWith('STORAGE:RESUME_NON_CRITICAL');
        });

        it('should reset LRU eviction to normal', async () => {
            await handlers._handleNormalTier();

            expect(mockEventBus.emit).toHaveBeenCalledWith('LRU:EVICTION_POLICY', {
                mode: 'normal',
                targetRatio: 1.0
            });
        });
    });

    describe('_transitionToTier', () => {
        it('should call appropriate handler for WARNING tier', async () => {
            const warningSpy = vi.spyOn(handlers, '_handleWarningTier');

            await handlers._transitionToTier(DegradationTier.WARNING, DegradationTier.NORMAL);

            expect(warningSpy).toHaveBeenCalled();
        });

        it('should call appropriate handler for CRITICAL tier', async () => {
            const criticalSpy = vi.spyOn(handlers, '_handleCriticalTier');

            await handlers._transitionToTier(DegradationTier.CRITICAL, DegradationTier.WARNING);

            expect(criticalSpy).toHaveBeenCalled();
        });

        it('should call appropriate handler for EXCEEDED tier', async () => {
            const exceededSpy = vi.spyOn(handlers, '_handleQuotaExceeded');

            await handlers._transitionToTier(DegradationTier.EXCEEDED, DegradationTier.CRITICAL);

            expect(exceededSpy).toHaveBeenCalled();
        });

        it('should call appropriate handler for EMERGENCY tier', async () => {
            const emergencySpy = vi.spyOn(handlers, '_handleEmergencyMode');

            await handlers._transitionToTier(DegradationTier.EMERGENCY, DegradationTier.EXCEEDED);

            expect(emergencySpy).toHaveBeenCalled();
        });

        it('should call appropriate handler for NORMAL tier', async () => {
            const normalSpy = vi.spyOn(handlers, '_handleNormalTier');

            await handlers._transitionToTier(DegradationTier.NORMAL, DegradationTier.WARNING);

            expect(normalSpy).toHaveBeenCalled();
        });

        it('should emit tier change event', async () => {
            await handlers._transitionToTier(DegradationTier.CRITICAL, DegradationTier.NORMAL);

            expect(mockEventBus.emit).toHaveBeenCalledWith('STORAGE:TIER_CHANGE', {
                oldTier: DegradationTier.NORMAL,
                newTier: DegradationTier.CRITICAL,
                reason: 'quota_check'
            });
        });
    });

    describe('_onConnectionFailed', () => {
        it('should enter emergency mode', async () => {
            await handlers._onConnectionFailed({
                error: new Error('Connection failed'),
                attempts: 3
            });

            expect(handlers.isEmergencyMode()).toBe(true);
        });

        it('should emit tier change event', async () => {
            await handlers._onConnectionFailed({
                error: new Error('Connection failed'),
                attempts: 3
            });

            expect(mockEventBus.emit).toHaveBeenCalledWith('STORAGE:TIER_CHANGE', expect.objectContaining({
                newTier: DegradationTier.EMERGENCY,
                reason: 'connection_failed'
            }));
        });

        it('should pause non-critical operations', async () => {
            await handlers._onConnectionFailed({
                error: new Error('Connection failed'),
                attempts: 3
            });

            expect(mockEventBus.emit).toHaveBeenCalledWith('STORAGE:PAUSE_NON_CRITICAL');
        });

        it('should emit session-only mode event', async () => {
            await handlers._onConnectionFailed({
                error: new Error('Connection failed'),
                attempts: 3
            });

            expect(mockEventBus.emit).toHaveBeenCalledWith('STORAGE:SESSION_ONLY_MODE', {
                enabled: true,
                reason: 'connection_failed'
            });
        });

        it('should show emergency modal', async () => {
            await handlers._onConnectionFailed({
                error: new Error('Connection failed'),
                attempts: 3
            });

            expect(mockEventBus.emit).toHaveBeenCalledWith('UI:MODAL', expect.objectContaining({
                type: 'emergency',
                title: 'Storage Unavailable'
            }));
        });
    });

    describe('_onStorageWrite', () => {
        it('should update item registry', async () => {
            handlers._itemRegistry = new Map([
                ['test-key', {
                    key: 'test-key',
                    priority: CleanupPriority.MEDIUM,
                    category: 'session',
                    sizeBytes: 0,
                    lastAccessed: Date.now() - 1000
                }]
            ]);

            await handlers._onStorageWrite({
                key: 'test-key',
                size: 2048
            });

            const item = handlers._itemRegistry.get('test-key');
            expect(item.sizeBytes).toBe(2048);
            expect(item.lastAccessed).toBeCloseTo(Date.now(), -2); // Within 100ms
        });
    });

    describe('_onStorageError', () => {
        it('should handle QuotaExceededError', async () => {
            const quotaExceededSpy = vi.spyOn(handlers, '_handleQuotaExceeded');

            await handlers._onStorageError({
                error: {
                    name: 'QuotaExceededError',
                    message: 'Quota exceeded'
                }
            });

            expect(quotaExceededSpy).toHaveBeenCalled();
        });

        it('should handle quota-related errors', async () => {
            const quotaExceededSpy = vi.spyOn(handlers, '_handleQuotaExceeded');

            await handlers._onStorageError({
                error: {
                    name: 'OtherError',
                    message: 'Storage quota is full'
                }
            });

            expect(quotaExceededSpy).toHaveBeenCalled();
        });

        it('should ignore non-quota errors', async () => {
            const quotaExceededSpy = vi.spyOn(handlers, '_handleQuotaExceeded');

            await handlers._onStorageError({
                error: {
                    name: 'NetworkError',
                    message: 'Network disconnected'
                }
            });

            expect(quotaExceededSpy).not.toHaveBeenCalled();
        });
    });

    describe('setCurrentTier', () => {
        it('should update current tier', () => {
            handlers.setCurrentTier(DegradationTier.CRITICAL);
            expect(handlers.getCurrentTier()).toBe(DegradationTier.CRITICAL);
        });
    });

    describe('getCurrentTier', () => {
        it('should return current tier', () => {
            handlers.setCurrentTier(DegradationTier.WARNING);
            expect(handlers.getCurrentTier()).toBe(DegradationTier.WARNING);
        });
    });

    describe('Performance Marking', () => {
        it('should mark tier transition start', async () => {
            const markSpy = vi.spyOn(performance, 'mark');

            await handlers._transitionToTier(DegradationTier.CRITICAL, DegradationTier.NORMAL);

            expect(markSpy).toHaveBeenCalledWith(
                expect.stringContaining('storage-tier-transition')
            );
        });

        it('should measure tier transition duration', async () => {
            const measureSpy = vi.spyOn(performance, 'measure');

            await handlers._transitionToTier(DegradationTier.CRITICAL, DegradationTier.NORMAL);

            expect(measureSpy).toHaveBeenCalledWith(
                expect.stringContaining('storage-tier-'),
                expect.stringContaining('storage-tier-transition-')
            );
        });
    });

    describe('Edge Cases', () => {
        it('should handle missing eventBus gracefully', async () => {
            const noEventBusHandlers = new TierHandlers({ eventBus: null });

            await expect(noEventBusHandlers._handleWarningTier()).resolves.toBeUndefined();
        });

        it('should handle missing cleanupStrategies gracefully', async () => {
            const noCleanupHandlers = new TierHandlers({ cleanupStrategies: null });

            await expect(noCleanupHandlers._handleWarningTier()).resolves.toBeUndefined();
        });

        it('should handle handler errors gracefully', async () => {
            vi.spyOn(handlers, '_handleWarningTier').mockRejectedValue(new Error('Handler error'));

            await expect(handlers._transitionToTier(DegradationTier.WARNING, DegradationTier.NORMAL))
                .resolves.toBeUndefined();
        });
    });
});
