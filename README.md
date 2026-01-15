# Rhythm Chamber

**Understand why your music matters.**

Your complete listening history is too big for ChatGPT. We handle it locally, with privacy, semantic search, and accurate data queries. Upload your Spotify export and ask questions like:

- "What was I listening to during my breakup in March?"
- "How did my taste change after college?"
- "When did I stop listening to The National, and why?"

Plus: Get your listener personality type based on actual patterns in your data.

---

## Why Rhythm Chamber?

### Stats.fm Shows **WHAT**. We Show **WHY & WHO**.

| Stats.fm | Rhythm Chamber |
|----------|----------------|
| "You listened to 12,847 hours" | "You're a Mood Engineer because..." |
| Charts and graphs | Identity and meaning |
| Click to explore | Ask questions naturally |
| Full history + real-time | Full history only (depth over speed) |
| Low technical barrier | BYOI model (power users bring their own intelligence) |

### The Zero-Backend Advantage

**Stats.fm needs servers** → They must monetize → They control your data → You depend on them

**Rhythm Chamber** → Zero servers → Free forever → Your data stays local → You control everything

**This isn't "too cheap to host AI" — it's "respecting power users' desire for control."**

---

## Documentation

| Document | Description |
|----------|-------------|
| [Product Vision](docs/01-product-vision.md) | Chat-first positioning, competitive moat |
| [User Experience](docs/02-user-experience.md) | Natural language queries, semantic search |
| [Technical Architecture](docs/03-technical-architecture.md) | Zero-backend, BYOI architecture |
| [Intelligence Engine](docs/04-intelligence-engine.md) | Personality types, data depth |
| [Roadmap & Risks](docs/05-roadmap-and-risks.md) | 6-week timeline, competitive positioning |
| [Advanced Features](docs/06-advanced-features.md) | Local models, transparency |
| [API Setup](docs/API_SETUP.md) | Power user configuration |

---

## Core Flow

```
Upload .zip → Personality Reveal → Chat with Semantic Search → Share Card
```

## Key Differentiators

1. **Chat-First Interface** — Natural language queries, not dashboard clicks
2. **Semantic Search** — Ask "What was I like in 2019?" and get accurate answers
3. **Zero-Backend Architecture** — Runs entirely in your browser
4. **BYOI Model** — You choose the intelligence (local or cloud), we orchestrate it
5. **Privacy-First** — Your data never leaves your device
6. **Power User Focus** — If you can set up an API key, you can use Rhythm Chamber


### What Stats.fm Can't Match

- **"Your data never leaves your device"** — For the quantified-self crowd, this is hugely compelling
- **"Bring Your Own Intelligence"** — Run local models or your own cloud keys; you own the compute path
- **"Chat with your complete history"** — ChatGPT can't handle your full Spotify export
- **"Try before you upload"** — Demo mode ships with a full sample persona, isolated from real data
- **"Template & Synth profiles"** — Generate synthetic profiles for comparison via the profile synthesizer
- **"Identity over statistics"** — "You're an Emotional Archaeologist" vs "Top Artists: A, B, C"

### Why This Works

**Power users WANT control:**
- Already exporting data (privacy-conscious)
- Understand API keys (technical)
- Appreciate transparency (no black box)
- Willing to pay for their own infrastructure (sovereignty)


---

## Project Status

✅ **MVP Complete** — Personality types, chat, semantic search, zero-backend architecture  
🔄 **In Progress** — Viral loop testing, premium model integration  
🎯 **Next** — Deploy to production, get 20 beta users

---

## Getting Started

### 0. Demo Mode (Instant sample)
- Load the built-in "Emo Teen" persona
- Chat with pre-seeded insights without uploading anything
- Exit demo to keep sample data isolated from your real analysis

### 1. Quick Snapshot (Instant)
- Connect Spotify OAuth
- Get current vibe analysis
- Limited to recent data

### 2. Full Analysis (Patient)
- Request Spotify data export (5-30 days)
- Upload .zip file
- Complete personality reveal + semantic search

### 3. Power User Setup
- Add OpenRouter API key (or use local models for BYOI)
- Configure Qdrant for semantic search
- Use local models for ultimate privacy

---

## Development

### Setup
```bash
npm install
npm run dev     # Start local server on port 8080
```

### Testing
```bash
npm test           # E2E tests (Playwright)
npm run test:unit  # Unit tests (Vitest) - schemas & patterns
npm run test:unit:watch  # Watch mode for TDD
```

### Project Structure
- `js/` - Application source code
- `tests/unit/` - Unit tests (Vitest)
- `tests/rhythm-chamber.spec.ts` - E2E tests (Playwright)
- `docs/` - Documentation

---

**Rhythm Chamber is for power users who want to understand themselves through their music data.**

We're not building a better stats.fm. We're building the next evolution of music self-discovery.

**Your data. Your intelligence. Your control. Your insights.**

**New Strategy:** Focus on PKM export and relationship insights for Supporters, drop CLI and paid themes, keep everything else free and local.
