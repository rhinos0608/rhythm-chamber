---
status: investigating
trigger: "AI calls are being sent twice (duplicated)"
created: "2025-01-22T00:00:00Z"
updated: "2025-01-22T00:00:00Z"
---

## Current Focus

hypothesis: Event listeners are being registered multiple times, causing handleChatSend to be called twice for each user action
test: Search for multiple addEventListener calls on chat-send button and chat-input field
expecting: To find setupEventListeners() being called multiple times without safeguards
next_action: Verify the exact condition causing setupEventListeners() to run multiple times

## Symptoms

expected: One AI call per user message send
actual: Two AI calls are made for each user message send
errors: None - calls succeed but are duplicated
reproduction: Send a chat message - observe two identical API calls being made
started: Unknown when this issue was introduced

## Evidence

### Evidence 1: setupEventListeners() is called at multiple return points in init()

**Timestamp:** 2025-01-22
**Checked:** /Users/rhinesharar/rhythm-chamber/js/app.js
**Found:**
- Line 602: `setupEventListeners();` called in Spotify OAuth callback path
- Line 616: `setupEventListeners();` called in demo mode path
- Line 678: `setupEventListeners();` called in normal initialization path

**Implication:** If any code path causes init() to be called twice, or if the function returns early but then is called again via a different path, event listeners accumulate.

### Evidence 2: No safeguard in setupEventListeners() against duplicate registration

**Timestamp:** 2025-01-22
**Checked:** /Users/rhinesharar/rhythm-chamber/js/app.js lines 714-762
**Found:**
- Lines 759-762 register chat event listeners without checking if they already exist:
```javascript
document.getElementById('chat-send')?.addEventListener('click', handleChatSend);
document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleChatSend();
});
```
- No flag or check to prevent re-registration

**Implication:** Each call to setupEventListeners() adds another event listener. Two calls = two listeners = two AI calls.

### Evidence 3: Event delegation handler at line 779 is also registered each time

**Timestamp:** 2025-01-22
**Checked:** /Users/rhinesharar/rhythm-chamber/js/app.js line 779
**Found:**
- `document.addEventListener('click', ...)` is registered in setupEventListeners()
- This will also accumulate if setupEventListeners() is called multiple times

**Implication:** This could cause other actions to be duplicated as well.

### Evidence 4: No module-level guard against multiple init() calls

**Timestamp:** 2025-01-22
**Checked:** /Users/rhinesharar/rhythm-chamber/js/app.js
**Found:**
- The `init()` function has no flag to prevent multiple executions
- main.js calls `await init({ safeModeReason, securityReport });` once during bootstrap

**Implication:** If init() is ever called more than once (hot reload, testing, or unexpected navigation), event listeners accumulate.

## Root Cause

**CONFIDENCE LEVEL: HIGH (90%)**

The root cause is that `setupEventListeners()` in `/Users/rhinesharar/rhythm-chamber/js/app.js` lacks a guard against being called multiple times. Each call to `setupEventListeners()` registers a new set of event listeners on the same DOM elements without removing the previous ones.

**Flow:**
1. User clicks "Send" or presses Enter in chat input
2. Both event listeners fire (if setupEventListeners was called twice)
3. Each listener calls `handleChatSend()`
4. `handleChatSend()` calls `Chat.sendMessage()` twice
5. Two identical AI API calls are made

**Files Involved:**
- `/Users/rhinesharar/rhythm-chamber/js/app.js` - Lines 714-762, 779 (setupEventListeners function)
- `/Users/rhinesharar/rhythm-chamber/js/app.js` - Lines 602, 616, 678 (calls to setupEventListeners)

## Eliminated

- hypothesis: Double event listener binding in inline HTML attributes
  evidence: HTML has no inline onclick/onkeypress handlers on chat elements
  timestamp: 2025-01-22

- hypothesis: Chat.sendMessage being called twice from within handleChatSend
  evidence: handleChatSend() contains only one call to processMessageResponse which calls Chat.sendMessage once
  timestamp: 2025-01-22

- hypothesis: Multiple script tags loading app.js
  evidence: app.html only loads js/main.js which dynamically imports app.js once
  timestamp: 2025-01-22
