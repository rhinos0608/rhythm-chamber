# AI Agent Reference — Rhythm Chamber

> **Last updated:** 2026-01-11 21:45 AEDT  
> **Status:** Documentation complete, ready for implementation

---

## Quick Context

**What is this?**  
Music analytics app that tells users what their listening says about them — like Spotify Wrapped but deeper, year-round, and conversational.

**Core flow:**  
`Landing → Spotify OAuth (Lite) or Upload .zip (Full) → Personality Reveal → Chat → Share Card`

**Tech stack:**  
100% client-side: Static site + localStorage + WASM embeddings + OpenRouter API (direct from browser)

---

## Documentation (6 docs)

| Doc | Description |
|-----|-------------|
| [01-product-vision.md](docs/01-product-vision.md) | What, why, monetization |
| [02-user-experience.md](docs/02-user-experience.md) | User flow, UX philosophy, lite version |
| [03-technical-architecture.md](docs/03-technical-architecture.md) | Tech stack, API, database, pipeline |
| [04-intelligence-engine.md](docs/04-intelligence-engine.md) | Personality types, detection algorithms |
| [05-roadmap-and-risks.md](docs/05-roadmap-and-risks.md) | 6-week timeline, risks |
| [06-advanced-features.md](docs/06-advanced-features.md) | v2 features (transparency, local models) |

---

## Key Product Decisions

| Decision | Reasoning |
|----------|-----------|
| File upload, not API | Full historical data; Stats.fm proves users accept this |
| Lite Version (OAuth) | Instant gratification hooks user before 5-30 day wait |
| Personality types, not stats | People want identity, not numbers |
| Duration tracking | TikTok-style: completion rate = behavioral signal |
| Micro-insights, no explanation | Silence is a feature. Returning `None` is valid. |
| Zero-choice consumption | No filters. One insight appears, it leaves. |

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

## Key Constraints

1. **No genre data in export** — Can't detect "workout" or "sad" without API
2. **No track duration** — Estimate from max observed ms_played
3. **Silence is a feature** — Don't force insights

---

## Session Log

### Session 1 — 2026-01-11

**What was done:**
1. Refined product from stats → "Wrapped but deeper" personality engine
2. Added duration tracking (TikTok-style behavioral signals)
3. Added life event detection (ghosts, discovery explosions)
4. Created UX philosophy (micro-insights, zero-choice, silence)
5. Added Lite version (Spotify OAuth instant onboarding)
6. Added transparency features doc (show your work)
7. Consolidated from 12 docs → 6 docs with clear separation

**Key decisions:**
- Silence is a feature (returning None is valid)
- Duration is the moat
- Ask, don't tell
- Lite vs Full two-path onboarding

---

## Instructions for Future Agents

1. **Read this file first**
2. **Follow UX Philosophy** — No filters, no dashboards
3. **Respect silence** — Insight engine can return None
4. **Be adversarial** — Check risks before building
5. **Update session log** at end of session

---

## Session Log

### Session 2 — 2026-01-11 (Implementation)

**What was done:**
1. Built complete static site: `index.html`, `app.html`, `css/styles.css`
2. Implemented data pipeline: .zip parsing, stream enrichment, chunk generation
3. Built all 8 pattern detection algorithms from docs
4. Created 5-type personality classifier with scoring and evidence
5. Added OpenRouter chat integration with fallback responses
6. Created Canvas-based shareable card generator
7. Verified landing page and app UI in browser

**Tech stack confirmed:**
- Pure HTML/CSS/JS (no framework)
- IndexedDB for local storage
- JSZip CDN for archive extraction
- OpenRouter for LLM chat

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
5. Added Lite version (Spotify OAuth instant onboarding)
6. Added transparency features doc (show your work)
7. Consolidated from 12 docs → 6 docs with clear separation

**Key decisions:**
- Silence is a feature (returning None is valid)
- Duration is the moat
- Ask, don't tell
- Lite vs Full two-path onboarding
