# Rhythm Chamber Service Catalog

This document provides a comprehensive catalog of all services in the Rhythm Chamber application. Services are the backbone of the application, handling core business logic, external API interactions, and data processing.

## Table of Contents

- [Core Services](#core-services)
- [Enhanced Services](#enhanced-services)
- [Infrastructure Services](#infrastructure-services)
- [Integration Patterns](#integration-patterns)
- [Service Dependencies](#service-dependencies)
- [Best Practices](#best-practices)

---

## Core Services

### 1. SessionManager (`js/services/session-manager.js`)
**Purpose**: Manages session lifecycle, persistence, and recovery across the application.

**Key Responsibilities**:
- Session creation and management
- Session persistence to IndexedDB
- Session recovery after page refresh
- Session archiving and cleanup
- Cross-tab session coordination

**Main APIs**:
```javascript
// Session Lifecycle
SessionManager.createSession(config)
SessionManager.loadSession(id)
SessionManager.saveSession(session)
SessionManager.deleteSession(id)

// Session Management
SessionManager.archiveSession(id)
SessionManager.getSessionCount()
SessionManager.getSessionHistory()

// Cross-tab Coordination
SessionManager.broadcastSessionState(session)
SessionManager.onSessionUpdate(callback)
```

**Dependencies**: EventBus, Storage, AppState

---

### 2. MessageOperations (`js/services/message-operations.js`)
**Purpose**: Handles all message-related operations including regeneration, deletion, editing, and context querying.

**Key Responsibilities**:
- Message lifecycle management
- Message content editing and regeneration
- Message context querying
- Message history management
- Message metadata tracking

**Main APIs**:
```javascript
// Message Operations
MessageOperations.regenerateMessage(id, options)
MessageOperations.editMessage(id, newContent)
MessageOperations.deleteMessage(id)
MessageOperations.queryContext(message)

// Message Management
MessageOperations.getMessageHistory()
MessageOperations.getMessageMetrics()
MessageOperations.searchMessages(query)
```

**Dependencies**: EventBus, MessageValidator, LLMApiOrchestrator

---

### 3. TabCoordinator (`js/services/tab-coordination.js`)
**Purpose**: Coordinates state and session sharing across browser tabs for seamless multi-tab experience.

**Key Responsibilities**:
- Primary/secondary tab designation
- State broadcasting and synchronization
- Session sharing across tabs
- Conflict resolution for concurrent edits
- Tab health monitoring

**Main APIs**:
```javascript
// Tab Management
TabCoordinator.broadcastState(state)
TabCoordinator.onStateUpdate(callback)
TabCoordinator.getCurrentTabId()
TabCoordinator.isPrimaryTab()

// Session Coordination
TabCoordinator.requestSessionSync()
TabCoordinator.shareSession(session)
TabCoordinator.resolveConflicts(states)
```

**Dependencies**: EventBus, Storage, SessionManager

---

### 4. TokenCountingService (`js/services/token-counting-service.js`)
**Purpose**: Manages token counting, context window optimization, and cost tracking for LLM interactions.

**Key Responsibilities**:
- Token counting and estimation
- Context window management
- Cost tracking and optimization
- Context compression and summarization
- Token budget management

**Main APIs**:
```javascript
// Token Management
TokenCountingService.countTokens(text)
TokenCountingService.getContextWindow(model)
TokenCountingService.fitToContext(messages, model)

// Cost Management
TokenCountingService.getTokenUsage()
TokenCountingService.getEstimatedCost(messages)
TokenCountingService.optimizeContext(messages)
```

**Dependencies**: ProviderInterface, AppState

---

### 5. ToolCallHandlingService (`js/services/tool-call-handling-service.js`)
**Purpose**: Manages LLM tool calls with strategy voting and conflict resolution.

**Key Responsibilities**:
- Tool call execution
- Strategy voting for multiple tools
- Tool call validation
- Tool call optimization
- Tool call error handling

**Main APIs**:
```javascript
// Tool Call Execution
ToolCallHandlingService.executeTool(tool, args)
ToolCallHandlingService.executeTools(tools, context)
ToolCallHandlingService.validateToolCall(tool, args)

// Strategy Management
ToolCallHandlingService.setStrategy(strategy)
ToolCallHandlingService.getToolResults()
ToolCallHandlingService.resolveConflicts(results)
```

**Dependencies**: LLMApiOrchestrator, MessageValidator

---

### 6. LLMProviderRoutingService (`js/services/llm-provider-routing-service.js`)
**Purpose**: Manages LLM provider configuration and routing with load balancing.

**Key Responsibilities**:
- Provider configuration management
- Request routing to appropriate provider
- Load balancing across providers
- Provider fallback logic
- Provider health monitoring

**Main APIs**:
```javascript
// Provider Management
LLMProviderRoutingService.setProvider(provider)
LLMProviderRoutingService.getProviderStatus()
LLMProviderRoutingService.addProvider(provider)

// Request Routing
LLMProviderRoutingService.routeRequest(messages, tools)
LLMProviderRoutingService.loadBalanceRequest(messages)
LLMProviderRoutingService.fallbackRequest(request)
```

**Dependencies**: ProviderInterface, AdaptiveCircuitBreaker

---

### 7. FallbackResponseService (`js/services/fallback-response-service.js`)
**Purpose**: Generates fallback responses when LLM services are unavailable.

**Key Responsibilities**:
- Static response generation
- Local model fallback
- Error response formatting
- User guidance for failures
- Response caching

**Main APIs**:
```javascript
// Fallback Generation
FallbackResponseService.generateStaticResponse(context)
FallbackResponseService.generateFallback(messages)
FallbackResponseService.getUserGuidance(error)

// Response Management
FallbackResponseService.cacheResponse(response)
FallbackResponseService.getFallbackStrategy()
FallbackResponseService.formatResponse(response)
```

**Dependencies**: AppState, ProviderInterface

---

### 8. StateMachineCoordinator (`js/services/state-machine-coordinator.js`)
**Purpose**: Manages complex state transitions and workflows across the application.

**Key Responsibilities**:
- State machine definition and management
- State transition validation
- Workflow orchestration
- State event handling
- State persistence

**Main APIs**:
```javascript
// State Management
StateMachineCoordinator.transition(currentState, event)
StateMachineCoordinator.getCurrentState()
StateMachineCoordinator.getAvailableTransitions()

// Workflow Management
StateMachineCoordinator.addState(state, transitions)
StateMachineCoordinator.createWorkflow(states)
StateMachineCoordinator.executeWorkflow(workflow)
```

**Dependencies**: EventBus, AppState

---

### 9. LockPolicyCoordinator (`js/services/lock-policy-coordinator.js`)
**Purpose**: Manages operation conflict resolution with lock policies.

**Key Responsibilities**:
- Operation conflict matrix
- Lock acquisition and release
- Conflict resolution strategies
- Deadlock prevention
- Lock policy enforcement

**Main APIs**:
```javascript
// Lock Management
LockPolicyCoordinator.acquireLock(operation, resourceId)
LockPolicyCoordinator.releaseLock(lockId)
LockPolicyCoordinator.checkConflicts(operation, resource)

// Policy Management
LockPolicyCoordinator.setPolicy(policy)
LockPolicyCoordinator.getConflicts(operation)
LockPolicyCoordinator.resolveConflict(conflict)
```

**Dependencies**: EventBus, OperationLock

---

### 10. TimeoutBudgetManager (`js/services/timeout-budget-manager.js`)
**Purpose**: Manages hierarchical timeout allocation for operations.

**Key Responsibilities**:
- Timeout budget allocation
- Hierarchical timeout management
- Timeout enforcement
- Timeout monitoring
- Timeout recovery

**Main APIs**:
```javascript
// Timeout Management
TimeoutBudgetManager.allocateTimeout(operation, budget)
TimeoutBudgetManager.enforceTimeout(operation)
TimeoutBudgetManager.getTimeoutBudget(operation)
TimeoutBudgetManager.adjustTimeout(operation, adjustment)

// Budget Management
TimeoutBudgetManager.getTotalBudget()
TimeoutBudgetManager.allocateChildTimeout(parent, child, budget)
TimeoutBudgetManager.monitorTimeouts()
```

**Dependencies**: OperationQueue, AppState

---

### 11. TurnQueue (`js/services/turn-queue.js`)
**Purpose**: Manages message serialization and turn-based processing.

**Key Responsibilities**:
- Message queuing and serialization
- Turn management
- Message ordering
- Queue prioritization
- Queue cleanup

**Main APIs**:
```javascript
// Queue Management
TurnQueue.enqueue(message, priority)
TurnQueue.dequeue()
TurnQueue.peek()
TurnQueue.clear()

// Turn Management
TurnQueue.getCurrentTurn()
TurnQueue.nextTurn()
TurnQueue.skipTurn()
TurnQueue.getQueueStatus()
```

**Dependencies**: EventBus, SessionManager

---

### 12. EventBus (`js/services/event-bus.js`)
**Purpose**: Centralized typed event system for application communication.

**Key Responsibilities**:
- Event subscription and emission
- Event type validation
- Event priority handling
- Event filtering
- Event debugging

**Main APIs**:
```javascript
// Event Management
EventBus.on(eventType, handler, options)
EventBus.emit(eventType, payload, options)
EventBus.off(eventType, handlerId)
EventBus.once(eventType, handler, options)

// Debug & Monitoring
EventBus.setDebugMode(enabled)
EventBus.getTrace(limit)
EventBus.getRegisteredEvents()
```

**Dependencies**: AppState

---

### 13. PatternStream (`js/services/pattern-stream.js`)
**Purpose**: Incremental pattern display and streaming for user feedback.

**Key Responsibilities**:
- Pattern streaming display
- Incremental UI updates
- Progress tracking
- Pattern categorization
- Streaming optimization

**Main APIs**:
```javascript
// Pattern Streaming
PatternStream.startPatternStream(patterns)
PatternStream.updatePattern(pattern)
PatternStream.completePattern()
PatternStream.cancelPattern()

// Progress Tracking
PatternStream.getProgress()
PatternStream.setSpeed(speed)
PatternStream.pause()
PatternStream.resume()
```

**Dependencies**: EventBus, AppState

---

### 14. ProfileSharing (`js/services/profile-sharing.js`)
**Purpose**: Encrypted profile export and import functionality.

**Key Responsibilities**:
- Profile encryption
- Profile export/import
- Profile validation
- Profile sharing
- Profile storage

**Main APIs**:
```javascript
// Profile Management
ProfileSharing.exportProfile(profile)
ProfileSharing.importProfile(encryptedProfile)
ProfileSharing.validateProfile(profile)
ProfileSharing.shareProfile(profile, options)

// Encryption
ProfileSharing.encryptProfile(profile)
ProfileSharing.decryptProfile(encryptedProfile)
ProfileSharing.generateSharingKey()
```

**Dependencies**: Security, Storage

---

### 15. PatternComparison (`js/services/pattern-comparison.js`)
**Purpose**: Collaborative analysis engine for pattern comparison.

**Key Responsibilities**:
- Pattern comparison analysis
- Similarity scoring
- Pattern categorization
- Comparison result formatting
- Collaborative features

**Main APIs**:
```javascript
// Pattern Analysis
PatternComparison.comparePatterns(pattern1, pattern2)
PatternComparison.calculateSimilarity(pattern1, pattern2)
PatternComparison.categorizePattern(pattern)

// Collaboration
PatternComparison.shareComparison(result)
PatternComparison.getComparisons(userId)
PatternComparison.analyzeTrends(comparisons)
```

**Dependencies**: AppState, EventBus

---

### 16. TemporalAnalysis (`js/services/temporal-analysis.js`)
**Purpose**: 5-year trend visualization and temporal pattern analysis.

**Key Responsibilities**:
- Temporal pattern analysis
- Trend visualization
- Time-series data processing
- Historical pattern detection
- Forecast generation

**Main APIs**:
```javascript
// Temporal Analysis
TemporalAnalysis.analyzeTemporalPatterns(streams)
TemporalAnalysis.calculateTrends(data, period)
TemporalAnalysis.detectSeasonalPatterns(data)
TemporalAnalysis.forecastFuture(data, periods)

// Visualization
TemporalAnalysis.getChartData(data, options)
TemporalAnalysis.getTimeSeriesData(userId)
TemporalAnalysis.getAnalysisSummary()
```

**Dependencies**: EventBus, AppState

---

### 17. PlaylistGenerator (`js/services/playlist-generator.js`)
**Purpose**: AI-powered playlist creation and recommendation.

**Key Responsibilities**:
- Playlist generation
- Music recommendation
- Playlist optimization
- Personalization
- Playlist sharing

**Main APIs**:
```javascript
// Playlist Generation
PlaylistGenerator.generatePlaylist(criteria)
PlaylistGenerator.recommendTracks(criteria)
PlaylistGenerator.optimizePlaylist(playlist)
PlaylistGenerator.personalizePlaylist(playlist, user)

// Recommendation
PlaylistGenerator.getRecommendations(userId)
PlaylistGenerator.analyzePlaylist(playlist)
PlaylistGenerator.similarPlaylists(playlist)
```

**Dependencies**: LLMApiOrchestrator, AppState

---

## Enhanced Services

### 18. LLMApiOrchestrator (`js/services/llm-api-orchestrator.js`)
**Purpose**: Advanced LLM request routing with load balancing and health monitoring.

**Key Responsibilities**:
- Advanced request routing
- Load balancing across providers
- Health monitoring
- Performance optimization
- Request prioritization

**Main APIs**:
```javascript
// Request Management
LLMApiOrchestrator.request(messages, tools, options)
LLMApiOrchestrator.setProvider(provider)
LLMApiOrchestrator.getHealthStatus()

// Load Balancing
LLMApiOrchestrator.balanceLoad(providers)
LLMApiOrchestrator.weightProviders(weights)
LLMApiOrchestrator.optimizeRouting()

// Monitoring
LLMApiOrchestrator.getPerformanceMetrics()
LLMApiOrchestrator.recordRequestStats(request)
```

**Dependencies**: ProviderInterface, AdaptiveCircuitBreaker, RetryManager

---

### 19. MessageErrorHandler (`js/services/message-error-handler.js`)
**Purpose**: Intelligent error classification and recovery for API calls.

**Key Responsibilities**:
- Error classification and categorization
- Recovery strategy selection
- Error logging and tracking
- User-friendly error messages
- Error prevention strategies

**Main APIs**:
```javascript
// Error Handling
MessageErrorHandler.handleError(error, context)
MessageErrorHandler.classifyError(error)
MessageErrorHandler.recoverFromError(error)

// Recovery
MessageErrorHandler.getRecoverySuggestions(error)
MessageErrorHandler.applyRecovery(error, strategy)
MessageErrorHandler.preventError(error)

// Monitoring
MessageErrorHandler.getErrorMetrics()
MessageErrorHandler.getErrorHistory()
```

**Dependencies**: EventBus, AppState, AdaptiveCircuitBreaker

---

### 20. MessageValidator (`js/services/message-validator.js`)
**Purpose**: Advanced message validation and sanitization.

**Key Responsibilities**:
- Message validation
- Content sanitization
- Spam detection
- Security scanning
- Compliance checking

**Main APIs**:
```javascript
// Validation
MessageValidator.validateMessage(message)
MessageValidator.sanitizeMessage(message)
MessageValidator.checkSpam(message)

// Security
MessageValidator.scanContent(message)
MessageValidator.checkCompliance(message)
MessageValidator.validateInput(input)

// Configuration
MessageValidator.setValidationRules(rules)
MessageValidator.addValidator(validator)
MessageValidator.getValidationReport()
```

**Dependencies**: Security, SchemaRegistry

---

### 21. StreamProcessor (`js/services/stream-parser.js`)
**Purpose**: Real-time stream processing and parsing.

**Key Responsibilities**:
- Stream parsing and processing
- Real-time data handling
- Stream buffering
- Stream error handling
- Stream optimization

**Main APIs**:
```javascript
// Stream Processing
StreamProcessor.processStream(stream)
StreamParser.parseToken(token)
StreamParser.handleError(error)

// Buffering
StreamProcessor.setBufferSize(size)
StreamProcessor.getBufferStatus()
StreamProcessor.adjustBufferSpeed()

// Error Handling
StreamProcessor.recoverFromError(error)
StreamProcessor.setRetryPolicy(policy)
StreamProcessor.getStreamStats()
```

**Dependencies**: StreamBuffer, RetryManager

---

### 22. AdaptiveCircuitBreaker (`js/services/adaptive-circuit-breaker.js`)
**Purpose**: Intelligent circuit breaker with adaptive thresholds.

**Key Responsibilities**:
- Circuit state management
- Adaptive threshold calculation
- Success/failure tracking
- Automatic recovery
- Performance monitoring

**Main APIs**:
```javascript
// Circuit Management
AdaptiveCircuitBreaker.call(operation, callback)
AdaptiveCircuitBreaker.getState(operation)
AdaptiveCircuitBreaker.recordSuccess(operation)
AdaptiveCircuitBreaker.recordFailure(operation)

// Configuration
AdaptiveCircuitBreaker.configure(config)
AdaptiveCircuitBreaker.setThresholds(thresholds)
AdaptiveCircuitBreaker.calculateAdaptiveThreshold()

// Monitoring
AdaptiveCircuitBreaker.getHealthStatus()
AdaptiveCircuitBreaker.getMetrics()
AdaptiveCircuitBreaker.reset(operation)
```

**Dependencies**: EventBus, AppState

---

### 23. RetryManager (`js/services/retry-manager.js`)
**Purpose**: Sophisticated retry with exponential backoff and circuit breaker integration.

**Key Responsibilities**:
- Retry policy management
- Exponential backoff calculation
- Circuit breaker integration
- Retry state tracking
- Performance optimization

**Main APIs**:
```javascript
// Retry Execution
RetryManager.execute(operation, options)
RetryManager.setConfig(config)
RetryManager.getRetryCount(operation)

// Backoff Calculation
RetryManager.calculateDelay(attempt)
RetryManager.setBackoffPolicy(policy)
RetryManager.addJitter(jitterAmount)

// Integration
RetryManager.setCircuitBreaker(circuitBreaker)
RetryManager.shouldRetry(error)
RetryManager.getRetryStats()
```

**Dependencies**: AdaptiveCircuitBreaker, EventBus

---

### 24. RateLimiter (`js/services/rate-limiter.js`)
**Purpose**: Adaptive rate limiting with dynamic adjustment.

**Key Responsibilities**:
- Rate limit management
- Dynamic rate adjustment
- Request throttling
- Performance monitoring
- User experience optimization

**Main APIs**:
```javascript
// Rate Limiting
RateLimiter.limit(operation, callback)
RateLimiter.setConfig(config)
RateLimiter.getRate()

// Dynamic Adjustment
RateLimiter.adjustRate(conditions)
RateLimiter.setDynamicMode(enabled)
RateLimiter.getCurrentRate()

// Monitoring
RateLimiter.getRateStats()
RateLimiter.getRequestHistory()
RateLimiter.optimizeRate()
```

**Dependencies**: EventBus, AppState

---

### 25. SecurityService (`js/services/security-service.js`)
**Purpose**: Enhanced security monitoring and protection.

**Key Responsibilities**:
- Security threat detection
- Anomaly detection
- Security event logging
- Protection mechanisms
- Security compliance

**Main APIs**:
```javascript
// Security Monitoring
SecurityService.monitorActivity(activity)
SecurityService.detectThreats(data)
SecurityService.analyzePatterns(patterns)

// Protection
SecurityService.applyProtection(measures)
SecurityService.validateSecurity(event)
SecurityService.enforcePolicy(policy)

// Compliance
SecurityService.checkCompliance()
SecurityService.generateSecurityReport()
SecurityService.updateSecurityMeasures()
```

**Dependencies**: Security, EventBus

---

## Infrastructure Services

### 26. ProviderHealthMonitor (`js/services/provider-health-monitor.js`)
**Purpose**: Real-time health tracking for AI providers with 2-second update intervals.

**Key Responsibilities**:
- Provider health monitoring
- Success/failure tracking
- Performance metrics
- Health status reporting
- Provider recommendations

**Main APIs**:
```javascript
// Health Monitoring
ProviderHealthMonitor.startMonitoring()
ProviderHealthMonitor.stopMonitoring()
ProviderHealthMonitor.getHealthStatus()

// Metrics
ProviderHealthMonitor.getPerformanceMetrics()
ProviderHealthMonitor.recordRequest(provider, success, latency)
ProviderHealthMonitor.getHealthHistory()

// Recommendations
ProviderHealthMonitor.getRecommendations()
ProviderHealthMonitor.shouldSwitchProvider(provider)
```

**Dependencies**: EventBus, ProviderInterface

---

### 27. ProviderNotificationService (`js/services/provider-notification-service.js`)
**Purpose**: User-friendly notifications with actionable guidance.

**Key Responsibilities**:
- Provider change notifications
- Error guidance
- Recovery suggestions
- User actions
- Notification history

**Main APIs**:
```javascript
// Notifications
ProviderNotificationService.notify(type, message)
ProviderNotificationService.showProviderChange(from, to)
ProviderNotificationService.showError(error, suggestion)

// Actions
ProviderNotificationService.addAction(action)
ProviderNotificationService.handleUserAction(action)
ProviderNotificationService.updateUI(action)

// History
ProviderNotificationService.getHistory()
ProviderNotificationService.clearHistory()
```

**Dependencies**: EventBus, UI Controllers

---

## Integration Patterns

### Service Communication Services use a consistent pattern for communication:

1. **Event-Driven**: Services communicate via EventBus
2. **State-Driven**: Services interact through AppState
3. **Direct API**: Services expose APIs for direct calls

### Error Handling Pattern
```javascript
// Services use enhanced error handling
service.operation(data)
  .then(result => EventBus.emit('operation:success', result))
  .catch(error => MessageErrorHandler.handleError(error, context))
  .finally(() => EventBus.emit('operation:complete'))
```

### Retry Pattern
```javascript
// Services use retry with circuit breaker
RetryManager.execute(() => {
  return service.operation(data)
}, {
  maxAttempts: 3,
  delay: 'exponential',
  shouldRetry: (error) => error.type === 'network'
})
```

### State Management Pattern
```javascript
// Services update state through AppState
AppState.update('service:domain', {
  status: 'processing',
  data: result,
  error: null
})
```

---

## Service Dependencies

### Core Dependencies
- **EventBus**: All services for event communication
- **AppState**: State management
- **Storage**: Data persistence

### Service Hierarchy
```
Infrastructure Services
├── ProviderHealthMonitor
├── ProviderNotificationService
│
Core Services (17 services)
├── SessionManager
├── MessageOperations
├── TabCoordinator
├── ... (other core services)
│
Enhanced Services (8 services)
├── LLMApiOrchestrator
├── MessageErrorHandler
├── MessageValidator
├── ... (other enhanced services)
```

### Cross-Service Communication
- Services don't directly reference each other
- Communication happens through EventBus
- State changes propagate through AppState

---

## Best Practices

### 1. Service Design
- **Single Responsibility**: Each service has one clear purpose
- **Loose Coupling**: Services communicate through interfaces
- **High Cohesion**: Related functionality grouped together

### 2. Error Handling
- **Error Classification**: Use MessageErrorHandler for all errors
- **Graceful Degradation**: Provide fallback functionality
- **User-Friendly Messages**: Convert technical errors to user-friendly messages

### 3. Performance
- **Lazy Loading**: Services load on demand
- **Caching**: Implement caching for expensive operations
- **Optimization**: Use optimization strategies for common operations

### 4. Testing
- **Unit Testing**: Test each service in isolation
- **Integration Testing**: Test service interactions
- **E2E Testing**: Test complete workflows

### 5. Monitoring
- **Health Checks**: Implement health check endpoints
- **Metrics**: Track performance metrics
- **Logging**: Log important events and errors

---

**Last Updated:** 2026-01-26
**Version:** v2.0
**Service Count:** 27 Services