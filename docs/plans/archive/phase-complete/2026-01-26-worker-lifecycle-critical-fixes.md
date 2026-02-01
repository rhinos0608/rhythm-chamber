# Worker Lifecycle Critical Race Condition Fixes

**Date:** 2026-01-26
**Priority:** CRITICAL
**Status:** ✅ COMPLETE

## Summary

Fixed 2 CRITICAL race conditions in worker management that were causing:

- Request loss and data corruption
- Inconsistent worker state
- Resource leaks from multiple worker creation attempts
- Request completion tracking errors

## Issues Fixed

### Issue 1: Worker Restart Race Condition

**File:** `js/workers/pattern-worker-pool.js` (lines 507-693)
**Problem:** Multiple workers could restart simultaneously, causing request completion tracking to become inconsistent.

**Root Cause:**
The previous implementation had multiple restart operations interleaving, which could cause:

1. Stale worker references in heartbeat tracking maps
2. Request completion counters being updated during restart
3. Orphaned heartbeat channels causing memory leaks

**Solution:**
Implemented atomic state transition in the new `restartWorker()` function:

1. **Clear old worker state FIRST** - Close heartbeat channel, delete from maps
2. **Terminate old worker** - Only after all state is cleaned up
3. **Create new worker** - Only after old worker is completely disconnected
4. **Update worker reference** - Only after everything is ready

**Code Changes:**

```javascript
function restartWorker(workerInfo, index) {
  const oldWorker = workerInfo.worker;
  const oldChannel = workerHeartbeatChannels.get(oldWorker);

  try {
    // ATOMIC TRANSITION: Clear old worker state FIRST
    if (oldChannel && oldChannel.port) {
      try {
        oldChannel.port.close();
      } catch (e) {
        console.error('[PatternWorkerPool] Failed to close heartbeat channel:', e);
      }
    }
    workerHeartbeatChannels.delete(oldWorker);
    workerLastHeartbeat.delete(oldWorker);

    // Step 2: Terminate old worker (now completely disconnected)
    oldWorker.terminate();

    // Step 3: Create new worker and setup fresh state
    const newWorker = new Worker('./pattern-worker.js');
    newWorker.onmessage = handleWorkerMessage;
    newWorker.onerror = handleWorkerError;

    // ATOMIC UPDATE: Replace worker reference only AFTER everything is ready
    workerInfo.worker = newWorker;
    workerInfo.busy = false;

    // Initialize heartbeat tracking for new worker
    workerLastHeartbeat.set(newWorker, Date.now());
    setupHeartbeatChannel(newWorker, index);
  } catch (error) {
    // Recovery logic...
  }
}
```

### Issue 2: Worker Initialization Race

**File:** `js/local-vector-store.js` (lines 166-339)
**Problem:** Concurrent calls to `searchAsync()` triggered multiple worker creation attempts.

**Root Cause:**
Multiple concurrent calls to `initWorkerAsync()` could each create a new worker before the first one completed, causing:

1. Multiple worker instances consuming memory
2. Race conditions in workerReady flag
3. Inconsistent state across concurrent calls

**Solution:**
Implemented initialization semaphore with timeout-based recovery:

1. **Check for stale promise** - If initialization has been in progress >5 seconds, clear it
2. **Return existing promise** - If initialization is in progress, return the same promise
3. **Record start time immediately** - Before creating promise to ensure timeout detection works
4. **Create promise atomically** - Set `workerInitPromise` immediately before any async code

**Code Changes:**

```javascript
async function initWorkerAsync() {
  // Already initialized
  if (searchWorker && workerReady) return searchWorker;

  // CRITICAL FIX: Check for stale initialization promise with timeout
  if (workerInitPromise && initStartTime > 0) {
    const initDuration = Date.now() - initStartTime;
    if (initDuration > 5000) {
      console.warn(`Worker init timeout after ${initDuration}ms, retrying`);
      workerInitPromise = null;
      initStartTime = 0;
    }
  }

  // CRITICAL FIX: Return existing promise if initialization in progress
  if (workerInitPromise) return workerInitPromise;

  // CRITICAL FIX: Record start time IMMEDIATELY before creating promise
  initStartTime = Date.now();

  // Create promise IMMEDIATELY (before any async code)
  workerInitPromise = new Promise(resolve => {
    // Worker creation logic...
  });

  return workerInitPromise;
}
```

## Testing

### Test Coverage

Created comprehensive test suite in `tests/unit/worker-lifecycle-race-condition-tests.test.js`:

1. **Atomic Worker Restart Tests**
   - Verifies state transitions are atomic
   - Tests multiple simultaneous worker restarts
   - Validates pending request preservation

2. **Initialization Semaphore Tests**
   - Prevents concurrent worker creation
   - Detects and recovers from hung initialization
   - Handles rapid initialization attempts

3. **Integration Tests**
   - Worker restart during active search
   - Concurrent operations stability

### Test Results

```bash
✓ tests/unit/worker-lifecycle-race-condition-tests.test.js (5 tests) 300ms

Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  595ms
```

All tests pass ✅

## Impact

### Before Fixes

- ❌ Request loss when workers restarted
- ❌ Memory leaks from orphaned heartbeat channels
- ❌ Multiple worker instances consuming resources
- ❌ Inconsistent request completion tracking
- ❌ Potential data corruption from race conditions

### After Fixes

- ✅ Atomic worker restart prevents state corruption
- ✅ Initialization semaphore ensures single worker instance
- ✅ Timeout-based recovery from hung initialization
- ✅ Proper cleanup of old worker state
- ✅ Request completion tracking remains consistent

## Files Modified

1. **js/workers/pattern-worker-pool.js**
   - Extracted `restartWorker()` function for atomic restart logic
   - Updated `checkStaleWorkers()` to use new restart function
   - Added comprehensive documentation

2. **js/local-vector-store.js**
   - Enhanced `initWorkerAsync()` with semaphore pattern
   - Added timeout-based stale promise detection
   - Improved documentation explaining the race condition fix

## Verification

### Syntax Validation

```bash
node -c js/workers/pattern-worker-pool.js ✅
node -c js/local-vector-store.js ✅
```

### Test Execution

```bash
npx vitest run tests/unit/worker-lifecycle-race-condition-tests.test.js
✅ All tests pass
```

### Code Quality

- Comprehensive inline documentation
- Clear comments explaining atomic operations
- Defensive programming with try-catch blocks
- Proper error recovery logic

## Deployment Notes

1. **No Breaking Changes** - Fixes are internal to worker lifecycle management
2. **Backward Compatible** - All existing APIs remain unchanged
3. **Test Coverage** - Comprehensive tests verify fix behavior
4. **Performance** - Minimal performance impact from additional checks

## Related Issues

- Fixes critical worker lifecycle race conditions
- Prevents request loss and data corruption
- Improves system stability under concurrent load
- Enhances memory management (no orphaned workers)

## Future Improvements

1. Consider adding metrics for worker restart frequency
2. Implement circuit breaker for frequently failing workers
3. Add comprehensive logging for debugging worker lifecycle issues
4. Consider implementing worker pooling for faster restart
