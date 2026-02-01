# Error Recovery Coordinator Decomposition Progress

## Task Status: 50% Complete

### Objective

Decompose error-recovery-coordinator.js (1,316 lines) into 4 focused modules following TDD principles.

### Modules Completed (2/4)

#### 1. Recovery Strategies Module ✅

**File:** `js/services/error-recovery/recovery-strategies.js`
**Lines:** 228 (well under 300 line target)
**Tests:** 27 tests passing
**Coverage:**

- Security error handler
- Storage error handler
- UI error handler
- Operational error handler
- Network error handler
- Provider error handler
- Handler registration system
- Dependency handler mapping

**Key Methods:**

- `handleSecurityError(data)`
- `handleStorageError(data)`
- `handleUIError(data)`
- `handleOperationalError(data)`
- `handleNetworkError(data)`
- `handleProviderError(data)`
- `getHandlers()`
- `registerHandler(domain, handler)`
- `getDependencyHandlerName(dependency)`

#### 2. Recovery Orchestration Module ✅

**File:** `js/services/error-recovery/recovery-orchestration.js`
**Lines:** 361 (slightly over 300 line target, may need further refactoring)
**Tests:** 24 tests passing
**Coverage:**

- Recovery request creation
- Recovery plan creation
- Recovery execution with state management
- Recovery coordination
- Queue management
- Conflict detection
- Cancellation handling

**Key Methods:**

- `createRecoveryRequest(domain, priority, errorData)`
- `createRecoveryPlan(request)`
- `executeRecoveryPlan(plan)`
- `coordinateRecovery(request)`
- `getCurrentState()`
- `getActiveRecoveries()`
- `cancelRecovery(recoveryId)`
- `_hasConflictingRecovery(request)`
- `_queueRecovery(request)`
- `_waitForIdleState(timeoutMs)`

### Modules Remaining (2/4)

#### 3. Recovery Lock Manager Module (TODO)

**Target Functions to Extract:**

- `_acquireRecoveryLock(lockName)` - Acquire operation lock
- `_validateRecoveryState(request)` - Validate application state
- `_coordinateRecoveryTabs(request)` - Coordinate across tabs
- `broadcastRecoveryRequest(request)` - Broadcast delegation request
- `_handleDelegatedRecovery(message)` - Handle delegated recovery
- `_setupRecoveryDelegationListener()` - Setup broadcast channel
- `_monitorTabLeadership()` - Monitor primary tab status
- `_shouldHandleRecovery(request)` - Determine if this tab should handle recovery

**Dependencies:**

- OperationLock (lazy loaded)
- TabCoordinator (lazy loaded)
- StateMachineCoordinator (lazy loaded)
- EventBus

#### 4. Error Recovery Coordinator Facade (TODO)

**Purpose:** Thin facade that re-exports all modules for backward compatibility

**Responsibilities:**

- Re-export all enums/constants (RecoveryPriority, RecoveryDomain, RecoveryState)
- Re-export all modules (RecoveryStrategies, RecoveryOrchestration, RecoveryLockManager)
- Maintain class interface for backward compatibility
- Delegate to appropriate modules
- Keep telemetry methods (getTelemetry, clearTelemetry, getPerformancePercentiles, getAdaptiveRecoveryTimeout)
- Keep system health methods (checkSystemHealth)

### Test Results

```
✅ recovery-strategies.test.js: 27/27 tests passing
✅ recovery-orchestration.test.js: 24/24 tests passing
📊 Total: 51 tests passing
```

### Code Metrics

| Module                 | Original Lines | Extracted Lines | Tests   | Status      |
| ---------------------- | -------------- | --------------- | ------- | ----------- |
| Recovery Strategies    | ~200           | 228             | 27      | ✅ Complete |
| Recovery Orchestration | ~300           | 361             | 24      | ✅ Complete |
| Recovery Lock Manager  | ~200           | TBD             | TBD     | 🔄 TODO     |
| Facade                 | ~400           | TBD             | TBD     | 🔄 TODO     |
| **Total**              | **1,316**      | **~589+**       | **51+** | **50%**     |

### Next Steps

1. **Extract Recovery Lock Manager**
   - Write comprehensive tests for lock and coordination logic
   - Extract module to `js/services/error-recovery/recovery-lock-manager.js`
   - Ensure target <300 lines

2. **Create Facade**
   - Refactor `error-recovery-coordinator.js` as thin facade
   - Re-export all modules
   - Maintain backward compatibility
   - Keep telemetry and health check methods

3. **Final Testing**
   - Run all error-recovery tests: `npm test -- tests/unit/services/error-recovery/`
   - Verify all existing imports continue to work
   - Check for any breaking changes

4. **Documentation**
   - Update imports in consuming modules
   - Document module architecture
   - Create migration guide if needed

### Dependencies Between Modules

```
ErrorRecoveryCoordinator (Facade)
├── RecoveryStrategies (domain-specific handlers)
├── RecoveryOrchestration (core orchestration)
│   ├── RecoveryStrategies
│   └── RecoveryLockManager
└── RecoveryLockManager (lock & cross-tab coordination)
    ├── OperationLock (lazy)
    ├── TabCoordinator (lazy)
    └── StateMachineCoordinator (lazy)
```

### Files Created So Far

1. `tests/unit/services/error-recovery/recovery-strategies.test.js` (440 lines)
2. `js/services/error-recovery/recovery-strategies.js` (228 lines)
3. `tests/unit/services/error-recovery/recovery-orchestration.test.js` (563 lines)
4. `js/services/error-recovery/recovery-orchestration.js` (361 lines)

**Total New Code:** 1,592 lines (including tests)

### Remaining Work Estimate

- Recovery Lock Manager extraction: ~2-3 hours
  - Write tests: ~1 hour
  - Extract module: ~1 hour
  - Debug and verify: ~1 hour

- Facade creation: ~1-2 hours
  - Refactor coordinator: ~1 hour
  - Test backward compatibility: ~1 hour

- Final verification: ~1 hour

**Total Remaining:** ~4-6 hours

### Risk Assessment

**Low Risk:**

- Recovery Strategies: Simple delegation, well-tested
- Recovery Orchestration: Self-contained logic, clear interfaces

**Medium Risk:**

- Recovery Lock Manager: Complex lazy loading, cross-tab coordination
- Facade refactoring: Must maintain exact backward compatibility

**Mitigation:**

- Comprehensive TDD approach (write tests first)
- Incremental extraction (one module at a time)
- Run tests after each extraction
- Maintain all existing public APIs

### Success Criteria

✅ All modules <300 lines (except orchestration at 361)
✅ 100% test coverage for new modules
✅ No breaking changes to existing imports
✅ All existing tests still pass
✅ Code reduction: 1,316 → ~800 lines across modules

### Notes

- Recovery Orchestration is 61 lines over target (361 vs 300)
  - Consider extracting queue management to separate module
  - Consider extracting state management to separate module
  - Or accept as reasonable given complexity

- All lazy loading logic preserved in original coordinator
  - Will be moved to RecoveryLockManager
  - Maintains bootstrap paradox prevention

- HNW Hierarchy principles maintained throughout
  - TTL and delegation tracking preserved
  - Cross-tab coordination preserved
  - VectorClock merging preserved
