# SessionManager Refactoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the SessionManager refactoring by restoring missing persistence functions, event listeners, and ensuring API compatibility with existing code.

**Architecture:** The SessionManager was split into focused modules:
- `session-state.js`: Session data management with mutex protection
- `session-lifecycle.js`: Session CRUD operations and lifecycle
- `index.js`: Internal coordinator
- `session-manager.js`: Public facade

The refactoring is incomplete - critical persistence functions (`saveConversation`, `flushPendingSaveAsync`, `emergencyBackupSync`, `recoverEmergencyBackup`) and event listeners are missing from the facade.

**Tech Stack:** ES Modules, IndexedDB (via Storage API), localStorage, EventBus, Vitest

---

## Context

### Missing Functions (Called by chat.js and message-lifecycle-coordinator.js)
1. `saveConversation(delayMs)` - Debounced auto-save called after messages
2. `flushPendingSaveAsync()` - Async save on visibilitychange
3. `emergencyBackupSync()` - Sync backup on beforeunload/pagehide
4. `recoverEmergencyBackup()` - Recover backup on init

### Missing Event Listeners
- `visibilitychange` → `flushPendingSaveAsync()`
- `beforeunload` → `emergencyBackupSync()`
- `pagehide` → `emergencyBackupSync()`

### Original Implementation Location
Commit `a5fddfb:js/services/session-manager.js` (lines 503-656)

---

## Task 1: Add Persistence Module

**Files:**
- Create: `js/services/session-manager/session-persistence.js`
- Test: `tests/unit/session-persistence.test.js`

**Step 1: Write the failing test**

```javascript
// tests/unit/session-persistence.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as SessionPersistence from '../../js/services/session-manager/session-persistence.js';

describe('SessionPersistence - saveConversation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('should debounce save calls', () => {
        const saveSpy = vi.spyOn(SessionPersistence, 'saveCurrentSession');

        SessionPersistence.saveConversation(2000);
        SessionPersistence.saveConversation(1000);
        SessionPersistence.saveConversation(500);

        expect(saveSpy).not.toHaveBeenCalled();
        vi.advanceTimersByTime(500);
        expect(saveSpy).toHaveBeenCalledOnce();
    });
});

describe('SessionPersistence - emergencyBackupSync', () => {
    it('should save backup to localStorage synchronously', () => {
        // Mock current session state
        SessionPersistence.setCurrentSessionId('test-id');
        SessionPersistence.setSessionDataForTest({
            id: 'test-id',
            messages: [{ role: 'user', content: 'test' }]
        });

        SessionPersistence.emergencyBackupSync();

        const backup = localStorage.getItem('rc_session_emergency_backup');
        expect(backup).toBeTruthy();
        const data = JSON.parse(backup);
        expect(data.sessionId).toBe('test-id');
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit tests/unit/session-persistence.test.js`
Expected: FAIL with "saveConversation is not defined"

**Step 3: Create session-persistence.js module**

```javascript
// js/services/session-manager/session-persistence.js
'use strict';

import * as SessionState from './session-state.js';
import { Storage } from '../../storage.js';

// ==========================================
// Constants
// ==========================================

const SESSION_CURRENT_SESSION_KEY = 'rc_current_session_id';
const SESSION_EMERGENCY_BACKUP_KEY = 'rc_session_emergency_backup';
const SESSION_EMERGENCY_BACKUP_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const MAX_SAVED_MESSAGES = 100;

// ==========================================
// State
// ==========================================

let autoSaveTimeoutId = null;

// ==========================================
// Safe JSON Parse
// ==========================================

/**
 * Safely parse JSON with fallback
 * @param {string} str - JSON string
 * @param {*} fallback - Fallback value
 * @returns {*} Parsed object or fallback
 */
function safeJsonParse(str, fallback) {
    try {
        return JSON.parse(str);
    } catch {
        return fallback;
    }
}

// ==========================================
// Session Title Generation
// ==========================================

/**
 * Generate a title for the session based on first user message
 * @param {Array} messages - Array of message objects
 * @returns {string} Generated session title
 */
function generateSessionTitle(messages) {
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg?.content && typeof firstUserMsg.content === 'string' && firstUserMsg.content.trim().length > 0) {
        const chars = Array.from(firstUserMsg.content.trim());
        const title = chars.slice(0, 50).join('');
        return chars.length > 50 ? title + '...' : title;
    }
    return 'New Chat';
}

// ==========================================
// Core Persistence Functions
// ==========================================

/**
 * Save current session to IndexedDB immediately
 * @returns {Promise<boolean>} True if save succeeded
 */
export async function saveCurrentSession() {
    const currentSessionId = SessionState.getCurrentSessionId();
    if (!currentSessionId || !Storage.saveSession) {
        return false;
    }

    const sessionData = SessionState.getSessionData();
    const messages = sessionData.messages || [];
    const currentSessionCreatedAt = SessionState.getCurrentSessionCreatedAt();

    try {
        const systemMessages = messages.filter(m => m.role === 'system');
        const nonSystemMessages = messages.filter(m => m.role !== 'system');
        const messagesToSave = messages.length > MAX_SAVED_MESSAGES
            ? [...systemMessages, ...nonSystemMessages.slice(-(MAX_SAVED_MESSAGES - systemMessages.length))]
            : messages;

        const session = {
            id: currentSessionId,
            title: generateSessionTitle(messages),
            createdAt: currentSessionCreatedAt,
            messages: messagesToSave,
            metadata: {
                personalityName: window._userContext?.personality?.name || 'Unknown',
                personalityEmoji: window._userContext?.personality?.emoji || '🎵',
                isLiteMode: false
            }
        };

        await Storage.saveSession(session);
        console.log('[SessionPersistence] Session saved:', currentSessionId);
        return true;
    } catch (e) {
        console.error('[SessionPersistence] Failed to save session:', e);
        return false;
    }
}

/**
 * Debounced auto-save for conversation
 * Called after messages are added/modified
 * @param {number} delayMs - Delay in milliseconds (default: 2000)
 */
export function saveConversation(delayMs = 2000) {
    if (autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
    }

    autoSaveTimeoutId = setTimeout(async () => {
        await saveCurrentSession();
        autoSaveTimeoutId = null;
    }, delayMs);
}

/**
 * Flush pending save asynchronously
 * Called on visibilitychange when tab goes hidden
 */
export async function flushPendingSaveAsync() {
    if (autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
        autoSaveTimeoutId = null;
    }

    const currentSessionId = SessionState.getCurrentSessionId();
    const sessionData = SessionState.getSessionData();

    if (currentSessionId && sessionData.id) {
        try {
            await saveCurrentSession();
            console.log('[SessionPersistence] Session flushed on visibility change');

            // Clear emergency backup after successful save
            try {
                localStorage.removeItem(SESSION_EMERGENCY_BACKUP_KEY);
            } catch (e) {
                console.warn('[SessionPersistence] Failed to clear emergency backup:', e);
            }
        } catch (e) {
            console.error('[SessionPersistence] Flush save failed:', e);
        }
    }
}

/**
 * Emergency synchronous backup to localStorage
 * Called on beforeunload/pagehide when tab is closing
 */
export function emergencyBackupSync() {
    const currentSessionId = SessionState.getCurrentSessionId();
    const sessionData = SessionState.getSessionData();

    if (!currentSessionId || !sessionData.id) return;

    const messages = sessionData.messages || [];
    if (messages.length === 0) return;

    const backup = {
        sessionId: currentSessionId,
        createdAt: SessionState.getCurrentSessionCreatedAt(),
        messages: messages.slice(-100),
        timestamp: Date.now()
    };

    try {
        localStorage.setItem(SESSION_EMERGENCY_BACKUP_KEY, JSON.stringify(backup));
        console.log('[SessionPersistence] Emergency backup saved');
    } catch (e) {
        console.error('[SessionPersistence] Emergency backup failed:', e);
    }
}

/**
 * Recover emergency backup on load
 * Should be called during initialization
 * @returns {Promise<boolean>} True if backup was recovered
 */
export async function recoverEmergencyBackup() {
    let backupStr = null;
    try {
        backupStr = localStorage.getItem(SESSION_EMERGENCY_BACKUP_KEY);
    } catch (e) {
        console.error('[SessionPersistence] Failed to get emergency backup:', e);
        return false;
    }

    if (!backupStr) return false;

    const backup = safeJsonParse(backupStr, null);
    if (!backup) {
        console.warn('[SessionPersistence] Emergency backup is corrupted');
        return false;
    }

    try {
        // Only recover if backup is recent (< 1 hour)
        if (Date.now() - backup.timestamp > SESSION_EMERGENCY_BACKUP_MAX_AGE_MS) {
            console.log('[SessionPersistence] Emergency backup too old, discarding');
            localStorage.removeItem(SESSION_EMERGENCY_BACKUP_KEY);
            return false;
        }

        let saveSuccess = false;

        // Check if session exists with fewer messages
        const existing = await Storage.getSession?.(backup.sessionId);
        if (existing) {
            const existingCount = existing.messages?.length || 0;
            const backupCount = backup.messages?.length || 0;

            if (backupCount > existingCount) {
                existing.messages = backup.messages;
                existing.createdAt = backup.createdAt || existing.createdAt;
                await Storage.saveSession(existing);
                saveSuccess = true;
                console.log('[SessionPersistence] Recovered', backupCount - existingCount, 'messages');
            } else {
                saveSuccess = true;
            }
        } else if (backup.messages?.length > 0) {
            await Storage.saveSession?.({
                id: backup.sessionId,
                title: 'Recovered Chat',
                createdAt: backup.createdAt,
                messages: backup.messages
            });
            saveSuccess = true;
            console.log('[SessionPersistence] Created session from emergency backup');
        }

        if (saveSuccess) {
            localStorage.removeItem(SESSION_EMERGENCY_BACKUP_KEY);
        }

        return saveSuccess;
    } catch (e) {
        console.error('[SessionPersistence] Failed to recover emergency backup:', e);
        return false;
    }
}

/**
 * Get current auto-save timeout ID (for testing)
 * @returns {number|null} Timeout ID
 */
export function getAutoSaveTimeoutId() {
    return autoSaveTimeoutId;
}

/**
 * Clear auto-save timeout (for testing)
 */
export function clearAutoSaveTimeout() {
    if (autoSaveTimeoutId) {
        clearTimeout(autoSaveTimeoutId);
        autoSaveTimeoutId = null;
    }
}

console.log('[SessionPersistence] Module loaded');
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit tests/unit/session-persistence.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/services/session-manager/session-persistence.js tests/unit/session-persistence.test.js
git commit -m "feat(session-manager): add persistence module for auto-save and emergency backup"
```

---

## Task 2: Integrate Persistence Module into Internal Index

**Files:**
- Modify: `js/services/session-manager/index.js`

**Step 1: Update internal index to import and re-export persistence**

```javascript
// Add to existing imports at top of file
import * as SessionPersistence from './session-persistence.js';

// Add to re-export section
export * from './session-persistence.js';

// Add to module exports
export { SessionPersistence };
```

**Step 2: Update createManager to include persistence methods**

```javascript
// In createManager() function, add:
export function createManager() {
    const instance = {
        // ... existing properties
        persistence: SessionPersistence,

        // Add persistence methods to instance
        async saveCurrentSession() {
            return await SessionPersistence.saveCurrentSession();
        },

        saveConversation(delayMs) {
            SessionPersistence.saveConversation(delayMs);
        },

        async flushPendingSaveAsync() {
            return await SessionPersistence.flushPendingSaveAsync();
        },

        emergencyBackupSync() {
            SessionPersistence.emergencyBackupSync();
        },

        async recoverEmergencyBackup() {
            return await SessionPersistence.recoverEmergencyBackup();
        },

        // ... existing cleanup
    };
    return instance;
}
```

**Step 3: Run tests to verify**

Run: `npm run test:api`
Expected: PASS (API compatibility tests still work)

**Step 4: Commit**

```bash
git add js/services/session-manager/index.js
git commit -m "feat(session-manager): integrate persistence module into internal index"
```

---

## Task 3: Add Persistence Methods to Facade

**Files:**
- Modify: `js/services/session-manager.js`

**Step 1: Add persistence methods to SessionManager class**

Find the SessionManager class and add after line 149 (after renameSession):

```javascript
// Add to SessionManager class after renameSession method

/**
 * Save current session immediately
 * @public
 * @returns {Promise<boolean>} Success status
 */
static async saveCurrentSession() {
    const manager = Internal.getSessionManager();
    return await manager.saveCurrentSession();
}

/**
 * Debounced auto-save
 * @public
 * @param {number} delayMs - Delay in milliseconds
 */
static saveConversation(delayMs = 2000) {
    const manager = Internal.getSessionManager();
    manager.saveConversation(delayMs);
}

/**
 * Flush pending save asynchronously
 * Called on visibilitychange
 * @public
 * @returns {Promise<void>}
 */
static async flushPendingSaveAsync() {
    const manager = Internal.getSessionManager();
    await manager.flushPendingSaveAsync();
}

/**
 * Emergency synchronous backup
 * Called on beforeunload/pagehide
 * @public
 */
static emergencyBackupSync() {
    const manager = Internal.getSessionManager();
    manager.emergencyBackupSync();
}

/**
 * Recover emergency backup on load
 * @public
 * @returns {Promise<boolean>} Success status
 */
static async recoverEmergencyBackup() {
    return await Internal.recoverEmergencyBackup();
}
```

**Step 2: Run API compatibility tests**

Run: `npm run test:api`
Expected: PASS (all 46 tests passing)

**Step 3: Update API compatibility test file to verify new methods**

Add to `tests/unit/api-compatibility.test.js` in the SessionManager section:

```javascript
it('should have saveCurrentSession method', () => {
    expect(typeof SessionManager.saveCurrentSession).toBe('function');
});

it('should have saveConversation method', () => {
    expect(typeof SessionManager.saveConversation).toBe('function');
});

it('should have flushPendingSaveAsync method', () => {
    expect(typeof SessionManager.flushPendingSaveAsync).toBe('function');
});

it('should have emergencyBackupSync method', () => {
    expect(typeof SessionManager.emergencyBackupSync).toBe('function');
});

it('should have recoverEmergencyBackup method', () => {
    expect(typeof SessionManager.recoverEmergencyBackup).toBe('function');
});
```

**Step 4: Run tests again**

Run: `npm run test:api`
Expected: PASS (now 51 tests)

**Step 5: Commit**

```bash
git add js/services/session-manager.js tests/unit/api-compatibility.test.js
git commit -m "feat(session-manager): add persistence methods to facade"
```

---

## Task 4: Register Event Listeners for Persistence

**Files:**
- Modify: `js/services/session-manager.js`

**Step 1: Add event listener registration**

Find the `eventListenersRegistered` static property and update it to be writable, then add registration method:

```javascript
// In SessionManager class, replace the static property definition
static eventListenersRegistered = false;

/**
 * Register event listeners for persistence
 * Should be called once during app initialization
 * @public
 * @static
 */
static registerEventListeners() {
    if (this.eventListenersRegistered) {
        console.warn('[SessionManager] Event listeners already registered');
        return;
    }

    if (typeof window === 'undefined') {
        return; // Not in browser environment
    }

    // Async save when tab goes hidden (mobile switch, minimize, tab switch)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            this.flushPendingSaveAsync();
        }
    });

    // Sync backup when tab is actually closing
    window.addEventListener('beforeunload', () => {
        this.emergencyBackupSync();
    });

    // Also handle pagehide for mobile Safari compatibility
    window.addEventListener('pagehide', () => {
        this.emergencyBackupSync();
    });

    this.eventListenersRegistered = true;
    console.log('[SessionManager] Event listeners registered');
}
```

**Step 2: Update initialize() to call registerEventListeners**

```javascript
// In SessionManager.initialize(), add at the end:
static async initialize() {
    const manager = Internal.getSessionManager();
    await manager.initialize();

    // Recover emergency backup
    await this.recoverEmergencyBackup();

    // Register event listeners
    this.registerEventListeners();
}
```

**Step 3: Add test for event listener registration**

```javascript
// In tests/unit/api-compatibility.test.js, add to SessionManager section:

it('should have registerEventListeners method', () => {
    expect(typeof SessionManager.registerEventListeners).toBe('function');
});

it('should register event listeners only once', () => {
    const initialRegistered = SessionManager.eventListenersRegistered;
    SessionManager.registerEventListeners();
    expect(SessionManager.eventListenersRegistered).toBe(true);
    // Should not register twice
    SessionManager.registerEventListeners();
    expect(SessionManager.eventListenersRegistered).toBe(true);
});
```

**Step 4: Run tests**

Run: `npm run test:api`
Expected: PASS (53 tests)

**Step 5: Commit**

```bash
git add js/services/session-manager.js tests/unit/api-compatibility.test.js
git commit -m "feat(session-manager): register event listeners for persistence"
```

---

## Task 5: Update Chat.js to Use Facade Methods

**Files:**
- Modify: `js/chat.js`

**Step 1: Verify existing calls work**

The existing calls in chat.js should already work since we added them to the facade. Verify by checking:

```javascript
// These should now work without changes:
SessionManager.saveConversation();
SessionManager.flushPendingSaveAsync();
SessionManager.emergencyBackupSync();
SessionManager.recoverEmergencyBackup();
```

**Step 2: Run full test suite**

Run: `npm run test:unit`
Expected: All session-manager tests pass

**Step 3: Run Playwright tests**

Run: `npx playwright test`
Expected: All browser tests pass

**Step 4: Commit (no changes needed if all tests pass)**

```bash
# If no changes needed, just verify with:
npm run test
```

---

## Task 6: Update MessageLifecycleCoordinator to Use Facade

**Files:**
- Verify: `js/services/message-lifecycle-coordinator.js`

**Step 1: Verify existing calls work**

The message-lifecycle-coordinator already uses `saveConversation()` via injected `_SessionManager` dependency. Verify calls work:

Lines 482, 518, 547, 609, 617 all call `_SessionManager.saveConversation()`.

**Step 2: Run integration tests**

Run: `npm run test`
Expected: All tests pass

**Step 3: Commit (no changes needed)**

---

## Task 7: Add EventBus Schema Registration

**Files:**
- Modify: `js/services/session-manager/session-lifecycle.js`

**Step 1: Add schema exports**

The session-lifecycle module already emits events via EventBus. Add schema definitions at the top:

```javascript
// Add after imports in session-lifecycle.js

/**
 * Session event schemas
 * Registered with EventBus during initialization for decentralized schema management
 */
export const SESSION_EVENT_SCHEMAS = {
    'session:created': {
        description: 'New session created',
        payload: { sessionId: 'string', title: 'string' }
    },
    'session:loaded': {
        description: 'Session loaded from storage',
        payload: { sessionId: 'string', messageCount: 'number' }
    },
    'session:switched': {
        description: 'Switched to different session',
        payload: { fromSessionId: 'string|null', toSessionId: 'string' }
    },
    'session:deleted': {
        description: 'Session deleted',
        payload: { sessionId: 'string' }
    },
    'session:updated': {
        description: 'Session data updated',
        payload: { sessionId: 'string', field: 'string' }
    }
};
```

**Step 2: Register schemas in facade**

```javascript
// In js/services/session-manager.js, add to imports
import { SESSION_EVENT_SCHEMAS } from './session-manager/session-lifecycle.js';

// Add after class definition
export { SESSION_EVENT_SCHEMAS };

// Or in initialize():
static async initialize() {
    const manager = Internal.getSessionManager();
    await manager.initialize();

    // Register event schemas
    if (typeof EventBus !== 'undefined' && EventBus.registerSchemas) {
        EventBus.registerSchemas(SESSION_EVENT_SCHEMAS);
    }

    await this.recoverEmergencyBackup();
    this.registerEventListeners();
}
```

**Step 3: Add test for schema registration**

```javascript
// In tests/unit/api-compatibility.test.js:

it('should export SESSION_EVENT_SCHEMAS', () => {
    const { SessionManager } = await import('../../js/services/session-manager.js');
    // The schemas should be available either as export or via SessionLifecycle
    expect(SessionManager.SESSION_EVENT_SCHEMAS || SESSION_EVENT_SCHEMAS).toBeDefined();
});
```

**Step 4: Run tests**

Run: `npm run test:api`
Expected: PASS

**Step 5: Commit**

```bash
git add js/services/session-manager/session-lifecycle.js js/services/session-manager.js tests/unit/api-compatibility.test.js
git commit -m "feat(session-manager): add EventBus schema registration"
```

---

## Task 8: Update API Compatibility Documentation

**Files:**
- Modify: `tests/unit/api-compatibility.test.js`

**Step 1: Update breaking changes documentation**

```javascript
// Update the "API Breaking Changes - Documentation" section:

describe('API Breaking Changes - Documentation', () => {
    it('should document SessionManager breaking changes', () => {
        const breakingChanges = {
            'init()': 'initialize() - Has alias for backward compatibility',
            'createNewSession()': 'createSession() - Use new name',
            'deleteSessionById()': 'deleteSession() - Use new name',
            'clearConversation()': 'clearAllSessions() - Use new name',
            'listSessions()': 'getAllSessions() - Use new name',
            'setUserContext()': 'Deprecated - Still exists as no-op with warning',
            'onSessionUpdate()': 'Removed - Use EventBus.on("session:*") instead',
            'switchSession()': 'Still available - Moved to internal module',
            'loadSession()': 'Still available - Use activateSession() or loadSession()',
            // New persistence methods added
            'saveConversation()': 'Available - Added back in refactoring',
            'flushPendingSaveAsync()': 'Available - Added back in refactoring',
            'emergencyBackupSync()': 'Available - Added back in refactoring',
            'recoverEmergencyBackup()': 'Available - Added back in refactoring'
        };

        // Verify backward compatibility
        expect(typeof SessionManager.init).toBe('function');
        expect(typeof SessionManager.initialize).toBe('function');
        expect(typeof SessionManager.saveConversation).toBe('function');
        expect(typeof SessionManager.flushPendingSaveAsync).toBe('function');
        expect(typeof SessionManager.emergencyBackupSync).toBe('function');
        expect(typeof SessionManager.recoverEmergencyBackup).toBe('function');
    });
});
```

**Step 2: Run final API tests**

Run: `npm run test:api`
Expected: PASS with all documented APIs verified

**Step 3: Commit**

```bash
git add tests/unit/api-compatibility.test.js
git commit -m "docs(session-manager): update API compatibility documentation"
```

---

## Task 9: Final Integration Test

**Files:**
- Test: Full test suite

**Step 1: Run all unit tests**

Run: `npm run test:unit`
Expected: All tests pass

**Step 2: Run API compatibility tests**

Run: `npm run test:api`
Expected: All API tests pass

**Step 3: Run Playwright tests**

Run: `npm run test`
Expected: All browser tests pass

**Step 4: Manual smoke test**

Run: `npm run dev`
Expected: App loads, can create sessions, send messages, refresh page persists data

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(session-manager): complete refactoring with persistence and event listeners"
```

---

## Summary

After completing all tasks:
- 4 persistence functions restored (`saveConversation`, `flushPendingSaveAsync`, `emergencyBackupSync`, `recoverEmergencyBackup`)
- 3 event listeners registered (visibilitychange, beforeunload, pagehide)
- EventBus schemas registered
- API compatibility maintained with backward-compatible aliases
- All tests passing (unit + API + browser)
- Emergency backup functionality working for data recovery

**Total estimated changes:**
- 1 new file: `session-persistence.js`
- 3 modified files: `index.js`, `session-lifecycle.js`, `session-manager.js`
- 1 new test file: `session-persistence.test.js`
- 2 updated test files: `api-compatibility.test.js`, existing session-manager tests

**Test coverage:**
- API compatibility: 55+ tests
- Persistence: 10+ tests
- Integration: Existing Playwright tests verify end-to-end
