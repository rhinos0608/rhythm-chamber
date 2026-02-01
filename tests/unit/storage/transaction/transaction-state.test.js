import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TransactionStateManager,
  NestedTransactionGuard,
} from '../../../../js/storage/transaction/transaction-state.js';

// Mock EventBus to avoid import chain issues
vi.mock('../../../../js/services/event-bus.js', () => ({
  EventBus: {
    emit: vi.fn(),
  },
}));

describe('TransactionStateManager', () => {
  beforeEach(() => {
    TransactionStateManager.clearFatalState('test cleanup');
  });

  describe('fatal state management', () => {
    it('should detect non-fatal state', () => {
      expect(TransactionStateManager.isFatalState()).toBe(false);
      expect(TransactionStateManager.getFatalState()).toBe(null);
    });

    it('should enter fatal state with details', () => {
      TransactionStateManager.enterFatalState('Test failure', 'txn-123', 5);

      expect(TransactionStateManager.isFatalState()).toBe(true);

      const state = TransactionStateManager.getFatalState();
      expect(state.reason).toBe('Test failure');
      expect(state.transactionId).toBe('txn-123');
      expect(state.compensationLogCount).toBe(5);
      expect(state.timestamp).toBeGreaterThan(0);
    });

    it('should clear fatal state', () => {
      TransactionStateManager.enterFatalState('Test', 'txn-1');
      expect(TransactionStateManager.isFatalState()).toBe(true);

      TransactionStateManager.clearFatalState('Manual fix');
      expect(TransactionStateManager.isFatalState()).toBe(false);
    });
  });
});

describe('NestedTransactionGuard', () => {
  it('should track transaction depth', () => {
    expect(NestedTransactionGuard.isInTransaction()).toBe(false);
    expect(NestedTransactionGuard.getTransactionDepth()).toBe(0);

    NestedTransactionGuard.enterTransaction('txn-1');
    expect(NestedTransactionGuard.isInTransaction()).toBe(true);
    expect(NestedTransactionGuard.getTransactionDepth()).toBe(1);

    NestedTransactionGuard.exitTransaction('txn-1');
    expect(NestedTransactionGuard.isInTransaction()).toBe(false);
    expect(NestedTransactionGuard.getTransactionDepth()).toBe(0);
  });

  it('should reject nested transactions', () => {
    NestedTransactionGuard.enterTransaction('txn-1');

    expect(() => {
      NestedTransactionGuard.enterTransaction('txn-2');
    }).toThrow('Nested transaction detected');
  });
});
