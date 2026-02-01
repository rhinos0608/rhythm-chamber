/**
 * Tests for Transaction Composition Root
 *
 * Tests the StorageTransaction facade that wires together:
 * - TransactionalResource
 * - TransactionStateManager
 * - CompensationLogger
 * - TwoPhaseCommitCoordinator
 *
 * @module tests/unit/storage/transaction/index
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock EventBus to avoid import chain issues
vi.mock('../../../../js/services/event-bus.js', () => ({
  EventBus: {
    emit: vi.fn(),
  },
}));

import {
  StorageTransaction,
  TransactionStateManager,
  NestedTransactionGuard,
  CompensationLogger,
  getCompensationLogs,
  clearFatalState,
} from '../../../../js/storage/transaction/index.js';

describe('Transaction Composition Root', () => {
  beforeEach(() => {
    // Clear any fatal state before each test
    clearFatalState();
    vi.clearAllMocks();
  });

  describe('Module Exports', () => {
    it('should export StorageTransaction class', () => {
      expect(StorageTransaction).toBeDefined();
      expect(typeof StorageTransaction).toBe('function');
    });

    it('should export TransactionStateManager', () => {
      expect(TransactionStateManager).toBeDefined();
      expect(typeof TransactionStateManager.isFatalState).toBe('function');
    });

    it('should export NestedTransactionGuard', () => {
      expect(NestedTransactionGuard).toBeDefined();
      expect(typeof NestedTransactionGuard.isInTransaction).toBe('function');
    });

    it('should export CompensationLogger', () => {
      expect(CompensationLogger).toBeDefined();
      expect(typeof CompensationLogger).toBe('function');
    });

    it('should export getCompensationLogs function', () => {
      expect(getCompensationLogs).toBeDefined();
      expect(typeof getCompensationLogs).toBe('function');
    });

    it('should export clearFatalState function', () => {
      expect(clearFatalState).toBeDefined();
      expect(typeof clearFatalState).toBe('function');
    });
  });

  describe('StorageTransaction Facade', () => {
    let storageTx;

    beforeEach(() => {
      storageTx = new StorageTransaction();
    });

    it('should create instance successfully', () => {
      expect(storageTx).toBeDefined();
      expect(storageTx instanceof StorageTransaction).toBe(true);
    });

    it('should have run method', () => {
      expect(typeof storageTx.run).toBe('function');
    });

    it('should have begin method', () => {
      expect(typeof storageTx.begin).toBe('function');
    });

    it('should have commit method', () => {
      expect(typeof storageTx.commit).toBe('function');
    });

    it('should have rollback method', () => {
      expect(typeof storageTx.rollback).toBe('function');
    });
  });

  describe('StorageTransaction.run() - High-level API', () => {
    let storageTx;
    let mockResources;

    beforeEach(() => {
      storageTx = new StorageTransaction();

      // Create mock TransactionalResource implementations
      mockResources = [
        {
          prepare: vi.fn().mockResolvedValue(undefined),
          commit: vi.fn().mockResolvedValue(undefined),
          rollback: vi.fn().mockResolvedValue(undefined),
          recover: vi.fn().mockResolvedValue(undefined),
        },
      ];
    });

    it('should execute transaction callback successfully', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      const result = await storageTx.run(callback, mockResources);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(callback).toHaveBeenCalled();
    });

    it('should pass TransactionContext to callback', async () => {
      let capturedContext = null;

      const callback = vi.fn().mockImplementation(ctx => {
        capturedContext = ctx;
        return Promise.resolve();
      });

      await storageTx.run(callback, mockResources);

      expect(capturedContext).toBeDefined();
      expect(capturedContext.id).toBeDefined();
      expect(typeof capturedContext.put).toBe('function');
      expect(typeof capturedContext.delete).toBe('function');
    });

    it('should call prepare on all resources', async () => {
      const callback = vi.fn().mockImplementation(ctx => {
        ctx.put('test-store', 'key1', 'value1');
        return Promise.resolve();
      });

      await storageTx.run(callback, mockResources);

      expect(mockResources[0].prepare).toHaveBeenCalled();
    });

    it('should call commit on all resources when successful', async () => {
      const callback = vi.fn().mockImplementation(ctx => {
        ctx.put('test-store', 'key1', 'value1');
        return Promise.resolve();
      });

      await storageTx.run(callback, mockResources);

      expect(mockResources[0].commit).toHaveBeenCalled();
    });

    it('should call rollback on all resources when callback fails', async () => {
      const callback = vi.fn().mockImplementation(async ctx => {
        // Add some operations before failing
        ctx.put('test-store', 'key1', 'value1');
        ctx.put('test-store', 'key2', 'value2');
        throw new Error('Test error');
      });

      await expect(storageTx.run(callback, mockResources)).rejects.toThrow('Test error');

      expect(mockResources[0].rollback).toHaveBeenCalled();
    });

    it('should not call commit when callback fails', async () => {
      const callback = vi.fn().mockImplementation(async ctx => {
        // Add operations before failing
        ctx.put('test-store', 'key1', 'value1');
        throw new Error('Test error');
      });

      await expect(storageTx.run(callback, mockResources)).rejects.toThrow();

      expect(mockResources[0].commit).not.toHaveBeenCalled();
    });

    it('should handle empty transaction (no operations)', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      const result = await storageTx.run(callback, mockResources);

      expect(result.success).toBe(true);
      expect(result.operationsCommitted).toBe(0);
    });

    it('should return transaction metadata in result', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      const result = await storageTx.run(callback, mockResources);

      expect(result.transactionId).toBeDefined();
      expect(typeof result.transactionId).toBe('string');
      expect(result.durationMs).toBeDefined();
      expect(typeof result.durationMs).toBe('number');
    });

    it('should reject nested transactions', async () => {
      const callback1 = vi.fn().mockImplementation(async ctx => {
        // Try to start nested transaction
        const callback2 = vi.fn().mockResolvedValue(undefined);
        await storageTx.run(callback2, mockResources);
      });

      await expect(storageTx.run(callback1, mockResources)).rejects.toThrow(/nested transaction/i);
    });

    it('should block transactions when in fatal state', async () => {
      // Manually enter fatal state
      const { TransactionStateManager } =
        await import('../../../../js/storage/transaction/transaction-state.js');
      TransactionStateManager.enterFatalState('Test fatal state', 'test-tx-id');

      const callback = vi.fn().mockResolvedValue(undefined);

      await expect(storageTx.run(callback, mockResources)).rejects.toThrow(/fatal state/i);
    });
  });

  describe('StorageTransaction.begin/commit/rollback - Manual API', () => {
    let storageTx;
    let mockResources;

    beforeEach(() => {
      storageTx = new StorageTransaction();

      mockResources = [
        {
          prepare: vi.fn().mockResolvedValue(undefined),
          commit: vi.fn().mockResolvedValue(undefined),
          rollback: vi.fn().mockResolvedValue(undefined),
          recover: vi.fn().mockResolvedValue(undefined),
        },
      ];

      // Reset transaction state before each test
      while (NestedTransactionGuard.getTransactionDepth() > 0) {
        NestedTransactionGuard.exitTransaction('test-cleanup');
      }
    });

    it('should begin transaction and return context', async () => {
      const context = await storageTx.begin(mockResources);

      expect(context).toBeDefined();
      expect(context.id).toBeDefined();
      expect(typeof context.put).toBe('function');
      expect(typeof context.delete).toBe('function');
    });

    it('should commit transaction successfully', async () => {
      const context = await storageTx.begin(mockResources);

      context.put('test-store', 'key1', 'value1');
      context.put('test-store', 'key2', 'value2');

      await storageTx.commit(context, mockResources);

      expect(mockResources[0].prepare).toHaveBeenCalled();
      expect(mockResources[0].commit).toHaveBeenCalled();
    });

    it('should rollback transaction successfully', async () => {
      const context = await storageTx.begin(mockResources);

      context.put('test-store', 'key1', 'value1');

      await storageTx.rollback(context, mockResources);

      expect(mockResources[0].rollback).toHaveBeenCalled();
    });

    it('should not commit after rollback', async () => {
      const context = await storageTx.begin(mockResources);

      context.put('test-store', 'key1', 'value1');

      await storageTx.rollback(context, mockResources);

      expect(mockResources[0].prepare).not.toHaveBeenCalled();
      expect(mockResources[0].commit).not.toHaveBeenCalled();
    });
  });

  describe('TransactionContext operations', () => {
    let storageTx;

    beforeEach(() => {
      storageTx = new StorageTransaction();

      // Reset transaction state before each test
      while (NestedTransactionGuard.getTransactionDepth() > 0) {
        NestedTransactionGuard.exitTransaction('test-cleanup');
      }
    });

    it('should queue put operations', async () => {
      const mockResources = [
        {
          prepare: vi.fn().mockResolvedValue(undefined),
          commit: vi.fn().mockResolvedValue(undefined),
          rollback: vi.fn().mockResolvedValue(undefined),
          recover: vi.fn().mockResolvedValue(undefined),
        },
      ];

      const context = await storageTx.begin(mockResources);

      context.put('store1', 'key1', 'value1');
      context.put('store1', 'key2', 'value2');
      context.put('store2', 'key3', 'value3');

      const operations = context.getOperations();
      expect(operations).toHaveLength(3);
      expect(operations[0].store).toBe('store1');
      expect(operations[0].key).toBe('key1');
      expect(operations[0].value).toBe('value1');
    });

    it('should queue delete operations', async () => {
      const mockResources = [
        {
          prepare: vi.fn().mockResolvedValue(undefined),
          commit: vi.fn().mockResolvedValue(undefined),
          rollback: vi.fn().mockResolvedValue(undefined),
          recover: vi.fn().mockResolvedValue(undefined),
        },
      ];

      const context = await storageTx.begin(mockResources);

      context.delete('store1', 'key1');
      context.delete('store2', 'key2');

      const operations = context.getOperations();
      expect(operations).toHaveLength(2);
      expect(operations[0].type).toBe('delete');
      expect(operations[0].key).toBe('key1');
    });

    it('should support backend parameter in operations', async () => {
      const mockResources = [
        {
          prepare: vi.fn().mockResolvedValue(undefined),
          commit: vi.fn().mockResolvedValue(undefined),
          rollback: vi.fn().mockResolvedValue(undefined),
          recover: vi.fn().mockResolvedValue(undefined),
        },
      ];

      const context = await storageTx.begin(mockResources);

      context.put('store1', 'key1', 'value1', 'localstorage');
      context.put('store2', 'key2', 'value2', 'indexeddb');

      const operations = context.getOperations();
      expect(operations[0].backend).toBe('localstorage');
      expect(operations[1].backend).toBe('indexeddb');
    });

    it('should throw error when exceeding max operations', async () => {
      const mockResources = [
        {
          prepare: vi.fn().mockResolvedValue(undefined),
          commit: vi.fn().mockResolvedValue(undefined),
          rollback: vi.fn().mockResolvedValue(undefined),
          recover: vi.fn().mockResolvedValue(undefined),
        },
      ];

      const context = await storageTx.begin(mockResources);

      // Try to add more than max operations (100)
      expect(() => {
        for (let i = 0; i < 101; i++) {
          context.put('store', `key${i}`, `value${i}`);
        }
      }).toThrow(/maximum operations/i);
    });
  });

  describe('Compensation Logging Integration', () => {
    it('should create CompensationLogger instance', () => {
      const storageTx = new StorageTransaction();
      expect(storageTx.logger).toBeDefined();
      expect(storageTx.logger instanceof CompensationLogger).toBe(true);
    });

    it('should export getCompensationLogs function', async () => {
      const logs = await getCompensationLogs();
      expect(Array.isArray(logs)).toBe(true);
    });
  });

  describe('State Management Integration', () => {
    beforeEach(() => {
      // Reset transaction state before each test
      while (NestedTransactionGuard.getTransactionDepth() > 0) {
        NestedTransactionGuard.exitTransaction('test-cleanup');
      }
    });

    it('should integrate with TransactionStateManager', async () => {
      const { TransactionStateManager } =
        await import('../../../../js/storage/transaction/transaction-state.js');

      expect(TransactionStateManager.isFatalState()).toBe(false);
    });

    it('should integrate with NestedTransactionGuard', async () => {
      const { NestedTransactionGuard } =
        await import('../../../../js/storage/transaction/transaction-state.js');

      expect(NestedTransactionGuard.isInTransaction()).toBe(false);
      expect(NestedTransactionGuard.getTransactionDepth()).toBe(0);
    });
  });
});
