# God Object Refactoring Design

**Date:** 2026-01-27
**Status:** Design Complete, Ready for Implementation
**Approach:** Hybrid Strategy (Module Decomposition + Service Classes)

## Overview

Refactor three God objects using a hybrid approach matching complexity to strategy:
- **Transaction.js** (1,456 lines) → Module Decomposition into 4 files
- **Validation.js** (1,380 lines) → Service Class Extraction (crypto hashing)
- **Storage.js** (993 lines) → Service Class Extraction (auto-repair)

## Architecture

### Transaction.js Decomposition

**Directory Structure:**
```
js/storage/transaction/
├── index.js                    # Public API, composition root
├── transactional-resource.js   # Resource interface abstraction
├── two-phase-commit.js         # Protocol orchestration
├── compensation-logger.js      # Rollback failure logging
└── transaction-state.js        # Fatal state, nested detection
```

**Module Responsibilities:**

**transactional-resource.js** (Base Interface)
- `TransactionalResource` interface class
- Methods: `prepare()`, `commit()`, `rollback()`, `recover(isTxPendingCommit)`
- Defines contract for storage backends (IndexedDB, localStorage)

**two-phase-commit.js** (Protocol Orchestration)
- `TwoPhaseCommitCoordinator` class
- `preparePhase()` - Validates operations, creates rollback data
- `commitPhase()` - Executes prepared operations across backends
- `rollbackPhase()` - Executes compensating actions
- `TransactionContext` class - Context object for callbacks
- `TransactionOperation` class - Individual queued operations
- Uses commit marker for crash recovery

**compensation-logger.js** (Rollback Failure Logging)
- `CompensationLogger` class
- `logCompensation()` - Store failed operations
- `getCompensationLog()` - Retrieve specific log
- `clearCompensationLog()` - Mark as resolved
- In-memory fallback + IndexedDB + localStorage fallback chain
- Emits events via EventBus

**transaction-state.js** (State Management)
- `TransactionStateManager` - Fatal error state
  - `enterFatalState()`, `clearFatalState()`, `getFatalState()`
- `NestedTransactionGuard` - Depth tracking
  - `isInTransaction()`, `getTransactionDepth()`
  - `enterTransaction()`, `exitTransaction()`

**index.js** (Composition Root)
- Imports all modules
- Instantiates dependencies with dependency injection
- Re-exports `StorageTransaction` class
- Feature flag: `USE_NEW_TRANSACTION`

### Pseudo-2PC Protocol with Crash Recovery

**Commit Marker Strategy:**
1. **Prepare Phase**: Write to `_pending:{txId}` areas
2. **Decision Phase**: Write commit marker to durable storage
3. **Commit Phase**: Move from pending to live data
4. **Cleanup Phase**: Delete pending data and commit marker

**Recovery on Startup:**
```javascript
// Coordinator orchestration
async initializeAndRecover() {
  // 1. Gather all transaction IDs with commit markers
  const committedTxIds = await markerResource.getAllPendingTxIds();

  // 2. Orchestrate recovery for all resources
  const recoveryPromises = allResources.map(res =>
    res.recover(txId => committedTxIds.has(txId))
  );
  await Promise.all(recoveryPromises);

  // 3. Clean up markers after all resources confirm
  await markerResource.cleanupMarkers(committedTxIds);
}
```

**Resource Recovery Logic:**
```javascript
async recover(isTxPendingCommit) {
  const pendingItems = await this.scanForPendingItems();
  for (const item of pendingItems) {
    const txId = this.extractTransactionId(item);
    if (isTxPendingCommit(txId)) {
      await this.commit(item);  // Roll-forward
    } else {
      await this.rollback(item);  // Delete orphan
    }
  }
}
```

### Validation.js Crypto Extraction

**New File:** `js/utils/crypto-hashing.js`

**Responsibilities:**
- SHA-256 message content hashing
- LRU cache for deduplication (max 1000 entries)
- Fallback hashing when crypto API unavailable

**Key Exports:**
```javascript
export async function hashMessageContent(content)
export function clearHashCache()
export function getHashCacheSize()
export class MessageHashCache
```

**Changes to validation.js:**
- Remove internal `_hashMessageContent()` function
- Remove LRU cache variables
- Import from crypto-hashing module
- Update `validateMessage()` to call imported function

### Storage.js Auto-Repair Extraction

**New File:** `js/storage/auto-repair.js`

**Key Exports:**
```javascript
export class AutoRepairService {
  constructor(eventBus, indexedDBCore)

  // Configuration
  getAutoRepairConfig()
  setAutoRepairConfig(config)

  // Repair operations
  detectAndRepairIssues()
  repairOrphanedData()
  rebuildCorruptedIndexes()
  recalcMetadata()
  attemptDataRecovery()

  // Logging
  getRepairLog()
  clearRepairLog()
}
```

**Changes to storage.js:**
- Remove `autoRepairConfig` object
- Remove `repairLog` array
- Remove config getter/setter functions
- Import and instantiate `AutoRepairService`
- Delegate repair operations to service

## Feature Flag Strategy

**Global Configuration:** `js/config/refactoring-flags.js`

```javascript
export const REFACTORING_FLAGS = {
  USE_NEW_TRANSACTION: true,
  USE_NEW_CRYPTO_HASHING: true,
  USE_NEW_AUTO_REPAIR: true
};
```

**Usage Pattern:**
```javascript
import { REFACTORING_FLAGS } from '../../config/refactoring-flags.js';

export const StorageTransaction = REFACTORING_FLAGS.USE_NEW_TRANSACTION
  ? ModernTransaction
  : LegacyTransaction;
```

**Post-Verification:**
- Delete legacy implementations
- Remove feature flag infrastructure
- Clean up all flag checks

## Implementation Order

### Sequential Foundation (Do First)
1. Create `js/config/refactoring-flags.js` (5 min)
2. Create `js/storage/transaction/` directory (5 min)

### Parallel Implementation (Groups Can Run Simultaneously)

**Group A: Transaction Decomposition**
- Create `transactional-resource.js` interface
- Create `transaction-state.js`
- Create `compensation-logger.js`
- Create `two-phase-commit.js`
- Create `index.js` with composition root

**Group B: Crypto Hashing Extraction**
- Create `js/utils/crypto-hashing.js`
- Update `js/utils/validation.js`
- Add feature flag

**Group C: Auto-Repair Extraction**
- Create `js/storage/auto-repair.js`
- Update `js/storage.js`
- Add feature flag

### Verification (After All Implementation)
1. Run existing test suite
2. Test each feature flag independently
3. Performance comparison (old vs new)
4. Delete legacy code
5. Remove feature flags

## Testing Strategy

### Unit Tests
- `transaction-state.test.js`
- `compensation-logger.test.js`
- `two-phase-commit.test.js`
- `crypto-hashing.test.js`
- `auto-repair.test.js`

### Integration Tests
- Transaction coordinator with mock resources
- Recovery scenarios (crash before/after commit marker)
- End-to-end storage operations

### Feature Flag Tests
- Run tests with flag ON
- Run tests with flag OFF
- Verify identical behavior

### Performance Benchmarks
- Compare transaction performance
- Measure recovery startup time
- Check hash cache effectiveness

## Edge Cases & Considerations

### Recovery Process Robustness
- **Recovery failure**: Halt application startup (safest option)
- Prevent new transactions until recovery complete
- Log all recovery operations for debugging

### Idempotency
- All `commit()` operations must be idempotent
- Re-running commit must be safe
- Guard against duplicate appends/operations

### Marker Cleanup Lifecycle
- Only cleanup markers after ALL resources confirm successful commit
- Premature cleanup could cause data loss
- Keep markers on failed recovery for next attempt

### Orphan Scanning Performance
- Monitor startup recovery duration
- Could become bottleneck with many orphans
- Consider TTL on pending data to limit accumulation

### Logging & Monitoring
- Instrument `initializeAndRecover` start/end
- Log success/failure of each resource recovery
- Track number of transactions rolled forward
- Measure orphan scan duration per resource

## Success Criteria

- [ ] All existing tests pass
- [ ] New modules have comprehensive unit tests
- [ ] Feature flags toggle successfully
- [ ] No functional regressions
- [ ] Performance is comparable or better
- [ ] Legacy code deleted
- [ ] Feature flags removed
- [ ] Codebase has zero God objects >1000 lines

## External Validation

Design validated via external consultation confirming:
- ✅ Medium-grained decomposition is appropriate
- ✅ TransactionalResource interface needed for clean abstraction
- ✅ Commit marker strategy enables robust crash recovery
- ✅ Callback-based recovery maintains clean separation
- ✅ Explicit transaction reads preferred over transparent interception
- ✅ Dependency injection via composition root is correct pattern
