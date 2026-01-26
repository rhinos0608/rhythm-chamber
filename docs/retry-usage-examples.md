# RetryManager Usage Examples

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [Retry Strategies](#retry-strategies)
3. [Error Classification](#error-classification)
4. [Retry Conditions](#retry-conditions)
5. [Advanced Patterns](#advanced-patterns)
6. [Real-World Examples](#real-world-examples)
7. [Testing](#testing)

## Basic Usage

### Simple Retry with Default Configuration

```javascript
import { RetryManager } from './utils/retry-manager.js';

// Retry with default exponential backoff
const result = await RetryManager.withRetry(
    async () => {
        return await fetch('/api/data');
    }
);
```

### Retry with Custom Max Attempts

```javascript
const result = await RetryManager.withRetry(
    async () => {
        return await database.put('store', data);
    },
    {
        maxRetries: 5
    }
);
```

### Retry with Custom Configuration

```javascript
const result = await RetryManager.withRetry(
    async () => {
        return await apiCall();
    },
    {
        maxRetries: 3,
        config: {
            baseDelayMs: 500,
            maxDelayMs: 10000,
            jitterMs: 100,
            exponentialBase: 2
        }
    }
);
```

### Retry with Callbacks

```javascript
const result = await RetryManager.withRetry(
    async () => {
        return await criticalOperation();
    },
    {
        onRetry: (error, attempt, delay, context) => {
            console.log(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
        },
        onSuccess: (result, context) => {
            console.log(`Success after ${context.attempt + 1} attempts`);
        },
        onFailure: (error, context) => {
            console.error(`Failed after ${context.attempt} attempts:`, error);
        }
    }
);
```

## Retry Strategies

### Using Predefined Strategies

```javascript
import { RetryManager } from './utils/retry-manager.js';

// Network operations (API calls, fetch)
const userData = await RetryManager.retryNetwork(
    async () => fetch('/api/users/123')
);

// Database operations
const saved = await RetryManager.retryStorage(
    async () => database.put('users', user)
);

// Function execution
const result = await RetryManager.retryFunction(
    async () => processUserData(data)
);

// Transaction operations
const committed = await RetryManager.retryTransaction(
    async () => transaction.commit()
);

// Provider calls (LLM)
const response = await RetryManager.withStrategy(
    async () => provider.chat(messages),
    'PROVIDER'
);

// Aggressive retry for critical operations
const critical = await RetryManager.withStrategy(
    async () => criticalSystemUpdate(),
    'AGGRESSIVE'
);

// Conservative retry for non-critical operations
const optional = await RetryManager.withStrategy(
    async () => optionalFeatureCall(),
    'CONSERVATIVE'
);
```

### Custom Strategy

```javascript
// Define custom strategy inline
const result = await RetryManager.withRetry(
    async () => customOperation(),
    {
        config: {
            maxRetries: 4,
            baseDelayMs: 2000,
            maxDelayMs: 20000,
            jitterMs: 500,
            exponentialBase: 2
        }
    }
);
```

## Error Classification

### Check if Error is Retryable

```javascript
import { RetryManager, ErrorType } from './utils/retry-manager.js';

try {
    await someOperation();
} catch (error) {
    const errorType = RetryManager.classifyError(error);
    const isRetryable = RetryManager.isRetryable(error);

    console.log(`Error type: ${errorType}`);
    console.log(`Is retryable: ${isRetryable}`);

    if (isRetryable) {
        console.log('This error will be retried automatically');
    } else {
        console.log('This error will not be retried');
    }
}
```

### Handle Specific Error Types

```javascript
const result = await RetryManager.withRetry(
    async () => apiCall(),
    {
        shouldRetry: (error, attempt) => {
            const errorType = RetryManager.classifyError(error);

            // Retry transient errors and rate limits
            if (errorType === ErrorType.TRANSIENT || errorType === ErrorType.RATE_LIMIT) {
                return true;
            }

            // Don't retry authentication errors
            if (errorType === ErrorType.AUTHENTICATION) {
                console.error('Authentication failed, not retrying');
                return false;
            }

            // Don't retry quota exceeded
            if (errorType === ErrorType.QUOTA_EXCEEDED) {
                console.error('Storage quota exceeded');
                return false;
            }

            return false;
        }
    }
);
```

## Retry Conditions

### Retry on Specific Error Types

```javascript
import { RetryManager, ErrorType } from './utils/retry-manager.js';

// Only retry transient errors and timeouts
const result = await RetryManager.withRetry(
    async () => operation(),
    {
        shouldRetry: RetryManager.retryOnErrorTypes(
            ErrorType.TRANSIENT,
            ErrorType.TIMEOUT
        )
    }
);
```

### Retry with Max Attempts

```javascript
// Retry at most 2 times regardless of error type
const result = await RetryManager.withRetry(
    async () => operation(),
    {
        shouldRetry: RetryManager.retryWithMaxAttempts(2)
    }
);
```

### Retry on HTTP Status Codes

```javascript
// Retry on specific HTTP status codes
const result = await RetryManager.withRetry(
    async () => fetch(url),
    {
        shouldRetry: RetryManager.retryOnStatus(429, 500, 502, 503, 504)
    }
);
```

### Combine Retry Conditions

```javascript
// Retry if ALL conditions are met
const result = await RetryManager.withRetry(
    async () => operation(),
    {
        shouldRetry: RetryManager.retryIfAll(
            RetryManager.retryOnErrorTypes(ErrorType.TRANSIENT),
            RetryManager.retryWithMaxAttempts(3)
        )
    }
);

// Retry if ANY condition is met
const result = await RetryManager.withRetry(
    async () => operation(),
    {
        shouldRetry: RetryManager.retryIfAny(
            RetryManager.retryOnErrorTypes(ErrorType.TRANSIENT),
            RetryManager.retryOnStatus(429)
        )
    }
);
```

### Never Retry

```javascript
// Execute without retry (one-shot attempt)
const result = await RetryManager.withRetry(
    async () => operation(),
    {
        shouldRetry: RetryManager.retryNever()
    }
);
```

### Always Retry (Up to Max)

```javascript
// Retry all errors up to max attempts
const result = await RetryManager.withRetry(
    async () => operation(),
    {
        shouldRetry: RetryManager.retryAlways(),
        maxRetries: 5
    }
);
```

## Advanced Patterns

### Retry with Timeout

```javascript
const result = await RetryManager.withRetry(
    async () => {
        return await fetch('/api/slow-endpoint');
    },
    {
        timeoutMs: 5000, // 5 second timeout per attempt
        onRetry: (error, attempt, delay) => {
            if (error.message.includes('timeout')) {
                console.log(`Attempt ${attempt} timed out, retrying...`);
            }
        }
    }
);
```

### Retry with Abort Signal

```javascript
const abortController = new AbortController();

const result = await RetryManager.withRetry(
    async () => {
        return await fetch(url, { signal: abortController.signal });
    },
    {
        abortSignal: abortController.signal,
        maxRetries: 3
    }
);

// Cancel from outside
setTimeout(() => abortController.abort(), 10000);
```

### Retry Without Jitter

```javascript
const result = await RetryManager.withRetry(
    async () => operation(),
    {
        useJitter: false, // Disable jitter for predictable delays
        config: {
            baseDelayMs: 1000,
            exponentialBase: 2
        }
    }
);
```

### Parallel Retry

```javascript
// Execute multiple operations in parallel, each with independent retry logic
const results = await RetryManager.withRetryParallel(
    [
        async () => fetch('/api/users'),
        async () => fetch('/api/posts'),
        async () => fetch('/api/comments')
    ],
    {
        maxRetries: 2,
        config: RetryManager.RetryStrategies.NETWORK
    }
);

// results is array of { result, context } objects
```

### Fallback Chain

```javascript
// Try multiple alternatives in sequence
const { result, fnIndex, errors } = await RetryManager.withFallback(
    [
        async () => fetchFromPrimaryAPI(),
        async () => fetchFromSecondaryAPI(),
        async () => fetchFromCache()
    ],
    {
        onFallback: (error, index) => {
            console.warn(`Fallback ${index} failed:`, error.message);
        }
    }
);

console.log(`Used fallback ${fnIndex}`);
```

### Circuit Breaker Integration

```javascript
import { canExecute } from './services/adaptive-circuit-breaker.js';

const result = await RetryManager.withCircuitBreaker(
    () => canExecute('api-circuit'),
    async () => {
        return await apiCall();
    },
    {
        maxRetries: 3
    }
);
```

### Access Retry Context

```javascript
const { result, context } = await RetryManager.withRetry(
    async () => operation(),
    {
        maxRetries: 3,
        onSuccess: (result, context) => {
            console.log(`Total attempts: ${context.attempt + 1}`);
            console.log(`Total delay time: ${context.totalDelayTime}ms`);
            console.log(`Elapsed time: ${context.elapsedTime}ms`);
            console.log(`All delays:`, context.delays);
        }
    }
);
```

### Linear Backoff

```javascript
// Use linear backoff instead of exponential
const result = await RetryManager.retryLinear(
    async () => operation(),
    {
        maxRetries: 3,
        config: {
            baseDelayMs: 1000,
            maxDelayMs: 5000
        }
    }
);
```

### Custom Backoff Function

```javascript
// Fibonacci backoff
function fibonacciBackoff(attempt, config) {
    const fib = [0, 1];
    for (let i = 2; i <= attempt; i++) {
        fib[i] = fib[i - 1] + fib[i - 2];
    }
    return config.baseDelayMs * (fib[attempt] || 1);
}

const result = await RetryManager.retryCustom(
    async () => operation(),
    fibonacciBackoff,
    {
        maxRetries: 5,
        config: { baseDelayMs: 100 }
    }
);
```

## Real-World Examples

### Database Transaction with Retry

```javascript
import { RetryManager, ErrorType } from './utils/retry-manager.js';

async function saveUserData(user) {
    return RetryManager.retryTransaction(
        async () => {
            return await StorageTransaction.transaction(async (tx) => {
                await tx.put('indexeddb', 'users', user);
                await tx.put('indexeddb', 'user_index', {
                    userId: user.id,
                    timestamp: Date.now()
                });
            });
        },
        {
            shouldRetry: RetryManager.retryIfAny(
                RetryManager.retryOnErrorTypes(ErrorType.TRANSIENT, ErrorType.TIMEOUT),
                (error, attempt) => {
                    // Don't retry if transaction was partially committed
                    return !error.message.includes('partial commit');
                }
            ),
            onFailure: (error, context) => {
                // Log for manual recovery if needed
                console.error('Transaction failed after retries:', error);
                EventBus.emit('transaction:failed', {
                    error: error.message,
                    attempts: context.attempt
                });
            }
        }
    );
}
```

### API Call with Rate Limit Handling

```javascript
import { RetryManager, ErrorType } from './utils/retry-manager.js';

async function fetchWithRateLimitHandling(url, options = {}) {
    return RetryManager.withRetry(
        async () => {
            const response = await fetch(url, options);

            if (response.status === 429) {
                const error = new Error('Rate limited');
                error.status = 429;
                error.retryAfter = response.headers.get('Retry-After');
                throw error;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json();
        },
        {
            maxRetries: 5,
            config: {
                baseDelayMs: 5000, // Start with 5s for rate limits
                maxDelayMs: 60000, // Max 60s
                jitterMs: 1000
            },
            shouldRetry: RetryManager.retryOnErrorTypes(ErrorType.RATE_LIMIT),
            onRetry: (error, attempt, delay) => {
                console.warn(`Rate limited, retry ${attempt}/${5} in ${delay}ms`);
            }
        }
    );
}
```

### IndexedDB Connection with Fallback

```javascript
import { RetryManager } from './utils/retry-manager.js';

async function initWithFallback() {
    try {
        const connection = await RetryManager.withRetry(
            async () => {
                return await initDatabase();
            },
            {
                maxRetries: 3,
                config: {
                    baseDelayMs: 500,
                    maxDelayMs: 5000
                },
                onRetry: (error, attempt, delay) => {
                    console.warn(`DB connection attempt ${attempt} failed, retrying...`);
                    EventBus.emit('storage:connection_retry', {
                        attempt,
                        delay
                    });
                }
            }
        );

        return connection;
    } catch (error) {
        console.warn('IndexedDB unavailable, using fallback');
        return await FallbackBackend.init();
    }
}
```

### Lock Acquisition with Retry

```javascript
import { RetryManager, ErrorType } from './utils/retry-manager.js';

async function acquireLockWithRetry(lockName, sessionId) {
    const { result } = await RetryManager.withRetry(
        async () => {
            return await SessionLockManager.acquireLock(lockName, sessionId);
        },
        {
            maxRetries: 3,
            config: RetryManager.RetryStrategies.LOCK,
            shouldRetry: RetryManager.retryOnErrorTypes(
                ErrorType.TRANSIENT,
                ErrorType.TIMEOUT
            ),
            onFailure: (error, context) => {
                console.error(`Failed to acquire lock '${lockName}' after ${context.attempt} attempts`);
            }
        }
    );

    return result;
}
```

### Worker Initialization

```javascript
import { RetryManager } from './utils/retry-manager.js';

async function initializeWorkerWithRetry(workerScript) {
    return RetryManager.withStrategy(
        async () => {
            const worker = new Worker(workerScript);

            // Wait for worker to be ready
            await new Promise((resolve, reject) => {
                worker.onmessage = (e) => {
                    if (e.data.type === 'ready') resolve();
                    else reject(new Error('Worker initialization failed'));
                };
                worker.onerror = reject;

                setTimeout(() => reject(new Error('Worker init timeout')), 5000);
            });

            return worker;
        },
        'WORKER', // Uses worker-specific retry strategy
        {
            onFailure: (error) => {
                console.error('Worker failed to initialize:', error);
            }
        }
    );
}
```

### File Upload with Chunked Retry

```javascript
import { RetryManager } from './utils/retry-manager.js';

async function uploadFileWithRetry(file, chunkSize = 1024 * 1024) {
    const chunks = Math.ceil(file.size / chunkSize);
    const uploadedChunks = [];

    for (let i = 0; i < chunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const uploaded = await RetryManager.retryNetwork(
            async () => {
                const formData = new FormData();
                formData.append('chunk', chunk);
                formData.append('chunkIndex', i);
                formData.append('totalChunks', chunks);

                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`Upload failed: ${response.statusText}`);
                }

                return response.json();
            },
            {
                onRetry: (error, attempt, delay) => {
                    console.warn(`Chunk ${i} upload failed, retry ${attempt} in ${delay}ms`);
                }
            }
        );

        uploadedChunks.push(uploaded);
    }

    return uploadedChunks;
}
```

## Testing

### Mocking Retry Behavior

```javascript
import { RetryManager } from './utils/retry-manager.js';

// Test that retry happens on failure
test('should retry on transient error', async () => {
    let attempts = 0;
    const mockFn = async () => {
        attempts++;
        if (attempts < 3) {
            throw new Error('Network error');
        }
        return 'success';
    };

    const result = await RetryManager.retryNetwork(mockFn);

    expect(result).toBe('success');
    expect(attempts).toBe(3);
});

// Test that non-retryable errors fail immediately
test('should not retry auth errors', async () => {
    const mockFn = async () => {
        throw new Error('401 Unauthorized');
    };

    await expect(RetryManager.retryFunction(mockFn)).rejects.toThrow();
});

// Test retry condition
test('should respect custom retry condition', async () => {
    let attempts = 0;
    const mockFn = async () => {
        attempts++;
        throw new Error('Test error');
    };

    await expect(
        RetryManager.withRetry(mockFn, {
            maxRetries: 5,
            shouldRetry: RetryManager.retryWithMaxAttempts(2)
        })
    ).rejects.toThrow();

    expect(attempts).toBe(2);
});
```

### Testing with Timeouts

```javascript
test('should timeout and retry', async () => {
    let attempts = 0;
    const mockFn = async () => {
        attempts++;
        if (attempts === 1) {
            // First attempt hangs
            return new Promise(() => {}); // Never resolves
        }
        return 'success';
    };

    const result = await RetryManager.withRetry(mockFn, {
        timeoutMs: 100, // 100ms timeout
        maxRetries: 2
    });

    expect(result).toBe('success');
    expect(attempts).toBe(2);
}, 10000); // Increase test timeout
```

### Testing Retry Callbacks

```javascript
test('should call retry callbacks', async () => {
    const onRetrySpy = jest.fn();
    const onSuccessSpy = jest.fn();

    await RetryManager.withRetry(
        async () => {
            if (Math.random() > 0.5) {
                throw new Error('Random failure');
            }
            return 'success';
        },
        {
            maxRetries: 5,
            onRetry: onRetrySpy,
            onSuccess: onSuccessSpy
        }
    );

    expect(onSuccessSpy).toHaveBeenCalled();
});
```

## Best Practices

1. **Always use predefined strategies when possible** - They're tuned for specific use cases
2. **Set appropriate timeouts** - Prevent hanging operations
3. **Use retry conditions** - Don't retry non-retryable errors
4. **Log retry attempts** - Helps with debugging
5. **Monitor retry metrics** - Track success/failure rates
6. **Use jitter** - Prevent thundering herd
7. **Handle AbortError** - Respect cancellation signals
8. **Test retry behavior** - Ensure it works as expected

## Troubleshooting

### Too Many Retries

```javascript
// Reduce max retries
const result = await RetryManager.withRetry(fn, {
    maxRetries: 1 // Only retry once
});
```

### Retries Too Slow

```javascript
// Reduce base delay
const result = await RetryManager.withRetry(fn, {
    config: {
        baseDelayMs: 100, // Start with 100ms instead of 1000ms
        maxDelayMs: 1000  // Max delay 1s instead of 30s
    }
});
```

### Retries Not Happening

```javascript
// Check error classification
const errorType = RetryManager.classifyError(error);
console.log(`Error type: ${errorType}`);

// Use explicit retry condition
const result = await RetryManager.withRetry(fn, {
    shouldRetry: () => true // Retry everything
});
```

For more information, see:
- [Migration Guide](./retry-migration-guide.md)
- [Module Source](../js/utils/retry-manager.js)
