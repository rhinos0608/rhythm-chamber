# AI Agent Reference — Rhythm Chamber

> **Last updated:** 2026-01-12 03:08 AEDT  
> **Status:** MVP + Quick Snapshot + Settings UI implemented

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
| Chat integration | ✅ Done | `js/chat.js` (OpenRouter + data queries) |
| Data query system | ✅ Done | `js/data-query.js` (time/artist queries) |
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
│   ├── chat.js             # OpenRouter + data query injection
│   ├── data-query.js       # Query streams by time/artist/track
│   ├── cards.js            # Canvas card generator
│   ├── storage.js          # IndexedDB (appendStreams, clearStreams)
│   ├── settings.js         # In-app settings modal (API key, model, etc.)
│   ├── spotify.js          # Spotify OAuth PKCE + API calls
│   ├── prompts.js          # System prompt templates
│   ├── config.js           # API keys (gitignored)
│   └── config.example.js   # Config template
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

### 2. Chat Data Queries
The chat can answer specific questions like "What did I listen to in March 2024?" using `data-query.js`:
- Time-based queries (month, year, specific dates)
- Artist queries (all plays of specific artist)
- Track queries (play history of specific song)

### 3. In-App Settings
Modal UI for configuring without editing config.js:
- OpenRouter API key, model, max tokens, temperature
- Spotify Client ID
- Settings persist in localStorage, override config.js values

### 4. Transparency Features
- **Detection explainer**: Collapsible breakdown of personality scoring
- **Data stats**: "Analyzed X streams from Y to Z"
- **Incremental caching**: Partial saves during parsing (crash-safe)

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
