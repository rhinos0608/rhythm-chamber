/**
 * Integration Test: Transaction Composition Root
 *
 * Verifies that all 4 transaction modules are wired together correctly
 * and can be used to execute transactions.
 *
 * @module tests/integration/transaction-composition
 */

import { describe, it, expect, vi } from 'vitest';

// Mock EventBus to avoid import chain issues
vi.mock('../../js/services/event-bus.js', () => ({
  EventBus: {
    emit: vi.fn(),
  },
}));

describe('Transaction Composition Root Integration', () => {
  it('should import all modules successfully', async () => {
    const {
      StorageTransaction,
      TransactionalResource,
      TransactionStateManager,
      NestedTransactionGuard,
      CompensationLogger,
      TwoPhaseCommitCoordinator,
      TransactionContext,
      getCompensationLogs,
      clearFatalState,
      isFatalState,
      getFatalState,
      isInTransaction,
      getTransactionDepth,
    } = await import('../../js/storage/transaction/index.js');

    // Verify all exports exist
    expect(StorageTransaction).toBeDefined();
    expect(TransactionalResource).toBeDefined();
    expect(TransactionStateManager).toBeDefined();
    expect(NestedTransactionGuard).toBeDefined();
    expect(CompensationLogger).toBeDefined();
    expect(TwoPhaseCommitCoordinator).toBeDefined();
    expect(TransactionContext).toBeDefined();
    expect(getCompensationLogs).toBeDefined();
    expect(clearFatalState).toBeDefined();
    expect(isFatalState).toBeDefined();
    expect(getFatalState).toBeDefined();
    expect(isInTransaction).toBeDefined();
    expect(getTransactionDepth).toBeDefined();
  });

  it('should create StorageTransaction instance with wired dependencies', async () => {
    const { StorageTransaction } = await import('../../js/storage/transaction/index.js');

    const tx = new StorageTransaction();

    // Verify instance has logger and coordinator
    expect(tx.logger).toBeDefined();
    expect(tx.coordinator).toBeDefined();

    // Verify API methods exist
    expect(typeof tx.run).toBe('function');
    expect(typeof tx.begin).toBe('function');
    expect(typeof tx.commit).toBe('function');
    expect(typeof tx.rollback).toBe('function');
  });

  it('should execute simple transaction with mock resources', async () => {
    const { StorageTransaction } = await import('../../js/storage/transaction/index.js');

    const tx = new StorageTransaction();

    // Create mock resource
    const mockResource = {
      prepare: async () => {},
      commit: async () => {},
      rollback: async () => {},
      recover: async () => {},
    };

    // Execute transaction
    const result = await tx.run(
      async ctx => {
        ctx.put('test-store', 'key1', 'value1');
        ctx.put('test-store', 'key2', 'value2');
      },
      [mockResource]
    );

    // Verify result
    expect(result.success).toBe(true);
    expect(result.operationsCommitted).toBe(2);
    expect(result.transactionId).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle transaction rollback on error', async () => {
    const { StorageTransaction } = await import('../../js/storage/transaction/index.js');

    const tx = new StorageTransaction();

    let rollbackCalled = false;

    // Create mock resource that tracks rollback
    const mockResource = {
      prepare: async () => {},
      commit: async () => {},
      rollback: async () => {
        rollbackCalled = true;
      },
      recover: async () => {},
    };

    // Execute transaction that fails
    await expect(
      tx.run(
        async ctx => {
          ctx.put('test-store', 'key1', 'value1');
          throw new Error('Test error');
        },
        [mockResource]
      )
    ).rejects.toThrow('Test error');

    // Verify rollback was called
    expect(rollbackCalled).toBe(true);
  });

  it('should use manual API for transaction control', async () => {
    const { StorageTransaction } = await import('../../js/storage/transaction/index.js');

    const tx = new StorageTransaction();

    const mockResource = {
      prepare: async () => {},
      commit: async () => {},
      rollback: async () => {},
      recover: async () => {},
    };

    // Begin transaction
    const ctx = await tx.begin([mockResource]);
    expect(ctx).toBeDefined();
    expect(ctx.id).toBeDefined();

    // Add operations
    ctx.put('store1', 'key1', 'value1');
    ctx.put('store2', 'key2', 'value2');

    // Commit transaction
    await tx.commit(ctx, [mockResource]);

    // Verify context was updated
    expect(ctx.operations).toHaveLength(2);
  });

  it('should integrate with state management', async () => {
    const { TransactionStateManager, NestedTransactionGuard, clearFatalState } =
      await import('../../js/storage/transaction/index.js');

    // Clear any existing state
    clearFatalState();

    // Verify initial state
    expect(TransactionStateManager.isFatalState()).toBe(false);
    expect(NestedTransactionGuard.isInTransaction()).toBe(false);
    expect(NestedTransactionGuard.getTransactionDepth()).toBe(0);

    // Test fatal state
    TransactionStateManager.enterFatalState('Test', 'tx-123');
    expect(TransactionStateManager.isFatalState()).toBe(true);

    const fatalState = TransactionStateManager.getFatalState();
    expect(fatalState.reason).toBe('Test');
    expect(fatalState.transactionId).toBe('tx-123');

    // Clear fatal state
    clearFatalState();
    expect(TransactionStateManager.isFatalState()).toBe(false);
  });
});
