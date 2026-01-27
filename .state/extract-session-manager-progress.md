# Session Manager Decomposition Progress

## Analysis Summary

**File:** js/services/session-manager.js (1,130 lines)
**Current Tests:** tests/unit/session-manager.test.js (723 lines)

### Module Boundaries Identified:

#### 1. session-lifecycle.js (~250 lines)
**Responsibilities:**
- Session creation (createNewSession)
- Session activation (loadSession)
- Session switching (switchSession)
- Session deletion (deleteSessionById)
- Session clearing (clearConversation)
- Session renaming (renameSession)

**Functions to extract:**
- generateUUID()
- isValidUUID()
- createNewSession()
- loadSession()
- switchSession()
- deleteSessionById()
- renameSession()
- clearConversation()
- generateSessionTitle()
- notifySessionUpdate()

**Dependencies:**
- EventBus
- Storage
- AppState
- session-lock-manager

#### 2. session-state.js (~250 lines)
**Responsibilities:**
- Session state management (get/set/update)
- Message history management
- State synchronization with AppState
- Deep cloning for immutability
- Mutex protection for concurrent access

**Functions to extract:**
- getSessionData()
- setSessionData()
- updateSessionData()
- getCurrentSessionId()
- getHistory()
- addMessageToHistory()
- addMessagesToHistory()
- removeMessageFromHistory()
- truncateHistory()
- replaceHistory()
- deepCloneMessage()
- deepCloneMessages()
- syncSessionIdToAppState()

**Dependencies:**
- Mutex (from utils/concurrency/mutex.js)
- AppState
- DataVersion

#### 3. session-recovery.js (~200 lines)
**Responsibilities:**
- Emergency backup/restore
- Session recovery from crashes
- Legacy migration
- Session validation

**Functions to extract:**
- validateSession()
- saveCurrentSession()
- saveConversation()
- flushPendingSaveAsync()
- emergencyBackupSync()
- recoverEmergencyBackup()
- init()

**Dependencies:**
- Storage
- EventBus
- safeJsonParse
- STORAGE_KEYS

#### 4. session-manager.js facade (~150 lines)
**Responsibilities:**
- Re-export all modules
- Maintain SessionManager namespace
- Keep configuration constants
- Register event schemas
- Setup event listeners

**Constants to keep:**
- SESSION_EVENT_SCHEMAS
- MAX_SAVED_MESSAGES
- MESSAGE_LIMIT_WARNING_THRESHOLD
- SESSION_EMERGENCY_BACKUP_MAX_AGE_MS

**Public API to maintain:**
- All lifecycle functions
- All state access functions
- All persistence functions
- All utility functions
- Lock management functions

## Test Strategy

### Existing Test Coverage:
- 723 lines of comprehensive tests
- Tests cover all major functionality
- Good mock infrastructure in place

### New Test Files to Create:
1. tests/unit/session-manager/session-lifecycle.test.js (~50 tests)
2. tests/unit/session-manager/session-state.test.js (~50 tests)
3. tests/unit/session-manager/session-recovery.test.js (~40 tests)
4. Keep tests/unit/session-manager.test.js as integration tests

### Test Migration Plan:
1. Copy relevant tests to new test files
2. Update imports to test individual modules
3. Add new tests for module-specific edge cases
4. Keep integration tests for facade

## Extraction Order

1. **session-state.js** (Foundational - no dependencies on other modules)
2. **session-lifecycle.js** (Depends on session-state)
3. **session-recovery.js** (Depends on both above)
4. **session-manager.js facade** (Re-exports everything)

## Progress Tracking

- [x] Read and analyze session-manager.js
- [x] Read existing test file
- [x] Create state document
- [ ] Create session-state.test.js
- [ ] Extract session-state.js
- [ ] Create session-lifecycle.test.js
- [ ] Extract session-lifecycle.js
- [ ] Create session-recovery.test.js
- [ ] Extract session-recovery.js
- [ ] Create facade in session-manager.js
- [ ] Run all tests
- [ ] Update dependent imports

## Backward Compatibility

All existing imports must continue to work:
```javascript
import { SessionManager } from './services/session-manager.js';
```

The facade will re-export from the focused modules to maintain this API.
