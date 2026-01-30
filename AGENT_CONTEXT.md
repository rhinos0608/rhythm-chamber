# AI Agent Reference — Rhythm Chamber

> **Status:** v0.9.0 Enhanced Architecture Complete — 366 Source Files
> - **21 Controllers**: Modular UI components for focused functionality
> - **94 Services**: Comprehensive business logic with enhanced error handling
> - **37 Utilities**: Enhanced reliability and performance utilities
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

## AI Agent Quick Reference (AGENTS.md Extension)

> **Purpose**: Quick reference for AI agents working on this codebase
> **Read Time**: 2 minutes
> **For Deep Dives**: See sections below

### Essential Commands (Most Used)

```bash
# Development
npm install                  # Install dependencies
npm run dev                  # Start dev server (port 8080)
npm run dev:coop-coep       # With COOP/COEP for SharedArrayBuffer

# Testing
npm run test:unit            # Run all unit tests
npm run test:unit -- --run   # Run once (no watch mode)
npm run test:unit:watch      # Watch mode for TDD
npm test                     # Run E2E tests
npm run test:ui              # E2E with UI for debugging

# Code Quality
npm run lint:globals         # Check for accidental globals
npm run docs:sync            # Update documentation
npm run docs:validate        # Validate docs are in sync

# Specific Test Patterns
npm run test:unit -- --testNamePattern="ChatUIController"  # Single test
npm run test:unit -- --reporter=verbose                    # Verbose output
npm test --headed                                                   # E2E with browser
```

### MCP Server (AI Agent Tooling)

The Rhythm Chamber MCP (Model Context Protocol) server provides AI agents with tools to analyze the codebase, search by meaning, and validate HNW architecture compliance.

**Start MCP Server:**
```bash
# Terminal 1: Start the application
npm run dev

# Terminal 2: Start the MCP server
cd mcp-server
node server.js

# Or test standalone
node examples/test-server.js
```

**What it does:**

*Semantic Search (NEW):*
- **semantic_search**: Search code by meaning using vector embeddings ✅
- **deep_code_search**: Orchestrated semantic + structural + architectural analysis ✅
- **get_chunk_details**: Inspect specific chunks with relationships ✅
- **list_indexed_files**: Browse all indexed files ✅

*Architecture Analysis:*
- **get_module_info**: Analyze any module's exports, imports, dependencies, and HNW compliance score ✅
- **find_dependencies**: Trace dependency graphs, detect circular dependencies ✅
- **search_architecture**: Search for HNW patterns and anti-patterns ✅
- **validate_hnw_compliance**: Comprehensive architecture validation ✅

**Semantic Search Example:**
```json
{
  "tool": "semantic_search",
  "arguments": {
    "query": "how are sessions created?",
    "limit": 10,
    "threshold": 0.3
  }
}
```

**Deep Code Search Example:**
```json
{
  "tool": "deep_code_search",
  "arguments": {
    "query": "authentication flow",
    "depth": "thorough"
  }
}
```

**Returns:**
- Matching chunks ranked by semantic similarity
- File location, line numbers, and type
- Related chunks (callers/callees)
- Symbol relationships and dependencies

**Integration with Claude Code:**
Add to `~/.config/claude-code/config.json`:
```json
{
  "mcpServers": {
    "rhythm-chamber": {
      "command": "node",
      "args": ["/absolute/path/to/rhythm-chamber/mcp-server/server.js"],
      "env": {
        "RC_PROJECT_ROOT": "/absolute/path/to/rhythm-chamber"
      }
    }
  }
}
```

See [mcp-server/README.md](mcp-server/README.md) for complete documentation.

### HNW Architecture Patterns (Critical)

**Hierarchy:** Controllers → Services → Providers (never bypass layers)
- ✅ DO: Controllers call Services, Services call Providers
- ✅ DO: Use EventBus for cross-module communication
- ✅ DO: Let TabCoordinator handle cross-tab conflicts
- ❌ DON'T: Create circular dependencies
- ❌ DON'T: Bypass abstraction layers (Controllers shouldn't call Providers directly)

**Network:** EventBus for modular communication
```javascript
import { EventBus } from './services/event-bus.js';

// Subscribe with domain filtering
EventBus.on('chat:message:sent', async (data) => {
  // Handle message sent
}, { domain: 'chat' });

// Emit with priority
await EventBus.emit('chat:message:sent', {
  sessionId: '...',
  content: '...'
}, { priority: 'HIGH' });
```

**EventBus Limitations:**

The EventBus supports catch-all subscriptions but **does NOT** support pattern-based wildcards:

```javascript
// ❌ WRONG - Pattern wildcards don't work
EventBus.on('session:*', handler);

// ✅ CORRECT - Subscribe to each specific event
const sessionEvents = ['session:created', 'session:loaded', 'session:switched', 'session:deleted', 'session:updated'];
sessionEvents.forEach(eventType => {
    EventBus.on(eventType, handler);
});

// ✅ ALSO SUPPORTED - Catch-all events
EventBus.on('*', (data, meta) => {
    console.log('All events:', meta.eventType, data);
});
```

**Wave:** TabCoordinator for cross-tab coordination
- ✅ Check primary tab status before writing to IndexedDB
- ✅ Use write-ahead log for crash recovery
- ✅ Test with multiple tabs open
- ❌ Never write directly from non-primary tabs

### Common Gotchas (Mistake Patterns)

**Cross-Tab Data Corruption**
- ❌ Symptom: Data disappears or gets corrupted with multiple tabs
- ✅ Solution: Always use TabCoordinator, never write directly from non-primary tabs

**Data Loss on Page Refresh**
- ❌ Symptom: Changes lost after refresh
- ✅ Solution: Use write-ahead log, transactions, proper error handling

**"CORS error" or "null origin"**
- ❌ Symptom: API calls fail with CORS errors
- ✅ Solution: Must run on HTTPS or localhost (secure context requirement)

**IndexedDB Tests Failing**
- ❌ Symptom: Tests fail with IDB errors
- ✅ Solution: Use `fake-indexeddb` from test utilities

**Event Handlers Firing Multiple Times**
- ❌ Symptom: Events trigger repeatedly
- ✅ Solution: Check EventBus circuit breaker, use domain filtering

**Import Path Errors**
- ❌ Symptom: "Cannot find module" errors
- ✅ Solution: Always use `./` prefix for relative imports (ES6 modules)

### Testing Patterns for AI Workflows

**When Adding New Features:**
1. Write unit tests for new services in `tests/unit/services/`
2. Add E2E tests for user flows in `tests/rhythm-chamber.spec.ts`
3. Test cross-tab coordination by opening multiple browser tabs
4. Verify IndexedDB operations work with private browsing mode

**Service Tests:** Mock dependencies, test happy/sad paths
**Controller Tests:** Test UI interactions, event emissions
**Integration Tests:** Test Event Bus communication between modules
**Security Tests:** Validate encryption/decryption, token binding

### ES6 Module Best Practices

**Import/Export Patterns:**
```javascript
// ✅ GOOD - Named exports for services
import { Storage, EventBus } from './services/index.js';

// ✅ GOOD - Default exports for classes
export default class ChatUIController {
  constructor({ chat, artifacts }) {
    this.chat = chat;
    this.artifacts = artifacts;
  }
}

// ❌ BAD - No globals, window pollution
window.ChatController = {};
```

**Dependency Injection:**
```javascript
// ✅ GOOD - Use parameterized dependencies
const controller = new ChatUIController({
  chat: container.resolve('Chat'),
  artifacts: container.resolve('Artifacts')
});

// ❌ BAD - Hard-coded dependencies
const controller = new ChatUIController(new Chat());
```

**Error Handling:**
```javascript
// ✅ GOOD - Use OperationLock for critical operations
const lock = OperationLock.acquire('processing-streams');
try {
  await this.processStreams(streams);
} finally {
  lock.release();
}

// ❌ BAD - No concurrency control
await this.processStreams(streams);
await this.processMoreStreams(streams); // Race condition!
```

### Project-Specific Patterns

**AI Provider Integration:**
- Always use `llm-api-orchestrator.js` (never call providers directly)
- Test with both local (Ollama) and cloud (OpenRouter) providers
- Handle rate limiting and fallbacks automatically

**Data Processing Flow:**
```
Upload → Validate → Encrypt → Store → Process → Generate → Display
    ↓         ↓        ↓       ↓        ↓        ↓       ↓
  Security  Security  Security Storage  Service  LLM     UI
```

**Streaming Architecture:**
- Use `StreamingMessageHandler` for real-time updates
- Implement proper buffering and backpressure
- Handle connection drops gracefully

### Security Requirements (CRITICAL)

**Before committing changes:**
- [ ] No sensitive data in logs or error messages
- [ ] API keys encrypted with `Security.storeEncryptedCredentials()`
- [ ] User input validated
- [ ] No `innerHTML` with user input (XSS risk)
- [ ] HTTPS/localhost enforcement (secure context)
- [ ] Security review if modifying `js/security/`

**Critical Files:**
- `js/security/` - Any changes require security review
- `js/storage/` - Encrypted storage operations
- `js/providers/` - AI provider credentials

### File Locations Quick Reference

**Entry Points:**
- `js/main.js` - Application bootstrap, security checks
- `js/app.js` - Main orchestrator, controller initialization

**Key Directories:**
| Directory | Purpose | First Stop For... |
|-----------|---------|-------------------|
| `js/controllers/` | UI components | Adding/modifying UI behavior |
| `js/services/` | Business logic | Core functionality, data processing |
| `js/security/` | Encryption, signing | Security features (review required!) |
| `js/storage/` | IndexedDB operations | Data persistence |
| `tests/unit/` | Vitest tests | Unit testing |
| `tests/rhythm-chamber.spec.ts` | Playwright tests | E2E testing |

### Debug Patterns

**Enable Debug Mode:**
```javascript
// In browser console
localStorage.setItem('rhythm-chamber-debug', 'true');
// Reload page to see detailed logs
```

**Test Cross-Tab Coordination:**
1. Open app in multiple browser tabs
2. Watch leader election in console
3. Verify only primary tab writes to IndexedDB
4. Test message passing between tabs

**Test Storage Operations:**
```javascript
// Check IndexedDB contents
await Storage.streams.getAll();
await Storage.sessions.getAll();

// Verify encryption
await Security.decrypt(encryptedData);
```

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

**⚠️ Important Limitation:**
The EventBus does **NOT** support pattern-based wildcard subscriptions (e.g., `session:*`). Only catch-all (`*`) is supported. To subscribe to multiple related events, you must register each event individually:

```javascript
// ❌ DOES NOT WORK - Pattern wildcards not supported
EventBus.on('session:*', handler);

// ✅ CORRECT - Individual subscriptions
['session:created', 'session:loaded', 'session:updated'].forEach(event => {
    EventBus.on(event, handler);
});
```

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

> **Last Reviewed:** 2025-01-27 (Final Remediation Complete)
> **Status:** ✅ ALL 20 ITEMS RESOLVED (100%)
> **Full Details:** [`docs/plans/TECHNICAL_DEBT.md`](docs/plans/TECHNICAL_DEBT.md)

### ✅ Technical Debt Remediation - COMPLETE

**Session:** 2025-01-24 to 2025-01-27
**Commits:** 38 commits across 3 phases
**Files Modified:** 100+
**Tests Added:** 400+ lines

All 20 technical debt items have been resolved:

| ID | Issue | Status | Resolution |
|----|-------|--------|------------|
| **Critical (11)** | | **ALL RESOLVED** | |
| TD-1 | SessionManager race condition | ✅ | Version tracking |
| TD-2 | EventBus emitParallel | ✅ | try-catch wrapper |
| TD-3 | SessionManager God Object | ✅ | 3-module facade |
| TD-4 | Global state pollution | ✅ | ES imports |
| TD-5 | TurnQueue race condition | ✅ | Atomic check-and-set |
| TD-6 | StreamingMessageHandler memory leak | ✅ | cleanupStreamingHandler |
| TD-7 | Array bounds checking | ✅ | Number.isInteger() |
| TD-8 | getAllSessions null check | ✅ | Storage type check |
| TD-9 | SidebarController God Object | ✅ | 5 focused controllers |
| TD-10 | EventBus over-engineered | ✅ | Simplified |
| TD-11 | Error boundaries | ✅ | 53 tests |
| TD-12 | DI Container | ✅ | Explicit deps |
| **High (7)** | | **ALL RESOLVED** | |
| TD-13 | ProviderHealthMonitor errors | ✅ | Error handling |
| TD-14 | localStorage quota | ✅ | QuotaManager |
| TD-15 | Timeout messages | ✅ | TimeoutError class |
| TD-16 | Magic numbers | ✅ | 6 constant files |
| TD-17 | Abstraction levels | ✅ | 3-layer architecture |
| TD-18 | SidebarController memory leaks | ✅ | Cleanup implemented |
| TD-19 | Message array growth | ✅ | LRU implemented |
| **Medium (2)** | | **ALL RESOLVED** | |
| TD-20 | Error handling patterns | ✅ | Result utility |

### Adversarial Review Findings - ALL RESOLVED

**Date:** 2025-01-27
**Reviewer:** AI Agent with adversarial approach

All 14 findings from adversarial review have been addressed:

| ID | Issue | Severity | Fix |
|----|-------|----------|-----|
| C1 | Device fingerprint truncated | Critical | Full 256-bit hash |
| H1 | TransactionMutex not atomic | High | Promise chaining |
| H2 | EventBus swallows errors | High | Promise.allSettled |
| H3 | License offline bypass | High | Network-only fallback |
| M1 | Deep clone is shallow | Medium | structuredClone() |
| M2 | No key rotation | Medium | PUBLIC_KEYS object |
| M3 | setTimeout not guaranteed | Medium | Direct call |
| M4 | Mutex mock serialization | Medium | Fixed mock |
| M5 | Circular dep detection incomplete | Medium | Enhanced detection |
| M6 | Session ID validation | Medium | Length check |
| L1 | innerHTML loses handlers | Low | DOM cloning |
| L2 | Constants duplicated | Low | Consolidated |

### Final Adversarial Review (Phase Completion)

**Date:** 2025-01-27 (Final)
**Review Scope:** All refactoring phases

**SessionManager Refactoring:**
- ✅ Fixed circular dependency (removed direct session-state import)
- ✅ Fixed duplicate saveCurrentSession() functionality
- ✅ Fixed memory leak in notifySessionUpdate()
- ✅ Added cleanupSessionResources() method

**SidebarController Refactoring:**
- ✅ Fixed rename memory leak (try-finally cleanup)
- ✅ Removed dynamic imports from event handlers
- ✅ Extracted mobile responsiveness to separate module

**Architecture & Constants:**
- ✅ Removed dead code (js/architecture/ - 1,927 lines)
- ✅ Fixed constant duplication (MAX_SAVED_MESSAGES)
- ✅ Consolidated to shared constants

### Current Architecture State

**Facade Pattern Services:**
- `SessionManager` - 3 modules (state, lifecycle, persistence)
- `SidebarController` - 5 controllers (coordinator, state, list, actions, mobile)
- `StorageDegradationManager` - 3 internal modules
- `ErrorRecoveryCoordinator` - 3 internal modules
- `PatternWorkerPool` - 3 internal modules

**Constants Consolidation:**
- `js/constants/limits.js` - MAX_SAVED_MESSAGES, MAX_WAVES, etc.
- `js/constants/delays.js` - Timeout values
- `js/constants/priorities.js` - PRIORITY levels
- `js/constants/api.js` - API limits
- `js/constants/percentages.js` - TELEMETRY_LIMITS
- `js/constants/session.js` - Session-specific (imports from limits)

**Error Handling:**
- `js/utils/result.js` - Ok/Err pattern
- `js/services/timeout-error.js` - TimeoutError class

### Development Guidelines Update

**When modifying code:**
1. Use facade pattern for new services
2. Import from shared constants (js/constants/)
3. Use Result pattern for error handling
4. Add version tracking for mutable state
5. Cleanup all resources in try-finally blocks
6. No dynamic imports in hot paths
7. Test concurrent operations for race conditions

---

## Documentation Synchronization Tooling

**Overview:** Automated documentation maintenance system that keeps architecture documentation synchronized with the codebase through AST analysis, git history tracking, and JSDoc extraction.

### Features

**1. AST-Based Metric Extraction**
- Parses all `js/**/*.js` files using @babel/parser
- Extracts: line counts, module counts, exports, imports, classes, functions
- Builds dependency graph and detects circular dependencies
- Caching enables 80%+ performance improvement on subsequent runs

**2. Git History Analysis**
- Tracks "last modified" timestamps per file
- Extracts contributor statistics
- Determines version from git tags, CHANGELOG.md, or package.json

**3. Multi-Mode Execution**

| Mode | Command | Purpose |
|------|---------|---------|
| **Manual** | `npm run docs:sync` | On-demand documentation update |
| **Watch Daemon** | `npm run docs:watch` | Continuous monitoring with auto-sync |
| **Git Hook** | Automatic (pre-commit) | Validates docs before allowing commits |

**4. Auto-Updated Documentation**

- **AGENT_CONTEXT.md** - Status header (file counts, controller/service counts, version)
- **ARCHITECTURE.md** - Version number and timestamp
- **API.md** - Version, timestamp, and JSDoc-generated API reference
- **SECURITY.md** - Security version and timestamp
- **docs/DEPENDENCY_GRAPH.md** - Auto-generated dependency tree with circular dependency warnings

**5. Cross-Reference Validation**
- Validates internal markdown links
- Checks version consistency across documents
- Reports broken links and inconsistencies

### Usage for AI Agents

**When modifying code:**
1. Make your code changes
2. Run `npm run docs:sync` to update documentation
3. Review the generated changes
4. Commit with updated docs

**If pre-commit hook fails:**
```
✗ Documentation is outdated
ℹ  Run: npm run docs:sync
   Or bypass with: git commit --no-verify
```

**Watch mode for active development:**
```bash
npm run docs:watch -- --verbose
```
Monitors files and auto-updates docs within 500ms of changes.

### Architecture

```
scripts/docs-sync/
├── orchestrator.js           # Main entry point
├── watcher.js                # Watch daemon (chokidar)
├── config.json               # Configuration
├── analyzers/
│   ├── ast-analyzer.js       # AST parsing (@babel/parser)
│   └── git-analyzer.js       # Git history (simple-git)
├── generators/
│   ├── api-docs.js           # JSDoc → markdown
│   └── metrics-updater.js    # Update file headers
├── validators/
│   └── xref-validator.js     # Link checking
└── utils/
    ├── cache.js              # AST caching
    └── logger.js             # Colored console output
```

### Key Behaviors

**Circular Dependency Detection:**
- Builds adjacency list from imports
- Uses depth-first search to detect cycles
- Reports warnings in console and DEPENDENCY_GRAPH.md
- Example cycle: `A → B → C → A`

**Caching Strategy:**
- First run: Parses all files (~2-3 seconds for 365 files)
- Subsequent runs: Only parses changed files (~0.5 seconds)
- Cache invalidated on file modification
- Enables real-time watch mode performance

**Git Hook Integration:**
- Checks if documentation metrics match current codebase
- Fails commit if docs are outdated
- Provides clear instructions to fix
- Respects `--no-verify` flag for emergency bypasses

**Error Handling:**
- Continues processing if individual files fail to parse
- Logs parse errors without blocking sync
- Reports summary of failures at end
- Non-critical: 2 parse errors out of 365 files is acceptable

### Configuration

Edit `scripts/docs-sync/config.json` to customize:
- Target documentation files
- Watch paths (default: `js/**/*.js`)
- Exclude patterns (e.g., large worker files)
- Debounce delay (default: 500ms)
- Auto-commit settings
- Version detection strategy

### Adding JSDoc for API Docs

To enable auto-generated API documentation:

1. Add JSDoc comments to exported functions:
```javascript
/**
 * Processes streaming messages from AI provider
 * @param {string} sessionId - Chat session identifier
 * @param {AsyncGenerator} messageStream - Stream of message chunks
 * @returns {Promise<void>}
 * @throws {StreamingError} If stream fails unexpectedly
 */
export async function processStreamingMessages(sessionId, messageStream) {
  // implementation
}
```

2. Add markers to `API.md`:
```markdown
<!-- AUTO-GENERATED:START -->
<!-- API documentation will be auto-generated here -->
<!-- AUTO-GENERATED:END -->
```

3. Run `npm run docs:sync` to generate documentation

### Performance Metrics

**Current Codebase (2026-01-30):**
- Total files: 365 JavaScript files
- Total lines: 108,478 lines of code
- Controllers: 21
- Services: 93
- Utilities: 36
- Parse errors: 2 (non-critical)
- Processing time: 2-3s (cold), 0.5s (warm cache)

### Troubleshooting

**"Documentation is outdated" error:**
- Run `npm run docs:sync`
- Git history shows docs haven't been updated after code changes
- Sync will update metrics and regenerate dependency graph

**Parse errors in specific files:**
- Check for unsupported syntax features
- Verify file encoding is UTF-8
- Errors are non-blocking and logged to console
- Tool continues processing other files

**Watch mode not updating:**
- Check file is in `js/` directory (watch path)
- Verify file isn't in exclude list
- Increase verbosity with `--verbose` flag
- Check debounce delay (may need longer for large changes)

**Git hook bypass needed:**
- Use `git commit --no-verify -m "message"`
- Only for emergency commits or WIP work
- Remember to sync docs before final commits

### Future Enhancements

Planned improvements to docs-sync tooling:
- TypeScript file support (`.ts`)
- Visual dependency graphs (SVG/DOT output)
- Diff highlighting in watch mode
- CI/CD pipeline integration
- Web dashboard for documentation health metrics
- Auto-formatting with prettier
- JSON schema for config validation
- Progress indicator for initial scans

---
