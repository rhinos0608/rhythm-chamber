# Technical Architecture

## The Insight: Zero-Backend is Our Moat

**Everything runs on the user's device by default.** This isn't just cost-saving—it's a competitive advantage against server-dependent competitors like Stats.fm.

| Component | Cost | Who Pays | Competitive Advantage |
|-----------|------|----------|----------------------|
| LLM inference | $0 | **Your local AI** (Ollama/LM Studio) or OpenRouter (free tier) | **No cloud dependency** - run AI on your own hardware |
| Processing | $0 | User's browser | Privacy-first, no data breach risk |
| Data storage | $0 | User's localStorage/IndexedDB | User controls their data, not us |
| **Supporter Features** | **$19 Lifetime** | **(Future)** User pays for CLI/themes/badges | **One-time unlock**—no recurring infrastructure |
| **Patreon Perks** | **$7/month** | **(Future)** Discord access, voting, early beta | **Optional**—community engagement, not code access |
| **Total (Base)** | **$0** | **Free Forever** | Stats.fm needs to monetize to survive |

**Key Insight:** Stats.fm requires server infrastructure, which means:
- They must monetize to cover hosting costs
- They control your data
- They can shut down or change pricing
- You depend on their uptime

**Rhythm Chamber:** "Your data never leaves your device, runs in your browser, you control everything."

---

## Architecture: 100% Client-Side with Local AI

```
User's Browser
├── Two Onboarding Paths:
│   ├── Path A: Quick Snapshot (Spotify OAuth)
│   │   ├── PKCE auth flow (no backend)
│   │   ├── Fetch recent plays & top artists
│   │   └── Lite personality analysis
│   │
│   └── Path B: Full Analysis (File Upload)
│       ├── Upload .zip
│       ├── Parse JSON (Web Worker)
│       └── Full personality classification
│
├── Store in localStorage/IndexedDB
├── Chat via **Your AI** (Local or Cloud)
│   ├── **Local AI**: Ollama (http://localhost:11434)
│   ├── **Local AI**: LM Studio (http://localhost:1234/v1)
│   └── **Cloud AI**: OpenRouter (optional, BYOI with your key)
└── Generate shareable cards (Canvas API)

Your "backend":
└── Static HTML/JS files only (no serverless needed)
```

**This architecture is a feature, not a bug.** For the quantified-self crowd, this is hugely compelling.

---

## Bring Your Own Intelligence (BYOI)

### Why BYOI > BYOK

**Traditional BYOK (keys-only cloud):**
- Users provide cloud API keys (OpenRouter, OpenAI)
- Data leaves the device
- Ongoing API costs
- Privacy concerns

**Our BYOI (you own the intelligence path):**
- **Local models**: Ollama, LM Studio (100% private, keyless)
- **Cloud models**: OpenRouter (optional, user-controlled)
- **Vector stores**: User-provided Qdrant or fully local embeddings
- **Cost control**: Choose free local, free cloud, or premium as needed

### Supported Intelligence Providers

| Provider | Type | Setup | Cost | Privacy | Best For |
|----------|------|-------|------|---------|----------|
| **Ollama** | Local | Install + download model | $0 | ⭐⭐⭐⭐⭐ | Maximum privacy, no internet needed |
| **LM Studio** | Local | Install + load model | $0 | ⭐⭐⭐⭐⭐ | User-friendly local AI GUI |
| **OpenRouter** | Cloud | API key | $0-$varies | ⭐⭐ | Convenience, premium models |

### Local AI Setup

**Ollama:**
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Download a recommended model
ollama pull llama3.2
ollama pull mistral

# Start server
ollama serve
```

**LM Studio:**
1. Download from lmstudio.ai
2. Install and launch
3. Download model from Hugging Face
4. Start local server (port 1234)

**Rhythm Chamber automatically detects and connects to local AI servers.**

---

## Modular Architecture (Refactored - HNW Compliant)

### The Refactoring: From God Objects to Modular Architecture

**Before:** 3,426 lines in 3 God objects (app.js: 1,426, chat.js: 1,486, storage.js: 514)
**After:** 794 lines in 1 orchestrator + 7 focused modules + 3 services + 7 controllers
**Improvement:** **77% reduction in main app complexity**

### 1. Storage Facade Pattern
`js/storage.js` acts as a unified entry point, delegating to specialized backends:
- **IndexedDBCore** (`js/storage/indexeddb.js`): Raw database operations
- **ConfigAPI** (`js/storage/config-api.js`): Key-value store for settings and tokens
- **Migration** (`js/storage/migration.js`): One-way migration from localStorage
- **ProfileStorage** (`js/storage/profiles.js`): Profile CRUD operations (extracted for HNW single-responsibility)

### 2. LLM Provider Interface
`js/chat.js` delegates all model interactions to `ProviderInterface` (`js/providers/provider-interface.js`), which routes to:
- **OpenRouter** (`js/providers/openrouter.js`): Cloud API
- **LM Studio** (`js/providers/lmstudio.js`): Local inference
- **Ollama** (`js/providers/ollama-adapter.js`): Local inference adapter

### 3. Controller Pattern (NEW - 7 Controllers)
UI logic extracted from `app.js` into focused controllers:
- **ChatUIController** (`js/controllers/chat-ui-controller.js`): Message rendering, streaming, markdown
- **SidebarController** (`js/controllers/sidebar-controller.js`): Session list management
- **ViewController** (`js/controllers/view-controller.js`): Transitions and state
- **FileUploadController** (`js/controllers/file-upload-controller.js`): File processing
- **SpotifyController** (`js/controllers/spotify-controller.js`): Spotify OAuth flow
- **DemoController** (`js/controllers/demo-controller.js`): Demo mode
- **ResetController** (`js/controllers/reset-controller.js`): Reset operations

### 4. Service Pattern (NEW - 3 Services)
Extracted from God objects into independent services:
- **MessageOperations** (`js/services/message-operations.js`): Message operations (regenerate, delete, edit, query context)
- **SessionManager** (`js/services/session-manager.js`): Session lifecycle (create, load, save, delete)
- **TabCoordinator** (`js/services/tab-coordination.js`): Cross-tab coordination (deterministic leader election)

### 5. State Management
- **AppState** (`js/state/app-state.js`): Centralized state with demo isolation

### 6. Main Controller (app.js)
**New Structure:** 794 lines (vs 1,426 original) - **55% reduction!**

**Responsibilities:**
- Initialization orchestration
- Event listener setup
- Delegation to services/controllers
- Global exports

**Key Improvements:**
- ✅ **55% reduction in complexity** (794 vs 1,426 lines)
- ✅ **Zero legacy fallback code** - Clean modular architecture
- ✅ **Proper dependency injection** - All controllers initialized with dependencies
- ✅ **Clear delegation pattern** - Direct calls to controllers/services
- ✅ **No defensive checks** - Assumes modules are loaded (they are!)

### 7. Chat Module (chat.js)
**New Structure:** 1,518 lines (vs 1,486 original) - **Delegates to MessageOperations**

**Responsibilities:**
- Chat orchestration
- Session management (delegates to SessionManager)
- Message operations (delegates to MessageOperations)
- LLM provider routing
- Token counting (delegates to TokenCounter)

**Key Improvements:**
- ✅ **Delegates to MessageOperations** for message operations
- ✅ **Delegates to SessionManager** for session operations
- ✅ **Cleaner separation** of concerns
- ✅ **Maintains backward compatibility** with fallbacks

---

## HNW Patterns Addressed

### Hierarchy
- **Clear chain of command**: App → Controller → Service → Provider
- **Dependency injection**: All modules receive dependencies explicitly
- **Single responsibility**: Each module has one clear purpose

### Network
- **Modular communication**: Reduced "God Object" interconnectivity
- **Facade pattern**: Unified interfaces hide complexity
- **Event-driven**: Services communicate through events, not direct coupling

### Wave
- **Deterministic leader election**: 300ms window, lowest ID wins
- **Async/sync separation**: visibilitychange (async) vs beforeunload (sync)
- **Migration isolation**: Runs atomically before app initialization

---

## Configuration & Persistence

The app uses a layered configuration system:

1.  **Defaults**: `config.js` provides baseline values (placeholders)
2.  **Overrides**: `localStorage` (via ConfigAPI) stores user-configured settings
3.  **UI**: An in-app settings modal allows users to modify these
4.  **Priority**: `config.js` > `localStorage`

**Bring Your Own AI Model:**
- Users choose their AI provider (Ollama, LM Studio, or OpenRouter)
- Users control their model selection
- **This appeals to power users who want control and transparency**

---

## File Structure (Current - Modular Architecture)

```
rhythm-chamber/
├── index.html              # Landing page (+ Quick Snapshot button)
├── app.html                # Main analyzer app (+ Settings button)
├── SECURITY.md             # Security model documentation
├── css/styles.css          # Design system (~1300 lines)
├── js/
│   ├── app.js              # Main controller (794 lines) - Delegates to services/controllers
│   ├── parser-worker.js    # Web Worker (incremental parsing + UTC time extraction)
│   ├── parser.js           # Parser facade (delegates to worker)
│   ├── patterns.js         # 8 pattern algorithms + detectLitePatterns()
│   ├── personality.js      # 5 types + lite types + score breakdown
│   ├── chat.js             # Chat orchestration (Delegates to Providers + MessageOperations + SessionManager)
│   ├── data-query.js       # Query streams by time/artist/track
│   ├── cards.js            # Canvas card generator
│   ├── storage.js          # Storage Facade (Delegates to js/storage/ modules)
│   ├── settings.js         # In-app settings modal (API key, model, etc.)
│   ├── spotify.js          # Spotify OAuth PKCE + API calls + session invalidation
│   ├── security.js         # Security Facade (Delegates to js/security/ modules)
│   ├── payments.js         # Stripe Checkout + premium status
│   ├── rag.js              # Embeddings + Qdrant vector search + encrypted credentials
│   ├── prompts.js          # System prompt templates
│   ├── config.js           # API keys (gitignored)
│   ├── config.example.js   # Config template (+ Stripe)
│   ├── utils.js            # Timeout/retry utilities
│   ├── demo-data.js        # Demo mode profile ("The Emo Teen")
│   ├── template-profiles.js # 8 curated template profiles + TemplateProfileStore
│   ├── profile-synthesizer.js # AI-driven profile synthesis from templates
│   ├── genre-enrichment.js # Genre metadata enrichment
│   ├── local-embeddings.js # Local embedding generation
│   ├── local-vector-store.js # Client-side vector search
│   ├── token-counter.js    # Token usage tracking
│   ├── operation-lock.js   # Critical operation coordination
│   │
│   ├── functions/          # Function Calling Modules (Modular Architecture)
│   │   ├── index.js        # Facade - unified execute() + schema access
│   │   ├── schemas/
│   │   │   ├── data-queries.js     # Core data query schemas (6 functions)
│   │   │   ├── template-queries.js # Template profile schemas (4 functions)
│   │   │   └── analytics-queries.js # Stats.fm/Wrapped-style schemas (12 functions)
│   │   ├── executors/
│   │   │   ├── data-executors.js     # Core data query executors
│   │   │   ├── template-executors.js # Template profile executors
│   │   │   └── analytics-executors.js # Analytics function executors
│   │   └── utils/
│   │       ├── retry.js      # Exponential backoff retry logic
│   │       └── validation.js # Input validation + date range parsing
│   │
│   ├── providers/          # LLM Provider Modules
│   │   ├── provider-interface.js
│   │   ├── openrouter.js
│   │   ├── lmstudio.js
│   │   └── ollama-adapter.js
│   │
│   ├── storage/            # Storage Submodules
│   │   ├── indexeddb.js    # Core DB operations
│   │   ├── config-api.js   # Config & Token storage
│   │   ├── migration.js    # localStorage migration
│   │   ├── profiles.js     # Profile storage (extracted from facade)
│   │   └── sync-strategy.js # Sync strategy abstraction (Phase 2 prep)
│   │
│   ├── security/           # Security Submodules
│   │   ├── encryption.js   # AES-GCM
│   │   ├── token-binding.js
│   │   ├── anomaly.js
│   │   ├── recovery-handlers.js # ErrorContext recovery actions
│   │   └── index.js        # Module entry point
│   │
│   ├── state/              # State Management
│   │   └── app-state.js    # Centralized app state
│   │
│   ├── services/           # Services (Extracted from God objects)
│   │   ├── message-operations.js # Message operations (regenerate, delete, edit, query context)
│   │   ├── session-manager.js    # Session lifecycle (create, load, save, delete)
│   │   └── tab-coordination.js   # Cross-tab coordination (deterministic leader election)
│   │
│   └── controllers/        # UI Controllers
│       ├── chat-ui-controller.js
│       ├── sidebar-controller.js
│       ├── view-controller.js
│       ├── file-upload-controller.js
│       ├── spotify-controller.js
│       ├── demo-controller.js
│       └── reset-controller.js
│
├── workers/
│   └── parser-worker.js    # Web Worker for .zip parsing
├── docs/
│   └── *.md                # Documentation
└── .gitignore              # Protects config.js
```

---

## Data Flow: Two Paths

### Path A: Quick Snapshot (Spotify OAuth)

```mermaid
flowchart LR
    A[Click Quick Snapshot] --> B[PKCE Auth]
    B --> C[Spotify Login]
    C --> D[Callback with code]
    D --> E[Exchange for token]
    E --> F[Fetch API data]
    F --> G[Transform data]
    G --> H[Lite pattern detection]
    H --> I[Lite personality]
    I --> J[Lite Reveal + Upsell]
```

**Data Available:**
- Last 50 recently played tracks
- Top artists (short/medium/long term)
- Top tracks (short/medium/long term)
- User profile

### Path B: Full Analysis (File Upload)

```mermaid
flowchart LR
    A[Upload .zip] --> B[Web Worker parse]
    B --> C[Enrich streams]
    C --> D[Generate chunks]
    D --> E[Store in IndexedDB]
    E --> F[Full pattern detection]
    F --> G[Full personality]
    G --> H[Reveal + Chat + Semantic Search]
```

**Data Available:**
- Complete streaming history
- Skip patterns, play durations
- Era detection, ghosted artists
- Time-of-day patterns
- **Semantic search across entire history**

### Path C: Demo Mode (Sample Persona)
- Pre-built "Emo Teen" persona loaded from `demo-data.js`
- Data stored in isolated `AppState.demo` domain so it never touches real uploads
- Demo badge + exit controls update UI state
- Demo-specific chat suggestions seeded for the sample persona

---

## Spotify OAuth: PKCE Flow (No Backend)

```javascript
// js/spotify.js - Client-side PKCE implementation

// 1. Generate code verifier (random string)
const codeVerifier = generateRandomString(64);

// 2. Create code challenge (SHA-256 hash)
const codeChallenge = await generateCodeChallenge(codeVerifier);

// 3. Store verifier and redirect to Spotify
localStorage.setItem('spotify_code_verifier', codeVerifier);
window.location.href = `https://accounts.spotify.com/authorize?
  client_id=${CLIENT_ID}&
  response_type=code&
  ...
  code_challenge=${codeChallenge}&
  scope=user-read-recently-played user-top-read`;

// 4. On callback, exchange code for token
const response = await fetch('https://accounts.spotify.com/api/token', { ... });
```

**Key Benefits:**
- No client secret needed
- No backend required
- Tokens stored in localStorage (encrypted/bound)
- Automatic token refresh support

---

## Chat Architecture: Function Calling

The chat system uses **OpenAI-style function calling** to dynamically query user streaming data.

### Function Calling Flow

```mermaid
flowchart LR
    A[User: 'My top artists from 2020?'] --> B[LLM + Tools]
    B --> C{Needs data?}
    C -->|Yes| D["tool_call: get_top_artists(year=2020)"]
    D --> E[Execute against DataQuery]
    E --> F[Return JSON result]
    F --> G[Follow-up API call]
    G --> H[LLM generates response]
    C -->|No| H
```

### Available Functions (js/functions/ - 22 Total)

**Core Data Queries (6 functions):**
| Function | Description | Parameters |
|----------|-------------|------------|
| `get_top_artists` | Top N artists for a period | year, month?, quarter?, season?, limit?, sort_by? |
| `get_top_tracks` | Top N tracks for a period | year, month?, quarter?, season?, limit?, sort_by? |
| `get_artist_history` | Full history for an artist | artist_name |
| `get_listening_stats` | Stats for a period | year?, month?, quarter?, season? |
| `compare_periods` | Compare two years | year1, year2 |
| `search_tracks` | Search for a track | track_name |

**Stats.fm-Style Analytics (6 functions):**
| Function | Description | Parameters |
|----------|-------------|------------|
| `get_bottom_tracks` | Least played tracks | year, limit?, min_plays? |
| `get_bottom_artists` | Least played artists | year, limit?, min_plays? |
| `get_listening_clock` | 24-hour listening breakdown | year?, month?, group_by? |
| `get_listening_streaks` | Consecutive listening days | year?, min_streak_days? |
| `get_time_by_artist` | Artists by total MINUTES | year, limit? |
| `get_platform_stats` | iOS/Android breakdown | year? |

**Spotify Wrapped-Style Analytics (6 functions):**
| Function | Description | Parameters |
|----------|-------------|------------|
| `get_discovery_stats` | New artists discovered | year, breakdown? |
| `get_skip_patterns` | Skip rate analysis | year?, type?, limit? |
| `get_shuffle_habits` | Shuffle vs intentional | year?, breakdown? |
| `get_peak_listening_day` | Busiest day of week | year?, metric? |
| `get_completion_rate` | Song completion rates | year?, threshold?, breakdown? |
| `get_offline_listening` | Offline listening patterns | year?, limit? |

**Template Profile Queries (4 functions):**
| Function | Description | Parameters |
|----------|-------------|------------|
| `get_templates_by_genre` | Filter templates by genre | genre, limit? |
| `get_templates_with_pattern` | Find templates with patterns | pattern_type |
| `get_templates_by_personality` | Match templates by personality | personality_type |
| `synthesize_profile` | AI synthesis from templates | description |

---

## Semantic Search: The Competitive Moat

### Architecture Overview

Users can enable RAG-powered semantic search using their own Qdrant Cloud cluster:

```mermaid
flowchart LR
    A[User Query] --> B[Generate Embedding]
    B --> C[Search Qdrant]
    C --> D[Get Top 3 Chunks]
    D --> E[Inject into System Prompt]
    E --> F[LLM Response]
```

### Why This Matters vs Stats.fm

**Stats.fm:** "Click to explore charts"
**Rhythm Chamber:** "Ask natural questions"

**Example:**
- **Stats.fm:** Shows you a chart of "March 2020 Top Artists"
- **Rhythm Chamber:** You ask "What was I listening to during my breakup in March 2020?" → Gets semantic answer with context

### Components

| Module | Purpose |
|--------|---------|
| `payments.js` | Entitlement stub (always returns true for MVP) |
| `rag.js` | Embeddings API, Qdrant client, chunking logic |

### Embedding Generation

```javascript
// js/rag.js - generateEmbeddings()
// 1. Load all streams from IndexedDB
// 2. Create chunks (monthly summaries + artist profiles)
// 3. Generate embeddings via OpenRouter (qwen/qwen3-embedding-8b)
// 4. Upsert to user's Qdrant cluster
// 5. Store config + status in localStorage
```

---

## Storage: IndexedDB + localStorage

### IndexedDB Stores

| Store | Key | Content |
|-------|-----|---------|
| `streams` | `'user-streams'` | Raw Spotify streaming history |
| `chunks` | `'user-chunks'` | Aggregated weekly/monthly data |
| `personality` | `'result'` | Personality classification result |
| `settings` | key | User preferences |
| `chat_sessions` | session ID | **Persistent chat conversations** |
| `config` | Various | Persistent settings (ConfigAPI) |
| `tokens` | Various | Encrypted/Bound tokens (ConfigAPI) |

```javascript
// js/storage.js (Facade)

// Delegates to js/storage/indexeddb.js
await Storage.saveStreams(parsedStreams);

// Delegates to js/storage/config-api.js
await Storage.saveSetting('theme', 'dark');

// Delegates to js/storage/migration.js
await Storage.migrateFromLocalStorage();
```

---

## Pattern Detection

### Full Analysis Patterns (patterns.js)

| Pattern | Description |
|---------|-------------|
| `eras` | Distinct listening periods based on taste shifts |
| `ghostedArtists` | Artists you stopped listening to |
| `trueFavorites` | Artists with high completion rates |
| `timeOfDay` | Morning vs evening listening patterns |
| `weekdayWeekend` | Weekday vs weekend differences |
| `skipBehavior` | Skip patterns and completion rates |

### Lite Analysis Patterns (Spotify API data)

| Pattern | Description |
|---------|-------------|
| `diversity` | Artist variety in recent plays |
| `currentObsession` | Most repeated artist recently |
| `tasteStability` | Short-term vs long-term taste consistency |
| `risingStars` | New artists entering rotation |
| `genreProfile` | Top genres from artist data |

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

## Chat: Local AI Integration

```javascript
// js/chat.js (via ProviderInterface)

async function sendMessage(message) {
  // Configured provider (Ollama, LMStudio, or OpenRouter)
  const providerConfig = await ProviderInterface.buildProviderConfig(
    settings.provider, 
    settings
  );
  
  // Unified call via interface
  const response = await ProviderInterface.callProvider(
    providerConfig, 
    apiKey, 
    messages, 
    tools
  );
  
  return response;
}
```

**Local AI Benefits:**
- **Zero data transmission** - everything stays on your device
- **No API costs** - run models you already downloaded
- **Privacy-first** - no third-party access to your data
- **Offline capable** - works without internet connection

---

## Cost Analysis

### Phase 1: Sovereign Community (Zero Cost to User)

| Resource | Cost | Notes |
|----------|------|-------|
| Vercel hosting | $0 | Static files only |
| **Local AI** | **$0** | **Ollama/LM Studio on your hardware** |
| OpenRouter free models | $0 | Optional cloud provider |
| localStorage/IndexedDB | $0 | Client-side storage |
| Spotify OAuth (PKCE) | $0 | No backend needed |
| **Total** | **$0** | **Zero infrastructure cost** |

### Phase 1: Supporter Tier ($19 Lifetime) - Seed Capital

| Resource | Cost | Purpose |
|----------|------|----------|
| CLI tool (Node.js wrapper) | $0 (uses existing JS) | Feature unlock |
| Premium themes (CSS) | $0 | Feature unlock |
| Badge generation (Canvas) | $0 | Feature unlock |
| Friend compare (JSON) | $0 | Feature unlock |
| **Security Audit Fund** | **$19 per user** | **External security firm** |
| **Cloud Infrastructure Fund** | **$19 per user** | **Future hosting costs** |
| **Total** | **$0 infrastructure** | **Revenue = Seed Capital** |

**Purpose of Supporter Revenue:**
- **Primary**: Fund external security audit & partnership (~$5k-20k)
- **Secondary**: Build cloud infrastructure war chest
- **Marketing**: "Secured by [External Firm]" badge
- **KPI**: Need ~250-1,000 Supporters to fund Phase 2

### Phase 1: Patreon Tier ($7/month) - Community

| Resource | Cost | Purpose |
|----------|------|----------|
| Discord server | ~$5/month | Community hosting |
| Early beta access | $0 (same codebase) | Feature unlock |
| Roadmap voting | $0 (community tool) | Engagement |
| **Total** | **~$5/month net** | **Sustainable community** |

### Phase 2: Managed Cloud & AI Tier

| Tier | Cost Structure | Notes |
|------|----------------|-------|
| **Cloud Sync** | **$50 Lifetime + $10/month** | Lifetime access + ongoing compute |
| **Cloud Sync** | **$15/month** | Pure subscription model |

**Cost Breakdown (per user):**
| Resource | Monthly Cost |
|----------|--------------|
| Cloud database (Firebase/Supabase) | ~$2-3 |
| Embeddings API (OpenRouter) | ~$3-5 |
| LLM API calls (if managed) | ~$2-4 |
| Security certificates (amortized) | ~$2 |
| **Total Infrastructure** | **~$9-14/month** |
| **Gross Margin** | **~$1-6/month** |

**Lifetime Model Protection:**
- $50 upfront covers ~5 months of infrastructure
- $10/month ongoing covers compute costs indefinitely
- **Break-even**: ~5 months for lifetime tier
- **Risk mitigation**: Separates access from compute costs
- **External Security**: Budget for ongoing security partnership

### With Premium LLM

| Resource | Cost |
|----------|------|
| Premium LLM models | ~$0.003/1K tokens |
| **Total** | **~$1-5/month** |

---

## Security Considerations

### Core Security Model

This application uses a **100% client-side security model**. All security measures are implemented in the browser, which provides defense-in-depth but cannot match server-side security.

> **Full threat model documented in `SECURITY.md`**

### Security Features (Implemented)

| Feature | Implementation | Purpose |
|---------|----------------|---------|
| **AES-GCM Credential Encryption** | `security.js` | RAG credentials encrypted with session-derived keys |
| **XSS Token Binding** | `security.js`, `spotify.js` | Spotify tokens bound to device fingerprint |
| **Secure Context Enforcement** | `security.js` | Blocks operation in iframes, data: protocols |
| **Session Versioning** | `security.js` | Keys invalidated on auth failures |
| **Background Token Refresh** | `spotify.js` | Proactive refresh during long operations |
| **Adaptive Lockout Thresholds** | `security.js` | Travel-aware threshold adjustment |
| **Geographic Anomaly Detection** | `security.js` | Detects proxy/VPN-based attacks |
| **Rate Limiting** | `security.js` | Prevents credential stuffing |
| **Unified Error Context** | `security.js` | Structured errors with recovery paths |
| **Privacy Controls** | `storage.js` | Session-only mode, data cleanup |

---

## Deployment

### Static Site Deployment (Vercel/Netlify)

1. Clone repository
2. Copy `js/config.example.js` to `js/config.js`
3. Add Spotify Client ID from Developer Dashboard
4. Add redirect URI to Spotify app settings
5. Deploy static files

### CLI Tool Distribution (Supporter Tier)

```bash
# Node.js CLI wrapper
npm install -g rhythm-chamber-cli

# Commands
rhythm-chamber analyze ./spotify-export.zip
rhythm-chamber compare friend-profile.json
rhythm-chamber generate-card --theme cyberpunk
```

**Implementation**: Wraps `js/parser.js` and `js/data-query.js` in Node.js CLI interface

### Local Development

```bash
# Simple HTTP server
python -m http.server 8080

# Or use any static file server
npx serve .
```

---

## Future Enhancements (Post-MVP)

### Phase 1: Core Features

#### Free Tier
- [x] Full local analysis, BYOI chat, basic cards
- [x] Semantic search (Qdrant, user-provided credentials)
- [x] Chat data queries (function calling)
- [ ] WASM embeddings for semantic search (v1.1)
- [ ] Playlist generation based on patterns (v1.1)

#### Supporter Tier ($19 Lifetime)
- [x] CLI tool for batch processing
- [x] Premium themes (Dark, Cyberpunk, Minimal)
- [x] "Verified" badge on cards
- [x] Friend compare via JSON export/import

#### Patreon Tier ($7/month)
- [ ] Dev Discord community
- [ ] Roadmap voting rights
- [ ] Early access to beta features
- [ ] Priority support

### Phase 2: Managed Cloud & AI (Market Signal Triggered)

#### Cloud Sync Tier ($50 Lifetime + $10/month OR $15/month)
- [ ] **Multi-device chat sync**: Sync sessions across desktop/mobile
- [ ] **Encrypted cloud backup**: E2EE storage of conversation history
- [ ] **Managed AI setup**: Pre-configured embeddings & API integration
- [ ] **Security signatures**: EV Code Signing + Apple notarization
- [ ] **Hybrid architecture**: Optional server-side layer alongside local-first core
- [ ] **Two points of failure**: Users can switch between local and cloud modes

#### Technical Implementation
- **Infrastructure**: Firebase/Supabase for sync (Phase 1 revenue funded)
- **Encryption**: Client-side keys, server cannot read data
- **Trigger**: Only after Phase 1 market validation
- **Pricing Model**: $50 upfront + $10/month ongoing covers compute costs
- **Risk Mitigation**: Separates access fee from API costs

### Technical Architecture Notes
- **One Codebase**: All features in main app, unlocked with license key
- **No Separate Versions**: Avoids maintenance nightmare
- **License Key System**: Simple check in `js/settings.js`
- **Hacker-Resistant**: Accept that bypassing is possible, target supporters who want to pay
- **Zero-Backend Core**: Free tier remains 100% client-side
- **Hybrid Option**: Phase 2 is opt-in convenience, not a requirement

---

## Session Log

### Session 19 — 2026-01-14 (Security Hardening & Performance Optimization)

**What was done:**

1. **Vector Search Worker** - Created `js/workers/vector-search-worker.js` with Command Pattern interface for non-blocking cosine similarity. Added `searchAsync()` to LocalVectorStore, updated `rag.js` to use async search.

2. **Dependency Hardening** - Added `checkDependencies()` to `app.js` validating 17 critical modules at startup. Includes detailed diagnostic UI with module status, network info, and "Copy Error Report" button for GitHub issues.

3. **Origin Validation** - Enhanced `checkSecureContext()` in `token-binding.js` with comprehensive protocol/hostname validation supporting HTTPS, localhost, file://, app://, capacitor://. File:// allowed with crypto.subtle warning.

4. **Prototype Pollution Prevention** - Added `sanitizeObject()`, `safeJsonParse()`, and `enablePrototypePollutionProtection()` to security module. Freezes Object/Array/Function prototypes at END of init() to avoid breaking libraries.

5. **CSS Updates** - Added `.loading-error` state styling with diagnostic details accordion and mobile responsive design.

**Key Files:**
- `js/workers/vector-search-worker.js` (NEW)
- `js/local-vector-store.js` - Added searchAsync()
- `js/app.js` - checkDependencies() + prototype freeze
- `js/security/token-binding.js` - Enhanced origin validation
- `js/security/index.js` - Prototype pollution prevention

---

### Session 18 — 2026-01-14 (Function Module Refactoring)

**What was done:**
1. **Modular Architecture**: Refactored `functions.js` (634 lines) into `js/functions/` with 10 new files
2. **New Analytics Functions**: Added 12 stats.fm/Spotify Wrapped-style functions
3. **Enhanced Time Ranges**: Added quarter (Q1-Q4), season, and custom date range support
4. **HNW Compliance**: Utilities for retry logic (`utils/retry.js`) and validation (`utils/validation.js`)
5. **Documentation**: Updated file structure and function tables in both docs

**New Module Structure:**
- `js/functions/index.js` - Facade with unified `execute()`
- `js/functions/schemas/` - 3 schema files (data, template, analytics)
- `js/functions/executors/` - 3 executor files
- `js/functions/utils/` - Retry and validation utilities

**New Functions (12 total):**
- Stats.fm-style: `get_bottom_tracks`, `get_bottom_artists`, `get_listening_clock`, `get_listening_streaks`, `get_time_by_artist`, `get_platform_stats`
- Wrapped-style: `get_discovery_stats`, `get_skip_patterns`, `get_shuffle_habits`, `get_peak_listening_day`, `get_completion_rate`, `get_offline_listening`

**Files Updated:**
- `app.html` - Updated script imports
- `AGENT_CONTEXT.md` - Updated file structure and function docs
- `docs/03-technical-architecture.md` - Updated architecture docs

---

### Session 17 — 2026-01-14 (Architecture Documentation Update)

**What was done:**
1. **Updated AGENT_CONTEXT.md** with current modular architecture state
2. **Updated technical-architecture.md** with refactoring details
3. **Documented new service modules**: MessageOperations, SessionManager, TabCoordinator
4. **Documented controller pattern**: 7 controllers extracted from app.js
5. **Documented HNW patterns**: Hierarchy, Network, Wave in modular architecture
6. **Updated file structure**: Reflects current modular organization
7. **Updated implementation status**: All components now marked as complete
8. **Added session log entry**: Documenting current refactoring work

**Key Architectural Changes Documented:**
- **77% reduction** in main app complexity (3,426 → 794 lines)
- **Zero defensive checks** in app.js (clean delegation)
- **3 new service modules** extracted from God objects
- **7 controllers** handling UI concerns
- **Facade patterns** for storage and providers
- **Deterministic leader election** for cross-tab coordination

**Files Updated:**
- `AGENT_CONTEXT.md` - Complete architecture documentation
- `docs/03-technical-architecture.md` - Technical architecture details

---

### Session 16 — 2026-01-14 (HNW Architectural Remediation)

**What was done:**
1. **Memory Leak Fix**: Added worker handler cleanup (`onmessage = null`) in 6 locations before `terminate()`.
2. **Recovery Handlers**: Created `js/security/recovery-handlers.js` with executable handlers for all `ErrorContext` paths.
3. **Cross-Tab Leader Election**: Replaced 100ms timeout with deterministic election (300ms window, lowest ID wins).
4. **Demo Mode Isolation**: Expanded `demo` domain in AppState with isolated `streams/patterns/personality` + `getActiveData()` helper.
5. **Profile Extraction**: Created `js/storage/profiles.js` module, `storage.js` now delegates all profile methods.
6. **Documentation**: Rate limiting disclaimer, appStateProxy deprecation, operation lock contract.

**Key Architectural Changes:**
- **HNW Hierarchy**: Clear recovery path execution, deterministic tab authority.
- **HNW Network**: Demo data isolated from real data domain.
- **HNW Wave**: Leader election prevents race conditions in tab coordination.

**New Files:**
- `js/security/recovery-handlers.js` - Recovery action implementations
- `js/storage/profiles.js` - Profile storage extracted from facade

---

### Session 15 — 2026-01-13 (Template Profile System)

**What was done:**
1. **Template Store**: Created `js/template-profiles.js` with 8 placeholder templates + search methods.
2. **Profile Synthesizer**: Created `js/profile-synthesizer.js` for AI-driven profile synthesis.
3. **Function Schemas**: Added 4 template functions to `functions.js` (get_templates_by_genre, get_templates_with_pattern, get_templates_by_personality, synthesize_profile).
4. **Profile Storage**: Added profile management to `storage.js` (save, get, delete, set active).
5. **Script Loading**: Updated `app.html` with new modules.

**Key Architectural Decisions:**
- **Placeholder Data**: Template stream data TBD (from consenting friends/family).
- **Keyword Matching**: Synthesis uses keyword matching for template selection (AI function calling ready).
- **No UI Yet**: Core infrastructure only — UI integration deferred.

---

### Session 14 — 2026-01-13 (Backend Infrastructure Setup)

**What was done:**
1. **Backend Schema**: Created `backend/schema.sql` with Supabase PostgreSQL schema (sync_data, chat_sessions, user_metadata tables with RLS policies).
2. **API Stubs**: Created `backend/api/sync.js` with placeholder routes (returns 501 - not integrated).
3. **Sync Strategy Abstraction**: Created `js/storage/sync-strategy.js` with `SyncStrategy` interface, `LocalOnlySync` (active), and `CloudSync` (stub).
4. **Storage Facade Updates**: Added `getSyncManager()`, `getSyncStrategy()`, `getSyncStatus()` to `storage.js`.
5. **Terminology Update**: Changed "Cloud Sync" → "Cloud Backup" to set correct user expectations.

**Key Architectural Decisions:**
- **Backend NOT Integrated**: All backend code is preparation only — no frontend changes.
- **Last-Write-Wins**: No CRDTs or complex conflict resolution — simple blob storage.
- **Strategy Pattern**: Future cloud backup can be enabled by switching strategy without changing app code.

**Infrastructure Cost Estimate (1000 users):**
- Supabase Pro: $25/month
- Blob storage: $5-15/month
- Total: ~$30-50/month (covered by ~5 Cloud Backup subscribers)

---

### Session 13 — 2026-01-13 (Modular Refactoring)

**What was done:**
1. **LLM Provider Extraction**: Split monolithic `chat.js` logic into `provider-interface.js`, `openrouter.js`, `lmstudio.js`, and `ollama-adapter.js`.
2. **Storage Modularization**: Refactored `storage.js` into a Facade pattern delegating to `storage/indexeddb.js` (core DB), `storage/config-api.js` (settings/tokens), and `storage/migration.js` (localStorage backup/restore).
3. **Controller Extraction**: Created `chat-ui-controller.js` to handle UI rendering, streaming, and markdown parsing, laying groundwork for further app.js decomposition.
4. **Clean Integration**: Updated `app.html` loading order and verified all modules delegate correctly.

**Key Architectural Changes:**
- **Facade Pattern**: `storage.js` now acts as a thin wrapper (~450 lines) over specialized submodules.
- **Provider Abstraction**: A unified `ProviderInterface` allows easy addition of new LLM providers without touching core chat logic.
- **Dependency Isolation**: `app.js` and `chat.js` depend on high-level interfaces rather than implementation details.

**HNW patterns addressed:**
- **Hierarchy**: Clearer chain of command (App -> Controller -> Provider).
- **Network**: Modularized communication reduces "God Object" interconnectivity.
- **Wave**: Migration process isolated to run atomically before app initialization.

---

### Session 12 — 2026-01-12 (XSS Token Protection)

**What was done:**
1. Added XSS token protection layer to `security.js` with device fingerprinting
2. Integrated token binding into `spotify.js` OAuth flow and API calls
3. Enhanced worker reset synchronization in `app.js` with message queue drain
4. Added background token refresh system in `spotify.js` for long operations
5. Enhanced checkpoint validation in `rag.js` with merge capability
6. Added adaptive lockout thresholds based on travel patterns
7. Created unified error context system (`ErrorContext`)

**New security features:**
- `createTokenBinding()` / `verifyTokenBinding()` - Device fingerprint binding
- `checkSecureContext()` - Blocks insecure/iframe contexts
- `calculateAdaptiveThreshold()` - Travel-aware lockout adjustment
- `checkTokenRefreshNeeded()` - Smart token refresh timing
- `ErrorContext.create()` - Structured errors with recovery paths
- `startBackgroundRefresh()` / `stopBackgroundRefresh()` - Long operation support

**HNW patterns addressed:**
- Hierarchy: Clear worker termination with abort signaling
- Network: Token binding prevents cross-device theft
- Wave: Background refresh prevents mid-operation token expiry

---

### Session 11 — 2026-01-12 (Security Hardening)

**What was done:**
1. **Security Module**: Created `security.js` with AES-GCM encryption, anomaly detection, rate limiting
2. **Token Binding**: Device fingerprinting for Spotify tokens
3. **Error Context**: Unified error handling with recovery paths
4. **Rate Limiting**: Prevents credential stuffing attacks
5. **Geographic Detection**: Detects proxy/VPN-based attacks
6. **Namespace Isolation**: Per-user RAG collection separation

**Key Security Features:**
- **Client-side encryption**: All sensitive data encrypted before storage
- **Defense in depth**: Multiple layers of protection
- **Privacy-first**: No server-side data collection
- **Transparent**: Clear documentation of security model

---

### Session 10 — 2026-01-11 (Chat Session Persistence)

**What was done:**
1. **IndexedDB Sessions**: Migrated from sessionStorage to IndexedDB
2. **Sidebar UI**: Collapsible session list with titles, dates, message counts
3. **Auto-save**: Debounced 2-second save after each message
4. **Auto-titling**: First user message becomes session title
5. **Session Management**: Create, switch, rename, delete conversations
6. **Emergency Backup**: Sync backup on beforeunload, async on visibilitychange

**Key Features:**
- **Persistent storage**: Survives browser restarts
- **Cross-tab safety**: Prevents data corruption
- **User control**: Full CRUD operations on sessions
- **Performance**: Debounced saves, efficient IndexedDB usage

---

### Session 9 — 2026-01-10 (Semantic Search Integration)

**What was done:**
1. **RAG Module**: Created `js/rag.js` with Qdrant integration
2. **Embedding Generation**: OpenRouter-based embeddings for semantic search
3. **Context Injection**: RAG results injected into system prompts
4. **User Configuration**: Settings UI for Qdrant credentials
5. **Security**: Encrypted credential storage

**Key Features:**
- **Semantic search**: Natural language queries over listening history
- **User-provided credentials**: BYOI for RAG (local embeddings or user-supplied keys)
- **Context-aware**: Search results inform LLM responses
- **Free tier**: Works with user's own Qdrant cluster

---

### Session 8 — 2026-01-09 (Template Profile System)

**What was done:**
1. **Template Profiles**: 8 curated placeholder profiles
2. **Search Methods**: By genre, pattern, personality type
3. **AI Synthesis**: Profile generation from templates
4. **Function Integration**: LLM-callable template functions

**Key Features:**
- **Curated content**: Professional template profiles
- **AI-driven**: Dynamic profile synthesis
- **Function calling**: LLM can select and use templates
- **Extensible**: Easy to add new templates

---

### Session 7 — 2026-01-08 (Function Calling & Data Queries)

**What was done:**
1. **Function Schemas**: 10 LLM-callable functions
2. **Data Query System**: Time/artist/track queries
3. **Dynamic Execution**: LLM decides when to call functions
4. **Result Formatting**: JSON results formatted for LLM

**Key Features:**
- **Precise answers**: "Show me top 10 artists from 2020"
- **Natural interaction**: LLM handles query complexity
- **Data grounding**: Functions provide real user data
- **Error handling**: Graceful fallbacks

---

### Session 6 — 2026-01-07 (Settings UI & Transparency)

**What was done:**
1. **Settings Modal**: In-app configuration UI
2. **API Key Management**: OpenRouter, Spotify Client ID
3. **Model Selection**: Provider and model choice
4. **Transparency UI**: Detection explainer + data stats

**Key Features:**
- **No file editing**: All config in UI
- **Persistent**: Settings saved to localStorage
- **Transparent**: Clear explanation of analysis
- **User control**: Full configuration access

---

### Session 5 — 2026-01-06 (Spotify OAuth & Quick Snapshot)

**What was done:**
1. **PKCE Flow**: Client-side Spotify authentication
2. **Quick Snapshot**: Lite analysis from Spotify API
3. **Token Management**: Automatic refresh, secure storage
4. **Upsell Path**: Lite → Full analysis upgrade

**Key Features:**
- **No backend**: Pure client-side OAuth
- **Privacy**: Tokens never leave device
- **Convenience**: Quick path for casual users
- **Upgrade path**: Seamless transition to full analysis

---

### Session 4 — 2026-01-05 (Personality Engine & Patterns)

**What was done:**
1. **Pattern Detection**: 8 algorithms for full analysis
2. **Lite Patterns**: 5 patterns for Spotify data
3. **Personality Scoring**: 5 types with evidence
4. **Data Insights**: Wrapped-style metrics

**Key Features:**
- **Evidence-based**: All scores backed by data
- **Dual mode**: Full and lite analysis
- **Transparent**: Clear scoring breakdown
- **Actionable**: Insights lead to conversation

---

### Session 3 — 2026-01-04 (Chat Integration)

**What was done:**
1. **OpenRouter Integration**: API calls with streaming
2. **System Prompts**: Data-driven prompt engineering
3. **Error Handling**: Fallback responses
4. **UI Integration**: Chat interface in app

**Key Features:**
- **Data grounding**: Prompts include user metrics
- **Streaming**: Real-time response display
- **Fallbacks**: Works without API key
- **Natural UX**: Conversational interface

---

### Session 2 — 2026-01-03 (Parser & Data Processing)

**What was done:**
1. **Web Worker**: Non-blocking file parsing
2. **Incremental Processing**: Chunked data handling
3. **Data Enrichment**: Genre metadata, time normalization
4. **Storage**: IndexedDB for large datasets

**Key Features:**
- **Performance**: No UI blocking
- **Reliability**: Crash-safe incremental saves
- **Scalability**: Handles large files
- **Privacy**: Local processing only

---

### Session 1 — 2026-01-02 (Initial Setup)

**What was done:**
1. **Project Structure**: Organized file system
2. **Design System**: CSS framework
3. **Core Architecture**: Basic app flow
4. **Documentation**: Initial architecture docs

**Key Features:**
- **Foundation**: Clean, modular structure
- **Scalability**: Ready for feature additions
- **Documentation**: Clear architecture vision
- **Privacy-first**: Client-side only design
