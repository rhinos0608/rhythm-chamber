# AI Agent Reference — Rhythm Chamber

> **Status:** v2.0 Enhanced Architecture Complete — 250+ Source Files
> - **15 Controllers**: Modular UI components for focused functionality
> - **25+ Services**: Comprehensive business logic with enhanced error handling
> - **13+ Utilities**: Enhanced reliability and performance utilities
> - **Advanced Error Handling**: Intelligent classification and recovery systems
> - **Enhanced Streaming**: Real-time message processing with proper buffering
> - **Security v2.0**: Enhanced validation, adaptive rate limiting, and protection

---

## Quick Context

**What is this?**
Music analytics app that tells users what their listening says about them — like Spotify Wrapped but deeper, year-round, and conversational.

**Core flow (Full):**
`Landing → Upload .zip/.json → Personality Reveal → Chat → Share Card`

**Core flow (Lite/Quick Snapshot):**
`Landing → Spotify OAuth → Quick Snapshot Reveal → Upsell to Full`

**Tech stack:**
Modern client-side: Static HTML/CSS/ES6 Modules + IndexedDB + Web Workers + WASM Semantic Search + Enhanced error handling + Multiple AI providers + Real-time streaming

---

## Monetization Strategy

**Philosophy:** Zero-friction overlay checkout with community-first growth. Build a base of enthusiasts, then scale to premium managed features.

### Two-Tier Premium Model

| Tier | Price | Features | Purpose |
|------|------|----------|---------|
| **Sovereign (Free)** | **$0** | Local AI only, manual data import, basic chat, manual profile creation | Build community, validate product |
| **Chamber** | **$4.99/mo** | Spotify OAuth integration, cloud AI access, AI-generated profiles, artifact visualizations, advanced analytics, enhanced streaming, real-time analytics | Recurring revenue, sustainable operations |

### License Verification System

**Implementation:** Lemon Squeezy + Cloudflare Worker + Client-side validation

**Architecture:**
```
Client App → License Verifier → Cloudflare Worker → Lemon Squeezy API
     ↓                ↓                    ↓
 Local Cache   Device Binding      HMAC Signature Validation
```

**Flow:**
1. Client validates license key format
2. Cloudflare Worker verifies with Lemon Squeezy API
3. License bound to device fingerprint (SHA-256)
4. Result cached for 24 hours locally
5. Graceful fallback to Sovereign tier if validation fails

**Documentation:** See [docs/license-verification.md](docs/license-verification.md) and [docs/premium-features-guide.md](docs/premium-features-guide.md)

### Payment Integration: Lemon Squeezy

**Why Lemon Squeezy?**
- **Overlay checkout** - Stays IN your app (no page redirects)
- **Built-in license keys** - Automatic generation and validation API
- **No backend required** - Can validate client-side with crypto fallback
- **Merchant of Record** - Handles global tax/VAT automatically

**Implementation:**
- **Lemon.js Script:** `https://app.lemonsqueezy.com/js/lemon.js`
- **Service:** `js/services/lemon-squeezy-service.js`
- **Worker:** `workers/license-validator/index.js` (Cloudflare Worker for secure validation)
- **Setup Guide:** `docs/LEMON_SQUEEZY_SETUP.md`

---

## File Structure

```
├── index.html              # Landing page
├── app.html                # Main app
├── css/styles.css          # Design system
├── js/
│   ├── main.js             # Entry point, bootstrap
│   ├── app.js              # Main orchestrator
│   ├── storage.js          # Storage facade
│   ├── security.js         # Security facade
│   ├── settings.js         # Settings modal
│   ├── spotify.js          # Spotify OAuth + API
│   │
│   ├── controllers/        # UI Controllers (15)
│   │   ├── chat-ui-controller.js          # Message rendering, streaming
│   │   ├── sidebar-controller.js          # Session management
│   │   ├── view-controller.js             # View transitions
│   │   ├── file-upload-controller.js       # File processing
│   │   ├── spotify-controller.js           # Spotify API
│   │   ├── demo-controller.js              # Demo mode
│   │   ├── reset-controller.js             # Reset operations
│   │   ├── message-renderer.js             # Advanced rendering
│   │   ├── streaming-message-handler.js    # Real-time streaming
│   │   ├── chat-input-manager.js          # Input handling
│   │   ├── message-actions.js             # Message interactions
│   │   ├── artifact-renderer.js           # Data visualization
│   │   ├── error-boundary-controller.js   # Error handling
│   │   ├── streaming-controller.js        # Stream coordination
│   │   └── analytics-controller.js        # User tracking
│   │
│   ├── services/           # Business Logic Services (25+)
│   │   ├── event-bus.js                   # Centralized typed events
│   │   ├── session-manager.js             # Session lifecycle
│   │   ├── tab-coordination.js            # Cross-tab coordination
│   │   ├── token-counting-service.js      # Token management
│   │   ├── tool-call-handling-service.js   # Tool execution
│   │   ├── llm-provider-routing-service.js # Provider routing
│   │   ├── fallback-response-service.js   # Fallback generation
│   │   ├── state-machine-coordinator.js   # State transitions
│   │   ├── lock-policy-coordinator.js     # Conflict resolution
│   │   ├── timeout-budget-manager.js      # Timeout management
│   │   ├── turn-queue.js                  # Message serialization
│   │   ├── pattern-stream.js              # Pattern display
│   │   ├── profile-sharing.js             # Profile encryption
│   │   ├── pattern-comparison.js           # Collaborative analysis
│   │   ├── temporal-analysis.js           # Trend analysis
│   │   ├── playlist-generator.js          # AI recommendations
│   │   ├── llm-api-orchestrator.js       # Enhanced routing
│   │   ├── message-error-handler.js       # Error classification
│   │   ├── message-validator.js           # Advanced validation
│   │   ├── stream-processor.js            # Real-time processing
│   │   ├── adaptive-circuit-breaker.js    # Adaptive thresholds
│   │   ├── retry-manager.js               # Enhanced retry
│   │   ├── rate-limiter.js                # Adaptive limiting
│   │   ├── security-service.js            # Enhanced monitoring
│   │   ├── provider-health-monitor.js     # 2-second health checks
│   │   └── provider-notification-service.js # User guidance
│   │
│   ├── utils/              # Enhanced Utilities (13+)
│   │   ├── error-handling.js              # Error classification
│   │   ├── error-handler.js               # Centralized logging
│   │   ├── retry-manager.js               # Enhanced retry
│   │   ├── resilient-retry.js             # Circuit integration
│   │   ├── adaptive-rate-limiter.js       # Dynamic adjustment
│   │   ├── validation.js                  # Advanced validation
│   │   ├── schema-registry.js             # Schema management
│   │   ├── function-validator.js          # Runtime validation
│   │   ├── stream-buffer.js               # Efficient buffering
│   │   ├── parser.js                       # Data parsing
│   │   ├── function-executor.js           # Safe execution
│   │   ├── semantic-executors.js          # Specialized queries
│   │   └── logger.js                       # Structured logging
│   │
│   ├── storage/            # Storage Submodules
│   │   ├── indexeddb.js                   # Core DB operations
│   │   ├── config-api.js                  # Config & tokens
│   │   ├── migration.js                    # localStorage migration
│   │   ├── transaction.js                  # Multi-backend atomic transactions
│   │   ├── write-ahead-log.js              # Crash recovery
│   │   ├── event-log-store.js              # Event replay
│   │   ├── connection-manager.js           # Enhanced connection handling
│   │   └── ...
│   │
│   ├── security/           # Security Submodules
│   │   ├── index.js                       # Facade
│   │   ├── security-coordinator.js        # Initialization
│   │   ├── message-security.js            # HMAC-SHA256 signing
│   │   ├── encryption.js                  # AES-GCM encryption
│   │   ├── key-manager.js                 # Non-extractable keys
│   │   └── ...
│   │
│   ├── state/              # State Management
│   │   └── app-state.js                   # Centralized state
│   │
│   ├── workers/            # Web Workers
│   │   ├── vector-search-worker.js        # Semantic search
│   │   ├── pattern-worker-pool.js         # Parallel processing
│   │   ├── shared-worker-coordinator.js   # Cross-tab coordination
│   │   └── pattern-worker.js              # Individual processing
│   │
│   ├── artifacts/          # Inline Visualizations
│   │   ├── index.js                       # Facade (validate, render)
│   │   ├── artifact-spec.js               # Schema builders
│   │   ├── validation.js                  # Allowlist + sanitization
│   │   └── renderer.js                    # Custom SVG renderer
│   │
│   ├── functions/          # Function Calling
│   ├── providers/          # LLM Providers
│   └── observability/      # Performance monitoring
│
├── tests/                  # Vitest unit tests
└── docs/                   # Additional documentation
```

---

## Technical Architecture Deep Dive

### 1. Core Application Architecture

**Pattern:** ES6 modular architecture following **Hierarchical Network Wave (HNW)** with Controller-Service-Model organization and event-driven communication.

#### Initialization Flow (`js/main.js`)
1. Security validation (secure context check first)
2. AppState initialization
3. Dependency checking (early-fail pattern)
4. Tab coordination setup
5. Storage initialization
6. Controller initialization (via IoC Container)
7. Event system setup
8. OAuth/mode handling

#### IoC Container Pattern

The application uses a custom **IoC (Inversion of Control) Container** for dependency injection:

```javascript
// Service Registration
container.register('Storage', () => new Storage());
container.register('AppState', () => new AppState());
container.register('Chat', () => new Chat());

// Controller Initialization with Auto-wiring
const chatController = new ChatUIController({
  chat: container.resolve('Chat'),
  artifacts: container.resolve('Artifacts')
});
```

**Benefits:**
- Centralized dependency management
- Easier testing with mock injection
- Clear dependency graph
- Singleton service lifecycle

#### Enhanced Controllers (`js/controllers/` - 15 Controllers)
**Core Controllers (7):**
- `ChatUIController` - Message rendering, streaming, markdown, artifacts
- `SidebarController` - Session management, navigation, search
- `ViewController` - View transitions, navigation history
- `FileUploadController` - File processing, validation, race condition fixes
- `SpotifyController` - OAuth flow, data fetching, validation
- `DemoController` - Demo mode, sample data, transitions
- `ResetController` - Data reset, confirmation, cleanup

**Advanced Controllers (8):**
- `MessageRenderer` - Advanced rendering, animations, performance optimization
- `StreamingMessageHandler` - Real-time streaming, buffering, error recovery
- `ChatInputManager` - Input validation, auto-suggestions, history
- `MessageActions` - Message interactions, context management, regeneration
- `ArtifactRenderer` - Data visualization, charts, user interaction
- `ErrorBoundaryController` - Error boundaries, recovery, user feedback
- `StreamingController` - Multi-stream coordination, synchronization
- `AnalyticsController` - Event tracking, behavior analysis, insights

#### Enhanced Event System (`js/services/event-bus.js`)
- **Typed events**: Schema validation for type safety
- **Priority dispatch**: CRITICAL, HIGH, NORMAL, LOW with circuit breaker
- **Enhanced circuit breaker**: Storm detection, adaptive thresholds, overflow handling
- **Per-handler circuit breakers**: Individual failure tracking and isolation
- **Domain filtering**: Scoped event delivery with filtering
- **Async modes**: sync, async, await-all, parallel with error recovery
- **Enhanced debugging**: Event tracing, performance monitoring

#### Enhanced State Management (`js/state/app-state.js`)
```javascript
const INITIAL_STATE = {
    view: { current, previous },      // Current screen
    data: { streams, chunks, patterns, personality },
    lite: { isLiteMode },
    ui: { sidebarCollapsed },
    operations: { isProcessing },
    demo: { isDemoMode },
    // Enhanced v2.0 state
    streaming: { isStreaming, buffers, speed },
    errors: { errorStack, recoveryHistory },
    providers: { health, current, fallbacks },
    validation: { rules, results, suggestions }
};
```

---

### 2. Enhanced Security Architecture

**Philosophy:** Defense-in-depth with 100% client-side security using Web Crypto API + enhanced monitoring and adaptive protection.

#### Security Modules (`js/security/`)

| Module | Purpose |
|--------|---------|
| `index.js` | Enhanced facade and unified API |
| `security-coordinator.js` | Single authority for initialization |
| `message-security.js` | HMAC-SHA256 signing and verification |
| `encryption.js` | AES-GCM, PBKDF2 key derivation |
| `token-binding.js` | XSS token protection, device fingerprinting |
| `key-manager.js` | Non-extractable key management |
| `storage-encryption.js` | Storage-specific encryption |
| `security-service.js` | Enhanced threat detection and monitoring (v2.0) |

#### Enhanced Threat Model

**Addressed Threats:**
- Cross-tab data corruption (leader election + write authority)
- XSS attacks (secure context + token binding)
- Message tampering (HMAC-SHA256 + timestamp validation)
- Replay attacks (nonce tracking + expiration)
- Key extraction (non-extractable keys)
- Prototype pollution (prototype freezing)
- Rate limiting bypass (adaptive rate limiting)
- Security bypass attempts (enhanced monitoring + alerts)

#### Message Security (`js/security/message-security.js`)

**HMAC-SHA256 Signing:**
- Non-extractable `CryptoKey` from KeyManager
- Message canonicalization for deterministic signatures
- `crypto.subtle.sign()` for authentication

**Replay Prevention:**
- `usedNonces` Set with 1000-entry FIFO cache
- Nonce format: `${senderId}_${seq}_${timestamp}`
- 5-second max age for timestamps

#### Cross-Tab Security (`js/services/tab-coordination.js`)

**Message Verification Pipeline:**
1. Origin validation against `window.location.origin`
2. Timestamp freshness (5 seconds max)
3. Nonce replay check
4. HMAC-SHA256 signature verification

---

### 3. Storage Architecture

**Philosophy:** Multi-tiered architecture for durability, performance, and resilience with ACID guarantees.

#### IndexedDB Stores

| Store | Purpose | Indexes |
|-------|---------|---------|
| `STREAMS` | Raw streaming data | - |
| `CHUNKS` | Aggregated data | type, startDate |
| `EMBEDDINGS` | Vector embeddings | - |
| `PERSONALITY` | Personality results | - |
| `CHAT_SESSIONS` | Chat history | updatedAt |
| `CONFIG` | Configuration | - |
| `TOKENS` | Encrypted credentials | - |
| `EVENT_LOG` | Event replay | - |
| `EVENT_CHECKPOINT` | Checkpoints | - |

#### Advanced Features

**Write Authority Enforcement:**
- TabCoordinator ensures only primary tab writes
- VectorClock conflict resolution
- Write epoch stamping: `_writeEpoch`, `_writerId`

**Write-Ahead Log (`js/storage/write-ahead-log.js`):**
- Priority queue: CRITICAL, HIGH, NORMAL, LOW
- Crash recovery with replay on encryption restoration
- Cross-tab coordination (primary only processes)
- Entry lifecycle: PENDING → PROCESSING → COMMITTED/FAILED

**Transaction System (`js/storage/transaction.js`):**
- Two-Phase Commit: Prepare → Journal → Commit → Cleanup
- Multi-backend: IndexedDB + localStorage + SecureTokenStore
- Compensation Log for rollback failures
- Savepoints for nested transactions

**Storage Degradation (`js/services/storage-degradation-manager.js`):**

| Tier | Threshold | Behavior |
|------|-----------|----------|
| `NORMAL` | <80% | Full operations |
| `WARNING` | 80-94% | Warnings, aggressive LRU |
| `CRITICAL` | 95-99% | Read-only mode |
| `EXCEEDED` | 100% | Emergency cleanup |

---

### 4. Enhanced Services & Providers Layer (25+ Services)

#### Enhanced Provider Architecture

**LLMApiOrchestrator (`js/services/llm-api-orchestrator.js`):**
- Advanced request routing with load balancing
- Health monitoring with 2-second update intervals
- Performance optimization with request prioritization
- Automatic fallback on provider failure

**ProviderHealthMonitor (`js/services/provider-health-monitor.js`):**
- Real-time health tracking with 2-second update intervals
- Success/failure tracking with configurable history
- Performance metrics monitoring
- Provider recommendations based on health trends

**ProviderNotificationService (`js/services/provider-notification-service.js`):**
- User-friendly notifications with actionable guidance
- Error guidance and recovery suggestions
- User action tracking and UI updates

#### Enhanced Circuit Breaker System

**AdaptiveCircuitBreaker (`js/services/adaptive-circuit-breaker.js`):**
- Circuit state management with adaptive thresholds
- Success/failure tracking with configurable policies
- Automatic recovery with smart backoff
- Performance monitoring and optimization

**RetryManager (`js/services/retry-manager.js`):**
- Sophisticated retry with exponential backoff and jitter
- Circuit breaker integration for resilience
- Retry condition filtering and statistics tracking
- Performance optimization for common failure scenarios

#### Enhanced Cross-Tab Coordination (`js/services/tab-coordination.js`)

**TabCoordinator Features:**
- Deterministic leader election (lowest ID wins)
- Dual transport: BroadcastChannel → SharedWorker fallback
- VectorClock integration for conflict detection
- Clock skew compensation (2-second tolerance)
- Adaptive timing based on device
- Enhanced error handling and recovery

#### Enhanced Session Management (`js/services/session-manager.js`)

**Persistence Strategy:**
1. Primary: IndexedDB via unified Storage API
2. Fallback: localStorage for configuration
3. Emergency: Sync localStorage backup on beforeunload
4. Enhanced recovery mechanisms with transaction support

#### Enhanced Error Handling (`js/services/message-error-handler.js`)

**Intelligent Error Classification:**
- Automatic error categorization (network, API, validation, user input)
- Recovery strategy selection with smart fallbacks
- User-friendly error messages with actionable suggestions
- Error logging and analytics for continuous improvement

#### Enhanced Streaming (`js/services/stream-processor.js`)

**Real-time Stream Processing:**
- Stream parsing and processing with buffering
- Real-time data handling with error recovery
- Stream optimization with adaptive strategies
- Performance monitoring and backpressure management

#### Enhanced Validation (`js/services/message-validator.js`)

**Advanced Message Validation:**
- Content sanitization and security scanning
- Spam detection and compliance checking
- Custom validation rules and schema validation
- Performance optimization for high-throughput scenarios

#### Enhanced Worker System

**PatternWorkerPool (`js/workers/pattern-worker-pool.js`):**
- Parallel processing with dynamic worker scaling
- Memory limits and backpressure management
- SharedArrayBuffer mode with COOP/COEP headers
- Heartbeat monitoring and recovery mechanisms

**SharedWorkerCoordinator (`js/workers/shared-worker-coordinator.js`):**
- Enhanced cross-tab coordination via SharedWorker
- State synchronization with conflict resolution
- Performance optimization and error handling

---

## Key Features Overview

### Two-Path Onboarding
| Path | Data Source | Analysis Depth |
|------|-------------|----------------|
| **Full** | .zip/.json upload | Complete eras, ghosted artists, all patterns |
| **Lite** | Spotify OAuth | Last 50 tracks, top artists/tracks, limited patterns |

### Enhanced AI Function Calling (30+ Functions)
**Core Data Queries:** `get_top_artists`, `get_top_tracks`, `get_artist_history`, `get_listening_stats`, `compare_periods`, `search_tracks`

**Advanced Analytics:** `get_bottom_tracks`, `get_listening_clock`, `get_listening_streaks`, `get_discovery_stats`, `get_skip_patterns`, `get_completion_rate`, `temporal_analysis`

**Enhanced Templates:** `get_templates_by_genre`, `synthesize_profile`, `playlist_generation`

**Advanced Artifacts (Visualizations):** `visualize_trend`, `visualize_comparison`, `show_listening_timeline`, `show_listening_heatmap`, `show_data_table`, `pattern_analysis`, `sentiment_visualization`

**Enhanced Messaging:** `message_regenerate`, `message_edit`, `message_query_context`, `message_analyze_sentiment`

### Conversational Artifacts

**Claude-style inline visualizations** that the AI can generate via function calls:

| Type | Use Case |
|------|---------|
| Line Chart | Trends over time (plays, hours, unique artists) |
| Bar Chart | Top artists/tracks, period comparisons |
| Timeline | Artist discovery, milestones |
| Heatmap | Calendar view of listening activity |
| Table | Detailed data with columns |

#### Artifact Module Structure (`js/artifacts/`)

```
js/artifacts/
├── index.js              # Facade: validate, render, utilities
├── artifact-spec.js      # Schema builders for each type
├── validation.js         # Allowlist + sanitization
└── renderer.js           # Custom SVG renderer
```

#### Artifact Function Schemas

**`visualize_trend(title, data, options)`** — Line chart for temporal trends
```javascript
{
  title: string,           // Chart title
  subtitle?: string,       // Optional subtitle
  data: Array<{            // Time-series data points
    [xField]: string | Date,  // X value (date/time)
    [yField]: number          // Y value (metric)
  }>,
  view: {
    kind: "line_chart",
    x: { field: string, type?: "temporal" },
    y: { field: string, domain?: [number, number] }
  },
  annotations?: Array<{    // Optional data point annotations
    x: string | Date,
    label: string
  }>,
  explanation?: string[]   // AI commentary (displayed below chart)
}
```

**`visualize_comparison(title, data, options)`** — Bar chart for categorical comparison
```javascript
{
  title: string,
  subtitle?: string,
  data: Array<{
    [categoryField]: string,  // Category label
    [valueField]: number      // Numeric value
  }>,
  view: {
    kind: "bar_chart",
    horizontal?: boolean,     // Default: true
    x: { field: string },     // Value field
    y: { field: string }      // Category field
  }
}
```

**`show_data_table(title, data, columns)`** — Table for detailed data
```javascript
{
  title: string,
  data: Array<Object>,        // Row data (max 50 displayed)
  view: {
    kind: "table",
    columns: Array<{
      field: string,          // Data object key
      label: string           // Column header
    }>
  }
}
```

**`show_listening_timeline(title, events, options)`** — Timeline of events
```javascript
{
  title: string,
  data: Array<{
    date: string | Date,      // Event date
    label: string             // Event label
  }>,
  view: {
    kind: "timeline",
    dateField: string,        // Default: "date"
    labelField: string        // Default: "label"
  }
}
```

**`show_listening_heatmap(title, data, options)`** — Calendar heatmap
```javascript
{
  title: string,
  data: Array<{
    date: string | Date,      // Day key
    value: number             // Intensity value
  }>,
  view: {
    kind: "heatmap",
    x: { field: string },     // Date field
    y: { field: string }      // Value field
  }
}
```

#### Security & Performance

| Threat | Mitigation |
|--------|------------|
| Malicious SVG | Allowlist rendering, no arbitrary elements |
| XSS injection | Text content only, no `innerHTML` |
| DoS via data | `MAX_DATA_ROWS = 1000` limit |
| Reuse attacks | Unique `artifactId` per instance |

#### Renderer Capabilities

- **Zero dependencies** — Pure SVG, ~8KB vs 200KB+ chart libraries
- **Deterministic rendering** — Same input → same output
- **CSP-compliant** — No `eval()`, no `innerHTML`
- **Responsive** — Adapts to container width
- **Collapse/expand** — Users can minimize artifacts

See [docs/artifact-visualization-guide.md](docs/artifact-visualization-guide.md) for user documentation, or [docs/artifact-integration.md](docs/artifact-integration.md) for developer integration guide.

### Enhanced Semantic Search (100% Client-Side WASM)

**Architecture:**
```
User Query → WASM Embedding Generator → Local Vector Store → Cosine Similarity → Ranked Results → Enhanced Caching
```

**Enhanced Implementation:**
- WASM-only via `@xenova/transformers` (no external API calls)
- Model: `Xenova/all-MiniLM-L6-v2` (INT8 quantization, ~6MB)
- Enhanced Performance: ~300ms first query (optimized loading), ~30ms subsequent
- Enhanced Caching: Multi-tier caching with LRU eviction (10,000-vector cap)
- Enhanced Offline: Works completely offline after initial load
- Enhanced Persistence: Improved IndexedDB with compression and backup
- Enhanced Workers: Parallel processing with dynamic scaling

**Enhanced Privacy:**
- No API calls to external services
- Queries processed locally
- No data transmitted
- Enhanced encryption for cached embeddings

### BYOI (Bring Your Own Intelligence)

Users can choose their AI provider:

| Provider | Type | Cost | Setup |
|----------|------|------|-------|
| Ollama | Local | Free | Install Ollama, run model |
| LM Studio | Local | Free | Install LM Studio, enable API |
| OpenRouter | Cloud | Pay-per-use | Add API key in settings |
| OpenAI-Compatible | Cloud or Local | Depends on chosen provider | Configure custom base URL and API key in settings |

The OpenAI-Compatible provider supports any OpenAI-compatible API, including self-hosted servers, cloud providers like Together AI/Anyscale/DeepInfra, or the official OpenAI API.

**Enhanced Provider Health Monitoring:**
- Circuit breaker pattern with adaptive thresholds (Closed, Open, Half-Open states)
- Automatic fallback on provider failure with 2-second health checks
- Enhanced health tracking: Healthy, Degraded, Unhealthy, Blacklisted
- Real-time performance metrics and recommendations
- Enhanced error recovery and user guidance
- See [docs/provider-health-monitoring.md](docs/provider-health-monitoring.md)

### Enhanced Chat Session Storage
- Persistent chat conversations via IndexedDB with encryption
- Enhanced session management with auto-save (1s debounce) and recovery
- Enhanced emergency recovery via localStorage backup with integrity checks
- Enhanced error handling and automatic recovery mechanisms
- Cross-tab session synchronization with conflict resolution

---

## Personality Types

### Full Personality Types

| Type | Description |
|------|-------------|
| Emotional Archaeologist | Uses music to process feelings |
| Mood Engineer | Strategically deploys music |
| Discovery Junkie | Always seeking new artists |
| Comfort Curator | Sticks to beloved favorites |
| Social Chameleon | Music adapts to context |

### Lite Personality Types

| Type | Description |
|------|-------------|
| The Current Obsessor | Deep in one sound right now |
| The Sound Explorer | Always seeking new territory |
| The Taste Keeper | Knows exactly what they love |
| The Taste Shifter | Musical journey in motion |

---

## HNW Patterns Addressed

### Hierarchy
- Clear chain of command: App → Controller → Service → Provider
- Dependency injection: All modules receive dependencies explicitly
- Single responsibility: Each module has one clear purpose

### Network
- Modular communication: Reduced "God Object" interconnectivity
- Facade pattern: Unified interfaces hide complexity
- Event-driven: Services communicate through events, not direct coupling

### Wave
- Deterministic leader election: 300ms window, lowest ID wins
- Async/sync separation: visibilitychange (async) vs beforeunload (sync)
- Migration isolation: Runs atomically before app initialization

---

## Security Considerations

### Implemented Security Features

| Feature | Implementation | Purpose |
|---------|----------------|---------|
| AES-GCM Encryption | `security.js`, `js/security/encryption.js` | RAG credentials, API keys |
| XSS Token Binding | `security.js`, `token-binding.js` | Spotify tokens |
| Secure Context | `security.js` | HTTPS/localhost enforcement |
| Session Versioning | `security.js` | Key invalidation on failures |
| Prototype Prevention | `security/index.js` | Object.freeze on prototypes |
| v0.9 Hardening | `js/security/` | Complete security module suite |

**v0.9 Security Milestone (Complete):**
- ✅ All API keys encrypted at rest (AES-GCM-256)
- ✅ Chat history encrypted with unique IV per operation
- ✅ Cross-tab messages authenticated with HMAC-SHA256
- ✅ Replay attack prevention (timestamps + nonces)
- ✅ Sensitive data sanitized from broadcasts
- ✅ Keys cleared on logout
- ✅ Secure context validation (HTTPS/localhost only)

**Recent Security Fixes (v0.9):**
- **TOCTOU Prevention**: Reservation mechanism in QuotaManager prevents race conditions
- **Token Binding**: SHA-256 hashed device fingerprints for all API access
- **Session Versioning**: Automatic credential invalidation on auth events
- **CORS Validation**: Proper handling of null origins from file:// URLs

---

## Deployment

### Static Site Deployment (Vercel/Netlify)
1. Clone repository
2. Copy `js/config.example.js` to `js/config.js`
3. Add Spotify Client ID from Developer Dashboard
4. Add redirect URI to Spotify app settings
5. Deploy static files

### Local Development
```bash
python -m http.server 8080
# or
npx serve .
```

---

---

## Facade Pattern Architecture (Phase 3)

Services use a three-layer facade pattern for modular, testable, and backward-compatible code:

### Pattern Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Facade Layer (Public API)                                  │
│  - Backward compatibility                                   │
│  - JSDoc documentation                                      │
│  - Static methods / class interface                         │
├─────────────────────────────────────────────────────────────┤
│  Internal Index (Coordinator)                               │
│  - Module orchestration                                     │
│  - Instance management                                      │
│  - Internal-only exports                                    │
├─────────────────────────────────────────────────────────────┤
│  Focused Modules                                            │
│  - Single responsibility                                   │
│  - Testable in isolation                                    │
│  - No circular dependencies                                │
└─────────────────────────────────────────────────────────────┘
```

### Completed Facade Refactorings

#### SessionManager (100% complete, 247 tests)
- **Facade**: `js/services/session-manager.js` (365 lines)
  - Public API: `initialize()`, `createSession()`, `deleteSession()`, `clearAllSessions()`, `getAllSessions()`
  - Backward compatibility: `init()` alias, `setUserContext()` deprecated
  - Event listener registration: `registerEventListeners()`
- **Internal Index**: `js/services/session-manager/index.js`
  - Singleton instance management
  - Module coordination
  - Convenience functions
- **Modules** (3):
  - `session-state.js` (344 lines) - Data management, mutex protection, message history
  - `session-lifecycle.js` (547 lines) - CRUD operations, event emission, UUID utilities
  - `session-persistence.js` (266 lines) - Auto-save, emergency backup, debounced writes

#### StorageDegradationManager (facade complete)
- **Facade**: `js/services/storage-degradation-manager.js`
  - Public API: `checkQuotaNow()`, `getCurrentTier()`, `triggerCleanup()`
- **Internal Modules**:
  - `degradation-detector.js` - Quota monitoring, tier detection
  - `cleanup-strategies.js` - Automatic cleanup strategies
  - `tier-handlers.js` - Tier-specific behavior

#### ErrorRecoveryCoordinator (facade complete)
- **Facade**: `js/services/error-recovery-coordinator.js`
  - Public API: `coordinateRecovery()`, `getTelemetry()`, `cleanup()`
- **Internal Modules**:
  - `recovery-strategies.js` - Domain-specific handlers
  - `recovery-orchestration.js` - Core orchestration logic
  - `recovery-lock-manager.js` - Cross-tab coordination

#### PatternWorkerPool (facade complete)
- **Facade**: `js/workers/pattern-worker-pool.js`
  - Public API: `init()`, `detectAllPatterns()`, `terminate()`, `getStatus()`
- **Internal Modules**:
  - `worker-lifecycle.js` - Worker creation, termination, health
  - `pool-management.js` - Optimal worker count, pool sizing
  - `task-distribution.js` - Task scheduling, result aggregation

---

## Key Patterns

### EventBus Schema Registration

Services register event schemas during initialization for decentralized event management:

```javascript
// In session-lifecycle.js
export const SESSION_EVENT_SCHEMAS = {
    'session:created': {
        description: 'New session created',
        payload: { sessionId: 'string', title: 'string' }
    },
    'session:loaded': {
        description: 'Session loaded from storage',
        payload: { sessionId: 'string', messageCount: 'number' }
    },
    // ... more schemas
};

// In session-manager.js (facade)
import { EventBus } from './event-bus.js';
import { SESSION_EVENT_SCHEMAS } from './session-manager/session-lifecycle.js';

static async initialize() {
    EventBus.registerSchemas(SESSION_EVENT_SCHEMAS);
    // ... rest of initialization
}
```

**Benefits:**
- Type-safe event handling
- Self-documenting events
- Schema validation available
- Decentralized ownership (services own their schemas)

### Event Listener Registration for Persistence

Services register browser event listeners for automatic persistence:

```javascript
static registerEventListeners() {
    if (this.eventListenersRegistered) return;

    // Async save when tab goes hidden (non-blocking)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            this.flushPendingSaveAsync();
        }
    });

    // Sync backup when tab is closing (best-effort)
    window.addEventListener('beforeunload', () => {
        this.emergencyBackupSync();
    });

    // Mobile Safari compatibility
    window.addEventListener('pagehide', () => {
        this.emergencyBackupSync();
    });

    this.eventListenersRegistered = true;
}
```

**Pattern:**
- `visibilitychange` → async flush (non-blocking)
- `beforeunload`/`pagehide` → sync emergency backup (best-effort)

---

## Testing

### API Compatibility Tests

**Location**: `tests/unit/api-compatibility.test.js`

**Purpose**: Verify facade methods exist and return correct types after refactoring

**Count**: 59 tests (as of current version)

**Run**: `npm run test:api`

**Coverage**:
- ErrorRecoveryCoordinator: 10 tests
- StorageDegradationManager: 12 tests
- SessionManager: 18 tests
- SESSION_EVENT_SCHEMAS: 5 tests
- PatternWorkerPool: 14 tests

**What it checks**:
1. Expected methods exist on facades
2. Methods can be called without throwing
3. Return types match expectations
4. Enums are exported correctly

---

## Development Guidelines

### When Adding New Features

1. **Add focused module** under `js/services/` or `js/workers/`
2. **Export through internal index** if using facade pattern
3. **Add facade method** with JSDoc documentation
4. **Add api-compatibility test** for public methods
5. **Run tests**: `npm run test:api`
6. **Update docs** with sync script: `npm run sync-docs:update`

### Facade Pattern Checklist

- [ ] Facade at root (e.g., `session-manager.js`)
- [ ] Internal index in subdirectory (e.g., `session-manager/index.js`)
- [ ] Focused modules for single responsibilities
- [ ] No circular dependencies
- [ ] JSDoc on all public methods
- [ ] Event schemas exported if using EventBus
- [ ] API compatibility tests added
- [ ] Backward compatibility maintained (aliases, deprecated methods)

---

## Instructions for Future Agents

1. **Read this file first**
2. **Follow UX Philosophy** — No filters, no dashboards
3. **Respect silence** — Insight engine can return None
4. **Use Web Worker** — Never block main thread for parsing
5. **Single source of truth** — Scoring logic lives in `personality.js`, not duplicated
6. **Config hierarchy**: config.js (defaults) → localStorage (user overrides)
7. **Security first**: Use `Security.storeEncryptedCredentials()` for sensitive data
8. **Respect modular architecture** — Use delegation pattern, don't create God objects
9. **HNW patterns**: Follow Hierarchy, Network, Wave principles in all new code
10. **Operation Lock Contract**: Always use try-catch with acquire()
11. **Error Handling**: Use standardized LockAcquisitionError for diagnostics
12. **Use facade pattern** for new services (see Phase 3 architecture above)

---

## Known Issues & Technical Debt

> **Last Reviewed:** 2025-01-27 (Adversarial Architecture Review)
> **Status:** ✅ ALL CRITICAL ISSUES RESOLVED
> **Full Details:** [`docs/plans/TECHNICAL_DEBT.md`](docs/plans/TECHNICAL_DEBT.md)

### ✅ Critical Issues - ALL RESOLVED (2025-01-27)

**Commits:** `0d1e842`, `d2e8ff1`, `7ba97f9`, `409fd7c`

All 11 critical issues from the adversarial review have been fixed:

| Issue | Description | Fix |
|-------|-------------|-----|
| C1 | 2PC Commit Marker Storage | IndexedDB persistence |
| C2 | License Verification Security | ECDSA asymmetric crypto |
| C3 | Token Storage XSS Vulnerability | sessionStorage |
| C4 | Uncleared Intervals | Cleanup methods added |
| C5 | TurnQueue Race Condition | Atomic check-and-set |
| C6 | Transaction Pool Race Condition | TransactionMutex |
| C7 | Promise.race Timeout Leaks | Proper cleanup |
| C8 | WaveTelemetry Unbounded Growth | LRU eviction |
| C9 | Worker Error Boundary | try-catch wrapper |
| C10 | Global State Pollution | ES module imports |
| C11 | Infinite Reconnection Loop | Iterative while loop |

### High Priority Issues

5. **Memory Leaks** - `streaming-message-handler.js:62-94`
   - `activeTimeout` not cleared on unmount
   - Event listeners not properly tracked

6. **Missing Bounds Checking** - `streaming-message-handler.js:293-307`
   - `removeMessageFromHistory()` doesn't validate array index

7. **God Objects** - `sidebar-controller.js` (724 lines)
   - 20+ methods, mixed responsibilities
   - Difficult to test, high coupling

8. **Over-Engineered EventBus**
   - Circuit breakers, vector clocks for client-side operations
   - Performance overhead, difficult to reason about

### Anti-Patterns Identified

| Pattern | Location | Impact |
|---------|----------|--------|
| God Object | SessionManager, SidebarController | Hard to test, tight coupling |
| Global State | window.* assignments | Shared state, testing issues |
| Magic Numbers | 274 occurrences in 107 files | Brittleness, unclear intent |
| Tight Coupling | Manual DI Container | Difficult mocking |
| Inconsistent Error Handling | Across services | Unpredictable APIs |

### Development Guidelines Update

**When modifying code in these areas:**
- `session-state.js` - Add version tracking to prevent stale updates
- `event-bus.js` - Wrap all async handlers in try-catch
- `turn-queue.js` - Use atomic operations for flag checks
- `sidebar-controller.js` - Plan for eventual split into smaller controllers
- `streaming-message-handler.js` - Always cleanup timeouts and listeners

**Before adding new features:**
1. Check if you're introducing global state (use DI instead)
2. Verify no new race conditions (test concurrent operations)
3. Ensure proper cleanup (timeouts, listeners, subscriptions)
4. Add bounds checking for all array/object access
5. Use consistent error handling pattern

---
