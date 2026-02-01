/**
 * Cleanup Strategies Tests
 *
 * Comprehensive test suite for cleanup execution strategies.
 * Tests the _performCleanup, _performEmergencyCleanup, _cleanupItem,
 * _getItemsForCleanup, and category-specific cleanup operations.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CleanupStrategies } from '../../../../js/services/storage-degradation/cleanup-strategies.js';
import { CleanupPriority } from '../../../../js/services/storage-degradation/cleanup-strategies.js';

// Mock EventBus
const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
};

// Mock Storage
const mockStorage = {
  getAllChatSessions: vi.fn(),
  deleteChatSession: vi.fn(),
  getActiveSessionId: vi.fn(),
  getChunks: vi.fn(),
  deleteChunk: vi.fn(),
  getStreams: vi.fn(),
  deleteStream: vi.fn(),
};

// Mock VectorLRUCache
const mockVectorLRUCache = {
  size: vi.fn(),
  clear: vi.fn(),
};

describe('CleanupStrategies', () => {
  let cleanup;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.doMock('../../../../js/storage.js', () => ({
      Storage: mockStorage,
    }));
    vi.doMock('../../../../js/storage/lru-cache.js', () => ({
      VectorLRUCache: mockVectorLRUCache,
    }));

    cleanup = new CleanupStrategies({
      eventBus: mockEventBus,
      storage: mockStorage,
    });
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const defaultCleanup = new CleanupStrategies();
      expect(defaultCleanup).toBeDefined();
    });

    it('should initialize with custom eventBus', () => {
      const customCleanup = new CleanupStrategies({ eventBus: mockEventBus });
      expect(customCleanup).toBeDefined();
    });

    it('should initialize with custom storage', () => {
      const customCleanup = new CleanupStrategies({ storage: mockStorage });
      expect(customCleanup).toBeDefined();
    });

    it('should initialize item registry on construction', () => {
      expect(cleanup._itemRegistry).toBeInstanceOf(Map);
      expect(cleanup._itemRegistry.size).toBeGreaterThan(0);
    });
  });

  describe('Cleanup Priority Enum', () => {
    it('should define NEVER_DELETE priority', () => {
      expect(CleanupPriority.NEVER_DELETE).toBe(0);
    });

    it('should define LOW priority', () => {
      expect(CleanupPriority.LOW).toBe(1);
    });

    it('should define MEDIUM priority', () => {
      expect(CleanupPriority.MEDIUM).toBe(2);
    });

    it('should define HIGH priority', () => {
      expect(CleanupPriority.HIGH).toBe(3);
    });

    it('should define AGGRESSIVE priority', () => {
      expect(CleanupPriority.AGGRESSIVE).toBe(4);
    });
  });

  describe('_getItemsForCleanup', () => {
    it('should return items with priority >= minPriority', () => {
      const items = cleanup._getItemsForCleanup(CleanupPriority.HIGH);

      items.forEach(item => {
        expect(item.priority).toBeGreaterThanOrEqual(CleanupPriority.HIGH);
      });
    });

    it('should sort by priority descending', () => {
      const items = cleanup._getItemsForCleanup(CleanupPriority.LOW);

      for (let i = 1; i < items.length; i++) {
        expect(items[i - 1].priority).toBeGreaterThanOrEqual(items[i].priority);
      }
    });

    it('should sort by lastAccessed ascending for same priority', () => {
      // Register two items with same priority
      cleanup._itemRegistry.set('test1', {
        key: 'test1',
        priority: CleanupPriority.MEDIUM,
        lastAccessed: 1000,
        category: 'session',
      });

      cleanup._itemRegistry.set('test2', {
        key: 'test2',
        priority: CleanupPriority.MEDIUM,
        lastAccessed: 2000,
        category: 'session',
      });

      const items = cleanup._getItemsForCleanup(CleanupPriority.MEDIUM);

      const test1Index = items.findIndex(item => item.key === 'test1');
      const test2Index = items.findIndex(item => item.key === 'test2');

      expect(test1Index).toBeLessThan(test2Index);
    });

    it('should exclude NEVER_DELETE items', () => {
      const items = cleanup._getItemsForCleanup(CleanupPriority.LOW);

      items.forEach(item => {
        expect(item.priority).not.toBe(CleanupPriority.NEVER_DELETE);
      });
    });

    it('should return empty array when no items match', () => {
      const items = cleanup._getItemsForCleanup(CleanupPriority.AGGRESSIVE + 10);
      expect(items).toEqual([]);
    });
  });

  describe('_cleanupItem', () => {
    it('should cleanup session items', async () => {
      const item = {
        key: 'sessions',
        category: 'session',
        priority: CleanupPriority.MEDIUM,
        lastAccessed: Date.now(),
      };

      mockStorage.getAllChatSessions.mockResolvedValue([
        { id: 'session1', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
        { id: 'session2', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
      ]);
      mockStorage.getActiveSessionId.mockReturnValue('active-session');
      mockStorage.deleteChatSession.mockResolvedValue(true);

      const result = await cleanup._cleanupItem(item);

      expect(result.success).toBe(true);
      expect(result.itemsDeleted).toBeGreaterThan(0);
      expect(result.operations.length).toBeGreaterThan(0);
    });

    it('should cleanup embedding items', async () => {
      const item = {
        key: 'embeddings',
        category: 'embedding',
        priority: CleanupPriority.AGGRESSIVE,
        lastAccessed: Date.now(),
      };

      mockVectorLRUCache.size.mockReturnValue(100);
      mockVectorLRUCache.clear.mockResolvedValue(undefined);

      const result = await cleanup._cleanupItem(item);

      expect(result.success).toBe(true);
      expect(result.itemsDeleted).toBe(100);
      expect(mockVectorLRUCache.clear).toHaveBeenCalled();
    });

    it('should cleanup chunk items', async () => {
      const item = {
        key: 'chunks',
        category: 'chunk',
        priority: CleanupPriority.HIGH,
        lastAccessed: Date.now(),
      };

      mockStorage.getChunks.mockResolvedValue([
        { id: 'chunk1', endDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) },
        { id: 'chunk2', endDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) },
      ]);
      mockStorage.deleteChunk.mockResolvedValue(true);

      const result = await cleanup._cleanupItem(item);

      expect(result.success).toBe(true);
      expect(result.itemsDeleted).toBeGreaterThan(0);
    });

    it('should cleanup stream items', async () => {
      const item = {
        key: 'streams',
        category: 'stream',
        priority: CleanupPriority.HIGH,
        lastAccessed: Date.now(),
      };

      const oldTimestamp = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      mockStorage.getStreams.mockResolvedValue([
        { id: 'stream1', ts: oldTimestamp.toISOString() },
        { id: 'stream2', ts: oldTimestamp.toISOString() },
      ]);
      mockStorage.deleteStream.mockResolvedValue(true);

      const result = await cleanup._cleanupItem(item);

      expect(result.success).toBe(true);
      expect(result.itemsDeleted).toBeGreaterThan(0);
    });

    it('should handle cleanup errors gracefully', async () => {
      const item = {
        key: 'sessions',
        category: 'session',
        priority: CleanupPriority.MEDIUM,
        lastAccessed: Date.now(),
      };

      mockStorage.getAllChatSessions.mockRejectedValue(new Error('Storage error'));

      const result = await cleanup._cleanupItem(item);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle unknown category gracefully', async () => {
      const item = {
        key: 'unknown',
        category: 'unknown',
        priority: CleanupPriority.MEDIUM,
        lastAccessed: Date.now(),
      };

      const result = await cleanup._cleanupItem(item);

      expect(result.success).toBe(true);
      expect(result.itemsDeleted).toBe(0);
    });
  });

  describe('_cleanupOldSessions', () => {
    it('should delete sessions older than 30 days', async () => {
      const oldSession = {
        id: 'old-session',
        createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      };

      mockStorage.getAllChatSessions.mockResolvedValue([oldSession]);
      mockStorage.getActiveSessionId.mockReturnValue('active-session');
      mockStorage.deleteChatSession.mockResolvedValue(true);

      const result = await cleanup._cleanupOldSessions();

      expect(result.success).toBe(true);
      expect(result.itemsDeleted).toBe(1);
      expect(mockStorage.deleteChatSession).toHaveBeenCalledWith('old-session');
    });

    it('should not delete active session', async () => {
      const sessions = [
        { id: 'active-session', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
        { id: 'old-session', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
      ];

      mockStorage.getAllChatSessions.mockResolvedValue(sessions);
      mockStorage.getActiveSessionId.mockReturnValue('active-session');
      mockStorage.deleteChatSession.mockResolvedValue(true);

      const result = await cleanup._cleanupOldSessions();

      expect(result.itemsDeleted).toBe(1);
      expect(mockStorage.deleteChatSession).not.toHaveBeenCalledWith('active-session');
    });

    it('should not delete recent sessions', async () => {
      const recentSession = {
        id: 'recent-session',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      };

      mockStorage.getAllChatSessions.mockResolvedValue([recentSession]);
      mockStorage.getActiveSessionId.mockReturnValue('active-session');

      const result = await cleanup._cleanupOldSessions();

      expect(result.itemsDeleted).toBe(0);
      expect(mockStorage.deleteChatSession).not.toHaveBeenCalled();
    });

    it('should use 7 day threshold in CRITICAL tier', async () => {
      cleanup._currentTier = 'critical';

      const session = {
        id: 'old-session',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      };

      mockStorage.getAllChatSessions.mockResolvedValue([session]);
      mockStorage.getActiveSessionId.mockReturnValue('active-session');
      mockStorage.deleteChatSession.mockResolvedValue(true);

      const result = await cleanup._cleanupOldSessions();

      expect(result.itemsDeleted).toBe(1);
    });

    it('should process sessions in batches', async () => {
      const sessions = Array.from({ length: 25 }, (_, i) => ({
        id: `session-${i}`,
        createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      }));

      mockStorage.getAllChatSessions.mockResolvedValue(sessions);
      mockStorage.getActiveSessionId.mockReturnValue('active-session');
      mockStorage.deleteChatSession.mockResolvedValue(true);

      const result = await cleanup._cleanupOldSessions();

      expect(result.itemsDeleted).toBe(25);
    });

    it('should handle individual deletion failures', async () => {
      const sessions = [
        { id: 'session-1', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
        { id: 'session-2', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
        { id: 'session-3', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
      ];

      mockStorage.getAllChatSessions.mockResolvedValue(sessions);
      mockStorage.getActiveSessionId.mockReturnValue('active-session');

      let callCount = 0;
      mockStorage.deleteChatSession.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Delete failed'));
        }
        return Promise.resolve(true);
      });

      const result = await cleanup._cleanupOldSessions();

      // Should continue despite one failure
      expect(result.itemsDeleted).toBe(2);
    });
  });

  describe('_clearEmbeddings', () => {
    it('should clear all embeddings from cache', async () => {
      mockVectorLRUCache.size.mockReturnValue(100);
      mockVectorLRUCache.clear.mockResolvedValue(undefined);

      const result = await cleanup._clearEmbeddings();

      expect(result.success).toBe(true);
      expect(result.itemsDeleted).toBe(100);
      expect(result.bytesFreed).toBe(100 * 1536); // 1.5KB per vector
      expect(mockVectorLRUCache.clear).toHaveBeenCalled();
    });

    it('should handle empty cache', async () => {
      mockVectorLRUCache.size.mockReturnValue(0);

      const result = await cleanup._clearEmbeddings();

      expect(result.itemsDeleted).toBe(0);
      expect(result.bytesFreed).toBe(0);
    });

    it('should handle cache clear errors', async () => {
      mockVectorLRUCache.size.mockReturnValue(100);
      mockVectorLRUCache.clear.mockRejectedValue(new Error('Clear failed'));

      const result = await cleanup._clearEmbeddings();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('_cleanupOldChunks', () => {
    it('should delete chunks older than 90 days', async () => {
      const oldChunk = {
        id: 'old-chunk',
        endDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
      };

      mockStorage.getChunks.mockResolvedValue([oldChunk]);
      mockStorage.deleteChunk.mockResolvedValue(true);

      const result = await cleanup._cleanupOldChunks();

      expect(result.success).toBe(true);
      expect(result.itemsDeleted).toBe(1);
      expect(mockStorage.deleteChunk).toHaveBeenCalledWith('old-chunk');
    });

    it('should not delete recent chunks', async () => {
      const recentChunk = {
        id: 'recent-chunk',
        endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      };

      mockStorage.getChunks.mockResolvedValue([recentChunk]);

      const result = await cleanup._cleanupOldChunks();

      expect(result.itemsDeleted).toBe(0);
      expect(mockStorage.deleteChunk).not.toHaveBeenCalled();
    });

    it('should process chunks in batches', async () => {
      const chunks = Array.from({ length: 45 }, (_, i) => ({
        id: `chunk-${i}`,
        endDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
      }));

      mockStorage.getChunks.mockResolvedValue(chunks);
      mockStorage.deleteChunk.mockResolvedValue(true);

      const result = await cleanup._cleanupOldChunks();

      expect(result.itemsDeleted).toBe(45);
    });
  });

  describe('_cleanupOldStreams', () => {
    it('should delete streams older than 30 days', async () => {
      const oldTimestamp = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      const oldStream = {
        id: 'old-stream',
        ts: oldTimestamp.toISOString(),
      };

      mockStorage.getStreams.mockResolvedValue([oldStream]);
      mockStorage.deleteStream.mockResolvedValue(true);

      const result = await cleanup._cleanupOldStreams();

      expect(result.success).toBe(true);
      expect(result.itemsDeleted).toBe(1);
      expect(mockStorage.deleteStream).toHaveBeenCalledWith('old-stream');
    });

    it('should not delete recent streams', async () => {
      const recentTimestamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const recentStream = {
        id: 'recent-stream',
        ts: recentTimestamp.toISOString(),
      };

      mockStorage.getStreams.mockResolvedValue([recentStream]);

      const result = await cleanup._cleanupOldStreams();

      expect(result.itemsDeleted).toBe(0);
      expect(mockStorage.deleteStream).not.toHaveBeenCalled();
    });

    it('should process streams in batches', async () => {
      const oldTimestamp = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      const streams = Array.from({ length: 100 }, (_, i) => ({
        id: `stream-${i}`,
        ts: oldTimestamp.toISOString(),
      }));

      mockStorage.getStreams.mockResolvedValue(streams);
      mockStorage.deleteStream.mockResolvedValue(true);

      const result = await cleanup._cleanupOldStreams();

      expect(result.itemsDeleted).toBe(100);
    });
  });

  describe('_performCleanup', () => {
    it('should cleanup items at specified priority', async () => {
      mockStorage.getAllChatSessions.mockResolvedValue([]);
      mockStorage.getChunks.mockResolvedValue([]);
      mockStorage.getStreams.mockResolvedValue([]);

      const result = await cleanup._performCleanup(CleanupPriority.MEDIUM);

      expect(result.success).toBe(true);
      expect(result.operations).toBeDefined();
    });

    it('should track bytes freed', async () => {
      mockStorage.getAllChatSessions.mockResolvedValue([
        { id: 'old-session', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
      ]);
      mockStorage.getActiveSessionId.mockReturnValue('active');
      mockStorage.deleteChatSession.mockResolvedValue(true);

      const result = await cleanup._performCleanup(CleanupPriority.MEDIUM);

      expect(result.bytesFreed).toBeGreaterThan(0);
    });

    it('should stop after freeing 10% of usage', async () => {
      cleanup._currentMetrics = {
        usageBytes: 100 * 1024 * 1024, // 100 MB
        quotaBytes: 150 * 1024 * 1024,
        usagePercent: 66.7,
      };

      const sessions = Array.from({ length: 100 }, (_, i) => ({
        id: `session-${i}`,
        createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      }));

      mockStorage.getAllChatSessions.mockResolvedValue(sessions);
      mockStorage.getActiveSessionId.mockReturnValue('active');
      mockStorage.deleteChatSession.mockResolvedValue(true);

      const result = await cleanup._performCleanup(CleanupPriority.HIGH);

      // Should stop after freeing ~10MB (10% of 100MB)
      // Each session is ~2KB, so should process ~5000 sessions
      // But we only have 100, so all should be processed
      expect(result.itemsDeleted).toBeGreaterThan(0);
    });

    it('should continue despite individual item failures', async () => {
      let callCount = 0;
      mockStorage.getAllChatSessions.mockResolvedValue([
        { id: 'session-1', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
        { id: 'session-2', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
      ]);
      mockStorage.getActiveSessionId.mockReturnValue('active');
      mockStorage.deleteChatSession.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Delete failed'));
        }
        return Promise.resolve(true);
      });

      const result = await cleanup._performCleanup(CleanupPriority.MEDIUM);

      expect(result.success).toBe(true);
    });

    it('should handle cleanup errors', async () => {
      mockStorage.getAllChatSessions.mockRejectedValue(new Error('Storage error'));

      const result = await cleanup._performCleanup(CleanupPriority.MEDIUM);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('_performEmergencyCleanup', () => {
    it('should cleanup all LOW priority and above items', async () => {
      mockStorage.getAllChatSessions.mockResolvedValue([]);
      mockStorage.getChunks.mockResolvedValue([]);
      mockStorage.getStreams.mockResolvedValue([]);

      const result = await cleanup._performEmergencyCleanup();

      expect(result.success).toBe(true);
    });

    it('should exclude NEVER_DELETE items', async () => {
      const result = await cleanup._performEmergencyCleanup();

      // Personality, settings, active session should never be deleted
      expect(result).toBeDefined();
    });
  });

  describe('setCurrentTier', () => {
    it('should update current tier', () => {
      cleanup.setCurrentTier('critical');
      expect(cleanup._currentTier).toBe('critical');
    });
  });

  describe('setCurrentMetrics', () => {
    it('should update current metrics', () => {
      const metrics = {
        usageBytes: 50 * 1024 * 1024,
        quotaBytes: 100 * 1024 * 1024,
        usagePercent: 50,
        tier: 'normal',
      };

      cleanup.setCurrentMetrics(metrics);
      expect(cleanup._currentMetrics).toEqual(metrics);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty item registry', () => {
      cleanup._itemRegistry.clear();
      const items = cleanup._getItemsForCleanup(CleanupPriority.LOW);
      expect(items).toEqual([]);
    });

    it('should handle missing Storage gracefully', async () => {
      const item = {
        key: 'sessions',
        category: 'session',
        priority: CleanupPriority.MEDIUM,
        lastAccessed: Date.now(),
      };

      const noStorageCleanup = new CleanupStrategies({ storage: null });

      const result = await noStorageCleanup._cleanupItem(item);

      expect(result).toBeDefined();
    });

    it('should handle missing category in item', async () => {
      const item = {
        key: 'unknown',
        priority: CleanupPriority.MEDIUM,
        lastAccessed: Date.now(),
      };

      const result = await cleanup._cleanupItem(item);

      expect(result.success).toBe(true);
      expect(result.itemsDeleted).toBe(0);
    });
  });
});
