# AI Agent Reference — Rhythm Chamber

> **Last updated:** 2026-01-11 23:13 AEDT  
> **Status:** MVP implemented, ready for testing

---

## Quick Context

**What is this?**  
Music analytics app that tells users what their listening says about them — like Spotify Wrapped but deeper, year-round, and conversational.

**Core flow:**  
`Landing → Upload .zip/.json → Personality Reveal → Chat → Share Card`

**Tech stack:**  
100% client-side: Static HTML/CSS/JS + IndexedDB + Web Workers + OpenRouter API

---

## Implementation Status

| Component | Status | File(s) |
|-----------|--------|---------|
| Landing page | ✅ Done | `index.html` |
| App shell | ✅ Done | `app.html` |
| Design system | ✅ Done | `css/styles.css` |
| Data parser | ✅ Done | `js/parser-worker.js` (Web Worker) |
| Pattern detection | ✅ Done | `js/patterns.js` (8 algorithms) |
| Personality engine | ✅ Done | `js/personality.js` (5 types) |
| Chat integration | ✅ Done | `js/chat.js` (OpenRouter) |
| Card generator | ✅ Done | `js/cards.js` (Canvas) |
| Storage | ✅ Done | `js/storage.js` (IndexedDB) |
| API config | ✅ Done | `js/config.js` (gitignored) |
| Spotify OAuth | ⏳ v1.1 | Not implemented |
| WASM embeddings | ⏳ v1.1 | Not implemented |

---

## File Structure

```
rhythm-chamber/
├── index.html              # Landing page
├── app.html                # Main app
├── css/styles.css          # Design system
├── js/
│   ├── app.js              # Main controller
│   ├── parser-worker.js    # Web Worker (non-blocking parse)
│   ├── parser.js           # Legacy parser (not used)
│   ├── patterns.js         # 8 pattern detection algorithms
│   ├── personality.js      # 5-type classifier
│   ├── chat.js             # OpenRouter integration
│   ├── cards.js            # Canvas card generator
│   ├── storage.js          # IndexedDB wrapper
│   ├── config.js           # API keys (gitignored)
│   └── config.example.js   # Config template
├── docs/
│   ├── 01-06 product docs
│   └── API_SETUP.md        # OpenRouter setup guide
└── .gitignore              # Protects config.js
```

---

## Documentation (7 docs)

| Doc | Description |
|-----|-------------|
| [01-product-vision.md](docs/01-product-vision.md) | What, why, monetization |
| [02-user-experience.md](docs/02-user-experience.md) | User flow, UX philosophy |
| [03-technical-architecture.md](docs/03-technical-architecture.md) | Tech stack, pipeline |
| [04-intelligence-engine.md](docs/04-intelligence-engine.md) | Personality types, algorithms |
| [05-roadmap-and-risks.md](docs/05-roadmap-and-risks.md) | Timeline, risks |
| [06-advanced-features.md](docs/06-advanced-features.md) | v2 features |
| [API_SETUP.md](docs/API_SETUP.md) | OpenRouter configuration |

---

## Key Product Decisions

| Decision | Reasoning |
|----------|-----------|
| File upload (.zip or .json) | Full historical data; no API limits |
| Web Worker parsing | UI stays responsive for 100k+ streams |
| Personality types, not stats | People want identity, not numbers |
| Duration tracking | Completion rate = behavioral signal |
| Config file for API keys | Secure, gitignored, easy setup |

---

## Personality Types

| Type | Signal |
|------|--------|
| Emotional Archaeologist | Distinct eras + high repeat |
| Mood Engineer | Time-of-day patterns + mood searching |
| Discovery Junkie | Low plays-per-artist |
| Comfort Curator | Same songs for years |
| Social Chameleon | Weekday ≠ weekend patterns |

---

## Running Locally

```bash
# 1. Set up API key
cp js/config.example.js js/config.js
# Edit js/config.js with your OpenRouter key

# 2. Start server
python3 -m http.server 8080

# 3. Open http://localhost:8080
```

---

## Instructions for Future Agents

1. **Read this file first**
2. **Follow UX Philosophy** — No filters, no dashboards
3. **Respect silence** — Insight engine can return None
4. **Use Web Worker** — Never block main thread for parsing
5. **Update session log** at end of session

---

## Session Log

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

**Deferred to v1.1:**
- WASM embeddings (Xenova/transformers)
- Spotify OAuth (Lite version)

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
