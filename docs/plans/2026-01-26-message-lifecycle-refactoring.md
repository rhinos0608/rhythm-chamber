# MessageLifecycleCoordinator Refactoring Plan

## Current State
- **File**: `/Users/rhinesharar/rhythm-chamber/js/services/message-lifecycle-coordinator.js`
- **Size**: 809 lines
- **Problem**: God object with too many responsibilities

## Current Responsibilities Analysis

### 1. Message Validation (Lines 72-161)
**Functions**: `hashMessageContent()`, `validateMessage()`, `trackProcessedMessage()`, `clearDuplicateCache()`
- Duplicate detection via content hashing
- Message length validation
- Empty/whitespace checks
- Hash cache management with LRU eviction

**Extract to**: `MessageValidator` service

---

### 2. LLM API Call Orchestration (Lines 517-542)
**Location**: Inside `processMessage()` function
- Provider configuration building
- API key validation
- LLM call execution via `LLMProviderRoutingService.callLLM()`
- Response timing and telemetry
- Timeout budget coordination

**Extract to**: `LLMApiOrchestrator` service

---

### 3. Tool Call Execution (Lines 553-616)
**Location**: Delegates to `ToolCallHandlingService.handleToolCallsWithFallback()`
- Tool call result processing
- Early return handling
- Error recovery

**Extract to**: `ToolCallExecutor` service (wrapper around existing ToolCallHandlingService)

---

### 4. Streaming Response Handling (Lines 520-536)
**Location**: Part of LLM call
- SSE event processing
- Chunk buffering
- Progress callbacks
- Streaming vs non-streaming logic

**Extract to**: `StreamProcessor` service

---

### 5. Error Handling (Lines 183-199, 647-689)
**Functions**: `buildUserErrorMessage()`, `validateLLMResponse()`
- Provider-specific error hints
- User-friendly error formatting
- Response validation
- Error message commit to history

**Extract to**: `MessageErrorHandler` service

---

### 6. Token Counting and Truncation (Lines 453-515)
**Location**: Inside `processMessage()` function
- Token usage calculation
- Truncation strategy application
- Warning generation
- Progress callbacks for token updates

**Extract to**: Keep in coordinator or create `TokenManagementService`

---

### 7. RAG Semantic Context Retrieval (Lines 374-385)
**Location**: Inside `processMessage()` function
- RAG module retrieval
- Semantic context generation
- Error handling for RAG failures

**Extract to**: Keep in coordinator (orchestration concern)

---

### 8. Message Operations (Lines 695-783)
**Functions**: `regenerateLastResponse()`, `deleteMessage()`, `editMessage()`
- Already delegates to `_MessageOperations` when available
- Fallback logic when not available

**Extract to**: Consolidate into `MessageOperations` service

---

### 9. Cross-tab Duplicate Prevention (Lines 60-161)
**Functions**: Hash-based duplicate detection
- Global hash cache
- LRU eviction
- Cache clearing

**Extract to**: `MessageValidator` service (cross-tab coordination)

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│           MessageLifecycleCoordinator                       │
│  (Lightweight orchestrator - ~200 lines)                    │
│                                                             │
│  - Coordinates service calls                                │
│  - Manages message staging pattern                          │
│  - RAG integration                                          │
│  - TurnQueue integration                                    │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────┘
       │          │          │          │          │
       ▼          ▼          ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Message  │ │   LLM    │ │   Tool   │ │ Stream   │ │ Message  │
│ Validator│ │ Orchestr  │ │  Call    │ │Processor │ │ErrorHandl│
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘

       │          │          │          │          │
       └──────────┴──────────┴──────────┴──────────┴──────────┘
                          │
                          ▼
                    ┌──────────┐
                    │ Message  │
                    │Operations│
                    └──────────┘
```

## Implementation Plan

### Phase 1: Create Service Modules (Low Risk)
1. Create `MessageValidator` service
2. Create `MessageErrorHandler` service
3. Create `LLMApiOrchestrator` service
4. Create `StreamProcessor` service
5. Create `ToolCallExecutor` service
6. Consolidate `MessageOperations` service

### Phase 2: Update Coordinator (Medium Risk)
1. Import new services
2. Update `init()` to inject services
3. Replace inline code with service calls
4. Remove extracted functions

### Phase 3: Test and Verify (Critical)
1. Run existing unit tests
2. Run integration tests
3. Manual testing of chat functionality
4. Verify all operations work correctly

## Service Specifications

### 1. MessageValidator Service
**File**: `js/services/message-validator.js`

**Responsibilities**:
- Message content validation
- Duplicate detection
- Hash cache management

**API**:
```javascript
{
  init(dependencies),
  validate(message, options),
  hashMessage(content),
  trackProcessed(message),
  clearCache(),
  isDuplicate(message)
}
```

---

### 2. LLMApiOrchestrator Service
**File**: `js/services/llm-api-orchestrator.js`

**Responsibilities**:
- Build provider config
- Validate API keys
- Execute LLM calls
- Handle timeouts
- Record telemetry

**API**:
```javascript
{
  init(dependencies),
  callLLM(providerConfig, key, messages, tools, onProgress, timeoutSignal),
  validateApiKey(key, provider),
  buildProviderConfig(provider, settings, config)
}
```

---

### 3. ToolCallExecutor Service
**File**: `js/services/tool-call-executor.js`

**Responsibilities**:
- Execute tool calls
- Handle fallback logic
- Process early returns
- Error recovery

**API**:
```javascript
{
  init(dependencies),
  executeToolCalls(responseMessage, context),
  handleEarlyReturn(earlyReturn),
  hasEarlyReturn(result)
}
```

---

### 4. StreamProcessor Service
**File**: `js/services/stream-processor.js`

**Responsibilities**:
- Process SSE events
- Buffer chunks
- Handle progress callbacks
- Support streaming/non-streaming modes

**API**:
```javascript
{
  init(dependencies),
  processStream(response, onProgress),
  bufferChunks(chunk),
  shouldStream(provider),
  handleProgress(event, onProgress)
}
```

---

### 5. MessageErrorHandler Service
**File**: `js/services/message-error-handler.js`

**Responsibilities**:
- Build user-friendly error messages
- Provider-specific hints
- Response validation
- Error formatting for history

**API**:
```javascript
{
  init(dependencies),
  buildUserErrorMessage(error, provider),
  validateLLMResponse(response, provider),
  formatErrorForHistory(error, provider),
  getProviderHint(provider)
}
```

---

### 6. MessageOperations Service
**File**: `js/services/message-operations.js`

**Responsibilities**:
- Regenerate last response
- Edit messages
- Delete messages
- History truncation coordination

**API**:
```javascript
{
  init(dependencies),
  regenerateLastResponse(conversationHistory, sendMessage, options),
  editMessage(index, newText, conversationHistory, sendMessage, options),
  deleteMessage(index, conversationHistory),
  clearHistory()
}
```

---

## Dependency Injection Updates

### Current init()
```javascript
function init(dependencies) {
  _SessionManager = dependencies.SessionManager;
  _ConversationOrchestrator = dependencies.ConversationOrchestrator;
  // ... 13 dependencies total
}
```

### New init()
```javascript
function init(dependencies) {
  // Core orchestrators
  _SessionManager = dependencies.SessionManager;
  _ConversationOrchestrator = dependencies.ConversationOrchestrator;

  // New services
  _MessageValidator = dependencies.MessageValidator;
  _LLMApiOrchestrator = dependencies.LLMApiOrchestrator;
  _ToolCallExecutor = dependencies.ToolCallExecutor;
  _StreamProcessor = dependencies.StreamProcessor;
  _MessageErrorHandler = dependencies.MessageErrorHandler;
  _MessageOperations = dependencies.MessageOperations;

  // Remaining direct dependencies
  _LLMProviderRoutingService = dependencies.LLMProviderRoutingService;
  _TokenCountingService = dependencies.TokenCountingService;
  // ... etc
}
```

---

## Success Criteria

1. **Code Quality**
   - Coordinator reduced from 809 to ~200 lines
   - Each service < 150 lines
   - Clear separation of concerns
   - No circular dependencies

2. **Functionality**
   - All existing tests pass
   - No regression in chat functionality
   - Error handling works correctly
   - Duplicate detection still prevents cross-tab issues

3. **Maintainability**
   - Easy to add new validation rules
   - Easy to add new LLM providers
   - Easy to modify error messages
   - Easy to add new message operations

---

## Risk Mitigation

1. **Incremental Extraction**: Extract one service at a time
2. **Backwards Compatibility**: Keep old functions as wrappers during transition
3. **Comprehensive Testing**: Run tests after each extraction
4. **Git Commits**: Commit after each successful extraction
5. **Rollback Plan**: Keep original code until all services verified

---

## Timeline Estimate

- Phase 1 (Service Creation): 90 minutes
- Phase 2 (Coordinator Update): 45 minutes
- Phase 3 (Testing): 45 minutes
- **Total**: ~3 hours

---

## Next Steps

1. ✅ Create refactoring plan document
2. ⏳ Create MessageValidator service
3. ⏳ Create MessageErrorHandler service
4. ⏳ Create LLMApiOrchestrator service
5. ⏳ Create StreamProcessor service
6. ⏳ Create ToolCallExecutor service
7. ⏳ Create MessageOperations service
8. ⏳ Update MessageLifecycleCoordinator
9. ⏳ Update dependency injection in app.js
10. ⏳ Run tests and verify functionality
