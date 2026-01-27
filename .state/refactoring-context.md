# God Object Refactoring Context

**Date:** 2026-01-27
**Status:** In Progress - Module Extraction Complete, Integration Pending

## Overview

Refactoring three God objects into focused, single-responsibility modules:
- **transaction.js** (1,456 lines) → 4-module decomposition
- **validation.js** (1,382 lines) → Extract crypto hashing
- **storage.js** (994 lines) → Extract auto-repair service

## Completed Work

### ✅ Module Extraction (8 commits)

1. **Feature Flag Infrastructure**
   - File: `js/config/refactoring-flags.js`
   - All flags set to `true` for new implementations

2. **Transaction Module Decomposition** (4/4 modules created)
   - `transactional-resource.js` (61 lines) - Base interface
   - `transaction-state.js` (158 lines) - Fatal state & nested guards
   - `compensation-logger.js` (238 lines) - Rollback failure logging
   - `two-phase-commit.js` (207 lines) - Protocol coordinator

3. **Crypto Hashing Module**
   - `crypto-hashing.js` (105 lines) - SHA-256 with LRU cache
   - Exports: `hashMessageContent`, `clearHashCache`, `getHashCacheSize`, `MessageHashCache`

4. **Auto-Repair Service**
   - `auto-repair.js` (133 lines) - Storage consistency repair
   - Exports: `AutoRepairService` class

## Current Integration State

### validation.js
- **Line 16:** `import { hashMessageContent } from './crypto-hashing.js';` ✅
- **Lines 63-88:** Old `_hashMessageContent()` function still exists ❌
- **Issue:** Import exists but old inline code not removed

### storage.js
- **Line 26:** `import { AutoRepairService } from './storage/auto-repair.js';` ✅
- **Lines 54-149:** Old inline auto-repair config still exists ❌
- **Issue:** Import exists but still uses inline implementation

### transaction.js
- **Line 1454:** `export { StorageTransaction };` ✅
- **Missing:** `js/storage/transaction/index.js` composition root ❌
- **Issue:** New modules exist but aren't wired together

## Remaining Tasks

### 1. Create Transaction Composition Root (CRITICAL)
**File:** `js/storage/transaction/index.js`
**Priority:** BLOCKS ALL OTHER WORK

Must create composition root that:
- Imports all 4 transaction modules
- Wires dependencies (CompensationLogger injection)
- Creates StorageTransaction facade using TwoPhaseCommitCoordinator
- Provides feature flag toggle (but no legacy file exists)
- Exports public API

### 2. Update validation.js
**File:** `js/utils/validation.js`
**Lines to remove:** 63-88 (old `_hashMessageContent` function)
**Lines to update:** Replace `_hashMessageContent` calls with `hashMessageContent`
**Tests:** Run `npm test -- tests/unit/validation.test.js`

### 3. Update storage.js
**File:** `js/storage.js`
**Lines to remove:** 54-149 (old auto-repair config and functions)
**Lines to add:** Instantiate `AutoRepairService` and delegate to it
**Functions to replace:**
- `getAutoRepairConfig()` → delegate to service
- `setAutoRepairConfig()` → delegate to service
- `setAutoRepairEnabled()` → delegate to service
- `isAutoRepairEnabled()` → delegate to service
- `logRepair()` → delegate to service
- `getRepairLog()` → delegate to service

### 4. Test & Verify
- Toggle feature flags independently
- Run full test suite
- Performance comparison

### 5. Cleanup
- Remove feature flag infrastructure (no legacy exists)
- Update imports to remove flag checks
- Final verification

## Architecture Notes

### Transaction Module Structure
```
js/storage/transaction/
├── index.js (MISSING - composition root)
├── transactional-resource.js (interface)
├── transaction-state.js (state management)
├── compensation-logger.js (logging)
└── two-phase-commit.js (protocol)
```

### Dependency Injection
- CompensationLogger needs: EventBus, IndexedDBCore access
- TwoPhaseCommitCoordinator needs: CompensationLogger
- StorageTransaction facade needs: TwoPhaseCommitCoordinator, resources

### Feature Flags
Since no legacy-transaction.js exists, feature flag check should default to new implementation:
```javascript
if (REFACTORING_FLAGS.USE_NEW_TRANSACTION) {
  // Always true - no legacy exists
  export { StorageTransaction };
}
```

## Test Coverage

### Existing Tests
- `tests/unit/storage/transaction/transaction-state.test.js` ✅

### Missing Tests
- `compensation-logger.test.js`
- `two-phase-commit.test.js`
- `crypto-hashing.test.js`
- `auto-repair.test.js`
- Integration tests

## Success Criteria

- [ ] Transaction composition root created
- [ ] validation.js updated and tested
- [ ] storage.js updated and tested
- [ ] All new modules have tests
- [ ] Full test suite passes
- [ ] Feature flags verified
- [ ] Legacy code removed (flags cleaned up)
- [ ] Zero God objects >1000 lines

## Blocking Issues

1. **No composition root** - 4 transaction modules can't be used together
2. **Mixed integration** - validation.js and storage.js have imports but old code
3. **No legacy implementation** - Feature flags can't toggle to legacy (doesn't exist)

## Next Actions

1. Create `js/storage/transaction/index.js` composition root (HIGHEST PRIORITY)
2. Clean up `validation.js` (remove old hashing code)
3. Clean up `storage.js` (delegate to AutoRepairService)
4. Write missing tests
5. Verify and cleanup
