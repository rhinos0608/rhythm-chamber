# Roadmap & Risks

## Timeline (6 weeks)

| Week | Focus | Deliverable | Status |
|------|-------|-------------|--------|
| 1-2 | Data Pipeline + Pattern Detection | Parse, store, detect patterns | ✅ Complete |
| 3-4 | Personality Engine + Chat | Classify types, insights, chat | ✅ Complete |
| 5-6 | Shareable Cards + Launch | Social sharing, deploy | 🔄 In Progress |

---

## Week 1-2: Data Pipeline ✅

- [x] Accept Spotify .zip upload
- [x] Parse StreamingHistory*.json files  
- [x] Store in IndexedDB (client-side)
- [x] Generate weekly chunks
- [x] Basic pattern detection (ghosted artists, discovery rate)
- [x] Web Worker for non-blocking parsing
- [x] Incremental caching (crash-safe)

## Week 3-4: Personality Engine ✅

- [x] Implement 5 personality types with scoring
- [x] Generate personalized insight with evidence
- [x] Chat integration with OpenRouter + LLM
- [x] Spotify OAuth for Lite version (Quick Snapshot)
- [x] In-app settings UI
- [x] Chat data queries (time/artist lookups)
- [x] Transparency features (detection explainer)

## Week 5-6: Launch 🔄

- [x] Landing page
- [x] Shareable personality cards
- [ ] OG tags for social previews
- [ ] Deploy to production
- [ ] Get 20 beta users

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Completed uploads | 20 |
| Personality accuracy (user feedback) | 80% |
| Cards shared on social | 10+ |
| Return visitors (7-day) | 30% |

---

## Critical Risks

### 🟡 Medium Risks

| Risk | Mitigation | Status |
|------|------------|--------|
| Data export friction (5-30 day wait) | Lite version with instant OAuth | ✅ Mitigated |
| Pattern detection false positives | Only ship patterns detectable without API | ✅ Implemented |
| Personality types feel generic | Use specific evidence from user data | ✅ Implemented |
| Creepy line crossed | Aggregate patterns, ask don't tell | ✅ Designed |

### 🟠 High Risks

| Risk | Mitigation | Status |
|------|------------|--------|
| Chat feels generic | Heavy prompt engineering, consider paid models | 🔄 Ongoing |
| Nobody shares cards | Make cards visually irresistible | 🔄 Testing |

---

## What Has to Go Right

1. **First insight is accurate** — 80%+ correct personality type ✅
2. **First insight is shareable** — People screenshot and post 🔄
3. **Chat feels smart** — Not generic therapy-speak ✅
4. **Viral loop works** — Cards drive signups 🔄

---

## What's NOT in MVP

| Feature | Status |
|---------|--------|
| Genre-dependent patterns (workout, breakup) | v2 (needs API) |
| Proactive observations | v2 (creepy risk) |
| Premium tiers | Post-validation |
| Apple Music | Post-MVP |
| Friend comparisons | Post-MVP |
| WASM embeddings | v1.1 |

---

## Post-MVP Backlog

| Priority | Feature | Notes |
|----------|---------|-------|
| P1 | Spotify audio features API (genre, BPM) | Deeper genre analysis |
| P1 | Premium AI models | Better chat quality |
| P1 | Production deploy | Vercel/Netlify |
| P2 | Year-in-review generator | Annual summary |
| P2 | Monetization (credits) | Usage-based pricing |
| P3 | Apple Music support | Different data format |

---

## Completed Since Plan

Features implemented beyond original roadmap:
- **In-app Settings UI** — No config file editing needed
- **Chat Data Queries** — "What did I listen to in March?"
- **Detection Explainer** — Transparency on personality scoring
- **Incremental Caching** — Crash-safe parsing
- **Markdown in Chat** — Formatted AI responses
- **AI Function Calling** — LLM can query data via tools (get_top_artists, etc.)
- **Semantic Search Premium** — RAG with Qdrant + Stripe payments ($5 lifetime / $2/mo)
