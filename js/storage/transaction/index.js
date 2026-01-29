/**
 * Transaction Composition Root
 *
 * Wires together all transaction modules into a cohesive API:
 * - TransactionalResource (base interface)
 * - TransactionStateManager (fatal state & nested transaction guards)
 * - CompensationLogger (rollback failure logging)
 * - TwoPhaseCommitCoordinator (protocol orchestrator)
 *
 * Provides StorageTransaction facade class with simple API that wraps
 * the two-phase commit protocol.
 *
 * @module storage/transaction/index
 */

import { TransactionalResource } from './transactional-resource.js';
import { TransactionStateManager, NestedTransactionGuard } from './transaction-state.js';
import { CompensationLogger } from './compensation-logger.js';
import {
  TwoPhaseCommitCoordinator,
  TransactionContext
} from './two-phase-commit.js';

// ==========================================
// Composition: Wire up dependencies
// ==========================================

/**
 * Create singleton compensation logger instance
 * Shared across all transactions for three-tier fallback storage
 */
const compensationLogger = new CompensationLogger();

/**
 * Create singleton 2PC coordinator instance
 * Coordinates protocol across all transactional resources
 */
const coordinator = new TwoPhaseCommitCoordinator(compensationLogger);

// ==========================================
// StorageTransaction Facade Class
// ==========================================

/**
 * StorageTransaction facade class
 *
 * Provides simple API for running transactions while internally
 * coordinating the two-phase commit protocol across multiple resources.
 *
 * Supports two usage patterns:
 * 1. High-level API: `run(callback, resources)` - automatic commit/rollback
 * 2. Manual API: `begin()`, `commit()`, `rollback()` - explicit control
 *
 * @example
 * // High-level API (recommended)
 * const tx = new StorageTransaction();
 * const result = await tx.run(async (ctx) => {
 *   ctx.put('users', 'user1', { name: 'Alice' });
 *   ctx.put('settings', 'theme', 'dark');
 * }, [indexedDBResource, localStorageResource]);
 *
 * @example
 * // Manual API
 * const tx = new StorageTransaction();
 * const ctx = await tx.begin([indexedDBResource, localStorageResource]);
 * ctx.put('users', 'user1', { name: 'Alice' });
 * await tx.commit(ctx, [indexedDBResource, localStorageResource]);
 */
export class StorageTransaction {
  constructor() {
    this.logger = compensationLogger;
    this.coordinator = coordinator;
  }

  /**
   * High-level API: Run transaction with automatic commit/rollback
   *
   * Executes the callback function with a transaction context, then
   * automatically commits if successful or rolls back if the callback fails.
   *
   * @param {Function} callback - Async function receiving TransactionContext
   * @param {Array<TransactionalResource>} resources - Array of transactional resources
   * @returns {Promise<{success: boolean, operationsCommitted: number, transactionId: string, durationMs: number}>}
   * @throws {Error} If transaction fails, is nested, or system is in fatal state
   */
  async run(callback, resources = []) {
    const startTime = Date.now();

    // Check fatal state
    if (TransactionStateManager.isFatalState()) {
      const fatalState = TransactionStateManager.getFatalState();
      throw new Error(
        `Cannot execute transaction: system in fatal state. ` +
        `Reason: ${fatalState.reason}. ` +
        `Transaction ID: ${fatalState.transactionId}. ` +
        `Please refresh the page and contact support if the issue persists.`
      );
    }

    // Create transaction context
    const context = new TransactionContext();

    // Guard against nested transactions
    NestedTransactionGuard.enterTransaction(context.id);

    try {
      // Phase 0: Execute callback to collect operations
      await callback(context);

      // If no operations, return early
      if (context.operations.length === 0) {
        return {
          success: true,
          operationsCommitted: 0,
          transactionId: context.id,
          durationMs: Date.now() - startTime
        };
      }

      // Execute 2PC protocol through coordinator
      await this.coordinator.execute(context, resources);

      // Return success result
      return {
        success: true,
        operationsCommitted: context.operations.length,
        transactionId: context.id,
        durationMs: Date.now() - startTime
      };
    } catch (error) {
      // If callback failed after adding operations, rollback manually
      // (coordinator.execute() wasn't called yet, so it couldn't handle rollback)
      if (context.operations.length > 0 && !context.prepared) {
        try {
          await this.coordinator.rollbackPhase(context, resources, error);
        } catch (rollbackError) {
          // Rollback failed - error will be propagated
          console.error('[StorageTransaction] Rollback failed:', rollbackError);
        }
      }

      // Re-throw original error
      throw error;
    } finally {
      // Exit transaction (decrement depth)
      NestedTransactionGuard.exitTransaction(context.id);
    }
  }

  /**
   * Manual API: Begin a new transaction
   *
   * Creates a new transaction context but doesn't execute the protocol yet.
   * Use this for manual control over when commit/rollback happens.
   *
   * @param {Array<TransactionalResource>} resources - Array of transactional resources
   * @returns {Promise<TransactionContext>} Transaction context for adding operations
   * @throws {Error} If nested transaction detected or system in fatal state
   */
  async begin(resources = []) {
    // Check fatal state
    if (TransactionStateManager.isFatalState()) {
      const fatalState = TransactionStateManager.getFatalState();
      throw new Error(
        `Cannot begin transaction: system in fatal state. ` +
        `Reason: ${fatalState.reason}. ` +
        `Transaction ID: ${fatalState.transactionId}.`
      );
    }

    // Create transaction context
    const context = new TransactionContext();

    // Guard against nested transactions
    NestedTransactionGuard.enterTransaction(context.id);

    return context;
  }

  /**
   * Manual API: Commit a transaction
   *
   * Executes the two-phase commit protocol for the given context.
   *
   * @param {TransactionContext} context - Transaction context from begin()
   * @param {Array<TransactionalResource>} resources - Array of transactional resources
   * @returns {Promise<void>}
   * @throws {Error} If commit fails, triggers automatic rollback
   */
  async commit(context, resources = []) {
    try {
      // If no operations, skip protocol
      if (context.operations.length === 0) {
        NestedTransactionGuard.exitTransaction(context.id);
        return;
      }

      // Execute 2PC protocol through coordinator
      await this.coordinator.execute(context, resources);
    } finally {
      // Always exit transaction
      NestedTransactionGuard.exitTransaction(context.id);
    }
  }

  /**
   * Manual API: Rollback a transaction
   *
   * Executes rollback for all operations in the context.
   *
   * @param {TransactionContext} context - Transaction context from begin()
   * @param {Array<TransactionalResource>} resources - Array of transactional resources
   * @returns {Promise<void>}
   */
  async rollback(context, resources = []) {
    try {
      // If no operations, nothing to rollback
      if (context.operations.length === 0) {
        NestedTransactionGuard.exitTransaction(context.id);
        return;
      }

      // Execute rollback through coordinator
      await this.coordinator.rollbackPhase(context, resources, new Error('Manual rollback'));
    } finally {
      // Always exit transaction
      NestedTransactionGuard.exitTransaction(context.id);
    }
  }

  /**
   * BACKWARD COMPATIBILITY: Static transaction method
   *
   * This method provides backward compatibility with the old API.
   * It creates a new instance and calls the run() method.
   *
   * @deprecated Use new StorageTransaction().run(callback, resources) instead
   * @param {Function} callback - Async function receiving TransactionContext
   * @returns {Promise<{success: boolean, operationsCommitted: number, transactionId: string, durationMs: number}>}
   */
  static async transaction(callback) {
    const instance = new StorageTransaction();
    return instance.run(callback, []);
  }

  /**
   * BACKWARD COMPATIBILITY: Static isFatalState method
   *
   * @deprecated Use isFatalState() function from module instead
   * @returns {boolean} True if in fatal state
   */
  static isFatalState() {
    return TransactionStateManager.isFatalState();
  }

  /**
   * BACKWARD COMPATIBILITY: Static getFatalState method
   *
   * @deprecated Use getFatalState() function from module instead
   * @returns {Object|null} Fatal state or null if not fatal
   */
  static getFatalState() {
    return TransactionStateManager.getFatalState();
  }

  /**
   * BACKWARD COMPATIBILITY: Static clearFatalState method
   *
   * @deprecated Use clearFatalState(reason) function from module instead
   * @param {string} [reason] - Reason for clearing
   */
  static clearFatalState(reason = 'Manual recovery') {
    TransactionStateManager.clearFatalState(reason);
  }

  /**
   * BACKWARD COMPATIBILITY: Static getCompensationLogs method
   *
   * @deprecated Use getCompensationLogs() function from module instead
   * @returns {Promise<Array>} Array of compensation log entries
   */
  static async getCompensationLogs() {
    return compensationLogger.getAllCompensationLogs();
  }

  /**
   * BACKWARD COMPATIBILITY: FATAL_STATE property getter
   *
   * @deprecated Use getFatalState() instead
   * @returns {Object|null} Fatal state object
   */
  static get FATAL_STATE() {
    return TransactionStateManager.getFatalState();
  }

  /**
   * BACKWARD COMPATIBILITY: FATAL_STATE property setter
   *
   * @deprecated Use TransactionStateManager.setFatalState() for testing only
   * @param {Object} value - Fatal state value to set
   */
  static set FATAL_STATE(value) {
    if (value && value.isFatal) {
      TransactionStateManager.setFatalState(value.reason || 'Test fatal state', value);
    } else {
      TransactionStateManager.clearFatalState('Test cleanup');
    }
  }

  /**
   * BACKWARD COMPATIBILITY: Access to compensation logger methods
   *
   * @deprecated Use module-level functions instead
   * @returns {CompensationLogger} The compensation logger instance
   */
  static get _compensationLogger() {
    return compensationLogger;
  }

  /**
   * BACKWARD COMPATIBILITY: addInMemoryCompensationLog
   *
   * @deprecated Use compensation logger directly
   * @param {string} transactionId - Transaction ID
   * @param {Array} entries - Compensation log entries
   */
  static addInMemoryCompensationLog(transactionId, entries) {
    compensationLogger.addInMemoryCompensationLog(transactionId, entries);
  }

  /**
   * BACKWARD COMPATIBILITY: getAllInMemoryCompensationLogs
   *
   * @deprecated Use compensation logger directly
   * @returns {Array} Array of in-memory log entries
   */
  static getAllInMemoryCompensationLogs() {
    return compensationLogger.getAllInMemoryCompensationLogs();
  }

  /**
   * BACKWARD COMPATIBILITY: clearInMemoryCompensationLog
   *
   * @deprecated Use compensation logger directly
   * @param {string} transactionId - Transaction ID
   */
  static clearInMemoryCompensationLog(transactionId) {
    compensationLogger.clearInMemoryCompensationLog(transactionId);
  }

  /**
   * BACKWARD COMPATIBILITY: resolveCompensationLog
   *
   * @deprecated Use compensation logger directly
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<boolean>} True if log was resolved
   */
  static async resolveCompensationLog(transactionId) {
    return compensationLogger.resolveCompensationLog(transactionId);
  }

  /**
   * BACKWARD COMPATIBILITY: clearResolvedCompensationLogs
   *
   * @deprecated Use compensation logger directly
   * @returns {Promise<number>} Number of logs cleared
   */
  static async clearResolvedCompensationLogs() {
    return compensationLogger.clearResolvedCompensationLogs();
  }
}

// ==========================================
// Public API Exports
// ==========================================

/**
 * Get all compensation logs from all storage tiers
 * Useful for manual recovery and debugging
 *
 * @returns {Promise<Array>} Array of compensation log entries
 */
export async function getCompensationLogs() {
  return compensationLogger.getAllCompensationLogs();
}

/**
 * Clear fatal error state (requires explicit user action)
 * Should only be called after manual recovery/verification
 *
 * @param {string} [reason] - Reason for clearing
 */
export function clearFatalState(reason = 'Manual recovery') {
  TransactionStateManager.clearFatalState(reason);
}

/**
 * Check if system is in fatal error state
 *
 * @returns {boolean} True if in fatal state
 */
export function isFatalState() {
  return TransactionStateManager.isFatalState();
}

/**
 * Get fatal error state details
 *
 * @returns {Object|null} Fatal state or null if not fatal
 */
export function getFatalState() {
  return TransactionStateManager.getFatalState();
}

/**
 * Check if currently inside a transaction
 *
 * @returns {boolean} True if a transaction is active
 */
export function isInTransaction() {
  return NestedTransactionGuard.isInTransaction();
}

/**
 * Get current transaction depth
 *
 * @returns {number} Current nesting depth
 */
export function getTransactionDepth() {
  return NestedTransactionGuard.getTransactionDepth();
}

// ==========================================
// Export All Modules
// ==========================================

export {
  // Base interface
  TransactionalResource,

  // State management
  TransactionStateManager,
  NestedTransactionGuard,

  // Compensation logging
  CompensationLogger,

  // Protocol coordinator
  TwoPhaseCommitCoordinator,
  TransactionContext
};
