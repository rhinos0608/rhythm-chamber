# Architecture

**Analysis Date:** 2025-01-21

## Pattern Overview

**Overall:** Client-Side SPA with HNW Modular Architecture

**Key Characteristics:**
- Zero-backend architecture (100% client-side processing)
- HNW (Hierarchy-Network-Wave) modular design pattern
- ES Module-based dependency injection
- Multi-tab coordination with authority hierarchy
- Security-first with fail-closed architecture
- Bring Your Own AI (BYOI) provider abstraction
- Worker-based heavy computation (embeddings, pattern detection)

## Layers

**Security Layer:**
- Purpose: Fail-closed security, encryption, prototype pollution protection
- Location: `js/security/`
- Contains: Encryption, token binding, anomaly detection, recovery handlers
- Depends on: Browser crypto APIs, secure context detection
- Used by: All modules for security checks, data encryption

**Storage Layer:**
- Purpose: Data persistence with multi-tab safety
- Location: `js/storage/`
- Contains: IndexedDB wrapper, transaction management, write-ahead logging, event replay
- Depends on: TabCoordinator for authority, EventBus for notifications
- Used by: All modules requiring persistent data

**State Management Layer:**
- Purpose: Centralized application state with immutable state snapshots
- Location: `js/state/app-state.js`
- Contains: View state, data state, UI state, operations state
- Depends on: No dependencies (foundation layer)
- Used by: Controllers, services for reactive updates

**Provider Layer:**
- Purpose: Multi-provider AI abstraction (Bring Your Own AI)
- Location: `js/providers/`
- Contains: OpenRouter, Ollama, LM Studio, Gemini adapters
- Depends on: ModuleRegistry for lazy loading, provider circuit breaker
- Used by: Chat, RAG for AI requests

**Service Layer:**
- Purpose: Cross-cutting business logic and coordination
- Location: `js/services/`
- Contains: Tab coordination, session management, event bus, tool strategies
- Depends on: Storage, State, Security layers
- Used by: Controllers, other services

**Controller Layer:**
- Purpose: UI orchestration and user interaction handling
- Location: `js/controllers/`
- Contains: Chat, sidebar, view, file upload, Spotify controllers
- Depends on: Services, State, Storage
- Used by: Main app initialization

**Worker Layer:**
- Purpose: Heavy computation offloading (embeddings, pattern detection)
- Location: `js/workers/`
- Contains: Pattern workers, vector search workers, embedding workers
- Depends on: Core logic modules (Patterns, RAG)
- Used by: Main thread for background processing

## Data Flow

**Application Initialization Flow:**

1. **Security Check** (`js/main.js`) - Validates secure context before any imports
2. **Config Loading** (`js/services/config-loader.js`) - Loads configuration with retry logic
3. **Module Import** - ES module imports in dependency order via `js/main.js`
4. **State Initialization** (`js/state/app-state.js`) - Sets up centralized state
5. **Tab Coordination** (`js/services/tab-coordination.js`) - Establishes multi-tab authority
6. **Storage Validation** - Checks data consistency and migrations
7. **Controller Bootstrap** - Initializes all controllers with dependencies
8. **UI Rendering** - Shows appropriate view based on URL params and existing data

**Chat Interaction Flow:**

1. **User Input** → ChatUIController (`js/controllers/chat-ui-controller.js`)
2. **Message Lifecycle** → MessageLifecycleCoordinator (`js/services/message-lifecycle-coordinator.js`)
3. **Orchestration** → ConversationOrchestrator (`js/services/conversation-orchestrator.js`)
4. **Tool Selection** → ToolStrategies (`js/services/tool-strategies/`)
5. **Provider Routing** → LLMProviderRoutingService (`js/services/llm-provider-routing-service.js`)
6. **AI Request** → ProviderInterface (`js/providers/provider-interface.js`)
7. **Data Queries** → Functions system (`js/functions/`)
8. **Response Processing** → Token counting, error handling, fallback
9. **UI Update** → ChatUIController renders response

**File Upload Flow:**

1. **File Selection** → FileUploadController (`js/controllers/file-upload-controller.js`)
2. **Parsing** → Parser with worker support (`js/parser.js`, `js/parser-worker.js`)
3. **Pattern Detection** → Patterns module with worker pool (`js/patterns.js`, `js/workers/`)
4. **Personality Classification** → Personality module (`js/personality.js`)
5. **Storage** → IndexedDB with transaction safety (`js/storage/`)
6. **State Update** → AppState with reactive notifications
7. **View Transition** → ViewController shows reveal/chat

**State Management:**
- Centralized in `AppState` (js/state/app-state.js)
- Immutable state objects with frozen snapshots
- Subscribe pattern for reactive updates
- Multi-tab coordination prevents conflicting writes
- Event-driven via EventBus for loose coupling

## Key Abstractions

**HNW Modular Architecture:**
- Purpose: Structural pattern for scalable, maintainable code
- Examples: `js/main.js`, `js/app.js`, all service modules
- Pattern: Hierarchy (clear authority), Network (loose coupling via EventBus), Wave (async batched updates)

**Provider Interface Pattern:**
- Purpose: Unified abstraction for multiple AI providers
- Examples: `js/providers/provider-interface.js`, individual provider adapters
- Pattern: Strategy pattern with circuit breaker and fallback chains

**Tool Strategy Pattern:**
- Purpose: Function calling with multiple execution strategies
- Examples: `js/services/tool-strategies/native-strategy.js`, `intent-extraction-strategy.js`
- Pattern: Strategy selection based on provider capabilities and user intent

**Controller Pattern:**
- Purpose: Orchestrate UI interactions with business logic
- Examples: `js/controllers/chat-ui-controller.js`, `view-controller.js`
- Pattern: Dependency injection, event delegation, clear separation from services

**Worker Coordination Pattern:**
- Purpose: Heavy computation without blocking UI
- Examples: `js/workers/pattern-worker-pool.js`, `js/workers/vector-search-worker.js`
- Pattern: Pool-based worker management with shared worker coordination

## Entry Points

**`index.html`:**
- Location: Project root
- Triggers: Landing page access
- Responsibilities: Marketing content, demo mode entry, settings access

**`app.html`:**
- Location: Project root
- Triggers: Main application access
- Responsibilities: Main app container, loads `js/main.js`

**`js/main.js`:**
- Location: `js/main.js`
- Triggers: Application startup
- Responsibilities: Security validation, module imports, bootstrap coordination, lazy loading setup

**`js/app.js`:**
- Location: `js/app.js`
- Triggers: Called by main.js after security passes
- Responsibilities: Controller initialization, event setup, view routing, data loading

## Error Handling

**Strategy:** Fail-closed with graceful degradation

**Patterns:**
- Security checks abort immediately with clear error UI
- Circuit breakers prevent cascade failures (ProviderCircuitBreaker)
- Error recovery coordinators attempt automatic recovery
- Fallback responses for LLM failures (FallbackResponseService)
- Safe mode for security module failures (Security fallback stubs)
- Event replay for multi-tab coordination recovery
- Prototype pollution protection via object freezing

## Cross-Cutting Concerns

**Logging:** EventBus-based event logging with EventLogStore for replay coordination
**Validation:** Input validation in controllers, dependency checks in app.js
**Authentication:** Spotify OAuth flow, secure token storage with token binding
**Multi-tab Safety:** TabCoordinator with BroadcastChannel coordination
**Performance:** Worker-based heavy computation, lazy module loading, LRU caching
**Observability:** Core Web Vitals tracking, performance profiling, metrics export

---

*Architecture analysis: 2025-01-21*