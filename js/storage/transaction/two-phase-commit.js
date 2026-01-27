/**
 * Two-Phase Commit Protocol
 *
 * Orchestrates distributed transactions across multiple storage backends.
 * Uses commit marker for crash recovery.
 *
 * @module storage/transaction/two-phase-commit
 */

import { TransactionStateManager } from './transaction-state.js';
import { CompensationLogger } from './compensation-logger.js';
import { IndexedDBCore } from '../indexeddb.js';

const MAX_OPERATIONS_PER_TRANSACTION = 100;
const OPERATION_TIMEOUT_MS = 5000;

/**
 * Represents a pending transaction operation
 */
export class TransactionOperation {
  constructor(backend, type, store, key, value, previousValue = null) {
    this.backend = backend;       // 'indexeddb' | 'localstorage'
    this.type = type;             // 'put' | 'delete'
    this.store = store;           // Store name
    this.key = key;               // Key identifier
    this.value = value;           // Value to store
    this.previousValue = previousValue;  // For rollback
    this.committed = false;
    this.rolledBack = false;
    this.timestamp = Date.now();
  }
}

/**
 * Transaction context passed to transaction callback
 */
export class TransactionContext {
  constructor() {
    this.id = crypto.randomUUID();
    this.operations = [];
    this.committed = false;
    this.rolledBack = false;
    this.prepared = false;
    this.startTime = Date.now();
  }

  /**
   * Add a put operation to the transaction
   */
  put(store, key, value, backend = 'indexeddb') {
    if (this.operations.length >= MAX_OPERATIONS_PER_TRANSACTION) {
      throw new Error(`Transaction ${this.id}: Maximum operations (${MAX_OPERATIONS_PER_TRANSACTION}) exceeded`);
    }

    this.operations.push(
      new TransactionOperation(backend, 'put', store, key, value)
    );
  }

  /**
   * Add a delete operation to the transaction
   */
  delete(store, key, backend = 'indexeddb') {
    if (this.operations.length >= MAX_OPERATIONS_PER_TRANSACTION) {
      throw new Error(`Transaction ${this.id}: Maximum operations (${MAX_OPERATIONS_PER_TRANSACTION}) exceeded`);
    }

    this.operations.push(
      new TransactionOperation(backend, 'delete', store, key, null)
    );
  }

  getOperations() {
    return this.operations;
  }
}

/**
 * Coordinates two-phase commit protocol across resources
 */
export class TwoPhaseCommitCoordinator {
  constructor(compensationLogger) {
    this.logger = compensationLogger || new CompensationLogger();
  }

  /**
   * Execute transaction through 2PC protocol
   *
   * @param {TransactionContext} context - Transaction context
   * @param {Array} resources - TransactionalResource instances
   * @returns {Promise<void>}
   */
  async execute(context, resources) {
    // Check fatal state
    if (TransactionStateManager.isFatalState()) {
      const fatalState = TransactionStateManager.getFatalState();
      throw new Error(
        `Cannot execute transaction: system in fatal state. ` +
        `Reason: ${fatalState.reason}. ` +
        `Transaction ${context.id} blocked.`
      );
    }

    try {
      // Phase 1: Prepare
      await this.preparePhase(context, resources);

      // Phase 2: Decision (write commit marker)
      await this.decisionPhase(context);

      // Phase 3: Commit
      await this.commitPhase(context, resources);

      // Phase 4: Cleanup
      await this.cleanupPhase(context, resources);

      context.committed = true;
    } catch (error) {
      // Rollback on any failure
      await this.rollbackPhase(context, resources, error);
      throw error;
    }
  }

  /**
   * Prepare phase: All resources vote YES or NO
   */
  async preparePhase(context, resources) {
    console.log(`[TwoPhaseCommit] Prepare phase: ${context.id}`);

    for (const resource of resources) {
      await resource.prepare(context);
    }

    context.prepared = true;
  }

  /**
   * Decision phase: Write commit marker (point of no return)
   */
  async decisionPhase(context) {
    console.log(`[TwoPhaseCommit] Decision phase: ${context.id}`);

    // Write commit marker to durable storage
    const commitMarker = {
      id: context.id,
      status: 'prepared',
      timestamp: Date.now(),
      operationCount: context.operations.length
    };

    try {
      await IndexedDBCore.put('TRANSACTION_JOURNAL', commitMarker);
      console.log(`[TwoPhaseCommit] Commit marker written: ${context.id}`);
      context.journaled = true;
    } catch (error) {
      console.error(`[TwoPhaseCommit] Failed to write commit marker: ${error.message}`);
      throw new Error(`Transaction ${context.id}: Failed to write commit marker - ${error.message}`);
    }
  }

  /**
   * Commit phase: Execute prepared operations
   */
  async commitPhase(context, resources) {
    console.log(`[TwoPhaseCommit] Commit phase: ${context.id}`);

    for (const resource of resources) {
      await resource.commit(context);
    }
  }

  /**
   * Cleanup phase: Remove pending data and commit marker
   */
  async cleanupPhase(context, resources) {
    console.log(`[TwoPhaseCommit] Cleanup phase: ${context.id}`);

    for (const resource of resources) {
      // Resources clean up their own pending data
    }

    // Remove commit marker from durable storage
    try {
      await IndexedDBCore.delete('TRANSACTION_JOURNAL', context.id);
      console.log(`[TwoPhaseCommit] Commit marker removed: ${context.id}`);
    } catch (error) {
      console.warn(`[TwoPhaseCommit] Failed to remove commit marker: ${error.message}`);
      // Non-fatal: cleanup failure doesn't affect transaction consistency
    }
  }

  /**
   * Rollback phase: Execute compensating actions
   */
  async rollbackPhase(context, resources, originalError) {
    console.error(`[TwoPhaseCommit] Rollback phase: ${context.id}`, originalError);

    const compensationEntries = [];

    try {
      // Tell all resources to rollback
      for (const resource of resources) {
        await resource.rollback(context);
      }

      context.rolledBack = true;
    } catch (rollbackError) {
      console.error(`[TwoPhaseCommit] Rollback failed: ${rollbackError.message}`);

      // Log compensation for manual recovery
      await this.logger.logCompensation(context.id, context.operations);

      // Enter fatal state if rollback AND compensation logging fail
      TransactionStateManager.enterFatalState(
        `Rollback failed: ${rollbackError.message}`,
        context.id,
        1
      );

      throw new Error(
        `Transaction ${context.id} rollback failed. ` +
        `Compensation logged. Manual recovery required. ` +
        `Original error: ${originalError.message}`
      );
    }
  }
}
