# AI Agent Reference — Rhythm Chamber

> **Status:** Free MVP + Quick Snapshot + Settings UI + AI Function Calling + Semantic Search (Free) + Chat Sessions + HNW Fixes + Security Hardening v2 + **Modular Refactoring (Providers, Storage, Controllers)**

---

## Monetization Strategy

**Philosophy:** Community-first growth with zero monetization entry. Build a base of enthusiasts, then scale to premium managed services. Revenue from early supporters funds infrastructure and security.

### Phase 1: Sovereign Community (Zero Cost to User)

| Tier | Cost | Features | Infrastructure | Purpose |
|------|------|----------|----------------|----------|
| **Free** | **$0** | Full local analysis, BYOK chat, basic cards, personality reveal, 100% Client-side. | Client-side only | **Loss Leader**: Build community, validate product, zero server costs |
| **Supporter** | **$19 Lifetime** | CLI tool, premium themes (Dark/Cyberpunk/Minimal), "Verified" badge, friend compare JSON import | Client-side only | **Seed Capital**: Funds security audit & cloud infrastructure |
| **Patron** | **$7/month** | Dev Discord access, roadmap voting rights, early beta features, priority support | Client-side + Discord | **Community**: Recurring revenue for ongoing support |

### Phase 2: Managed Cloud & AI (Trust-First Launch)

| Tier | Cost | Features | Infrastructure | Trust Signal |
|------|------|----------|----------------|--------------|
| **Cloud Backup** | **$50 Lifetime + $10/month** | Multi-device access, encrypted cloud backup, **managed embeddings & AI setup** | Hybrid (Server-side DB + Client-side E2EE) | **"Secured by [External Firm]"** |
| **Cloud Backup** | **$15/month** | Same as above, no lifetime payment | Hybrid (Server-side DB + Client-side E2EE) | **"Secured by [External Firm]"** |

> **Note on "Cloud Backup"**: This is intentionally NOT "Cloud Sync". It's manual backup/restore between devices — not real-time sync. No CRDTs, no conflict resolution, just "last-write-wins" encrypted blob storage. This keeps costs low (~$20-50/month for 1000 users) and complexity minimal.

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
| Chat integration | ✅ Done | `js/chat.js` (OpenRouter + function calling + sessions) |
| Data query system | ✅ Done | `js/data-query.js` (time/artist queries) |
| **Function calling** | ✅ Done | `js/functions.js` (10 LLM-callable tools) |
| **Template Profiles** | ✅ Done | `js/template-profiles.js` (8 curated profiles) |
| **Profile Synthesizer** | ✅ Done | `js/profile-synthesizer.js` (AI synthesis) |
| **Payments** | ✅ Done | `js/payments.js` (Stubbed for Free MVP) |
| **RAG/Semantic** | ✅ Done | `js/rag.js` (embeddings + Qdrant) |
| Card generator | ✅ Done | `js/cards.js` (Canvas) |
| **Storage** | ✅ Done | `js/storage/` (IndexedDB + ConfigAPI + Migration + Profiles) |
| **LLM Providers** | ✅ Done | `js/providers/` (OpenRouter, LMStudio, Ollama) |
| **Controllers** | 🔄 In Progress | `js/controllers/` (ChatUI, Sidebar, View) |
| **Spotify OAuth** | ✅ Done | `js/spotify.js` (PKCE flow) |
| **Settings UI** | ✅ Done | `js/settings.js` (modal config) |
| **Transparency UI** | ✅ Done | Detection explainer + data stats |
| WASM embeddings | ⏳ v1.1 | Not implemented |

---

## File Structure

```
rhythm-chamber/
├── index.html              # Landing page (+ Quick Snapshot button)
├── app.html                # Main app (+ Settings button)
├── SECURITY.md             # Security model documentation
├── css/styles.css          # Design system (~1300 lines)
├── js/
│   ├── app.js              # Main controller (Delegates to sub-controllers)
│   ├── parser-worker.js    # Web Worker (incremental parsing + UTC time extraction)
│   ├── parser.js           # Parser facade (delegates to worker)
│   ├── patterns.js         # 8 pattern algorithms + detectLitePatterns()
│   ├── personality.js      # 5 types + lite types + score breakdown
│   ├── chat.js             # Chat logic (Delegates to Providers)
│   ├── data-query.js       # Query streams by time/artist/track
│   ├── functions.js        # LLM function schemas + executors (10 functions)
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
│   └── controllers/        # UI Controllers
│       ├── chat-ui-controller.js
│       ├── sidebar-controller.js
│       └── view-controller.js
│
├── docs/
│   ├── 03-technical-architecture.md
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

### 2. AI Function Calling
The LLM can dynamically query user data using OpenAI-style function calling (`js/functions.js`):
- `get_top_artists(year, month?, limit?)` - Top artists for a period
- `get_top_tracks(year, month?, limit?)` - Top tracks for a period
- `get_artist_history(artist_name)` - Full history for an artist
- `get_listening_stats(year?, month?)` - Stats for a period
- `compare_periods(year1, year2)` - Compare two years
- `search_tracks(track_name)` - Search for a track

The LLM decides when to call these functions based on user questions, enabling precise answers like "Show me my top 10 artists from 2020."

### 3. In-App Settings
Modal UI for configuring without editing config.js:
- OpenRouter API key, model, max tokens, temperature
- Spotify Client ID
- Settings persist in localStorage, override config.js values

### 4. Transparency Features
- **Detection explainer**: Collapsible breakdown of personality scoring
- **Data stats**: "Analyzed X streams from Y to Z"
- **Incremental caching**: Partial saves during parsing (crash-safe)

### 5. Template Profile System
Curated listening profiles for comparison and inspiration, managed by `js/template-profiles.js` and synthesized by `js/profile-synthesizer.js`.

**Template Profiles Store:**
- 8 curated placeholder templates (The Emo Teen, The Commuter, etc.)
- Search by genre, pattern, or personality type
- Keyword matching for template selection
- AI-driven synthesis from templates

**Profile Synthesizer:**
- AI-driven profile generation from selected templates
- Keyword-based template matching
- Integration with function calling for dynamic selection
- Profile storage and management via `storage.js`

**Template Functions (LLM-callable):**
- `get_templates_by_genre(genre)` - Filter templates by musical genre
- `get_templates_with_pattern(pattern)` - Find templates with specific patterns
- `get_templates_by_personality(type)` - Match templates by personality type
- `synthesize_profile(template_id, user_context)` - AI synthesis from template

**Status:** Core infrastructure complete. Template data TBD from consenting friends/family.

### 6. Semantic Search (Free)
Integrated via `js/rag.js`. Users provide own Qdrant Cloud credentials.
- In-memory vector generation (Transformer.js) or Cohere API.
- Semantic search over listening history.
- Context injection into LLM prompts.

### 6. Data-Driven Prompt Engineering
The AI persona is grounded in "Key Data Profiles" (`js/prompts.js`):
- **Data Insights**: System prompt gets precise Wrapped-style metrics (Total Minutes, Top Artist, Percentile, Peak Day).
- **Personality as Lens**: The "Personality Type" is used as a lens to interpret data, not just a label.
- **Evidence Injection**: Detected patterns are passed as evidence to the LLM.

### 7. Chat Session Storage
Persistent chat conversations with ChatGPT-style sidebar:
- **IndexedDB storage**: Sessions persist across browser restarts
- **Collapsible sidebar**: Shows all past chats with title, date, message count
- **Session management**: Create, switch, rename, delete conversations
- **Auto-save**: Debounced 2-second save after each message
- **Auto-titling**: First user message becomes session title

### 7. Security Features
Client-side security module (`security.js`) providing defense-in-depth:

| Feature | Purpose |
|---------|----------|
| **AES-GCM Encryption** | RAG credentials encrypted with session-derived keys |
| **XSS Token Binding** | Spotify tokens bound to device fingerprint (NEW) |
| **Secure Context Check** | Blocks operation in iframes, data: protocols (NEW) |
| **Session Versioning** | Keys invalidated on auth failures |
| **Background Token Refresh** | Proactive refresh during long operations (NEW) |
| **Adaptive Lockouts** | Travel-aware threshold adjustment (NEW) |
| **Rate Limiting** | Prevents credential stuffing attacks |
| **Geographic Detection** | Detects proxy/VPN-based attacks |
| **Namespace Isolation** | Per-user RAG collection separation |
| **Unified Error Context** | Structured errors with recovery paths (NEW) |

> **Note:** This is client-side security, not equivalent to server-side. See `SECURITY.md` for full threat model.

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

## Running Locally

```bash
# 1. Set up API keys
cp js/config.example.js js/config.js
# Edit js/config.js with your OpenRouter key and Spotify Client ID

# 2. Start server
npx http-server -p 8080 -c-1

# 3. Open http://localhost:8080
```

**Or use in-app Settings (⚙️ button) to configure without editing files.**

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

---

## Session Log

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
8. Updated `SECURITY.md` with new attack scenarios and mitigations

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
[...previous logs retained...]
