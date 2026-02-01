# Error Handling Utilities

Centralized error handling utilities to address the "Error Handling Sprawl" anti-pattern.

## Overview

This module provides:

- **Error Classification**: Categorize errors by type and severity
- **User-Friendly Formatting**: Convert technical errors to actionable user messages
- **Provider-Specific Hints**: Context-aware recovery suggestions for different services
- **Automatic Recovery**: Retry logic with exponential backoff for recoverable errors
- **Type Guards**: Helper functions to check error properties

## Installation

The module is located at `js/utils/error-handling.js` and can be imported as an ES module:

```javascript
import {
  ErrorHandler,
  ErrorType,
  ErrorSeverity,
  ErrorRecoverability,
} from './utils/error-handling.js';
```

## Quick Start

### Basic Error Handling

```javascript
import { ErrorHandler } from './utils/error-handling.js';

try {
  await someRiskyOperation();
} catch (error) {
  // Classify the error
  const classified = ErrorHandler.classify(error, {
    provider: 'openrouter',
    operation: 'chat_completion',
  });

  // Log with appropriate severity
  ErrorHandler.log(classified);

  // Show user-friendly message
  showToast(ErrorHandler.formatForToast(classified), 5000);
}
```

### Automatic Recovery

```javascript
try {
  await callLLM(messages);
} catch (error) {
  const classified = ErrorHandler.classify(error, {
    provider: 'openrouter',
    operation: 'chat_completion',
  });

  // Check if recoverable
  if (ErrorHandler.isRecoverable(classified)) {
    const recovered = await ErrorHandler.attemptRecovery(classified, {
      maxRetries: 3,
      retryDelayMs: 1000,
      retryCallback: () => callLLM(messages),
    });

    if (recovered.success) {
      console.log('Operation succeeded on retry');
      return;
    }
  }

  // Fall back to user-facing error
  showToast(ErrorHandler.formatForToast(classified), 5000);
}
```

## Error Types

The module recognizes these error categories:

### LLM Provider Errors

- `ErrorType.LLM_PROVIDER_ERROR` - Generic provider error
- `ErrorType.LLM_TIMEOUT` - Request timed out
- `ErrorType.LLM_RATE_LIMIT` - Rate limit exceeded
- `ErrorType.LLM_QUOTA_EXCEEDED` - Account quota exceeded
- `ErrorType.LLM_INVALID_RESPONSE` - Malformed response from provider
- `ErrorType.LLM_API_KEY_INVALID` - Invalid or missing API key
- `ErrorType.LLM_MODEL_UNAVAILABLE` - Requested model not available

### Storage Errors

- `ErrorType.STORAGE_QUOTA_EXCEEDED` - Browser storage full
- `ErrorType.STORAGE_TRANSACTION_FAILED` - IndexedDB transaction failed
- `ErrorType.STORAGE_INDEXEDDB_UNAVAILABLE` - IndexedDB not supported
- `ErrorType.STORAGE_READ_ONLY` - Write denied (multi-tab conflict)
- `ErrorType.STORAGE_CORRUPTION` - Data corruption detected
- `ErrorType.STORAGE_FATAL_STATE` - Critical storage failure

### Network Errors

- `ErrorType.NETWORK_OFFLINE` - No internet connection
- `ErrorType.NETWORK_TIMEOUT` - Network request timed out
- `ErrorType.NETWORK_CONNECTION_REFUSED` - Service unreachable
- `ErrorType.NETWORK_DNS_FAILURE` - DNS resolution failed

### Validation Errors

- `ErrorType.VALIDATION_MISSING_REQUIRED` - Required parameter missing
- `ErrorType.VALIDATION_INVALID_TYPE` - Parameter type mismatch
- `ErrorType.VALIDATION_INVALID_FORMAT` - Parameter format invalid
- `ErrorType.VALIDATION_OUT_OF_RANGE` - Parameter value out of range
- `ErrorType.VALIDATION_SCHEMA_MISMATCH` - Schema validation failed

### Transaction Errors

- `ErrorType.TRANSACTION_NESTED_NOT_SUPPORTED` - Nested transaction detected
- `ErrorType.TRANSACTION_TIMEOUT` - Transaction timed out
- `ErrorType.TRANSACTION_ROLLBACK_FAILED` - Rollback failed
- `ErrorType.TRANSACTION_PREPARE_FAILED` - Prepare phase failed

## Error Severity

Errors are categorized by severity:

- `ErrorSeverity.CRITICAL` - System-breaking, requires immediate attention
- `ErrorSeverity.HIGH` - Major feature impact, user intervention needed
- `ErrorSeverity.MEDIUM` - Degraded experience, workaround available
- `ErrorSeverity.LOW` - Minor issue, cosmetic or informational
- `ErrorSeverity.INFO` - Not an error, just informational

## Error Recoverability

Each error is marked with recoverability:

- `ErrorRecoverability.RECOVERABLE` - Can retry with same parameters
- `ErrorRecoverability.RECOVERABLE_WITH_RETRY` - Can retry with modified parameters
- `ErrorRecoverability.USER_ACTION_REQUIRED` - User must provide input/fix
- `ErrorRecoverability.NOT_RECOVERABLE` - Cannot be recovered, must fail

## API Reference

### `classifyError(error, context)`

Classify a raw error into a standardized error object.

**Parameters:**

- `error` (Error|string|unknown) - The error to classify
- `context` (Object) - Additional context
  - `provider` (string, optional) - LLM provider name
  - `operation` (string, optional) - Operation being performed
  - `metadata` (Object, optional) - Additional metadata

**Returns:** `ClassifiedError` object

**Example:**

```javascript
const classified = ErrorHandler.classify(error, {
  provider: 'anthropic',
  operation: 'chat_completion',
  metadata: { model: 'claude-3-opus', maxTokens: 4096 },
});
```

### `formatForUser(classifiedError, options)`

Format error for display to users.

**Parameters:**

- `classifiedError` (ClassifiedError) - The error to format
- `options` (Object, optional)
  - `includeHint` (boolean, default: true) - Include recovery hint
  - `includeSeverity` (boolean, default: true) - Include severity icon
  - `includeTimestamp` (boolean, default: false) - Include timestamp

**Returns:** Formatted string for user display

**Example:**

```javascript
const message = ErrorHandler.formatForUser(classified, {
  includeHint: true,
  includeSeverity: true,
  includeTimestamp: false,
});
// Returns: "⚠️ **Rate Limit Exceeded**\n\nRate limit exceeded.\n\n💡 Tip: Wait a moment..."
```

### `formatForLog(classifiedError)`

Format error for logging/debugging.

**Parameters:**

- `classifiedError` (ClassifiedError) - The error to format

**Returns:** Object with technical details

**Example:**

```javascript
const logEntry = ErrorHandler.formatForLog(classified);
console.error(logEntry);
// Logs: { type, severity, message, originalStack, context, timestamp }
```

### `formatForToast(classifiedError)`

Format error for toast notifications.

**Parameters:**

- `classifiedError` (ClassifiedError) - The error to format

**Returns:** Short string for temporary display

**Example:**

```javascript
showToast(ErrorHandler.formatForToast(classified), 5000);
// Shows: "Rate limit exceeded. Please wait."
```

### `log(classifiedError, options)`

Log error with appropriate severity level.

**Parameters:**

- `classifiedError` (ClassifiedError) - The error to log
- `options` (Object, optional)
  - `includeStack` (boolean, default: true) - Include stack trace
  - `includeContext` (boolean, default: true) - Include context
  - `silent` (boolean, default: false) - Skip console output

**Returns:** Log entry object

**Example:**

```javascript
const logEntry = ErrorHandler.log(classified, {
  includeStack: true,
  includeContext: true,
});
```

### `attemptRecovery(classifiedError, options)`

Attempt automatic recovery from error.

**Parameters:**

- `classifiedError` (ClassifiedError) - The error to recover from
- `options` (Object, optional)
  - `maxRetries` (number, default: 3) - Maximum retry attempts
  - `retryDelayMs` (number, default: 1000) - Delay between retries
  - `retryCallback` (Function) - Function to retry

**Returns:** Promise with recovery result

**Example:**

```javascript
const recovered = await ErrorHandler.attemptRecovery(classified, {
  maxRetries: 3,
  retryDelayMs: 1000,
  retryCallback: () => callLLM(messages),
});

if (recovered.success) {
  console.log('Recovered on attempt', recovered.attempt);
}
```

### Type Guards

#### `isType(classifiedError, errorType)`

Check if error is of specific type.

```javascript
if (ErrorHandler.isType(classified, ErrorType.LLM_RATE_LIMIT)) {
  // Handle rate limit specifically
}
```

#### `isSevere(classifiedError)`

Check if error is critical or high severity.

```javascript
if (ErrorHandler.isSevere(classified)) {
  // Show persistent notification
  showToast(ErrorHandler.formatForToast(classified), 0);
}
```

#### `isRecoverable(classifiedError)`

Check if error can be automatically recovered.

```javascript
if (ErrorHandler.isRecoverable(classified)) {
  const recovered = await ErrorHandler.attemptRecovery(classified, {
    retryCallback: () => operation(),
  });
}
```

#### `requiresUserAction(classifiedError)`

Check if error requires user intervention.

```javascript
if (ErrorHandler.requiresUserAction(classified)) {
  // Show detailed error modal
  showErrorModal(classified);
}
```

### `handleBatchErrors(errors, context)`

Handle multiple errors from batch operations.

**Parameters:**

- `errors` (Array<Error>) - Array of errors
- `context` (Object) - Shared context for all errors

**Returns:** Batch error summary

**Example:**

```javascript
const results = await Promise.allSettled(operations);
const errors = results.filter(r => r.status === 'rejected').map(r => r.reason);

const batchError = ErrorHandler.handleBatchErrors(errors, {
  operation: 'batch_import',
});

console.log(`${batchError.total} errors occurred`);
console.log('Max severity:', batchError.maxSeverity);
```

## Integration Guide

### For LLM Provider Calls

Replace scattered error handling with centralized utilities:

**Before:**

```javascript
// In message-lifecycle-coordinator.js
try {
  const response = await callLLM(config, key, messages, tools);
} catch (error) {
  const providerHints = {
    ollama: 'Ensure Ollama is running (`ollama serve`)',
    lmstudio: 'Check LM Studio server is enabled',
    gemini: 'Verify your Gemini API key in Settings',
    openrouter: 'Check your OpenRouter API key in Settings',
  };
  const hint = providerHints[provider] || 'Check your provider settings';
  return `**Connection Error**\n\n${error.message}\n\n💡 **Tip:** ${hint}\n\nClick "Try Again" after fixing the issue.`;
}
```

**After:**

```javascript
import { ErrorHandler } from './utils/error-handling.js';

try {
  const response = await callLLM(config, key, messages, tools);
} catch (error) {
  const classified = ErrorHandler.classify(error, {
    provider: settings.llm?.provider || 'openrouter',
    operation: 'chat_completion',
  });

  ErrorHandler.log(classified);
  return ErrorHandler.formatForUser(classified);
}
```

### For Storage Operations

Standardize storage error handling:

**Before:**

```javascript
// In indexeddb.js
try {
  await IndexedDBCore.put(storeName, data);
} catch (error) {
  if (error.name === 'QuotaExceededError') {
    console.warn('Storage quota exceeded');
    // Handle quota error...
  } else if (error.message.includes('transaction')) {
    console.warn('Transaction failed');
    // Handle transaction error...
  }
  throw error;
}
```

**After:**

```javascript
import { ErrorHandler, ErrorType } from './utils/error-handling.js';

try {
  await IndexedDBCore.put(storeName, data);
} catch (error) {
  const classified = ErrorHandler.classify(error, {
    operation: 'storage_put',
    metadata: { storeName },
  });

  if (ErrorHandler.isType(classified, ErrorType.STORAGE_QUOTA_EXCEEDED)) {
    // Show quota error to user
    showToast(classified.message, 5000);
  } else {
    ErrorHandler.log(classified);
  }
}
```

### For Transaction Errors

Simplify transaction error handling:

**Before:**

```javascript
// In transaction.js
try {
  await transaction(callback);
} catch (error) {
  if (error.message.includes('nested')) {
    throw new Error('Nested transactions are not supported');
  } else if (error.message.includes('timeout')) {
    throw new Error('Transaction timed out');
  }
  throw error;
}
```

**After:**

```javascript
import { ErrorHandler, ErrorType } from './utils/error-handling.js';

try {
  await transaction(callback);
} catch (error) {
  const classified = ErrorHandler.classify(error, {
    operation: 'storage_transaction',
  });

  // Re-throw with user-friendly message
  throw new Error(classified.message);
}
```

## Best Practices

### 1. Always Classify Errors First

```javascript
try {
  await operation();
} catch (error) {
  const classified = ErrorHandler.classify(error, context);
  // Now use classified error throughout
}
```

### 2. Check Recoverability Before Retrying

```javascript
if (ErrorHandler.isRecoverable(classified)) {
  const recovered = await ErrorHandler.attemptRecovery(classified, {
    retryCallback: () => operation(),
  });
  if (recovered.success) return result;
}
```

### 3. Use Severity for UI Prioritization

```javascript
if (ErrorHandler.isSevere(classified)) {
  // Show persistent notification
  showToast(ErrorHandler.formatForToast(classified), 0);
} else {
  // Auto-dismiss after delay
  showToast(ErrorHandler.formatForToast(classified), 3000);
}
```

### 4. Log with Context for Debugging

```javascript
ErrorHandler.log(classified, {
  includeStack: true,
  includeContext: true,
});
```

### 5. Provide Operation Context

Always provide context when classifying:

```javascript
const classified = ErrorHandler.classify(error, {
  provider: 'openrouter',
  operation: 'chat_completion',
  metadata: {
    model: 'claude-3-opus',
    maxTokens: 4096,
    temperature: 0.7,
  },
});
```

## Provider-Specific Patterns

The module automatically detects patterns from these providers:

- **OpenRouter**: Rate limits, invalid keys, timeouts, model unavailability
- **Anthropic**: Rate limits, invalid keys, timeouts
- **Ollama**: Connection errors, unavailability
- **LM Studio**: Connection errors, unavailability
- **Gemini**: Rate limits, invalid keys, quota exceeded

Additional providers can be added by extending `PROVIDER_ERROR_PATTERNS`.

## Examples

### Complete Example: LLM Call with Error Handling

```javascript
import { ErrorHandler, ErrorType, ErrorSeverity } from './utils/error-handling.js';

async function sendMessageWithRetry(message, options = {}) {
  const { provider = 'openrouter', maxRetries = 3 } = options;

  try {
    const response = await callLLM(provider, message);
    return response;
  } catch (error) {
    // Classify the error
    const classified = ErrorHandler.classify(error, {
      provider,
      operation: 'chat_completion',
      metadata: { messageLength: message.length },
    });

    // Log the error
    ErrorHandler.log(classified);

    // Check if recoverable
    if (ErrorHandler.isRecoverable(classified)) {
      console.log('Attempting automatic recovery...');

      const recovered = await ErrorHandler.attemptRecovery(classified, {
        maxRetries,
        retryDelayMs: 1000,
        retryCallback: () => callLLM(provider, message),
      });

      if (recovered.success) {
        console.log('Operation succeeded on retry', recovered.attempt);
        return recovered.result;
      }
    }

    // Not recoverable or recovery failed - show user error
    if (ErrorHandler.requiresUserAction(classified)) {
      // Show detailed error modal for user action
      showErrorModal({
        title: 'Configuration Required',
        message: ErrorHandler.formatForUser(classified),
        severity: classified.severity,
      });
    } else {
      // Show toast notification
      showToast(ErrorHandler.formatForToast(classified), 5000);
    }

    // Re-throw for caller to handle
    throw new Error(classified.message);
  }
}
```

### Batch Operation Error Handling

```javascript
import { ErrorHandler } from './utils/error-handling.js';

async function processBatch(items) {
  const results = await Promise.allSettled(items.map(item => processItem(item)));

  const errors = results.filter(r => r.status === 'rejected').map(r => r.reason);

  if (errors.length > 0) {
    const batchError = ErrorHandler.handleBatchErrors(errors, {
      operation: 'batch_process',
      metadata: { itemCount: items.length },
    });

    console.log(`Batch completed with ${batchError.total} errors`);

    if (batchError.maxSeverity === ErrorSeverity.CRITICAL) {
      // Show error summary
      showBatchErrorDialog(batchError);
    }
  }

  return results;
}
```

## Type Definitions

### ClassifiedError

```typescript
interface ClassifiedError {
  type: string; // ErrorType enum value
  severity: string; // ErrorSeverity enum value
  recoverable: string; // ErrorRecoverability enum value
  message: string; // User-friendly error message
  hint: string | null; // Recovery hint or null
  originalError: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    status?: number;
  };
  context: {
    provider?: string;
    operation?: string;
    [key: string]: any;
  };
  timestamp: string; // ISO 8601 timestamp
}
```

## Migration Guide

To migrate existing error handling:

1. **Import the module:**

   ```javascript
   import { ErrorHandler } from './utils/error-handling.js';
   ```

2. **Replace provider-specific error handling:**

   ```javascript
   // Before
   if (error.message.includes('rate limit')) {
     showRateLimitError();
   }

   // After
   const classified = ErrorHandler.classify(error, { provider: 'openrouter' });
   if (ErrorHandler.isType(classified, ErrorType.LLM_RATE_LIMIT)) {
     showRateLimitError();
   }
   ```

3. **Use centralized formatting:**

   ```javascript
   // Before
   const message = `Error: ${error.message}\n\nPlease try again.`;

   // After
   const message = ErrorHandler.formatForUser(classified);
   ```

4. **Add automatic recovery:**

   ```javascript
   // Before
   try {
     await operation();
   } catch (error) {
     console.error(error);
     throw error;
   }

   // After
   try {
     await operation();
   } catch (error) {
     const classified = ErrorHandler.classify(error);
     if (ErrorHandler.isRecoverable(classified)) {
       const recovered = await ErrorHandler.attemptRecovery(classified, {
         retryCallback: () => operation(),
       });
       if (recovered.success) return recovered.result;
     }
     throw error;
   }
   ```

## Troubleshooting

### Error Not Classified Correctly

If an error is classified as `UNKNOWN_ERROR`:

1. Check the error message matches expected patterns
2. Add custom patterns to `PROVIDER_ERROR_PATTERNS` or `STORAGE_ERROR_PATTERNS`
3. Provide context when classifying:
   ```javascript
   const classified = ErrorHandler.classify(error, {
     provider: 'custom_provider',
     operation: 'custom_operation',
   });
   ```

### Recovery Not Attempted

Check that:

1. Error recoverability is `RECOVERABLE` or `RECOVERABLE_WITH_RETRY`
2. `retryCallback` is provided to `attemptRecovery()`
3. The callback function returns the operation result

### User Messages Not Showing

Ensure you're calling the correct format function:

- `formatForUser()` - Full markdown message with hints
- `formatForToast()` - Short message for temporary display
- `formatForLog()` - Technical details for debugging

## See Also

- [Message Lifecycle Coordinator](../../services/message-lifecycle-coordinator.js) - Chat error handling
- [Storage Transaction](../../storage/transaction.js) - Transaction error handling
- [IndexedDB Core](../../storage/indexeddb.js) - Storage error handling
