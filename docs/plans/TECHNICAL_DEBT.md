# Technical Debt Register

> **Last Updated:** 2025-01-27
> **Review Type:** Adversarial Architecture & Edge Case Analysis
> **Reviewer:** AI Agent (Comprehensive Codebase Review)

---

## Executive Summary

This document tracks identified technical debt from adversarial code reviews. Issues are categorized by severity and include actionable remediation plans.

**Summary:**
- **Critical Issues:** 5
- **High Priority:** 7
- **Medium Priority:** 8
- **Low Priority:** 7

---

## Critical Issues

### 1. Race Condition in Session Manager State Updates

**File:** `js/services/session-manager/session-state.js:125-139, 245-283`

**Issue:** The `updateSessionData()` function uses a mutex for protection, but there's a race condition between session data reads and updates. Multiple async calls can read stale data if they occur between mutex acquisition and data snapshot creation.

**Impact:** Data corruption, lost updates, inconsistent state

**Scenario:**
```javascript
// Two concurrent operations:
// Op1: Read state -> Modify -> Write
// Op2: Read state -> Modify -> Write
// Both read the same snapshot, Op2's changes overwrite Op1's
```

**Remediation:**
1. Implement read-write locks with versioning
2. Add state version tracking
3. Reject stale updates based on version numbers

**Estimated Effort:** 4 hours

**Related:** SessionManager refactoring (Phase 2)

---

### 2. Unhandled Promise Rejection in EventBus emitParallel

**File:** `js/services/event-bus/index.js:424-435`

**Issue:** `emitParallel` uses `Promise.all` but doesn't handle rejections properly. If one handler fails, the entire promise chain breaks.

**Impact:** Event subscribers can crash the event system, lost events

**Scenario:**
```javascript
// One faulty subscriber handler causes all parallel handlers to fail
Promise.all(handlers) // First rejection rejects entire promise
```

**Remediation:**
```javascript
await Promise.all(sorted.map(async (sub) => {
    try {
        await sub.handler(payload, meta);
    } catch (e) {
        console.error('[EventBus] Parallel handler error:', e);
        // Continue with other handlers
    } finally {
        if (sub.once) off(eventType === '*' ? '*' : eventType, sub.handler);
    }
}));
```

**Estimated Effort:** 2 hours

---

### 3. Service Layer Violation - God Object Pattern

**File:** `js/services/session-manager/index.js:31-179`

**Issue:** The service layer violates the Single Responsibility Principle by exposing implementation details and mixing concerns (state, lifecycle, persistence).

**Impact:** Difficult to test, tight coupling, violates SOLID principles

**Remediation:**
1. Implement proper interfaces for each service concern
2. Use dependency injection to decouple components
3. Already partially addressed by SessionManager refactoring
4. Continue pattern for other services

**Estimated Effort:** 8 hours (affects multiple services)

**Status:** Partially addressed for SessionManager, pattern needs expansion

---

### 4. Global State Pollution

**Files:** Multiple (`js/settings/index.js:357`, `js/compatibility.js:27`, `js/observability/init-observability.js:351`)

**Issue:** Excessive use of global state through window object:
- `window.Settings = Settings`
- `window.__COMPATIBILITY_PASSED__ = false`
- `window.ObservabilityInit = { ... }`

**Impact:** Tight coupling, difficult testing, race conditions in multi-tab scenarios

**Remediation:**
1. Implement proper dependency injection container
2. Use ES module exports exclusively
3. Encapsulate global state in singleton pattern with controlled access

**Estimated Effort:** 6 hours

---

### 5. Turn Queue Race Condition

**File:** `js/services/turn-queue.js:102-163`

**Issue:** The `isProcessing` flag is checked in `processNext()` but there's a window where multiple parallel calls could bypass the check.

**Impact:** Message serialization breaks, concurrent LLM requests, data corruption

**Remediation:**
```javascript
async function processNext() {
    if (queue.length === 0) return;

    // Use atomic check-and-set pattern
    if (isProcessing) return;
    isProcessing = true;

    try {
        // ... existing logic
    } finally {
        isProcessing = false;
        processNext();
    }
}
```

**Estimated Effort:** 2 hours

---

## High Priority Issues

### 6. Memory Leak in Streaming Message Handler

**File:** `js/controllers/streaming-message-handler.js:62-94`

**Issue:** The `activeTimeout` variable isn't cleared when the component unmounts or when streams are canceled.

**Impact:** Memory leaks, orphaned timeouts, performance degradation

**Remediation:**
```javascript
function cleanup() {
    if (activeTimeout) {
        clearTimeout(activeTimeout);
        activeTimeout = null;
    }
    streamBuffer.reset();
}
```

**Estimated Effort:** 2 hours

---

### 7. Array Bounds Checking Missing

**File:** `js/controllers/streaming-message-handler.js:293-307`

**Issue:** `removeMessageFromHistory()` doesn't validate array bounds before accessing.

**Impact:** Runtime exceptions, undefined behavior

**Remediation:**
```javascript
export async function removeMessageFromHistory(index) {
    let success = false;
    await updateSessionData((currentData) => {
        if (currentData.messages && index >= 0 && index < currentData.messages.length) {
            // ... process removal
        }
        return currentData;
    });
    return success;
}
```

**Estimated Effort:** 1 hour

---

### 8. Null Reference in Session Manager

**File:** `js/services/session-manager/index.js:199-209`

**Issue:** `getAllSessions()` doesn't check if `Storage.getAllSessions` is actually a function before calling it.

**Impact:** Runtime errors if storage module uninitialized

**Remediation:**
```javascript
export async function getAllSessions() {
    if (!Storage || typeof Storage.getAllSessions !== 'function') {
        console.warn('[SessionManager] Storage module not available');
        return [];
    }
    // ... rest of logic
}
```

**Estimated Effort:** 1 hour

---

### 9. Controller God Objects

**File:** `js/controllers/sidebar-controller.js:656-674` (724 lines total)

**Issue:** Controllers handle too many responsibilities. SidebarController has 20+ methods mixing UI logic, business logic, and state management.

**Impact:** Difficult to test, high coupling, potential memory leaks

**Remediation:**
1. Split into smaller, focused controllers
2. Extract business logic into services
3. Implement proper event cleanup

**Estimated Effort:** 12 hours

---

### 10. Over-Engineered Event System

**File:** `js/services/event-bus/index.js:42-59`

**Issue:** Overly complex event system with circuit breakers, vector clocks, storm detection. Unnecessary complexity for client-side application.

**Impact:** Performance overhead, difficult to reason about, maintenance burden

**Remediation:**
1. Simplify to basic pub/sub for client-side operations
2. Remove circuit breakers for non-network operations
3. Keep complex features only for actual external API calls

**Estimated Effort:** 8 hours

---

### 11. Missing Error Boundaries

**File:** `js/services/error-boundary.js`

**Issue:** Error boundary is exported but not implemented in critical paths.

**Impact:** Uncaught errors in UI components can crash the application

**Remediation:**
1. Wrap critical UI operations with error boundaries
2. Implement fallback UI for error states
3. Add error reporting

**Estimated Effort:** 4 hours

---

### 12. Tight Coupling Through Dependency Container

**File:** `js/app/index.js:41-69`

**Issue:** Manual dependency injection container creates tight coupling and hidden dependencies.

**Impact:** Difficult to mock for testing, unclear dependency graph

**Remediation:**
1. Use proper DI framework or simpler service locator
2. Use constructor injection instead of property injection
3. Implement proper interfaces for services

**Estimated Effort:** 6 hours

---

## Medium Priority Issues

### 13. Unhandled Promise Rejection in Provider Health Monitor

**File:** `js/services/provider-health-monitor.js:157-161`

**Issue:** `setInterval` callback doesn't handle errors, causing silent failures.

**Impact:** Health checks fail silently, no monitoring

**Remediation:**
```javascript
this._updateIntervalId = setInterval(() => {
    this._refreshHealthData().catch(err => {
        console.error('[ProviderHealthMonitor] Failed to refresh health data:', err);
    });
    this._notifyUI();
}, this._updateIntervalMs);
```

**Estimated Effort:** 1 hour

---

### 14. LocalStorage Quota Not Handled

**Files:** Multiple storage-related files

**Issue:** No quota checking before localStorage operations. Large data writes could fail silently.

**Impact:** Data loss, silent failures, poor UX

**Remediation:**
1. Implement quota checking before writes
2. Add fallback strategies for quota exceeded
3. Use compression for large data

**Estimated Effort:** 4 hours

---

### 15. Network Request Timeout Handling

**File:** `js/services/circuit-breaker.js:189-230`

**Issue:** Timeout is implemented but error messages aren't propagated clearly.

**Impact:** Users don't know why requests are failing

**Remediation:**
1. Add detailed error context to timeout messages
2. Include retry information
3. Show user-friendly error messages

**Estimated Effort:** 2 hours

---

### 16. Magic Numbers Throughout Codebase

**Files:** 107 files with 274 occurrences

**Issue:** Unexplained numeric constants scattered throughout code.

**Examples:**
```javascript
// js/services/provider-interface.js:29-32
const PROVIDER_TIMEOUTS = {
    cloud: 60000,    // Why 60s?
    local: 90000     // Why 90s?
};
```

**Impact:** Difficult to configure, brittle, unclear intent

**Remediation:**
1. Create centralized configuration constants file
2. Document why each value was chosen
3. Implement environment-specific configurations

**Estimated Effort:** 4 hours

---

### 17. Inconsistent Abstraction Levels

**Files:** Multiple service and model files

**Issue:** Inconsistent separation between high-level business logic and low-level implementation details.

**Impact:** Violates Information Hiding, difficult to maintain

**Remediation:**
1. Implement clear layered architecture
2. Define boundaries between layers
3. Use interfaces to define contracts

**Estimated Effort:** 8 hours

---

### 18. Memory Leak Patterns in Sidebar Controller

**File:** `js/controllers/sidebar-controller.js:28-33`

**Issue:** Complex event listener management without proper cleanup (renameInProgress, rename handlers).

**Impact:** Memory leaks, difficult lifecycle management

**Remediation:**
1. Use event delegation instead of individual listeners
2. Implement proper lifecycle methods
3. Use WeakMap for tracking related state

**Estimated Effort:** 3 hours

---

### 19. Array Growth Without Bounds

**File:** `js/services/session-manager/session-state.js:223-234`

**Issue:** Messages array could theoretically grow without bounds despite sliding window.

**Impact:** Memory exhaustion, performance degradation

**Remediation:**
1. Implement hard limits on array size
2. Add cleanup policies for old data
3. Monitor memory usage

**Estimated Effort:** 2 hours

---

### 20. Inconsistent Error Handling

**Files:** Multiple service files

**Issue:** Some modules throw errors, others return boolean. Inconsistent error propagation.

**Impact:** Difficult to implement proper error handling in consuming code

**Remediation:**
1. Implement consistent error handling strategy
2. Use either exceptions or result objects, not both
3. Provide clear error contracts

**Estimated Effort:** 6 hours

---

## Low Priority Issues

### 21-27. Minor Issues

| # | Issue | File | Impact | Effort |
|---|-------|------|--------|--------|
| 21 | Missing Null Checks in EventBus | `event-bus/index.js:322-358` | Edge case crashes | 1 hr |
| 22 | Uninitialized State in AppState | `state/app-state.js:346-349` | Warning vs proper init | 1 hr |
| 23 | Memory Leaks in Event Subscriptions | Multiple event bus users | Gradual memory growth | 2 hrs |
| 24 | Timing-Dependent Code | `services/wave-telemetry.js:165-176` | UUID collision potential | 1 hr |
| 25 | Over-Use of ES Module Exports | `session-manager/index.js:20-22` | Violates encapsulation | 2 hrs |
| 26 | No CSP Headers | Deployment config | XSS vulnerability | 1 hr |
| 27 | Missing Content-Type Validation | Multiple API callers | MIME confusion attacks | 2 hrs |

---

## Remediation Priority

### Sprint 1 (Critical - Do Immediately)
1. Fix SessionManager race condition (#1)
2. Fix EventBus promise rejection (#2)
3. Fix TurnQueue race condition (#5)

### Sprint 2 (High - Within 2 Weeks)
4. Memory leak fixes (#6, #18)
5. Array bounds checking (#7)
6. Null reference safety (#8)
7. Error boundaries (#11)

### Sprint 3 (Medium - Within Month)
8. Refactor God objects (#3, #9)
9. Simplify Event System (#10)
10. DI container improvement (#12)
11. Storage quota handling (#14)

### Sprint 4 (Low - Technical Debt Paydown)
12. Magic numbers consolidation (#16)
13. Consistent error handling (#20)
14. Minor issues (#21-27)

---

## Metrics

**Total Estimated Effort:** ~95 hours
**Critical Issues:** 5
**High Priority:** 7
**Medium Priority:** 8
**Low Priority:** 7

**Debt Ratio:** Medium (codebase is functional but has accumulated some debt from rapid feature development)

---

## Notes

- This is a living document - update as issues are resolved or new debt is identified
- Schedule regular debt reviews (quarterly recommended)
- Consider allocating 20% of sprint capacity to debt reduction
- Some items (#3, #9) are architectural and may require significant refactoring
