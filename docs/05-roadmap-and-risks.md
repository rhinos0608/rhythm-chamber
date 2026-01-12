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
| P2 | Cloud/Device Sync | User pays for server storage |
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
- **Semantic Search** — RAG with Qdrant (now free for all users)

---

## Competitive Positioning Update

### The Stats.fm Problem

Stats.fm shows you **WHAT**. You show them **WHY and WHO**.

| Stats.fm | Rhythm Chamber |
|----------|----------------|
| Dashboard (filters, charts) | Narrative (personality, chat) |
| Click to explore | Ask questions naturally |
| "You listened to X hours" | "You're a Mood Engineer because..." |
| Full history + real-time | Full history only |
| Low technical barrier (OAuth) | Medium (file upload OR OAuth) |

### The BYOK Advantage

**Power users WANT control:**
- Already exporting data (privacy-conscious)
- Understand API keys (technical)
- Appreciate transparency (no black box)
- Willing to pay for their own infra (sovereignty)

**This isn't "too cheap to host AI"—it's "respecting power users' desire for control."** That's a feature, not a bug.

### The Zero-Backend Moat

Stats.fm requires server infrastructure, which means:
- They need to monetize to cover hosting
- They control your data
- They can shut down or change pricing
- You depend on their uptime

**Your approach:** "Your data never leaves your device, runs in your browser, you control everything." For the quantified-self crowd, this is hugely compelling.

---

## Risk Mitigation: Technical

### Data Export Friction
- **Problem:** 5-30 day wait for Spotify data export
- **Solution:** Lite version with OAuth for instant insights
- **Status:** ✅ Implemented

### Pattern Detection Accuracy
- **Problem:** False positives from limited data
- **Solution:** Only ship patterns detectable without API
- **Status:** ✅ Implemented

### Chat Quality
- **Problem:** Generic responses feel like therapy-speak
- **Solution:** Heavy prompt engineering + paid models for premium
- **Status:** 🔄 Ongoing

### Viral Loop
- **Problem:** Cards don't get shared
- **Solution:** Make cards visually irresistible + shareable
- **Status:** 🔄 Testing

---

## Risk Mitigation: Business

### Monetization
**Model:** Transparent, usage-based
- Free tier: Personality reveal + unlimited chat (free models)
- Premium: $2/month or $10 lifetime
- **Why it works:** Users only pay for what we pay for

### User Acquisition
**Strategy:** Target quantified-self enthusiasts
- They already export data
- They understand API keys
- They value privacy and control
- They're willing to pay for tools

### Competition
**Differentiation:** We're not competing on stats. We're competing on self-discovery.
- Stats.fm: "Look at your data"
- Rhythm Chamber: "Look at yourself"

---

## What Could Go Wrong (And How We Handle It)

### Scenario 1: "Chat feels generic"
**Mitigation:** 
- Use better models for premium users
- Heavy prompt engineering
- User feedback loop to improve

### Scenario 2: "Nobody wants to wait for data export"
**Mitigation:**
- Lite version provides instant value
- Clear messaging about what full version offers
- Progressive reveal of features

### Scenario 3: "Power users don't actually want BYOK"
**Mitigation:**
- Offer optional cloud sync (paid)
- Keep local-first as default
- Let users choose their level of control

### Scenario 4: "Personality types feel like astrology"
**Mitigation:**
- Show exact detection logic
- Use specific evidence from user data
- Make it explainable and transparent

---

## Success Indicators

### Early Signals (Week 1-2)
- Users complete upload without drop-off
- Positive feedback on personality accuracy
- Cards get shared organically

### Growth Signals (Week 3-4)
- Return visitors increase
- Chat sessions lengthen
- Premium conversions start

### Scale Signals (Week 5-6)
- Viral coefficient > 1.0
- Community forms around personality types
- Press/blogger interest

---

## The Bottom Line

**We're not building a better stats.fm. We're building the next evolution of music self-discovery.**

The zero-backend architecture isn't a limitation—it's our moat. The BYOK model isn't a barrier—it's a feature for our target audience. The data export friction isn't a bug—it's a filter for users who value depth over immediacy.

**If we get the first insight right, if it's shareable, if chat feels smart, and if the viral loop works—we win.**
