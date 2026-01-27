# Pattern Worker Pool Decomposition Plan

## Current File Analysis
- **Location**: `js/workers/pattern-worker-pool.js`
- **Lines**: 1,122
- **Concerns**: Worker lifecycle, pool management, task distribution, backpressure, heartbeat monitoring

## Module Boundaries

### 1. worker-lifecycle.js (~250 lines)
**Responsibility**: Worker creation, termination, and health monitoring

**Functions to extract**:
- `createWorker(workerIndex)` - Extract from init() lines 157-181
- `terminateWorker(worker, index)` - Extract from restartWorker() lines 631-693
- `setupHeartbeatChannel(worker, index)` - Lines 405-450
- `restartWorker(workerInfo, index)` - Lines 631-693
- `startHeartbeat()` - Lines 700-712
- `stopHeartbeat()` - Lines 719-725
- `sendHeartbeat()` - Lines 458-486
- `checkStaleWorkers()` - Lines 519-621

**State to manage**:
- `workers` array
- `workerLastHeartbeat` Map
- `workerHeartbeatChannels` Map
- `heartbeatInterval`
- `initialized` flag

**Dependencies**:
- `../config/timeouts.js` (WORKER_TIMEOUTS)
- `../services/event-bus.js` (EventBus)

---

### 2. pool-management.js (~200 lines)
**Responsibility**: Pool sizing, scaling, and status reporting

**Functions to extract**:
- `calculateOptimalWorkerCount(options)` - Extract from init() lines 134-152
- `resizePool(newCount)` - New function for dynamic resizing
- `getStatus()` - Lines 877-890
- `getSpeedupFactor()` - Lines 1032-1038
- `getMemoryConfig()` - Lines 1075-1086
- `isSharedArrayBufferAvailable()` - Lines 61-75
- `partitionData(data, numPartitions)` - Lines 1048-1069

**Constants**:
- `DEFAULT_WORKER_COUNT`
- `MEMORY_CONFIG`
- `SHARED_MEMORY_AVAILABLE`

**State to manage**:
- Hardware detection (navigator.hardwareConcurrency, navigator.deviceMemory)
- Memory configuration

**Dependencies**:
- `../config/timeouts.js`

---

### 3. task-distribution.js (~300 lines)
**Responsibility**: Task scheduling, load balancing, and result aggregation

**Functions to extract**:
- `detectAllPatterns(streams, chunks, onProgress)` - Lines 735-791
- `detectWithSingleWorker(streams, chunks, onProgress)` - Lines 801-835
- `fallbackToSync(streams, chunks)` - Lines 844-852
- `distributeTask(requestId, streams, chunks, patternGroups)` - Extract from detectAllPatterns
- `aggregateResults(results)` - Lines 860-870
- `handleWorkerMessage(event)` - Lines 211-325
- `handleWorkerError(error)` - Lines 333-394

**State to manage**:
- `pendingRequests` Map
- `requestId` counter
- `PATTERN_GROUPS` constant
- `pendingResultCount`
- `paused`
- `backpressureListeners`
- `BACKPRESSURE_THRESHOLD`
- `BACKPRESSURE_RESUME_THRESHOLD`
- `resultConsumptionCalls` Map

**Dependencies**:
- `../patterns.js` (Patterns)
- `../services/event-bus.js` (EventBus)

---

### 4. pattern-worker-pool.js (facade) (~150 lines)
**Responsibility**: Re-export all modules, maintain backward compatibility

**Exports**:
```javascript
export {
  // From worker-lifecycle
  init,
  terminate,

  // From task-distribution
  detectAllPatterns,

  // From pool-management
  getStatus,
  getSpeedupFactor,
  getMemoryConfig,
  partitionData,

  // From task-distribution (backpressure)
  onBackpressure,
  onResultConsumed,
  isPaused,

  // Configuration constants
  PATTERN_GROUPS,
  SHARED_MEMORY_AVAILABLE
} from './index.js';
```

**API compatibility object**:
```javascript
export const PatternWorkerPool = {
  init,
  terminate,
  detectAllPatterns,
  getStatus,
  getSpeedupFactor,
  onBackpressure,
  onResultConsumed,
  isPaused,
  getMemoryConfig,
  partitionData,
  PATTERN_GROUPS,
  SHARED_MEMORY_AVAILABLE
};
```

---

## State Management Strategy

### Option 1: Shared State (Simpler, faster)
- Pass state objects between modules
- Modules mutate shared state
- Faster to implement, less boilerplate

### Option 2: Encapsulated State (Cleaner, more modular)
- Each module manages its own state
- Public API exposes state accessors
- More testable, better isolation

**Decision**: Use **Option 1 (Shared State)** for initial extraction to minimize refactoring risk. Can migrate to Option 2 later if needed.

---

## Test Strategy

### worker-lifecycle.test.js (~50 tests)
- Worker creation and initialization
- Heartbeat channel setup
- Heartbeat sending and receiving
- Stale worker detection
- Worker restart (atomic transitions)
- Worker termination and cleanup
- Memory leak prevention
- Error handling

### pool-management.test.js (~40 tests)
- Optimal worker count calculation
- Hardware concurrency detection
- Device memory adaptation
- SharedArrayBuffer detection
- Memory configuration
- Data partitioning
- Status reporting
- Speedup factor calculation

### task-distribution.test.js (~60 tests)
- Task distribution to workers
- Single worker vs multi-worker
- Progress callbacks
- Partial results handling
- Error handling and recovery
- Result aggregation
- Backpressure detection and management
- Request cleanup and memory management
- Fallback to sync mode

---

## Execution Order

1. ✅ Create directory structure
2. ✅ Create decomposition plan
3. **Next**: Write worker-lifecycle.test.js
4. Extract worker-lifecycle.js
5. Write pool-management.test.js
6. Extract pool-management.js
7. Write task-distribution.test.js
8. Extract task-distribution.js
9. Create facade (index.js + pattern-worker-pool.js)
10. Run all tests
11. Update imports in consuming files

---

## Risk Mitigation

### Merge Conflicts
- Extract modules one at a time
- Commit after each successful extraction
- Keep tests green at all times

### Backward Compatibility
- Maintain PatternWorkerPool namespace
- Re-export all existing APIs
- Keep function signatures identical

### Performance
- No overhead from module decomposition
- Same runtime behavior as monolith
- Test with benchmarks if needed

---

## Success Criteria

✅ All modules <250 lines
✅ 150-200 tests total
✅ 100% backward compatibility
✅ All existing imports work without changes
✅ No performance regression
✅ Clear separation of concerns
