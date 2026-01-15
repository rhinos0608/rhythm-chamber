# AI Agent Reference — Rhythm Chamber

> **Status:** Free MVP + Quick Snapshot + Settings UI + AI Function Calling + Semantic Search (Free) + Chat Sessions + HNW Fixes + Security Hardening v2 + Modular Refactoring + **Fail-Closed Security (Safe Mode) + Centralized Storage Keys** + **Operation Lock Contract & Race Condition Fixes** + **Function Calling Fallback System** + **ToolStrategy Pattern** + **Aggressive ES Module Migration**

---

## Monetization Strategy

**Philosophy:** Community-first growth with zero monetization entry. Build a base of enthusiasts, then scale to premium managed services. Revenue from early supporters funds infrastructure and security.

### Phase 1: Sovereign Community (Zero Cost to User)

| Tier | Cost | Features | Infrastructure | Purpose |
|------|------|----------|----------------|----------|
| **Free** | **$0** | Full local analysis, BYOI chat (your models/keys), basic cards, personality reveal, 100% Client-side. | Client-side only | **Loss Leader**: Build community, validate product, zero server costs |
| **Supporter** | **$19 Lifetime** | CLI tool, premium themes (Dark/Cyberpunk/Minimal), "Verified" badge, friend compare JSON import | Client-side only | **Seed Capital**: Funds security audit & cloud infrastructure |
| **Patron** | **$7/month** | Dev Discord access, roadmap voting rights, early beta features, priority support | Client-side + Discord | **Community**: Recurring revenue for ongoing support |

### Phase 2: Managed Cloud & AI (Trust-First Launch)

| Tier | Cost | Features | Infrastructure | Trust Signal |
|------|------|----------|----------------|--------------|
| **Cloud Backup** | **$50 Lifetime + $10/month** | Multi-device access, encrypted cloud backup, **managed embeddings & AI setup** | Hybrid (Server-side DB + Client-side E2EE) | **"Secured by [External Firm]"** |
| **Cloud Backup** | **$15/month** | Same as above, no lifetime payment | Hybrid (Server-side DB + Client-side E2EE) | **"Secured by [External Firm]"** |

> **Note on "Device Backup"**: This is intentionally NOT "Cloud Sync". It's manual backup/restore between devices — not real-time sync. No CRDTs, no conflict resolution, just "last-write-wins" encrypted blob storage. This keeps costs low (~$20-50/month for 1000 users) and complexity minimal.

**Key Strategy - "Sovereign-to-Managed" Pipeline:**
- **Community First**: 100% free local tool builds trust and user base
- **Seed Funding**: $19 Supporter tier acts as "crowdfunding" for security
- **External Security**: Revenue funds reputable security firm audit & partnership
- **Marketing Asset**: "Audited by X" badge becomes sales feature for Phase 2
- **Clear KPI**: Need ~250-1,000 Supporters before launching cloud tier
- **Transparency**: Explicitly state "Your $19 funds our security audit"
- **One Codebase**: All features in main app, unlocked with license key
- **Hacker-Resistant**: Accept bypassing, target supporters who want to pay
- **CLI version**: Wraps existing `js/parser.js` and `js/data-query.js` in Node.js
- **Friend compare**: Local JSON export/import, zero backend
- **Phase 2 Trigger**: Only after hitting Supporter KPI and security audit complete
- **Ongoing Costs**: $10/month covers API/embedding costs with margin
- **Lifetime Protection**: Separates access fee from compute costs
- **Two Points of Failure**: Users can switch between local and cloud modes
- **Never Deprecate Local**: Free tier remains functional forever

**Why it works:**
- **Zero Risk Entry**: Users try without payment barrier
- **Community Investment**: Supporters feel ownership in security development
- **Borrowed Trust**: External security firm reputation transfers to your product
- **Clear Value Prop**: "Convenience" (sync) vs "Control" (local) - user choice
- **Sustainable**: Revenue covers costs, not subsidizing free users
- **Viral Loop**: Free users become advocates, Supporters fund growth

---

## Quick Context

**What is this?**  
Music analytics app that tells users what their listening says about them — like Spotify Wrapped but deeper, year-round, and conversational.

**Core flow (Full):**  
`Landing → Upload .zip/.json → Personality Reveal → Chat → Share Card`

**Core flow (Lite/Quick Snapshot):**  
`Landing → Spotify OAuth → Quick Snapshot Reveal → Upsell to Full`

**Tech stack:**  
Mostly client-side: Static HTML/CSS/JS + IndexedDB + Web Workers + OpenRouter API + Spotify Web API

---

## Implementation Status

| Component | Status | File(s) |
|-----------|--------|---------|
| Landing page | ✅ Done | `index.html` |
| App shell | ✅ Done | `app.html` |
| Design system | ✅ Done | `css/styles.css` |
| Data parser | ✅ Done | `js/parser-worker.js` (Web Worker) |
| Pattern detection | ✅ Done | `js/patterns.js` (8 algorithms + lite mode) |
| Personality engine | ✅ Done | `js/personality.js` (5 types + lite types) |
| Chat integration | ✅ Done | `js/chat.js` (OpenRouter + ToolStrategy Pattern + sessions) |
| Data query system | ✅ Done | `js/data-query.js` (time/artist queries) |
| **Tool Strategies** | ✅ Done | `js/services/tool-strategies/` (Native, Prompt Injection, Intent Extraction) |
| **Function calling** | ✅ Done | `js/functions.js` (10 LLM-callable tools) |
| **Template Profiles** | ✅ Done | `js/template-profiles.js` (8 curated profiles) |
| **Profile Synthesizer** | ✅ Done | `js/profile-synthesizer.js` (AI synthesis) |
| **Payments** | ✅ Done | `js/payments.js` (Stubbed for Free MVP) |
| **RAG/Semantic** | ✅ Done | `js/rag.js` (embeddings + Qdrant) |
| Card generator | ✅ Done | `js/cards.js` (Canvas + Web Share API) |
| **Storage** | ✅ Done | `js/storage/` (IndexedDB + ConfigAPI + Migration + Profiles) |
| **LLM Providers** | ✅ Done | `js/providers/` (OpenRouter, LMStudio, Ollama) |
| **Controllers** | ✅ Done | `js/controllers/` (ChatUI, Sidebar, View, FileUpload, Spotify, Demo, Reset) |
| **Services** | ✅ Done | `js/services/` (MessageOperations, SessionManager, TabCoordinator) |
| **State Management** | ✅ Done | `js/state/app-state.js` (Centralized state) |
| **Spotify OAuth** | ✅ Done | `js/spotify.js` (PKCE flow) |
| **Settings UI** | ✅ Done | `js/settings.js` (modal config) |
| **Transparency UI** | ✅ Done | Detection explainer + data stats |
| **Fail-Closed Security** | ✅ Done | `js/security.js` (Safe Mode, banners) |
| **Centralized Keys** | ✅ Done | `js/storage/keys.js` (Single source of truth) |
| **Operation Lock Contract** | ✅ Done | `js/operation-lock.js` + `js/operation-lock-errors.js` + `js/operation-queue.js` |
| **Race Condition Fixes** | ✅ Done | `js/controllers/file-upload-controller.js` |
| WASM embeddings | ⏳ v1.1 | Not implemented |

---

## File Structure (Current - Modular Architecture)

```
├── index.html              # Landing page (+ Quick Snapshot button)
├── app.html                # Main app (+ Settings button)
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
│   ├── local-vector-store.js # Client-side vector search (+ async Web Worker support)
│   ├── embedding-worker.js # Web Worker for chunk creation
│   ├── token-counter.js    # Token usage tracking
│   ├── operation-lock.js   # Critical operation coordination (ENHANCED)
│   ├── operation-lock-errors.js # Standardized error classes (NEW)
│   ├── operation-queue.js  # Retry queue for non-critical ops (NEW)
│   │
│   ├── workers/            # Web Workers (Background Processing)
│   │   └── vector-search-worker.js # Cosine similarity offloading (60fps maintenance)
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
│   │   ├── sync-strategy.js # Sync strategy abstraction (DeviceBackup Phase 2 prep)
│   │   └── keys.js         # Centralized storage keys (NEW)
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
│       ├── file-upload-controller.js (FIXED - race condition removed)
│       ├── spotify-controller.js
│       ├── demo-controller.js
│       └── reset-controller.js
│
├── docs/
│   ├── 03-technical-architecture.md
│   ├── operation-lock-contract.md (NEW - Complete documentation)
│   └── ...
└── .gitignore              # Protects config.js
```

---

## Key Features

### 1. Two-Path Onboarding
| Path | Data Source | Analysis Depth |
|------|-------------|----------------|
| **Full** | .zip/.json upload | Complete eras, ghosted artists, all patterns |
| **Lite (Quick Snapshot)** | Spotify OAuth | Last 50 tracks, top artists/tracks, limited patterns |

### 2. AI Function Calling (22 Functions) - These can be turned off and on by the user to save tokens
The LLM can dynamically query user data using OpenAI-style function calling (`js/functions/`):

**Core Data Queries:**
- `get_top_artists(year, month?, quarter?, season?, limit?, sort_by?)` - Top artists for a period
- `get_top_tracks(year, month?, quarter?, season?, limit?, sort_by?)` - Top tracks for a period
- `get_artist_history(artist_name)` - Full history for an artist
- `get_listening_stats(year?, month?, quarter?, season?)` - Stats for a period
- `compare_periods(year1, year2)` - Compare two years
- `search_tracks(track_name)` - Search for a track

**Stats.fm-Style Analytics:**
- `get_bottom_tracks(year, limit?, min_plays?)` - Least played tracks
- `get_bottom_artists(year, limit?, min_plays?)` - Least played artists
- `get_listening_clock(year?, month?, group_by?)` - 24-hour listening breakdown
- `get_listening_streaks(year?, min_streak_days?)` - Consecutive listening days
- `get_time_by_artist(year, limit?)` - Artists by total MINUTES (not plays)
- `get_platform_stats(year?)` - iOS/Android breakdown

**Spotify Wrapped-Style Analytics:**
- `get_discovery_stats(year, breakdown?)` - New artists discovered
- `get_skip_patterns(year?, type?, limit?)` - Skip rate analysis
- `get_shuffle_habits(year?, breakdown?)` - Shuffle vs intentional listening
- `get_peak_listening_day(year?, metric?)` - Busiest day of week
- `get_completion_rate(year?, threshold?, breakdown?)` - Song completion rates
- `get_offline_listening(year?, limit?)` - Offline listening patterns

**Template Profile Functions:**
- `get_templates_by_genre(genre, limit?)` - Find templates by genre
- `get_templates_with_pattern(pattern_type)` - Find templates with specific patterns
- `get_templates_by_personality(personality_type)` - Find templates by personality
- `synthesize_profile(description)` - AI-generate custom profile

The LLM decides when to call these functions based on user questions, enabling precise answers like "Show me my least played tracks from Q1 2022."

### 3. Demo Mode (Isolated Sample Experience)
- Precomputed "The Emo Teen" profile with full streams/patterns/personality
- Data isolation in `AppState.demo` so sample data never pollutes real uploads
- Demo badge + exit controls to keep users oriented
- Demo-specific chat suggestions seeded for the sample persona
- Uses shared view/controller plumbing to test UX without waiting on uploads

### 4. In-App Settings
Modal UI for configuring without editing config.js:
- OpenRouter API key, model, max tokens, temperature
- Spotify Client ID
- Settings persist in localStorage, override config.js values

### 5. Transparency Features
- **Detection explainer**: Collapsible breakdown of personality scoring
- **Data stats**: "Analyzed X streams from Y to Z"
- **Incremental caching**: Partial saves during parsing (crash-safe)

### 6. Template Profile System
Curated listening profiles for comparison and inspiration, managed by `js/template-profiles.js` and synthesized by `js/profile-synthesizer.js`.

**Template Profiles Store:**
- 8 curated placeholder templates (The Emo Teen, The Commuter, etc.)
- Search by genre, pattern, or personality type
- Keyword matching for template selection
- AI-driven synthesis from templates

**Profile Synthesizer:**
- AI-driven profile generation from selected templates (function calling ready)
- Keyword-based template matching with progress callbacks for UX
- Generates synthetic streams, patterns, and personality classification for the new profile
- Saves and retrieves synthesized profiles via `storage.js` + ProfileStorage for reuse

**Template Functions (LLM-callable):**
- `get_templates_by_genre(genre)` - Filter templates by musical genre
- `get_templates_with_pattern(pattern)` - Find templates with specific patterns
- `get_templates_by_personality(type)` - Match templates by personality type
- `synthesize_profile(template_id, user_context)` - AI synthesis from template

**Status:** Core infrastructure complete. Template data TBD from consenting friends/family.

### 7. Semantic Search (Free)
Integrated via `js/rag.js`. Users provide own Qdrant Cloud credentials.
- In-memory vector generation (Transformer.js) or Cohere API.
- Semantic search over listening history.
- Context injection into LLM prompts.

### 8. Data-Driven Prompt Engineering
The AI persona is grounded in "Key Data Profiles" (`js/prompts.js`):
- **Data Insights**: System prompt gets precise Wrapped-style metrics (Total Minutes, Top Artist, Percentile, Peak Day).
- **Personality as Lens**: The "Personality Type" is used as a lens to interpret data, not just a label.
- **Evidence Injection**: Detected patterns are passed as evidence to the LLM.

### 9. Chat Session Storage
Persistent chat conversations with ChatGPT-style sidebar:
- **IndexedDB storage**: Sessions persist across browser restarts
- **Collapsible sidebar**: Shows all past chats with title, date, message count
- **Session management**: Create, switch, rename, delete conversations
- **Auto-save**: Debounced 2-second save after each message
- **Auto-titling**: First user message becomes session title

### 10. Security Features
Client-side security module (`security.js`) providing defense-in-depth:

| Feature | Purpose |
|---------|----------|
| **AES-GCM Encryption** | RAG credentials encrypted with session-derived keys |
| **XSS Token Binding** | Spotify tokens bound to device fingerprint |
| **Secure Context Check** | Blocks operation in iframes, data: protocols |
| **Session Versioning** | Keys invalidated on auth failures |
| **Background Token Refresh** | Proactive refresh during long operations |
| **Visibility Staleness Check** | Token refresh triggered when tab becomes visible (NEW) |
| **Adaptive Lockouts** | Travel-aware threshold adjustment |
| **Rate Limiting** | Prevents credential stuffing attacks |
| **Geographic Detection** | Detects proxy/VPN-based attacks |
| **Namespace Isolation** | Per-user RAG collection separation |
| **Unified Error Context** | Structured errors with recovery paths |
| **Prototype Pollution Prevention** | Object.freeze on critical prototypes + sanitizeObject() |
| **Dependency Hardening** | checkDependencies() validates all critical modules at startup |
| **Vector Search Worker** | Offloads cosine similarity to background thread for 60fps maintenance |

> **Note:** This is client-side security, not equivalent to server-side. See `SECURITY.md` for full threat model.

### 11. Operation Lock Contract & Race Condition Fixes (NEW)
**Problem:** Documentation mentioned operation locks but didn't detail failure propagation. Race conditions existed in `isLocked()` + `acquire()` patterns.

**Solution Implemented:**
- **Standardized Error Classes**: `LockAcquisitionError`, `LockTimeoutError`, `LockReleaseError`, `LockForceReleaseError`
- **Enhanced OperationLock**: `acquireWithTimeout()`, `getLockStatus()`, `getLockDetails()`
- **Operation Queue**: Priority-based retry system for non-critical operations
- **Race Condition Fixes**: Removed `isLocked()` checks before `acquire()` in FileUploadController
- **Complete Documentation**: `docs/operation-lock-contract.md` with hierarchy and recovery patterns

**Files Created:**
- `js/operation-lock-errors.js` - Error classes
- `js/operation-queue.js` - Queue system
- `docs/operation-lock-contract.md` - Complete documentation

**Files Modified:**
- `js/operation-lock.js` - Enhanced with diagnostics and timeout
- `js/controllers/file-upload-controller.js` - Race condition fixed

### 12. Native Sharing (Web Share API)
**Goal:** Reduce friction from "Generate → Download → Find File → Send" (4 steps) to "Share → Send" (2 steps).

**Implementation:**
- Uses modern `navigator.share()` API
- Generates rich share payload:
  - **Title:** "My Music Personality"
  - **Text:** Personalized hook ("I'm an Emotional Archaeologist...")
  - **URL:** Referral link (`?ref=share`)
  - **File:** Direct image share (no saving required)
- **Fallbacks:**
  - Text-only share if files unsupported
  - Download if API unavailable (Desktop)
  - Smart article detection ("a/an") for personality names

### 13. Function Calling Fallback System (NEW)
**Problem:** LLM provider lock-in risk where function calling support varies across providers and models. When native function calling isn't supported, users get generic chat instead of data-grounded insights.

**Solution: 4-Level Fallback Network**
```
Level 1: Native Function Calling (OpenAI-style tool_calls)
    ↓ (Failed/Unsupported)
Level 2: Prompt Injection (function definitions as text, parse <function_call> tags)
    ↓ (Failed/Parse error)
Level 3: Regex Parsing (extract structured data from natural language)
    ↓ (Failed/No match)
Level 4: Direct Query/Intent Extraction (extract intent from user message, run function directly)
```

**Implementation Architecture:**
- `js/services/function-calling-fallback.js` - Fallback detection and utility functions
- `js/services/tool-strategies/` - **Strategy Pattern implementation** (refactored from monolithic handleToolCallsWithFallback)
  - `base-strategy.js` - Base class with shared functionality
  - `native-strategy.js` - Level 1: Native OpenAI-style tool_calls
  - `prompt-injection-strategy.js` - Levels 2/3: `<function_call>` tag parsing + regex fallback
  - `intent-extraction-strategy.js` - Level 4: User intent extraction
  - `index.js` - Strategy exports

**Key Functions:**
- `detectCapabilityLevel(provider, model)` - Determines which level to use
- `buildLevel2Request(messages, tools)` - Injects function definitions into prompt
- `parseFunctionCallsFromText(content)` - Parses `<function_call>` tags from text (Level 2/3)
- `extractQueryIntent(message)` - Level 4 intent extraction with pattern matching

**Integration in chat.js:**
- `handleToolCallsWithFallback()` - Wraps `handleToolCalls()` with fallback support
- Capability detection before API call
- Automatic fallback progression through levels

**Supported Model Detection:**
- OpenRouter: Extensive list of tool-capable models (GPT-4, Claude 3, Gemini, Mistral, etc.)
- Ollama: 20+ model families (llama3.2/3.3, mistral, qwen2.5, deepseek, hermes3, etc.)
- LM Studio: Base model patterns (llama-3, mistral, qwen2.5, etc.)

**Files:**
- `js/services/function-calling-fallback.js` - Fallback detection service
- `js/services/tool-strategies/` - Strategy pattern implementations (4 strategies)
- `js/chat.js` - Integrated fallback handling
- `js/main.js` - ES module imports

### 14. ToolStrategy Pattern (NEW)
**Problem:** The original `handleToolCallsWithFallback()` function was a 200+ line monolithic block with nested conditionals for each capability level. This violated single-responsibility principle, made testing difficult, and adding new strategies required modifying a fragile core function.

**Solution: Strategy Pattern**
Refactored to use the Gang of Four Strategy pattern, where each capability level is encapsulated in its own class.

**Benefits:**
- **Extensibility**: Add new strategies without touching existing code
- **Testability**: Each strategy can be unit tested in isolation
- **Fallback**: Strategies fail gracefully and defer to lower levels
- **Maintainability**: Clear separation of concerns per capability level

**Implementation:**
```
js/services/tool-strategies/
├── base-strategy.js          # BaseToolStrategy - shared functionality
├── native-strategy.js        # NativeToolStrategy (Level 1)
├── prompt-injection-strategy.js  # PromptInjectionStrategy (Level 2/3)
├── intent-extraction-strategy.js # IntentExtractionStrategy (Level 4)
└── index.js                  # Exports all strategies
```

**Key Classes & Methods:**
| Symbol | Location | Purpose |
|--------|----------|--------|
| `BaseToolStrategy` | `base-strategy.js` | Base class with `executeWithTimeout()`, `checkCircuitBreaker()`, `addToHistory()` |
| `NativeToolStrategy` | `native-strategy.js` | Handles OpenAI-style `tool_calls` responses |
| `PromptInjectionStrategy` | `prompt-injection-strategy.js` | Parses `<function_call>` tags from text |
| `IntentExtractionStrategy` | `intent-extraction-strategy.js` | Extracts intent from user message |

**Strategy Selection Flow:**
1. `chat.js` calls capability detection
2. Based on capability level, appropriate strategy's `canHandle()` is checked
3. First matching strategy's `execute()` is invoked
4. If strategy fails, fallback to next lower level

**Verification Checklist:**
- [ ] All strategies extend `BaseToolStrategy`
- [ ] Each strategy implements `canHandle()` and `execute()`
- [ ] Strategies are imported in `js/main.js`
- [ ] Circuit breaker integration works per-strategy

### 15. Aggressive ES Module Migration (NEW)
**Goal:** Migrate from legacy `window.ModuleName` globals and `onclick` handlers to proper ES modules with explicit imports/exports. This enables better tree-shaking, static analysis, and eliminates global namespace pollution.

**Migration Status:**
| Module | Status | Notes |
|--------|--------|-------|
| `js/main.js` | ✅ ES Module | Entry point (`type="module"`) |
| `js/app.js` | ✅ ES Module | Exports `init()` |
| `js/security.js` | ✅ ES Module | Named exports |
| `js/services/tool-strategies/*` | ✅ ES Module | All strategy classes |
| `js/services/function-calling-fallback.js` | ✅ ES Module | Named exports |
| `js/controllers/*` | ⚠️ Hybrid | Still expose `window.` for some compatibility |
| `js/storage/*` | ⚠️ Hybrid | Core modules converted, facades remain |

**Breaking Changes:**
- Default exports → Named exports (e.g., `export { init }` not `export default init`)
- `require()` → `import` (Node.js/bundler compatibility)
- `window.ModuleName` access → Imported modules
- `onclick="fn()"` → `data-action` + event delegation in `app.js`

**Migration Strategy:**
1. **Script Tags**: Replace `<script src="...">` with `<script type="module" src="js/main.js">`
2. **Entry Point**: `main.js` imports all modules, calls `App.init()`
3. **Event Delegation**: Replace inline `onclick` with `data-action` attributes
4. **Dependency Injection**: Controllers receive dependencies via `init({ dep1, dep2 })`
5. **Window Fallbacks**: For backward compatibility, some modules still expose on `window`

**Developer Steps to Update Imports:**
1. Change: `const Module = window.Module;`
   To: `import { Module } from './module.js';`
2. Ensure `package.json` has `"type": "module"` if using Node.js tooling
3. Update test files to use dynamic `import()` or configure test runner for ESM

**Verification Checklist:**
- [ ] `app.html` has single `<script type="module" src="js/main.js">`
- [ ] No inline `onclick` handlers (use `data-action`)
- [ ] All imports resolve without errors in browser console
- [ ] E2E tests pass with ES module configuration
- [ ] `CRITICAL_DEPENDENCIES` check passes at startup

---

## Personality Types

| Type | Signal | Point Allocation |
|------|--------|------------------|
| Emotional Archaeologist | Distinct eras + ghosted artists | Eras: +3, Ghosted: +2 |
| Mood Engineer | Time patterns + mood searching | Time: +3, Mood: +2 |
| Discovery Junkie | Low plays-per-artist + explosions | Ratio: +3, Discovery: +2 |
| Comfort Curator | High plays-per-artist | Ratio: +3 |
| Social Chameleon | Weekday ≠ weekend | Social: +2 |

---

## Architecture: Modular Refactoring (HNW Compliant)

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

### 3. Controller Pattern
UI logic extracted from `app.js` into focused controllers:
- **ChatUIController** (`js/controllers/chat-ui-controller.js`): Message rendering, streaming, markdown
- **SidebarController** (`js/controllers/sidebar-controller.js`): Session list management
- **ViewController** (`js/controllers/view-controller.js`): Transitions and state
- **FileUploadController** (`js/controllers/file-upload-controller.js`): File processing (FIXED - race condition removed)
- **SpotifyController** (`js/controllers/spotify-controller.js`): Spotify OAuth flow
- **DemoController** (`js/controllers/demo-controller.js`): Demo mode
- **ResetController** (`js/controllers/reset-controller.js`): Reset operations

### 4. Service Pattern (NEW)
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
- Event listener setup (Event Delegation)
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

**BYOI (Bring Your Own Intelligence):**
- Users choose the intelligence layer: local (Ollama/LM Studio) or cloud (OpenRouter)
- Keys are only needed for cloud calls; local models run keyless and offline
- Users can point semantic search at their own Qdrant cluster or stay fully local
- **Positioning shift:** "You own the intelligence and the data; we provide the orchestration."

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

### Available Functions (js/functions.js)

| Function | Description | Parameters |
|----------|-------------|------------|
| `get_top_artists` | Top N artists for a period | year, month?, limit? |
| `get_top_tracks` | Top N tracks for a period | year, month?, limit? |
| `get_artist_history` | Full history for an artist | artist_name |
| `get_listening_stats` | Stats for a period | year?, month? |
| `compare_periods` | Compare two years | year1, year2 |
| `search_tracks` | Search for a track | track_name |
| `get_templates_by_genre` | Filter templates by genre | genre |
| `get_templates_with_pattern` | Find templates with patterns | pattern |
| `get_templates_by_personality` | Match templates by personality | type |
| `synthesize_profile` | AI synthesis from template | template_id, user_context |

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

## Chat: OpenRouter Integration

```javascript
// js/chat.js (via ProviderInterface)

async function sendMessage(message) {
  // Configured provider (OpenRouter, LMStudio, or Ollama)
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

---

## Cost Analysis

### Phase 1: Sovereign Community (Zero Cost to User)

| Resource | Cost | Notes |
|----------|------|-------|
| Vercel hosting | $0 | Static files only |
| OpenRouter free models | $0 | BYOI (your models/keys) |
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
| **Secure Context Enforcement** | `security.js`, `token-binding.js` | Blocks operation in iframes, data: protocols; validates HTTPS/localhost/file:// |
| **Session Versioning** | `security.js` | Keys invalidated on auth failures |
| **Background Token Refresh** | `spotify.js` | Proactive refresh during long operations |
| **Adaptive Lockout Thresholds** | `security.js` | Travel-aware threshold adjustment |
| **Geographic Anomaly Detection** | `security.js` | Detects proxy/VPN-based attacks |
| **Rate Limiting** | `security.js` | Prevents credential stuffing |
| **Namespace Isolation** | `rag.js` | Per-user RAG collections |
| **Unified Error Context** | `security.js` | Structured errors with recovery paths |
| **Privacy Controls** | `storage.js` | Session-only mode, data cleanup |
| **Origin Validation** | `token-binding.js` | Comprehensive protocol/hostname checking for HTTPS, localhost, file://, app://, capacitor:// |
| **Prototype Pollution Prevention** | `security/index.js` | Object.freeze on critical prototypes + sanitizeObject() for JSON parsing |
| **Dependency Hardening** | `app.js` | checkDependencies() validates all critical modules at startup |
| **Vector Search Worker** | `workers/vector-search-worker.js` | Offloads cosine similarity to background thread for 60fps maintenance |
| **Operation Lock Contract** | `operation-lock.js` + `operation-lock-errors.js` + `operation-queue.js` | Standardized failure propagation, race condition fixes, retry logic |

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

## Instructions for Future Agents

1. **Read this file first**
2. **Follow UX Philosophy** — No filters, no dashboards
3. **Respect silence** — Insight engine can return None
4. **Use Web Worker** — Never block main thread for parsing
5. **Single source of truth** — Scoring logic lives in `personality.js`, not duplicated
6. **Config hierarchy**: config.js (defaults) → localStorage (user overrides)
7. **Security first**: Use `Security.storeEncryptedCredentials()` for sensitive data
8. **Update session log** at end of session
9. **Respect modular architecture** — Use delegation pattern, don't create God objects
10. **HNW patterns**: Follow Hierarchy, Network, Wave principles in all new code
11. **Operation Lock Contract**: Always use try-catch with acquire(), never isLocked() + acquire()
12. **Error Handling**: Use standardized LockAcquisitionError for better diagnostics

---

## Session Log

### Session 19 — 2026-01-15 (Operation Lock Contract & Race Condition Fixes)

**What was done:**

1. **Operation Lock Contract Documentation**: Created comprehensive `docs/operation-lock-contract.md` detailing failure propagation hierarchy across all application layers.

2. **Standardized Error Classes**: Created `js/operation-lock-errors.js` with:
   - `LockAcquisitionError` - Lock blocked by operations
   - `LockTimeoutError` - Acquisition timeout
   - `LockReleaseError` - Release failures
   - `LockForceReleaseError` - Emergency releases

3. **Enhanced OperationLock Module**: Updated `js/operation-lock.js` with:
   - `acquireWithTimeout()` - Timeout mechanism (default 30s)
   - `getLockStatus()` - Diagnostic API for lock state
   - `getLockDetails()` - Detailed lock information
   - `withLockAndTimeout()` - Wrapper with timeout support
   - Uses new error classes for better error handling

4. **Operation Queue System**: Created `js/operation-queue.js` for non-critical operations:
   - Priority-based queuing (LOW, NORMAL, HIGH, CRITICAL)
   - Automatic retry with configurable attempts
   - Event listeners for queue state changes
   - Cancellation support
   - Status tracking and diagnostics

5. **Race Condition Fixes**: Updated `js/controllers/file-upload-controller.js`:
   - **Removed** `isLocked()` + `acquire()` pattern (race condition)
   - **Fixed** with direct `acquire()` in try-catch
   - Added proper error handling with new error classes
   - Improved lock release error handling

6. **Complete Documentation**: All failure propagation patterns documented with examples

**Key Architectural Improvements:**

- **HNW Hierarchy**: Clear failure propagation from OperationLock → Controller → Service → UI → Recovery
- **HNW Network**: Standardized error types enable consistent recovery across all modules
- **HNW Wave**: Timeout mechanism prevents indefinite blocking, queue system enables deferred execution

**New Files:**
- `js/operation-lock-errors.js` - Standardized error classes
- `js/operation-queue.js` - Retry queue for non-critical operations
- `docs/operation-lock-contract.md` - Complete failure propagation documentation

**Modified Files:**
- `js/operation-lock.js` - Enhanced with diagnostics and timeout
- `js/controllers/file-upload-controller.js` - Race condition fixed
- `AGENT_CONTEXT.md` - Updated with new architecture state

**Impact:**
- **Eliminates race conditions** in all lock acquisition patterns
- **Standardizes error handling** across the entire hierarchy
- **Adds diagnostic capabilities** for debugging lock issues
- **Enables retry logic** for non-critical operations
- **Documents complete failure propagation** for future developers

---

### Session 18 — 2026-01-14 (Fail-Closed Security & Centralized Keys)

**What was done:**

1. **Fail-Closed Architecture**: Implemented Safe Mode to prevent unencrypted data storage when security modules fail to load. Added `_isFallback` detection and orange warning banner.

2. **Prototype Pollution Protection Timing**: Moved protection to `window.onload` to ensure all third-party scripts and polyfills are loaded before freezing prototypes.

3. **Centralized Storage Keys**: Created `js/storage/keys.js` as single source of truth for all localStorage/IndexedDB keys, eliminating magic strings.

**Key Features:**
- **Security**: Defense-in-depth against loading failures
- **Reliability**: Prevents crashes from prototype freeze timing
- **Maintainability**: Unified storage constants

---

### Session 17 — 2026-01-14 (Security Hardening & Performance Optimization)

**What was done:**

1. **Vector Search Worker** (`js/workers/vector-search-worker.js`)
   - Created Web Worker with Command Pattern for non-blocking cosine similarity
   - Added `searchAsync()` method to LocalVectorStore
   - Updated `rag.js` to use async search for 60fps maintenance
   - Fallback to sync search for small vector sets (<500) or worker unavailability

2. **Dependency Hardening** (`js/app.js`)
   - Added `checkDependencies()` function validating 17 critical modules
   - Checks both existence AND initialization state (e.g., `Spotify.isConfigured` is function)
   - Detailed diagnostic UI with module status list
   - "Copy Error Report" button for GitHub issue reporting
   - Network status display (online/offline + connection type)

3. **Origin Validation Enhancement** (`js/security/token-binding.js`)
   - Comprehensive `checkSecureContext()` supporting:
     - HTTPS: Always allowed
     - HTTP localhost/127.0.0.1: Allowed (development)
     - file://: Allowed with warning (offline use, crypto.subtle may fail)
     - app://capacitor://: Allowed (native wrappers)
     - Iframes: Cross-origin blocked
     - data://blob://: Blocked (XSS vectors)

4. **Prototype Pollution Prevention** (`js/security/index.js`)
   - `sanitizeObject()` for recursive key filtering (__proto__, constructor, prototype)
   - `safeJsonParse()` for untrusted JSON input
   - `enablePrototypePollutionProtection()` freezes Object/Array/Function prototypes
   - Called LAST in init() to avoid breaking legitimate library patches

5. **CSS Updates** (`css/styles.css`)
   - Added `.loading-error` state styling with diagnostic details accordion
   - Mobile responsive error UI

**Key Architectural Changes:**
- **HNW Hierarchy**: Early-fail pattern catches script loading failures
- **HNW Network**: Worker isolation separates math from storage operations
- **HNW Wave**: Async search maintains UI responsiveness at 60fps

**New Files:**
- `js/workers/vector-search-worker.js` - Cosine similarity Web Worker

**Modified Files:**
- `js/local-vector-store.js` - Added searchAsync() method
- `js/rag.js` - Updated to use async search
- `js/app.js` - Added checkDependencies() + prototype freeze call
- `js/security/token-binding.js` - Enhanced origin validation
- `js/security/index.js` - Added prototype pollution prevention
- `css/styles.css` - Loading error UI styles

---

*(Previous sessions continue as in original file...)*
