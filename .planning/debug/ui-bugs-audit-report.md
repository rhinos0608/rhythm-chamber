# UI Controller Bug Audit Report

**Date**: 2026-01-21
**Auditor**: Adversarial UI Logic Agent
**Scope**: All controllers in `/js/controllers/`

---

## Executive Summary

This audit identified **14 bugs** across 5 controller files:
- **3 CRITICAL** bugs that can break functionality for certain users
- **5 HIGH** severity bugs affecting major functionality
- **4 MEDIUM** severity UX issues
- **3 LOW** severity accessibility issues

**Fixed**: 4 bugs (ObservabilityController tab cleanup, ViewController null checks, SidebarController resize handler, ChatUIController focus management)
**Documented for Fix**: 3 CRITICAL bugs requiring architectural changes

---

## Fixed Bugs

### 1. ObservabilityController - Tab Event Listener Memory Leak (HIGH -> FIXED)
**File**: `/js/controllers/observability-controller.js`

**Issue**: Tab click listeners were added but never removed when `destroy()` was called, causing memory leaks.

**Fix Applied**:
- Added `_tabClickHandlers` and `_tabElements` arrays to track listeners
- Created `_clearTabHandlers()` method for cleanup
- Updated `destroy()` to call `_clearTabHandlers()`

**Commit**: Memory leak fix - tab listeners now properly removed on destroy

---

### 2. ViewController - Missing Null Checks (MEDIUM -> FIXED)
**File**: `/js/controllers/view-controller.js`

**Issue**: Direct DOM access without null checks on `personality-emoji`, `personality-name`, and lite reveal elements.

**Fix Applied**:
- Wrapped all `getElementById` calls in null checks
- Prevents errors when elements don't exist

**Commit**: Added defensive null checks for all personality DOM elements

---

### 3. SidebarController - Mobile Overlay State Desync (MEDIUM -> FIXED)
**File**: `/js/controllers/sidebar-controller.js`

**Issue**: Overlay visibility depended on both `sidebarCollapsed` state AND `window.innerWidth`. No resize listener meant overlay state could desync when crossing breakpoint.

**Fix Applied**:
- Added `resizeHandler` variable to track window resize listener
- Added window resize listener that calls `updateSidebarVisibility()`
- Updated `destroy()` to remove resize handler

**DOM Structure**:
```
.sidebar-overlay.visible - shown when sidebar open AND mobile
  - Shows at window.innerWidth <= 768
  - Was not updating on resize crossing 768px threshold
```

**Commit**: Responsive overlay now syncs with window resize events

---

### 4. ChatUIController - Focus Management (MEDIUM -> FIXED)
**File**: `/js/controllers/chat-ui-controller.js`

**Issue**: After saving or canceling message edits, focus was not returned to chat input, breaking keyboard navigation.

**Fix Applied**:
- Added `restoreFocusToChatInput()` helper function
- Focus restored on both save and cancel
- Exported function for use by other controllers

**Event Flow**:
```
User edits message -> clicks Save/Cancel -> edit UI removed -> focus restored to chat input
```

**Commit**: Focus management after edit operations

---

## Complex Bugs Requiring Architectural Changes

### CRITICAL BUG #1: SidebarController - Edit Mode Event Listener Leak
**File**: `/js/controllers/sidebar-controller.js` (lines 374-404)

**Issue**: When renaming a session, an inline input element is created with `blur` and `keydown` event listeners. These listeners are NEVER removed when:
- The input is replaced with the new title
- The session is deleted
- The sidebar is re-rendered

**DOM Structure Context**:
```javascript
// In handleSessionRename()
input.addEventListener('blur', saveTitle);  // Line 396
input.addEventListener('keydown', (e) => { ... });  // Line 397
// When saved, titleEl.replaceWith(input) happens at line 386
// The old element with listeners is now orphaned but still in memory
```

**Event Flow Diagram**:
```
1. User clicks rename button -> handleSessionRename(sessionId)
2. New input element created with blur/keydown listeners
3. User types and presses Enter -> input.blur() called
4. saveTitle() executes -> Chat.renameSession() -> renderSessionList()
5. Entire sidebarSessions.innerHTML replaced (line 226)
6. Old input element with listeners is now detached but still has event listeners
7. Memory leak accumulates with each rename operation
```

**Recommended Fix Approach**:
1. Store listener references so they can be removed:
   ```javascript
   // Add to module scope
   let currentRenameInput = null;
   let currentRenameHandlers = { blur: null, keydown: null };

   // In handleSessionRename:
   currentRenameHandlers.blur = saveTitle;
   currentRenameHandlers.keydown = keydownHandler;
   input.addEventListener('blur', currentRenameHandlers.blur);
   input.addEventListener('keydown', currentRenameHandlers.keydown);
   currentRenameInput = input;
   ```

2. Clean up before replacing:
   ```javascript
   // At start of renderSessionList():
   if (currentRenameInput && currentRenameHandlers) {
       currentRenameInput.removeEventListener('blur', currentRenameHandlers.blur);
       currentRenameInput.removeEventListener('keydown', currentRenameHandlers.keydown);
       currentRenameInput = null;
       currentRenameHandlers = null;
   }
   ```

3. Alternative: Use event delegation on parent container instead of per-element listeners

---

### CRITICAL BUG #2: SidebarController - Duplicate AppState Subscriptions
**File**: `/js/controllers/sidebar-controller.js` (lines 92-118)

**Issue**: `_unsubscribe` is stored but `initSidebar()` can be called multiple times. While there's a check for existing subscriptions, rapid successive calls can create race conditions.

**DOM Structure Context**:
```javascript
// Lines 92-99 - the protection is not atomic
if (typeof _unsubscribe === 'function') {
    try {
        _unsubscribe();  // This may be async-adjacent
    } catch (e) { ... }
    _unsubscribe = null;
}
// Line 101 - new subscription happens immediately
_unsubscribe = AppState.subscribe(...);
```

**Event Flow Diagram**:
```
Thread A                          Thread B (or rapid double-call)
--------------------------------  --------------------------------
initSidebar() called              initSidebar() called
_unsubscribe exists
calls _unsubscribe()
_unsubscribe = null               _unsubscribe is now null (double-check passes!)
                                  Creates second subscription
Both subscriptions now active
Both fire on every state change
renderSessionList() called twice
```

**Recommended Fix Approach**:
1. Use an initialization flag:
   ```javascript
   let _isInitialized = false;

   async function initSidebar() {
       if (_isInitialized) {
           console.warn('[SidebarController] Already initialized, skipping');
           return;
       }
       _isInitialized = true;
       // ... rest of init
   }
   ```

2. For proper re-initialization support, add explicit cleanup:
   ```javascript
   SidebarController.reinit = async function() {
       this.destroy();
       _isInitialized = false;
       await initSidebar();
   };
   ```

---

### CRITICAL BUG #3: ViewController - AI Description Generation Race Condition
**File**: `/js/controllers/view-controller.js` (lines 234-271)

**Issue**: `_generationId` is used to prevent stale updates, but the increment is not atomic with the async operation. Rapid calls to `showReveal()` can still cause race conditions.

**DOM Structure Context**:
```javascript
// Lines 236-239 - non-atomic increment
if (!descriptionEl._generationId) {
    descriptionEl._generationId = 0;
}
const currentGenerationId = ++descriptionEl._generationId;  // NOT ATOMIC

// Lines 241-246 - async operation
try {
    const aiDescription = await ProfileDescriptionGenerator.generateDescription(...);

    // Lines 248-252 - check happens AFTER async completes
    if (descriptionEl._generationId !== currentGenerationId) {
        return;  // Skip if newer generation started
    }
```

**Event Flow Diagram**:
```
showReveal() called (1st)        showReveal() called (2nd) - while 1st still generating
-------------------------        ---------------------------------------------
generationId = 1
ProfileDescriptionGenerator.generateDescription() called
                                  generationId = 2 (increments during 1st's await)
                                  ProfileDescriptionGenerator.generateDescription() called

1st await completes               2nd await completes (faster provider?)
checks: 1 !== 2 -> skips         checks: 2 === 2 -> UPDATES
                                   User sees 2nd description (correct)

BUT if 2nd fails/fallback:        1st await completes late
checks: 2 !== 1 -> skips          checks: 1 !== 2 -> skips (also skips!)
                                  No description shown!
```

**Recommended Fix Approach**:
1. Use AbortController for cancellation:
   ```javascript
   let descriptionAbortController = null;

   async function generateAIDescription(personality, patterns, summary, descriptionEl) {
       // Cancel previous request
       if (descriptionAbortController) {
           descriptionAbortController.abort();
       }

       descriptionAbortController = new AbortController();
       const currentGenerationId = ++descriptionEl._generationId;

       try {
           const aiDescription = await ProfileDescriptionGenerator.generateDescription(
               personality, patterns, summary,
               { signal: descriptionAbortController.signal }
           );
           // ... rest of function
       } catch (err) {
           if (err.name === 'AbortError') {
               console.log('[ViewController] Previous description request cancelled');
               return;
           }
           // ... handle other errors
       }
   }
   ```

2. Alternative: Debounce the `showReveal()` calls:
   ```javascript
   let showRevealTimeout = null;

   function showReveal() {
       // Clear any pending reveal
       if (showRevealTimeout) {
           clearTimeout(showRevealTimeout);
       }

       showRevealTimeout = setTimeout(() => {
           // ... actual showReveal logic
       }, 100); // Debounce by 100ms
   }
   ```

---

## Remaining HIGH Bugs (Not Yet Fixed)

### 4. DemoController - Event Listener Leak on Demo Chips
**File**: `/js/controllers/demo-controller.js` (lines 467-482)

**Issue**: New event listeners attached to `.demo-chip` elements every time `setupDemoChatSuggestions()` is called.

**Impact**: Demo questions triggering multiple times, memory leak

**Recommended Fix**: Clear existing handlers before adding new ones, or use event delegation on parent container.

---

### 5. SidebarController - Global Event Handler Pollution
**File**: `/js/controllers/sidebar-controller.js` (lines 496-500)

**Issue**: `window.SidebarController` is set for inline onclick handlers. Never cleaned up on module reload.

**Impact**: Broken functionality after hot-reload, memory leaks in dev environments

**Note**: This appears to have been addressed by switching to `data-action` attributes (seen in file changes).

---

### 6. ChatUIController - Null Return Not Checked by Callers
**File**: `/js/controllers/chat-ui-controller.js` (lines 180-184)

**Issue**: `addMessage()` returns `null` when container missing, but callers like `app.js` don't check.

**Impact**: Silent failures when trying to add messages, no user feedback

**Recommended Fix**: Either throw error in `addMessage()` or add error handling in all callers.

---

## Accessibility Issues (LOW Priority)

### 12. Missing ARIA Labels
Multiple buttons throughout all controllers lack `aria-label` or `aria-pressed` states.

### 13. No Focus Trap in Modals
Modal dialogs don't implement focus trapping for keyboard navigation.

### 14. Missing Live-Region Announcements
Chat messages and loading states don't announce to screen readers.

---

## Testing Recommendations

1. **Memory Leak Testing**:
   - Open DevTools Memory profiler
   - Perform 50+ rename operations in sidebar
   - Check for detached DOM elements with event listeners

2. **Race Condition Testing**:
   - Rapidly click "Rename" then switch views
   - Call `showReveal()` multiple times with different data
   - Monitor for duplicate subscriptions firing

3. **Responsive Testing**:
   - Open sidebar on mobile
   - Resize to desktop
   - Verify overlay disappears
   - Resize back to mobile
   - Verify overlay reappears correctly

4. **Keyboard Navigation Testing**:
   - Edit a message
   - Save with keyboard (Enter)
   - Verify focus returns to input
   - Test Tab navigation through modals

---

## Appendix: File Change Summary

| File | Lines Changed | Type | Description |
|------|---------------|------|-------------|
| `observability-controller.js` | ~40 | Fix | Tab listener tracking and cleanup |
| `view-controller.js` | ~8 | Fix | Null checks for DOM elements |
| `sidebar-controller.js` | ~15 | Fix | Resize handler and cleanup |
| `chat-ui-controller.js` | ~15 | Fix | Focus management after edit |
| `sidebar-controller.js` (pending) | ~40 | TODO | Event listener tracking for rename |
| `view-controller.js` (pending) | ~30 | TODO | AbortController for AI description |
| `demo-controller.js` (pending) | ~20 | TODO | Demo chip handler cleanup |

---

**Report End**
