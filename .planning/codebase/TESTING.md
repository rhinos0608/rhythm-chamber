# Testing Patterns

**Analysis Date:** 2025-01-21

## Test Framework

**Runner:**
- **Vitest** 4.0.17 - Unit tests
- **Playwright** 1.57.0 - E2E tests
- Config files: `vitest.config.js`, `playwright.config.ts`

**Assertion Library:**
- Vitest built-in assertions for unit tests
- Playwright expect API for E2E tests

**Environment:**
- Vitest: `happy-dom` for browser simulation
- Playwright: Chromium browser (desktop)

**Run Commands:**
```bash
npm test                          # Run Playwright E2E tests
npm run test:unit                 # Run Vitest unit tests
npm run test:unit:watch           # Vitest watch mode
npm run test:ui                   # Playwright UI mode
npm run test:headed               # Playwright headed mode
npm run pretest                   # Lint globals before tests
```

## Test File Organization

**Location:**
- Unit tests: `tests/unit/` (separate directory)
- E2E tests: `tests/` (root level)
- Fixtures: `tests/fixtures/`

**Naming:**
- Unit tests: `<module-name>.test.js`
- E2E tests: `<feature>.spec.ts`
- Example: `lru-cache.test.js`, `rhythm-chamber.spec.ts`

**Structure:**
```
tests/
├── fixtures/                     # Test data files
│   ├── sample-streaming-history.json
│   ├── empty-data.json
│   └── invalid-data.json
├── integration/                  # Integration tests (sparse)
├── unit/                         # Unit tests (comprehensive)
│   ├── observability/            # Nested for related modules
│   ├── lru-cache.test.js
│   ├── event-bus.test.js
│   └── [30+ test files]
└── rhythm-chamber.spec.ts        # E2E tests
```

## Test Structure

**Suite Organization:**
```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../js/services/event-bus.js';

describe('EventBus Subscription', () => {
    beforeEach(() => {
        EventBus.clearAll();
        EventBus.setDebugMode(false);
    });

    afterEach(() => {
        EventBus.clearAll();
    });

    it('should subscribe to events and receive payloads', () => {
        const handler = vi.fn();
        EventBus.on('test:event', handler);
        EventBus.emit('test:event', { data: 'test' });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
            { data: 'test' },
            expect.objectContaining({ type: 'test:event' })
        );
    });
});
```

**Patterns:**
- **Setup:** `beforeEach()` for test isolation, clear state between tests
- **Teardown:** `afterEach()` for cleanup, remove DOM elements
- **Grouping:** `describe()` blocks for related test suites
- **Assertions:** Vitest `expect()` with matchers like `toHaveBeenCalled()`, `toThrow()`

**Async Testing:**
```javascript
it('should retry on network failure with exponential backoff', async () => {
    mockFetch
        .mockRejectedValueOnce(new Error('Network error 1'))
        .mockRejectedValueOnce(new Error('Network error 2'))
        .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ openrouter: { apiKey: 'success' } })
        });

    const loadPromise = ConfigLoader.load();
    await vi.runAllTimersAsync();
    const config = await loadPromise;

    expect(config.openrouter.apiKey).toBe('success');
});
```

## Mocking

**Framework:** Vitest `vi` mock functions

**Patterns:**
```javascript
// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
    store: {},
    getItem: vi.fn((key) => localStorageMock.store[key] || null),
    setItem: vi.fn((key, value) => { localStorageMock.store[key] = value; }),
    clear: vi.fn(() => { localStorageMock.store = {}; })
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock EventBus
vi.mock('../../js/services/event-bus.js', () => ({
    EventBus: {
        subscribe: vi.fn(),
        emit: vi.fn()
    }
}));

// Mock timers
vi.useFakeTimers();
await vi.runAllTimersAsync();
vi.useRealTimers();
```

**What to Mock:**
- External APIs: `fetch()`, IndexedDB
- Browser APIs: `localStorage`, `window.location`
- Module dependencies: Event bus, config loader
- Time: `setTimeout()`, `setInterval()` for async tests

**What NOT to Mock:**
- Pure functions (test them directly)
- Data structures (LRU cache, vectors)
- Business logic (test real implementations)

## Fixtures and Factories

**Test Data:**
```javascript
// Fixture files
const SAMPLE_DATA_PATH = path.join(__dirname, 'fixtures', 'sample-streaming-history.json');

// Generated test data
function generateSampleStreamingHistory(count) {
    const artists = ['Taylor Swift', 'The Weeknd', 'Drake'];
    const streams = [];
    for (let i = 0; i < count; i++) {
        streams.push({
            ts: new Date(Date.now() - i * 3600000).toISOString(),
            master_metadata_track_name: 'Test Track',
            ms_played: 180000
        });
    }
    return streams;
}
```

**Location:**
- Static fixtures: `tests/fixtures/`
- Generated data: Test file helper functions
- Complex fixtures: Dedicated setup functions

**Test state management:**
- IndexedDB cleanup helper: `clearIndexedDB()` in E2E tests
- DOM cleanup: `document.body.innerHTML = ''` in `afterEach()`
- Module reset: `vi.resetModules()` for fresh imports

## Coverage

**Requirements:** No coverage target enforced (no coverage thresholds found)

**View Coverage:**
```bash
# No coverage command detected in package.json
# Typical Vitest coverage would be:
npx vitest run --coverage
```

**Current coverage:**
- Unit tests: 30+ test files covering core modules
- Storage layer: Well tested (LRU cache, transaction, migration)
- Services: Event bus, circuit breaker, health monitor
- Gaps: UI controllers, provider integrations less covered

## Test Types

**Unit Tests:**
- Scope: Individual functions and classes
- Approach: Isolated logic with mocked dependencies
- Framework: Vitest + happy-dom
- Example: `lru-cache.test.js`, `event-bus.test.js`

**Integration Tests:**
- Scope: Multiple modules working together
- Approach: Real dependencies where possible
- Location: `tests/integration/` (sparse)
- Status: Limited integration test coverage

**E2E Tests:**
- Scope: Full user flows
- Framework: Playwright
- Browser: Chromium
- Server: Auto-started http-server on port 8080
- Features tested:
  - File upload
  - Settings configuration
  - Chat interaction
  - Spotify integration

## Common Patterns

**Async Testing:**
```javascript
it('should handle async operations', async () => {
    const result = await asyncOperation();
    expect(result).toBe('success');
});

it('should handle async errors', async () => {
    await expect(asyncOperation()).rejects.toThrow('Error message');
});
```

**Timer Testing:**
```javascript
beforeEach(() => {
    vi.useFakeTimers();
});

it('should timeout after delay', async () => {
    const promise = operationWithTimeout();
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow('Timeout');
});
```

**Error Testing:**
```javascript
it('should catch and handle errors', async () => {
    const error = new Error('Test error');
    const operation = vi.fn().mockRejectedValue(error);

    await expect(boundary.wrap(operation)).rejects.toThrow('Test error');
    expect(boundary.hasError).toBe(true);
});
```

**Event Testing:**
```javascript
it('should subscribe to events and receive payloads', () => {
    const handler = vi.fn();
    EventBus.on('test:event', handler);
    EventBus.emit('test:event', { data: 'test' });

    expect(handler).toHaveBeenCalledWith(
        { data: 'test' },
        expect.objectContaining({ type: 'test:event' })
    );
});
```

**DOM Testing:**
```javascript
let container;

beforeEach(() => {
    container = document.createElement('div');
    container.className = 'test-container';
    document.body.appendChild(container);
});

afterEach(() => {
    if (container && container.parentNode) {
        container.parentNode.removeChild(container);
    }
    document.body.innerHTML = '';
});
```

---

*Testing analysis: 2025-01-21*