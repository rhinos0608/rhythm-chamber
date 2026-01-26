# Rhythm Chamber Utility Reference

This document provides a comprehensive reference for all utilities in the Rhythm Chamber application. Utilities provide common functionality used across the application, including error handling, retry logic, validation, and data processing.

## Table of Contents

- [Error Handling Utilities](#error-handling-utilities)
- [Retry & Resilience Utilities](#retry--resilience-utilities)
- [Validation Utilities](#validation-utilities)
- [Processing Utilities](#processing-utilities)
- [Utility Integration Patterns](#utility-integration-patterns)
- [Best Practices](#best-practices)

---

## Error Handling Utilities

### 1. ErrorHandlingUtils (`js/utils/error-handling.js`)
**Purpose**: Comprehensive error classification and recovery system.

**Key Features**:
- Automatic error classification (network, API, validation, user input)
- Recovery strategy selection
- User-friendly error message generation
- Error logging and tracking
- Error prevention suggestions

**Main APIs**:
```javascript
// Error Classification
ErrorHandlingUtils.classifyError(error)
// Returns: { type: 'network', severity: 'high', category: 'connectivity' }

// Error Handling
ErrorHandlingUtils.handle(error, context)
ErrorHandlingUtils.recover(error)
ErrorHandlingUtils.logError(error)

// User Messages
ErrorHandlingUtils.getUserMessage(error)
ErrorHandlingUtils.getSuggestions(error)
ErrorHandlingUtils.getErrorCode(error)

// Prevention
ErrorHandlingUtils.preventError(error)
ErrorHandlingUtils.getPreventionTips(error)
```

**Usage Example**:
```javascript
try {
  const result = await riskyOperation()
} catch (error) {
  const classified = ErrorHandlingUtils.classifyError(error)
  const userMessage = ErrorHandlingUtils.getUserMessage(error)
  const suggestions = ErrorHandlingUtils.getSuggestions(error)

  // Show user-friendly message
  showError(userMessage)

  // Apply recovery
  const recovery = await ErrorHandlingUtils.recover(error)
  if (recovery.success) {
    // Operation recovered successfully
  }
}
```

**Error Classification Types**:
- `network`: Connection issues, timeouts, unreachable hosts
- `api`: API errors, rate limiting, authentication failures
- `validation`: Input validation errors, data format issues
- `user_input`: User interaction errors, invalid operations
- `system`: System errors, memory issues, crashes
- `security`: Security violations, authentication failures
- `unknown`: Unclassified errors

---

### 2. ErrorHandler (`js/utils/error-handler.js`)
**Purpose**: Centralized error processing and logging system.

**Key Features**:
- Centralized error processing
- Error history tracking
- Error reporting and analytics
- Context-aware error handling
- Performance monitoring

**Main APIs**:
```javascript
// Error Processing
ErrorHandler.handleError(error, context)
ErrorHandler.logError(error, context)
ErrorHandler.reportError(error)

// History Management
ErrorHandler.getErrorHistory()
ErrorHandler.clearErrorHistory()
ErrorHandler.filterErrors(criteria)

// Analytics
ErrorHandler.getErrorMetrics()
ErrorHandler.getErrorPatterns()
ErrorHandler.getErrorReport()

// Context Management
ErrorHandler.setContext(context)
HandlerContext.getContext()
ErrorHandler.clearContext()
```

**Usage Example**:
```javascript
// Set context
ErrorHandler.setContext({
  userId: currentUser.id,
  sessionId: currentSession.id,
  feature: 'chat-messaging'
})

// Handle error
ErrorHandler.handleError(error, {
  action: 'send-message',
  timestamp: Date.now(),
  severity: 'high'
})

// Get error report
const report = ErrorHandler.getErrorReport({
  timeframe: '24h',
  severity: 'high',
  feature: 'chat-messaging'
})
```

---

## Retry & Resilience Utilities

### 3. RetryManager (`js/utils/retry-manager.js`)
**Purpose**: Enhanced retry patterns with adaptive strategies.

**Key Features**:
- Exponential backoff with jitter
- Maximum retry limits
- Timeout management
- Retry condition filtering
- Retry statistics tracking

**Main APIs**:
```javascript
// Retry Execution
RetryManager.execute(operation, options)
RetryManager.setMaxAttempts(max)
RetryManager.setDelayConfig(config)
RetryManager.shouldRetry(error)

// Backoff Calculation
RetryManager.calculateDelay(attempt)
RetryManager.addJitter(jitterAmount)
RetryManager.setBackoffPolicy(policy)

// Statistics
RetryManager.getRetryStats()
RetryManager.getRetryHistory()
RetryManager.reset()
```

**Configuration Options**:
```javascript
const options = {
  maxAttempts: 3,
  baseDelay: 1000, // ms
  maxDelay: 30000, // ms
  backoffMultiplier: 2,
  jitter: true,
  jitterAmount: 0.1,
  timeout: 5000,
  shouldRetry: (error) => error.type !== 'validation'
}
```

**Usage Example**:
```javascript
const result = await RetryManager.execute(async () => {
  return await apiCall()
}, {
  maxAttempts: 3,
  baseDelay: 1000,
  jitter: true,
  onAttempt: (attempt, error) => {
    console.log(`Attempt ${attempt}: ${error.message}`)
  }
})
```

---

### 4. ResilientRetry (`js/utils/resilient-retry.js`)
**Purpose**: Advanced retry patterns with circuit breaker integration.

**Key Features**:
- Circuit breaker integration
- Adaptive retry strategies
- Conditional retry logic
- Retry history tracking
- Performance optimization

**Main APIs**:
```javascript
// Retry Execution
ResilientRetry.execute(operation, options)
ResilientRetry.setCircuitBreaker(circuitBreaker)
ResilientRetry.addRetryCondition(condition)
ResilientRetry.removeRetryCondition(condition)

// History
ResilientRetry.getRetryHistory()
ResilientRetry.clearRetryHistory()
ResilientRetry.getRetryStats()

// Configuration
ResilientRetry.setConfig(config)
ResilientRetry.enableSmartRetry(enabled)
ResilientRetry.setRetryStrategy(strategy)
```

**Usage Example**:
```javascript
// Configure retry conditions
ResilientRetry.addRetryCondition({
  test: (error) => error.code === 'TIMEOUT',
  strategy: 'exponential'
})

ResilientRetry.addRetryCondition({
  test: (error) => error.code === 'RATE_LIMIT',
  strategy: 'fixed',
  delay: 1000
})

// Execute with circuit breaker
const result = await ResilientRetry.execute(async () => {
  return await apiCall()
}, {
  circuitBreaker: adaptiveCircuitBreaker,
  maxAttempts: 5
})
```

---

### 5. AdaptiveRateLimiter (`js/utils/adaptive-rate-limiter.js`)
**Purpose**: Dynamic rate limiting based on system conditions.

**Key Features**:
- Adaptive rate adjustment
- Performance-based limits
- User behavior tracking
- Burst handling
- Analytics and monitoring

**Main APIs**:
```javascript
// Rate Limiting
AdaptiveRateLimiter.limit(operation, callback)
AdaptiveRateLimiter.setConfig(config)
AdaptiveRateLimiter.getRate()
AdaptiveRateLimiter.setRate(rate)

// Dynamic Adjustment
AdaptiveRateLimiter.adjustRate(conditions)
AdaptiveRateLimiter.enableDynamicMode(enabled)
AdaptiveRateLimiter.setBurstLimit(limit)

// Monitoring
AdaptiveRateLimiter.getRateStats()
AdaptiveRateLimiter.getRequestHistory()
AdaptiveRateLimiter.optimizeRate()
```

**Configuration Options**:
```javascript
const config = {
  baseRate: 100, // requests per minute
  maxRate: 1000,
  minRate: 10,
  dynamicMode: true,
  burstLimit: 50,
  windowSize: 60000, // ms
  adjustmentFactor: 0.5
}
```

**Usage Example**:
```javascript
// Apply rate limiting
AdaptiveRateLimiter.limit(async () => {
  return await apiCall()
}, {
  operation: 'user-messages',
  priority: 'high'
}).then(result => {
  // Operation completed
}).catch(error => {
  // Rate limit exceeded
})

// Dynamic adjustment based on conditions
AdaptiveRateLimiter.adjustRate({
  systemLoad: high,
  userActivity: active,
  timeOfDay: 'peak'
})
```

---

## Validation Utilities

### 6. ValidationUtils (`js/utils/validation.js`)
**Purpose**: Advanced input validation and sanitization.

**Key Features**:
- Input validation rules
- Data sanitization
- Spam detection
- Security scanning
- Custom validation rules

**Main APIs**:
```javascript
// Validation
ValidationUtils.validate(input, rules)
ValidationUtils.sanitize(input)
ValidationUtils.checkSpam(input)
ValidationUtils.validateEmail(email)
ValidationUtils.validateUrl(url)
ValidationUtils.validatePhone(phone)

// Rule Management
ValidationUtils.addRule(name, rule)
ValidationUtils.removeRule(name)
ValidationUtils.getRules()
ValidationUtils.clearRules()

// Custom Validators
ValidationUtils.addValidator(name, validator)
ValidationUtils.removeValidator(name)
ValidationUtils.getValidators()
```

**Usage Example**:
```javascript
// Define validation rules
const rules = {
  required: true,
  minLength: 1,
  maxLength: 2000,
  pattern: /^[a-zA-Z0-9\s]*$/,
  noSpam: true
}

// Validate input
const validation = ValidationUtils.validate(input, rules)
if (validation.isValid) {
  // Input is valid
} else {
  // Show validation errors
  showError(validation.errors)
}

// Sanitize input
const sanitized = ValidationUtils.sanitize(input)
```

---

### 7. SchemaRegistry (`js/utils/schema-registry.js`)
**Purpose**: Centralized schema management and validation.

**Key Features**:
- Schema registration and management
- Validation against schemas
- Schema versioning
- Schema inheritance
- Performance optimization

**Main APIs**:
```javascript
// Schema Management
SchemaRegistry.register(schema, name)
SchemaRegistry.getSchema(name)
SchemaRegistry.validate(data, schemaName)
SchemaRegistry.removeSchema(name)
SchemaRegistry.listSchemas()

// Versioning
SchemaRegistry.getVersion(name)
SchemaRegistry.setVersion(name, version)
SchemaRegistry.getVersions(name)

// Inheritance
SchemaRegistry.extend(baseName, extension)
SchemaRegistry.getHierarchy(name)
SchemaRegistry.flatten(name)
```

**Usage Example**:
```javascript
// Register schema
const messageSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    content: { type: 'string', minLength: 1, maxLength: 2000 },
    timestamp: { type: 'number' },
    userId: { type: 'string' }
  },
  required: ['id', 'content', 'timestamp']
}

SchemaRegistry.register(messageSchema, 'message')

// Validate data
const data = { id: '123', content: 'Hello', timestamp: Date.now() }
const validation = SchemaRegistry.validate(data, 'message')
if (validation.valid) {
  // Data is valid
}
```

---

### 8. FunctionValidator (`js/utils/function-validator.js`)
**Purpose**: Runtime function validation and type checking.

**Key Features**:
- Function signature validation
- Argument type checking
- Return type validation
- Runtime type checking
- Performance monitoring

**Main APIs**:
```javascript
// Function Validation
FunctionValidator.validateFunction(fn, expectedTypes)
FunctionValidator.validateArgs(args, expectedTypes)
FunctionValidator.validateReturn(fn, expectedType)
FunctionValidator.createWrapper(fn, validator)

// Type Checking
FunctionValidator.checkType(value, type)
FunctionValidator.isType(value, type)
FunctionValidator.getType(value)

// Performance
FunctionValidator.enableValidation(enabled)
FunctionValidator.getValidationStats()
FunctionValidator.resetStats()
```

**Usage Example**:
```javascript
// Define expected types
const expectedTypes = {
  args: [{ type: 'string' }, { type: 'number' }],
  returns: { type: 'boolean' }
}

// Validate function
FunctionValidator.validateFunction(myFunction, expectedTypes)

// Create wrapper
const wrappedFunction = FunctionValidator.createWrapper(myFunction, {
  validateArgs: true,
  validateReturn: true,
  onError: (error) => console.error(error)
})

// Call wrapped function
const result = wrappedFunction('test', 42)
```

---

## Processing Utilities

### 9. StreamBuffer (`js/utils/stream-buffer.js`)
**Purpose**: Efficient stream buffering and management.

**Key Features**:
- Fixed-size circular buffer
- Thread-safe operations
- Buffer overflow protection
- Performance monitoring
- Memory management

**Main APIs**:
```javascript
// Buffer Operations
StreamBuffer.add(data)
StreamBuffer.get()
StreamBuffer.clear()
StreamBuffer.getSize()
StreamBuffer.isFull()
StreamBuffer.isEmpty()
StreamBuffer.getCapacity()

// Performance
StreamBuffer.setPerformanceMode(mode)
StreamBuffer.getBufferStats()
StreamBuffer.optimizeBuffer()

// Memory Management
StreamBuffer.setMaxSize(size)
StreamBuffer.getCurrentUsage()
StreamBuffer.getMemoryStats()
```

**Usage Example**:
```javascript
// Create buffer
const buffer = new StreamBuffer({
  maxSize: 1024 * 1024, // 1MB
  performanceMode: 'high'
})

// Add data
buffer.add(new Uint8Array(data))

// Get data
const chunk = buffer.get()
if (chunk) {
  // Process chunk
}
```

---

### 10. ParserUtils (`js/utils/parser.js`)
**Purpose**: Advanced data parsing and transformation.

**Key Features**:
- Safe JSON parsing
- XML parsing
- CSV parsing
- Data transformation
- Error handling

**Main APIs**:
```javascript
// Parsing
ParserUtils.parseJSON(data)
ParserUtils.parseXML(data)
ParserUtils.parseCSV(data)
ParserUtils.parseYAML(data)

// Transformation
ParserUtils.transform(data, transformer)
ParserUtils.sanitize(data)
ParserUtils.normalize(data)
ParserUtils.serialize(data)

// Error Handling
ParserUtils.handleError(error)
ParserUtils.getParseErrors()
ParserUtils.clearErrors()
```

**Usage Example**:
```javascript
// Parse JSON safely
try {
  const data = ParserUtils.parseJSON(jsonString)
  // Process data
} catch (error) {
  // Handle parse error
  console.error('Parse error:', error)
}

// Transform data
const transformed = ParserUtils.transform(data, {
  mapping: { oldKey: 'newKey' },
  filters: { active: true },
  sorts: { date: 'desc' }
})
```

---

### 11. FunctionExecutor (`js/utils/function-executor.js`)
**Purpose**: Safe function execution with timeout and error handling.

**Key Features**:
- Function timeout management
- Error handling
- Execution context
- Performance monitoring
- Execution limits

**Main APIs**:
```javascript
// Execution
FunctionExecutor.execute(fn, args, options)
FunctionExecutor.executeAsync(fn, args, options)
FunctionExecutor.setTimeout(fn, timeout)
FunctionExecutor.wrap(fn, wrapper)

// Context Management
FunctionExecutor.setContext(context)
FunctionExecutor.getContext()
FunctionExecutor.clearContext()

// Performance
FunctionExecutor.getExecutionStats()
FunctionExecutor.setExecutionLimits(limits)
FunctionExecutor.getExecutionHistory()
```

**Usage Example**```javascript
// Execute with timeout
const result = await FunctionExecutor.executeAsync(async () => {
  return await longRunningOperation()
}, [], {
  timeout: 5000, // 5 seconds
  context: { userId: '123' },
  onTimeout: () => handleTimeout()
})

// Wrap function with error handling
const safeFunction = FunctionExecutor.wrap(riskyFunction, {
  onError: (error) => handle error,
  timeout: 3000,
  retries: 2
})
```

---

### 12. SemanticExecutors (`js/utils/semantic-executors.js`)
**Purpose**: Specialized semantic query execution.

**Key Features**:
- Semantic search
- Text classification
- Sentiment analysis
- Entity extraction
- Query optimization

**Main APIs**:
```javascript
// Semantic Operations
SemanticExecutors.executeQuery(query, context)
SemanticExecutors.search(text, options)
SemanticExecutors.analyzeSentiment(text)
SemanticExecutors.extractEntities(text)
SemanticExecutors.classifyText(text)

// Configuration
SemanticExecutors.setModel(model)
SemanticExecutors.setLanguage(language)
SemanticExecutors.setOptions(options)

// Performance
SemanticExecutors.getPerformanceMetrics()
SemanticExecutors.optimizeQuery(query)
SemanticExecutors.getCacheStats()
```

**Usage Example**:
```javascript
// Execute semantic query
const result = await SemanticExecutors.executeQuery(
  'What was I listening to during my breakup?',
  {
    userId: '123',
    timeframe: '2023',
    context: 'personal'
  }
)

// Analyze sentiment
const sentiment = SemanticExecutors.analyzeSentiment(text)
// Returns: { score: 0.8, label: 'positive', confidence: 0.95 }

// Extract entities
const entities = SemanticExecutors.extractEntities(text)
// Returns: [{ text: 'The Beatles', type: 'artist' }, ...]
```

---

### 13. Additional Utilities

#### Logger (`js/utils/logger.js`)
**Purpose**: Structured logging with different levels and outputs.

**Main APIs**:
```javascript
Logger.debug(message, data)
Logger.info(message, data)
Logger.warn(message, data)
Logger.error(message, data)
Logger.setLogLevel(level)
Logger.addOutput(target)
```

#### Cache (`js/utils/cache.js`)
**Purpose**: In-memory caching with TTL and size limits.

**Main APIs**:
```javascript
Cache.set(key, value, ttl)
Cache.get(key)
Cache.delete(key)
Cache.clear()
Cache.getStats()
```

#### CryptoUtils (`js/utils/crypto.js`)
**Purpose**: Cryptographic utilities for data security.

**Main APIs**:
```javascript
CryptoUtils.hash(data, algorithm)
CryptoUtils.encrypt(data, key)
CryptoUtils.decrypt(data, key)
CryptoUtils.generateSalt()
CryptoUtils.verifyHash(data, hash)
```

---

## Utility Integration Patterns

### Error Handling Pattern
```javascript
// Consistent error handling across utilities
const operation = async () => {
  try {
    const result = await riskyOperation()
    return result
  } catch (error) {
    ErrorHandlingUtils.handle(error, { context: 'operation' })
    ErrorHandler.logError(error)
    throw error
  }
}
```

### Retry Pattern
```javascript
// Retry with exponential backoff
const result = await RetryManager.execute(async () => {
  return await apiCall()
}, {
  maxAttempts: 3,
  baseDelay: 1000,
  shouldRetry: (error) => error.code !== 'INVALID_INPUT'
})
```

### Validation Pattern
```javascript
// Input validation with sanitization
const sanitizedInput = ValidationUtils.sanitize(input)
const validation = ValidationUtils.validate(sanitizedInput, rules)

if (!validation.isValid) {
  throw new Error(validation.errors.join(', '))
}
```

### Performance Pattern
```javascript
// Performance monitoring
const start = performance.now()
try {
  const result = await expensiveOperation()
  const duration = performance.now() - start
  PerformanceUtils.record(duration, 'operation')
  return result
} catch (error) {
  PerformanceUtils.recordError(error, 'operation')
  throw error
}
```

---

## Best Practices

### 1. Error Handling
- **Consistent Error Handling**: Use ErrorHandlingUtils for all errors
- **User-Friendly Messages**: Convert technical errors to user-friendly messages
- **Error Recovery**: Implement recovery mechanisms where possible
- **Error Tracking**: Log errors for debugging and analytics

### 2. Retry Logic
- **Exponential Backoff**: Use exponential backoff with jitter
- **Circuit Breaker**: Integrate with circuit breaker for resilience
- **Retry Conditions**: Define clear retry conditions
- **Retry Limits**: Set reasonable retry limits

### 3. Validation
- **Input Sanitization**: Always sanitize user input
- **Schema Validation**: Use schemas for complex data validation
- **Rule Management**: Maintain validation rules centrally
- **Performance**: Use efficient validation algorithms

### 4. Performance Optimization
- **Caching**: Cache expensive operations
- **Lazy Loading**: Load resources on demand
- **Memory Management**: Monitor and manage memory usage
- **Performance Monitoring**: Track and optimize performance

### 5. Security
- **Input Validation**: Validate and sanitize all user input
- **Output Encoding**: Encode output to prevent XSS
- **Rate Limiting**: Implement rate limiting to prevent abuse
- **Error Messages**: Avoid exposing sensitive information in error messages

### 6. Code Organization
- **Modularity**: Keep utilities focused and modular
- **Reusability**: Design utilities for reuse across the application
- **Testing**: Test utilities thoroughly with various scenarios
- **Documentation**: Document APIs and usage examples

### 7. Configuration Management
- **Centralized Configuration**: Manage configuration centrally
- **Environment-Specific Config**: Support different environments
- **Validation**: Validate configuration at startup
- **Documentation**: Document configuration options

---

**Last Updated:** 2026-01-26
**Version:** v2.0
**Utility Count:** 13+ Utilities