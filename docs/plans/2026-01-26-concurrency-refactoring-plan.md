# Concurrency and Retry Standardization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix mutex bug, refactor session-manager to use standardized mutex, and consolidate retry logic across the codebase.

**Architecture:**
1. Fix `Mutex.isLocked()` using a counter-based approach to track lock state
2. Replace custom lock implementations in `session-manager.js` with the standard `Mutex` class
3. Make `resilient-retry.js` the single source of truth, refactor other retry utilities to use it

**Tech Stack:** JavaScript ES6+, Promise patterns, Mutex with Promise-chaining pattern

---

## Task 1: Fix Mutex.isLocked() Bug

**Files:**
- Modify: `js/utils/concurrency/mutex.js:32-89`
- Test: `tests/unit/mutex-tests.test.js` (create if not exists)

**Context:**
The current `isLocked()` implementation compares `this._lock !== Promise.resolve()`, which always returns `true` because each call to `Promise.resolve()` creates a new promise reference. This makes `isLocked()` permanently return `true`.

**Step 1: Write the failing test**

Create test file `tests/unit/mutex-tests.test.js`:

```javascript
import { Mutex } from '../../js/utils/concurrency/mutex.js';

export async function testMutexIsLocked() {
    const mutex = new Mutex();

    // Initially unlocked
    if (mutex.isLocked() !== false) {
        throw new Error('Mutex should be initially unlocked');
    }

    // While locked, isLocked should return true
    let lockedCheck = false;
    const lockPromise = mutex.runExclusive(async () => {
        lockedCheck = mutex.isLocked();
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    if (lockedCheck !== true) {
        throw new Error('Mutex should be locked during runExclusive');
    }

    await lockPromise;

    // After completion, should be unlocked
    if (mutex.isLocked() !== false) {
        throw new Error('Mutex should be unlocked after completion');
    }

    return { pass: true };
}

export async function testMutexSequentialExecution() {
    const mutex = new Mutex();
    const order = [];

    const p1 = mutex.runExclusive(async () => {
        order.push('start1');
        await new Promise(resolve => setTimeout(resolve, 50));
        order.push('end1');
    });

    const p2 = mutex.runExclusive(async () => {
        order.push('start2');
        await new Promise(resolve => setTimeout(resolve, 50));
        order.push('end2');
    });

    await Promise.all([p1, p2]);

    const expectedOrder = ['start1', 'end1', 'start2', 'end2'];
    if (JSON.stringify(order) !== JSON.stringify(expectedOrder)) {
        throw new Error(`Expected ${expectedOrder}, got ${order}`);
    }

    return { pass: true };
}
```

**Step 2: Run test to verify it fails**

Run: `node --experimental-modules tests/unit/mutex-tests.test.js`
Expected: FAIL - isLocked() returns incorrect values

**Step 3: Implement the fix using a counter**

Modify `js/utils/concurrency/mutex.js`:

```javascript
export class Mutex {
    /**
     * Create a new Mutex
     * The lock starts in released state (no operations pending)
     */
    constructor() {
        // The lock promise represents the "current" operation
        // New operations chain off this promise, creating sequential execution
        this._lock = Promise.resolve();
        // Counter to track lock state for isLocked()
        this._lockCount = 0;
    }

    /**
     * Execute a function exclusively within the mutex
     * Waits for any ongoing operations to complete before starting
     *
     * @param {Function} fn - Async function to execute exclusively
     * @returns {Promise<any>} Result of the function
     *
     * Example:
     *   const result = await mutex.runExclusive(async () => {
     *       return await someAsyncOperation();
     *   });
     */
    async runExclusive(fn) {
        // Capture the current lock (the operation we're waiting for)
        const previousLock = this._lock;

        // Create a new promise for the next operation to wait for
        let releaseLock;
        this._lock = new Promise(resolve => {
            releaseLock = resolve;
        });

        // Increment lock count
        this._lockCount++;

        // Wait for previous operations to complete
        await previousLock;

        try {
            // Execute the critical section
            return await fn();
        } finally {
            // Decrement lock count and release the lock
            this._lockCount--;
            releaseLock();
        }
    }

    /**
     * Check if the mutex is currently locked
     * Note: This is a snapshot and may change immediately after returning
     *
     * @returns {boolean} True if locked (operation in progress)
     */
    isLocked() {
        // The lock is busy if there are pending operations
        // Lock count > 0 means an operation is in progress or queued
        return this._lockCount > 0;
    }
}
```

**Step 4: Run test to verify it passes**

Run: `node --experimental-modules tests/unit/mutex-tests.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add js/utils/concurrency/mutex.js tests/unit/mutex-tests.test.js
git commit -m "fix(mutex): fix isLocked() with counter-based tracking

- Add _lockCount to track pending operations
- isLocked() returns true when _lockCount > 0
- Fixes bug where Promise.resolve() comparison always returned true

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Refactor session-manager.js to use Mutex

**Files:**
- Modify: `js/services/session-manager.js:1-1264`
- Test: `tests/unit/session-manager-tests.test.js` (update if exists)

**Context:**
The session manager has custom lock implementations:
1. `_sessionDataLock` (line 45) - Promise-chain for session data updates
2. `_processingLock` (line 49) - Promise-chain for processing locks

Both can be replaced with the standard `Mutex` class for consistency and maintainability.

**Step 1: Add Mutex import and replace custom locks**

Modify `js/services/session-manager.js`:

At the top, add import:
```javascript
import { EventBus } from './event-bus.js';
import { Storage } from '../storage.js';
import { DataVersion } from './data-version.js';
import { safeJsonParse } from '../utils/safe-json.js';
import { STORAGE_KEYS } from '../storage/keys.js';
import { AppState } from '../state/app-state.js';
import { Mutex } from '../utils/concurrency/mutex.js';
```

Replace lock declarations (around lines 43-49):
```javascript
// In-memory session data with mutex protection
let _sessionData = { id: null, messages: [] };
const _sessionDataMutex = new Mutex();

// Session lock for preventing session switches during message processing
let _processingSessionId = null;  // Session ID currently being processed
const _processingMutex = new Mutex();
```

**Step 2: Replace updateSessionData to use Mutex**

Replace the `updateSessionData` function (lines 301-328):

```javascript
/**
 * Update session data atomically with mutex protection.
 * This prevents lost update races when multiple async operations
 * try to modify session data concurrently within the same tab.
 * HNW: Uses deep cloning to prevent external mutations
 *
 * @param {Function} updaterFn - Function that receives current data and returns new data
 * @returns {Promise<void>}
 */
async function updateSessionData(updaterFn) {
    return _sessionDataMutex.runExclusive(async () => {
        const currentData = getSessionData();
        const newData = updaterFn(currentData);
        _sessionData = {
            id: newData.id || null,
            messages: deepCloneMessages(newData.messages)
        };

        // Sync to window for legacy compatibility (read-only)
        if (typeof window !== 'undefined') {
            window._sessionData = getSessionData();
        }
    });
}
```

**Step 3: Replace acquireProcessingLock to use Mutex**

Replace the lock acquisition functions (lines 60-214):

```javascript
/**
 * Acquire session processing lock to prevent session switches during message processing
 * This prevents race conditions where a session switch happens mid-message processing
 *
 * Uses Mutex for standardized lock management with timeout support
 *
 * @param {string} expectedSessionId - The session ID expected to be active
 * @returns {Promise<{ locked: boolean, currentSessionId: string|null, release?: Function, error?: string }>} Lock result
 */
async function acquireProcessingLock(expectedSessionId) {
    const startTime = Date.now();
    let attemptCount = 0;

    while (attemptCount < MAX_RETRY_ATTEMPTS) {
        attemptCount++;

        // Check timeout
        if (Date.now() - startTime > LOCK_ACQUISITION_TIMEOUT_MS) {
            console.warn('[SessionManager] Lock acquisition timeout after', LOCK_ACQUISITION_TIMEOUT_MS, 'ms');
            return {
                locked: false,
                currentSessionId: currentSessionId,
                error: 'Lock acquisition timeout'
            };
        }

        // CIRCULAR WAIT DETECTION: Check if we're waiting for ourselves
        if (_processingSessionId === expectedSessionId) {
            console.warn('[SessionManager] Circular wait detected - same session already holds lock');
            return {
                locked: false,
                currentSessionId: currentSessionId,
                error: 'Circular wait detected'
            };
        }

        // Try to acquire lock using mutex with timeout
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Lock wait timeout')), LOCK_ACQUISITION_TIMEOUT_MS);
            });

            // Try to acquire the lock
            const lockPromise = _processingMutex.runExclusive(async () => {
                // Re-validate session ID after acquiring lock
                if (expectedSessionId && currentSessionId !== expectedSessionId) {
                    throw new Error('Session switched while waiting for lock');
                }

                if (_processingSessionId !== null && _processingSessionId !== expectedSessionId) {
                    throw new Error('Session switched during lock acquisition');
                }

                // Acquire the lock
                _processingSessionId = expectedSessionId || currentSessionId;

                // Return a release function
                return () => {
                    _processingSessionId = null;
                };
            });

            const release = await Promise.race([lockPromise, timeoutPromise]);

            return {
                locked: true,
                currentSessionId: currentSessionId,
                release: release
            };

        } catch (error) {
            console.warn('[SessionManager] Lock acquisition attempt', attemptCount, 'failed:', error.message);

            // If session mismatch, don't retry
            if (error.message.includes('Session switched')) {
                return {
                    locked: false,
                    currentSessionId: currentSessionId,
                    error: error.message
                };
            }

            // Exponential backoff before retry
            if (attemptCount < MAX_RETRY_ATTEMPTS) {
                const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attemptCount - 1);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    // All retries exhausted
    console.warn('[SessionManager] Lock acquisition failed after', MAX_RETRY_ATTEMPTS, 'attempts');
    return {
        locked: false,
        currentSessionId: currentSessionId,
        error: 'Max retry attempts exceeded'
    };
}
```

**Step 4: Remove unused constants**

Remove the unused lock queue constants (lines 51-58):
```javascript
// Remove these lines - no longer needed with Mutex:
// const LOCK_ACQUISITION_TIMEOUT_MS = 5000;
// const MAX_RETRY_ATTEMPTS = 3;
// const BASE_RETRY_DELAY_MS = 100;
// let _lockQueue = [];
// let _isProcessingQueue = false;
```

Keep these constants as they're still used:
```javascript
const LOCK_ACQUISITION_TIMEOUT_MS = 5000;
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 100;
```

**Step 5: Run existing session manager tests**

Run: `npm test -- tests/unit/session-manager-tests.test.js` (if exists)
Expected: PASS - all tests should pass with the new Mutex implementation

**Step 6: Commit**

```bash
git add js/services/session-manager.js
git commit -m "refactor(session-manager): use standard Mutex class

- Replace _sessionDataLock promise-chain with Mutex
- Replace _processingLock promise-chain with Mutex
- Simplify lock acquisition logic using standardized mutex
- Maintains all existing functionality with cleaner implementation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Standardize Retry Logic on resilient-retry.js

**Files:**
- Modify: `js/utils.js:60-115` (fetchWithRetry function)
- Modify: `js/functions/utils/retry.js:1-85`
- Test: `tests/unit/retry-tests.test.js` (update if exists)

**Context:**
Three separate retry implementations exist:
1. `js/utils/resilient-retry.js` - Full-featured retry with backoff, jitter, circuit breaker
2. `js/utils.js` fetchWithRetry - Simple retry for fetch operations
3. `js/functions/utils/retry.js` - Basic retry for function execution

We'll make `resilient-retry.js` the core and refactor the others to use it.

**Step 1: Update utils.js to use resilient-retry**

Modify `js/utils.js`:

Add import at top:
```javascript
import { withRetry, RETRY_CONFIG, classifyError, calculateBackoffForError, delay } from './utils/resilient-retry.js';
```

Replace fetchWithRetry function (lines 61-115):
```javascript
/**
 * Fetch with exponential backoff retry
 * Now uses resilient-retry.js for consistent retry logic
 * @param {string} url - URL to fetch
 * @param {object} config - Combined configuration
 * @param {RequestInit} config.options - Fetch options
 * @param {number} config.maxRetries - Maximum retry attempts
 * @param {number} config.baseDelayMs - Base delay for exponential backoff
 * @param {number} config.maxDelayMs - Maximum delay between retries
 * @param {number} config.timeoutMs - Timeout for each fetch attempt
 * @param {number[]} config.retryOnStatus - HTTP status codes that trigger retry
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, config = {}) {
    const {
        options = {},
        maxRetries = 3,
        baseDelayMs = 1000,
        maxDelayMs = 10000,
        timeoutMs = 30000,
        retryOnStatus = [429, 500, 502, 503, 504]
    } = config;

    const { result } = await withRetry(
        async () => {
            const response = await fetchWithTimeout(url, options, timeoutMs);

            // Check if we should retry based on status
            if (retryOnStatus.includes(response.status)) {
                const error = new Error(`HTTP ${response.status}`);
                error.status = response.status;
                error.response = response;
                throw error;
            }

            return response;
        },
        {
            maxRetries,
            config: {
                BASE_DELAY_MS: baseDelayMs,
                MAX_DELAY_MS: maxDelayMs,
                JITTER_MS: 200,
                EXPONENTIAL_BASE: 2
            },
            shouldRetry: (error) => {
                // Retry on network errors or specific status codes
                if (error.name === 'AbortError' && error.message.includes('timed out')) {
                    return true;
                }
                if (error.name === 'TypeError' && error.message.includes('fetch')) {
                    return true;
                }
                if (error.status && retryOnStatus.includes(error.status)) {
                    return true;
                }
                return false;
            },
            onRetry: (error, attempt, delayMs) => {
                console.warn(`[Utils] Retrying after ${delayMs}ms (attempt ${attempt}): ${error.message}`);
            }
        }
    );

    return result;
}
```

**Step 2: Update functions/utils/retry.js to use resilient-retry**

Modify `js/functions/utils/retry.js`:

Replace the entire file content:
```javascript
/**
 * Retry Utilities for Function Execution
 *
 * HNW Considerations:
 * - Wave: Exponential backoff prevents thundering herd
 * - Network: Transient error detection enables graceful degradation
 * - Hierarchy: Retry logic isolated from business logic
 *
 * This module now delegates to resilient-retry.js for consistent retry logic
 */

import { withRetry, RETRY_CONFIG, classifyError } from '../../utils/resilient-retry.js';

// Legacy constants for backward compatibility
const MAX_FUNCTION_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

/**
 * Check if error is transient (worth retrying)
 * @deprecated Use classifyError from resilient-retry.js instead
 * @param {Error} err - The error to check
 * @returns {boolean} Whether the error is transient
 */
function isTransientError(err) {
    if (!err) return false;

    // AbortError is NOT retryable - it indicates intentional cancellation (timeout)
    if (err.name === 'AbortError') {
        return false;
    }

    // Delegate to resilient-retry's classifyError
    const errorType = classifyError(err);
    return ['transient', 'rate_limit', 'server_error'].includes(errorType);
}

/**
 * Execute a function with retry logic
 * Now uses resilient-retry.js for consistent retry behavior
 * @param {Function} fn - Async function to execute
 * @param {string} functionName - Name for logging
 * @returns {Promise<any>} Result of the function
 */
async function withRetry(fn, functionName = 'function') {
    const { result, context } = await withRetry(
        fn,
        {
            maxRetries: MAX_FUNCTION_RETRIES,
            config: {
                BASE_DELAY_MS: RETRY_BASE_DELAY_MS,
                MAX_DELAY_MS: RETRY_CONFIG.MAX_DELAY_MS,
                JITTER_MS: 100,
                EXPONENTIAL_BASE: 2
            },
            shouldRetry: (error) => isTransientError(error),
            onRetry: (error, attempt, delayMs) => {
                console.warn(`[Functions] Attempt ${attempt}/${MAX_FUNCTION_RETRIES + 1} for ${functionName} failed:`, error.message);
            }
        }
    );

    return result;
}

// ES Module export
export const FunctionRetry = {
    MAX_RETRIES: MAX_FUNCTION_RETRIES,
    isTransientError,
    withRetry
};

console.log('[FunctionRetry] Module loaded (delegating to resilient-retry)');
```

Wait - there's a naming conflict. Let me fix that:

```javascript
/**
 * Retry Utilities for Function Execution
 *
 * HNW Considerations:
 * - Wave: Exponential backoff prevents thundering herd
 * - Network: Transient error detection enables graceful degradation
 * - Hierarchy: Retry logic isolated from business logic
 *
 * This module now delegates to resilient-retry.js for consistent retry logic
 */

import { withRetry as resilientRetry, RETRY_CONFIG, classifyError } from '../../utils/resilient-retry.js';

// Legacy constants for backward compatibility
const MAX_FUNCTION_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

/**
 * Check if error is transient (worth retrying)
 * @deprecated Use classifyError from resilient-retry.js instead
 * @param {Error} err - The error to check
 * @returns {boolean} Whether the error is transient
 */
function isTransientError(err) {
    if (!err) return false;

    // AbortError is NOT retryable - it indicates intentional cancellation (timeout)
    if (err.name === 'AbortError') {
        return false;
    }

    // Delegate to resilient-retry's classifyError
    const errorType = classifyError(err);
    return ['transient', 'rate_limit', 'server_error'].includes(errorType);
}

/**
 * Execute a function with retry logic
 * Now uses resilient-retry.js for consistent retry behavior
 * @param {Function} fn - Async function to execute
 * @param {string} functionName - Name for logging
 * @returns {Promise<any>} Result of the function
 */
async function withRetry(fn, functionName = 'function') {
    const { result } = await resilientRetry(
        fn,
        {
            maxRetries: MAX_FUNCTION_RETRIES,
            config: {
                BASE_DELAY_MS: RETRY_BASE_DELAY_MS,
                MAX_DELAY_MS: RETRY_CONFIG.MAX_DELAY_MS,
                JITTER_MS: 100,
                EXPONENTIAL_BASE: 2
            },
            shouldRetry: (error) => isTransientError(error),
            onRetry: (error, attempt, delayMs) => {
                console.warn(`[Functions] Attempt ${attempt}/${MAX_FUNCTION_RETRIES + 1} for ${functionName} failed:`, error.message);
            }
        }
    );

    return result;
}

// ES Module export
export const FunctionRetry = {
    MAX_RETRIES: MAX_FUNCTION_RETRIES,
    isTransientError,
    withRetry
};

console.log('[FunctionRetry] Module loaded (delegating to resilient-retry)');
```

**Step 3: Run retry tests**

Run: `npm test -- tests/unit/retry-tests.test.js` (if exists)
Expected: PASS - all retry tests should pass

**Step 4: Test manually in browser**

Open browser console and test:
```javascript
// Test fetchWithRetry still works
import { Utils } from './js/utils.js';
const response = await Utils.fetchWithRetry('https://httpstat.us/500');
console.log('Retry test passed');

// Test FunctionRetry still works
import { FunctionRetry } from './js/functions/utils/retry.js';
let attempts = 0;
const result = await FunctionRetry.withRetry(async () => {
    attempts++;
    if (attempts < 2) throw new Error('timeout');
    return 'success';
});
console.log('FunctionRetry test passed:', result);
```

**Step 5: Commit**

```bash
git add js/utils.js js/functions/utils/retry.js
git commit -m "refactor(retry): standardize on resilient-retry.js

- Update fetchWithRetry to use resilient-retry.js
- Update functions/utils/retry.js to delegate to resilient-retry.js
- Maintain backward compatibility with existing APIs
- Eliminate duplicate retry logic across codebase

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Integration Testing

**Files:**
- Test: All existing tests
- Manual: Browser testing

**Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass

**Step 2: Manual smoke test**

1. Open application in browser
2. Send a message and verify it saves correctly
3. Switch between sessions
4. Verify no race conditions occur
5. Check console for any errors

**Step 3: Verify retry behavior**

1. Test with poor network connection
2. Verify retries happen correctly
3. Check console logs for retry messages

**Step 4: Final commit**

```bash
git commit --allow-empty -m "test(concurrency): verify all refactoring passes integration tests

- Mutex.isLocked() now works correctly
- SessionManager uses standard Mutex
- All retry logic uses resilient-retry.js
- All tests passing

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Summary

This plan:
1. **Fixes** the `isLocked()` bug using counter-based tracking
2. **Refactors** session-manager to use the standard Mutex class
3. **Standardizes** retry logic on resilient-retry.js

**Benefits:**
- Eliminates bug where `isLocked()` always returns `true`
- Reduces code duplication
- Improves maintainability with single source of truth
- Consistent retry behavior across entire codebase
- Better error handling with unified error classification
