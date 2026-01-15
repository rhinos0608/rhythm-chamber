# Operation Lock Contract: Failure Propagation & Recovery

## Overview

The Operation Lock system provides mutual exclusion for destructive operations to prevent concurrent state corruption. This document details how lock acquisition failures propagate through the application hierarchy and the recovery mechanisms available.

## Lock System Architecture

### Core Components

```javascript
// js/operation-lock.js
const OPERATIONS = {
    FILE_PROCESSING: 'file_processing',
    EMBEDDING_GENERATION: 'embedding_generation',
    PRIVACY_CLEAR: 'privacy_clear',
    SPOTIFY_FETCH: 'spotify_fetch',
    CHAT_SAVE: 'chat_save'
};

const CONFLICT_MATRIX = {
    'file_processing': ['privacy_clear', 'embedding_generation'],
    'embedding_generation': ['privacy_clear', 'file_processing'],
    'privacy_clear': ['file_processing', 'embedding_generation', 'chat_save'],
    'spotify_fetch': [],  // Can run concurrently
    'chat_save': ['privacy_clear']
};
```

## Failure Propagation Hierarchy

### Level 1: OperationLock.acquire() - The Source

**Location:** `js/operation-lock.js:98-105`

```javascript
async function acquire(operationName) {
    const { canAcquire: allowed, blockedBy } = canAcquire(operationName);

    if (!allowed) {
        const msg = `Operation '${operationName}' blocked by: ${blockedBy.join(', ')}`;
        console.warn(`[OperationLock] ${msg}`);
        throw new Error(msg);  // ← FAILURE POINT
    }

    const ownerId = generateOwnerId();
    activeLocks.set(operationName, {
        ownerId,
        acquiredAt: Date.now()
    });

    console.log(`[OperationLock] Acquired '${operationName}' (${ownerId})`);
    dispatchLockEvent('acquired', operationName);

    return ownerId;
}
```

**Failure Characteristics:**
- **Type:** `Error`
- **Message Format:** `"Operation 'X' blocked by: Y, Z"`
- **Immediate:** No retry, no timeout
- **Recovery:** None at this level

---

### Level 2: Controller Layer - User-Facing Handlers

#### FileUploadController (`js/controllers/file-upload-controller.js`)

```javascript
// Lines 76-81
try {
    currentFileLockId = await _OperationLock.acquire('file_processing');
} catch (lockError) {
    _showToast(`Cannot upload: ${lockError.message}`);
    return;  // ← ABORT OPERATIONS
}
```

**Propagation Pattern:**
1. **Catches:** Lock acquisition error
2. **Action:** Shows toast notification
3. **Result:** Early exit, operation aborted
4. **Lock State:** No lock acquired (clean state)

**User Experience:**
```
Toast: "Cannot upload: Operation 'file_processing' blocked by: privacy_clear"
```

#### ResetController (`js/controllers/reset-controller.js`)

```javascript
// Lines 55-65 - PREVENTIVE CHECK
function handleReset() {
    if (_OperationLock) {
        const fileProcessing = _OperationLock.isLocked('file_processing');
        const embedding = _OperationLock.isLocked('embedding_generation');

        if (fileProcessing || embedding) {
            const blockedBy = fileProcessing ? 'file upload' : 'embedding generation';
            if (_showToast) _showToast(`Cannot reset while ${blockedBy} is in progress`);
            return;  // ← ABORT BEFORE ATTEMPT
        }
    }
    showResetConfirmModal();
}
```

**Propagation Pattern:**
1. **Checks:** `isLocked()` before attempting acquire
2. **Action:** Shows toast, prevents modal display
3. **Result:** User sees immediate feedback
4. **Advantage:** No exception thrown (cleaner flow)

---

### Level 3: Service Layer - Business Logic

#### RAG Module (`js/rag.js`)

```javascript
// Lines 888-895 - Qdrant Embedding Generation
let embeddingLockId = null;
if (window.OperationLock) {
    try {
        embeddingLockId = await window.OperationLock.acquire('embedding_generation');
    } catch (lockError) {
        throw new Error(`Cannot generate embeddings: ${lockError.message}`);
    }
}

// Lines 1278-1285 - Local Embedding Generation
let embeddingLockId = null;
if (window.OperationLock) {
    try {
        embeddingLockId = await window.OperationLock.acquire('embedding_generation');
    } catch (lockError) {
        throw new Error(`Cannot generate embeddings: ${lockError.message}`);
    }
}
```

**Propagation Pattern:**
1. **Catches:** Lock acquisition error
2. **Action:** Wraps with service context
3. **Result:** Re-throws to caller
4. **Error Chain:** `Error → Error (with context)`

**Error Chain Example:**
```
Original: "Operation 'embedding_generation' blocked by: privacy_clear"
Wrapped:  "Cannot generate embeddings: Operation 'embedding_generation' blocked by: privacy_clear"
```

#### Storage Module (`js/storage.js`)

```javascript
// Lines 343-350 - Privacy Clear Operation
let lockId = null;
if (window.OperationLock) {
    try {
        lockId = await window.OperationLock.acquire('privacy_clear');
    } catch (e) {
        return { success: false, error: e.message };  // ← RETURN OBJECT
    }
}
```

**Propagation Pattern:**
1. **Catches:** Lock acquisition error
2. **Action:** Returns structured error object
3. **Result:** No exception thrown
4. **Caller:** Must check `result.success`

---

### Level 4: UI Layer - User Feedback

#### Toast Notifications

```javascript
// Pattern used across controllers
_showToast(`Cannot upload: ${lockError.message}`);
_showToast(`Cannot reset while ${blockedBy} is in progress`);
_showToast(`Cannot generate embeddings: ${lockError.message}`);
```

#### Button State Management

```javascript
// Listen for lock events
window.addEventListener('operationlock', (e) => {
    const { action, operationName, activeLocks } = e.detail;
    
    if (operationName === 'file_processing') {
        const uploadBtn = document.getElementById('upload-btn');
        if (action === 'acquired') {
            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Processing...';
        } else if (action === 'released') {
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload File';
        }
    }
});
```

---

### Level 5: Recovery Layer - Advanced Handling

#### Pre-Flight Checks

```javascript
// Recommended pattern for all operations
async function safeOperation(operationName, operationFn) {
    // Check if operation can be acquired
    const check = OperationLock.canAcquire(operationName);
    
    if (!check.canAcquire) {
        const blockedBy = check.blockedBy.join(', ');
        const message = `Cannot start ${operationName}. Currently blocked by: ${blockedBy}`;
        
        // Show detailed feedback
        showToast(message, 'warning');
        
        // Optionally: Show estimated time or queue operation
        const activeLocks = OperationLock.getActiveLocks();
        console.warn('Active locks:', activeLocks);
        
        return { success: false, reason: 'locked', blockedBy };
    }
    
    // Proceed with operation
    try {
        const lockId = await OperationLock.acquire(operationName);
        const result = await operationFn();
        OperationLock.release(operationName, lockId);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
```

#### Retry Queue Implementation

```javascript
// For non-critical operations
class OperationQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
    }
    
    async enqueue(operationName, operationFn, priority = 0) {
        return new Promise((resolve, reject) => {
            this.queue.push({
                operationName,
                operationFn,
                priority,
                resolve,
                reject
            });
            this.queue.sort((a, b) => b.priority - a.priority);
            this.processQueue();
        });
    }
    
    async processQueue() {
        if (this.processing) return;
        this.processing = true;
        
        while (this.queue.length > 0) {
            const item = this.queue[0];
            
            // Check if we can acquire lock
            const check = OperationLock.canAcquire(item.operationName);
            if (!check.canAcquire) {
                // Wait 1 second then retry
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            
            // Execute operation
            try {
                const lockId = await OperationLock.acquire(item.operationName);
                const result = await item.operationFn();
                OperationLock.release(item.operationName, lockId);
                item.resolve(result);
            } catch (error) {
                item.reject(error);
            }
            
            this.queue.shift();
        }
        
        this.processing = false;
    }
}
```

---

## Current Implementation Gaps

### 1. Race Condition Risk
```javascript
// ❌ PROBLEMATIC PATTERN (used in FileUploadController)
if (_OperationLock.isLocked('file_processing')) {
    _showToast('Upload already in progress');
    return;
}
// Race condition: lock could be acquired here by another operation
currentFileLockId = await _OperationLock.acquire('file_processing');
```

**Solution:**
```javascript
// ✅ CORRECT PATTERN
try {
    currentFileLockId = await _OperationLock.acquire('file_processing');
} catch (lockError) {
    _showToast(`Cannot upload: ${lockError.message}`);
    return;
}
```

### 2. No Timeout Mechanism
Locks can be held indefinitely if not released properly.

**Solution:** Add timeout to lock acquisition:
```javascript
async function acquireWithTimeout(operationName, timeoutMs = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
        try {
            return await OperationLock.acquire(operationName);
        } catch (error) {
            if (Date.now() - startTime > timeoutMs) {
                throw new Error(`Lock acquisition timeout: ${error.message}`);
            }
            await new Promise(r => setTimeout(r, 100)); // Wait 100ms
        }
    }
}
```

### 3. No Status Reporting
No way to query "why is this blocked?" or "when will it be available?"

**Solution:** Add diagnostic API:
```javascript
function getLockStatus(operationName) {
    const check = canAcquire(operationName);
    const activeLocks = getActiveLocks();
    
    return {
        canAcquire: check.canAcquire,
        blockedBy: check.blockedBy,
        activeLocks,
        timestamp: Date.now()
    };
}
```

### 4. Inconsistent Error Handling
Different layers handle failures differently.

**Solution:** Standardize error types:
```javascript
class LockAcquisitionError extends Error {
    constructor(operationName, blockedBy) {
        super(`Operation '${operationName}' blocked by: ${blockedBy.join(', ')}`);
        this.name = 'LockAcquisitionError';
        this.operationName = operationName;
        this.blockedBy = blockedBy;
        this.recoverable = true;
    }
}
```

---

## Recommended Implementation Checklist

### ✅ Immediate Actions
- [ ] Replace `isLocked()` + `acquire()` patterns with try-catch
- [ ] Add `canAcquire()` pre-flight checks to all controllers
- [ ] Standardize error messages across all layers

### ✅ Short-term Improvements
- [ ] Implement OperationQueue for non-critical operations
- [ ] Add lock status diagnostic API
- [ ] Create LockAcquisitionError class
- [ ] Add timeout mechanism for lock acquisition

### ✅ Long-term Enhancements
- [ ] Implement deadlock detection
- [ ] Add lock priority system
- [ ] Create lock visualization/debugging tools
- [ ] Add automatic lock release on page unload

---

## Testing Lock Propagation

### Test Scenario 1: File Upload During Privacy Clear
```javascript
// Setup: Privacy clear is running
await OperationLock.acquire('privacy_clear');

// Attempt: File upload
try {
    await OperationLock.acquire('file_processing');
    assert.fail('Should have thrown');
} catch (error) {
    assert.equal(error.message, "Operation 'file_processing' blocked by: privacy_clear");
}
```

### Test Scenario 2: Concurrent Spotify Fetch
```javascript
// Setup: Spotify fetch running
await OperationLock.acquire('spotify_fetch');

// Attempt: Another Spotify fetch (should succeed)
const lockId = await OperationLock.acquire('spotify_fetch');
assert.notEqual(lockId, null);
```

### Test Scenario 3: Reset During Active Operations
```javascript
// Setup: File processing running
await OperationLock.acquire('file_processing');

// Attempt: Reset (should check first)
const canReset = !OperationLock.isLocked('file_processing');
assert.equal(canReset, false);
```

---

## Summary

The operation lock system provides effective mutual exclusion but lacks comprehensive failure propagation documentation. Key improvements needed:

1. **Eliminate race conditions** by removing `isLocked()` + `acquire()` patterns
2. **Standardize error handling** across all layers
3. **Add recovery mechanisms** (retry queues, timeouts)
4. **Provide diagnostic APIs** for better debugging
5. **Document the hierarchy** clearly for future developers

This document serves as the missing contract specification for operation lock failure propagation.