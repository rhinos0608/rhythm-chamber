# Database/Storage Audit Report

**Agent:** Agent 6 - DATABASE/STORAGE AGENT
**Date:** 2026-01-22
**Focus:** IndexedDB schema, migrations, quota handling, transaction error handling, data corruption recovery, storage cleanup, WAL implementation

## Executive Summary

The storage architecture is sophisticated with features like Two-Phase Commit (2PC), Write-Ahead Log (WAL), and compensation logs for cross-backend coordination. However, several critical issues were identified and one bug was fixed.

### Critical Issues Fixed
- **MISSING_STORES_BUG**: Added missing `TRANSACTION_JOURNAL` and `TRANSACTION_COMPENSATION` stores to IndexedDB schema (DB version 5 -> 6)

### Issues Identified (Requiring Attention)
1. **WAL_IDEMPOTENCY**: Non-idempotent operations could cause corruption on replay
2. **MIGRATION_PATHS**: No explicit migration functions for version evolution
3. **QUOTA_ROLLBACK_FAILURE**: Rollback compensation writes could also fail on quota exhaustion

---

## 1. IndexedDB Schema and Migrations

### Schema Overview (`js/storage/indexeddb.js`)

**Database:** `rhythm-chamber`
**Version:** 6 (upgraded from 5)
**Total Stores:** 16

| Store Name | Key Path | Indexes | Purpose |
|------------|----------|---------|---------|
| `streams` | `id` | - | Raw streaming history |
| `chunks` | `id` | `type`, `startDate` | Aggregated chunks |
| `embeddings` | `id` | - | Embedding vectors |
| `personality` | `id` | - | Personality results |
| `settings` | `key` | - | User settings |
| `chat_sessions` | `id` | `updatedAt` | Chat session data |
| `config` | `key` | - | Unified config store |
| `tokens` | `key` | - | Encrypted credentials |
| `migration` | `id` | - | Migration state/backup |
| `event_log` | `id` | `sequenceNumber`, `type`, `timestamp` | Event replay log |
| `event_checkpoint` | `id` | `sequenceNumber` | Rapid recovery checkpoints |
| `demo_streams` | `id` | `timestamp`, `type` | Demo mode streams |
| `demo_patterns` | `id` | `timestamp` | Demo analysis patterns |
| `demo_personality` | `id` | - | Demo personality data |
| `TRANSACTION_JOURNAL` | `id` | `journalTime` | 2PC crash recovery (ADDED) |
| `TRANSACTION_COMPENSATION` | `id` | `timestamp`, `resolved` | Rollback failures (ADDED) |

### Critical Bug Fixed

**File:** `/Users/rhinesharar/rhythm-chamber/js/storage/indexeddb.js`
**Lines:** 454-468 (added)

```javascript
// Transaction journal store for 2PC crash recovery
// HNW Network: Provides durable transaction intent logging for multi-backend atomicity
if (!database.objectStoreNames.contains('TRANSACTION_JOURNAL')) {
    const journalStore = database.createObjectStore('TRANSACTION_JOURNAL', { keyPath: 'id' });
    journalStore.createIndex('journalTime', 'journalTime', { unique: false });
}

// Compensation log store for rollback failure recovery
// HNW Network: Persists failed rollback operations for manual recovery
if (!database.objectStoreNames.contains('TRANSACTION_COMPENSATION')) {
    const compensationStore = database.createObjectStore('TRANSACTION_COMPENSATION', { keyPath: 'id' });
    compensationStore.createIndex('timestamp', 'timestamp', { unique: false });
    compensationStore.createIndex('resolved', 'resolved', { unique: false });
}
```

**Impact:** Without these stores, any call to `StorageTransaction.transaction()` would fail with `NotFoundError` when trying to write to the journal. This was a **runtime-critical bug** affecting multi-backend atomic operations.

### Migration Gaps

**File:** `/Users/rhinesharar/rhythm-chamber/js/storage/migration.js`

The migration system handles `localStorage -> IndexedDB` migration but lacks:

1. **No Version Migration Functions**: The `createStores()` function only creates missing stores. It doesn't handle:
   - Schema changes to existing stores (e.g., adding new indexes)
   - Data transformations when structure changes
   - Index modifications or deletions

2. **Missing MigrateToV5/V6**: There are no explicit migration functions like `migrateV4ToV5()` or `migrateV5ToV6()`.

**Recommendation:** Create a central migration router:
```javascript
dbRequest.onupgradeneeded = (event) => {
    const db = event.target.result;
    const oldVersion = event.oldVersion;

    // Sequentially apply all migrations
    for (let v = oldVersion; v < event.newVersion; v++) {
        switch (v) {
            case 0: migrateV0ToV1(db); break;
            case 1: migrateV1ToV2(db); break;
            // ...
            case 5: migrateV5ToV6(db); break;
        }
    }

    // Always ensure stores exist (additive)
    createStores(db);
};
```

---

## 2. Storage Quota Handling

### Components

**Files:**
- `/Users/rhinesharar/rhythm-chamber/js/storage/quota-manager.js`
- `/Users/rhinesharar/rhythm-chamber/js/storage/quota-monitor.js`

### Threshold Configuration

| Threshold | Percentage | Behavior |
|-----------|------------|----------|
| Warning | 80% | Emits `storage:quota_warning` event |
| Critical | 95% | Emits `storage:quota_critical`, blocks writes |
| Cleanup | 90% | Emits `storage:threshold_exceeded`, triggers archival |

### Analysis

**Strengths:**
- Well-structured event emission for UI response
- Fallback quota (50MB) when `navigator.storage.estimate()` unavailable
- Polling with 60-second interval for continuous monitoring
- Large write detection (>1MB) triggers immediate quota check

**Weaknesses:**

1. **No Automatic Write Blocking**: The quota manager only emits events; it doesn't proactively block writes at critical threshold. Each write path must check `QuotaManager.isWriteBlocked()`.

2. **Compensation Log Quota Issue** (`transaction.js:674-701`): If quota is exhausted, rollback operations write to compensation log. If that also fails, the system cannot record the rollback failure.

```javascript
// Lines 674-701 in transaction.js
async function persistCompensationLog(transactionId, entries) {
    // If IndexedDB fails, falls back to localStorage
    // But localStorage is also likely full if quota is exhausted
    if (IndexedDBCore) {
        try {
            await IndexedDBCore.put(COMPENSATION_LOG_STORE, logEntry);
        } catch (storeError) {
            // Fallback to localStorage - may also fail!
            localStorage.setItem('_transaction_compensation_logs', ...);
        }
    }
}
```

**Recommendation:**
1. Add a `QuotaManager.enqueueWriteWhenAvailable()` method for when quota is critical
2. Store compensation logs in memory if both IndexedDB and localStorage fail
3. Emit a dedicated `storage:compensation_log_failed` event for UI notification

---

## 3. Transaction Error Handling

### 2PC Implementation (`transaction.js`)

**Phases:**
1. **Prepare Phase** (lines 285-331): Validates all operations can succeed
2. **Journal Phase** (lines 334-368): Writes transaction intent for crash recovery
3. **Commit Phase** (lines 500-557): Executes all operations
4. **Cleanup Phase**: Clears journal on success

### wrapRequest Timeout (`indexeddb.js:485-539`)

```javascript
function wrapRequest(request, transaction, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        // ... setup ...
        timeoutHandle = setTimeout(() => {
            if (!completed) {
                cleanup();
                transaction.abort();  // CRITICAL: Aborts on timeout
                reject(new Error(`IndexedDB request timeout after ${timeoutMs}ms`));
            }
        }, timeoutMs);
        // ... handlers ...
    });
}
```

**Analysis:**
- **Correct**: Calls `transaction.abort()` which is safe even if transaction already completed
- **Race Condition**: Narrow window between I/O completion and event handler could cause false timeout
- **Outcome**: Transaction would be rejected but no data corruption (acceptable for timeout)

### Write Authority Check (`indexeddb.js:96-126`)

```javascript
function checkWriteAuthority(storeName, operation) {
    if (!AUTHORITY_CONFIG.enforceWriteAuthority) return true;
    if (AUTHORITY_CONFIG.exemptStores.has(storeName)) return true;

    const isAllowed = TabCoordinator?.isWriteAllowed?.() ?? true;
    if (!isAllowed) {
        // Warn or throw based on strictMode
        if (AUTHORITY_CONFIG.strictMode) {
            throw new Error(`Write denied: Tab is in read-only mode`);
        }
        return false;
    }
    return true;
}
```

**Analysis:**
- Properly enforces single-writer (primary tab) semantics
- Uses optional chaining for graceful degradation
- Exempts `migration` store from authority checks (correct behavior)

---

## 4. Data Corruption Recovery

### Compensation Log (`transaction.js:669-787`)

**Structure:**
```javascript
{
    id: transactionId,
    entries: [{
        transactionId: ctx.id,
        operation: { backend, type, store, key },
        expectedState: previousValue,
        actualState: 'unknown',
        error: rollbackError.message,
        timestamp: Date.now()
    }],
    timestamp: Date.now(),
    resolved: false
}
```

**Sensitive Data Redaction** (lines 588-641):
```javascript
const sensitiveFieldPatterns = ['securetoken', 'auth', 'token', 'secret', 'password', 'credentials'];
const isSensitiveKey = (key) => key && sensitiveFieldPatterns.some(
    pattern => String(key).toLowerCase().includes(pattern)
);

// Sanitize before logging
const sanitizedOp = {
    key: isSensitiveKey(op.key) ? '[REDACTED]' : op.key,
    previousValue: isSensitiveKey(op.key) ? '[REDACTED]' : op.previousValue,
    // ...
};
```

**Good Security Practice:** Prevents credential leakage in logs.

### Recovery Scenarios

| Scenario | Recovery Mechanism | Status |
|----------|-------------------|--------|
| Browser crash during commit | WAL replay on startup | Implemented |
| Browser crash during rollback | Journal recovery in `recoverFromJournal()` | Partial - only logs stale entries |
| Rollback operation fails | Compensation log | Implemented |
| Compensation log write fails | localStorage fallback + console | Implemented (but fragile) |

---

## 5. Storage Cleanup/Expiration

### LRU Cache (`lru-cache.js`)

**Class:** `LRUCache`
**Default Max Size:** 5000 entries
**Eviction:** Least Recently Used based on access time

**Features:**
- Access tracking (get updates recency)
- Eviction statistics (hit rate, miss count, eviction count)
- Auto-scaling based on storage quota (10% of available, capped at 50k)
- Pending eviction callback for async IndexedDB cleanup

**Auto-Scaling Logic** (lines 213-238):
```javascript
async enableAutoScale(enabled = true) {
    if (enabled && navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        const availableBytes = (estimate.quota || 0) - (estimate.usage || 0);
        const BYTES_PER_VECTOR = 2048;  // 384 dims x 4 bytes + overhead
        const maxBasedOnQuota = Math.floor((availableBytes * 0.1) / BYTES_PER_VECTOR);
        const newMax = Math.max(1000, Math.min(maxBasedOnQuota, 50000));
        this.setMaxSize(newMax);
    }
}
```

### Archive Service (`archive-service.js`)

**Retention Period:** 1 year (default)
**Minimum Streams:** Always keeps at least 100 streams

**Archival Flow:**
1. Identify streams older than cutoff date
2. Move to `archived_streams_data` record in config store
3. Emit `storage:quota_cleaned` event

**Issue:** Archive data stored in config store (not a dedicated archive store) means:
- No queryability by date
- Single large record could hit size limits
- Cannot use indexes for efficient queries

### Event Log Compaction (`event-log-store.js`)

**Configuration:**
```javascript
COMPACTION_CONFIG = {
    maxEvents: 10000,
    checkpointInterval: 100,
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
    minEventsAfterCheckpoint: 50
}
```

**Compaction Strategy:**
- Creates checkpoint at sequence number
- Deletes events below cutoff (keeps recent events)
- Preserves checkpoint integrity

**Connection Retry** (lines 93-124):
- Exponential backoff on blocked connections
- Max 5 retries with 10-second maximum delay
- Emits `storage:connection_blocked` for UI notification

---

## 6. Write-Ahead Log Implementation

### WAL Architecture (`write-ahead-log.js`)

**Priority Levels:**
```javascript
WalPriority = {
    CRITICAL: 'critical',   // Credentials, tokens
    HIGH: 'high',          // User-visible data
    NORMAL: 'normal',      // Background data
    LOW: 'low'             // Optional data
}
```

**Entry Status Flow:**
```
PENDING -> PROCESSING -> COMMITTED (success)
                      -> FAILED (retry up to 3x)
```

### CRITICAL: WAL Idempotency Issue

**Location:** `write-ahead-log.js:420-430` (executeOperation)

**Problem:** The WAL replay calls `Storage[operation](...args)`. If an operation was successfully committed but the browser crashed before clearing the WAL entry, replay would execute it again.

**Analysis by Operation Type:**

| Operation | Idempotent? | Risk on Replay |
|-----------|-------------|----------------|
| `put()` | YES | Same final state (safe) |
| `delete()` | YES | No-op if already deleted (safe) |
| `add()` | NO | ConstraintError, replay halts (CRITICAL) |

**Current Code:**
```javascript
async function executeOperation(operation, args) {
    const { Storage } = await import('../storage.js');
    if (typeof Storage[operation] === 'function') {
        return await Storage[operation](...args);
    } else {
        throw new Error(`Unknown storage operation: ${operation}`);
    }
}
```

**Recommendation:** Add idempotency wrapper for WAL replay:
```javascript
async function executeOperationForReplay(operation, args) {
    const { Storage } = await import('../storage.js');

    // Convert add -> put for idempotency
    if (operation === 'add') {
        operation = 'put';
    }

    if (typeof Storage[operation] === 'function') {
        return await Storage[operation](...args);
    }
}
```

### Replay Blocking (`write-ahead-log.js:281-287`)

```javascript
async function queueWrite(operation, args, priority = WalPriority.NORMAL) {
    // Block writes during WAL replay to prevent ordering conflicts
    if (walState.isReplaying) {
        console.warn(`[WAL] Write blocked during replay, waiting: ${operation}`);
        await waitForReplayComplete();
        console.log(`[WAL] Replay complete, proceeding with write: ${operation}`);
    }
    // ...
}
```

**Event-Based Waiting** (lines 368-404):
- Uses EventBus to listen for `wal:replay_complete` event
- 30-second timeout fallback
- Proper cleanup with clearTimeout and EventBus.off

**Status:** Well-implemented.

### Crash Recovery Semantics

**Critical Documentation** (lines 256-274):

The Promise returned by `queueWrite()` will NOT settle after a crash/reload. Callbacks attached to the Promise are lost. Callers must use `getOperationResult(entryId)` after reload.

**Recovery Data:**
- WAL entries persisted to localStorage for 24 hours
- Operation results persisted for 5 minutes
- Uses `entryId` for result lookup

---

## Summary of Findings

### Fixed Issues
1. **CRITICAL**: Added missing `TRANSACTION_JOURNAL` and `TRANSACTION_COMPENSATION` stores to IndexedDB schema (version 6)

### Issues Requiring Attention

| Priority | Issue | File | Lines | Impact |
|----------|-------|------|-------|--------|
| HIGH | WAL idempotency for `add()` operations | write-ahead-log.js | 420-430 | Replay could fail or corrupt |
| MEDIUM | No explicit version migration functions | indexeddb.js | 373-468 | Schema changes not applied to existing users |
| MEDIUM | Quota rollback compensation may fail | transaction.js | 674-701 | Compensation log may not persist when quota exhausted |
| LOW | Archive in config store limits queryability | archive-service.js | 148-161 | Cannot efficiently query archived data |

### Positive Findings

1. **Excellent Security**: Sensitive data redaction in compensation logs
2. **Robust Fallback**: Multiple fallback layers (IndexedDB -> localStorage -> memory)
3. **Good Timeout Handling**: wrapRequest properly aborts on timeout
4. **Event-Driven Recovery**: WAL replay complete event for proper coordination
5. **Multi-tab Safety**: Write authority enforcement via TabCoordinator

### Recommendations

1. **Immediate**: Add idempotency wrapper for WAL replay (convert `add` to `put`)
2. **Short-term**: Create explicit migration router for version upgrades
3. **Medium-term**: Consider in-memory compensation log when both storage backends fail
4. **Long-term**: Move archive data to dedicated store with proper indexing

---

## Files Analyzed

- `/Users/rhinesharar/rhythm-chamber/js/storage/indexeddb.js` (1,022 lines)
- `/Users/rhinesharar/rhythm-chamber/js/storage/write-ahead-log.js` (855 lines)
- `/Users/rhinesharar/rhythm-chamber/js/storage/migration.js` (615 lines)
- `/Users/rhinesharar/rhythm-chamber/js/storage/transaction.js` (908 lines)
- `/Users/rhinesharar/rhythm-chamber/js/storage/quota-manager.js` (398 lines)
- `/Users/rhinesharar/rhythm-chamber/js/storage/quota-monitor.js` (335 lines)
- `/Users/rhinesharar/rhythm-chamber/js/storage/lru-cache.js` (277 lines)
- `/Users/rhinesharar/rhythm-chamber/js/storage/event-log-store.js` (539 lines)
- `/Users/rhinesharar/rhythm-chamber/js/storage/archive-service.js` (362 lines)
- `/Users/rhinesharar/rhythm-chamber/js/storage/fallback-backend.js` (545 lines)

**Total Lines Analyzed:** 5,856 lines across 10 files
