# Testing Guide

This guide covers running and writing tests for Rhythm Chamber, including lessons learned from Phase 1-3 test infrastructure fixes and refactoring.

## Table of Contents

- [Test Overview](#test-overview)
- [Test Structure](#test-structure)
- [Test Frameworks](#test-frameworks)
- [Running Tests](#running-tests)
- [Test Methodologies](#test-methodologies)
- [Writing Unit Tests](#writing-unit-tests)
- [Integration Testing](#integration-testing)
- [Security Testing](#security-testing)
- [Writing E2E Tests](#writing-e2e-tests)
- [Test Data](#test-data)
- [Common Patterns](#common-patterns)
- [Mock Requirements](#mock-requirements)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Test Overview

Rhythm Chamber uses a multi-tier testing strategy:

| Test Type | Framework | Location | Purpose |
|-----------|-----------|----------|---------|
| **Unit Tests** | Vitest | `tests/unit/` | Test individual modules, schemas, utilities |
| **Characterization Tests** | Vitest | `tests/unit/*characterization*.test.js` | Capture existing behavior before refactoring |
| **Integration Tests** | Vitest | `tests/integration/` | Test cross-module functionality |
| **E2E Tests** | Playwright | `tests/e2e/` | Test complete user flows |

### Current Test Status

- **Total Unit Tests**: 2,560+ tests
- **Pass Rate**: 96.8%+ (target: >98%)
- **Test Files**: 122 unit test files
- **E2E Tests**: 18 test scenarios

### Test Coverage Goals

- **Unit tests**: >98% pass rate target (currently 96.8%)
- **E2E tests**: 100% pass target
- **Characterization tests**: >90% coverage before refactoring

## Test Structure

```
tests/
├── unit/                    # Unit tests (122 files)
│   ├── observability/       # Performance monitoring tests
│   ├── providers/interface/ # Provider interface tests
│   ├── fallback/            # Fallback chain tests
│   ├── storage/             # Storage layer tests
│   ├── services/            # Service layer tests
│   ├── critical-*.test.js   # Security and bug fix tests
│   ├── *characterization*.test.js  # Characterization tests before refactoring
│   └── [module].test.js     # Module-specific tests
├── integration/             # Integration tests (1 file)
├── e2e/                     # End-to-end tests (2 files)
├── fixtures/                # Test data files
│   └── sample-streaming-history.json  # Large streaming history for E2E
└── setup.js                 # Global test setup with mocks
```

## Test Frameworks

- **Vitest**: Unit and integration tests with happy-dom environment
- **Playwright**: End-to-end testing with visual debugging
- **Happy-DOM**: Browser-like environment for unit tests

## Test Methodologies

### 1. Test-Driven Development (TDD)

Used for new features and bug fixes:

```javascript
// RED: Write failing test first
describe('new feature', () => {
    it('should do something', () => {
        const result = newFunction();
        expect(result).toBe('expected');
    });
});

// GREEN: Implement minimal code to pass
function newFunction() {
    return 'expected';
}

// REFACTOR: Clean up while tests stay green
```

**TDD Workflow:**
1. Write test describing expected behavior
2. Run test - MUST fail (RED)
3. Write minimal implementation
4. Run test - MUST pass (GREEN)
5. Refactor code while tests stay green
6. Commit: `test({phase}-{plan}): add failing test for [feature]`
7. Commit: `feat({phase}-{plan}): implement [feature]`
8. Commit: `refactor({phase}-{plan}): clean up [feature]` (if needed)

### 2. Characterization Testing

Used before refactoring to capture current behavior:

**Purpose:**
- Safety net for refactoring
- Documents existing behavior
- Enables confident code changes

**Workflow (from Phase 2):**
1. Write comprehensive tests for existing code
2. Establish baseline - all tests must pass
3. Refactor code
4. Verify all characterization tests still pass
5. Add unit tests for new modules

**Example - Provider Fallback Chain (Phase 2.2):**
- Created 38 characterization tests
- Baseline: 38/38 passing
- Refactored 872-line file into 6 modules
- Result: 38/38 still passing + 42 new unit tests

**Example - Provider Interface (Phase 2.3):**
- Created 36 characterization tests
- Baseline: 36/36 passing
- Refactored 1,102-line file into 8 modules
- Result: 36/36 still passing + 48 new unit tests

### 3. Facade Pattern Testing

When refactoring with facade pattern for backward compatibility:

```javascript
// Test facade maintains original API
describe('Backward Compatibility', () => {
    it('should support original class signature', () => {
        const instance = new OriginalClass();
        expect(instance.originalMethod()).toBeDefined();
    });

    it('should delegate to new modules', () => {
        const spy = vi.spyOn(newModule, 'method');
        const instance = new OriginalClass();
        instance.originalMethod();
        expect(spy).toHaveBeenCalled();
    });
});
```

**See:**
- `tests/unit/provider-fallback-chain.characterization.test.js`
- `tests/unit/provider-interface.characterization.test.js`

## Running Tests

```bash
# Unit tests
npm run test:unit

# E2E tests
npm run test:e2e

# All tests
npm run test

# With coverage
npm run test:unit -- --coverage
```

### Before Running Tests

```bash
npm run lint:globals    # Check for accidental window globals
```

## Writing Unit Tests

### Structure

Unit tests use Vitest (similar to Jest):

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Storage } from '../../js/storage.js';

// Mock dependencies
vi.mock('../../js/services/event-bus.js', () => ({
    EventBus: {
        emit: vi.fn(),
        on: vi.fn()
    }
}));

describe('Storage', () => {
    beforeEach(() => {
        // Reset state before each test
        vi.clearAllMocks();
    });

    afterEach(() => {
        // Clean up after each test
        vi.restoreAllMocks();
    });

    it('should store data correctly', async () => {
        const result = await Storage.save('test-key', { data: 'value' });
        expect(result).toBe(true);
    });
});
```

### Test Organization

**File naming:**
- Unit tests: `[module].test.js`
- Characterization tests: `[module].characterization.test.js`
- Critical fixes: `critical-[issue].test.js`

**Directory structure mirrors source:**
```
tests/unit/services/session-manager/
├── session-lifecycle.test.js
├── session-state.test.js
└── session-manager.test.js
```

### Mocking Browser APIs

Use Vitest's `vi` module to mock browser APIs:

```javascript
import { vi } from 'vitest';

describe('IndexedDB operations', () => {
    it('should handle storage errors', async () => {
        // Mock IndexedDB
        const mockDB = {
            transaction: vi.fn(() => ({
                objectStore: vi.fn(() => ({
                    put: vi.fn(),
                    get: vi.fn()
                }))
            }))
        };

        // Use mock in test
        // ...
    });
});
```

## Mock Requirements

All browser APIs are mocked globally in `tests/setup.js`. However, some mocks require specific attention in individual tests.

### Fetch Mock

**Critical:** Fetch responses MUST include `headers.get()` mock

```javascript
// ✅ CORRECT - headers.get() returns value
global.fetch = vi.fn(() =>
    Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
            get: vi.fn((header) => {
                if (header === 'content-type') return 'application/json';
                if (header === 'retry-after') return '60';
                return null;
            })
        },
        json: async () => ({ success: true })
    })
);

// ❌ WRONG - Missing headers.get() causes errors
global.fetch = vi.fn(() =>
    Promise.resolve({
        ok: true,
        status: 200,
        headers: {},  // Missing get() method
        json: async () => ({ success: true })
    })
);
```

**Common Error:**
```
Cannot read properties of undefined (reading 'get')
```
**Fix:** Add `headers.get()` mock to fetch response

### Worker Mock

**Critical:** Worker MUST return message data, not null

```javascript
// ✅ CORRECT - Returns actual message
global.Worker = class Worker {
    postMessage(message) {
        setTimeout(() => {
            if (this.onmessage) {
                this.onmessage({ data: message });  // Returns message
            }
        }, 0);
    }
};

// ❌ WRONG - Returns null
global.Worker = class Worker {
    postMessage(message) {
        setTimeout(() => {
            if (this.onmessage) {
                this.onmessage({ data: null });  // Wrong!
            }
        }, 0);
    }
};
```

**Common Error:**
```
Error: Worker mock returned data: null instead of message
```
**Fix:** Ensure Worker.onmessage receives `{ data: message }`

### BroadcastChannel Mock

**Enhanced for cross-tab simulation:**

```javascript
const broadcastChannelInstances = new Map();

global.BroadcastChannel = class BroadcastChannel {
    constructor(name) {
        this.name = name;
        this.listeners = [];
        this.messageHistory = [];  // Track messages for verification

        if (!broadcastChannelInstances.has(name)) {
            broadcastChannelInstances.set(name, []);
        }
        broadcastChannelInstances.get(name).push(this);
    }

    postMessage(message) {
        this.messageHistory.push({ message, timestamp: Date.now() });

        setTimeout(() => {
            this.listeners.forEach(listener => {
                listener({ data: message, type: 'message' });
            });
        }, 0);
    }

    addEventListener(type, listener) {
        if (type === 'message') {
            this.listeners.push(listener);
        }
    }

    getMessageHistory() {
        return this.messageHistory;  // For test verification
    }
};
```

### EventBus Mock

**Pattern for mocking EventBus:**

```javascript
vi.mock('../../js/services/event-bus.js', () => {
    const handlers = new Map();

    const mockEventBus = {
        on: vi.fn((event, handler) => {
            if (!handlers.has(event)) {
                handlers.set(event, []);
            }
            handlers.get(event).push(handler);
            return vi.fn();  // Return unsubscribe function
        }),
        emit: vi.fn((event, data) => {
            const eventHandlers = handlers.get(event) || [];
            eventHandlers.forEach(handler => handler(event, data));
        }),
        once: vi.fn(() => vi.fn()),
        off: vi.fn(),
        _getHandlers: (event) => handlers.get(event) || [],
        _clearHandlers: () => handlers.clear()
    };

    return { EventBus: mockEventBus };
});
```

**Usage in tests:**

```javascript
import { EventBus } from '../../js/services/event-bus.js';

it('should emit event', () => {
    performAction();
    expect(EventBus.emit).toHaveBeenCalledWith(
        'event:name',
        expect.objectContaining({ key: 'value' })
    );
});
```

### localStorage Mock

```javascript
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: vi.fn((key) => store[key] || null),
        setItem: vi.fn((key, value) => {
            store[key] = value.toString();
        }),
        removeItem: vi.fn((key) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        })
    };
})();

global.localStorage = localStorageMock;
```

## Testing Async Operations

### Basic Async Testing

```javascript
it('should handle async operations', async () => {
    const result = await asyncOperation();
    expect(result).toBeDefined();
});
```

### Promise Error Testing (Critical Pattern)

**Issue:** Using `expect().rejects.toThrow()` with fake timers causes unhandled promise rejections.

**Solution:** Use try-catch blocks instead:

```javascript
// ✅ CORRECT - Use try-catch with fake timers
it('should timeout if operation takes too long', async () => {
    vi.useFakeTimers();

    try {
        const promise = slowOperation();
        vi.advanceTimersByTime(10000);
        await promise;
        expect.fail('Should have timed out');
    } catch (error) {
        expect(error.message).toContain('timeout');
    } finally {
        vi.useRealTimers();
    }
});

// ❌ WRONG - Causes unhandled rejection warnings with fake timers
it('should timeout if operation takes too long', async () => {
    vi.useFakeTimers();

    const promise = slowOperation();
    vi.advanceTimersByTime(10000);

    await expect(promise).rejects.toThrow();  // Unhandled rejection!
    vi.useRealTimers();
});
```

**Why:** `expect().rejects` creates a promise rejection that Vitest reports before the catch block runs. Try-catch handles the error synchronously.

### Sequential Async Testing

```javascript
it('should handle sequential calls', async () => {
    const result1 = await operation1();
    const result2 = await operation2();

    expect(result1).toBeDefined();
    expect(result2).toBeDefined();
});
```

### Parallel Async Testing

```javascript
it('should handle parallel operations', async () => {
    const results = await Promise.allSettled([
        operation1(),
        operation2(),
        operation3()
    ]);

    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('fulfilled');
});
```

### Testing Events

```javascript
it('should emit event on completion', () => {
    const handler = vi.fn();

    // Subscribe to event
    EventBus.on('operation:complete', handler);

    // Trigger operation
    completeOperation();

    expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' })
    );
});
```

## Integration Testing

Integration tests verify cross-module functionality:

- **Storage encryption**: End-to-end data encryption workflows
- **License verification**: Complete license validation flow
- **Spotify integration**: OAuth to data import pipeline
- **Premium gating**: Feature unlock with valid license

### Writing Integration Tests

```javascript
import { describe, it, expect } from 'vitest';
import { Storage, Crypto } from '@/js/services/index.js';

describe('Storage Encryption Integration', () => {
  it('should encrypt and decrypt data end-to-end', async () => {
    const storage = new Storage();
    const testData = { sensitive: 'data' };

    await storage.set('test-key', testData);
    const retrieved = await storage.get('test-key');

    expect(retrieved).toEqual(testData);
  });
});
```

## Security Testing

### Race Condition Testing

```javascript
describe('TOCTOU Race Conditions', () => {
  it('should prevent concurrent write quota violations', async () => {
    const quotaManager = new QuotaManager(1000);

    // Reserve space before write
    await quotaManager.reserve(500);

    // Parallel writes should respect reservation
    const results = await Promise.allSettled([
      quotaManager.write('key1', new Uint8Array(500)),
      quotaManager.write('key2', new Uint8Array(500))
    ]);

    expect(results[1].status).toBe('rejected');
  });
});
```

### License Verification Testing

```javascript
describe('License Verification', () => {
  it('should validate Chamber tier license', async () => {
    const verifier = new LicenseVerifier();
    const result = await verifier.verify('chamber-license-key');

    expect(result.valid).toBe(true);
    expect(result.tier).toBe('chamber');
  });
});
```

## Writing E2E Tests

### Basic E2E Test

```typescript
import { test, expect } from '@playwright/test';

test('user can upload data file', async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:8080');

    // Upload file
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles('tests/fixtures/sample-data.json');

    // Verify result
    await expect(page.locator('.reveal-section')).toBeVisible();
});
```

### Testing OAuth Flows

```typescript
test('Spotify OAuth flow', async ({ page, context }) => {
    // Mock Spotify OAuth callback
    await page.goto('http://localhost:8080?code=test-auth-code');

    // Verify redirect handled correctly
    await expect(page).toHaveURL(/http:\/\/localhost:8080\/?$/);
    await expect(page.locator('.spotify-connected')).toBeVisible();
});
```

### Testing Chat Interface

```typescript
test('chat responds to user messages', async ({ page }) => {
    await page.goto('http://localhost:8080?mode=demo');

    // Send message
    await page.fill('#chat-input', 'What was I listening to in March?');
    await page.click('#chat-send');

    // Wait for response
    await expect(page.locator('.chat-message.assistant')).toBeVisible();
});
```

### Testing Security Features

```typescript
test('blocks insecure context', async ({ page }) => {
    // Use http instead of https
    await page.goto('http://insecure-example.com');

    // Should show security error
    await expect(page.locator('.security-error')).toBeVisible();
});
```

## Test Data

### Sample Data

Use `sample_data.json` for consistent test data:

```javascript
import sampleData from '../sample_data.json';

it('processes sample data correctly', () => {
    const result = processData(sampleData);
    expect(result).toBeDefined();
});
```

### Demo Data

Use demo personas for predictable test scenarios:

```javascript
import { DemoData } from '../../js/demo-data.js';

it('loads demo persona', () => {
    const emoTeen = DemoData.personas.emoTeen;
    expect(emoTeen.personality.type).toBe('Emotional Archaeologist');
});
```

### Fixtures

Create test fixtures in `tests/fixtures/`:

```
tests/fixtures/
├── minimal-data.json    # Smallest valid dataset
├── large-data.json      # Stress testing
└── malformed.json       # Error handling tests
```

## Common Patterns

### Testing Operation Lock

```javascript
import { OperationLock, LockAcquisitionError } from '../../js/operation-lock.js';

it('prevents concurrent operations', async () => {
    const lock1 = OperationLock.acquire('test-op');
    const lock2 = OperationLock.acquire('test-op');

    await expect(lock2.acquire()).rejects.toThrow(LockAcquisitionError);

    lock1.release();
    await expect(lock2.acquire()).resolves.toBe(true);
});
```

### Testing Storage Encryption

```javascript
import { Security } from '../../js/security/index.js';

it('encrypts sensitive data', async () => {
    const plaintext = 'sensitive-api-key';
    const encrypted = await Security.encryptData(plaintext);

    expect(encrypted).not.toContain(plaintext);
    expect(encrypted).toHaveProperty('cipher');
    expect(encrypted).toHaveProperty('iv');
});
```

### Testing Provider Fallback

```javascript
it('falls back to secondary provider', async () => {
    // Mock primary provider failure
    vi.mocked(primaryProvider.call).mockRejectedValueOnce(new Error('API error'));

    const response = await callProviderWithFallback();

    expect(response.provider).toBe('fallback');
});
```

## Troubleshooting

### Common Issues & Solutions

#### 1. "Cannot read properties of undefined (reading 'get')"

**Cause:** Fetch response missing `headers.get()` mock

**Solution:**
```javascript
// Add headers.get() to fetch mock
global.fetch = vi.fn(() =>
    Promise.resolve({
        ok: true,
        status: 200,
        headers: {
            get: vi.fn((header) => {
                if (header === 'content-type') return 'application/json';
                return null;
            })
        },
        json: async () => ({ success: true })
    })
);
```

**Files affected:** `export-strategies.test.js`, metrics exporter tests

#### 2. "jest is not defined" or "jest.fn is not a function"

**Cause:** Using Jest syntax in Vitest

**Solution:** Use `vi.fn()` instead of `jest.fn()`
```javascript
// ❌ WRONG
jest.fn()

// ✅ CORRECT
vi.fn()
```

#### 3. Unhandled Promise Rejections

**Cause:** Using `expect().rejects.toThrow()` with fake timers

**Solution:** Use try-catch blocks (see [Testing Async Operations](#testing-async-operations))

**Locations where this was fixed (Phase 1.2):**
- `retry-manager-critical-fixes.test.js` - timeout tests
- `export-strategies.test.js` - retry tests
- `error-handling-tests.test.js` - transaction state tests
- `memory-leak-tests.test.js` - Promise.race tests
- `race-condition-tests.test.js` - requestIdCounter tests
- `functions-critical-fixes.test.js` - schema initialization tests

#### 4. Worker Mock Returning Null

**Cause:** Worker mock not returning message data

**Solution:**
```javascript
// Ensure Worker returns actual message
global.Worker = class Worker {
    postMessage(message) {
        setTimeout(() => {
            if (this.onmessage) {
                this.onmessage({ data: message });  // Not null!
            }
        }, 0);
    }
};
```

#### 5. "requestIdCounter is not defined"

**Cause:** Undefined variable in race condition tests

**Solution:** Define variable before use
```javascript
describe('race conditions', () => {
    let requestIdCounter;  // Declare variable

    beforeEach(() => {
        requestIdCounter = 0;  // Initialize
    });
});
```

**Files affected:** `race-condition-tests.test.js`

#### 6. Timeout Issues

**Default timeouts:**
- Test timeout: 10,000ms (configured in `vitest.config.js`)
- Hook timeout: 30,000ms (configured in `vitest.config.js`)

**Increase timeout for slow tests:**
```javascript
test('slow operation', async () => {
    // ...
}, { timeout: 30000 }); // 30 seconds
```

#### 7. Mock Accuracy Problems

**Issue:** Tests passing but mocks don't match real behavior

**Solution:**
- Review mock implementation vs real API
- Add tests for error conditions
- Verify mock returns correct data types
- Test edge cases in mock behavior

**Example:**
```javascript
// Test that mock matches real behavior
it('mock should match real API behavior', () => {
    const mock = createMock();
    expect(mock.method()).toEqual(realAPI.method());
});
```

#### 8. Race Condition Testing Issues

**Challenge:** Testing timing-dependent code

**Solutions:**
```javascript
// Use Promise.allSettled for parallel operations
const results = await Promise.allSettled([
    operation1(),
    operation2()
]);

// Use locks to prevent concurrent access
const lock = await acquireLock('resource');
try {
    await criticalSection();
} finally {
    lock.release();
}
```

**Files affected:** `race-condition-tests.test.js`, tab election tests

### Tests Time Out

**Issue**: Tests exceed default timeout

**Solution**: Increase timeout for slow operations:
```javascript
test('slow operation', async ({ page }) => {
    // ...
}, { timeout: 30000 }); // 30 seconds
```

### IndexedDB Not Available

**Issue**: Tests fail with "IndexedDB not available"

**Solution**: Use test environment with IndexedDB support:
```javascript
// In vitest.config.js
export default {
    testEnvironment: 'jsdom',
    testEnvironmentOptions: {
        url: 'http://localhost:8080'
    }
};
```

### Playwright Can't Find Elements

**Issue**: `locator.click()` fails with "Element not found"

**Solution**: Wait for element to be visible:
```javascript
await page.waitForSelector('#my-element', { state: 'visible' });
await page.click('#my-element');
```

### Tests Pass Locally but Fail in CI

**Common causes**:
- Timing issues (add explicit waits)
- Browser differences (test in multiple browsers)
- Missing test data (ensure fixtures are committed)
- Environment differences (node version, OS)

### Debugging Failed Tests

**Unit tests (Vitest)**:
```bash
npm run test:unit -- --reporter=verbose
```

**E2E tests (Playwright)**:
```bash
npm run test:ui  # Use UI to inspect failures
```

**Run specific test file:**
```bash
npm run test:unit -- path/to/test.test.js
```

**Run specific test:**
```bash
npm run test:unit -- -t "test name"
```

## Test Coverage

### Current Metrics
- **Unit test pass rate**: 96.8% (2,479/2,560 tests)
- **Target pass rate**: >98%
- **Test files**: 122 unit test files

### Coverage Goals
- 100% coverage of security-critical code
- 98%+ pass rate for unit tests
- 100% pass rate for E2E tests
- Tests for all bug fixes (regression tests)
- Characterization tests before refactoring (>90% coverage)

Check coverage:
```bash
npm run test:unit -- --coverage
```

## Best Practices

### 1. Test-Driven Development (TDD)

**Write tests before code:**
1. Write failing test (RED)
2. Write minimal implementation (GREEN)
3. Refactor while tests stay green
4. Commit each phase separately

**Benefits:**
- Forces thinking about requirements first
- Guarantees test coverage
- Makes refactoring safer
- Documents expected behavior

### 2. Characterization Testing Before Refactoring

**Before refactoring any module:**
1. Write comprehensive characterization tests
2. Establish baseline - all tests must pass
3. Refactor code
4. Verify all characterization tests still pass
5. Add unit tests for new structure

**Proven results (Phase 2):**
- Provider Fallback Chain: 38 characterization tests → 97% code reduction
- Provider Interface: 36 characterization tests → 8 modular files
- Zero regressions during refactoring

### 3. Facade Pattern Testing

**When using facade pattern for backward compatibility:**
- Test original API still works
- Test delegation to new modules
- Test event emissions
- Test error handling
- Verify zero breaking changes

### 4. Worker Integration Testing

**Testing Web Worker communication:**
- Mock Worker to return actual message data
- Test message passing both ways
- Verify Worker initialization
- Test error handling in Worker
- Use `getMessageHistory()` for verification

### 5. Mock Accuracy

**Ensure mocks match real behavior:**
- Return correct data types
- Simulate error conditions
- Implement all required methods
- Test mock behavior separately
- Document mock limitations

### 6. Async Testing Patterns

**Best practices:**
- Use try-catch instead of `expect().rejects` with fake timers
- Always clean up fake timers in `finally` blocks
- Use `Promise.allSettled` for parallel operations
- Test both success and error paths
- Add explicit timeouts for slow operations

### 7. Test Organization

**Arrange-Act-Assert structure:**
```javascript
it('should do something', () => {
    // Arrange: Setup test data and mocks
    const input = { value: 'test' };

    // Act: Execute the code being tested
    const result = functionUnderTest(input);

    // Assert: Verify expected outcome
    expect(result).toBe('expected');
});
```

**Descriptive test names:**
- ✅ "should emit session:created event when session is created"
- ❌ "test session creation"

**Independent tests:**
- No shared state between tests
- Clean up in `afterEach` hooks
- Use fresh mocks in each test
- Tests should run in any order

### 8. Testing Edge Cases

**Always test:**
- Error conditions (network failures, timeouts)
- Boundary values (empty arrays, null, undefined)
- Concurrent operations (race conditions)
- Invalid input (malformed data)
- Resource exhaustion (quota limits)

### 9. Regression Testing

**For every bug fix:**
1. Write test that reproduces bug
2. Verify test fails before fix
3. Implement fix
4. Verify test passes after fix
5. Add to critical test suite

**Example files:**
- `critical-*.test.js` - Critical bug fixes
- `*-critical-fixes.test.js` - Module-specific fixes

### 10. Documentation

**Document in test files:**
- What is being tested and why
- Any non-obvious behavior
- Mock limitations
- Dependencies on other tests
- Known issues

```javascript
/**
 * Session Lifecycle Module Tests
 *
 * Tests session lifecycle operations:
 * - createSession, activateSession, switchSession
 * - deleteSession, clearAllSessions, renameSession
 * - Session state transitions
 * - Session cleanup
 *
 * @module tests/unit/session-manager/session-lifecycle
 */
```

## Phase 1-3 Test Infrastructure Improvements

### Fixed Test Patterns (Phase 1.2)

**Issues identified and resolved:**
1. Missing `headers.get()` in fetch mocks → Added headers to all fetch responses
2. Worker mock returning null → Fixed to return actual message data
3. Unhandled promise rejections → Switched to try-catch pattern
4. Undefined variables in tests → Added proper variable declarations
5. Missing timeout configuration → Added to `vitest.config.js`

**Results:**
- Reduced unhandled rejections from 13 to 8
- Improved test pass rate by 20 tests
- Fixed 8 test files with proper error handling

### Characterization Testing (Phase 2)

**Successful refactoring patterns:**
1. Provider Fallback Chain: 872 lines → 6 modules
2. Provider Interface: 1,102 lines → 8 modules
3. Session Manager: Facade pattern with 95.7% test coverage

**Total test coverage added:**
- 38 characterization tests (Provider Fallback)
- 36 characterization tests (Provider Interface)
- 84 new unit tests for refactored modules
- 100% backward compatibility maintained

### Test Infrastructure (Phase 3.3)

**Documentation and standards:**
- Comprehensive testing guide
- Mock requirements documented
- Troubleshooting patterns captured
- Best practices established
- TDD workflows standardized

---

For more information, see:
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [AGENT_CONTEXT.md](AGENT_CONTEXT.md) - Technical architecture
- [Playwright Docs](https://playwright.dev/docs/intro)
- [Vitest Docs](https://vitest.dev/guide/)
