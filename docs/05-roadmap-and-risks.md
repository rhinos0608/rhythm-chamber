# Roadmap & Risks

## Timeline (6 weeks)

| Week | Focus | Deliverable |
|------|-------|-------------|
| 1-2 | Data Pipeline + Pattern Detection | Parse, store, detect patterns |
| 3-4 | Personality Engine + Chat | Classify types, insights, chat |
| 5-6 | Shareable Cards + Launch | Social sharing, deploy |

---

## Week 1-2: Data Pipeline

- [ ] Accept Spotify .zip upload
- [ ] Parse StreamingHistory*.json files
- [ ] Store in Postgres + pgvector
- [ ] Generate weekly chunks + embeddings
- [ ] Basic pattern detection (ghosted artists, discovery rate)

## Week 3-4: Personality Engine

- [ ] Implement 5 personality types with scoring
- [ ] Generate personalized insight with evidence
- [ ] Chat integration with vector search + LLM
- [ ] Spotify OAuth for Lite version

## Week 5-6: Launch

- [ ] Landing page
- [ ] Shareable personality cards
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

| Risk | Mitigation |
|------|------------|
| Data export friction (5-30 day wait) | Lite version with instant OAuth |
| Pattern detection false positives | Only ship patterns detectable without API |
| Personality types feel generic | Use specific evidence from user data |
| Creepy line crossed | Aggregate patterns, ask don't tell |

### 🟠 High Risks

| Risk | Mitigation |
|------|------------|
| Chat feels generic | Heavy prompt engineering, consider paid models |
| Nobody shares cards | Make cards visually irresistible |

---

## What Has to Go Right

1. **First insight is accurate** — 80%+ correct personality type
2. **First insight is shareable** — People screenshot and post
3. **Chat feels smart** — Not generic therapy-speak
4. **Viral loop works** — Cards drive signups

---

## What's NOT in MVP

| Feature | Status |
|---------|--------|
| Genre-dependent patterns (workout, breakup) | v2 (needs API) |
| Proactive observations | v2 (creepy risk) |
| Premium tiers | Post-validation |
| Apple Music | Post-MVP |
| Friend comparisons | Post-MVP |

---

## Post-MVP Backlog

| Priority | Feature |
|----------|---------|
| P1 | Spotify audio features API (genre, BPM) |
| P1 | Premium AI models |
| P2 | Year-in-review generator |
| P2 | Monetization (credits) |
| P3 | Apple Music support |
