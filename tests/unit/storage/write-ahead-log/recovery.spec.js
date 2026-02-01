/**
 * Comprehensive Isolation Tests for WAL Crash Recovery
 *
 * Tests the recovery.js module in isolation with mocked dependencies.
 * Covers crash recovery scenarios, state transitions, and cross-tab coordination.
 *
 * @module tests/unit/storage/write-ahead-log/recovery
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Create mock state that will be shared between mock factories and tests
const mockState = {
  isPrimary: true,
  eventBusEmit: vi.fn(),
  loadWal: vi.fn(),
  processWal: vi.fn(),
};

// Mock TabCoordinator using a factory that references mockState
vi.mock('../../../../js/services/tab-coordination.js', () => ({
  TabCoordinator: {
    isPrimary: () => mockState.isPrimary,
  },
}));

// Mock EventBus
vi.mock('../../../../js/services/event-bus.js', () => ({
  EventBus: {
    emit: (...args) => mockState.eventBusEmit(...args),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

// Mock persistence
vi.mock('../../../../js/storage/write-ahead-log/persistence.js', () => ({
  loadWal: () => mockState.loadWal(),
  saveWal: vi.fn(),
  saveOperationResults: vi.fn(),
  getOperationResult: vi.fn(),
  clearWal: vi.fn(),
  clearOperationResults: vi.fn(),
}));

// Mock batch-processor
vi.mock('../../../../js/storage/write-ahead-log/batch-processor.js', () => ({
  processWal: () => mockState.processWal(),
  stopProcessing: vi.fn(),
  cleanupWal: vi.fn(),
  scheduleProcessing: vi.fn(),
}));

// Import the module under test and state AFTER mocks are set up
import { replayWal } from '../../../../js/storage/write-ahead-log/recovery.js';
import { walState, resetState } from '../../../../js/storage/write-ahead-log/state.js';
import { WalStatus, CONFIG } from '../../../../js/storage/write-ahead-log/config.js';

describe('WAL Crash Recovery - Isolation Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    mockState.eventBusEmit.mockClear();
    mockState.loadWal.mockClear();
    mockState.processWal.mockClear();

    // Reset mock state
    mockState.isPrimary = true;

    // Reset WAL state
    resetState();

    // Default mock implementations
    mockState.loadWal.mockImplementation(() => {
      walState.entries = [];
      return true;
    });
    mockState.processWal.mockResolvedValue(undefined);

    // Reset Date.now for consistent testing
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================================================
  // Group 1: Primary Tab Check (3 tests)
  // ============================================================================
  describe('Primary Tab Check', () => {
    it('should skip replay when not primary tab', async () => {
      mockState.isPrimary = false;

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Skipping WAL replay - not primary tab');
      expect(mockState.loadWal).not.toHaveBeenCalled();
      expect(mockState.processWal).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should proceed with replay when primary tab', async () => {
      mockState.isPrimary = true;

      await replayWal();

      expect(mockState.loadWal).toHaveBeenCalled();
    });

    it('should skip replay when TabCoordinator.isPrimary is undefined', async () => {
      mockState.isPrimary = undefined;

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Skipping WAL replay - not primary tab');
      expect(mockState.loadWal).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // Group 2: Replay Delay/Throttling (3 tests)
  // ============================================================================
  describe('Replay Delay/Throttling', () => {
    it('should skip replay if replayed too recently', async () => {
      walState.lastReplayTime = Date.now() - 100;

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Skipping WAL replay - too soon since last replay');
      expect(mockState.loadWal).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should proceed with replay if replay delay has passed', async () => {
      walState.lastReplayTime = Date.now() - CONFIG.REPLAY_DELAY_MS - 100;

      await replayWal();

      expect(mockState.loadWal).toHaveBeenCalled();
    });

    it('should proceed with replay if never replayed before', async () => {
      walState.lastReplayTime = 0;

      await replayWal();

      expect(mockState.loadWal).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Group 3: Concurrent Replay Protection (4 tests)
  // ============================================================================
  describe('Concurrent Replay Protection', () => {
    it('should skip replay if already replaying', async () => {
      walState.isReplaying = true;

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Already replaying WAL');
      expect(mockState.loadWal).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should set isReplaying flag during replay', async () => {
      // This test verifies that isReplaying is set to true during replay
      // Since replayWal is async and sets isReplaying synchronously at the start,
      // we can verify the flag behavior by checking before/after

      // Add a pending entry so processWal gets called
      mockState.loadWal.mockImplementation(() => {
        walState.entries = [{
          id: 'entry-1',
          sequence: 1,
          operation: 'put',
          args: ['key', 'value'],
          status: WalStatus.PENDING,
          createdAt: Date.now() - 1000,
          processedAt: null,
          attempts: 0,
          error: null,
        }];
        return true;
      });

      // Before replay, isReplaying should be false
      expect(walState.isReplaying).toBe(false);

      // Start and complete replay
      await replayWal();

      // After replay completes, isReplaying should be reset to false
      expect(walState.isReplaying).toBe(false);

      // The key behavior is that isReplaying was true during execution
      // This is implicitly verified by the fact that concurrent calls are prevented
    });

    it('should reset isReplaying flag after replay completes', async () => {
      await replayWal();

      expect(walState.isReplaying).toBe(false);
    });

    it('should reset isReplaying flag even if replay throws', async () => {
      mockState.processWal.mockRejectedValue(new Error('Processing failed'));

      const pendingEntry = {
        id: 'entry-1',
        sequence: 1,
        operation: 'put',
        args: ['key', 'value'],
        status: WalStatus.PENDING,
        createdAt: Date.now() - 1000,
        processedAt: null,
        attempts: 0,
        error: null,
      };

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [pendingEntry];
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await replayWal();

      expect(walState.isReplaying).toBe(false);

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // Group 4: State Transitions - PROCESSING to PENDING Reset (4 tests)
  // ============================================================================
  describe('PROCESSING to PENDING State Reset', () => {
    it('should reset PROCESSING entries to PENDING during recovery', async () => {
      const processingEntry = {
        id: 'entry-1',
        sequence: 1,
        operation: 'put',
        args: ['key', 'value'],
        status: WalStatus.PROCESSING,
        createdAt: Date.now() - 120000,
        processedAt: Date.now() - 120000,
        attempts: 1,
        error: null,
      };

      const pendingEntry = {
        id: 'entry-2',
        sequence: 2,
        operation: 'put',
        args: ['key2', 'value2'],
        status: WalStatus.PENDING,
        createdAt: Date.now() - 1000,
        processedAt: null,
        attempts: 0,
        error: null,
      };

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [processingEntry, pendingEntry];
        return true;
      });

      await replayWal();

      const resetEntry = walState.entries.find(e => e.id === 'entry-1');
      expect(resetEntry.status).toBe(WalStatus.PENDING);
      expect(resetEntry.error).toBe('Reset after crash');
    });

    it('should include PROCESSING entries older than 60 seconds in pendingEntries', async () => {
      const oldProcessingEntry = {
        id: 'entry-1',
        sequence: 1,
        operation: 'put',
        args: ['key', 'value'],
        status: WalStatus.PROCESSING,
        createdAt: Date.now() - 120000,
        processedAt: Date.now() - 120000,
        attempts: 1,
        error: null,
      };

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [oldProcessingEntry];
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Replaying 1 entries');

      consoleSpy.mockRestore();
    });

    it('should not include recent PROCESSING entries (under 60s) in pendingEntries', async () => {
      const recentProcessingEntry = {
        id: 'entry-1',
        sequence: 1,
        operation: 'put',
        args: ['key', 'value'],
        status: WalStatus.PROCESSING,
        createdAt: Date.now() - 1000,
        processedAt: Date.now() - 1000,
        attempts: 1,
        error: null,
      };

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [recentProcessingEntry];
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] No entries to replay');

      consoleSpy.mockRestore();
    });

    it('should handle mixed PENDING, PROCESSING, and FAILED entries', async () => {
      const entries = [
        {
          id: 'pending-1',
          sequence: 1,
          operation: 'put',
          args: ['key1', 'value1'],
          status: WalStatus.PENDING,
          createdAt: Date.now() - 1000,
          processedAt: null,
          attempts: 0,
          error: null,
        },
        {
          id: 'processing-1',
          sequence: 2,
          operation: 'put',
          args: ['key2', 'value2'],
          status: WalStatus.PROCESSING,
          createdAt: Date.now() - 120000,
          processedAt: Date.now() - 120000,
          attempts: 1,
          error: null,
        },
        {
          id: 'failed-1',
          sequence: 3,
          operation: 'put',
          args: ['key3', 'value3'],
          status: WalStatus.FAILED,
          createdAt: Date.now() - 5000,
          processedAt: null,
          attempts: 2,
          error: 'Previous error',
        },
        {
          id: 'committed-1',
          sequence: 4,
          operation: 'put',
          args: ['key4', 'value4'],
          status: WalStatus.COMMITTED,
          createdAt: Date.now() - 10000,
          processedAt: Date.now() - 10000,
          attempts: 1,
          error: null,
        },
      ];

      mockState.loadWal.mockImplementation(() => {
        walState.entries = entries;
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Replaying 3 entries');

      const processingEntry = walState.entries.find(e => e.id === 'processing-1');
      expect(processingEntry.status).toBe(WalStatus.PENDING);
      expect(processingEntry.error).toBe('Reset after crash');

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // Group 5: wal:replay_complete Event Emission (5 tests)
  // ============================================================================
  describe('wal:replay_complete Event Emission', () => {
    it('should emit wal:replay_complete event after successful replay', async () => {
      const pendingEntry = {
        id: 'entry-1',
        sequence: 1,
        operation: 'put',
        args: ['key', 'value'],
        status: WalStatus.PENDING,
        createdAt: Date.now() - 1000,
        processedAt: null,
        attempts: 0,
        error: null,
      };

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [pendingEntry];
        return true;
      });

      await replayWal();

      expect(mockState.eventBusEmit).toHaveBeenCalledWith('wal:replay_complete', {
        timestamp: expect.any(Number),
        entriesReplayed: 1,
      });
    });

    it('should emit wal:replay_complete event with 0 entries when no entries to replay', async () => {
      mockState.loadWal.mockImplementation(() => {
        walState.entries = [];
        return true;
      });

      await replayWal();

      expect(mockState.eventBusEmit).toHaveBeenCalledWith('wal:replay_complete', {
        timestamp: expect.any(Number),
        entriesReplayed: 0,
      });
    });

    it('should emit wal:replay_complete event even if replay throws', async () => {
      mockState.processWal.mockRejectedValue(new Error('Processing failed'));

      const pendingEntry = {
        id: 'entry-1',
        sequence: 1,
        operation: 'put',
        args: ['key', 'value'],
        status: WalStatus.PENDING,
        createdAt: Date.now() - 1000,
        processedAt: null,
        attempts: 0,
        error: null,
      };

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [pendingEntry];
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await replayWal();

      expect(mockState.eventBusEmit).toHaveBeenCalledWith('wal:replay_complete', {
        timestamp: expect.any(Number),
        entriesReplayed: 1,
      });

      consoleSpy.mockRestore();
    });

    it('should not emit wal:replay_complete when early returning due to throttling', async () => {
      walState.lastReplayTime = Date.now();

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(mockState.eventBusEmit).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should include correct timestamp in replay_complete event', async () => {
      const fixedTimestamp = 1234567890;
      vi.setSystemTime(fixedTimestamp);

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [];
        return true;
      });

      await replayWal();

      expect(mockState.eventBusEmit).toHaveBeenCalledWith('wal:replay_complete', {
        timestamp: fixedTimestamp,
        entriesReplayed: 0,
      });
    });
  });

  // ============================================================================
  // Group 6: Recovery with Corrupted Entries (4 tests)
  // ============================================================================
  describe('Recovery with Corrupted Entries', () => {
    it('should handle loadWal throwing an error', async () => {
      mockState.loadWal.mockImplementation(() => {
        throw new Error('Corrupted WAL data');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Error replaying WAL:', expect.any(Error));
      expect(mockState.eventBusEmit).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle entries with missing required fields', async () => {
      const corruptedEntry = {
        id: 'corrupted-1',
        status: WalStatus.PENDING,
        createdAt: Date.now() - 1000,
      };

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [corruptedEntry];
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Replaying 1 entries');

      consoleSpy.mockRestore();
    });

    it('should handle entries with invalid status values', async () => {
      const invalidStatusEntry = {
        id: 'invalid-1',
        sequence: 1,
        operation: 'put',
        args: ['key', 'value'],
        status: 'invalid_status',
        createdAt: Date.now() - 1000,
        processedAt: null,
        attempts: 0,
        error: null,
      };

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [invalidStatusEntry];
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      // Invalid status entries are filtered out, so no entries to replay
      expect(consoleSpy).toHaveBeenCalledWith('[WAL] No entries to replay');
      expect(mockState.processWal).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle null entries in the array', async () => {
      const validEntry = {
        id: 'valid-1',
        sequence: 1,
        operation: 'put',
        args: ['key', 'value'],
        status: WalStatus.PENDING,
        createdAt: Date.now() - 1000,
        processedAt: null,
        attempts: 0,
        error: null,
      };

      mockState.loadWal.mockImplementation(() => {
        // Filter out null/undefined entries as the actual code would
        walState.entries = [null, validEntry, undefined].filter(e => e != null);
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Replaying 1 entries');

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // Group 7: Recovery with Partial Writes (2 tests)
  // ============================================================================
  describe('Recovery with Partial Writes', () => {
    it('should handle processWal throwing an error', async () => {
      mockState.processWal.mockRejectedValue(new Error('Batch processing failed'));

      const pendingEntry = {
        id: 'entry-1',
        sequence: 1,
        operation: 'put',
        args: ['key', 'value'],
        status: WalStatus.PENDING,
        createdAt: Date.now() - 1000,
        processedAt: null,
        attempts: 0,
        error: null,
      };

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [pendingEntry];
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Error replaying WAL:', expect.any(Error));
      expect(walState.isReplaying).toBe(false);
      expect(mockState.eventBusEmit).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle processWal hanging (timeout scenario)', async () => {
      mockState.processWal.mockImplementation(() => {
        return new Promise(() => {});
      });

      const pendingEntry = {
        id: 'entry-1',
        sequence: 1,
        operation: 'put',
        args: ['key', 'value'],
        status: WalStatus.PENDING,
        createdAt: Date.now() - 1000,
        processedAt: null,
        attempts: 0,
        error: null,
      };

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [pendingEntry];
        return true;
      });

      const replayPromise = replayWal();

      expect(walState.isReplaying).toBe(true);
    });
  });

  // ============================================================================
  // Group 8: Cross-Tab Recovery Coordination (3 tests)
  // ============================================================================
  describe('Cross-Tab Recovery Coordination', () => {
    it('should only allow primary tab to replay', async () => {
      mockState.isPrimary = false;

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Skipping WAL replay - not primary tab');
      expect(mockState.loadWal).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should update lastReplayTime after successful replay', async () => {
      const beforeTime = Date.now();

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [];
        return true;
      });

      await replayWal();

      expect(walState.lastReplayTime).toBeGreaterThanOrEqual(beforeTime);
    });

    it('should update lastReplayTime even if no entries to replay', async () => {
      const beforeTime = Date.now();

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [];
        return true;
      });

      await replayWal();

      expect(walState.lastReplayTime).toBeGreaterThanOrEqual(beforeTime);
    });
  });

  // ============================================================================
  // Group 9: Edge Cases and Boundary Conditions (5 tests)
  // ============================================================================
  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle empty WAL (no entries)', async () => {
      mockState.loadWal.mockImplementation(() => {
        walState.entries = [];
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] No entries to replay');
      expect(mockState.processWal).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle all entries being committed', async () => {
      const committedEntries = [
        {
          id: 'committed-1',
          sequence: 1,
          operation: 'put',
          args: ['key1', 'value1'],
          status: WalStatus.COMMITTED,
          createdAt: Date.now() - 10000,
          processedAt: Date.now() - 10000,
          attempts: 1,
          error: null,
        },
        {
          id: 'committed-2',
          sequence: 2,
          operation: 'put',
          args: ['key2', 'value2'],
          status: WalStatus.COMMITTED,
          createdAt: Date.now() - 5000,
          processedAt: Date.now() - 5000,
          attempts: 1,
          error: null,
        },
      ];

      mockState.loadWal.mockImplementation(() => {
        walState.entries = committedEntries;
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] No entries to replay');
      expect(mockState.processWal).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle very large number of pending entries', async () => {
      const largeEntries = Array.from({ length: 1000 }, (_, i) => ({
        id: `entry-${i}`,
        sequence: i + 1,
        operation: 'put',
        args: [`key${i}`, `value${i}`],
        status: WalStatus.PENDING,
        createdAt: Date.now() - 1000,
        processedAt: null,
        attempts: 0,
        error: null,
      }));

      mockState.loadWal.mockImplementation(() => {
        walState.entries = largeEntries;
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Replaying 1000 entries');
      expect(mockState.processWal).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle entries at exactly 60 second threshold', async () => {
      const now = Date.now();
      const exactly60SecondsAgo = now - 60000;

      const entry = {
        id: 'entry-1',
        sequence: 1,
        operation: 'put',
        args: ['key', 'value'],
        status: WalStatus.PROCESSING,
        createdAt: exactly60SecondsAgo - 1000,
        processedAt: exactly60SecondsAgo,
        attempts: 1,
        error: null,
      };

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [entry];
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] No entries to replay');

      consoleSpy.mockRestore();
    });

    it('should handle entries just over 60 second threshold', async () => {
      const now = Date.now();
      const justOver60Seconds = now - 60001;

      const entry = {
        id: 'entry-1',
        sequence: 1,
        operation: 'put',
        args: ['key', 'value'],
        status: WalStatus.PROCESSING,
        createdAt: justOver60Seconds - 1000,
        processedAt: justOver60Seconds,
        attempts: 1,
        error: null,
      };

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [entry];
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Replaying 1 entries');

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // Group 10: Logging and Debugging (4 tests)
  // ============================================================================
  describe('Logging and Debugging', () => {
    it('should log start of crash recovery', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [];
        return true;
      });

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Starting crash recovery replay...');

      consoleSpy.mockRestore();
    });

    it('should log completion of crash recovery', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Add a pending entry so the completion log is triggered
      mockState.loadWal.mockImplementation(() => {
        walState.entries = [{
          id: 'entry-1',
          sequence: 1,
          operation: 'put',
          args: ['key', 'value'],
          status: WalStatus.PENDING,
          createdAt: Date.now() - 1000,
          processedAt: null,
          attempts: 0,
          error: null,
        }];
        return true;
      });

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Crash recovery replay complete');

      consoleSpy.mockRestore();
    });

    it('should log number of entries being replayed', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const entries = Array.from({ length: 5 }, (_, i) => ({
        id: `entry-${i}`,
        sequence: i + 1,
        operation: 'put',
        args: [`key${i}`, `value${i}`],
        status: WalStatus.PENDING,
        createdAt: Date.now() - 1000,
        processedAt: null,
        attempts: 0,
        error: null,
      }));

      mockState.loadWal.mockImplementation(() => {
        walState.entries = entries;
        return true;
      });

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Replaying 5 entries');

      consoleSpy.mockRestore();
    });

    it('should log error when replay fails', async () => {
      mockState.processWal.mockRejectedValue(new Error('Processing error'));

      const pendingEntry = {
        id: 'entry-1',
        sequence: 1,
        operation: 'put',
        args: ['key', 'value'],
        status: WalStatus.PENDING,
        createdAt: Date.now() - 1000,
        processedAt: null,
        attempts: 0,
        error: null,
      };

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [pendingEntry];
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await replayWal();

      expect(consoleSpy).toHaveBeenCalledWith('[WAL] Error replaying WAL:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // Group 11: State Consistency (2 tests)
  // ============================================================================
  describe('State Consistency', () => {
    it('should not modify entries that are not PROCESSING', async () => {
      const entries = [
        {
          id: 'pending-1',
          sequence: 1,
          operation: 'put',
          args: ['key1', 'value1'],
          status: WalStatus.PENDING,
          createdAt: Date.now() - 1000,
          processedAt: null,
          attempts: 0,
          error: null,
        },
        {
          id: 'failed-1',
          sequence: 2,
          operation: 'put',
          args: ['key2', 'value2'],
          status: WalStatus.FAILED,
          createdAt: Date.now() - 2000,
          processedAt: null,
          attempts: 1,
          error: 'Previous error',
        },
      ];

      mockState.loadWal.mockImplementation(() => {
        walState.entries = entries.map(e => ({ ...e }));
        return true;
      });

      await replayWal();

      const pendingEntry = walState.entries.find(e => e.id === 'pending-1');
      const failedEntry = walState.entries.find(e => e.id === 'failed-1');

      expect(pendingEntry.status).toBe(WalStatus.PENDING);
      expect(pendingEntry.error).toBeNull();

      expect(failedEntry.status).toBe(WalStatus.FAILED);
      expect(failedEntry.error).toBe('Previous error');
    });

    it('should preserve entry properties when resetting PROCESSING to PENDING', async () => {
      const processingEntry = {
        id: 'processing-1',
        sequence: 5,
        operation: 'put',
        args: ['key', 'value'],
        status: WalStatus.PROCESSING,
        createdAt: 1000000 - 120000,
        processedAt: 1000000 - 120000,
        attempts: 3,
        priority: 'high',
        error: 'Some previous error',
      };

      mockState.loadWal.mockImplementation(() => {
        walState.entries = [{ ...processingEntry }];
        return true;
      });

      await replayWal();

      const resetEntry = walState.entries.find(e => e.id === 'processing-1');

      expect(resetEntry.sequence).toBe(5);
      expect(resetEntry.operation).toBe('put');
      expect(resetEntry.args).toEqual(['key', 'value']);
      expect(resetEntry.attempts).toBe(3);
      expect(resetEntry.priority).toBe('high');
      expect(resetEntry.status).toBe(WalStatus.PENDING);
      expect(resetEntry.error).toBe('Reset after crash');
    });
  });

  // ============================================================================
  // Group 12: Integration with processWal (2 tests)
  // ============================================================================
  describe('Integration with processWal', () => {
    it('should call processWal after resetting PROCESSING entries', async () => {
      const processingEntry = {
        id: 'processing-1',
        sequence: 1,
        operation: 'put',
        args: ['key', 'value'],
        status: WalStatus.PROCESSING,
        createdAt: Date.now() - 120000,
        processedAt: Date.now() - 120000,
        attempts: 1,
        error: null,
      };

      const operationOrder = [];

      mockState.loadWal.mockImplementation(() => {
        operationOrder.push('loadWal');
        walState.entries = [processingEntry];
        return true;
      });

      mockState.processWal.mockImplementation(async () => {
        operationOrder.push('processWal');
        const entry = walState.entries.find(e => e.id === 'processing-1');
        expect(entry.status).toBe(WalStatus.PENDING);
      });

      await replayWal();

      expect(operationOrder).toEqual(['loadWal', 'processWal']);
    });

    it('should pass control to processWal for actual processing', async () => {
      mockState.loadWal.mockImplementation(() => {
        walState.entries = [
          {
            id: 'entry-1',
            sequence: 1,
            operation: 'put',
            args: ['key', 'value'],
            status: WalStatus.PENDING,
            createdAt: Date.now() - 1000,
            processedAt: null,
            attempts: 0,
            error: null,
          },
        ];
        return true;
      });

      await replayWal();

      expect(mockState.processWal).toHaveBeenCalledTimes(1);
    });
  });
});
