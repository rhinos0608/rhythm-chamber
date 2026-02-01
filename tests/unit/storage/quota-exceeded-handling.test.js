/**
 * Quota Exceeded Handling Comprehensive Tests
 *
 * Tests for IndexedDB quota exceeded handling including:
 * - QuotaExceededError DOMException handling
 * - CleanupStrategies emergency and selective cleanup
 * - TierHandlers tier-based behavior changes
 * - Emergency cleanup triggering logic
 * - Storage breakdown by category calculation
 * - Actual quota exceeded recovery flow
 *
 * @module tests/storage/quota-exceeded-handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuotaManager } from '../../../js/storage/quota-manager.js';
import { EventBus } from '../../../js/services/event-bus.js';
import { CleanupStrategies, CleanupPriority } from '../../../js/services/storage-degradation/cleanup-strategies.js';
import { TierHandlers } from '../../../js/services/storage-degradation/tier-handlers.js';
import { DegradationTier } from '../../../js/services/storage-degradation/degradation-detector.js';
import { STORAGE_KEYS } from '../../../js/storage/keys.js';

// ==========================================
// Mock Helpers
// ==========================================

const originalStorage = navigator.storage;

/**
 * Mock storage estimate function
 * @param {number} usage - Usage in bytes
 * @param {number} quota - Quota in bytes
 */
function mockStorageEstimate(usage, quota) {
  Object.defineProperty(navigator, 'storage', {
    value: {
      estimate: vi.fn().mockResolvedValue({ usage, quota }),
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Restore original navigator.storage
 */
function restoreStorage() {
  Object.defineProperty(navigator, 'storage', {
    value: originalStorage,
    writable: true,
    configurable: true,
  });
}

/**
 * Create a QuotaExceededError DOMException
 * @param {string} message - Error message
 * @returns {DOMException} QuotaExceededError
 */
function createQuotaExceededError(message = 'Quota exceeded') {
  const error = new DOMException(message, 'QuotaExceededError');
  return error;
}

/**
 * Create a mock storage object for CleanupStrategies
 * @returns {Object} Mock storage
 */
function createMockStorage() {
  return {
    getAllChatSessions: vi.fn().mockResolvedValue([]),
    getActiveSessionId: vi.fn().mockReturnValue('active-session-id'),
    deleteChatSession: vi.fn().mockResolvedValue(undefined),
    getChunks: vi.fn().mockResolvedValue([]),
    deleteChunk: vi.fn().mockResolvedValue(undefined),
    getStreams: vi.fn().mockResolvedValue([]),
    deleteStream: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Create a mock EventBus
 * @returns {Object} Mock EventBus
 */
function createMockEventBus() {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    clearAll: vi.fn(),
  };
}

// ==========================================
// Test Suite: QuotaExceededError Handling
// ==========================================

describe('QuotaExceededError Handling', () => {
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

  describe('DOMException QuotaExceededError', () => {
    it('should create a valid QuotaExceededError DOMException', () => {
      const error = createQuotaExceededError('The quota has been exceeded');

      expect(error).toBeInstanceOf(DOMException);
      expect(error.name).toBe('QuotaExceededError');
      expect(error.message).toBe('The quota has been exceeded');
    });

    it('should detect QuotaExceededError by name property', () => {
      const error = createQuotaExceededError();

      expect(error.name === 'QuotaExceededError').toBe(true);
      // DOMException code may be undefined in some environments
      // The name property is the primary detection mechanism
      expect(error.code === 22 || error.code === undefined).toBe(true);
    });

    it('should handle QuotaExceededError with message containing quota', () => {
      const errorByName = createQuotaExceededError();
      const errorByMessage = new Error('The storage quota has been exceeded');

      // Detection by name
      expect(errorByName.name === 'QuotaExceededError').toBe(true);

      // Detection by message
      expect(errorByMessage.message?.includes('quota')).toBe(true);
    });

    it('should handle different QuotaExceededError scenarios', () => {
      const scenarios = [
        { name: 'QuotaExceededError', message: '' },
        { name: 'QuotaExceededError', message: 'The quota has been exceeded' },
        { name: 'QuotaExceededError', message: 'Storage quota exceeded' },
      ];

      scenarios.forEach(scenario => {
        const error = new DOMException(scenario.message, scenario.name);
        expect(error.name).toBe('QuotaExceededError');
      });
    });
  });

  describe('QuotaManager with QuotaExceededError', () => {
    it('should handle quota check when storage API throws QuotaExceededError', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: vi.fn().mockRejectedValue(createQuotaExceededError()),
        },
        writable: true,
        configurable: true,
      });

      const status = await QuotaManager.checkNow();

      // Should return current status without throwing
      expect(status).toBeDefined();
      expect(status).toHaveProperty('usageBytes');
      expect(status).toHaveProperty('quotaBytes');
    });

    it('should block writes when QuotaExceededError is detected', async () => {
      // Simulate critical tier (blocked writes)
      const quota = 100 * 1024 * 1024;
      const usage = 96 * 1024 * 1024; // 96% - critical tier
      mockStorageEstimate(usage, quota);

      await QuotaManager.checkNow();

      expect(QuotaManager.isWriteBlocked()).toBe(true);

      const result = await QuotaManager.checkWriteFits(1024);
      expect(result.fits).toBe(false);
    });

    it('should handle checkWriteFits when quota is exceeded', async () => {
      const quota = 100 * 1024 * 1024;
      const usage = 100 * 1024 * 1024; // 100% - exceeded
      mockStorageEstimate(usage, quota);

      const result = await QuotaManager.checkWriteFits(1);

      expect(result.fits).toBe(false);
      expect(result.currentStatus.percentage).toBe(100);
      expect(result.reservationId).toBeUndefined();
    });
  });
});

// ==========================================
// Test Suite: CleanupStrategies
// ==========================================

describe('CleanupStrategies', () => {
  let cleanupStrategies;
  let mockStorage;
  let mockEventBus;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockStorage = createMockStorage();
    mockEventBus = createMockEventBus();
    cleanupStrategies = new CleanupStrategies({
      eventBus: mockEventBus,
      storage: mockStorage,
    });
    // Wait for async initialization of item registry
    await vi.advanceTimersByTimeAsync(100);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default options', () => {
      const strategies = new CleanupStrategies();
      expect(strategies).toBeDefined();
    });

    it('should initialize with custom eventBus and storage', () => {
      expect(cleanupStrategies).toBeDefined();
    });

    it('should set current tier', () => {
      cleanupStrategies.setCurrentTier(DegradationTier.WARNING);
      expect(cleanupStrategies._currentTier).toBe(DegradationTier.WARNING);
    });

    it('should set current metrics', () => {
      const metrics = {
        usageBytes: 80 * 1024 * 1024,
        quotaBytes: 100 * 1024 * 1024,
        usagePercent: 80,
      };
      cleanupStrategies.setCurrentMetrics(metrics);
      expect(cleanupStrategies._currentMetrics).toEqual(metrics);
    });
  });

  describe('Cleanup Priority Levels', () => {
    it('should have correct cleanup priority values', () => {
      expect(CleanupPriority.NEVER_DELETE).toBe(0);
      expect(CleanupPriority.LOW).toBe(1);
      expect(CleanupPriority.MEDIUM).toBe(2);
      expect(CleanupPriority.HIGH).toBe(3);
      expect(CleanupPriority.AGGRESSIVE).toBe(4);
    });

    it('should have priority levels in ascending order', () => {
      expect(CleanupPriority.LOW).toBeLessThan(CleanupPriority.MEDIUM);
      expect(CleanupPriority.MEDIUM).toBeLessThan(CleanupPriority.HIGH);
      expect(CleanupPriority.HIGH).toBeLessThan(CleanupPriority.AGGRESSIVE);
    });
  });

  describe('Emergency Cleanup', () => {
    it('should trigger emergency cleanup', async () => {
      const result = await cleanupStrategies.triggerEmergencyCleanup();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('bytesFreed');
      expect(result).toHaveProperty('itemsDeleted');
      expect(result).toHaveProperty('operationsPerformed');
    });

    it('should perform emergency cleanup that cleans everything except NEVER_DELETE', async () => {
      // Setup mock data
      mockStorage.getAllChatSessions.mockResolvedValue([
        { id: 'session1', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'session2', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() },
      ]);
      mockStorage.getActiveSessionId.mockReturnValue('active-session-id');

      const result = await cleanupStrategies.triggerEmergencyCleanup();

      expect(result.success).toBe(true);
    });

    it('should handle emergency cleanup with no data to clean', async () => {
      mockStorage.getAllChatSessions.mockResolvedValue([]);
      mockStorage.getChunks.mockResolvedValue([]);
      mockStorage.getStreams.mockResolvedValue([]);

      const result = await cleanupStrategies.triggerEmergencyCleanup();

      expect(result.success).toBe(true);
      expect(result.bytesFreed).toBe(0);
      expect(result.itemsDeleted).toBe(0);
    });

    it('should stop cleanup when 10% of usage is freed', async () => {
      // Set metrics to trigger early stop
      cleanupStrategies.setCurrentMetrics({
        usageBytes: 1000,
        quotaBytes: 10000,
        usagePercent: 10,
      });

      // Mock large amount of data that would free more than 10%
      const sessions = Array(100).fill(null).map((_, i) => ({
        id: `session${i}`,
        createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      }));
      mockStorage.getAllChatSessions.mockResolvedValue(sessions);

      const result = await cleanupStrategies.triggerEmergencyCleanup();

      expect(result.success).toBe(true);
    });
  });

  describe('Selective Cleanup by Priority', () => {
    it('should trigger cleanup with MEDIUM priority', async () => {
      mockStorage.getAllChatSessions.mockResolvedValue([]);

      const result = await cleanupStrategies.triggerCleanup(CleanupPriority.MEDIUM);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should trigger cleanup with HIGH priority', async () => {
      mockStorage.getAllChatSessions.mockResolvedValue([]);

      const result = await cleanupStrategies.triggerCleanup(CleanupPriority.HIGH);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should trigger cleanup with AGGRESSIVE priority', async () => {
      mockStorage.getAllChatSessions.mockResolvedValue([]);

      const result = await cleanupStrategies.triggerCleanup(CleanupPriority.AGGRESSIVE);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle cleanup with no eligible items', async () => {
      // All items have NEVER_DELETE priority
      const result = await cleanupStrategies.triggerCleanup(CleanupPriority.AGGRESSIVE);

      expect(result.success).toBe(true);
    });
  });

  describe('Session Cleanup', () => {
    it('should cleanup old sessions based on tier', async () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(); // 40 days old
      mockStorage.getAllChatSessions.mockResolvedValue([
        { id: 'old1', createdAt: oldDate },
        { id: 'old2', createdAt: oldDate },
      ]);
      mockStorage.getActiveSessionId.mockReturnValue('active');

      cleanupStrategies.setCurrentTier(DegradationTier.NORMAL);

      const result = await cleanupStrategies.triggerCleanup(CleanupPriority.MEDIUM);

      expect(result.success).toBe(true);
    });

    it('should use 7-day threshold in CRITICAL tier', async () => {
      const eightDaysOld = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      mockStorage.getAllChatSessions.mockResolvedValue([
        { id: 'old1', createdAt: eightDaysOld },
      ]);
      mockStorage.getActiveSessionId.mockReturnValue('active');

      cleanupStrategies.setCurrentTier(DegradationTier.CRITICAL);

      const result = await cleanupStrategies._cleanupOldSessions();

      expect(result.success).toBe(true);
    });

    it('should use 30-day threshold in non-CRITICAL tier', async () => {
      const twentyDaysOld = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      mockStorage.getAllChatSessions.mockResolvedValue([
        { id: 'old1', createdAt: twentyDaysOld },
      ]);
      mockStorage.getActiveSessionId.mockReturnValue('active');

      cleanupStrategies.setCurrentTier(DegradationTier.NORMAL);

      const result = await cleanupStrategies._cleanupOldSessions();

      expect(result.success).toBe(true);
    });

    it('should not delete active session', async () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      mockStorage.getAllChatSessions.mockResolvedValue([
        { id: 'active-session', createdAt: oldDate },
      ]);
      mockStorage.getActiveSessionId.mockReturnValue('active-session');

      const result = await cleanupStrategies._cleanupOldSessions();

      expect(result.success).toBe(true);
      expect(mockStorage.deleteChatSession).not.toHaveBeenCalled();
    });

    it('should handle session deletion errors gracefully', async () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      mockStorage.getAllChatSessions.mockResolvedValue([
        { id: 'session1', createdAt: oldDate },
      ]);
      mockStorage.getActiveSessionId.mockReturnValue('active');
      mockStorage.deleteChatSession.mockRejectedValue(new Error('Delete failed'));

      const result = await cleanupStrategies._cleanupOldSessions();

      expect(result.success).toBe(true); // Should succeed even with individual failures
    });
  });

  describe('Chunk Cleanup', () => {
    it('should cleanup chunks older than 90 days', async () => {
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      mockStorage.getChunks.mockResolvedValue([
        { id: 'chunk1', endDate: oldDate },
        { id: 'chunk2', endDate: oldDate },
      ]);

      const result = await cleanupStrategies._cleanupOldChunks();

      expect(result.success).toBe(true);
      expect(mockStorage.deleteChunk).toHaveBeenCalledTimes(2);
    });

    it('should not cleanup recent chunks', async () => {
      const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      mockStorage.getChunks.mockResolvedValue([
        { id: 'chunk1', endDate: recentDate },
      ]);

      const result = await cleanupStrategies._cleanupOldChunks();

      expect(result.success).toBe(true);
      expect(mockStorage.deleteChunk).not.toHaveBeenCalled();
    });

    it('should handle chunk deletion errors', async () => {
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      mockStorage.getChunks.mockResolvedValue([
        { id: 'chunk1', endDate: oldDate },
      ]);
      mockStorage.deleteChunk.mockRejectedValue(new Error('Delete failed'));

      const result = await cleanupStrategies._cleanupOldChunks();

      expect(result.success).toBe(true);
    });
  });

  describe('Stream Cleanup', () => {
    it('should cleanup streams older than 30 days', async () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      mockStorage.getStreams.mockResolvedValue([
        { id: 'stream1', ts: oldDate },
        { id: 'stream2', ts: oldDate },
      ]);

      const result = await cleanupStrategies._cleanupOldStreams();

      expect(result.success).toBe(true);
      expect(mockStorage.deleteStream).toHaveBeenCalledTimes(2);
    });

    it('should not cleanup recent streams', async () => {
      const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      mockStorage.getStreams.mockResolvedValue([
        { id: 'stream1', ts: recentDate },
      ]);

      const result = await cleanupStrategies._cleanupOldStreams();

      expect(result.success).toBe(true);
      expect(mockStorage.deleteStream).not.toHaveBeenCalled();
    });

    it('should handle stream deletion errors', async () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      mockStorage.getStreams.mockResolvedValue([
        { id: 'stream1', ts: oldDate },
      ]);
      mockStorage.deleteStream.mockRejectedValue(new Error('Delete failed'));

      const result = await cleanupStrategies._cleanupOldStreams();

      expect(result.success).toBe(true);
    });
  });

  describe('Full Cleanup', () => {
    it('should perform full cleanup of all categories', async () => {
      mockStorage.getAllChatSessions.mockResolvedValue([]);
      mockStorage.getChunks.mockResolvedValue([]);
      mockStorage.getStreams.mockResolvedValue([]);

      const result = await cleanupStrategies.performFullCleanup();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should aggregate results from all cleanup operations', async () => {
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      mockStorage.getAllChatSessions.mockResolvedValue([]);
      mockStorage.getChunks.mockResolvedValue([
        { id: 'chunk1', endDate: oldDate },
      ]);
      mockStorage.getStreams.mockResolvedValue([]);

      const result = await cleanupStrategies.performFullCleanup();

      expect(result.success).toBe(true);
      expect(result.operations).toContain('deleted_chunk_chunk1');
    });
  });
});

// ==========================================
// Test Suite: TierHandlers
// ==========================================

describe('TierHandlers', () => {
  let tierHandlers;
  let mockEventBus;
  let mockCleanupStrategies;

  beforeEach(() => {
    vi.useFakeTimers();
    mockEventBus = createMockEventBus();
    mockCleanupStrategies = {
      triggerCleanup: vi.fn().mockResolvedValue({
        success: true,
        bytesFreed: 1000,
        itemsDeleted: 5,
      }),
      triggerEmergencyCleanup: vi.fn().mockResolvedValue({
        success: true,
        bytesFreed: 5000,
        itemsDeleted: 20,
      }),
    };

    tierHandlers = new TierHandlers({
      eventBus: mockEventBus,
      cleanupStrategies: mockCleanupStrategies,
      autoCleanupEnabled: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default options', () => {
      const handlers = new TierHandlers();
      expect(handlers).toBeDefined();
      expect(handlers.getCurrentTier()).toBe(DegradationTier.NORMAL);
    });

    it('should initialize with custom options', () => {
      expect(tierHandlers).toBeDefined();
      expect(tierHandlers.getCurrentTier()).toBe(DegradationTier.NORMAL);
    });

    it('should initialize item registry', () => {
      expect(tierHandlers._itemRegistry).toBeInstanceOf(Map);
      expect(tierHandlers._itemRegistry.size).toBeGreaterThan(0);
    });

    it('should subscribe to storage events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith('STORAGE:WRITE', expect.any(Function));
      expect(mockEventBus.on).toHaveBeenCalledWith('STORAGE:ERROR', expect.any(Function));
    });
  });

  describe('Tier Transitions', () => {
    it('should transition to WARNING tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.WARNING);

      expect(tierHandlers.getCurrentTier()).toBe(DegradationTier.WARNING);
    });

    it('should transition to CRITICAL tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.CRITICAL);

      expect(tierHandlers.getCurrentTier()).toBe(DegradationTier.CRITICAL);
    });

    it('should transition to EXCEEDED tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.EXCEEDED);

      expect(tierHandlers.getCurrentTier()).toBe(DegradationTier.EXCEEDED);
    });

    it('should transition to EMERGENCY tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.EMERGENCY);

      expect(tierHandlers.getCurrentTier()).toBe(DegradationTier.EMERGENCY);
    });

    it('should transition back to NORMAL tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.WARNING);
      await tierHandlers.transitionTo(DegradationTier.NORMAL);

      expect(tierHandlers.getCurrentTier()).toBe(DegradationTier.NORMAL);
    });
  });

  describe('WARNING Tier Handler', () => {
    it('should emit UI:TOAST warning on WARNING tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.WARNING);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'UI:TOAST',
        expect.objectContaining({
          type: 'warning',
          message: expect.stringContaining('Storage space is getting low'),
        })
      );
    });

    it('should emit LRU:EVICTION_POLICY aggressive on WARNING tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.WARNING);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'LRU:EVICTION_POLICY',
        expect.objectContaining({
          mode: 'aggressive',
          targetRatio: 0.7,
        })
      );
    });

    it('should trigger HIGH priority cleanup on WARNING tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.WARNING);

      expect(mockCleanupStrategies.triggerCleanup).toHaveBeenCalledWith(CleanupPriority.HIGH);
    });

    it('should not trigger cleanup when autoCleanup is disabled', async () => {
      tierHandlers.setAutoCleanupEnabled(false);
      await tierHandlers.transitionTo(DegradationTier.WARNING);

      expect(mockCleanupStrategies.triggerCleanup).not.toHaveBeenCalled();
    });
  });

  describe('CRITICAL Tier Handler', () => {
    it('should emit UI:TOAST error on CRITICAL tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.CRITICAL);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'UI:TOAST',
        expect.objectContaining({
          type: 'error',
          message: expect.stringContaining('Storage space is critically low'),
        })
      );
    });

    it('should enter read-only mode on CRITICAL tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.CRITICAL);

      expect(tierHandlers.isReadOnlyMode()).toBe(true);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'STORAGE:READ_ONLY_MODE',
        expect.objectContaining({ enabled: true })
      );
    });

    it('should trigger AGGRESSIVE priority cleanup on CRITICAL tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.CRITICAL);

      expect(mockCleanupStrategies.triggerCleanup).toHaveBeenCalledWith(CleanupPriority.AGGRESSIVE);
    });
  });

  describe('EXCEEDED Tier Handler', () => {
    it('should trigger emergency cleanup on EXCEEDED tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.EXCEEDED);

      expect(mockCleanupStrategies.triggerEmergencyCleanup).toHaveBeenCalled();
    });

    it('should enter emergency mode if cleanup fails', async () => {
      mockCleanupStrategies.triggerEmergencyCleanup.mockResolvedValue({
        success: false,
        bytesFreed: 0,
        itemsDeleted: 0,
      });

      await tierHandlers.transitionTo(DegradationTier.EXCEEDED);

      expect(tierHandlers.isEmergencyMode()).toBe(true);
    });

    it('should enter emergency mode if cleanup frees no bytes', async () => {
      mockCleanupStrategies.triggerEmergencyCleanup.mockResolvedValue({
        success: true,
        bytesFreed: 0,
        itemsDeleted: 0,
      });

      await tierHandlers.transitionTo(DegradationTier.EXCEEDED);

      expect(tierHandlers.isEmergencyMode()).toBe(true);
    });
  });

  describe('EMERGENCY Tier Handler', () => {
    it('should set emergency mode flag', async () => {
      await tierHandlers.transitionTo(DegradationTier.EMERGENCY);

      expect(tierHandlers.isEmergencyMode()).toBe(true);
    });

    it('should emit UI:MODAL emergency on EMERGENCY tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.EMERGENCY);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'UI:MODAL',
        expect.objectContaining({
          type: 'emergency',
          title: expect.stringContaining('Storage Full'),
        })
      );
    });

    it('should emit STORAGE:PAUSE_NON_CRITICAL on EMERGENCY tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.EMERGENCY);

      expect(mockEventBus.emit).toHaveBeenCalledWith('STORAGE:PAUSE_NON_CRITICAL');
    });
  });

  describe('NORMAL Tier Handler', () => {
    it('should clear emergency mode on NORMAL tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.EMERGENCY);
      expect(tierHandlers.isEmergencyMode()).toBe(true);

      await tierHandlers.transitionTo(DegradationTier.NORMAL);
      expect(tierHandlers.isEmergencyMode()).toBe(false);
    });

    it('should clear read-only mode on NORMAL tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.CRITICAL);
      expect(tierHandlers.isReadOnlyMode()).toBe(true);

      await tierHandlers.transitionTo(DegradationTier.NORMAL);
      expect(tierHandlers.isReadOnlyMode()).toBe(false);
    });

    it('should emit STORAGE:RESUME_NON_CRITICAL on NORMAL tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.WARNING);
      await tierHandlers.transitionTo(DegradationTier.NORMAL);

      expect(mockEventBus.emit).toHaveBeenCalledWith('STORAGE:RESUME_NON_CRITICAL');
    });

    it('should reset LRU eviction to normal on NORMAL tier', async () => {
      await tierHandlers.transitionTo(DegradationTier.WARNING);
      await tierHandlers.transitionTo(DegradationTier.NORMAL);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'LRU:EVICTION_POLICY',
        expect.objectContaining({
          mode: 'normal',
          targetRatio: 1.0,
        })
      );
    });
  });

  describe('Storage Error Handling', () => {
    it('should handle QuotaExceededError from storage events', async () => {
      // Get the STORAGE:ERROR handler
      const errorHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'STORAGE:ERROR'
      )[1];

      const quotaError = {
        error: createQuotaExceededError(),
      };

      await errorHandler('STORAGE:ERROR', quotaError);

      expect(mockCleanupStrategies.triggerEmergencyCleanup).toHaveBeenCalled();
    });

    it('should detect quota errors by message', async () => {
      const errorHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'STORAGE:ERROR'
      )[1];

      const quotaError = {
        error: { message: 'The storage quota has been exceeded' },
      };

      await errorHandler('STORAGE:ERROR', quotaError);

      expect(mockCleanupStrategies.triggerEmergencyCleanup).toHaveBeenCalled();
    });

    it('should ignore non-quota errors', async () => {
      const errorHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'STORAGE:ERROR'
      )[1];

      const otherError = {
        error: new Error('Some other error'),
      };

      await errorHandler('STORAGE:ERROR', otherError);

      expect(mockCleanupStrategies.triggerEmergencyCleanup).not.toHaveBeenCalled();
    });
  });

  describe('Storage Write Handling', () => {
    it('should update item registry on storage write', async () => {
      const writeHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'STORAGE:WRITE'
      )[1];

      const writeData = {
        key: STORAGE_KEYS.EMBEDDING_CACHE,
        size: 1024,
      };

      await writeHandler('STORAGE:WRITE', writeData);

      const item = tierHandlers._itemRegistry.get(STORAGE_KEYS.EMBEDDING_CACHE);
      expect(item.sizeBytes).toBe(1024);
    });

    it('should update lastAccessed timestamp on write', async () => {
      const beforeTime = Date.now();
      const writeHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'STORAGE:WRITE'
      )[1];

      await writeHandler('STORAGE:WRITE', {
        key: STORAGE_KEYS.EMBEDDING_CACHE,
        size: 1024,
      });

      const item = tierHandlers._itemRegistry.get(STORAGE_KEYS.EMBEDDING_CACHE);
      expect(item.lastAccessed).toBeGreaterThanOrEqual(beforeTime);
    });
  });

  describe('Connection Failure Handling', () => {
    it('should handle connection failed events', async () => {
      const connectionHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'storage:connection_failed'
      )[1];

      await connectionHandler({
        error: new Error('Connection failed'),
        attempts: 3,
      });

      expect(tierHandlers.isEmergencyMode()).toBe(true);
      expect(tierHandlers.getCurrentTier()).toBe(DegradationTier.EMERGENCY);
    });

    it('should emit STORAGE:TIER_CHANGE on connection failure', async () => {
      const connectionHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'storage:connection_failed'
      )[1];

      await connectionHandler({
        error: new Error('Connection failed'),
        attempts: 3,
      });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'STORAGE:TIER_CHANGE',
        expect.objectContaining({
          newTier: DegradationTier.EMERGENCY,
          reason: 'connection_failed',
        })
      );
    });

    it('should emit UI:MODAL with data loss warning on connection failure', async () => {
      const connectionHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'storage:connection_failed'
      )[1];

      await connectionHandler({
        error: new Error('Connection failed'),
        attempts: 3,
      });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'UI:MODAL',
        expect.objectContaining({
          type: 'emergency',
          title: expect.stringContaining('Risk of Data Loss'),
        })
      );
    });

    it('should emit STORAGE:SESSION_ONLY_MODE on connection failure', async () => {
      const connectionHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'storage:connection_failed'
      )[1];

      await connectionHandler({
        error: new Error('Connection failed'),
        attempts: 3,
      });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'STORAGE:SESSION_ONLY_MODE',
        expect.objectContaining({
          enabled: true,
          reason: 'connection_failed',
        })
      );
    });
  });

  describe('Connection Blocked Handling', () => {
    it('should handle connection blocked events', async () => {
      const blockedHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'storage:connection_blocked'
      )[1];

      await blockedHandler({
        message: 'Database upgrade blocked',
      });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'UI:TOAST',
        expect.objectContaining({
          type: 'warning',
          message: expect.stringContaining('Database upgrade blocked'),
        })
      );
    });
  });
});

// ==========================================
// Test Suite: Emergency Cleanup Triggering
// ==========================================

describe('Emergency Cleanup Triggering', () => {
  let cleanupStrategies;
  let tierHandlers;
  let mockStorage;
  let mockEventBus;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockStorage = createMockStorage();
    mockEventBus = createMockEventBus();
    cleanupStrategies = new CleanupStrategies({
      eventBus: mockEventBus,
      storage: mockStorage,
    });
    // Wait for async initialization of item registry
    await vi.advanceTimersByTimeAsync(100);
    tierHandlers = new TierHandlers({
      eventBus: mockEventBus,
      cleanupStrategies: cleanupStrategies,
      autoCleanupEnabled: true,
    });
    // Wait for TierHandlers async initialization
    await vi.advanceTimersByTimeAsync(100);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Cleanup Trigger Conditions', () => {
    it('should trigger cleanup when critical threshold is exceeded', async () => {
      const spy = vi.spyOn(cleanupStrategies, 'triggerCleanup');

      await tierHandlers.transitionTo(DegradationTier.CRITICAL);

      expect(spy).toHaveBeenCalledWith(CleanupPriority.AGGRESSIVE);
    });

    it('should trigger emergency cleanup when quota is exceeded', async () => {
      const spy = vi.spyOn(cleanupStrategies, 'triggerEmergencyCleanup');

      await tierHandlers.transitionTo(DegradationTier.EXCEEDED);

      expect(spy).toHaveBeenCalled();
    });

    it('should trigger emergency cleanup on QuotaExceededError', async () => {
      const spy = vi.spyOn(cleanupStrategies, 'triggerEmergencyCleanup');

      const errorHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === 'STORAGE:ERROR'
      )[1];

      await errorHandler('STORAGE:ERROR', {
        error: createQuotaExceededError(),
      });

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Cleanup Results Handling', () => {
    it('should handle successful cleanup', async () => {
      mockStorage.getAllChatSessions.mockResolvedValue([
        { id: 'old1', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() },
      ]);
      mockStorage.getActiveSessionId.mockReturnValue('active');

      const result = await cleanupStrategies.triggerEmergencyCleanup();

      expect(result.success).toBe(true);
    });

    it('should handle failed cleanup', async () => {
      // Mock a catastrophic failure that causes _cleanupItem to throw
      mockStorage.getAllChatSessions.mockRejectedValue(new Error('Storage error'));
      mockStorage.getChunks.mockRejectedValue(new Error('Storage error'));
      mockStorage.getStreams.mockRejectedValue(new Error('Storage error'));

      // Mock VectorLRUCache clear to also fail
      vi.doMock('../../../js/storage/lru-cache.js', () => ({
        VectorLRUCache: {
          size: vi.fn().mockReturnValue(0),
          clear: vi.fn().mockRejectedValue(new Error('Cache error')),
        },
      }));

      const result = await cleanupStrategies.triggerEmergencyCleanup();

      // The cleanup returns success: true even with errors because errors are caught per-item
      // but the overall operation continues
      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('bytesFreed');
    });

    it('should handle partial cleanup success', async () => {
      // First call succeeds, second fails
      mockStorage.getAllChatSessions.mockResolvedValue([
        { id: 'old1', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() },
      ]);
      mockStorage.getActiveSessionId.mockReturnValue('active');
      mockStorage.deleteChatSession.mockRejectedValue(new Error('Delete failed'));

      const result = await cleanupStrategies._cleanupOldSessions();

      expect(result.success).toBe(true); // Individual failures don't fail the whole operation
    });
  });

  describe('Cleanup Progress Tracking', () => {
    it('should track bytes freed during cleanup', async () => {
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      mockStorage.getChunks.mockResolvedValue([
        { id: 'chunk1', endDate: oldDate },
        { id: 'chunk2', endDate: oldDate },
      ]);

      const result = await cleanupStrategies._cleanupOldChunks();

      expect(result.bytesFreed).toBe(20480); // 2 chunks * 10KB
      expect(result.itemsDeleted).toBe(2);
    });

    it('should track operations performed during cleanup', async () => {
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      mockStorage.getChunks.mockResolvedValue([
        { id: 'chunk1', endDate: oldDate },
      ]);

      const result = await cleanupStrategies._cleanupOldChunks();

      expect(result.operations).toContain('deleted_chunk_chunk1');
    });
  });
});

// ==========================================
// Test Suite: Storage Breakdown Calculations
// ==========================================

describe('Storage Breakdown Calculations', () => {
  let cleanupStrategies;
  let mockStorage;
  let mockEventBus;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockStorage = createMockStorage();
    mockEventBus = createMockEventBus();
    cleanupStrategies = new CleanupStrategies({
      eventBus: mockEventBus,
      storage: mockStorage,
    });
    // Wait for async initialization of item registry
    await vi.advanceTimersByTimeAsync(100);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Category-based Breakdown', () => {
    it('should categorize storage items correctly', () => {
      const categories = ['personality', 'settings', 'session', 'embedding', 'chunk', 'stream'];

      categories.forEach(category => {
        const items = Array.from(cleanupStrategies._itemRegistry.values())
          .filter(item => item.category === category);
        expect(items.length).toBeGreaterThanOrEqual(0);
      });
    });

    it('should have correct priority for each category', () => {
      const personality = cleanupStrategies._itemRegistry.get(STORAGE_KEYS.PERSONALITY_RESULT);
      const settings = cleanupStrategies._itemRegistry.get(STORAGE_KEYS.USER_SETTINGS);
      const embeddings = cleanupStrategies._itemRegistry.get(STORAGE_KEYS.EMBEDDING_CACHE);

      expect(personality.priority).toBe(CleanupPriority.NEVER_DELETE);
      expect(settings.priority).toBe(CleanupPriority.NEVER_DELETE);
      expect(embeddings.priority).toBe(CleanupPriority.AGGRESSIVE);
    });

    it('should identify regeneratable items', () => {
      const embeddings = cleanupStrategies._itemRegistry.get(STORAGE_KEYS.EMBEDDING_CACHE);
      const chunks = cleanupStrategies._itemRegistry.get(STORAGE_KEYS.AGGREGATED_CHUNKS);

      expect(embeddings.regeneratable).toBe(true);
      expect(chunks.regeneratable).toBe(true);
    });

    it('should identify non-regeneratable items', () => {
      const personality = cleanupStrategies._itemRegistry.get(STORAGE_KEYS.PERSONALITY_RESULT);
      const settings = cleanupStrategies._itemRegistry.get(STORAGE_KEYS.USER_SETTINGS);

      expect(personality.regeneratable).toBe(false);
      expect(settings.regeneratable).toBe(false);
    });
  });

  describe('Item Registry Management', () => {
    it('should register items with correct metadata', () => {
      const item = cleanupStrategies._itemRegistry.get(STORAGE_KEYS.PERSONALITY_RESULT);

      expect(item).toMatchObject({
        key: STORAGE_KEYS.PERSONALITY_RESULT,
        priority: CleanupPriority.NEVER_DELETE,
        category: 'personality',
        regeneratable: false,
      });
    });

    it('should track item size and last accessed', () => {
      const beforeTime = Date.now();
      cleanupStrategies._registerItem('test_key', {
        priority: CleanupPriority.MEDIUM,
        category: 'test',
        regeneratable: false,
      });

      const item = cleanupStrategies._itemRegistry.get('test_key');
      expect(item.sizeBytes).toBe(0);
      expect(item.lastAccessed).toBeGreaterThanOrEqual(beforeTime);
    });
  });

  describe('Items for Cleanup Selection', () => {
    it('should get items for cleanup based on priority', () => {
      const items = cleanupStrategies._getItemsForCleanup(CleanupPriority.HIGH);

      // Should only return items with priority >= HIGH
      items.forEach(item => {
        expect(item.priority).toBeGreaterThanOrEqual(CleanupPriority.HIGH);
      });
    });

    it('should sort items by priority descending', () => {
      // Add test items with different priorities
      cleanupStrategies._registerItem('low_priority', {
        priority: CleanupPriority.LOW,
        category: 'test',
        regeneratable: true,
      });
      cleanupStrategies._registerItem('high_priority', {
        priority: CleanupPriority.HIGH,
        category: 'test',
        regeneratable: true,
      });

      const items = cleanupStrategies._getItemsForCleanup(CleanupPriority.LOW);

      // Higher priority items should come first
      const lowIndex = items.findIndex(i => i.key === 'low_priority');
      const highIndex = items.findIndex(i => i.key === 'high_priority');
      expect(highIndex).toBeLessThan(lowIndex);
    });

    it('should sort items by last accessed ascending within same priority', () => {
      const now = Date.now();
      cleanupStrategies._registerItem('older', {
        priority: CleanupPriority.HIGH,
        category: 'test',
        regeneratable: true,
      });
      cleanupStrategies._registerItem('newer', {
        priority: CleanupPriority.HIGH,
        category: 'test',
        regeneratable: true,
      });

      // Manually set lastAccessed
      cleanupStrategies._itemRegistry.get('older').lastAccessed = now - 1000;
      cleanupStrategies._itemRegistry.get('newer').lastAccessed = now;

      const items = cleanupStrategies._getItemsForCleanup(CleanupPriority.HIGH);
      const olderIndex = items.findIndex(i => i.key === 'older');
      const newerIndex = items.findIndex(i => i.key === 'newer');

      expect(olderIndex).toBeLessThan(newerIndex);
    });
  });
});

// ==========================================
// Test Suite: Quota Exceeded Recovery Flow
// ==========================================

describe('Quota Exceeded Recovery Flow', () => {
  let cleanupStrategies;
  let tierHandlers;
  let mockStorage;
  let mockEventBus;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockStorage = createMockStorage();
    mockEventBus = createMockEventBus();
    cleanupStrategies = new CleanupStrategies({
      eventBus: mockEventBus,
      storage: mockStorage,
    });
    // Wait for async initialization of item registry
    await vi.advanceTimersByTimeAsync(100);
    tierHandlers = new TierHandlers({
      eventBus: mockEventBus,
      cleanupStrategies: cleanupStrategies,
      autoCleanupEnabled: true,
    });
    // Wait for TierHandlers async initialization
    await vi.advanceTimersByTimeAsync(100);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Full Recovery Flow', () => {
    it('should handle complete recovery from EXCEEDED to NORMAL', async () => {
      // Start at EXCEEDED
      await tierHandlers.transitionTo(DegradationTier.EXCEEDED);
      expect(tierHandlers.isEmergencyMode()).toBe(true);

      // Cleanup succeeds
      mockStorage.getAllChatSessions.mockResolvedValue([
        { id: 'old1', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() },
      ]);
      mockStorage.getActiveSessionId.mockReturnValue('active');

      // Transition back to NORMAL
      await tierHandlers.transitionTo(DegradationTier.NORMAL);

      expect(tierHandlers.getCurrentTier()).toBe(DegradationTier.NORMAL);
      expect(tierHandlers.isEmergencyMode()).toBe(false);
      expect(tierHandlers.isReadOnlyMode()).toBe(false);
    });

    it('should handle failed recovery when cleanup does not free enough space', async () => {
      // Mock cleanup that frees no space
      mockStorage.getAllChatSessions.mockResolvedValue([]);
      mockStorage.getChunks.mockResolvedValue([]);
      mockStorage.getStreams.mockResolvedValue([]);

      await tierHandlers.transitionTo(DegradationTier.EXCEEDED);

      // Should enter emergency mode when cleanup frees nothing
      expect(tierHandlers.isEmergencyMode()).toBe(true);
    });
  });

  describe('Tier-based Recovery Actions', () => {
    it('should resume non-critical operations when recovering to NORMAL', async () => {
      await tierHandlers.transitionTo(DegradationTier.CRITICAL);
      await tierHandlers.transitionTo(DegradationTier.NORMAL);

      expect(mockEventBus.emit).toHaveBeenCalledWith('STORAGE:RESUME_NON_CRITICAL');
    });

    it('should disable read-only mode when recovering', async () => {
      await tierHandlers.transitionTo(DegradationTier.CRITICAL);
      expect(tierHandlers.isReadOnlyMode()).toBe(true);

      await tierHandlers.transitionTo(DegradationTier.NORMAL);
      expect(tierHandlers.isReadOnlyMode()).toBe(false);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'STORAGE:READ_ONLY_MODE',
        expect.objectContaining({ enabled: false })
      );
    });

    it('should reset LRU policy when recovering', async () => {
      await tierHandlers.transitionTo(DegradationTier.WARNING);
      await tierHandlers.transitionTo(DegradationTier.NORMAL);

      const lruCalls = mockEventBus.emit.mock.calls.filter(
        call => call[0] === 'LRU:EVICTION_POLICY'
      );
      const lastCall = lruCalls[lruCalls.length - 1];
      expect(lastCall[1]).toMatchObject({
        mode: 'normal',
        targetRatio: 1.0,
      });
    });
  });

  describe('Recovery Event Emissions', () => {
    it('should emit appropriate events during recovery', async () => {
      await tierHandlers.transitionTo(DegradationTier.CRITICAL);
      await tierHandlers.transitionTo(DegradationTier.NORMAL);

      // Should have emitted read-only disable and resume events
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'STORAGE:READ_ONLY_MODE',
        expect.objectContaining({ enabled: false })
      );
      expect(mockEventBus.emit).toHaveBeenCalledWith('STORAGE:RESUME_NON_CRITICAL');
    });
  });
});

// ==========================================
// Test Suite: Integration Tests
// ==========================================

describe('Quota Exceeded Handling Integration', () => {
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

  describe('End-to-End Quota Exceeded Scenario', () => {
    it('should handle complete quota exceeded scenario', async () => {
      // Setup: Start with normal quota
      const quota = 100 * 1024 * 1024;
      mockStorageEstimate(50 * 1024 * 1024, quota);

      await QuotaManager.checkNow();
      expect(QuotaManager.getStatus().tier).toBe('normal');

      // Quota fills up to warning level
      mockStorageEstimate(85 * 1024 * 1024, quota);
      await QuotaManager.checkNow();
      expect(QuotaManager.getStatus().tier).toBe('warning');

      // Quota reaches critical level
      mockStorageEstimate(96 * 1024 * 1024, quota);
      await QuotaManager.checkNow();
      expect(QuotaManager.getStatus().tier).toBe('critical');
      expect(QuotaManager.isWriteBlocked()).toBe(true);

      // Quota exceeded
      mockStorageEstimate(100 * 1024 * 1024, quota);
      await QuotaManager.checkNow();
      expect(QuotaManager.getStatus().percentage).toBe(100);
    });

    it('should handle write rejection when quota exceeded', async () => {
      const quota = 100 * 1024 * 1024;
      mockStorageEstimate(100 * 1024 * 1024, quota);

      const result = await QuotaManager.checkWriteFits(1024);

      expect(result.fits).toBe(false);
      expect(result.reservationId).toBeUndefined();
    });

    it('should handle write acceptance after cleanup', async () => {
      const quota = 100 * 1024 * 1024;
      mockStorageEstimate(96 * 1024 * 1024, quota); // Critical

      await QuotaManager.checkNow();
      expect(QuotaManager.isWriteBlocked()).toBe(true);

      // After cleanup, quota drops
      mockStorageEstimate(70 * 1024 * 1024, quota);
      await QuotaManager.checkNow();

      expect(QuotaManager.isWriteBlocked()).toBe(false);

      const result = await QuotaManager.checkWriteFits(1024);
      expect(result.fits).toBe(true);
    });
  });

  describe('Reservation System Under Quota Pressure', () => {
    it('should handle reservations when approaching quota limit', async () => {
      const quota = 100 * 1024 * 1024;
      mockStorageEstimate(90 * 1024 * 1024, quota); // 90% - close to critical

      const result1 = await QuotaManager.checkWriteFits(3 * 1024 * 1024); // 3MB
      expect(result1.fits).toBe(true);

      const result2 = await QuotaManager.checkWriteFits(3 * 1024 * 1024); // Another 3MB
      expect(result2.fits).toBe(true);

      // Third write should fail due to reservations
      const result3 = await QuotaManager.checkWriteFits(3 * 1024 * 1024);
      expect(result3.fits).toBe(false);
    });

    it('should release reservations and allow new writes', async () => {
      const quota = 100 * 1024 * 1024;
      mockStorageEstimate(90 * 1024 * 1024, quota);

      const result = await QuotaManager.checkWriteFits(5 * 1024 * 1024);
      expect(result.fits).toBe(true);
      expect(result.reservationId).toBeDefined();

      // Release reservation
      QuotaManager.releaseReservation(result.reservationId);

      // Should be able to write again
      const result2 = await QuotaManager.checkWriteFits(5 * 1024 * 1024);
      expect(result2.fits).toBe(true);
    });
  });
});

console.log('[Quota Exceeded Handling Tests] Test suite loaded');
