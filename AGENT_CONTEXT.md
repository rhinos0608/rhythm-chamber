# AI Agent Reference — Rhythm Chamber

> **Status:** Free MVP + Quick Snapshot + Settings UI + AI Function Calling + Semantic Search (Free) + Chat Sessions + HNW Fixes + Security Hardening v2 (XSS Token Protection)

---

## Monetization Strategy

**Philosophy:** The core experience is free and client-side (privacy-first). Users only pay for server-side persistence and synchronization.

| Tier | Cost | Features |
|------|------|----------|
| **MVP Core** | **Free** | Full analysis, RAG/Semantic Search (BYO Keys), Unlimited local use, 100% Client-side. |
| **Cloud Sync** | **$2/mo** or **$10 Lifetime** | *Proposed Future Feature.* Encrypted cloud backup of chat sessions and listening history, cross-device sync. |

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
| Storage | ✅ Done | `js/storage.js` (IndexedDB + incremental save + chat sessions) |
| API config | ✅ Done | `js/config.js` (gitignored) |
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
│   ├── app.js              # Main controller (OAuth handling, view transitions)
│   ├── parser-worker.js    # Web Worker (incremental parsing + UTC time extraction)
│   ├── parser.js           # Legacy parser (not used)
│   ├── patterns.js         # 8 pattern algorithms + detectLitePatterns()
│   ├── personality.js      # 5 types + lite types + score breakdown
│   ├── chat.js             # OpenRouter + function calling support
│   ├── data-query.js       # Query streams by time/artist/track
│   ├── functions.js        # LLM function schemas + executors
│   ├── cards.js            # Canvas card generator
│   ├── storage.js          # IndexedDB (streams, chunks, personality, chat sessions, privacy controls)
│   ├── settings.js         # In-app settings modal (API key, model, etc.)
│   ├── spotify.js          # Spotify OAuth PKCE + API calls + session invalidation
│   ├── security.js         # Client-side security (AES-GCM, rate limiting, anomaly detection)
│   ├── payments.js         # Stripe Checkout + premium status
│   ├── rag.js              # Embeddings + Qdrant vector search + encrypted credentials
│   ├── prompts.js          # System prompt templates
│   ├── config.js           # API keys (gitignored)
│   └── config.example.js   # Config template (+ Stripe)
├── docs/
│   ├── 01-06 product docs
│   └── API_SETUP.md        # OpenRouter setup guide
├── js/
│   ├── utils.js            # Timeout/retry utilities
│   └── (other files as above)
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

**What was done:**
1. Created `security.js` with AES-GCM encryption, session versioning, and anomaly detection
2. Upgraded `rag.js` to use encrypted credentials instead of XOR obfuscation
3. Added session invalidation to `spotify.js` on auth failures
4. Added UTC-based time extraction to `parser-worker.js` for DST resistance
5. Updated `patterns.js` to use UTC hours with minimum data thresholds
6. Added privacy controls to `storage.js` (session-only mode, data cleanup)
7. Created `SECURITY.md` documenting threat model and mitigations

**Security features:**
- `storeEncryptedCredentials()` / `getEncryptedCredentials()` for AES-GCM storage
- Session versioning with automatic invalidation on auth failures
- Geographic anomaly detection (connection fingerprint tracking)
- Rate limiting with reduced thresholds on anomaly detection
- Per-user namespace isolation for RAG collections

**HNW patterns addressed:**
- Hierarchy: Clear credential authority chain with Security module
- Network: Encrypted credential flow prevents DevTools leakage
- Wave: Session versioning invalidates stale credentials

---

### Session 10 — 2026-01-12 (Chat Session Storage)

**What was done:**
1. Added `CHAT_SESSIONS` IndexedDB store in `storage.js` with CRUD operations
2. Refactored `chat.js` with session management: create, load, switch, list, delete, rename
3. Added collapsible sidebar to `app.html` with session list UI
4. Added sidebar CSS to `styles.css` with animations and mobile responsiveness
5. Integrated sidebar controller in `app.js` with toggle, render, and interaction handlers
6. Debounced auto-save (2s) to prevent rapid IndexedDB writes
7. Auto-generate session titles from first user message
8. Legacy migration from sessionStorage to IndexedDB

**Key features:**
- ☰ Toggle button in header, ◀ collapse button in sidebar footer
- "+ New Chat" button, session list with title/date/message count
- Hover actions: rename (✏️), delete (🗑️)
- Sidebar hidden in non-chat views, remembers collapsed state

**HNW patterns applied:**
- Clear authority: storage.js → data, chat.js → sessions, app.js → UI
- Debounced saves prevent wave cascade
- Session validation on load with graceful fallback

---

### Sessions 1-9 — 2026-01-11/12 (Foundation)

**Summary of prior work:**
- Session 1: Documentation refinement (personality engine, lite version concept)
- Session 2: Core implementation (parser, patterns, personality, chat, cards)
- Session 3: Spotify Quick Snapshot, data queries for chat
- Session 4: Settings UI, transparency features, incremental caching
- Session 5: AI function calling (6 LLM-callable tools)
- Session 6: Semantic search with Qdrant vector storage
- Session 7: HNW diagnostic analysis, conversation persistence
- Session 8: Chat error handling, regenerate/edit/delete features
- Session 9: Reset race condition fix, timeout protection, token refresh

**Key fixes (HNW Analysis):**
- **Critical**: Reset race condition prevented, premium bypass clarified (free for MVP)
- **High**: Chat timeout cascade prevention, Spotify cliff-edge expiry handled
- **Medium**: RAG checkpoint staleness detection, cross-storage consistency checks


**Not done (deferred):**
- Long-term refactoring (extract controllers from app.js)
- Unify Lite/Full data paths
- Add circuit breakers for external APIs
- Parallelize RAG embedding generation

