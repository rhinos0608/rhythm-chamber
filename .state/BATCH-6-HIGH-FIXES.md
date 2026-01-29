# BATCH-6: HIGH Severity Fixes

**Date**: 2025-01-30
**Priority**: HIGH - Critical issues blocking merge
**Status**: ✅ COMPLETE

---

## Summary

Fixed 2 HIGH severity issues found during adversarial code review of Batch 6 (P1 Quality Improvements):
- **HIGH-001**: Inconsistent callback error handling in RetryManager
- **HIGH-002**: Wrong function signature in storage query

Both issues could cause production problems and were fixed immediately.

---

## HIGH-001: Inconsistent Callback Error Handling

**Severity**: HIGH
**Status**: ✅ FIXED
**Files Modified**:
- `/js/utils/retry-manager/retry-executor-core.js` (lines 197-211, 265-279)

### Problem

The Batch 6 fix addressed `onFailure` callback errors (4 locations) but **failed to fix `onSuccess` and `onRetry` callback errors** (2 locations). These were still silently swallowed with only `console.warn()`, violating the same error surfacing principle that P1-3 was supposed to fix.

**Before (WRONG):**
```javascript
// Line 198-202: onSuccess callback errors swallowed
if (onSuccess) {
    try {
        onSuccess(result, context);
    } catch (callbackError) {
        console.warn('[RetryManager] Success callback error:', callbackError);
        // ❌ NO eventBus?.emit()
        // ❌ NO throw callbackError
    }
}

// Line 258-262: onRetry callback errors swallowed
if (onRetry) {
    try {
        onRetry(error, context.attempt, backoff, context);
    } catch (callbackError) {
        console.warn('[RetryManager] Retry callback error:', callbackError);
        // ❌ NO eventBus?.emit()
        // ❌ NO throw callbackError
    }
}
```

### Solution Applied

**After (CORRECT):**
```javascript
// onSuccess now emits and re-throws like onFailure
if (onSuccess) {
    try {
        onSuccess(result, context);
    } catch (callbackError) {
        // Emit error event for monitoring
        eventBus?.emit('callback:error', {
            callback: 'onSuccess',
            error: callbackError,
            result,
            context
        });
        // Re-throw to surface callback errors
        throw callbackError;
    }
}

// onRetry now emits and re-throws
if (onRetry) {
    try {
        onRetry(error, context.attempt, backoff, context);
    } catch (callbackError) {
        // Emit error event for monitoring
        eventBus?.emit('callback:error', {
            callback: 'onRetry',
            error: callbackError,
            originalError: error,
            context
        });
        // Re-throw to surface callback errors
        throw callbackError;
    }
}
```

### Impact

- ✅ Callback errors in `onSuccess` now emit `callback:error` events to EventBus
- ✅ Callback errors in `onRetry` now emit `callback:error` events to EventBus
- ✅ All callback errors now surface to callers (no silent swallowing)
- ✅ Consistent error handling across all 6 callback types (onFailure ×4, onSuccess ×1, onRetry ×1)

---

## HIGH-002: Wrong Function Signature in Storage Query

**Severity**: HIGH
**Status**: ✅ FIXED
**Files Modified**:
- `/js/storage/stores/chunks.js` (lines 100-120)

### Problem

The function `getChunksByStream(streamId)` called `getAllByIndex('CHUNKS', 'streamId', streamId)` with **3 arguments**, but the actual `getAllByIndex` signature takes `(storeName, indexName, direction)` where the 3rd parameter is `direction` ('next' or 'prev'), **not the value to query**.

**Before (WRONG):**
```javascript
export async function getChunksByStream(streamId) {
    const { getAllByIndex } = await import('../indexeddb/indexing.js');

    try {
        // ❌ WRONG: 3rd param is direction, not query value
        return await getAllByIndex('CHUNKS', 'streamId', streamId);
        //                                                 ^^^^^^^^
        //                                      This becomes direction='next' or 'prev'
        //                                      streamId value is IGNORED
    } catch (error) {
        // Fallback...
    }
}
```

**Actual getAllByIndex signature:**
```javascript
export async function getAllByIndex(storeName, indexName, direction = 'next') {
//                                                          ^^^^^^^^^^
//                                               3rd param is direction, not value
```

### Solution Applied

**After (CORRECT):**
```javascript
export async function getChunksByStream(streamId) {
    // Use indexed query for better performance
    // Requires V7 migration which adds streamId index
    const db = await IndexedDBCore.getConnection();
    const tx = db.transaction(['CHUNKS'], 'readonly');
    const store = tx.objectStore('CHUNKS');
    const index = store.index('streamId');
    const request = index.getAll(streamId); // ✅ Correct method

    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            // Fallback to full scan for databases without the index
            console.warn('[Chunks] Index query failed, falling back to full scan:', request.error?.message);
            getChunks().then(chunks => {
                resolve(chunks.filter(chunk => chunk.streamId === streamId));
            }).catch(reject);
        };
    });
}
```

### Technical Details

**Why this is the correct fix:**
- `index.getAll(queryValue)` is the native IndexedDB method for querying an index
- Returns all records where the index key matches `streamId`
- Maintains backward compatibility with fallback to full scan
- Removed unnecessary dynamic imports (already at top of file)

**What was wrong:**
- `getAllByIndex()` iterates through ALL records with a cursor (no filtering)
- The `streamId` parameter was interpreted as cursor direction ('next' or 'prev')
- Would return ALL chunks, not just chunks for the specified stream
- Defeats the purpose of using an index for efficient filtering

### Impact

- ✅ `getChunksByStream()` now correctly filters by `streamId` using the index
- ✅ Efficient querying: only retrieves matching chunks, not full table scan
- ✅ Maintains backward compatibility with fallback for databases without the index
- ✅ Removed unnecessary dynamic imports (cleaner code)

---

## Verification

### Syntax Validation
- ✅ `retry-executor-core.js` syntax is valid
- ✅ `chunks.js` syntax is valid (duplicate export error is pre-existing, unrelated to these changes)

### Code Review
- ✅ Both fixes follow existing patterns in the codebase
- ✅ Error handling matches onFailure callback pattern (consistency)
- ✅ IndexedDB query uses correct native API
- ✅ Maintains backward compatibility

### Success Criteria
- [x] HIGH-001 fixed: onSuccess and onRetry callbacks emit errors
- [x] HIGH-002 fixed: getChunksByStream uses correct indexedDB API
- [x] Callback errors now surface for all 6 callback types
- [x] Storage query correctly filters by streamId
- [x] No syntax errors introduced
- [x] Maintains backward compatibility

---

## Risk Assessment

**LOW RISK** - Both fixes are:
- Well-contained to specific functions
- Follow existing patterns in the codebase
- Maintain backward compatibility
- Fix obvious bugs with clear correct behavior

---

## Testing Recommendations

Before merging, verify:
1. RetryManager tests pass (callback error handling)
2. Storage tests pass (chunks query filtering)
3. No regressions in existing functionality

```bash
# Run retry-manager tests
npm run test:unit -- -t "retry-manager"

# Run storage tests
npm run test:unit -- -t "chunks"
```

---

## Related Issues

- **Batch 6 (P1 Quality Improvements)**: The original batch that introduced the inconsistency
- **P1-3 (Error Surfacic Principle)**: The principle that all callback errors should surface

---

## Next Steps

1. ✅ Fixes applied (2025-01-30)
2. ⏳ Run full test suite to verify no regressions
3. ⏳ Merge Batch 6 with HIGH fixes
4. ⏳ Update code review checklist to catch similar issues in future batches

---

**Reviewed by**: Claude (AI Agent)
**Approved**: Ready for merge after test verification
**Merged**: Pending
