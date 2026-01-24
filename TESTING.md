# Testing Guide

This guide covers running and writing tests for Rhythm Chamber.

## Table of Contents

- [Test Overview](#test-overview)
- [Test Structure](#test-structure)
- [Test Frameworks](#test-frameworks)
- [Running Tests](#running-tests)
- [Writing Unit Tests](#writing-unit-tests)
- [Integration Testing](#integration-testing)
- [Security Testing](#security-testing)
- [Writing E2E Tests](#writing-e2e-tests)
- [Test Data](#test-data)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

## Test Overview

Rhythm Chamber uses a multi-tier testing strategy:

| Test Type | Framework | Location | Purpose |
|-----------|-----------|----------|---------|
| **Unit Tests** | Vitest | `tests/unit/` | Test individual modules, schemas, utilities |
| **Integration Tests** | Vitest | `tests/integration/` | Test cross-module functionality |
| **E2E Tests** | Playwright | `tests/e2e/` | Test complete user flows |

## Test Structure

```
tests/
├── unit/                    # Unit tests (53 files)
│   ├── observability/       # Performance monitoring tests
│   ├── critical-*.test.js   # Security and bug fix tests
│   └── [module].test.js     # Module-specific tests
├── integration/             # Integration tests (1 file)
├── e2e/                     # End-to-end tests (2 files)
├── fixtures/                # Test data files
└── rhythm-chamber.spec.ts  # Main E2E test suite
```

## Test Frameworks

- **Vitest**: Unit and integration tests with happy-dom environment
- **Playwright**: End-to-end testing with visual debugging
- **Happy-DOM**: Browser-like environment for unit tests

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

### Watch Mode (TDD)

```bash
npm run test:unit:watch
```

Watch mode is ideal for Test-Driven Development:
- Tests re-run on file changes
- Fast feedback loop
- Use `f` or `o` keys to filter tests

### Playwright UI

```bash
npm run test:ui         # Run with visual UI
npm run test:headed     # Run in headed browser
```

The Playwright UI provides:
- Visual test runner
- Time-travel debugging
- DOM snapshots
- Network inspection

### Before Running Tests

```bash
npm run lint:globals    # Check for accidental window globals
```

## Writing Unit Tests

### Structure

Unit tests use Vitest (similar to Jest):

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Storage } from '../../js/storage.js';

describe('Storage', () => {
    beforeEach(() => {
        // Reset state before each test
        vi.clearAllMocks();
    });

    it('should store data correctly', async () => {
        const result = await Storage.save('test-key', { data: 'value' });
        expect(result).toBe(true);
    });
});
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

### Testing Async Operations

```javascript
it('should handle async operations', async () => {
    const result = await asyncOperation();

    // Use resolves/rejects for promises
    await expect(Promise.resolve(result)).resolves.toBeDefined();
    await expect(Promise.rejects()).rejects.toThrow();
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

### Debugging Failed Tests

**Unit tests (Vitest)**:
```bash
npm run test:unit -- --reporter=verbose
```

**E2E tests (Playwright)**:
```bash
npm run test:ui  # Use UI to inspect failures
```

## Test Coverage

While there's no configured coverage target, aim for:
- 100% coverage of security-critical code
- 80%+ coverage for business logic
- Tests for all bug fixes (regression tests)

Check coverage:
```bash
npm run test:unit -- --coverage
```

## Best Practices

1. **One assertion per test** (when practical)
2. **Arrange-Act-Assert** structure
3. **Descriptive test names** that explain what is being tested
4. **Independent tests** (no shared state)
5. **Mock external dependencies** (APIs, browser storage)
6. **Test error paths**, not just happy paths
7. **Clean up resources** in `afterEach` hooks

---

For more information, see:
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [AGENT_CONTEXT.md](AGENT_CONTEXT.md) - Technical architecture
- [Playwright Docs](https://playwright.dev/docs/intro)
- [Vitest Docs](https://vitest.dev/guide/)
