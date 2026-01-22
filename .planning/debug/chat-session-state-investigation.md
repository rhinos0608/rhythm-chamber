---
status: diagnosed
trigger: "Investigate state management issues with chat sessions in the rhythm-chamber codebase. Sessions may not be properly initialized, maintained, or cleaned up."
created: "2025-01-22T00:00:00.000Z"
updated: "2025-01-22T00:00:00.000Z"
---

## STATE MANAGEMENT INVESTIGATION REPORT

### Investigation Summary

This investigation analyzed the chat session state management architecture in the rhythm-chamber codebase. The codebase uses a multi-layered state management approach with potential synchronization issues between in-memory state, persistent storage, and UI state.

---

## STEP 1: IDENTIFIED STATE MANAGEMENT COMPONENTS

### State Management Files Found

| File | Responsibility | State Owned |
|------|----------------|-------------|
| `js/services/session-manager.js` | Session lifecycle, persistence | `currentSessionId`, `_sessionData` |
| `js/state/app-state.js` | Centralized application state | `ui.currentSessionId`, view, data |
| `js/services/conversation-orchestrator.js` | Conversation context | `userContext`, `streamsData` |
| `js/services/message-lifecycle-coordinator.js` | Message processing | Delegates to SessionManager |
| `js/services/turn-queue.js` | Message serialization | Queue state, metrics |
| `js/storage/indexeddb.js` | Persistent storage | IndexedDB connection |
| `js/storage/config-api.js` | Config/token storage | Unified config API |
| `js/controllers/sidebar-controller.js` | Session UI state | Sidebar state, session list |

---

## STEP 2: CRITICAL ISSUES IDENTIFIED

### CRITICAL: Session State Duplication

**Severity:** CRITICAL
**Location:** Multiple files

**Issue:** Session ID is stored in THREE different locations:
1. `SessionManager.currentSessionId` (module-level variable in `session-manager.js:37`)
2. `AppState.ui.currentSessionId` (in `app-state.js:42`)
3. `Storage.getConfig(SESSION_CURRENT_SESSION_KEY)` and `localStorage`

**Problem:** These can become out of sync:
- `SessionManager.createNewSession()` updates `currentSessionId` and storage (lines 200-231)
- `SessionManager.loadSession()` updates `currentSessionId` and storage (lines 268-299)
- `AppState.ui.currentSessionId` is NEVER updated by SessionManager operations
- SidebarController reads from `Chat.getCurrentSessionId()` which returns `SessionManager.currentSessionId`
- But other components might read from AppState

**Impact:** Components reading from different sources will see inconsistent session IDs.

---

### CRITICAL: Dual Session Data Sources

**Severity:** CRITICAL
**Location:** `session-manager.js:43-44` vs `session-manager.js:771`

**Issue:** Session messages exist in TWO places:
1. `_sessionData` - module-local in-memory state (line 43)
2. `window._sessionData` - legacy global window object (line 771, 99)

**Problem:**
- Functions like `getSessionData()` return a copy of `_sessionData` (lines 50-56)
- But `window._sessionData` is also maintained for "legacy compatibility"
- If code reads from `window._sessionData` directly, it bypasses the mutex protection
- The window global can become stale if updated outside `setSessionData()`

**Impact:** Race conditions in concurrent message updates, stale state in components reading from window.

---

### HIGH: In-Memory vs Persisted State Desynchronization

**Severity:** HIGH
**Location:** `session-manager.js:315-369` (saveCurrentSession)

**Issue:** Message truncation happens ONLY during save, not in memory:
- In-memory `_sessionData.messages` can have up to `MAX_SAVED_MESSAGES * 2` messages (line 656)
- When saving to IndexedDB, only `MAX_SAVED_MESSAGES` (100) are persisted (lines 337-362)
- This creates a discrepancy between in-memory and persisted state

**Problem:** After page reload:
- User sees 100 messages (what was persisted)
- But before reload, they might have seen up to 200 messages
- No warning about this truncation during normal usage

**Impact:** User confusion about "missing" messages after reload.

---

### HIGH: Missing State Synchronization After Session Switch

**Severity:** HIGH
**Location:** `session-manager.js:520-536` (switchSession)

**Issue:** `switchSession()` calls `loadSession()` but doesn't update `AppState`:
- `SessionManager.switchSession()` updates `currentSessionId` (line 528)
- `SessionManager.switchSession()` updates storage (via `loadSession()`)
- But `AppState.ui.currentSessionId` is NEVER updated
- Components subscribing to AppState won't be notified

**Impact:** UI components relying on AppState won't reflect session changes.

---

### MEDIUM: Race Condition in Session Save

**Severity:** MEDIUM
**Location:** `session-manager.js:77-104` (updateSessionData mutex)

**Issue:** The mutex implementation has a flaw:
- `updateSessionData()` chains promises sequentially (lines 77-104)
- But `addMessageToHistory()` doesn't use the mutex (lines 645-673)
- `addMessageToHistory()` directly mutates `_sessionData.messages`

**Problem:** Rapid calls to `addMessageToHistory()` can interleave with `updateSessionData()`:
```javascript
// Thread 1: addMessageToHistory
_sessionData.messages = [..._sessionData.messages, message1];

// Thread 2: updateSessionData (using mutex)
const currentData = getSessionData(); // Gets copy with message1
_sessionData = { ...newData }; // Overwrites, potentially losing message1
```

**Impact:** Lost messages during rapid message additions.

---

### MEDIUM: No State Hydration on Session Load

**Severity:** MEDIUM
**Location:** `session-manager.js:248-309` (loadSession)

**Issue:** When loading a session:
- Messages are loaded from IndexedDB into `_sessionData` (lines 272-275)
- `window._sessionData` is synced (lines 277-279)
- But `ConversationOrchestrator` and `MessageOperations` are NOT notified

**Problem:** `ConversationOrchestrator` and `MessageOperations` may cache old context from previous session.

**Impact:** Stale context in newly loaded sessions, causing incorrect LLM responses.

---

### LOW: Memory Leak Potential

**Severity:** LOW
**Location:** `sidebar-controller.js:29-31` and `turn-queue.js:40`

**Issue:** Event listeners and queue entries:
- Rename input event listeners have cleanup (lines 548-560)
- TurnQueue maintains history of ALL completed turns (line 58)
- TurnQueue history grows to `METRICS_CONFIG.historySize` (100 entries)

**Problem:** TurnQueue metrics history could grow unbounded if `resetMetrics()` is never called.

**Impact:** Memory accumulation over long sessions.

---

### LOW: Message Truncation Without User Notification

**Severity:** LOW (User Experience)
**Location:** `session-manager.js:324-334` (saveCurrentSession warning)

**Issue:** Warning only shown at 90 messages:
- `MESSAGE_LIMIT_WARNING_THRESHOLD = 90` (line 30)
- `hasWarnedAboutMessageLimit` is checked (line 325)
- But if user already passed 90, they won't see the warning
- Truncation silently happens at 100 messages (line 341)

**Impact:** User may not realize messages are being dropped.

---

## STATE FLOW DIAGRAM

```
User sends message
       |
       v
[Chat.sendMessage()] -> [MessageLifecycleCoordinator.sendMessage()]
       |
       v
[SessionManager.addMessageToHistory()] -> Updates _sessionData.messages
       |
       v
[SessionManager.saveConversation()] -> Debounced save (2 seconds)
       |
       v
[SessionManager.saveCurrentSession()] -> Persist to IndexedDB
       |
       v
[IndexedDB put] -> Storage.saveSession
       |
       +---> [EventBus emit 'session:updated']
       |
       +---> [AppState.update?] <- MISSING! Not updated by SessionManager
```

---

## ROOT CAUSE ANALYSIS

### Primary Issue: Fragmented State Ownership

The chat session state has NO SINGLE SOURCE OF TRUTH:

1. **SessionManager** owns `currentSessionId` and `_sessionData`
2. **AppState** owns `ui.currentSessionId` (never synced)
3. **Storage** owns persisted sessions (IndexedDB)
4. **window._sessionData** owns legacy global copy

### Secondary Issue: Missing Event Emitter Integration

`SessionManager` emits events via `EventBus` (line 769):
- `notifySessionUpdate('session:created', ...)`
- `notifySessionUpdate('session:updated', ...)`

But:
- `AppState` does NOT subscribe to these events
- Components reading from AppState won't be notified of session changes

### Tertiary Issue: Incomplete Async Mutex Protection

The `updateSessionData()` mutex (lines 77-104) only protects calls that use it:
- `addMessageToHistory()` does NOT use mutex (direct mutation)
- `removeMessageFromHistory()` does NOT use mutex (direct mutation)
- `truncateHistory()` does NOT use mutex (direct mutation)
- `replaceHistory()` does NOT use mutex (direct mutation)

This means concurrent message operations can still cause race conditions.

---

## RECOMMENDED FIXES

### Fix 1: Single Source of Truth for Session ID

**File:** `js/services/session-manager.js`

Make `SessionManager` the ONLY source of truth, remove `AppState.ui.currentSessionId`:

```javascript
// In SessionManager, add getter for UI components
function getCurrentSessionState() {
    return {
        id: currentSessionId,
        messageCount: _sessionData.messages.length,
        createdAt: currentSessionCreatedAt
    };
}

// Remove from AppState.ui.currentSessionId
// Components should call SessionManager.getCurrentSessionId() directly
```

### Fix 2: Remove window._sessionData Global

**File:** `js/services/session-manager.js`

Remove all `window._sessionData` assignments:
- Line 99: In `updateSessionData()`
- Line 210: In `createNewSession()`
- Line 278: In `loadSession()`
- Line 614: In `clearConversation()`
- Line 669: In `addMessageToHistory()`
- Line 689: In `removeMessageFromHistory()`
- Line 707: In `truncateHistory()`
- Line 722: In `replaceHistory()`

Add deprecation warning for any code trying to read it:

```javascript
// At module initialization
if (typeof window !== 'undefined') {
    Object.defineProperty(window, '_sessionData', {
        get() {
            console.warn('[DEPRECATED] window._sessionData is deprecated. Use SessionManager.getHistory() instead.');
            return getSessionData();
        },
        set() {
            console.warn('[DEPRECATED] Setting window._sessionData is not supported. Use SessionManager methods.');
        }
    });
}
```

### Fix 3: Make Message Operations Use Mutex

**File:** `js/services/session-manager.js`

Convert all message mutation operations to use `updateSessionData()`:

```javascript
function addMessageToHistory(message) {
    return updateSessionData((currentData) => {
        if (!currentData.messages) {
            currentData.messages = [];
        }

        // Tag with data version
        if (DataVersion.tagMessage) {
            DataVersion.tagMessage(message);
        }

        // Apply in-memory sliding window
        const IN_MEMORY_MAX = MAX_SAVED_MESSAGES * 2;
        const systemMessages = currentData.messages.filter(m => m.role === 'system');
        const nonSystemMessages = currentData.messages.filter(m => m.role !== 'system');

        let newMessages;
        if (nonSystemMessages.length >= IN_MEMORY_MAX - systemMessages.length) {
            newMessages = [...systemMessages, ...nonSystemMessages.slice(-(IN_MEMORY_MAX - systemMessages.length - 1)), message];
        } else {
            newMessages = [...currentData.messages, message];
        }

        return { id: currentData.id, messages: newMessages };
    });
}
```

### Fix 4: Sync Session Changes to AppState

**File:** `js/services/session-manager.js` and `js/state/app-state.js`

Option A: Make SessionManager emit to AppState (preferred):

```javascript
// In session-manager.js
function notifySessionUpdate(eventType = 'session:updated', eventPayload = {}) {
    EventBus.emit(eventType, { sessionId: currentSessionId, ...eventPayload });

    // Also update AppState if available
    if (typeof AppState !== 'undefined' && AppState.update) {
        AppState.update('ui', {
            currentSessionId: currentSessionId,
            messageCount: _sessionData.messages?.length || 0
        });
    }
}
```

### Fix 5: Consistent Message Limit Handling

**File:** `js/services/session-manager.js`

Apply the same message limit to in-memory state as persisted state:

```javascript
// Change IN_MEMORY_MAX to match MAX_SAVED_MESSAGES
const IN_MEMORY_MAX = MAX_SAVED_MESSAGES; // Was MAX_SAVED_MESSAGES * 2

// Or alternatively, persist all in-memory messages
// and warn user about large session size
```

---

## FILES CHANGED SUMMARY

| File | Lines | Severity | Issue |
|------|-------|----------|-------|
| `js/services/session-manager.js` | 37, 43, 77-104, 272-275, 645-673 | CRITICAL | Dual session state sources, incomplete mutex |
| `js/state/app-state.js` | 42 | CRITICAL | Duplicated currentSessionId |
| `js/controllers/sidebar-controller.js` | 371-402 | HIGH | Missing AppState sync after session switch |
| `js/services/turn-queue.js` | 58 | LOW | Potential unbounded metrics growth |
| `js/chat.js` | 119, 361-376 | HIGH | Dual SessionManager.init() calls |

---

## VERIFICATION CHECKLIST

After applying fixes:

- [ ] Session ID is consistent across SessionManager, AppState, and Storage
- [ ] window._sessionData is deprecated/removed
- [ ] All message mutations use updateSessionData() mutex
- [ ] AppState.ui is updated when session changes
- [ ] In-memory and persisted message counts match
- [ ] No race conditions in rapid message operations
- [ ] Session switching updates all subscribers
- [ ] Message truncation warnings are visible to user

---

## CONFIDENCE PROGRESSION

- **Step 1 (Component Discovery):** 100% confidence in identified state files
- **Step 2 (Issue Analysis):** 95% confidence in critical/high issues
- **Step 3 (Root Cause):** 90% confidence - requires runtime verification
- **Step 4 (Fixes):** Requires testing to confirm effectiveness

---

## ISSUES FOUND SUMMARY

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | Session state duplication, Dual data sources |
| HIGH | 2 | In-memory/persisted desync, Missing state sync |
| MEDIUM | 2 | Race condition, No state hydration |
| LOW | 2 | Memory leak potential, Silent truncation |
| **TOTAL** | **8** | |

---

## NEXT STEPS

1. **Immediate:** Fix critical session state duplication (single source of truth)
2. **Short-term:** Remove window._sessionData global, implement proper mutex
3. **Medium-term:** Add comprehensive session state tests
4. **Long-term:** Consider Redux/Zustand for unified state management

---

## ADDITIONAL NOTES

- The codebase has good separation of concerns (HNW architecture)
- Event bus system exists but not fully utilized for state synchronization
- Multiple "todo" comments indicate known areas for improvement
- The ES Module migration removed window globals but some legacy code remains
- Debug file exists: `.planning/debug/chat-initialization-race-condition.md` (related issue)
