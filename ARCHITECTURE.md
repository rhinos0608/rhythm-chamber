# Rhythm Chamber - Complete Technical Architecture

**Version:** 0.9.0
**Last Updated:** 2026-01-30
**Status:** Comprehensive Architecture Reference

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [HNW State Management Pattern](#2-hnw-state-management-pattern)
3. [Core Components](#3-core-components)
4. [Data Layer Architecture](#4-data-layer-architecture)
5. [Function Execution System](#5-function-execution-system)
6. [Cross-Cutting Concerns](#6-cross-cutting-concerns)
7. [Dependency Injection & IoC Container](#7-dependency-injection--ioc-container)
8. [Integration Patterns](#8-integration-patterns)
9. [Performance Optimizations](#9-performance-optimizations)
10. [Security Architecture](#10-security-architecture)
11. [Testing & Quality Assurance](#11-testing--quality-assurance)

---

## 1. System Architecture Overview

### 1.1 Zero-Backend Architecture

**Rhythm Chamber runs 100% client-side** - no server infrastructure required. This is a competitive advantage, not just a cost-saving measure.

| Component | Cost | Who Pays | Competitive Advantage |
|-----------|------|----------|----------------------|
| LLM inference | $0 | **Your local AI** (Ollama/LM Studio) or OpenRouter (free tier) | **No cloud dependency** - run AI on your own hardware |
| Processing | $0 | User's browser | Privacy-first, no data breach risk |
| Data storage | $0 | User's localStorage/IndexedDB | User controls their data, not us |
| Supporter Features | $39 one-time OR $19 first year, then $9/year | User pays for PKM Export + Friend Compare | **One-time unlock**—no recurring infrastructure |
| **Total (Base)** | **$0** | **Free Forever** | Competitors need servers to survive |

**Key Insight**: Unlike Stats.fm and similar services, Rhythm Chamber doesn't need:
- Server infrastructure costs
- Data storage costs
- API proxy costs
- Database maintenance costs
- Uptime dependencies

**Your data never leaves your device** - you control everything.

### 1.2 High-Level Architecture

```
User's Browser
├── Two Onboarding Paths:
│   ├── Path A: Quick Snapshot (Spotify OAuth)
│   │   ├── PKCE auth flow (no backend)
│   │   ├── Fetch recent plays & top artists
│   │   └── Lite personality analysis
│   │
│   └── Path B: Full Analysis (File Upload)
│       ├── Upload .zip (endsong.json)
│       ├── Parse in Web Worker (pattern-worker.js)
│       ├── Store in IndexedDB
│       └── Full personality detection
│
├── Three Intelligence Layers:
│   ├── Pattern Detection (local)
│   │   ├── Era detection
│   │   ├── Ghosted favorites
│   │   ├── Discovery explosions
│   │   └── Time-of-day patterns
│   │
│   ├── Semantic Search (local WASM)
│   │   ├── @xenova/transformers (all-MiniLM-L6-v2)
│   │   ├── Chunk embeddings (monthly, artist, era)
│   │   └── Vector similarity search
│   │
│   └── LLM Chat (local or cloud)
│       ├── Ollama (local, free)
│       ├── LM Studio (local, free)
│       ├── OpenRouter (cloud, pay-per-use)
│       └── Gemini (cloud, pay-per-use)
│
└── Storage (IndexedDB)
    ├── Streaming history
    ├── Aggregated chunks
    ├── Embeddings (vectors)
    ├── Chat sessions
    └── Settings
```

### 1.3 Bring Your Own Intelligence (BYOI)

Users choose their AI provider:

| Provider | Type | Cost | Setup |
|----------|------|------|-------|
| **Ollama** | Local | Free | Install Ollama, run model |
| **LM Studio** | Local | Free | Install LM Studio, enable API |
| **OpenRouter** | Cloud | Pay-per-use | Add API key in settings |
| **OpenAI-Compatible** | Cloud or Local | Depends on provider | Configure custom base URL and API key |
| **Gemini** | Cloud | Pay-per-use | Add API key in settings |

The system automatically detects available providers and falls back gracefully.

---

## 2. HNW State Management Pattern

### 2.1 Pattern Overview

Rhythm Chamber uses the **HNW (Hierarchy-Network-Wave)** pattern for state management, implemented in `js/state/app-state.js`.

**Three Principles:**

1. **Hierarchy** - Single source of truth with explicit mutation authority
2. **Network** - Subscribe pattern for loose coupling with frozen immutable state
3. **Wave** - Batched async updates via `queueMicrotask` for predictable notification timing

### 2.2 Architecture

```javascript
// Hierarchy: Single source of truth
const AppState = {
    // State is organized into domains
    domains: {
        view: {},      // Current view, navigation history
        data: {},      // Streaming data, chunks
        lite: {},      // Lite profile data
        ui: {},        // UI state (sidebar, overlays)
        operations: {},// Operation locks, flags
        demo: {}       // Demo data (isolated)
    },

    // Explicit mutation authority through update() method
    update(domain, mutations) {
        // Apply mutations to domain
        // Freeze state (dev: deep, prod: shallow for large data)
        // Queue notifications
    },

    // Network: Subscribe pattern
    subscribe(domain, handler) {
        // Subscribe to domain changes
        // Return unsubscribe function
    },

    // Wave: Batched notifications
    queueMicrotask(() => {
        // Notify subscribers of changed domains
    })
};
```

### 2.3 Key Features

**Immutable State:**
- Deep freeze in development mode (catches mutations)
- Selective shallow freeze in production (performance for large data domains)
- State objects cannot be modified directly

**Domain-Based Organization:**
- Clear separation of concerns
- Subscribers only notified for their domain
- Changed domain tracking for efficient updates

**Batched Updates:**
- Multiple state updates batched into single notification
- Uses `queueMicrotask` for predictable timing
- Reduces redundant re-renders

**Demo Data Isolation:**
- Separate `demo` domain prevents cross-contamination
- DemoStorage provides isolated persistence
- Demo mode can be activated without affecting real data

### 2.4 Type-Safe Helpers

```javascript
// Domain-specific setters (type-safe)
AppState.setView(currentView, options);
AppState.setPersonality(personality);
AppState.setStreams(streams, chunks);
AppState.setSessions(sessions);

// Domain-specific getters
const currentView = AppState.getView();
const personality = AppState.getPersonality();
const streams = AppState.getStreams();
```

### 2.5 Critical Implementation Details

**Development Mode:**
```javascript
if (DEVELOPMENT) {
    // Deep freeze to catch mutations
    Object.freeze(domain);
    Object.freeze(domain.data);
    // ... recursively freeze all properties
} else {
    // Shallow freeze for performance (large data domains)
    Object.freeze(domain);
}
```

**Selective Freezing:**
- Small domains (view, ui, operations): Deep freeze
- Large domains (streams, demo): Shallow freeze
- Prevents performance issues with large datasets

**Changed Domain Tracking:**
```javascript
const changedDomains = new Set();

function update(domain, mutations) {
    applyMutations(domain, mutations);
    changedDomains.add(domain);
    queueMicrotask(notifySubscribers);
}

function notifySubscribers() {
    for (const domain of changedDomains) {
        notifyDomainSubscribers(domain);
    }
    changedDomains.clear();
}
```

---

## 3. Core Components

### 3.1 Services (80+ modules)

Services are the backbone of the application, handling core business logic, external API interactions, and data processing.

#### Core Messaging Services

**1. MessageLifecycleCoordinator** (`js/services/message-lifecycle-coordinator.js` ~674 lines)
- **Purpose**: Orchestrate message lifecycle from creation to response
- **Responsibilities**:
  - LLM coordination and API calls
  - Tool call orchestration
  - Message validation
  - Stream processing
  - Error handling
- **Dependencies**: LLMApiOrchestrator, ToolCallHandlingService, StreamProcessor, MessageErrorHandler

**2. MessageValidator** (`js/services/message-validator.js` ~300 lines)
- **Purpose**: Message validation and duplicate detection
- **Responsibilities**:
  - Content validation
  - Duplicate message detection
  - Spam detection
  - Security scanning
- **Dependencies**: MessageErrorHandler

**3. MessageErrorHandler** (`js/services/message-error-handler.js` ~250 lines)
- **Purpose**: Error classification and user messaging
- **Responsibilities**:
  - Error classification (9+ types)
  - User-friendly error messages
  - Recovery strategy selection
- **Dependencies**: EventBus, AppState

**4. MessageOperations** (`js/services/message-operations.js` ~600 lines)
- **Purpose**: Message CRUD operations
- **Responsibilities**:
  - Regenerate message
  - Edit message
  - Delete message
  - Query context
- **Dependencies**: DataQuery, TokenCounter, Functions

**5. StreamProcessor** (`js/services/stream-processor.js` ~200 lines)
- **Purpose**: SSE streaming response handling
- **Responsibilities**:
  - Token processing
  - Stream buffering
  - Sequence validation
  - Timeout protection
- **Dependencies**: StreamBuffer, RetryManager

#### LLM Integration Services

**6. LLMApiOrchestrator** (`js/services/llm-api-orchestrator.js` ~240 lines)
- **Purpose**: LLM API calls with provider management
- **Responsibilities**:
  - Provider configuration
  - API request execution
  - Token management
  - Response parsing
- **Dependencies**: ProviderInterface, TokenCountingService

**7. LLMProviderRoutingService** (`js/services/llm-provider-routing-service.js` ~150 lines)
- **Purpose**: Provider selection and routing
- **Responsibilities**:
  - Provider selection logic
  - Request routing
  - Load balancing
- **Dependencies**: ProviderInterface, AdaptiveCircuitBreaker

**8. ProviderFallbackChain** (`js/services/provider-fallback-chain.js` - facade)
- **Purpose**: Automatic provider fallback
- **Implementation**: Refactored into 5-file module
  - `js/services/fallback/index.js` - Facade
  - `js/services/fallback/config.js` - Fallback configuration
  - `js/services/fallback/health.js` - Health checks
  - `js/services/fallback/priority.js` - Priority ordering
  - `js/services/fallback/execution.js` - Fallback execution
- **Responsibilities**:
  - Provider health monitoring
  - Automatic fallback on failure
  - Priority-based provider selection
  - Circuit breaker integration

**9. ProviderHealthMonitor** (`js/services/provider-health-monitor.js` ~420 lines)
- **Purpose**: Real-time health tracking
- **Responsibilities**:
  - Success/failure tracking
  - Performance metrics
  - Health status calculation
  - Provider recommendations
- **Dependencies**: EventBus, ProviderInterface

**10. ProviderHealthAuthority** (`js/services/provider-health-authority.js` ~800 lines)
- **Purpose**: Comprehensive health status management
- **Responsibilities**:
  - Health state aggregation
  - Per-endpoint circuit breakers
  - Health recommendations
  - Performance tracking
- **Dependencies**: ProviderHealthMonitor, CircuitBreaker

**11. ProviderCircuitBreaker** (`js/services/provider-circuit-breaker.js` ~450 lines)
- **Purpose**: Circuit breaker pattern for provider resilience
- **Responsibilities**:
  - Circuit state management (open/closed/half-open)
  - Automatic recovery
  - Health monitoring integration
- **Dependencies**: EventBus, ProviderHealthMonitor

**12. ToolCallHandlingService** (`js/services/tool-call-handling-service.js` ~950 lines)
- **Purpose**: Tool call execution with strategy voting
- **Responsibilities**:
  - Tool call execution
  - Strategy voting for multiple tools
  - Tool call validation
  - Conflict resolution
- **Dependencies**: LLMApiOrchestrator, MessageValidator

**13. FunctionCallingFallback** (`js/services/function-calling-fallback.js` ~650 lines)
- **Purpose**: Fallback for function calling failures
- **Responsibilities**:
  - Strategy fallback (native → prompt injection → intent extraction)
  - Error recovery
  - Graceful degradation
- **Dependencies**: LLMApiOrchestrator, ToolCallHandlingService

#### Resilience & Error Handling Services

**14. AdaptiveCircuitBreaker** (`js/services/adaptive-circuit-breaker.js` ~480 lines)
- **Purpose**: Adaptive circuit breaking
- **Responsibilities**:
  - Adaptive threshold calculation
  - Circuit state management
  - Automatic recovery
- **Dependencies**: EventBus, AppState

**15. ErrorBoundary** (`js/services/error-boundary.js` ~410 lines)
- **Purpose**: Error containment
- **Responsibilities**:
  - Try-catch wrapping
  - Error isolation
  - Graceful degradation
- **Dependencies**: MessageErrorHandler

**16. ErrorRecoveryCoordinator** (`js/services/error-recovery-coordinator.js` ~150 lines)
- **Purpose**: Error recovery orchestration
- **Responsibilities**:
  - Recovery strategy selection
  - Batch recovery handling
  - Recovery logging
- **Dependencies**: ErrorHandler, RecoveryStrategies

**17. FallbackResponseService** (`js/services/fallback-response-service.js` ~160 lines)
- **Purpose**: Static/local fallback responses
- **Responsibilities**:
  - Static response generation
  - Local model fallback
  - User guidance
- **Dependencies**: AppState, ProviderInterface

**18. RetryManager** (`js/utils/retry-manager.js`)
- **Purpose**: Retry logic with exponential backoff
- **Responsibilities**:
  - Exponential backoff calculation
  - Maximum retry limits
  - Retry condition filtering
  - Jitter addition
- **Dependencies**: AdaptiveCircuitBreaker

**19. ResilientRetry** (`js/utils/resilient-retry.js`)
- **Purpose**: Advanced retry with circuit breaker integration
- **Responsibilities**:
  - Circuit breaker integration
  - Conditional retry logic
  - Retry history tracking
- **Dependencies**: AdaptiveCircuitBreaker, EventBus

#### Concurrency & Coordination Services

**20. TurnQueue** (`js/services/turn-queue.js` ~400 lines)
- **Purpose**: Message serialization
- **Responsibilities**:
  - Message queuing
  - Turn management
  - Queue prioritization
- **Dependencies**: EventBus, SessionManager

**21. LockPolicyCoordinator** (`js/services/lock-policy-coordinator.js` ~380 lines)
- **Purpose**: Operation conflict resolution
- **Responsibilities**:
  - Operation conflict matrix
  - Lock acquisition/release
  - Deadlock prevention
- **Dependencies**: EventBus, OperationLock

**22. SessionLockManager** (`js/services/session-lock-manager.js` ~400 lines)
- **Purpose**: Cross-tab session coordination
- **Responsibilities**:
  - Session locking
  - Primary/secondary designation
  - Lock timeout handling
- **Dependencies**: TabCoordinator, EventBus

**23. CascadingAbortController** (`js/services/cascading-abort-controller.js` ~360 lines)
- **Purpose**: Abort signal propagation
- **Responsibilities**:
  - Multi-level abort coordination
  - Abort signal chaining
  - Cleanup coordination
- **Dependencies**: EventBus, OperationLock

**24. VectorClock** (`js/services/vector-clock.js` ~290 lines)
- **Purpose**: Distributed ordering
- **Responsibilities**:
  - Logical timestamp generation
  - Causality tracking
  - Conflict detection
- **Dependencies**: EventBus

**25. LamportClock** (`js/services/lamport-clock.js` ~150 lines)
- **Purpose**: Logical timestamps
- **Responsibilities**:
  - Counter-based timestamps
  - Total ordering
  - Event sequencing
- **Dependencies**: EventBus

#### State Management Services

**26. StateMachineCoordinator** (`js/services/state-machine-coordinator.js` ~340 lines)
- **Purpose**: State transition management
- **Responsibilities**:
  - State machine definition
  - Transition validation
  - Workflow orchestration
- **Dependencies**: EventBus, AppState

**27. TimeoutBudgetManager** (`js/services/timeout-budget-manager.js` ~650 lines)
- **Purpose**: Hierarchical timeout allocation
- **Responsibilities**:
  - Timeout budget allocation
  - Child timeout derivation
  - Timeout enforcement
- **Dependencies**: OperationQueue, AppState

**28. SessionManager** (Facade for `js/services/session-manager/`)
- **Purpose**: Session lifecycle management
- **Implementation**: 3-file module
  - `js/services/session-manager/index.js` - Facade
  - `js/services/session-manager/session-state.js` - State management
  - `js/services/session-manager/session-lifecycle.js` - Lifecycle operations
- **Responsibilities**:
  - Session creation/loading/saving
  - Session persistence
  - Session archiving
  - Cross-tab coordination
- **Dependencies**: EventBus, Storage, AppState

#### Business Logic Services

**29. PremiumGatekeeper** (`js/services/premium-gatekeeper.js` ~120 lines)
- **Purpose**: Premium feature gating
- **Responsibilities**:
  - Feature access control
  - License validation
  - Upgrade prompts
- **Dependencies**: LicenseService, AppState

**30. PremiumQuota** (`js/services/premium-quota.js` ~320 lines)
- **Purpose**: Quota management
- **Responsibilities**:
  - Quota tracking
  - Quota enforcement
  - Quota notifications
- **Dependencies**: Storage, AppState

**31. LicenseService** (`js/services/license-service.js` ~470 lines)
- **Purpose**: License validation
- **Responsibilities**:
  - License verification
  - License expiration
  - License refresh
- **Dependencies**: LicenseVerifier, Storage

**32. LemonSqueezyService** (`js/services/lemon-squeezy-service.js` ~910 lines)
- **Purpose**: Payment processing
- **Responsibilities**:
  - Webhook handling
  - Payment processing
  - License issuance
- **Dependencies**: LicenseService, Storage

#### Analytics & Features Services

**33. PlaylistService** (`js/services/playlist-service.js` ~190 lines)
- **Purpose**: Playlist operations
- **Responsibilities**:
  - Playlist generation
  - Playlist analysis
  - Playlist sharing
- **Dependencies**: LLMApiOrchestrator, AppState

**34. PlaylistGenerator** (`js/services/playlist-generator.js` ~400 lines)
- **Purpose**: AI playlist generation
- **Responsibilities**:
  - Music recommendation
  - Playlist optimization
  - Personalization
- **Dependencies**: LLMApiOrchestrator, AppState

**35. ProfileSharing** (`js/services/profile-sharing.js` ~300 lines)
- **Purpose**: Encrypted profile export/import
- **Responsibilities**:
  - Profile encryption
  - Profile export/import
  - Profile validation
- **Dependencies**: Security, Storage

**36. PatternComparison** (`js/services/pattern-comparison.js` ~340 lines)
- **Purpose**: Pattern analysis
- **Responsibilities**:
  - Pattern comparison
  - Similarity scoring
  - Collaborative features
- **Dependencies**: AppState, EventBus

**37. TemporalAnalysis** (`js/services/temporal-analysis.js` ~400 lines)
- **Purpose**: 5-year trend analysis
- **Responsibilities**:
  - Temporal pattern detection
  - Trend visualization
  - Forecast generation
- **Dependencies**: EventBus, AppState

#### Observability Services

**38. PerformanceProfiler** (`js/services/performance-profiler.js` ~1050 lines)
- **Purpose**: Performance profiling
- **Responsibilities**:
  - Performance metrics collection
  - Profiling data analysis
  - Performance reports
- **Dependencies**: EventBus, AppState

**39. WaveTelemetry** (`js/services/wave-telemetry.js` ~320 lines)
- **Purpose**: Telemetry tracking
- **Responsibilities**:
  - Event tracking
  - Metrics collection
  - Analytics data
- **Dependencies**: EventBus, AppState

**40. WaveVisualizer** (`js/services/wave-visualizer.js` ~170 lines)
- **Purpose**: Wave pattern visualization
- **Responsibilities**:
  - Wave rendering
  - Animation handling
  - User interaction
- **Dependencies**: EventBus, AppState

#### Infrastructure Services

**41. TabCoordinator** (Facade for `js/services/tab-coordination/`)
- **Purpose**: Cross-tab coordination
- **Implementation**: 4-file module
  - `js/services/tab-coordination/index.js` - Facade
  - `js/services/tab-coordination/messaging.js` - Cross-tab messaging
  - `js/services/tab-coordination/guards.js` - Message guards
  - `js/services/tab-coordination/timing.js` - Timing constants
- **Responsibilities**:
  - Primary/secondary designation
  - State broadcasting
  - Session sharing
  - Conflict resolution
- **Dependencies**: EventBus, Storage, SessionManager

**42. EventBus** (Facade for `js/services/event-bus/`)
- **Purpose**: Centralized event system
- **Implementation**: Single module with type-safe events
- **Responsibilities**:
  - Event subscription/emission
  - Event type validation
  - Event debugging
  - Event filtering
- **Dependencies**: AppState

**43. WorkerCoordinator** (`js/services/worker-coordinator.js` ~490 lines)
- **Purpose**: Worker thread management
- **Responsibilities**:
  - Worker creation
  - Worker lifecycle
  - Task distribution
- **Dependencies**: EventBus, AppState

**44. ConfigLoader** (`js/services/config-loader.js` ~850 lines)
- **Purpose**: Configuration management
- **Responsibilities**:
  - Configuration loading
  - Environment detection
  - Configuration validation
- **Dependencies**: Storage

**45. DeviceDetection** (`js/services/device-detection.js` ~680 lines)
- **Purpose**: Device capabilities detection
- **Responsibilities**:
  - Hardware detection
  - Feature detection
  - Capability reporting
- **Dependencies**: EventBus

**46. BatteryAwareModeSelector** (`js/services/battery-aware-mode-selector.js` ~260 lines)
- **Purpose**: Battery-based optimization
- **Responsibilities**:
  - Battery status monitoring
  - Adaptive performance
  - Power management
- **Dependencies**: EventBus, DeviceDetection

**47. DataVersion** (`js/services/data-version.js` ~220 lines)
- **Purpose**: Data versioning
- **Responsibilities**:
  - Version tracking
  - Migration coordination
  - Backward compatibility
- **Dependencies**: Storage

**48. StorageDegradationManager** (Facade for `js/services/storage-degradation/`)
- **Purpose**: Storage health monitoring
- **Implementation**: 4-file module
  - `js/services/storage-degradation/index.js` - Facade
  - `js/services/storage-degradation/detection.js` - Degradation detection
  - `js/services/storage-degradation/tier-handlers.js` - Tier-specific handlers
  - `js/services/storage-degradation/cleanup.js` - Cleanup strategies
- **Responsibilities**:
  - Storage health monitoring
  - Tier fallback (IndexedDB → localStorage → memory)
  - Degradation recovery
- **Dependencies**: Storage, EventBus

### 3.2 Controllers (15 modules)

Controllers manage UI logic, user interactions, and coordinate between frontend and backend services.

#### Core Controllers

**1. ResetController** (`js/controllers/reset-controller.js` ~371 lines)
- **Purpose**: Data reset operations with worker cleanup
- **Key Features**:
  - Atomic reset operations
  - Worker termination
  - Cleanup coordination
- **Dependencies**: Storage, AppState, OperationLock

**2. ViewController** (`js/controllers/view-controller.js` ~497 lines)
- **Purpose**: View transitions and DOM updates
- **Key Features**:
  - View switching
  - Progress tracking
  - AI description generation
  - Lazy DOM initialization
- **Critical Fix**: AbortController prevents race conditions in AI description
- **Dependencies**: AppState, EventBus, OperationLock

**3. CustomProfileController** (`js/controllers/custom-profile-controller.js` ~414 lines)
- **Purpose**: Custom profile creation flow
- **Key Features**:
  - Profile creation wizard
  - Data validation
  - Profile persistence
- **Dependencies**: Storage, AppState, ViewController

**4. DemoController** (`js/controllers/demo-controller.js` ~812 lines)
- **Purpose**: Demo mode with isolated data sandbox
- **Key Features**:
  - Complete data isolation via DemoStorage
  - Three-phase atomic transaction pattern
  - Operation lock prevents concurrent demo loads
  - Memory leak prevention with event listener cleanup
- **HNW Defensive Design**:
  - Separate demo domain in AppState
  - Isolated DemoStorage with IndexedDB backing
  - Single source of truth: AppState (DemoStorage is persistence only)
- **Dependencies**: AppState, DemoData, ViewController

**5. FileUploadController** (`js/controllers/file-upload-controller.js` ~489 lines)
- **Purpose**: File upload processing with Web Worker orchestration
- **Key Features**:
  - Web Worker orchestration for parsing
  - Memory management with backpressure
  - Atomic lock acquisition prevents concurrent uploads
  - File validation (size, MIME type, magic bytes)
  - Graceful worker cleanup
- **Dependencies**: Storage, AppState, OperationLock, ParserWorker

**6. SpotifyController** (`js/controllers/spotify-controller.js` ~340 lines)
- **Purpose**: Spotify OAuth flow and token management
- **Key Features**:
  - PKCE OAuth flow
  - Token management
  - Data fetching
  - User authentication
- **Dependencies**: Storage, AppState, OAuthManager

**7. SidebarController** (`js/controllers/sidebar-controller.js` ~732 lines)
- **Purpose**: Sidebar state and session management
- **Key Features**:
  - AppState subscription for reactive updates
  - Event delegation for XSS prevention
  - Memory leak cleanup (rename input handlers)
  - Session switching with message restoration
  - Responsive mobile overlay state sync
- **Security Features**:
  - Session ID format validation (`/^[a-z0-9\-_]+$/i`)
  - HTML escaping via `escapeHtml()` utility
  - Event delegation prevents inline onclick XSS
- **Dependencies**: AppState, SessionManager, EventBus

**8. MessageActions** (`js/controllers/message-actions.js` ~268 lines)
- **Purpose**: Message action buttons and event handling
- **Key Features**:
  - Message regeneration
  - Message editing
  - Message deletion
  - Context querying
- **Dependencies**: MessageOperations, EventBus

**9. ArtifactRenderer** (`js/controllers/artifact-renderer.js` ~138 lines)
- **Purpose**: Artifact validation and rendering
- **Key Features**:
  - Spec validation
  - SVG rendering
  - XSS prevention
- **Dependencies**: ArtifactSpec, EventBus

**10. ChatInputManager** (`js/controllers/chat-input-manager.js` ~113 lines)
- **Purpose**: Input validation and focus management
- **Key Features**:
  - Input validation
  - Character counting
  - Focus management
- **Dependencies**: ValidationUtils, AppState

**11. ChatUIController** (`js/controllers/chat-ui-controller.js` ~80 lines)
- **Purpose**: Facade for chat UI components
- **Architecture**: Refactored into focused modules
  - MessageRenderer: Message element creation
  - StreamingMessageHandler: SSE streaming
  - MessageActions: User interactions
  - ArtifactRenderer: Data visualization
  - ChatInputManager: Input validation
- **Dependencies**: MessageRenderer, StreamingMessageHandler

**12. StreamingMessageHandler** (`js/controllers/streaming-message-handler.js` ~423 lines)
- **Purpose**: SSE streaming and sequence validation
- **Key Features**:
  - SSE stream processing
  - Sequence validation with timeout protection
  - Token buffering
  - Error recovery
- **Dependencies**: StreamProcessor, EventBus

**13. PremiumController** (`js/controllers/premium-controller.js` ~464 lines)
- **Purpose**: Premium feature gates and upgrade flow
- **Key Features**:
  - Feature gating
  - Upgrade prompts
  - License validation
- **Dependencies**: LicenseService, PremiumGatekeeper, AppState

**14. MessageRenderer** (`js/controllers/message-renderer.js` ~95 lines)
- **Purpose**: Message element creation and markdown parsing
- **Key Features**:
  - Message rendering
  - Markdown parsing
  - Safe HTML rendering
- **Dependencies**: MarkdownParser, EventBus

**15. ObservabilityController** (`js/controllers/observability-controller.js` ~1109 lines)
- **Purpose**: Observability dashboard UI and metrics display
- **Key Features**:
  - Multi-tab dashboard (Overview, Web Vitals, Performance, Memory, Exports)
  - Real-time updates with configurable interval
  - Memory leak prevention with tab handler cleanup
  - Event-driven architecture
  - Export functionality
- **Critical Implementation**:
  - Bound event handlers for proper cleanup
  - Tab handler tracking and cleanup
  - Container event delegation
- **Dependencies**: EventBus, MetricsExporter, AppState

### 3.3 Utilities (21+ modules)

Utilities provide common functionality used across the application.

#### Error Handling Utilities

**ErrorHandlingUtils** (Facade for `js/utils/error-handling/`)
- **Purpose**: Comprehensive error classification and recovery
- **Implementation**: 4-file module
  - `js/utils/error-handling.js` - Facade
  - `js/utils/error-handling/error-classifier.js` - Type classification
  - `js/utils/error-handling/error-formatter.js` - Message formatting
  - `js/utils/error-handling/error-recovery.js` - Recovery strategies
  - `js/utils/error-handling/error-sanitizer.js` - Security and data redaction
- **Error Types**:
  - Network errors
  - API errors
  - Validation errors
  - User input errors
  - System errors
  - Security errors
  - Provider errors
  - Storage errors
  - Transaction errors

**SafeJSON** (`js/utils/safe-json.js`)
- **Purpose**: Safe JSON parsing
- **Key Features**:
  - Try-catch wrapping
  - Error handling
  - Fallback values
- **Dependencies**: ErrorHandler

#### Validation Utilities

**ValidationUtils** (Facade for `js/utils/validation/`)
- **Purpose**: Advanced input validation and sanitization
- **Implementation**: 6-file module
  - `js/utils/validation.js` - Facade
  - `js/utils/validation/message-validator.js` - Message validation
  - `js/utils/validation/regex-validator.js` - Safe regex creation
  - `js/utils/validation/schema-validator.js` - Schema validation
  - `js/utils/validation/format-validators.js` - URL, email, HTML validation
  - `js/utils/validation/storage-validators.js` - Storage-specific validation
  - `js/utils/validation/type-guards.js` - Type checking utilities
- **Validation Categories**:
  - Message validation
  - Schema validation
  - Format validation
  - Storage validation
  - Type validation

**HTMLEscape** (`js/utils/html-escape.js`)
- **Purpose**: XSS prevention
- **Key Features**:
  - HTML entity encoding
  - Safe HTML sanitization
- **Dependencies**: ValidationUtils

**InputValidation** (`js/utils/input-validation.js`)
- **Purpose**: User input sanitization
- **Key Features**:
  - Malicious input detection
  - Content security
  - Input filtering
- **Dependencies**: ValidationUtils

#### Retry & Resilience Utilities

**RetryManager** (`js/utils/retry-manager.js`)
- **Purpose**: Retry logic with exponential backoff
- **Key Features**:
  - Exponential backoff with jitter
  - Maximum retry limits
  - Timeout management
  - Retry condition filtering
  - Retry statistics tracking
- **Dependencies**: AdaptiveCircuitBreaker

**ResilientRetry** (`js/utils/resilient-retry.js`)
- **Purpose**: Advanced retry patterns
- **Key Features**:
  - Circuit breaker integration
  - Adaptive retry strategies
  - Conditional retry logic
  - Retry history tracking
- **Dependencies**: CircuitBreaker, EventBus

**AdaptiveRateLimiter** (`js/utils/adaptive-rate-limiter.js`)
- **Purpose**: Dynamic rate limiting
- **Key Features**:
  - Adaptive rate adjustment
  - Performance-based limits
  - User behavior tracking
  - Burst handling
  - Analytics and monitoring
- **Dependencies**: EventBus, AppState

#### Processing Utilities

**StreamBuffer** (`js/utils/stream-buffer.js`)
- **Purpose**: Efficient stream buffering
- **Key Features**:
  - Fixed-size circular buffer
  - Thread-safe operations
  - Buffer overflow protection
  - Performance monitoring
  - Memory management
- **Dependencies**: ErrorHandler

**ParserUtils** (`js/utils/parser.js`)
- **Purpose**: Data parsing and transformation
- **Key Features**:
  - Safe JSON parsing
  - XML parsing
  - CSV parsing
  - Data transformation
  - Error handling
- **Dependencies**: ErrorHandler, SafeJSON

**FunctionExecutor** (`js/utils/function-executor.js`)
- **Purpose**: Safe function execution
- **Key Features**:
  - Function timeout management
  - Error handling
  - Execution context
  - Performance monitoring
  - Execution limits
- **Dependencies**: ErrorHandler, TimeoutWrapper

#### Common Utilities

**CommonUtils** (`js/utils/common.js`)
- **Purpose**: Common utility functions
- **Functions**:
  - `formatBytes()` - Human-readable file sizes
  - `checkSecureContext()` - Security validation
  - `debounce()` - Debounce function execution
  - `throttle()` - Throttle function execution
  - `deepClone()` - Deep object cloning
  - `deepEqual()` - Deep equality checking
  - `getNestedValue()` - Safe property access
  - `setNestedValue()` - Safe property setting
  - `generateId()` - Unique ID generation
  - `sleep()` - Async sleep
  - `retry()` - Retry with exponential backoff

#### Concurrency Utilities

**LockManager** (`js/utils/lock-manager.js`)
- **Purpose**: Lock management primitives
- **Key Features**:
  - Lock acquisition
  - Lock release
  - Lock timeout
  - Deadlock detection
- **Dependencies**: ErrorHandler

**Mutex** (`js/utils/mutex.js`)
- **Purpose**: Mutual exclusion
- **Key Features**:
  - Mutex lock/unlock
  - Reentrant locking
  - Timeout support
- **Dependencies**: ErrorHandler

#### Security Utilities

**CryptoHashing** (`js/utils/crypto-hashing.js`)
- **Purpose**: Cryptographic utilities
- **Key Features**:
  - Cryptographic hashing
  - Data integrity verification
  - Secure hash generation
- **Dependencies**: Web Crypto API

#### Logging Utilities

**Logger** (`js/utils/logger.js`)
- **Purpose**: Structured logging
- **Key Features**:
  - Different log levels (debug, info, warn, error)
  - Multiple outputs
  - Log formatting
- **Dependencies**: ErrorHandler

**SecureLogger** (`js/utils/secure-logger.js`)
- **Purpose**: Security-focused logging
- **Key Features**:
  - Sensitive data redaction
  - Secure log formatting
  - Audit logging
- **Dependencies**: Logger, ErrorHandler

#### Timeout Utilities

**TimeoutWrapper** (`js/utils/timeout-wrapper.js`)
- **Purpose**: Timeout management
- **Key Features**:
  - Timeout enforcement
  - Timeout cancellation
  - Timeout recovery
- **Dependencies**: ErrorHandler

#### Focus Utilities

**FocusTrap** (`js/utils/focus-trap.js`)
- **Purpose**: UI focus management
- **Key Features**:
  - Focus trap creation
  - Focus management
  - Cleanup on destroy
- **Dependencies**: ErrorHandler

---

## 4. Data Layer Architecture

### 4.1 Storage System

#### Three-Tier Fallback Architecture

Rhythm Chamber implements a resilient three-tier storage fallback system:

```
┌─────────────────┐
│  Application    │
└────────┬────────┘
         │
    ┌────▼────┐
    │ Storage │
    │ Facade  │
    └────┬────┘
         │
    ┌────▼────────────────────┐
    │                         │
    ▼                         ▼
┌─────────┐            ┌──────────┐
│IndexedDB│            │ Fallback │
│(Primary)│───────────▶│  Chain   │
└─────────┘            └────┬─────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
              ┌─────────┐       ┌────────┐
              │localStorage│     │ Memory │
              │  (Tier 2)   │     │(Tier 3)│
              └─────────┘       └────────┘
```

**Tier 1: IndexedDB (Primary)**
- 18 object stores
- Full persistence
- Asynchronous API
- Large data capacity (~50GB+)

**Tier 2: localStorage (Graceful Degradation)**
- ~5MB limit
- Key-value structure
- Synchronous API
- Fallback for private browsing

**Tier 3: Memory (Last Resort)**
- Lost on page refresh
- No persistence
- Fallback for localStorage unavailable

#### IndexedDB Schema (Version 6)

**Stores:**
- `streams` - Raw streaming history
- `chunks` - Aggregated chunks with indexes
- `embeddings` - Vector embeddings
- `personality` - Personality results
- `settings` - User settings
- `chat_sessions` - Chat sessions with updatedAt index
- `config` - Unified configuration
- `tokens` - Encrypted credentials
- `migration` - Migration state & rollback backup
- `event_log` - Event log with sequenceNumber index
- `event_checkpoint` - Checkpoints for recovery
- `demo_streams`, `demo_patterns`, `demo_personality` - Demo mode data
- `TRANSACTION_JOURNAL` - 2PC crash recovery
- `TRANSACTION_COMPENSATION` - Rollback failure logging

**Migration Strategy:**
- Sequential migrations (v1→v2→v3→v4→v5→v6)
- Each version has explicit migration function
- Additive safety net (create missing stores after migrations)

#### Write-Ahead Logging (Safe Mode)

**Purpose**: Durable write queue when encryption unavailable

**Components:**
- Write queue with priority levels (CRITICAL > HIGH > NORMAL > LOW)
- WAL persistence to localStorage
- Crash recovery with automatic replay
- Adaptive batching based on device performance

**CRITICAL FIX #1: Promise Resolution Across Reloads**
- **Problem**: WAL promises lost on page reload
- **Solution**: `waitForResult(entryId)` with persisted operation results
- **Result**: 5-minute result retention for crash recovery

**CRITICAL FIX #2: Idempotent Replay**
- **Problem**: ConstraintError when operation committed but entry not cleared
- **Solution**: Convert `add()` → `put()` during WAL replay
- **Result**: Prevents duplicate key errors

#### Two-Phase Commit (2PC)

**Protocol Phases:**
1. **Prepare** - All resources vote YES/NO
2. **Decision** - Write commit marker (point of no return)
3. **Commit** - Execute prepared operations
4. **Cleanup** - Remove pending data

**Safety Features:**
- Nested transaction guard (prevents accidental nesting)
- Fatal state management (halt system on rollback failure)
- Compensation logging (manual recovery if rollback fails)
- Transaction journal (crash recovery between phases)

#### Quota Management

**CRITICAL FIX #5: Reservation System**
- **Problem**: TOCTOU race in quota checks
- **Solution**: Check quota → create reservation → write → release reservation
- **Result**: Prevents time-of-check-to-time-of-use race condition
- **Auto-release**: Stale reservations after 30 seconds

**CRITICAL FIX #12: Pending Write Accounting**
- **Problem**: Quota checks don't account for pending writes
- **Solution**: `checkWriteFits(writeSizeBytes)` returns reservation ID
- **Result**: Prevents scenarios where check passes but actual write exceeds quota

#### Transaction Isolation

**CRITICAL FIX #1: Explicit Transaction Pool**
- **Problem**: Concurrent transactions violating atomicity
- **Solution**: Acquire or create transaction with proper locking
- **Result**: Track transaction state to prevent reuse of completed transactions
- **Implementation**: Flag transactions as `_isCompleting` to prevent race conditions

#### LRU Cache with Pinned Items

**CRITICAL FIX #6: Prevent Eviction During Processing**
- **Problem**: Items evicted during active worker processing
- **Solution**: Pin items during active worker processing
- **Result**: Pinned items excluded from eviction selection

**Issue #20 Fix: Eviction Callbacks**
- **Problem**: Items evicted silently, causing resource leaks
- **Solution**: `setMaxSize()` now calls `onEvict` for each evicted item
- **Result**: Proper cleanup of evicted items

#### Archive Data Integrity

**MEDIUM FIX #17: Validation Before Restoration**
- **Problem**: Invalid data restored from archive
- **Solution**: Validate structure integrity before restoring
- **Result**: 90% validity threshold (allow some corruption, reject total failures)

#### Event Log Compaction

**MEDIUM FIX #16: Safe Compaction for Empty DB**
- **Problem**: Compaction fails on empty database
- **Solution**: Explicit empty database check before compaction
- **Result**: Clamp `cutoffSequence` to >= 0 to prevent negative ranges

### 4.2 Provider Integration

#### Provider Interface

**Unified Abstraction** (`js/providers/provider-interface.js` ~1103 lines)

**Features:**
- Unified LLM provider abstraction
- Health checks and circuit breakers
- Automatic fallback
- 5 provider implementations:
  - OpenRouter (cloud, pay-per-use)
  - Ollama (local, free)
  - Gemini (cloud, pay-per-use)
  - LM Studio (local, free)
  - OpenAI-compatible (cloud or local, depends on provider)

**Health Monitoring:**
- Per-endpoint circuit breakers (chat_completions:provider)
- Retry strategy: 3 attempts with exponential backoff (1s → 2s → 4s → 10s max)
- Health check methods for each provider

**Timeout Handling:**
- 90s for local LLMs
- 60s for cloud APIs

#### Provider Fallback Chain

**Refactored Architecture:**
- **Facade**: `js/services/provider-fallback-chain.js` (26 lines)
- **Implementation**: `js/services/fallback/` (5 files)
  - `config.js` - Fallback configuration
  - `health.js` - Health checks
  - `priority.js` - Priority ordering
  - `execution.js` - Fallback execution
  - `index.js` - Module coordinator

**Features:**
- Automatic fallback on provider failure
- Priority-based provider selection
- Health monitoring integration
- Circuit breaker pattern

### 4.3 RAG System

**Architecture** (`js/rag/`)

**Components:**
- `query-service.js` (370 lines) - RAG query orchestration
- `chunking-service.js` (457 lines) - Document chunking
- `rag-worker-pool.js` - Worker pool for parallel processing
- `checkpoint-manager.js` - Checkpoint management

**Query Flow:**
```
User Query
    ↓
RAGQueryService.query()
    ↓
1. Generate Embedding (LocalEmbeddings)
    ↓
2. Vector Search (LocalVectorStore.searchAsync)
    ↓
3. Rank Results (score thresholding, type boosting)
    ↓
4. Build Context (formatted for LLM)
    ↓
Return QueryResult
```

**Optimizations:**
- Async search for non-blocking UI
- Similarity threshold filtering (default 0.3)
- Type-based result boosting (10% for preferred types)
- Lazy module loading (LocalEmbeddings, LocalVectorStore on demand)

### 4.4 Embeddings System

**Architecture** (`js/embeddings/`)

**Components:**
- `embeddings-task-manager.js` (934 lines) - Background orchestration
- `embeddings-progress.js` - Progress tracking
- `embeddings-onboarding.js` - Onboarding flow

**Implementation:**
- 100% client-side using WASM-compiled transformers
- Model: Xenova/all-MiniLM-L6-v2
- Performance:
  - ~500ms for first query (model loading)
  - ~50ms for subsequent queries
  - No network latency
  - Works offline after initial model load

**Privacy:**
- No API calls to external services
- Queries processed locally
- No data transmitted

**Chunking Strategy:**
- Monthly summaries (top artists, stats)
- Artist profiles (history, patterns)
- Era summaries (emotional periods)

---

## 5. Function Execution System

### 5.1 Architecture Overview

The function execution system follows a **multi-layer facade pattern** with clear separation of concerns:

```
Functions Facade (index.js)
    ↓
SchemaRegistry (schema-registry.js)
    ↓
FunctionValidator (function-validator.js)
    ↓
FunctionExecutor (function-executor.js)
    ↓
TemplateExecutorRouter (template-executor-router.js)
    ↓
Specialized Executors (executors/)
```

### 5.2 Function Types

**1. Data Query Functions** (`executors/data-executors.js`)
- Query streaming data
- Filter and aggregate
- Return structured results

**2. Template Functions** (`executors/template-executors.js`)
- Predefined queries
- Don't require user streams
- Quick access to common patterns

**3. Analytics Functions** (`executors/analytics-executors.js`)
- Statistical analysis
- Pattern detection
- Trend analysis

**4. Artifact Functions** (`executors/artifact-executors.js`)
- Generate visualizations
- Create charts, timelines, tables
- Return artifact specs

**5. Playlist Functions** (`executors/playlist-executors.js`)
- Playlist generation
- Music recommendations
- Playlist analysis

**6. Semantic Functions** (`executors/semantic-executors.js`)
- Semantic search
- Natural language queries
- Context-aware retrieval

### 5.3 Execution Flow

```javascript
// 1. Schema Registration
SchemaRegistry.register(schema, 'function-name')

// 2. Validation
FunctionValidator.validateFunctionArgs('function-name', args)

// 3. Execution
FunctionExecutor.execute('function-name', args, streams, options)

// 4. Routing (if template function)
TemplateExecutorRouter.route('function-name', args)

// 5. Specialized Execution
DataExecutors.executeQuery(...)
AnalyticsExecutors.analyze(...)
// etc.
```

### 5.4 Tool Calling Strategies

**Architecture** (`js/services/tool-strategies/`)

**Strategies:**
1. **Native Strategy** - Uses provider's native function calling
2. **Prompt Injection Strategy** - Injects functions into system prompt
3. **Intent Extraction Strategy** - Extracts intent before function selection

**Strategy Voting:**
- Multiple strategies vote on best approach
- Conflict resolution
- Fallback to simpler strategy

---

## 6. Cross-Cutting Concerns

### 6.1 Worker Patterns

#### Vector Search Worker

**Purpose**: Offload cosine similarity computations

**Implementation** (`js/workers/vector-search-worker.js` ~331 lines)

**Features:**
- Single-loop optimization for performance
- SharedArrayBuffer support for zero-copy
- Bounds checking for security
- 100k+ vector support without blocking UI

**Command Pattern:**
```javascript
self.onmessage = function (event) {
    const { type, id, ...params } = event.data;

    switch (type) {
        case 'search':
            handleSearch(id, params);
            break;
        case 'search_shared':
            handleSearchShared(id, params);
            break;
        case 'ping':
            self.postMessage({ type: 'pong', id });
            break;
    }
};
```

#### Pattern Detection Worker

**Purpose**: Pattern detection algorithms in background thread

**Implementation** (`js/workers/pattern-worker.js` ~615 lines)

**HNW Wave Pattern: Partial Results**
```javascript
function detectAllPatterns(streams, chunks, onProgress = null, onPartial = null) {
    // Emit partial results as each pattern completes
    emitPartial('ratio', detectComfortDiscoveryRatio(streams));
    emitPartial('eras', detectEras(streams, chunks));
    // ... more patterns
}
```

**Pattern Algorithms:**
- Comfort/Discovery ratio detection
- Era detection (weekly artist overlap)
- Time-of-day patterns
- Weekday/weekend patterns
- Ghosted artists
- Discovery explosions
- Mood searching
- True favorites

#### Shared Worker Coordination

**Purpose**: Cross-tab coordination hub

**Implementation** (`js/workers/shared-worker.js` ~335 lines)

**Leadership Election:**
```javascript
function handleClaimPrimary(portId, tabId, claimId) {
    if (!currentLeader || currentLeader === tabId) {
        currentLeader = tabId;

        // Send acknowledgment FIRST (before broadcasting)
        port.postMessage({
            type: 'LEADER_GRANTED',
            leaderId: tabId,
            claimId,
            timestamp: Date.now()
        });

        // Then broadcast to all other tabs
        broadcastToAll({
            type: 'LEADER_ELECTED',
            leaderId: tabId,
            claimId
        }, portId);
    }
}
```

**ACK-Based Claims** (`js/workers/shared-worker-coordinator.js` ~526 lines):
```javascript
async function claimPrimary() {
    const claimId = `claim_${Date.now()}_${++claimIdCounter}`;

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingClaims.delete(claimId);
            reject(new Error('Leader claim timeout'));
        }, WORKER_TIMEOUTS.CLAIM_ACK_TIMEOUT_MS);

        pendingClaims.set(claimId, {
            resolve: (result) => {
                clearTimeout(timeout);
                resolve(result);
            },
            timestamp: Date.now()
        });

        workerPort.postMessage({
            type: 'CLAIM_PRIMARY',
            tabId,
            claimId
        });
    });
}
```

#### Pattern Worker Pool

**Purpose**: Worker pool management for parallel processing

**Implementation** (`js/workers/pattern-worker-pool/`)

**Components:**
- `pool-management.js` - Pool sizing, SharedArrayBuffer detection
- `worker-lifecycle.js` - Worker creation, termination, health monitoring
- `task-distribution.js` - Task scheduling, result aggregation, backpressure

**Optimal Worker Count:**
- Hardware concurrency detection
- SharedArrayBuffer availability check
- Adaptive pool sizing

### 6.2 Observability System

#### Core Web Vitals Tracking

**Metrics Tracked** (`js/observability/core-web-vitals.js` ~680 lines):
- **CLS** (Cumulative Layout Shift) - Visual stability
- **FID** (First Input Delay) - Interactivity
- **LCP** (Largest Contentful Paint) - Loading performance
- **INP** (Interaction to Next Paint) - Responsiveness
- **TTFB** (Time to First Byte) - Server response
- **FCP** (First Contentful Paint) - Initial paint

**Architecture:**
```javascript
class CoreWebVitalsTracker {
    constructor({ enabled = true, maxMetrics = 100 } = {}) {
        this._enabled = enabled && this._isPerformanceAPIAvailable();
        this._metrics = new Map();
        this._latestMetrics = new Map();
        this._maxMetrics = maxMetrics;
    }

    _initializeTracking() {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                this._handlePerformanceEntry(entry);
            }
        });

        observer.observe({ type: 'layout-shift', buffered: true });
        observer.observe({ type: 'first-input', buffered: true });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
        // ... more observations
    }
}
```

#### Metrics Export System

**Modular Architecture** (`js/observability/metrics-exporter/`)

**Decomposed from 1,140-line god object into:**
- `metrics-aggregator.js` (405 lines) - Statistics, time-window aggregation
- `metrics-formatters.js` (330 lines) - Format conversions
- `export-strategies.js` (426 lines) - Push/pull/batch/retry
- `metrics-exporter.js` (951 lines → 210 lines facade) - Simplified facade

**Export Formats:**
- **JSON** - Full metrics export
- **CSV** - Spreadsheet compatible
- **Prometheus** - Monitoring systems
- **InfluxDB** - Time-series database
- **StatsD** - StatsD protocol

**External Service Integration:**
```javascript
async _sendToExternalServices(data, config, rawMetrics = null) {
    for (const serviceConfig of this._externalServices) {
        await this._strategies.pushExport(serviceConfig.endpoint, data, {
            headers: serviceConfig.headers,
            timeout: serviceConfig.timeout
        });
    }
}
```

**Credential Encryption:**
```javascript
async _encryptExternalServices(services) {
    for (const service of services) {
        if (service.credentials && Object.keys(service.credentials).length > 0) {
            const key = await this._deriveEncryptionKey();
            const iv = crypto.getRandomValues(new Uint8Array(12));

            const encryptedData = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                key,
                encoder.encode(JSON.stringify(service.credentials))
            );

            encryptedService.credentials = {
                encrypted: Array.from(new Uint8Array(encryptedData)),
                iv: Array.from(iv),
                algorithm: 'AES-GCM'
            };
        }
    }
}
```

#### Performance Profiling

**EventBus Integration** (`js/observability/init-observability.js`):
```javascript
function setupEventBusIntegration() {
    eventBusUnsubscribers = [
        EventBus.on('data:streams_loaded', handleDataStreamsLoaded),
        EventBus.on('pattern:all_complete', handlePatternDetectionComplete),
        EventBus.on('embedding:generation_complete', handleEmbeddingGenerated)
    ];
}
```

**Performance Budgets:**
- Chat: 5 seconds threshold
- Storage: 100ms threshold
- Pattern detection: 300ms threshold
- Semantic search: 200ms threshold
- Embedding generation: 500ms threshold

### 6.3 Settings Management

**Architecture** (`js/settings/`)

**Components:**
- `index.js` (359 lines) - Settings management, cross-tab sync, modal UI
- OAuth manager for Spotify integration

**Hierarchy:**
```javascript
function buildDefaults() {
    return {
        llm: {
            provider: configOpenrouter.apiKey ? PROVIDER_ID.OPENROUTER
                     : (configGemini.apiKey ? PROVIDER_ID.GEMINI
                     : PROVIDER_ID.OLLAMA),
            openrouterApiKey: configOpenrouter.apiKey || '',
            geminiApiKey: configGemini.apiKey || '',
            // ...
        },
        spotify: {
            clientId: configSpotify.clientId || '',
            redirectUri: configSpotify.redirectUri || ''
        }
    };
}
```

**Cross-Tab Synchronization:**
```javascript
function initCrossTabSync() {
    window.addEventListener('storage', (e) => {
        if (e.key === 'rhythm_chamber_settings_version') {
            getSettingsAsync().then(settings => {
                _cachedSettings = settings;
                EventBus.emit('settings:changed', settings);
            });
        }
    });
}
```

---

## 7. Dependency Injection & IoC Container

### 7.1 Container Implementation

**Location**: `js/app/index.js` (lines 41-69)

**Pattern**:
```javascript
const Container = {
    _services: new Map(),
    _controllers: new Map(),

    registerInstance(name, instance) {
        _services.set(name, instance);
    },

    registerController(name, controller) {
        _controllers.set(name, controller);
    },

    initController(controllerName, depNames) {
        const controller = _controllers.get(controllerName);
        const dependencies = {};

        for (const depName of depNames) {
            dependencies[depName] = _services.get(depName);
        }

        controller.init(dependencies);
    }
};
```

### 7.2 Benefits

**Centralized Service Registration:**
- Single source of truth for dependencies
- Easy to see what each controller needs
- No manual dependency injection in app.js

**Dependency Injection via init():**
- Testable (dependencies can be mocked)
- Explicit dependency declaration
- Clear public API surface

**Initialization Order:**
1. Security context check
2. AppState initialization
3. Storage initialization
4. TabCoordinator initialization
5. SessionManager initialization
6. Container registration
7. Controller initialization
8. UI event binding

### 7.3 Controller Initialization Pattern

All controllers follow this pattern:

```javascript
// Dependencies (injected via init)
let _Dependency1 = null;
let _Dependency2 = null;

function init(dependencies) {
    _Dependency1 = dependencies.Dependency1;
    _Dependency2 = dependencies.Dependency2;
}

// Public API exports
export const ControllerName = {
    init,
    method1,
    method2
};
```

### 7.4 Adding New Dependencies

**To Add a New Controller:**
1. Import the controller in `app.js`
2. Register it in `registerContainerServices()`
3. Add dependency mapping in `initializeControllers()`

**To Add a New Dependency to Existing Controller:**
Simply add the dependency name to the controller's array in `controllerDependencies`

### 7.5 Testing Support

The IoC container supports testing through:
1. **Clear method** - Reset state between tests
2. **Child containers** - Isolated test environments
3. **Instance override** - Swap implementations for mocking

---

## 8. Integration Patterns

### 8.1 Event-Driven Communication

**Controllers communicate through EventBus for loose coupling:**
```javascript
// Controller emits event
EventBus.emit('chat:message-sent', message)

// Other controller listens
EventBus.on('chat:message-sent', (message) => {
    this.handleMessage(message)
})
```

### 8.2 State Management Pattern

**Controllers interact with AppState through consistent API:**
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

### 8.3 Error Handling Pattern

**Services use enhanced error handling:**
```javascript
service.operation(data)
  .then(result => EventBus.emit('operation:success', result))
  .catch(error => MessageErrorHandler.handleError(error, context))
  .finally(() => EventBus.emit('operation:complete'))
```

### 8.4 Retry Pattern

**Services use retry with circuit breaker:**
```javascript
RetryManager.execute(() => {
  return service.operation(data)
}, {
  maxAttempts: 3,
  delay: 'exponential',
  shouldRetry: (error) => error.type === 'network'
})
```

---

## 9. Performance Optimizations

### 9.1 State Management Optimizations

**Selective Freezing:**
- Development: Deep freeze to catch mutations
- Production: Shallow freeze for large data domains

**Batched Updates:**
- Multiple state updates batched into single notification
- Uses `queueMicrotask` for predictable timing

**Changed Domain Tracking:**
- Subscribers only notified for their domain
- Reduces redundant re-renders

### 9.2 Storage Optimizations

**Lazy Loading:**
- On-demand service initialization
- Dynamic imports for heavy modules
- Deferred schema loading

**Caching:**
- LRU cache for storage operations
- Response caching for API calls
- Schema caching for validation

**Memory Management:**
- Stream archival for quota management
- Pinned items to prevent eviction during processing
- Backpressure handling in file uploads

### 9.3 Worker Optimizations

**Zero-Copy Memory Transfer:**
- SharedArrayBuffer support for vector search
- Bounds checking for security
- Fallback to structured clone when unavailable

**Parallel Processing:**
- Pattern detection in worker pool
- Task distribution and result aggregation
- Adaptive pool sizing based on hardware concurrency

**Partial Results:**
- HNW Wave pattern for pattern detection
- Emit results as each pattern completes
- Better user feedback during long operations

### 9.4 Function Execution Optimizations

**Token Management:**
- Client-side token counting
- Context window optimization
- Truncation strategies
- Cost tracking

**Lazy Module Loading:**
- LocalEmbeddings loaded on demand
- LocalVectorStore loaded on demand
- Reduces initial bundle size

---

## 10. Security Architecture

### 10.1 Zero-Backend Security Model

**Three Pillars:**
1. **Emotional Value** - Preserving narrative continuity
2. **Privacy Value** - 100% client-side processing
3. **Control Value** - User-owned intelligence and data

### 10.2 Cryptographic Implementations

**Key Management** (`js/security/key-manager.js` ~651 lines)
- **PBKDF2-210k iterations** (exceeds OWASP 2023 recommendations)
- **Non-extractable keys** (cannot be exported from memory)
- **Three-tier key system**:
  - Session Key (AES-GCM-256) - General crypto operations
  - Data Encryption Key (AES-GCM-256) - Storage encryption
  - Signing Key (HMAC-SHA256) - Message authentication

**Hybrid Encryption** (`js/security/hybrid-encryption.js` ~428 lines)
- RSA-OAEP-2048 for key transport
- AES-GCM-256 for data encryption
- End-to-end secure messaging

**Message Security** (`js/security/message-security.js` ~698 lines)
- HMAC-SHA256 message signing
- Replay prevention (nonce tracking, 5-minute window)
- Constant-time comparison (prevents timing attacks)
- Timestamp validation

### 10.3 Token Security

**Device Binding** (`js/security/token-binding.js` ~353 lines)
- SHA-256 fingerprints
- Stable UUID-based device ID
- Session salt for isolation

**Secure Token Store** (`js/security/secure-token-store.js` ~743 lines)
- Single authority token management
- Device binding
- Mandatory verification
- Audit logging

### 10.4 OAuth Security

**PKCE Flow** (`js/spotify/oauth-manager.js` ~273 lines)
- RFC 7636 compliant
- Rejection sampling for modulo bias prevention
- State parameter for CSRF protection
- State verification on callback

**Security Improvements (v0.9 Milestone):**
- Removed localStorage fallback for PKCE verifier
- State parameter added
- State verification enforced

### 10.5 Fail-Closed Design

```javascript
if (!IndexedDBCore) {
    const error = new Error(
        '[SecureTokenStore] IndexedDB is required for secure token storage. ' +
        'localStorage fallback has been removed for security reasons.'
    );
    console.error(error.message);
    audit('token_store_blocked', { tokenKey, reason: 'indexeddb_unavailable' });
    return false; // FAILS CLOSED
}
```

### 10.6 Security Limitations

**Client-Side Limitations** (cannot protect against):
- Full memory introspection (browser DevTools)
- Browser extension attacks
- Compromised browser
- Physical device access

**No Forward Secrecy:**
- Session salt provides isolation but not true forward secrecy
- Would require ephemeral key exchange

---

## 11. Testing & Quality Assurance

### 11.1 Testability

**Dependency Injection:**
- All services use `init()` for dependency injection
- Loose coupling enables mocking
- Explicit dependencies

**Pure Functions:**
- Validation utilities are pure functions
- Easy to test in isolation

**Isolated Modules:**
- Clear interfaces between modules
- Facade patterns for internal complexity
- Event-driven architecture for loose coupling

### 11.2 Characterization Tests

**Purpose**: Document actual behavior vs intended behavior

**Coverage:**
- ObservabilityController (Phase 3.2)
- ProviderFallbackChain (Phase 2.2)
- Extensive test coverage for critical paths

### 11.3 Security Audits

**DOM XSS Analysis** (Phase 3.1):
- All findings are false positives
- Event delegation pattern prevents XSS
- HTML escaping via centralized utility
- Static HTML literals (no user input in templates)

**ReDoS Vulnerability Fix**:
- AST-based regex detection
- Comprehensive fix documentation
- Test coverage for ReDoS patterns

### 11.4 Code Quality

**Strengths:**
- Clean separation of concerns
- Extensive refactoring to address anti-patterns
- Facade pattern for backward compatibility
- Comprehensive error handling
- Multiple resilience patterns

**Technical Debt:**
- Some documentation currency issues
- Service catalog needs update for refactored modules
- Controller catalog needs new entries (ObservabilityController, CustomProfileController)

---

## Appendix A: File Inventory

### A.1 Core Application Files

```
js/
├── app/
│   └── index.js (452 lines) - Application bootstrap, IoC container
├── state/
│   └── app-state.js (605 lines) - HNW state management
├── controllers/ (15 controllers)
│   ├── reset-controller.js (371 lines)
│   ├── view-controller.js (497 lines)
│   ├── custom-profile-controller.js (414 lines)
│   ├── demo-controller.js (812 lines)
│   ├── file-upload-controller.js (489 lines)
│   ├── spotify-controller.js (340 lines)
│   ├── sidebar-controller.js (732 lines)
│   ├── message-actions.js (268 lines)
│   ├── artifact-renderer.js (138 lines)
│   ├── chat-input-manager.js (113 lines)
│   ├── chat-ui-controller.js (80 lines)
│   ├── streaming-message-handler.js (423 lines)
│   ├── premium-controller.js (464 lines)
│   ├── message-renderer.js (95 lines)
│   └── observability-controller.js (1109 lines)
├── services/ (80+ services)
│   ├── message-lifecycle-coordinator.js (~674 lines)
│   ├── llm-api-orchestrator.js (~240 lines)
│   ├── provider-fallback-chain.js (26 lines - facade)
│   ├── fallback/ (5 files - refactored module)
│   ├── session-manager/ (3 files - refactored module)
│   ├── tab-coordination/ (4 files - refactored module)
│   ├── storage-degradation/ (4 files - refactored module)
│   ├── tool-strategies/ (5 files - refactored module)
│   └── ... (60+ more service files)
├── storage/ (18 files)
│   ├── indexeddb.js (1349 lines)
│   ├── fallback-backend.js (572 lines)
│   ├── write-ahead-log.js (1017 lines)
│   ├── event-log-store.js (599 lines)
│   ├── migration.js (703 lines)
│   ├── archive-service.js (464 lines)
│   ├── quota-manager.js (560 lines)
│   ├── transaction/ (5 files - 2PC implementation)
│   └── ... (6 more utility files)
├── providers/ (11 files)
│   ├── provider-interface.js (1103 lines)
│   ├── openrouter.js
│   ├── ollama-adapter.js
│   ├── gemini.js
│   ├── openai-compatible.js
│   └── ... (6 more provider files)
├── rag/ (4 files)
│   ├── query-service.js (370 lines)
│   ├── chunking-service.js (457 lines)
│   └── ... (2 more files)
├── embeddings/ (3 files)
│   ├── embeddings-task-manager.js (934 lines)
│   └── ... (2 more files)
├── functions/ (21 files)
│   ├── index.js (facade)
│   ├── function-executor.js
│   ├── function-validator.js
│   ├── executors/ (7 files)
│   ├── schemas/ (7 files)
│   └── ... (5 more files)
├── utils/ (21 files)
│   ├── error-handling.js (facade)
│   ├── error-handling/ (4 files - refactored module)
│   ├── validation.js (facade)
│   ├── validation/ (6 files - refactored module)
│   ├── retry-manager.js
│   ├── resilient-retry.js
│   ├── adaptive-rate-limiter.js
│   └── ... (14 more utility files)
├── security/ (7 files)
│   ├── secure-token-store.js (743 lines)
│   ├── hybrid-encryption.js (428 lines)
│   ├── license-verifier.js (542 lines)
│   ├── message-security.js (698 lines)
│   ├── key-manager.js (651 lines)
│   └── ... (2 more files)
├── observability/ (11 files)
│   ├── init-observability.js (359 lines)
│   ├── core-web-vitals.js (680 lines)
│   ├── metrics-exporter.js (951 lines → 210 lines facade)
│   ├── metrics-exporter/ (3 files - refactored module)
│   └── ... (6 more files)
├── workers/ (8 files)
│   ├── vector-search-worker.js (331 lines)
│   ├── shared-worker.js (335 lines)
│   ├── pattern-worker.js (615 lines)
│   ├── shared-worker-coordinator.js (526 lines)
│   └── ... (4 more files)
└── settings/ (1 file)
    └── index.js (359 lines)
```

**Total JavaScript Files: 268 files**

### A.2 Documentation Files

```
docs/
├── 01-product-vision.md
├── 02-user-experience.md
├── 03-technical-architecture.md (107,566 bytes)
├── 04-intelligence-engine.md
├── 05-roadmap-and-risks.md
├── 06-advanced-features.md
├── API_SETUP.md
├── DEPLOYMENT.md
├── ENCRYPTION-MIGRATION.md
├── LEMON_SQUEEZY_SETUP.md
├── adr/ (6 Architecture Decision Records)
├── controller-catalog.md (834 lines - TO BE CONSOLIDATED INTO THIS FILE)
├── ioc-container-implementation-guide.md (264 lines - TO BE CONSOLIDATED INTO THIS FILE)
├── service-catalog.md (919 lines - TO BE CONSOLIDATED INTO THIS FILE)
├── utility-reference.md (842 lines - TO BE CONSOLIDATED INTO THIS FILE)
└── user-journeys/ (6 persona files - KEEP SEPARATE)
```

---

## Appendix B: Glossary

**HNW Pattern**: Hierarchy-Network-Wave state management pattern
- **Hierarchy**: Single source of truth with explicit mutation authority
- **Network**: Subscribe pattern for loose coupling
- **Wave**: Batched async updates for predictable timing

**BYOI**: Bring Your Own Intelligence - User chooses AI provider (local or cloud)

**RAG**: Retrieval-Augmented Generation - Semantic search + LLM

**2PC**: Two-Phase Commit - Transaction protocol for atomicity

**WAL**: Write-Ahead Logging - Crash recovery mechanism

**PKCE**: Proof Key for Code Exchange - OAuth security flow

**SSE**: Server-Sent Events - Streaming response format

**XSS**: Cross-Site Scripting - Security vulnerability

**TOCTOU**: Time-of-Check-to-Time-of-Use - Race condition type

**ReDoS**: Regular Expression Denial of Service - Security vulnerability

**CORS**: Cross-Origin Resource Sharing - Browser security

**COOP/COEP**: Cross-Origin Opener Policy / Cross-Origin Embedder Policy - Security headers for SharedArrayBuffer

---

**END OF ARCHITECTURE DOCUMENT**
