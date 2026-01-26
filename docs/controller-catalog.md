# Rhythm Chamber Controller Catalog

This document provides a comprehensive catalog of all controllers in the Rhythm Chamber application. Controllers manage UI logic, user interactions, and coordinate between the frontend and backend services.

## Table of Contents

- [Core Controllers](#core-controllers)
- [Advanced Controllers](#advanced-controllers)
- [Controller Integration Patterns](#controller-integration-patterns)
- [Controller Dependencies](#controller-dependencies)
- [Best Practices](#best-practices)

---

## Core Controllers

### 1. ChatUIController (`js/controllers/chat-ui-controller.js`)
**Purpose**: Manages chat interface, message rendering, and streaming responses.

**Key Responsibilities**:
- Chat interface management
- Message rendering with markdown support
- Streaming response handling
- Chat state management
- User interaction handling

**Main APIs**:
```javascript
// Chat Management
ChatUIController.renderMessage(message, container)
ChatUIController.startStreaming(messages, onUpdate)
ChatUIController.stopStreaming()
ChatUIController.clearChat()
ChatUIController.scrollToBottom()
ChatUIController.setTypingIndicator(isTyping)

// Message Handling
ChatUIController.updateMessage(id, updates)
ChatUIController.deleteMessage(id)
ChatUIController.focusInput()
ChatUIController.getInputText()

// UI State
ChatUIController.setLoading(loading)
ChatUIController.setError(error)
ChatUIController.setDisabled(disabled)
```

**Dependencies**: EventBus, MessageRenderer, AppState

**Usage Example**:
```javascript
// Start streaming response
ChatUIController.startStreaming(messages, {
  onToken: (token) => renderToken(token),
  onComplete: () => showCompletion(),
  onError: (error) => showError(error)
})
```

---

### 2. SidebarController (`js/controllers/sidebar-controller.js`)
**Purpose**: Manages session list and navigation.

**Key Responsibilities**:
- Session list management
- Session navigation
- Session search and filtering
- Session persistence
- UI state management

**Main APIs**:
```javascript
// Session Management
SidebarController.addSession(session)
SidebarController.loadSession(id)
SidebarController.deleteSession(id)
SidebarController.updateSession(id, updates)
SidebarController.getSessions()
SidebarController.setCurrentSession(id)

// Search & Filter
SidebarController.searchSessions(query)
SidebarController.filterSessions(filter)
SidebarController.sortSessions(sortBy)

// UI State
SidebarController.setLoading(loading)
SidebarController.setError(error)
SidebarController.updateSessionCount(count)
```

**Dependencies**: EventBus, SessionManager, AppState

**Usage Example**:
```javascript
// Load session
SidebarController.loadSession(sessionId)
  .then(session => {
    // Update session list
    SidebarController.updateSession(sessionId, {
      lastUpdated: new Date(),
      unread: false
    })
  })
```

---

### 3. ViewController (`js/controllers/view-controller.js`)
**Purpose**: Handles view transitions and state management.

**Key Responsibilities**:
- View switching and transitions
- Navigation state management
- View history tracking
- Navigation controls
- View preloading

**Main APIs**:
```javascript
// View Management
ViewController.switchView(viewName)
ViewController.getCurrentView()
ViewController.getViewHistory()
ViewController.canGoBack()
ViewController.goBack()
ViewController.goForward()

// Navigation
ViewController.pushView(viewName, state)
ViewController.popView()
ViewController.replaceView(viewName, state)
ViewController.resetView()

// State Management
ViewController.setViewState(view, state)
ViewController.getViewState(view)
ViewController.clearViewState(view)
```

**Dependencies**: EventBus, AppState

**Usage Example**:
```javascript
// Switch to chat view
ViewController.switchView('chat', {
  sessionId: currentSessionId,
  focus: true
})
```

---

### 4. FileUploadController (`js/controllers/file-upload-controller.js`)
**Purpose**: Handles file upload and processing with race condition fixes.

**Key Responsibilities**:
- File upload management
- File validation
- Processing coordination
- Progress tracking
- Error handling

**Main APIs**:
```javascript
// Upload Management
FileUploadController.uploadFile(file, options)
FileUploadController.pauseUpload(id)
FileUploadController.resumeUpload(id)
FileUploadController.cancelUpload(id)
FileUploadController.getUploadProgress(id)

// File Validation
FileUploadController.validateFile(file)
FileUploadController.checkFileFormat(file)
FileUploadController.checkFileSize(file, maxSize)

// Processing
FileUploadController.startProcessing(file, options)
FileUploadController.getProcessingStatus(id)
FileUploadController.abortProcessing(id)
```

**Dependencies**: EventBus, AppState, FileValidator

**Usage Example**:
```javascript
// Upload and process file
FileUploadController.uploadFile(file, {
  onProgress: (progress) => updateProgress(progress),
  onComplete: (result) => processResult(result),
  onError: (error) => showError(error)
})
```

---

### 5. SpotifyController (`js/controllers/spotify-controller.js`)
**Purpose**: Manages Spotify OAuth flow and data fetching.

**Key Responsibilities**:
- Spotify OAuth integration
- Data fetching and validation
- Token management
- User authentication
- Data processing

**Main APIs**:
```javascript
// Authentication
SpotifyController.startOAuth()
SpotifyController.completeOAuth(code)
SpotifyController.refreshToken()
SpotifyController.logout()
SpotifyController.getAuthStatus()

// Data Fetching
SpotifyController.fetchUserData(options)
SpotifyController.fetchStreamingHistory(options)
SpotifyController.fetchTopArtists(options)
SpotifyController.fetchTopTracks(options)

// Validation
SpotifyController.validateData(data)
SpotifyController.processStreamingHistory(data)
SpotifyController.cleanUserData(data)
```

**Dependencies**: EventBus, AppState, OAuthManager

**Usage Example**:
```javascript
// Start OAuth flow
SpotifyController.startOAuth()
  .then(auth => {
    // Fetch user data
    return SpotifyController.fetchUserData({
      timeframe: 'long_term',
      limit: 50
    })
  })
  .then(data => processData(data))
```

---

### 6. DemoController (`js/controllers/demo-controller.js`)
**Purpose**: Manages demo mode with sample persona.

**Key Responsibilities**:
- Demo mode activation
- Sample data management
- Demo state tracking
- Demo transitions
- User guidance

**Main APIs**:
```javascript
// Demo Management
DemoController.activateDemo()
DemoController.deactivateDemo()
DemoController.getDemoStatus()
DemoController.resetDemo()

// Sample Data
DemoController.loadSamplePersona()
DemoController.loadSampleStreaming()
DemoController.loadSamplePatterns()
DemoController.generateCustomDemo()

// State Management
DemoController.setDemoState(state)
DemoController.getDemoState()
DemoController.clearDemoData()
```

**Dependencies**: EventBus, AppState, SampleData

**Usage Example**:
```javascript
// Activate demo mode
DemoController.activateDemo({
  persona: 'music-enthusiast',
  streamingHistory: 'recent',
  onReady: () => showDemoInterface()
})
```

---

### 7. ResetController (`js/controllers/reset-controller.js`)
**Purpose**: Handles reset operations with confirmation and cleanup.

**Key Responsibilities**:
- Data reset management
- Confirmation handling
- Cleanup coordination
- State reset
- User feedback

**Main APIs**:
```javascript
// Reset Operations
ResetController.resetData(options)
ResetController.resetSession(sessionId)
ResetController.resetAllData()
ResetController.resetPreferences()

// Confirmation
ResetController.showConfirmation(type, message)
ResetController.handleConfirmation(confirmed)
ResetController.cancelReset()

// Cleanup
ResetController.cleanupData()
ResetController.clearCache()
ResetController.resetState()
```

**Dependencies**: EventBus, AppState, Storage

**Usage Example**:
```javascript
// Reset all data
ResetController.showConfirmation('reset-all', 'Are you sure you want to reset all data?', {
  onConfirm: () => ResetController.resetAllData(),
  onCancel: () => cancelReset()
})
```

---

## Advanced Controllers

### 8. MessageRenderer (`js/controllers/message-renderer.js`)
**Purpose**: Handles advanced message rendering with support for artifacts and data visualization.

**Key Responsibilities**:
- Message rendering optimization
- Artifact display
- Markdown processing
- Animation handling
- Performance optimization

**Main APIs**:
```javascript
// Rendering
MessageRenderer.render(message, options)
MessageRenderer.renderArtifact(artifact, container)
MessageRenderer.updateMessage(id, updates)
MessageRenderer.deleteMessage(id)
MessageRenderer.getMessageElement(id)

// Animation
MessageRenderer.animateMessage(element, type)
MessageRenderer.scrollToMessage(id, smooth)
MessageRenderer.highlightText(element, text)

// Performance
MessageRenderer.setPerformanceMode(mode)
MessageRenderer.getRenderStats()
MessageRenderer.optimizeRendering()
```

**Dependencies**: EventBus, AppState, ArtifactRenderer

**Usage Example**:
```javascript
// Render message with artifacts
MessageRenderer.render(message, {
  showArtifacts: true,
  animations: true,
  onRender: (element) => attachEventListeners(element)
})
```

---

### 9. StreamingMessageHandler (`js/controllers/streaming-message-handler.js`)
**Purpose**: Manages real-time streaming responses with proper buffering and error handling.

**Key Responsibilities**:
- Stream session management
- Token processing
- Buffer optimization
- Error recovery
- Performance monitoring

**Main APIs**:
```javascript
// Stream Management
StreamingMessageHandler.startStream(messages, callbacks)
StreamingMessageHandler.handleToken(token)
StreamingMessageHandler.handleError(error)
StreamingMessageHandler.completeStream()
StreamingMessageHandler.cancelStream()

// Buffer Management
StreamingMessageHandler.setBufferSize(size)
StreamingMessageHandler.adjustSpeed(speed)
StreamingMessageHandler.pauseBuffering()
StreamingMessageHandler.resumeBuffering()

// Error Handling
StreamingMessageHandler.recoverFromError(error)
StreamingMessageHandler.setRetryPolicy(policy)
StreamingMessageHandler.getStreamStats()
```

**Dependencies**: EventBus, StreamBuffer, ErrorHandler

**Usage Example**:
```javascript
// Start streaming session
StreamingMessageHandler.startStream(messages, {
  onToken: (token) => displayToken(token),
  onComplete: () => showCompletion(),
  onError: (error) => handleError(error),
  onProgress: (progress) => updateProgress(progress)
})
```

---

### 10. ChatInputManager (`js/controllers/chat-input-manager.js`)
**Purpose**: Advanced input handling with validation and auto-suggestions.

**Key Responsibilities**:
- Input validation
- Auto-suggestions
- Character counting
- Input history
- Performance optimization

**Main APIs**:
```javascript
// Input Management
ChatInputManager.handleInput(input, options)
ChatInputManager.validateInput(input)
ChatInputManager.getSuggestions(input)
ChatInputManager.clearInput()
ChatInputManager.setMaxLength(length)

// Suggestions
ChatInputManager.updateSuggestions(suggestions)
ChatInputManager.clearSuggestions()
ChatInputManager.setSuggestionMode(mode)

// Validation
ChatInputManager.setValidationRules(rules)
ChatInputManager.addValidator(validator)
ChatInputManager.getValidationReport()
```

**Dependencies**: EventBus, ValidationUtils, AppState

**Usage Example**:
```javascript
// Handle input with validation
ChatInputManager.handleInput(input, {
  validate: true,
  getSuggestions: true,
  maxLength: 2000,
  onSuccess: (validatedInput) => sendMessage(validatedInput),
  onError: (error) => showError(error)
})
```

---

### 11. MessageActions (`js/controllers/message-actions.js`)
**Purpose**: Handles message interactions like regenerate, edit, delete, and query context.

**Key Responsibilities**:
- Message interaction handling
- Context management
- Action validation
- User feedback
- Performance optimization

**Main APIs**:
```javascript
// Message Actions
MessageActions.regenerateMessage(id, options)
MessageActions.editMessage(id, newContent)
MessageActions.deleteMessage(id)
MessageActions.queryContext(message)
MessageActions.copyMessage(id)

// Context Management
MessageActions.getMessageContext(id)
MessageActions.setContext(message)
MessageActions.clearContext()
MessageActions.getContextHistory()

// Validation
MessageActions.validateAction(action, message)
MessageActions.canPerformAction(action, message)
MessageActions.getActionSuggestions(message)
```

**Dependencies**: EventBus, MessageOperations, AppState

**Usage Example**:
```javascript
// Regenerate message
MessageActions.regenerateMessage(messageId, {
  onSuccess: (regenerated) => updateMessage(regenerated),
  onError: (error) => showError(error)
})
```

---

### 12. ArtifactRenderer (`js/controllers/artifact-renderer.js`)
**Purpose**: Handles data visualization and chart rendering.

**Key Responsibilities**:
- Chart rendering
- Data visualization
- Performance optimization
- Animation handling
- User interaction

**Main APIs**:
```javascript
// Chart Rendering
ArtifactRenderer.renderChart(data, options, container)
ArtifactRenderer.renderTable(data, options, container)
ArtifactRenderer.renderCustom(type, data, container)
ArtifactRenderer.destroyArtifact(id)
ArtifactRenderer.getArtifactStats()

// Data Processing
ArtifactRenderer.prepareChartData(data, type)
ArtifactRenderer.formatTableData(data)
ArtifactRenderer.validateChartData(data, type)

// Interaction
ArtifactRenderer.onArtifactClick(id, event)
ArtifactRenderer.onArtifactHover(id, event)
ArtifactRenderer.onArtifactZoom(id, data)
```

**Dependencies**: EventBus, ChartLib, AppState

**Usage Example**:
```javascript
// Render chart
ArtifactRenderer.renderChart(data, {
  type: 'line',
  title: 'Listening Trends',
  container: chartContainer,
  onClick: (data) => handleChartClick(data)
})
```

---

### 13. ErrorBoundaryController (`js/controllers/error-boundary-controller.js`)
**Purpose**: Handles error boundaries and user-friendly error display.

**Key Responsibilities**:
- Error boundary management
- Error display
- User feedback
- Error tracking
- Recovery suggestions

**Main APIs**:
```javascript
// Error Handling
ErrorBoundaryController.handleError(error, context)
ErrorBoundaryController.showError(message, details)
ErrorBoundaryController.dismissError(id)
ErrorBoundaryController.getRecentErrors()
ErrorBoundaryController.recordError(error)

// Recovery
ErrorBoundaryController.getSuggestions(error)
ErrorBoundaryController.applyRecovery(error, strategy)
ErrorBoundaryController.preventError(error)

// UI Management
ErrorBoundaryController.showErrorDialog(error)
ErrorBoundaryController.setTheme(theme)
ErrorBoundaryController.setLocale(locale)
```

**Dependencies**: EventBus, MessageErrorHandler, AppState

**Usage Example**:
```javascript
// Handle error
ErrorBoundaryController.handleError(error, {
  context: 'message-sending',
  showToUser: true,
  suggestRecovery: true,
  onDismiss: () => clearError()
})
```

---

### 14. StreamingController (`js/controllers/streaming-controller.js`)
**Purpose**: Coordinates multiple streams with proper synchronization.

**Key Responsibilities**:
- Stream coordination
- Synchronization management
- Stream prioritization
- Performance optimization
- Error handling

**Main APIs**:
```javascript
// Stream Coordination
StreamingController.addStream(id, stream)
StreamingController.removeStream(id)
StreamingController.synchronizeStreams(streams)
StreamingController.prioritizeStreams(order)

// Synchronization
StreamingController.setSyncMode(mode)
StreamingController.getSyncStatus()
StreamingController.pauseSync()
StreamingController.resumeSync()

// Performance
StreamingController.optimizePerformance()
StreamingController.getStreamStats()
StreamingController.adjustQuality(quality)
```

**Dependencies**: EventBus, StreamBuffer, AppState

**Usage Example**:
```javascript
// Coordinate multiple streams
StreamingController.addStream('main', mainStream)
StreamingController.addStream('suggestions', suggestionStream)
StreamingController.synchronizeStreams(['main', 'suggestions'])
```

---

### 15. AnalyticsController (`js/controllers/analytics-controller.js`)
**Purpose**: Tracks user behavior and provides insights.

**Key Responsibilities**:
- Event tracking
- Behavior analysis
- Performance monitoring
- User insights
- Data export

**Main APIs**:
```javascript
// Event Tracking
AnalyticsController.track(event, data)
AnalyticsController.getSessionMetrics(sessionId)
AnalyticsController.getUserBehavior()
AnalyticsController.getPerformanceMetrics()
AnalyticsController.exportAnalytics()

// Analysis
AnalyticsController.analyzePatterns(behavior)
AnalyticsController.generateInsights()
AnalyticsController.predictTrends()
AnalyticsController.getRecommendations()

// Configuration
AnalyticsController.setTrackingConfig(config)
AnalyticsController.enableTracking(enabled)
AnalyticsController.setPrivacyLevel(level)
```

**Dependencies**: EventBus, AppState, PrivacyManager

**Usage Example**:
```javascript
// Track user event
AnalyticsController.track('message-sent', {
  messageId: messageId,
  length: message.length,
  type: 'user',
  timestamp: Date.now()
})
```

---

## Controller Integration Patterns

### Event-Driven Communication
Controllers communicate through EventBus for loose coupling:
```javascript
// Controller emits event
this.emit('chat:message-sent', message)

// Other controller listens
EventBus.on('chat:message-sent', (message) => {
  this.handleMessage(message)
})
```

### State Management Pattern
Controllers interact with AppState through consistent API:
```javascript
// Update state
AppState.update('controller:domain', {
  status: 'loading',
  data: result
})

// Subscribe to state changes
AppState.subscribe('controller:domain', (state) => {
  this.updateUI(state)
})
```

### Error Handling Pattern
Controllers use ErrorBoundaryController for consistent error handling:
```javascript
// Handle error
ErrorBoundaryController.handleError(error, {
  context: 'controller:action',
  showToUser: true,
  suggestRecovery: true
})
```

### Performance Optimization Pattern
Controllers implement performance optimizations:
```javascript
// Use debouncing for frequent updates
const debouncedUpdate = debounce((value) => {
  this.updateUI(value)
}, 100)

// Use virtualization for large lists
this.virtualList = new VirtualList({
  items: items,
  itemHeight: 50,
  container: container
})
```

---

## Controller Dependencies

### Core Dependencies
- **EventBus**: All controllers for event communication
- **AppState**: State management
- **ErrorBoundaryController**: Error handling

### Controller Hierarchy
```
Core Controllers (7)
├── ChatUIController
├── SidebarController
├── ViewController
├── FileUploadController
├── SpotifyController
├── DemoController
│
Advanced Controllers (8)
├── MessageRenderer
├── StreamingMessageHandler
├── ChatInputManager
├── MessageActions
├── ArtifactRenderer
├── ErrorBoundaryController
├── StreamingController
└── AnalyticsController
```

### Cross-Controller Communication
- Controllers don't directly reference each other
- Communication happens through EventBus
- State changes propagate through AppState
- Errors are handled through ErrorBoundaryController

---

## Best Practices

### 1. Controller Design
- **Single Responsibility**: Each controller has one clear purpose
- **Loose Coupling**: Controllers communicate through interfaces
- **High Cohesion**: Related functionality grouped together

### 2. Error Handling
- **Error Boundaries**: Use ErrorBoundaryController for all errors
- **Graceful Degradation**: Provide fallback functionality
- **User-Friendly Messages**: Convert technical errors to user-friendly messages

### 3. Performance
- **Debouncing**: Use debouncing for frequent updates
- **Virtualization**: Use virtualization for large lists
- **Lazy Loading**: Load resources on demand
- **Caching**: Cache expensive operations

### 4. State Management
- **Consistent API**: Use consistent state management patterns
- **Immutable Updates**: Use immutable state updates
- **Subscription Management**: Clean up subscriptions properly

### 5. User Experience
- **Feedback**: Provide immediate feedback for user actions
- **Loading States**: Show loading states for async operations
- **Progress Indication**: Show progress for long operations
- **Error Recovery**: Provide recovery options for errors

### 6. Testing
- **Unit Testing**: Test each controller in isolation
- **Integration Testing**: Test controller interactions
- **E2E Testing**: Test complete user workflows
- **Mock Dependencies**: Mock external dependencies

### 7. Documentation
- **API Documentation**: Document public APIs
- **Usage Examples**: Provide usage examples
- **Event Documentation**: Document events emitted and listened
- **Configuration Documentation**: Document configuration options

---

**Last Updated:** 2026-01-26
**Version:** v2.0
**Controller Count:** 15 Controllers