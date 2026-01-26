# Validation Utilities Integration Guide

## Overview

The centralized validation utilities (`js/utils/validation.js`) address the "Validation Everywhere" anti-pattern by providing reusable validation functions that were previously scattered across orchestrators.

## Benefits

1. **Single Source of Truth**: All validation logic in one place
2. **Consistency**: Same validation rules across the application
3. **Maintainability**: Update validation logic in one location
4. **Testability**: Test validation functions independently
5. **Type Safety**: Type guards for common patterns
6. **Error Formatting**: Consistent error messages

## Quick Start

```javascript
import { Validation } from './utils/validation.js';

// Validate a message
const result = Validation.validateMessage(userInput);
if (!result.valid) {
  console.error(result.error);
  return;
}

// Track the message to prevent duplicates
Validation.trackProcessedMessage(userInput);
```

## API Reference

### Message Validation

#### `validateMessage(message, options)`

Validates message content for type, length, and duplicates.

**Parameters:**
- `message` (*) - The message to validate
- `options` (Object) - Validation options
  - `skipDuplicateCheck` (boolean) - Skip duplicate detection (default: false)
  - `minLength` (number) - Minimum length (default: 1)
  - `maxLength` (number) - Maximum length (default: 50000)

**Returns:** `ValidationResult`
- `valid` (boolean) - Whether validation passed
- `error` (string) - Error message if invalid

**Example:**
```javascript
const result = Validation.validateMessage("Hello world", {
  minLength: 1,
  maxLength: 50000
});

if (!result.valid) {
  showErrorMessage(result.error);
}
```

#### `trackProcessedMessage(message)`

Tracks a message as processed to prevent duplicates.

**Parameters:**
- `message` (string) - The message to track

**Returns:** (string) The hash of the tracked message

**Example:**
```javascript
// After successfully processing a message
Validation.trackProcessedMessage(userMessage);
```

#### `clearProcessedMessages()`

Clears the duplicate detection cache.

**Example:**
```javascript
// For testing or intentional re-submission
Validation.clearProcessedMessages();
```

#### `removeProcessedMessage(message)`

Removes a specific message from the cache (useful for regeneration).

**Parameters:**
- `message` (string) - The message to remove

**Returns:** (boolean) True if the message was in the cache

**Example:**
```javascript
// Before regenerating a response
Validation.removeProcessedMessage(originalMessage);
```

### Schema Validation

#### `validateSchema(value, schema)`

Validates a value against a schema definition.

**Schema Properties:**
- `type` (string) - Expected type ('string', 'number', 'integer', 'boolean', 'array', 'object')
- `enum` (Array) - Allowed values
- `min` (number) - Minimum value (for numbers)
- `max` (number) - Maximum value (for numbers)
- `minLength` (number) - Minimum length (for strings/arrays)
- `maxLength` (number) - Maximum length (for strings/arrays)
- `pattern` (string) - Regex pattern (for strings)
- `required` (boolean) - Whether value is required
- `properties` (Object) - Property schemas (for objects)
- `requiredProperties` (string[]) - Required property names (for objects)

**Returns:** `ValidationResult`
- `valid` (boolean) - Whether validation passed
- `errors` (string[]) - Array of error messages
- `normalizedValue` (*) - Normalized/corrected value

**Examples:**

```javascript
// Validate a string
const result = Validation.validateSchema(input, {
  type: 'string',
  minLength: 1,
  maxLength: 100
});
```

```javascript
// Validate an enum with case-insensitive matching
const result = Validation.validateSchema(status, {
  type: 'string',
  enum: ['pending', 'active', 'completed']
});
// "ACTIVE" will be normalized to "active"
```

```javascript
// Validate an object
const result = Validation.validateSchema(data, {
  type: 'object',
  properties: {
    name: { type: 'string', required: true },
    age: { type: 'integer', min: 0, max: 120 }
  },
  requiredProperties: ['name']
});
```

```javascript
// Validate with type coercion
const result = Validation.validateSchema(count, {
  type: 'integer'
});
// "42" (string) will be normalized to 42 (integer)
```

### Type Guards

#### `isObject(value)`

Check if a value is a non-null object.

```javascript
if (Validation.isObject(data)) {
  console.log(data.property);
}
```

#### `isPlainObject(value)`

Check if a value is a plain object (not null, not array, not a special object).

```javascript
if (Validation.isPlainObject(config)) {
  // Safe to mutate
  config.newProperty = 'value';
}
```

#### `isArray(value)`

Check if a value is an array.

```javascript
if (Validation.isArray(items)) {
  items.forEach(item => console.log(item));
}
```

#### `isNonEmptyString(value)`

Check if a value is a non-empty string.

```javascript
if (Validation.isNonEmptyString(input)) {
  processInput(input);
}
```

#### `isFunction(value)`

Check if a value is a function.

```javascript
if (Validation.isFunction(callback)) {
  callback();
}
```

#### `isPromise(value)`

Check if a value is a promise.

```javascript
if (Validation.isPromise(result)) {
  await result;
}
```

### Input Validation

#### `sanitizeHTML(str)`

Sanitize a string for safe HTML display.

**Parameters:**
- `str` (string) - String to sanitize

**Returns:** (string) Sanitized string

**Example:**
```javascript
const safe = Validation.sanitizeHTML(userInput);
element.innerHTML = safe; // Safe from XSS
```

#### `validateURL(url, options)`

Validate and normalize a URL.

**Parameters:**
- `url` (*) - URL to validate
- `options` (Object)
  - `allowedProtocols` (string[]) - Allowed protocols (default: ['http:', 'https:'])

**Returns:** `ValidationResult` with normalized URL

**Example:**
```javascript
const result = Validation.validateURL(userInput, {
  allowedProtocols: ['http:', 'https:', 'mailto:']
});

if (result.valid) {
  window.location.href = result.normalizedValue;
}
```

#### `validateEmail(email)`

Validate an email address format.

**Parameters:**
- `email` (*) - Email to validate

**Returns:** `ValidationResult` with normalized email (lowercase, trimmed)

**Example:**
```javascript
const result = Validation.validateEmail(userEmail);
if (!result.valid) {
  showError('Please enter a valid email address');
} else {
  // Use result.normalizedValue (lowercase, trimmed)
  sendEmail(result.normalizedValue);
}
```

### State Validation

#### `validateState(state, schema)`

Validate a state object.

**Parameters:**
- `state` (*) - State object to validate
- `schema` (Object)
  - `properties` (Object) - Property schemas
  - `requiredProperties` (string[]) - Required property names
  - `allowExtraProperties` (boolean) - Allow properties not in schema (default: true)

**Returns:** `ValidationResult`

**Example:**
```javascript
const schema = {
  properties: {
    status: { type: 'string', enum: ['idle', 'busy', 'error'] },
    progress: { type: 'number', min: 0, max: 100 }
  },
  requiredProperties: ['status'],
  allowExtraProperties: false
};

const result = Validation.validateState(appState, schema);
if (!result.valid) {
  console.error('Invalid state:', result.errors);
}
```

### Storage Validation

#### `validateStorageKey(key)`

Validate a storage key (non-empty string with safe characters).

**Parameters:**
- `key` (*) - Storage key to validate

**Returns:** `ValidationResult`

**Example:**
```javascript
const result = Validation.validateStorageKey(userKey);
if (result.valid) {
  localStorage.setItem(result.normalizedValue, data);
}
```

#### `validateStorageValue(value, maxSizeKB)`

Validate storage value size.

**Parameters:**
- `value` (*) - Value to check
- `maxSizeKB` (number) - Maximum size in kilobytes (default: 5000)

**Returns:** `ValidationResult`

**Example:**
```javascript
const result = Validation.validateStorageValue(data, 5000);
if (!result.valid) {
  showError('Data too large for storage');
}
```

### Error Formatting

#### `formatValidationError(result, options)`

Format validation errors for display.

**Parameters:**
- `result` (ValidationResult) - Validation result
- `options` (Object)
  - `prefix` (string) - Message prefix (default: 'Validation error')
  - `separator` (string) - Error separator (default: ', ')

**Returns:** (string) Formatted error message

**Example:**
```javascript
const result = Validation.validateSchema(data, schema);
if (!result.valid) {
  const message = Validation.formatValidationError(result, {
    prefix: 'Invalid data',
    separator: '; '
  });
  showError(message);
}
```

#### `createValidationError(message, value)`

Create a typed validation error.

**Parameters:**
- `message` (string) - Error message
- `value` (*) - The invalid value

**Returns:** (Error) Validation error with metadata

**Example:**
```javascript
if (!isValid(input)) {
  throw Validation.createValidationError('Invalid input format', input);
}
```

#### `isValidationError(error)`

Check if an error is a validation error.

**Parameters:**
- `error` (*) - Error to check

**Returns:** (boolean)

**Example:**
```javascript
try {
  validate(data);
} catch (e) {
  if (Validation.isValidationError(e)) {
    showUserError(e.message);
  } else {
    reportError(e);
  }
}
```

### Batch Validation

#### `validateBatch(items, schemas)`

Validate multiple values against their schemas.

**Parameters:**
- `items` (Object) - Object mapping names to values
- `schemas` (Object) - Object mapping names to schemas

**Returns:** Object with `valid`, `results`, and `errors`

**Example:**
```javascript
const items = {
  name: 'John',
  age: '30',
  email: 'john@example.com'
};

const schemas = {
  name: { type: 'string', minLength: 1 },
  age: { type: 'integer', min: 0 },
  email: { type: 'string' }
};

const { valid, results, errors } = Validation.validateBatch(items, schemas);

if (!valid) {
  Object.entries(errors).forEach(([field, result]) => {
    console.error(`${field}:`, result.errors);
  });
}
```

## Migration Guide

### Step 1: Identify Validation Logic

Look for validation patterns in your code:

1. **Message validation** in `message-lifecycle-coordinator.js`
2. **Schema validation** in `functions/index.js`
3. **Input validation** in `chat-ui-controller.js`
4. **State validation** in storage modules

### Step 2: Import Validation Utilities

```javascript
import { Validation } from './utils/validation.js';
```

### Step 3: Replace Inline Validation

**Before:**
```javascript
if (typeof message !== 'string') {
  return { valid: false, error: 'Message must be a string' };
}
if (message.length === 0) {
  return { valid: false, error: 'Message cannot be empty' };
}
if (message.trim().length === 0) {
  return { valid: false, error: 'Message cannot contain only whitespace' };
}
if (message.length > 50000) {
  return { valid: false, error: 'Message too long' };
}
```

**After:**
```javascript
const result = Validation.validateMessage(message);
if (!result.valid) {
  return result;
}
```

### Step 4: Update Function Schemas

**Before:**
```javascript
// Manual schema validation
const errors = [];
for (const param of required) {
  if (args?.[param] === undefined) {
    errors.push(`Missing required parameter: ${param}`);
  }
}
```

**After:**
```javascript
const schema = {
  type: 'object',
  properties: {
    param1: { type: 'string', required: true },
    param2: { type: 'integer', min: 0 }
  },
  requiredProperties: ['param1']
};

const result = Validation.validateSchema(args, schema);
if (!result.valid) {
  return { error: result.errors.join(', ') };
}
```

## Best Practices

1. **Always check validation results**
   ```javascript
   const result = Validation.validateMessage(message);
   if (!result.valid) {
     // Handle error
     return;
   }
   ```

2. **Use normalized values**
   ```javascript
   const result = Validation.validateSchema(input, schema);
   if (result.valid) {
     // Use normalizedValue (e.g., type-coerced, case-normalized)
     const value = result.normalizedValue;
   }
   ```

3. **Track messages to prevent duplicates**
   ```javascript
   const result = Validation.validateMessage(message);
   if (result.valid) {
     Validation.trackProcessedMessage(message);
     processMessage(message);
   }
   ```

4. **Use type guards for runtime checks**
   ```javascript
   if (Validation.isPlainObject(config)) {
     // Safe to mutate
     config.newProp = 'value';
   }
   ```

5. **Format errors for users**
   ```javascript
   const result = Validation.validateSchema(data, schema);
   if (!result.valid) {
     showError(Validation.formatValidationError(result));
   }
   ```

6. **Validate storage operations**
   ```javascript
   const keyResult = Validation.validateStorageKey(key);
   const valueResult = Validation.validateStorageValue(value);

   if (keyResult.valid && valueResult.valid) {
     localStorage.setItem(key, JSON.stringify(value));
   }
   ```

## Testing

Test your validation logic:

```javascript
// Test message validation
console.assert(Validation.validateMessage("test").valid === true);
console.assert(!Validation.validateMessage("").valid);

// Test schema validation
const schema = { type: 'string', minLength: 1 };
console.assert(Validation.validateSchema("test", schema).valid === true);
console.assert(!Validation.validateSchema("", schema).valid);

// Test type guards
console.assert(Validation.isObject({}) === true);
console.assert(Validation.isArray([]) === true);
console.assert(Validation.isNonEmptyString("test") === true);
```

## Configuration

### Message Configuration

```javascript
import { Validation } from './utils/validation.js';

// Adjust message limits
Validation.MESSAGE_CONFIG.MIN_LENGTH = 1;
Validation.MESSAGE_CONFIG.MAX_LENGTH = 100000;
Validation.MESSAGE_CONFIG.MAX_HASH_CACHE_SIZE = 2000;
```

## Error Handling

```javascript
try {
  const result = Validation.validateMessage(message);
  if (!result.valid) {
    // Handle validation error
    console.error(result.error);
  }
} catch (error) {
  // Handle unexpected errors
  console.error('Validation failed:', error);
}
```

## Performance Considerations

1. **Duplicate Detection**: Uses FNV-1a hashing for O(1) lookups
2. **LRU Cache**: Automatically evicts old entries to prevent memory leaks
3. **Type Coercion**: Minimizes string-to-number conversions
4. **Batch Validation**: Validates multiple items in a single pass

## Security

1. **HTML Sanitization**: Use `sanitizeHTML()` before inserting user input into DOM
2. **URL Validation**: Restrict allowed protocols to prevent XSS
3. **Input Truncation**: Maximum limits prevent DoS attacks
4. **Pattern Validation**: Regex patterns prevent injection attacks

## Related Documentation

- [Message Lifecycle Coordinator](../js/services/message-lifecycle-coordinator.js)
- [Functions System](../js/functions/index.js)
- [Storage Layer](../js/storage/index.js)
