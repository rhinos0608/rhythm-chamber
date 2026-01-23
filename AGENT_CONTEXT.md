# AI Agent Reference — Rhythm Chamber

> **Status:** v0.9 Security Hardening COMPLETE — 24/24 requirements implemented
> - Session Key Management: Non-extractable keys, PBKDF2 600k iterations
> - Storage Encryption: AES-GCM-256 for API keys and chat history
> - Cross-Tab Security: HMAC-SHA256 signatures, origin validation, replay prevention
> - Security Infrastructure: KeyManager, MessageSecurity, StorageEncryption modules

---

## Quick Context

**What is this?**
Music analytics app that tells users what their listening says about them — like Spotify Wrapped but deeper, year-round, and conversational.

**Core flow (Full):**
`Landing → Upload .zip/.json → Personality Reveal → Chat → Share Card`

**Core flow (Lite/Quick Snapshot):**
`Landing → Spotify OAuth → Quick Snapshot Reveal → Upsell to Full`

**Tech stack:**
Mostly client-side: Static HTML/CSS/ES6 Modules + IndexedDB + Web Workers + OpenRouter API + Spotify Web API

---

## Monetization Strategy

**Philosophy:** Community-first growth with zero monetization entry. Build a base of enthusiasts, then scale to premium managed services.

### Phase 1: Sovereign Community (Zero Cost to User)

| Tier | Cost | Features | Purpose |
|------|------|----------|---------|
| **The Sovereign (Free)** | **$0** | Full local analysis, BYOI chat, basic cards, 100% Client-side | Build community, validate product |
| **The Curator** | **$19.99 one-time** | PKM Export, Relationship Reports, Deep Enrichment, Metadata Fixer | Data power-user tier |
| **The Chamber** | **$4.99/mo or $39/yr** | E2EE Sync, Chamber Portal, Managed AI, Weekly Emails | Convenience tier |

### Phase 2: Managed Cloud & AI (Trust-First Launch)

| Tier | Cost | Features |
|------|------|----------|
| **Cloud Backup** | **$50 Lifetime + $10/mo** or **$15/mo** | Multi-device access, encrypted backup, managed embeddings |

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
│   ├── controllers/        # UI Controllers
│   │   ├── chat-ui-controller.js
│   │   ├── sidebar-controller.js
│   │   ├── view-controller.js
│   │   └── ...
│   │
│   ├── services/           # Business Logic Services
│   │   ├── event-bus.js            # Centralized typed events
│   │   ├── session-manager.js      # Session lifecycle
│   │   ├── tab-coordination.js     # Cross-tab coordination
│   │   ├── provider-fallback-chain.js   # Provider switching
│   │   ├── provider-health-authority.js # Health tracking
│   │   ├── error-recovery-coordinator.js # Error handling
│   │   └── ...
│   │
│   ├── storage/            # Storage Submodules
│   │   ├── indexeddb.js    # Core DB operations
│   │   ├── config-api.js   # Config & tokens
│   │   ├── migration.js    # localStorage migration
│   │   ├── transaction.js  # Multi-backend atomic transactions
│   │   ├── write-ahead-log.js   # Crash recovery
│   │   ├── event-log-store.js   # Event replay
│   │   └── ...
│   │
│   ├── security/           # Security Submodules
│   │   ├── index.js        # Facade
│   │   ├── security-coordinator.js  # Initialization
│   │   ├── message-security.js     # HMAC-SHA256 signing
│   │   ├── encryption.js   # AES-GCM encryption
│   │   ├── key-manager.js  # Non-extractable keys
│   │   └── ...
│   │
│   ├── state/              # State Management
│   │   └── app-state.js    # Centralized state
│   │
│   ├── workers/            # Web Workers
│   │   ├── vector-search-worker.js
│   │   ├── pattern-worker-pool.js
│   │   └── pattern-worker.js
│   │
│   ├── artifacts/          # Inline Visualizations
│   │   ├── index.js        # Facade (validate, render, utilities)
│   │   ├── artifact-spec.js # Schema builders
│   │   ├── validation.js   # Allowlist + sanitization
│   │   └── renderer.js     # Custom SVG renderer
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
6. Controller initialization
7. Event system setup
8. OAuth/mode handling

#### Controllers (`js/controllers/`)
| Controller | Responsibility |
|------------|---------------|
| `ChatUIController` | Chat display, streaming, SSE |
| `SidebarController` | Session management, UI state |
| `ViewController` | View transitions, DOM updates |
| `FileUploadController` | File processing, uploads |
| `SpotifyController` | Spotify API |
| `DemoController` | Demo mode |
| `ResetController` | Data reset, privacy |
| `ObservabilityController` | Performance dashboard |

#### Event System (`js/services/event-bus.js`)
- **Typed events**: Schemas for type safety
- **Priority dispatch**: CRITICAL, HIGH, NORMAL, LOW
- **Circuit breaker**: Storm detection and overflow handling
- **Per-handler circuit breakers**: Individual failure tracking
- **Domain filtering**: Scoped event delivery
- **Async modes**: sync, async, await-all, parallel

#### State Management (`js/state/app-state.js`)
```javascript
const INITIAL_STATE = {
    view: { current, previous },      // Current screen
    data: { streams, chunks, patterns, personality },
    lite: { isLiteMode },
    ui: { sidebarCollapsed },
    operations: { isProcessing },
    demo: { isDemoMode }
};
```

---

### 2. Security Architecture

**Philosophy:** Defense-in-depth with 100% client-side security using Web Crypto API.

#### Security Modules (`js/security/`)

| Module | Purpose |
|--------|---------|
| `index.js` | Facade and unified API |
| `security-coordinator.js` | Single authority for initialization |
| `message-security.js` | HMAC-SHA256 signing and verification |
| `encryption.js` | AES-GCM, PBKDF2 key derivation |
| `token-binding.js` | XSS token protection, device fingerprinting |
| `key-manager.js` | Non-extractable key management |
| `storage-encryption.js` | Storage-specific encryption |

#### Threat Model

**Addressed Threats:**
- Cross-tab data corruption (leader election + write authority)
- XSS attacks (secure context + token binding)
- Message tampering (HMAC-SHA256 + timestamp validation)
- Replay attacks (nonce tracking + expiration)
- Key extraction (non-extractable keys)
- Prototype pollution (prototype freezing)

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

### 4. Services & Providers Layer

#### Provider Architecture

**ProviderFallbackChain (`js/services/provider-fallback-chain.js`):**
- Priority: OPENROUTER → LM_STUDIO → OLLAMA → FALLBACK
- Dynamic health-based ordering
- Atomic circuit breaker protection

**ProviderHealthAuthority (`js/services/provider-health-authority.js`):**
- Single source of truth for provider health
- Circuit states: CLOSED, OPEN, HALF_OPEN
- Health levels: HEALTHY, DEGRADED, UNHEALTHY, BLACKLISTED
- Time-based blacklist (5 minutes default)
- Request history with configurable size

**Circuit Breaker Configuration:**
- Failure threshold: 5 consecutive failures
- Success threshold: 2 successes in half-open
- Volume threshold: 5 requests minimum
- Cooldown: 60 seconds in OPEN

#### Cross-Tab Coordination (`js/services/tab-coordination.js`)

**TabCoordinator Features:**
- Deterministic leader election (lowest ID wins)
- Dual transport: BroadcastChannel → SharedWorker fallback
- VectorClock integration for conflict detection
- Clock skew compensation (2-second tolerance)
- Adaptive timing based on device

#### Session Management (`js/services/session-manager.js`)

**Persistence Strategy:**
1. Primary: IndexedDB via unified Storage API
2. Fallback: localStorage for configuration
3. Emergency: Sync localStorage backup on beforeunload

#### Error Recovery (`js/services/error-recovery-coordinator.js`)

**Priority Levels:**
- CRITICAL (100): Security threats, data corruption
- HIGH (75): Storage failures
- MEDIUM (50): UI failures
- LOW (25): Operational issues

#### Worker Pool (`js/workers/pattern-worker-pool.js`)

**Parallel Processing:**
- Worker count: `navigator.hardwareConcurrency - 1`
- Memory limits: ≤2GB devices max 2 workers
- SharedArrayBuffer mode with COOP/COEP headers
- Heartbeat monitoring (15-second timeout)
- Backpressure management (pause at 50 pending)

---

## Key Features Overview

### Two-Path Onboarding
| Path | Data Source | Analysis Depth |
|------|-------------|----------------|
| **Full** | .zip/.json upload | Complete eras, ghosted artists, all patterns |
| **Lite** | Spotify OAuth | Last 50 tracks, top artists/tracks, limited patterns |

### AI Function Calling (27 Functions)
**Core Data Queries:** `get_top_artists`, `get_top_tracks`, `get_artist_history`, `get_listening_stats`, `compare_periods`, `search_tracks`

**Analytics:** `get_bottom_tracks`, `get_listening_clock`, `get_listening_streaks`, `get_discovery_stats`, `get_skip_patterns`, `get_completion_rate`

**Templates:** `get_templates_by_genre`, `synthesize_profile`

**Artifacts (Visualizations):** `visualize_trend`, `visualize_comparison`, `show_listening_timeline`, `show_listening_heatmap`, `show_data_table`

### Conversational Artifacts
**Claude-style inline visualizations** that the AI can generate via function calls:

| Type | Use Case |
|------|---------|
| Line Chart | Trends over time (plays, hours, unique artists) |
| Bar Chart | Top artists/tracks, period comparisons |
| Timeline | Artist discovery, milestones |
| Heatmap | Calendar view of listening activity |
| Table | Detailed data with columns |

### Semantic Search (100% Local)
- WASM-only via Transformers.js (INT8 quantization, ~6MB)
- Battery-aware mode (WebGPU → WASM)
- IndexedDB persistence with LRU cache (5000-vector cap)
- Web Worker offloading for 60fps

### Chat Session Storage
- Persistent chat conversations via IndexedDB
- Session management with auto-save (2s debounce)
- Emergency recovery via localStorage backup

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

---
