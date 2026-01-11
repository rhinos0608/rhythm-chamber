# AI Agent Reference — Rhythm Chamber

> **Last updated:** 2026-01-12 09:27 AEDT  
> **Status:** MVP + Quick Snapshot + Settings UI + AI Function Calling + Semantic Search Premium

---

## Quick Context

**What is this?**  
Music analytics app that tells users what their listening says about them — like Spotify Wrapped but deeper, year-round, and conversational.

**Core flow (Full):**  
`Landing → Upload .zip/.json → Personality Reveal → Chat → Share Card`

**Core flow (Lite/Quick Snapshot):**  
`Landing → Spotify OAuth → Quick Snapshot Reveal → Upsell to Full`

**Tech stack:**  
100% client-side: Static HTML/CSS/JS + IndexedDB + Web Workers + OpenRouter API + Spotify Web API

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
| Chat integration | ✅ Done | `js/chat.js` (OpenRouter + function calling) |
| Data query system | ✅ Done | `js/data-query.js` (time/artist queries) |
| **Function calling** | ✅ Done | `js/functions.js` (6 LLM-callable tools) |
| **Payments** | ✅ Done | `js/payments.js` (Stripe Checkout) |
| **RAG/Semantic** | ✅ Done | `js/rag.js` (embeddings + Qdrant) |
| Card generator | ✅ Done | `js/cards.js` (Canvas) |
| Storage | ✅ Done | `js/storage.js` (IndexedDB + incremental save) |
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
├── css/styles.css          # Design system (~1300 lines)
├── js/
│   ├── app.js              # Main controller (OAuth handling, view transitions)
│   ├── parser-worker.js    # Web Worker (incremental parsing + partial saves)
│   ├── parser.js           # Legacy parser (not used)
│   ├── patterns.js         # 8 pattern algorithms + detectLitePatterns()
│   ├── personality.js      # 5 types + lite types + score breakdown
│   ├── chat.js             # OpenRouter + function calling support
│   ├── data-query.js       # Query streams by time/artist/track
│   ├── functions.js        # LLM function schemas + executors
│   ├── cards.js            # Canvas card generator
│   ├── storage.js          # IndexedDB (appendStreams, clearStreams)
│   ├── settings.js         # In-app settings modal (API key, model, etc.)
│   ├── spotify.js          # Spotify OAuth PKCE + API calls
│   ├── payments.js         # Stripe Checkout + premium status
│   ├── rag.js              # Embeddings + Qdrant vector search
│   ├── prompts.js          # System prompt templates
│   ├── config.js           # API keys (gitignored)
│   └── config.example.js   # Config template (+ Stripe)
├── docs/
│   ├── 01-06 product docs
│   └── API_SETUP.md        # OpenRouter setup guide
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

### 5. Semantic Search (Premium)
Premium feature with user-managed infrastructure:
- **Stripe payments**: $5 lifetime or $2/month via Checkout
- **Embeddings**: `qwen/qwen3-embedding-8b` via OpenRouter
- **Vector storage**: User's own Qdrant Cloud cluster (1GB free)
- **RAG integration**: Semantic context injected into chat automatically

Settings UI shows:
- Non-premium: Upgrade button → pricing modal
- Premium: Qdrant URL/Key inputs + Generate Embeddings button

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
7. **Update session log** at end of session

---

## Session Log

### Session 6 — 2026-01-12 (Semantic Search Premium)

**What was done:**
1. Created `js/payments.js` with Stripe Checkout integration ($5 lifetime / $2 monthly)
2. Created `js/rag.js` with embeddings + Qdrant vector storage
3. Updated `js/settings.js` with conditional premium section
4. Updated `js/chat.js` to inject semantic context from RAG
5. Added premium CSS: badges, pricing cards, progress bar
6. Updated `config.example.js` with Stripe placeholders

**Key decisions:**
- User-managed Qdrant clusters (no server-side infrastructure)
- Premium status stored in localStorage (client-only verification)
- Embeddings use `qwen/qwen3-embedding-8b` (4096 dimensions)
- Chunking creates monthly summaries + artist profiles for search

---

### Session 5 — 2026-01-12 (AI Function Calling)

**What was done:**
1. Created `js/functions.js` with 6 OpenAI-style function schemas
2. Updated `js/chat.js` to support tool calling in OpenRouter API
3. Updated `js/prompts.js` to instruct LLM to use available functions
4. Added `functions.js` script to `app.html`

**Key decisions:**
- LLM now calls functions directly (e.g., `get_top_artists(year=2020)`) instead of regex parsing
- Functions execute against `DataQuery` module and return structured JSON
- Follow-up API call sends function results back to LLM for final response
- Fallback to regex-based context injection when API unavailable

---

### Session 4 — 2026-01-12 (Settings & Transparency)

**What was done:**
1. Fixed settings.js to properly read from config.js as source of truth
2. Added detection explainer showing personality score breakdown
3. Added data stats (stream count, date range) to reveal
4. Implemented incremental IndexedDB caching during parsing
5. Fixed markdown rendering in chat messages
6. Increased default maxTokens from 500 → 1000
7. Fixed property reference bugs (moodSearching.count)

**Key decisions:**
- Centralized scoring breakdown in `personality.js` (no duplicated logic)
- config.js fields shown as readonly in settings modal
- Incremental saves via worker `partial` messages + `appendStreams()`

---

### Session 3 — 2026-01-11 (Spotify Quick Snapshot & Chat Data)

**What was done:**
1. Implemented Spotify OAuth PKCE flow (`spotify.js`)
2. Built lite pattern detection and personality types
3. Added Quick Snapshot button to landing page
4. Built lite reveal section with upsell messaging
5. Created data-query.js for chat to access stream data
6. Updated chat.js to inject query results into system prompt
7. Updated technical architecture docs

**Key decisions:**
- Client-side PKCE (no server needed for OAuth)
- Lite types simpler, with upsell for full analysis
- Chat can answer "What did I listen to in March?"

---

### Session 2 — 2026-01-11 (Implementation)

**What was done:**
1. Built complete static site: `index.html`, `app.html`, `css/styles.css`
2. Implemented data pipeline with Web Worker (non-blocking)
3. Built all 8 pattern detection algorithms
4. Created 5-type personality classifier with scoring and evidence
5. Added OpenRouter chat integration with config file
6. Created Canvas-based shareable card generator
7. Added direct JSON upload support (in addition to .zip)
8. Created `.gitignore` and `docs/API_SETUP.md`

**Tech decisions:**
- Web Worker for parsing (keeps UI responsive)
- External config.js for API keys (gitignored)
- Supports both .zip and .json uploads

---

### Session 1 — 2026-01-11 (Documentation)

**What was done:**
1. Refined product from stats → "Wrapped but deeper" personality engine
2. Added duration tracking (TikTok-style behavioral signals)
3. Added life event detection (ghosts, discovery explosions)
4. Created UX philosophy (micro-insights, zero-choice, silence)
5. Added Lite version concept (Spotify OAuth instant onboarding)
6. Added transparency features doc (show your work)
7. Consolidated from 12 docs → 6 docs with clear separation

**Key decisions:**
- Silence is a feature (returning None is valid)
- Duration is the moat
- Ask, don't tell
- Lite vs Full two-path onboarding
