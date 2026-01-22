---
status: diagnosed
trigger: "Investigate frontend event handling issues that could cause duplicate AI calls or state problems"
created: 2025-01-22T12:00:00Z
updated: 2025-01-22T12:45:00Z
---

## Current Focus
hypothesis: ROOT CAUSE CONFIRMED - Multiple event handlers registered without idempotency guard, suggestion chips bypass queue, missing disabled state
test: Complete analysis of chat submission flow
expecting: Duplicate handlers found - TurnQueue does serialize but multiple handleChatSend calls create multiple queued turns
next_action: "Document final findings and recommendations"

## Symptoms
expected: Single AI call per user submission
actual: Potential duplicate AI calls or state problems
errors: Unknown - investigation phase
reproduction: Unknown - investigation phase
started: Unknown - investigation phase

## Eliminated

## Evidence
- timestamp: 2025-01-22T12:15:00Z
  checked: js/app.js lines 759-773 (chat send event handlers)
  found: |
    **CRITICAL BUG #1: Missing preventDefault() on Enter key handler**
    Line 760-762:
    ```javascript
    document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleChatSend();
    });
    ```
    Issue: No preventDefault() call - this allows BOTH the keypress handler AND any form submission to fire
    impact: If chat-input is inside a form, pressing Enter triggers form submit AND the custom handler
    MITIGATION: HTML check shows input is NOT in a form, so form submission double-fire is not an issue

- timestamp: 2025-01-22T12:18:00Z
  checked: js/app.js lines 765-773 (suggestion chips)
  found: |
    **CRITICAL BUG #2: Suggestion chip handlers fire immediately without debouncing**
    Lines 765-773:
    ```javascript
    document.querySelectorAll('.suggestion-chip:not(.demo-chip)').forEach(chip => {
        chip.addEventListener('click', () => {
            const input = document.getElementById('chat-input');
            if (input) {
                input.value = chip.dataset.question;
                handleChatSend();
            }
        });
    });
    ```
    Issue: These chips are set up during setupEventListeners() which could be called multiple times
    impact: If setupEventListeners() is called twice, chips get double event listeners

- timestamp: 2025-01-22T12:22:00Z
  checked: js/controllers/demo-controller.js lines 476-491 (demo suggestion chips)
  found: |
    **CRITICAL BUG #3: Demo suggestion chips programmatically click the send button**
    Lines 486-489:
    ```javascript
    const sendBtn = document.getElementById('chat-send');
    if (sendBtn) {
        sendBtn.click();  // This triggers the click event listener
    }
    ```
    Combined with the keypress handler missing preventDefault(), this creates a race condition:
    - User clicks a demo chip
    - Chip handler sets input.value and calls sendBtn.click()
    - sendBtn.click() triggers handleChatSend()
    - If focus was in the input field, pressing Enter would ALSO trigger due to missing preventDefault()

- timestamp: 2025-01-22T12:25:00Z
  checked: js/app.js setupEventListeners() function
  found: |
    **CRITICAL BUG #4: No guard against multiple setupEventListeners() calls**
    setupEventListeners() (lines 717-947) has no idempotency check
    If called multiple times (e.g., during initialization, demo mode, etc.), ALL event listeners are registered again
    Lines 759-762 are especially problematic because they use ?.optional chaining which means they silently add listeners again
    impact: Each call to setupEventListeners() doubles the event handlers, causing N submissions where N = number of times setupEventListeners() was called

- timestamp: 2025-01-22T12:28:00Z
  checked: js/app.js initialization flow
  found: |
    setupEventListeners() is called from:
    1. init() line 678 (normal data load path)
    2. init() line 602 (Spotify Quick Snapshot mode)
    3. init() line 616 (Demo mode)
    In demo mode path: The app.js line 616 calls setupEventListeners() then setupSpotifyButton() then SidebarController.init()
    Then DemoController.loadDemoMode() is called which calls setupDemoChatSuggestions() - line 335
    The demo chips have their own handlers (line 476-491) that programmatically click the send button

- timestamp: 2025-01-22T12:32:00Z
  checked: js/services/turn-queue.js and js/services/message-lifecycle-coordinator.js
  found: |
    **MITIGATION ANALYSIS: TurnQueue does serialize, but doesn't prevent multiple queue entries**
    - TurnQueue (line 103-105) checks `if (isProcessing || queue.length === 0) return` to avoid starting duplicate processing
    - However, if handleChatSend() is called 3 times due to duplicate event listeners, TurnQueue.push() gets called 3 times
    - Each call creates a new QueuedTurn and adds it to the queue (line 89)
    - The result is 3 separate AI calls, processed sequentially by the queue
    - The queue prevents interleaving but does NOT prevent duplicate submissions

- timestamp: 2025-01-22T12:35:00Z
  checked: js/app.js handleChatSend() for sending guard
  found: |
    **CRITICAL BUG #5: No sending/sending guard in handleChatSend()**
    handleChatSend() (lines 1014-1034) has NO guard flag to prevent simultaneous calls
    - No check like `if (isSending) return;`
    - No setting of a flag during processing
    - The TurnQueue handles serialization at the LLM call level, but handleChatSend() itself can be called multiple times
    - Each call to handleChatSend() adds a user message to UI immediately (line 1026)
    - Result: Multiple user messages appear in UI, then multiple AI responses are queued

- timestamp: 2025-01-22T12:38:00Z
  checked: Send button disabled state
  found: |
    **CRITICAL BUG #6: Send button is never disabled during processing**
    - The chat-send button (app.html line 232) is never set to disabled=true during message processing
    - There's no visual feedback that a message is being sent
    - Users can rapidly click the send button multiple times
    - Combined with duplicate event listeners, this creates exponential submissions

## Resolution

root_cause: |
    **MULTIPLE ROOT CAUSES FOR DUPLICATE AI CALLS**

    1. **Non-idempotent event listener registration (CRITICAL)**
       - setupEventListeners() has no guard against being called multiple times
       - Each call doubles all event handlers, including chat send handlers
       - Location: /Users/rhinesharar/rhythm-chamber/js/app.js:717-947

    2. **No submission guard in handleChatSend() (CRITICAL)**
       - handleChatSend() lacks an isSending flag to prevent simultaneous submissions
       - Multiple rapid clicks or Enter presses each create a separate queued turn
       - Location: /Users/rhinesharar/rhythm-chamber/js/app.js:1014-1034

    3. **Send button never disabled (HIGH)**
       - No visual or programmatic feedback during message processing
       - Users can spam the send button
       - Location: /Users/rhinesharar/rhythm-chamber/js/app.js:1014-1034 (handleChatSend)

    4. **Demo suggestion chips programmatically click send button (MEDIUM)**
       - Demo chips call sendBtn.click() which triggers click handlers
       - If there are duplicate handlers, this triggers multiple submissions
       - Location: /Users/rhinesharar/rhythm-chamber/js/controllers/demo-controller.js:486-489

    5. **Missing preventDefault() on Enter key (LOW-MEDIUM)**
       - No preventDefault() on keypress handler
       - Currently mitigated because input is not in a form, but fragile
       - Location: /Users/rhinesharar/rhythm-chamber/js/app.js:760-762

fix: |
    **RECOMMENDED FIXES (in priority order)**

    1. **Add idempotency guard to setupEventListeners()**
       ```javascript
       let eventListenersSetup = false;
       function setupEventListeners() {
           if (eventListenersSetup) {
               console.warn('[App] Event listeners already setup, skipping');
               return;
           }
           eventListenersSetup = true;
           // ... rest of function
       }
       ```

    2. **Add submission guard to handleChatSend()**
       ```javascript
       let isSending = false;
       async function handleChatSend() {
           if (isSending) {
               console.warn('[App] Message already sending, ignoring duplicate request');
               return;
           }
           const input = document.getElementById('chat-input');
           const message = input.value.trim();
           if (!message) {
               showToast('Please enter a message to send', 2000);
               return;
           }

           isSending = true;
           input.value = '';

           // Disable send button and input during send
           const sendBtn = document.getElementById('chat-send');
           if (sendBtn) sendBtn.disabled = true;
           if (input) input.disabled = true;

           try {
               ChatUIController.addMessage(message, 'user');
               const suggestions = document.getElementById('chat-suggestions');
               if (suggestions) suggestions.style.display = 'none';
               await processMessageResponse((options) => Chat.sendMessage(message, options));
           } finally {
               isSending = false;
               if (sendBtn) sendBtn.disabled = false;
               if (input) input.disabled = false;
               input.focus();
           }
       }
       ```

    3. **Add preventDefault() to Enter key handler**
       ```javascript
       document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
           if (e.key === 'Enter') {
               e.preventDefault();
               handleChatSend();
           }
       });
       ```

    4. **Fix demo suggestion chips to call handleChatSend directly**
       ```javascript
       // In demo-controller.js line 486-489, replace:
       // sendBtn.click();
       // With:
       if (window.handleChatSend && typeof window.handleChatSend === 'function') {
           window.handleChatSend();
       }
       ```
       Also export handleChatSend in app.js:
       ```javascript
       window.handleChatSend = handleChatSend;
       ```

    5. **Add debounce to suggestion chips**
       ```javascript
       // Use event delegation with a flag instead of per-chip listeners
       let chipProcessing = false;
       document.addEventListener('click', (e) => {
           const chip = e.target.closest('.suggestion-chip');
           if (!chip || chipProcessing) return;
           chipProcessing = true;
           const question = chip.dataset.question;
           const input = document.getElementById('chat-input');
           if (input && question) {
               input.value = question;
               handleChatSend();
           }
           setTimeout(() => { chipProcessing = false; }, 500);
       });
       ```

verification: Not yet implemented - findings only

files_changed:
  - js/app.js: lines 717-947 (setupEventListeners), 760-762 (Enter key), 1014-1034 (handleChatSend)
  - js/controllers/demo-controller.js: lines 476-491 (demo suggestion chips)
  - app.html: line 232 (send button - may need visual loading state)
