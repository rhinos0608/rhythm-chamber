# God Object Refactoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor three God objects (transaction.js, validation.js, storage.js) into focused, single-responsibility modules using hybrid decomposition approach.

**Architecture:** Medium-grained module decomposition for transaction.js (4 files), service class extraction for validation.js crypto hashing and storage.js auto-repair. Feature flags enable safe migration between old and new implementations.

**Tech Stack:** ES6 Modules, IndexedDB, localStorage, EventBus, JSDoc, existing test infrastructure

---

## Overview

This plan refactors three God objects in parallel work streams:

- **Stream A**: Transaction.js → 4-module decomposition (most complex)
- **Stream B**: Validation.js → Extract crypto hashing (simplest)
- **Stream C**: Storage.js → Extract auto-repair service (medium)

Each stream can execute independently after the sequential foundation tasks.

---

## SEQUENTIAL FOUNDATION (Complete First)

### Task 1: Create Feature Flag Infrastructure

**Files:**

- Create: `js/config/refactoring-flags.js`

**Context:**
Global feature flags control whether new or legacy implementations are used. This allows safe toggling during development.

**Step 1: Create feature flag file**

```javascript
/**
 * Refactoring Feature Flags
 *
 * Toggle between old and new implementations during development.
 * Once new implementations are verified, these flags and legacy code will be removed.
 *
 * @module config/refactoring-flags
 */

/**
 * Feature flags for God object refactoring
 * @type {Object}
 */
export const REFACTORING_FLAGS = {
  /** Use new transaction module decomposition (4 files) vs legacy transaction.js */
  USE_NEW_TRANSACTION: true,

  /** Use new crypto-hashing.js module vs legacy inline hashing in validation.js */
  USE_NEW_CRYPTO_HASHING: true,

  /** Use new auto-repair.js service vs legacy inline implementation in storage.js */
  USE_NEW_AUTO_REPAIR: true,
};
```

**Step 2: Commit**

```bash
git add js/config/refactoring-flags.js
git commit -m "feat(refactoring): add feature flag infrastructure"
```

---

### Task 2: Create Transaction Module Directory

**Files:**

- Create: `js/storage/transaction/` (directory)

**Context:**
Create the directory structure for transaction module decomposition.

**Step 1: Create directory with .gitkeep**

```bash
mkdir -p js/storage/transaction
touch js/storage/transaction/.gitkeep
```

**Step 2: Commit**

```bash
git add js/storage/transaction/.gitkeep
git commit -m "feat(refactoring): create transaction module directory"
```

---

## STREAM A: Transaction Decomposition (4 Modules)

### Task A1: Create Transactional Resource Interface

**Files:**

- Create: `js/storage/transaction/transactional-resource.js`

**Context:**
Base interface that all storage backends must implement. Defines the contract for 2PC protocol participation.

**Step 1: Write the interface definition**

```javascript
/**
 * Transactional Resource Interface
 *
 * Defines the contract that storage backends must implement to participate
 * in the two-phase commit protocol.
 *
 * @module storage/transaction/transactional-resource
 */

/**
 * Base class for transactional storage resources
 * Implements the two-phase commit protocol: prepare, commit, rollback
 */
export class TransactionalResource {
  /**
   * Prepare the resource to commit changes
   * This is the "voting" phase - guarantees that commit() will succeed
   *
   * @param {Object} context - Transaction context
   * @param {string} context.transactionId - Unique transaction identifier
   * @returns {Promise<void>}
   * @throws {Error} If prepare fails (votes NO)
   */
  async prepare(context) {
    throw new Error('TransactionalResource.prepare() must be implemented');
  }

  /**
   * Commit the prepared changes
   * Must be idempotent - safe to call multiple times with same context
   *
   * @param {Object} context - Transaction context
   * @returns {Promise<void>}
   */
  async commit(context) {
    throw new Error('TransactionalResource.commit() must be implemented');
  }

  /**
   * Rollback prepared or partially applied changes
   *
   * @param {Object} context - Transaction context
   * @returns {Promise<void>}
   */
  async rollback(context) {
    throw new Error('TransactionalResource.rollback() must be implemented');
  }

  /**
   * Recovery handler for application startup
   * Scans for pending data and decides roll-forward vs rollback based on commit marker
   *
   * @param {Function} isTxPendingCommit - Callback to check if transaction has commit marker
   * @param {string} transactionId - Transaction ID to check
   * @returns {Promise<boolean>} - True if transaction should be rolled forward
   * @returns {Promise<void>}
   */
  async recover(isTxPendingCommit) {
    throw new Error('TransactionalResource.recover() must be implemented');
  }
}
```

**Step 2: Commit**

```bash
git add js/storage/transaction/transactional-resource.js
git commit -m "feat(transaction): add TransactionalResource interface"
```

---

### Task A2: Create Transaction State Manager

**Files:**

- Create: `js/storage/transaction/transaction-state.js`
- Reference: `js/storage/transaction.js:39-114` (extract fatal state logic)
- Reference: `js/storage/transaction.js:59-68` (extract nested transaction logic)

**Context:**
Extracts fatal error state management and nested transaction detection into a focused module.

**Step 1: Write transaction state manager**

```javascript
/**
 * Transaction State Management
 *
 * Manages fatal error state and nested transaction detection.
 * Prevents cascade failures and undefined behavior.
 *
 * @module storage/transaction/transaction-state
 */

import { EventBus } from '../../services/event-bus.js';

// ==========================================
// Fatal Error State
// ==========================================

/**
 * CRITICAL: Fatal error state prevents cascade failures
 *
 * When transaction rollback fails and all compensation logging fails,
 * the system enters a fatal state where data integrity cannot be guaranteed.
 * All new transactions are blocked until the fatal state is cleared.
 */
let FATAL_STATE = {
  isFatal: false,
  reason: null,
  timestamp: null,
  transactionId: null,
  compensationLogCount: 0,
};

// ==========================================
// Nested Transaction Detection
// ==========================================

let transactionDepth = 0;
const NESTED_TRANSACTION_STACK = [];

/**
 * Manages fatal error state for transactions
 */
export class TransactionStateManager {
  /**
   * Check if system is in fatal error state
   * @returns {boolean} True if in fatal state
   */
  static isFatalState() {
    return FATAL_STATE.isFatal;
  }

  /**
   * Get fatal error state details
   * @returns {Object|null} Fatal state or null if not fatal
   */
  static getFatalState() {
    if (!FATAL_STATE.isFatal) {
      return null;
    }
    return { ...FATAL_STATE };
  }

  /**
   * Enter fatal error state (blocks all new transactions)
   * @param {string} reason - Reason for fatal state
   * @param {string} transactionId - Failed transaction ID
   * @param {number} compensationLogCount - Number of compensation logs
   */
  static enterFatalState(reason, transactionId, compensationLogCount = 0) {
    console.error('[TransactionState] Entering FATAL state:', reason);

    FATAL_STATE = {
      isFatal: true,
      reason,
      timestamp: Date.now(),
      transactionId,
      compensationLogCount,
    };

    EventBus.emit('transaction:fatal_state', { ...FATAL_STATE });
  }

  /**
   * Clear fatal error state (requires explicit user action)
   * @param {string} reason - Reason for clearing
   */
  static clearFatalState(reason = 'Manual recovery') {
    if (FATAL_STATE.isFatal) {
      console.warn('[TransactionState] Fatal state cleared:', reason);
      FATAL_STATE = {
        isFatal: false,
        reason: null,
        timestamp: null,
        transactionId: null,
        compensationLogCount: 0,
      };
      EventBus.emit('transaction:fatal_cleared', { reason, timestamp: Date.now() });
    }
  }
}

/**
 * Guards against nested transaction hazards
 */
export class NestedTransactionGuard {
  /**
   * Check if currently inside a transaction
   * @returns {boolean} True if a transaction is active
   */
  static isInTransaction() {
    return transactionDepth > 0;
  }

  /**
   * Get current transaction depth
   * @returns {number} Current nesting depth
   */
  static getTransactionDepth() {
    return transactionDepth;
  }

  /**
   * Enter transaction (increment depth)
   * @param {string} transactionId - Transaction ID for tracking
   * @throws {Error} If nested transaction detected
   */
  static enterTransaction(transactionId) {
    if (transactionDepth > 0) {
      const error = new Error(
        `[TransactionState] Nested transaction detected. ` +
          `Current: ${NESTED_TRANSACTION_STACK[transactionDepth - 1]}, ` +
          `Attempted: ${transactionId}. ` +
          `Nested transactions can cause deadlocks and undefined behavior.`
      );
      console.error(error.message);
      throw error;
    }

    transactionDepth++;
    NESTED_TRANSACTION_STACK.push(transactionId);
  }

  /**
   * Exit transaction (decrement depth)
   * @param {string} transactionId - Transaction ID to verify
   * @throws {Error} If transaction ID doesn't match
   */
  static exitTransaction(transactionId) {
    const topId = NESTED_TRANSACTION_STACK.pop();

    if (topId !== transactionId) {
      console.error(
        `[TransactionState] Transaction depth mismatch. ` +
          `Expected: ${topId}, Got: ${transactionId}`
      );
    }

    transactionDepth = Math.max(0, transactionDepth - 1);
  }
}
```

**Step 2: Write tests**

```bash
mkdir -p tests/unit/storage/transaction
```

```javascript
// tests/unit/storage/transaction/transaction-state.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TransactionStateManager,
  NestedTransactionGuard,
} from '../../../../js/storage/transaction/transaction-state.js';

describe('TransactionStateManager', () => {
  beforeEach(() => {
    // Reset state before each test
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
```

**Step 3: Run tests**

```bash
npm test -- tests/unit/storage/transaction/transaction-state.test.js
```

Expected: PASS

**Step 4: Commit**

```bash
git add js/storage/transaction/transaction-state.js tests/unit/storage/transaction/transaction-state.test.js
git commit -m "feat(transaction): extract state management module"
```

---

### Task A3: Create Compensation Logger

**Files:**

- Create: `js/storage/transaction/compensation-logger.js`
- Reference: `js/storage/transaction.js:135-187` (in-memory compensation log)
- Reference: `js/storage/transaction.js:COMPENSATION_LOG_STORE` constant

**Context:**
Extracts all compensation logging logic into a focused service with three-tier fallback (IndexedDB → localStorage → memory).

**Step 1: Write compensation logger**

```javascript
/**
 * Compensation Logger
 *
 * Logs failed transaction rollbacks for manual recovery.
 * Three-tier fallback: IndexedDB → localStorage → in-memory Map
 *
 * @module storage/transaction/compensation-logger
 */

import { IndexedDBCore } from '../indexeddb.js';
import { TransactionStateManager } from './transaction-state.js';

const COMPENSATION_LOG_STORE = 'TRANSACTION_COMPENSATION';
const MAX_MEMORY_LOGS = 100;

/**
 * Manages compensation logging for transaction rollback failures
 */
export class CompensationLogger {
  constructor() {
    this.memoryLogs = new Map();
  }

  /**
   * Log compensation entries for failed rollback
   * Tries IndexedDB, falls back to localStorage, then memory
   *
   * @param {string} transactionId - Transaction ID
   * @param {Array} entries - Compensation log entries
   * @returns {Promise<void>}
   */
  async logCompensation(transactionId, entries) {
    const logEntry = {
      id: transactionId,
      entries,
      timestamp: Date.now(),
      resolved: false,
    };

    // Try IndexedDB first
    try {
      await this._logToIndexedDB(transactionId, logEntry);
      console.warn(`[CompensationLogger] Logged to IndexedDB: ${transactionId}`);
      return;
    } catch (error) {
      console.warn(`[CompensationLogger] IndexedDB failed: ${error.message}`);
    }

    // Fallback to localStorage
    try {
      this._logToLocalStorage(transactionId, logEntry);
      console.warn(`[CompensationLogger] Logged to localStorage: ${transactionId}`);
      return;
    } catch (error) {
      console.warn(`[CompensationLogger] localStorage failed: ${error.message}`);
    }

    // Final fallback: in-memory Map
    this._logToMemory(transactionId, logEntry);
    console.warn(`[CompensationLogger] Logged to memory (final fallback): ${transactionId}`);
  }

  /**
   * Get compensation log for a specific transaction
   * Searches all three storage tiers
   *
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object|null>} Log entry or null
   */
  async getCompensationLog(transactionId) {
    // Check memory first (fastest)
    if (this.memoryLogs.has(transactionId)) {
      return this.memoryLogs.get(transactionId);
    }

    // Check IndexedDB
    try {
      const idbLog = await this._getFromIndexedDB(transactionId);
      if (idbLog) return idbLog;
    } catch (error) {
      console.warn(`[CompensationLogger] IndexedDB read failed: ${error.message}`);
    }

    // Check localStorage
    try {
      const lsLog = this._getFromLocalStorage(transactionId);
      if (lsLog) return lsLog;
    } catch (error) {
      console.warn(`[CompensationLogger] localStorage read failed: ${error.message}`);
    }

    return null;
  }

  /**
   * Get all compensation logs from all storage tiers
   *
   * @returns {Promise<Array>} Array of all log entries
   */
  async getAllCompensationLogs() {
    const logs = [];

    // Collect from memory
    logs.push(...Array.from(this.memoryLogs.values()));

    // Collect from IndexedDB
    try {
      const idbLogs = await this._getAllFromIndexedDB();
      logs.push(...idbLogs);
    } catch (error) {
      console.warn(`[CompensationLogger] IndexedDB scan failed: ${error.message}`);
    }

    // Collect from localStorage
    try {
      const lsLogs = this._getAllFromLocalStorage();
      logs.push(...lsLogs);
    } catch (error) {
      console.warn(`[CompensationLogger] localStorage scan failed: ${error.message}`);
    }

    return logs;
  }

  /**
   * Clear compensation log (mark as resolved)
   *
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<boolean>} True if log was found and cleared
   */
  async clearCompensationLog(transactionId) {
    let cleared = false;

    // Clear from memory
    if (this.memoryLogs.has(transactionId)) {
      this.memoryLogs.delete(transactionId);
      cleared = true;
    }

    // Clear from IndexedDB
    try {
      const idbCleared = await this._clearFromIndexedDB(transactionId);
      if (idbCleared) cleared = true;
    } catch (error) {
      console.warn(`[CompensationLogger] IndexedDB clear failed: ${error.message}`);
    }

    // Clear from localStorage
    try {
      const lsCleared = this._clearFromLocalStorage(transactionId);
      if (lsCleared) cleared = true;
    } catch (error) {
      console.warn(`[CompensationLogger] localStorage clear failed: ${error.message}`);
    }

    return cleared;
  }

  // ==========================================
  // Private: IndexedDB Storage
  // ==========================================

  async _logToIndexedDB(transactionId, logEntry) {
    // Note: Will be implemented with IndexedDBCore access
    throw new Error('IndexedDB storage not yet implemented');
  }

  async _getFromIndexedDB(transactionId) {
    // Note: Will be implemented with IndexedDBCore access
    return null;
  }

  async _getAllFromIndexedDB() {
    // Note: Will be implemented with IndexedDBCore access
    return [];
  }

  async _clearFromIndexedDB(transactionId) {
    // Note: Will be implemented with IndexedDBCore access
    return false;
  }

  // ==========================================
  // Private: localStorage Fallback
  // ==========================================

  _logToLocalStorage(transactionId, logEntry) {
    const key = `comp_log_${transactionId}`;
    localStorage.setItem(key, JSON.stringify(logEntry));
  }

  _getFromLocalStorage(transactionId) {
    const key = `comp_log_${transactionId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  _getAllFromLocalStorage() {
    const logs = [];
    const prefix = 'comp_log_';

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const data = localStorage.getItem(key);
        if (data) {
          logs.push(JSON.parse(data));
        }
      }
    }

    return logs;
  }

  _clearFromLocalStorage(transactionId) {
    const key = `comp_log_${transactionId}`;
    const hadEntry = localStorage.getItem(key) !== null;
    localStorage.removeItem(key);
    return hadEntry;
  }

  // ==========================================
  // Private: In-Memory Fallback
  // ==========================================

  _logToMemory(transactionId, logEntry) {
    // Prevent unbounded growth
    if (this.memoryLogs.size >= MAX_MEMORY_LOGS) {
      const oldestKey = this.memoryLogs.keys().next().value;
      this.memoryLogs.delete(oldestKey);
    }

    this.memoryLogs.set(transactionId, {
      ...logEntry,
      storage: 'memory',
    });
  }
}
```

**Step 2: Commit**

```bash
git add js/storage/transaction/compensation-logger.js
git commit -m "feat(transaction): extract compensation logger module"
```

---

### Task A4: Create Two-Phase Commit Coordinator

**Files:**

- Create: `js/storage/transaction/two-phase-commit.js`
- Reference: `js/storage/transaction.js:260-294` (TransactionOperation class)
- Reference: `js/storage/transaction.js:196-255` (retry logic, timeouts)

**Context:**
Implements the 2PC protocol orchestration with prepare, commit, rollback phases and commit marker for crash recovery.

**Step 1: Write two-phase commit coordinator**

```javascript
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

const MAX_OPERATIONS_PER_TRANSACTION = 100;
const OPERATION_TIMEOUT_MS = 5000;

/**
 * Represents a pending transaction operation
 */
export class TransactionOperation {
  constructor(backend, type, store, key, value, previousValue = null) {
    this.backend = backend; // 'indexeddb' | 'localstorage'
    this.type = type; // 'put' | 'delete'
    this.store = store; // Store name
    this.key = key; // Key identifier
    this.value = value; // Value to store
    this.previousValue = previousValue; // For rollback
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
      throw new Error(
        `Transaction ${this.id}: Maximum operations (${MAX_OPERATIONS_PER_TRANSACTION}) exceeded`
      );
    }

    this.operations.push(new TransactionOperation(backend, 'put', store, key, value));
  }

  /**
   * Add a delete operation to the transaction
   */
  delete(store, key, backend = 'indexeddb') {
    if (this.operations.length >= MAX_OPERATIONS_PER_TRANSACTION) {
      throw new Error(
        `Transaction ${this.id}: Maximum operations (${MAX_OPERATIONS_PER_TRANSACTION}) exceeded`
      );
    }

    this.operations.push(new TransactionOperation(backend, 'delete', store, key, null));
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
    // TODO: Implement commit marker storage
    context.journaled = true;
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

    // TODO: Remove commit marker
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
```

**Step 2: Commit**

```bash
git add js/storage/transaction/two-phase-commit.js
git commit -m "feat(transaction): extract two-phase commit coordinator"
```

---

### Task A5: Create Transaction Index (Composition Root)

**Files:**

- Create: `js/storage/transaction/index.js`

**Context:**
Composition root that wires dependencies and provides feature flag toggle.

**Step 1: Write composition root**

```javascript
/**
 * Transaction Module - Composition Root
 *
 * Wires dependencies and exports public API with feature flag toggle.
 *
 * @module storage/transaction
 */

import { REFACTORING_FLAGS } from '../../config/refactoring-flags.js';

// New implementation
import { TwoPhaseCommitCoordinator, TransactionContext } from './two-phase-commit.js';
import { CompensationLogger } from './compensation-logger.js';
import { TransactionStateManager, NestedTransactionGuard } from './transaction-state.js';
import { TransactionalResource } from './transactional-resource.js';

// Legacy implementation
import { StorageTransaction as LegacyStorageTransaction } from '../legacy-transaction.js';

// ==========================================
// Dependency Injection
// ==========================================

const compensationLogger = new CompensationLogger();

// ==========================================
// Public API
// ==========================================

if (REFACTORING_FLAGS.USE_NEW_TRANSACTION) {
  // New implementation: Export classes for composition
  export {
    TwoPhaseCommitCoordinator,
    TransactionContext,
    CompensationLogger,
    TransactionStateManager,
    NestedTransactionGuard,
    TransactionalResource,
  };

  // TODO: Create StorageTransaction facade that uses coordinator
  export const StorageTransaction = null; // Will be implemented
} else {
  // Legacy implementation
  export const StorageTransaction = LegacyStorageTransaction;
}
```

**Step 2: Commit**

```bash
git add js/storage/transaction/index.js
git commit -m "feat(transaction): add composition root with feature flag"
```

---

## STREAM B: Crypto Hashing Extraction

### Task B1: Create Crypto Hashing Module

**Files:**

- Create: `js/utils/crypto-hashing.js`
- Reference: `js/utils/validation.js:36-86` (hash and LRU cache logic)

**Context:**
Extract message content hashing and LRU cache into focused module.

**Step 1: Write crypto hashing module**

```javascript
/**
 * Message Content Hashing
 *
 * SHA-256 hashing with LRU cache for duplicate detection.
 * Provides fallback hashing when crypto API unavailable.
 *
 * @module utils/crypto-hashing
 */

const MAX_HASH_CACHE_SIZE = 1000;

// ==========================================
// LRU Cache Implementation
// ==========================================

class MessageHashCache {
  constructor(maxSize = MAX_HASH_CACHE_SIZE) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * Get hash from cache
   */
  get(content) {
    const entry = this.cache.get(content);

    if (entry) {
      // Move to end (most recently used)
      this.cache.delete(content);
      this.cache.set(content, entry);
      return entry.hash;
    }

    return null;
  }

  /**
   * Store hash in cache
   */
  set(content, hash) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(content, {
      hash,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear all cached hashes
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get current cache size
   */
  get size() {
    return this.cache.size;
  }
}

// ==========================================
// Singleton Cache Instance
// ==========================================

const hashCache = new MessageHashCache();

// ==========================================
// Hashing Functions
// ==========================================

/**
 * Generate SHA-256 hash of message content
 *
 * @param {string} content - Content to hash
 * @returns {Promise<string>} Hex string hash (64 characters)
 */
export async function hashMessageContent(content) {
  if (!content || typeof content !== 'string') {
    return '';
  }

  // Check cache first
  const cached = hashCache.get(content);
  if (cached) {
    return cached;
  }

  let hash;

  try {
    // Try crypto.subtle.digest (SHA-256)
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    // Fallback to simple hash if crypto API unavailable
    console.warn('[CryptoHashing] Crypto API unavailable, using fallback');

    let h1 = 0x811c9dc5;
    for (let i = 0; i < content.length; i++) {
      h1 ^= content.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
    }

    let h2 = 0x811c9dc5;
    for (let i = content.length - 1; i >= 0; i--) {
      h2 ^= content.charCodeAt(i);
      h2 = Math.imul(h2, 0x01000193);
    }

    hash = ((h1 >>> 0) + '_' + (h2 >>> 0)).toString(16);
  }

  // Cache the result
  hashCache.set(content, hash);

  return hash;
}

/**
 * Clear the hash cache
 */
export function clearHashCache() {
  hashCache.clear();
}

/**
 * Get current cache size
 */
export function getHashCacheSize() {
  return hashCache.size;
}

// Export cache class for testing
export { MessageHashCache };
```

**Step 2: Write tests**

```javascript
// tests/unit/utils/crypto-hashing.test.js
import { describe, it, expect } from 'vitest';
import {
  hashMessageContent,
  clearHashCache,
  getHashCacheSize,
  MessageHashCache,
} from '../../../../js/utils/crypto-hashing.js';

describe('Crypto Hashing', () => {
  beforeEach(() => {
    clearHashCache();
  });

  it('should hash message content with SHA-256', async () => {
    const content = 'Test message';
    const hash = await hashMessageContent(content);

    expect(hash).toBeTruthy();
    expect(hash.length).toBe(64); // SHA-256 produces 64 hex characters
  });

  it('should return empty string for empty content', async () => {
    const hash = await hashMessageContent('');
    expect(hash).toBe('');
  });

  it('should cache hash results', async () => {
    const content = 'Test message';

    const hash1 = await hashMessageContent(content);
    const hash2 = await hashMessageContent(content);

    expect(hash1).toBe(hash2);
    expect(getHashCacheSize()).toBe(1);
  });

  it('should clear cache', async () => {
    await hashMessageContent('test1');
    await hashMessageContent('test2');

    expect(getHashCacheSize()).toBe(2);

    clearHashCache();
    expect(getHashCacheSize()).toBe(0);
  });

  it('should evict oldest entries when at capacity', async () => {
    const cache = new MessageHashCache(3);

    cache.set('msg1', 'hash1');
    cache.set('msg2', 'hash2');
    cache.set('msg3', 'hash3');

    expect(cache.size).toBe(3);

    cache.set('msg4', 'hash4');

    expect(cache.size).toBe(3);
    expect(cache.get('msg1')).toBeNull(); // Oldest evicted
  });
});
```

**Step 3: Run tests**

```bash
npm test -- tests/unit/utils/crypto-hashing.test.js
```

Expected: PASS

**Step 4: Commit**

```bash
git add js/utils/crypto-hashing.js tests/unit/utils/crypto-hashing.test.js
git commit -m "feat(utils): extract crypto hashing module"
```

---

### Task B2: Update Validation.js to Use New Module

**Files:**

- Modify: `js/utils/validation.js:36-86`

**Context:**
Remove inline hashing logic and import from new module.

**Step 1: Remove hashing code and add import**

At top of validation.js, add import:

```javascript
import { hashMessageContent } from './crypto-hashing.js';
```

Remove lines 36-86 (the `_hashMessageContent` function and LRU cache).

**Step 2: Update validateMessage to use imported function**

Find where `_hashMessageContent` is called and replace with `hashMessageContent`.

**Step 3: Run tests**

```bash
npm test -- tests/unit/validation.test.js
```

Expected: PASS

**Step 4: Commit**

```bash
git add js/utils/validation.js
git commit -m "refactor(validation): use crypto-hashing module"
```

---

## STREAM C: Auto-Repair Extraction

### Task C1: Create Auto-Repair Service

**Files:**

- Create: `js/storage/auto-repair.js`
- Reference: `js/storage.js:54-100` (auto-repair config)

**Context:**
Extract auto-repair logic into focused service.

**Step 1: Write auto-repair service**

```javascript
/**
 * Auto-Repair Service
 *
 * Detects and repairs storage consistency issues.
 * Handles orphaned data, corrupted indexes, and metadata inconsistencies.
 *
 * @module storage/auto-repair
 */

import { EventBus } from '../services/event-bus.js';

/**
 * Default auto-repair configuration
 */
const DEFAULT_CONFIG = {
  enabled: true,
  maxAttempts: 3,
  repairOrphans: true,
  rebuildIndexes: true,
  recalcMetadata: true,
  attemptRecovery: true,
  backupBeforeRepair: true,
};

/**
 * Manages auto-repair operations for storage consistency
 */
export class AutoRepairService {
  constructor(eventBus, indexedDBCore, config = {}) {
    this.eventBus = eventBus;
    this.db = indexedDBCore;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.repairLog = [];
  }

  /**
   * Get current auto-repair configuration
   */
  getAutoRepairConfig() {
    return { ...this.config };
  }

  /**
   * Update auto-repair configuration
   */
  setAutoRepairConfig(updates) {
    Object.assign(this.config, updates);

    this.eventBus.emit('storage:autorepair_config_changed', {
      config: this.getAutoRepairConfig(),
    });

    console.log('[AutoRepair] Config updated:', this.config);

    return this.getAutoRepairConfig();
  }

  /**
   * Detect and repair issues
   */
  async detectAndRepairIssues() {
    if (!this.config.enabled) {
      console.log('[AutoRepair] Disabled, skipping');
      return [];
    }

    console.log('[AutoRepair] Starting detection and repair');
    const startTime = Date.now();
    const repairs = [];

    try {
      // Check for orphaned data
      if (this.config.repairOrphans) {
        const orphanRepairs = await this.repairOrphanedData();
        repairs.push(...orphanRepairs);
      }

      // Rebuild corrupted indexes
      if (this.config.rebuildIndexes) {
        const indexRepairs = await this.rebuildCorruptedIndexes();
        repairs.push(...indexRepairs);
      }

      // Recalculate metadata
      if (this.config.recalcMetadata) {
        const metadataRepairs = await this.recalcMetadata();
        repairs.push(...metadataRepairs);
      }

      const duration = Date.now() - startTime;
      console.log(`[AutoRepair] Complete: ${repairs.length} repairs in ${duration}ms`);

      this.eventBus.emit('storage:autorepair_complete', {
        repairCount: repairs.length,
        duration,
      });
    } catch (error) {
      console.error('[AutoRepair] Failed:', error);
      this.eventBus.emit('storage:autorepair_failed', { error: error.message });
    }

    return repairs;
  }

  /**
   * Repair orphaned data
   */
  async repairOrphanedData() {
    console.log('[AutoRepair] Checking for orphaned data');
    // TODO: Implement orphan detection and repair
    return [];
  }

  /**
   * Rebuild corrupted indexes
   */
  async rebuildCorruptedIndexes() {
    console.log('[AutoRepair] Checking index integrity');
    // TODO: Implement index checking and rebuild
    return [];
  }

  /**
   * Recalculate inconsistent metadata
   */
  async recalcMetadata() {
    console.log('[AutoRepair] Checking metadata consistency');
    // TODO: Implement metadata verification and recalculation
    return [];
  }

  /**
   * Attempt data recovery for corrupted records
   */
  async attemptDataRecovery(corruptedRecords) {
    if (!this.config.attemptRecovery) {
      return [];
    }

    console.log(`[AutoRepair] Attempting recovery for ${corruptedRecords.length} records`);
    // TODO: Implement recovery logic
    return [];
  }

  /**
   * Get repair log
   */
  getRepairLog() {
    return [...this.repairLog];
  }

  /**
   * Clear repair log
   */
  clearRepairLog() {
    this.repairLog = [];
  }

  /**
   * Log a repair action
   */
  _logRepair(action, details) {
    const entry = {
      timestamp: Date.now(),
      action,
      details,
    };

    this.repairLog.push(entry);

    this.eventBus.emit('storage:autorepair_log', entry);
  }
}
```

**Step 2: Commit**

```bash
git add js/storage/auto-repair.js
git commit -m "feat(storage): extract auto-repair service"
```

---

### Task C2: Update Storage.js to Use Auto-Repair Service

**Files:**

- Modify: `js/storage.js:54-100`

**Context:**
Replace inline auto-repair with service delegation.

**Step 1: Import and instantiate service**

```javascript
import { AutoRepairService } from './storage/auto-repair.js';

// In the module initialization
const autoRepairService = new AutoRepairService(EventBus, IndexedDBCore);
```

**Step 2: Replace config functions**

```javascript
export function getAutoRepairConfig() {
  return autoRepairService.getAutoRepairConfig();
}

export function setAutoRepairConfig(config) {
  return autoRepairService.setAutoRepairConfig(config);
}
```

**Step 3: Remove old code**

Delete lines 54-100 (old config object and repair log).

**Step 4: Run tests**

```bash
npm test -- tests/unit/storage.test.js
```

Expected: PASS

**Step 5: Commit**

```bash
git add js/storage.js
git commit -m "refactor(storage): use auto-repair service"
```

---

## VERIFICATION & CLEANUP

### Task V1: Test Feature Flags

**Step 1: Toggle each flag independently**

Edit `js/config/refactoring-flags.js`:

```javascript
export const REFACTORING_FLAGS = {
  USE_NEW_TRANSACTION: false, // Test legacy
  USE_NEW_CRYPTO_HASHING: false,
  USE_NEW_AUTO_REPAIR: false,
};
```

**Step 2: Run full test suite**

```bash
npm test
```

Expected: All tests PASS

**Step 3: Enable all flags**

```javascript
export const REFACTORING_FLAGS = {
  USE_NEW_TRANSACTION: true,
  USE_NEW_CRYPTO_HASHING: true,
  USE_NEW_AUTO_REPAIR: true,
};
```

**Step 4: Run full test suite again**

```bash
npm test
```

Expected: All tests PASS

**Step 5: Performance comparison**

Add timing measurements to compare old vs new implementations.

---

### Task V2: Delete Legacy Code

**Step 1: Remove legacy transaction.js**

```bash
git rm js/storage/legacy-transaction.js
```

**Step 2: Remove feature flag infrastructure**

```bash
git rm js/config/refactoring-flags.js
```

**Step 3: Update imports to remove flag checks**

Remove all `REFACTORING_FLAGS` references.

**Step 4: Final test**

```bash
npm test
```

Expected: All tests PASS

**Step 5: Commit cleanup**

```bash
git add -A
git commit -m "chore(refactoring): remove legacy code and feature flags"
```

---

## SUCCESS CRITERIA

- [ ] All new modules created
- [ ] All tests passing
- [ ] Feature flags toggle successfully
- [ ] Performance comparable or better
- [ ] Legacy code deleted
- [ ] Feature flags removed
- [ ] Zero God objects >1000 lines remaining
