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
| **Cloud Sync** | **$50 Lifetime + $10/month** | Multi-device chat sync, encrypted cloud backup, **managed embeddings & AI setup**, security signatures & validation | Hybrid (Server-side DB + Client-side E2EE) | **"Secured by [External Firm]"** |
| **Cloud Sync** | **$15/month** | Same as above, no lifetime payment | Hybrid (Server-side DB + Client-side E2EE) | **"Secured by [External Firm]"** |

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
| **Function calling** | ✅ Done | `js/functions.js` (6 LLM-callable tools) |
| **Payments** | ✅ Done | `js/payments.js` (Stubbed for Free MVP) |
| **RAG/Semantic** | ✅ Done | `js/rag.js` (embeddings + Qdrant) |
| Card generator | ✅ Done | `js/cards.js` (Canvas) |
| **Storage** | ✅ Done | `js/storage/` (IndexedDB + ConfigAPI + Migration) |
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
│   ├── parser.js           # Legacy parser (not used)
│   ├── patterns.js         # 8 pattern algorithms + detectLitePatterns()
│   ├── personality.js      # 5 types + lite types + score breakdown
│   ├── chat.js             # Chat logic (Delegates to Providers)
│   ├── data-query.js       # Query streams by time/artist/track
│   ├── functions.js        # LLM function schemas + executors
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
│   │   └── migration.js    # localStorage migration
│   │
│   ├── security/           # Security Submodules
│   │   ├── encryption.js   # AES-GCM
│   │   ├── token-binding.js
│   │   ├── anomaly.js
│   │   └── index.js        # Module entry point
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

### 5. Semantic Search (Free)
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
