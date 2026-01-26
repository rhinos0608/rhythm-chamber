# Retry Utilities Migration Guide

## Overview

This guide documents the migration path from existing retry utilities to the consolidated `RetryManager` module.

## Current State (Before Migration)

The codebase has **duplicate retry logic** across multiple modules:

| Module | Pattern | Max Retries | Base Delay | Features |
|--------|---------|-------------|------------|----------|
| `js/storage/transaction.js` | Custom retry loop | 3 | 100ms | Transient error detection, timeout wrapping |
| `js/storage/indexeddb.js` | Custom retry loop | 3 | 500ms | Fallback backend, connection retry |
| `js/functions/utils/retry.js` | Delegation wrapper | 2 | 500ms | Backward compatibility, AbortError handling |
| `js/utils/resilient-retry.js` | Comprehensive retry | 3 | 1000ms | Jitter, error classification, circuit breaker |
| `js/utils.js` | Fetch-specific retry | 3 | 1000ms | HTTP status filtering |
| `js/providers/provider-interface.js` | Provider retry | 3 | 1000ms | Jitter, provider timeout |
| `js/services/session-lock-manager.js` | Lock retry | 3 | 100ms | Lock-specific, wait-for graph |

## Target State (After Migration)

All retry logic consolidated into **single source of truth**:

- **Module**: `js/utils/retry-manager.js`
- **Exports**: `RetryManager` object with comprehensive API
- **Features**:
  - Multiple retry strategies (exponential, linear, custom)
  - Unified retry configuration
  - Retry condition builders
  - Jitter utilities
  - Circuit breaker integration
  - Timeout wrapping
  - Error classification
  - Retry context tracking

## Migration Strategy

### Phase 1: Non-Breaking Migration (Recommended)

1. **Keep existing utilities in place** as delegates to `RetryManager`
2. **Gradually migrate consumers** to use `RetryManager` directly
3. **Remove old utilities** after all consumers migrated

### Phase 2: Direct Migration (Aggressive)

1. **Replace all imports** of old retry utilities with `RetryManager`
2. **Update call sites** to use new API
3. **Remove old utilities** immediately

## Module-by-Module Migration Guide

### 1. js/functions/utils/retry.js → RetryManager

**Before:**
```javascript
import { FunctionRetry } from './functions/utils/retry.js';

const result = await FunctionRetry.withRetry(
    () => someFunction(),
    'functionName'
);
```

**After:**
```javascript
import { RetryManager } from '../utils/retry-manager.js';

const result = await RetryManager.retryFunction(
    () => someFunction()
);
```

**Delegate Pattern (Phase 1):**
```javascript
// In js/functions/utils/retry.js
import { RetryManager } from '../../utils/retry-manager.js';

export const FunctionRetry = {
    MAX_RETRIES: 2,
    isTransientError: (err) => RetryManager.isRetryable(err),
    withRetry: (fn, name) => RetryManager.retryFunction(fn, {
        onSuccess: (result, ctx) => {
            if (ctx.attempt > 0) {
                console.log(`[Functions] ${name} succeeded after ${ctx.attempt + 1} attempts`);
            }
        },
        onFailure: (err, ctx) => {
            console.error(`[Functions] ${name} failed:`, err.message);
        }
    })
};
```

### 2. js/storage/transaction.js → RetryManager

**Before:**
```javascript
async function retryOperation(operation, attempts = MAX_RETRY_ATTEMPTS) {
    let lastError;

    for (let i = 0; i < attempts; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            if (error.name === 'QuotaExceededError' ||
                error.name === 'InvalidStateError') {
                throw error;
            }

            if (i < attempts - 1) {
                const delay = RETRY_BASE_DELAY_MS * Math.pow(2, i);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw new Error(`Operation failed after ${attempts} attempts`);
}
```

**After:**
```javascript
import { RetryManager, ErrorType } from '../utils/retry-manager.js';

async function retryOperation(operation, attempts = MAX_RETRY_ATTEMPTS) {
    return RetryManager.retryStorage(operation, {
        maxRetries: attempts,
        shouldRetry: RetryManager.retryIfAny(
            RetryManager.retryOnErrorTypes(
                ErrorType.TRANSIENT,
                ErrorType.TIMEOUT
            ),
            // Don't retry quota/invalid state errors
            (error) => {
                const errorType = RetryManager.classifyError(error);
                return ![ErrorType.QUOTA_EXCEEDED, ErrorType.INVALID_STATE].includes(errorType);
            }
        ),
        onRetry: (error, attempt, delay) => {
            console.warn(`[StorageTransaction] Retry ${attempt}/${attempts} after ${delay}ms`);
        }
    });
}
```

### 3. js/storage/indexeddb.js → RetryManager

**Before:**
```javascript
async function initDatabaseWithRetry(options = {}) {
    const maxAttempts = options.maxAttempts ?? CONNECTION_CONFIG.maxRetries;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const connection = await initDatabase(options);
            return connection;
        } catch (error) {
            if (attempt < maxAttempts) {
                const delay = Math.min(
                    CONNECTION_CONFIG.baseDelayMs * Math.pow(2, attempt - 1),
                    CONNECTION_CONFIG.maxDelayMs
                );
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw new Error(`Failed after ${maxAttempts} attempts`);
}
```

**After:**
```javascript
import { RetryManager } from '../utils/retry-manager.js';

async function initDatabaseWithRetry(options = {}) {
    const maxAttempts = options.maxAttempts ?? CONNECTION_CONFIG.maxRetries;

    const { result } = await RetryManager.withRetry(
        () => initDatabase(options),
        {
            maxRetries: maxAttempts,
            config: {
                baseDelayMs: CONNECTION_CONFIG.baseDelayMs,
                maxDelayMs: CONNECTION_CONFIG.maxDelayMs
            },
            onRetry: (error, attempt, delay) => {
                console.log(`[IndexedDB] Retry ${attempt}/${maxAttempts} in ${delay}ms`);
                EventBus.emit('storage:connection_retry', {
                    attempt,
                    maxAttempts,
                    nextRetryMs: delay,
                    error: error.message
                });
            }
        }
    );

    return result;
}
```

### 4. js/utils.js (fetchWithRetry) → RetryManager

**Before:**
```javascript
async function fetchWithRetry(url, config = {}) {
    const {
        maxRetries = 3,
        baseDelayMs = 1000,
        maxDelayMs = 10000,
        retryOnStatus = [429, 500, 502, 503, 504]
    } = config;

    // Custom retry loop with status code checking
    // ...
}
```

**After:**
```javascript
import { RetryManager } from './utils/retry-manager.js';

async function fetchWithRetry(url, config = {}) {
    const {
        maxRetries = 3,
        baseDelayMs = 1000,
        maxDelayMs = 10000,
        retryOnStatus = [429, 500, 502, 503, 504],
        timeoutMs = 30000
    } = config;

    const { result } = await RetryManager.withRetry(
        async () => {
            const response = await fetchWithTimeout(url, config.options || {}, timeoutMs);

            if (retryOnStatus.includes(response.status)) {
                const error = new Error(`HTTP error: status ${response.status}`);
                error.status = response.status;
                error.response = response;
                throw error;
            }

            return response;
        },
        {
            maxRetries,
            config: { baseDelayMs, maxDelayMs },
            shouldRetry: RetryManager.retryOnStatus(...retryOnStatus),
            onRetry: (error, attempt, delay) => {
                console.warn(`[Utils] Retry ${attempt}/${maxRetries} for ${url}`);
            }
        }
    );

    return result;
}
```

### 5. js/providers/provider-interface.js → RetryManager

**Before:**
```javascript
function calculateRetryDelay(attempt) {
    const exponentialDelay = Math.min(
        RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt),
        RETRY_CONFIG.MAX_DELAY_MS
    );
    const jitter = Math.random() * RETRY_CONFIG.JITTER_MS;
    return exponentialDelay + jitter;
}
```

**After:**
```javascript
import { RetryManager } from '../utils/retry-manager.js';

// Use RetryManager.calculateBackoffWithJitter directly
const delay = RetryManager.calculateBackoffWithJitter(attempt, RETRY_CONFIG);
```

### 6. js/services/session-lock-manager.js → RetryManager

**Before:**
```javascript
for (let attemptCount = 1; attemptCount <= MAX_RETRY_ATTEMPTS; attemptCount++) {
    try {
        // ... lock acquisition logic
    } catch (error) {
        if (attemptCount < MAX_RETRY_ATTEMPTS) {
            const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attemptCount - 1);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}
```

**After:**
```javascript
import { RetryManager } from '../utils/retry-manager.js';

const { result } = await RetryManager.withRetry(
    async () => {
        // ... lock acquisition logic
    },
    {
        maxRetries: MAX_RETRY_ATTEMPTS,
        config: RetryManager.RetryStrategies.LOCK,
        shouldRetry: RetryManager.retryOnErrorTypes(
            ErrorType.TRANSIENT,
            ErrorType.TIMEOUT
        )
    }
);
```

## API Mapping Table

| Old API | New API | Notes |
|---------|---------|-------|
| `FunctionRetry.withRetry(fn, name)` | `RetryManager.retryFunction(fn)` | Use callbacks for logging |
| `retryOperation(op, attempts)` | `RetryManager.retryStorage(op, { maxRetries: attempts })` | Cleaner API |
| `calculateRetryDelay(attempt)` | `RetryManager.calculateBackoffWithJitter(attempt, config)` | Unified calculation |
| `isTransientError(err)` | `RetryManager.isRetryable(err)` | More semantic name |
| `classifyError(err)` | `RetryManager.classifyError(err)` | Direct mapping |
| Custom retry loops | `RetryManager.withRetry(fn, options)` | More features |
| `fetchWithRetry(url, config)` | `RetryManager.retryNetwork(fn, { config })` | Strategy-based |

## Benefits of Migration

1. **Single Source of Truth**: All retry logic in one place
2. **Consistent Behavior**: Same retry patterns across entire codebase
3. **Better Testing**: Easier to test retry logic in isolation
4. **More Features**: Circuit breaker integration, retry context tracking
5. **Less Code**: Remove duplicate implementations
6. **Easier Maintenance**: Update retry logic in one place

## Testing Strategy

### Unit Tests

```javascript
// Test retry behavior
test('should retry transient errors', async () => {
    let attempts = 0;
    const fn = async () => {
        attempts++;
        if (attempts < 3) {
            throw new Error('Network error');
        }
        return 'success';
    };

    const result = await RetryManager.retryNetwork(fn);
    expect(result).toBe('success');
    expect(attempts).toBe(3);
});

// Test no retry on non-retryable errors
test('should not retry authentication errors', async () => {
    const fn = async () => {
        throw new Error('401 Unauthorized');
    };

    await expect(RetryManager.retryNetwork(fn)).rejects.toThrow();
});

// Test retry conditions
test('should respect custom retry condition', async () => {
    let attempts = 0;
    const fn = async () => {
        attempts++;
        throw new Error('Test error');
    };

    await expect(
        RetryManager.withRetry(fn, {
            maxRetries: 5,
            shouldRetry: RetryManager.retryWithMaxAttempts(2)
        })
    ).rejects.toThrow();

    expect(attempts).toBe(2); // Only 2 attempts, not 5
});
```

### Integration Tests

```javascript
// Test with real storage operations
test('should retry storage operations', async () => {
    const result = await RetryManager.retryStorage(
        async () => {
            return await IndexedDBCore.put('test', { id: '1', data: 'test' });
        }
    );

    expect(result).toBeDefined();
});
```

## Rollback Plan

If issues arise during migration:

1. **Keep old utilities** as delegates (Phase 1 approach)
2. **Canary deployment**: Migrate one module at a time
3. **Feature flags**: Use feature flags to switch between old/new retry logic
4. **Monitoring**: Add metrics to track retry behavior differences
5. **Rollback**: Revert imports back to old utilities

## Performance Considerations

### Memory Usage

- **Before**: Multiple retry context objects scattered across modules
- **After**: Single `RetryContext` class with consistent lifecycle

### CPU Usage

- **Before**: Duplicate backoff calculations
- **After**: Unified calculation with memoization potential

### Network Load

- **Before**: Inconsistent jitter may cause retry storms
- **After**: Consistent jitter prevents thundering herd

## Checklist

- [ ] Review all modules using retry logic
- [ ] Create migration plan for each module
- [ ] Update imports (one module at a time)
- [ ] Update call sites to use new API
- [ ] Add unit tests for new usage patterns
- [ ] Run integration tests
- [ ] Monitor retry behavior in production
- [ ] Remove old retry utilities (after Phase 1 completion)
- [ ] Update documentation
- [ ] Train team on new API

## Additional Resources

- **Module**: `js/utils/retry-manager.js`
- **Examples**: `docs/retry-usage-examples.md`
- **Tests**: `tests/unit/retry-manager.test.js` (to be created)

## Questions or Issues?

If you encounter problems during migration:

1. Check the API mapping table above
2. Review usage examples in `docs/retry-usage-examples.md`
3. Look at delegate patterns in existing utilities
4. Check retry behavior differences in logs
5. Open an issue with specific error details
