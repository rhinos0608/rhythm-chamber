# Rhythm Chamber

**Your AI writes your musical story. Every time you visit. On your device. Watching you evolve.**

Your complete listening history is too big for ChatGPT. We handle it locally, with privacy, semantic search, and accurate data queries. Upload your Spotify export and ask questions like:

- "What was I listening to during my breakup in March?"
- "How did my taste change after college?"
- "When did I stop listening to The National, and why?"

Plus: Your AI notices your patterns and writes personalized narratives about your musical journey.

---

## The Three-Layer Value Stack

### Layer 1: Emotional Value
**Your AI notices your patterns. Writes personalized narratives. Witnesses your evolution. Creates meaning from data.**

| Stats.fm | Rhythm Chamber |
|----------|----------------|
| "You listened to 12,847 hours" | "You're a Mood Engineer because..." |
| Charts and graphs | Identity and meaning |
| Click to explore | Ask questions naturally |
| Full history + real-time | Full history only (depth over speed) |
| Low technical barrier | BYOI model (power users bring their own intelligence) |

### Layer 2: Privacy Value
**Data never leaves your device. Your AI, not a company's AI. Structurally private by design. Verifiable through open source.**

**Stats.fm needs servers** → They must monetize → They control your data → You depend on them

**Rhythm Chamber** → Zero servers → Free forever → Your data stays local → You control everything

**This isn't "too cheap to host AI" — it's "respecting power users' desire for control."**

### Layer 3: Control Value
**Choose your AI provider. Own your data completely. No vendor lock-in. Full transparency.**

- **Pick the compute**: Local models (Ollama/LM Studio) for zero cloud calls, or cloud via OpenRouter when convenient
- **Own the keys**: Only provide keys when you want cloud; local stays keyless and offline
- **Sovereignty**: Choose model + vector store, keep RAG credentials encrypted client-side
- **No black box**: They control the intelligence, we provide the orchestration

---

## Documentation

| Document | Description |
|----------|-------------|
| [Product Vision](docs/01-product-vision.md) | Emotional witness positioning, competitive moat |
| [User Experience](docs/02-user-experience.md) | Natural language queries, semantic search |
| [Technical Architecture](docs/03-technical-architecture.md) | Zero-backend, BYOI architecture |
| [Intelligence Engine](docs/04-intelligence-engine.md) | Personality types, data depth |
| [Roadmap & Risks](docs/05-roadmap-and-risks.md) | 6-week timeline, competitive positioning |
| [Advanced Features](docs/06-advanced-features.md) | Local models, transparency |
| [API Setup](docs/API_SETUP.md) | Power user configuration |
| [GSD System](docs/gsd-system.md) | Development methodology and workflows |
| [Security Milestone v0.9](docs/security-milestone-v0.9.md) | Security hardening completion report |
| [Deployment Guide](docs/DEPLOYMENT.md) | Deployment instructions for Vercel, Netlify, etc. |

### Developer Documentation

| Document | Description |
|----------|-------------|
| [Contributing](CONTRIBUTING.md) | Contribution guidelines and development workflow |
| [Testing Guide](TESTING.md) | Running and writing tests |
| [Security Model](SECURITY.md) | Comprehensive security model and threat analysis |
| [Agent Reference](AGENT_CONTEXT.md) | Technical documentation for AI agents |

---

## Core Flow

```
Upload .zip → Personality Reveal → Chat with Semantic Search → Share Card
```

## Key Differentiators

1. **Chat-First Interface** — Natural language queries, not dashboard clicks
2. **Semantic Search** — Ask "What was I like in 2019?" and get contextual answers (100% local, WASM-based)
3. **Zero-Backend Architecture** — Runs entirely in your browser
4. **BYOI Model** — You choose the intelligence (local or cloud), we orchestrate it
5. **Privacy-First** — Your data never leaves your device
6. **Power User Focus** — If you can set up an API key, you can use Rhythm Chamber
7. **Provider Health Monitoring** — Real-time AI provider status with automatic fallback and smart error guidance

### What Stats.fm Can't Match

- **"Your data never leaves your device"** — For the quantified-self crowd, this is hugely compelling
- **"Bring Your Own Intelligence"** — Run local models or your own cloud keys; you own the compute path
- **"Chat with your complete history"** — ChatGPT can't handle your full Spotify export
- **"Try before you upload"** — Demo mode ships with a full sample persona, isolated from real data
- **"Template & Synth profiles"** — Generate synthetic profiles for comparison via the profile synthesizer
- **"Identity over statistics"** — "You're an Emotional Archaeologist" vs "Top Artists: A, B, C"
- **"Self-healing AI providers"** — Automatic fallback when providers fail, with real-time health monitoring and smart troubleshooting guidance

---

## Browser Compatibility

Rhythm Chamber is built for **modern browsers** and uses contemporary web platform APIs that are not compatible with legacy browsers like Internet Explorer 11.

### Supported Browsers

| Browser | Minimum Version | Status |
|---------|----------------|--------|
| Chrome | 90+ | Fully Supported |
| Edge | 90+ | Fully Supported |
| Firefox | 90+ | Fully Supported |
| Safari | 14.5+ | Fully Supported |
| iOS Safari | 14.5+ | Fully Supported |
| Android Chrome | 90+ | Fully Supported |

### Required Features

The application requires these browser features:

- **ES Modules** - For code organization
- **Web Crypto API** - For client-side encryption
- **IndexedDB** - For local data storage
- **Async/await** - For asynchronous operations
- **BroadcastChannel** - For cross-tab communication
- **CSS Grid & Custom Properties** - For modern layouts

### Not Supported

- Internet Explorer 11 (no Web Crypto, no ES modules)
- Firefox < 90 (no optional chaining, no SharedWorker fallback)
- Safari < 14.5 (no optional chaining, no BroadcastChannel)
- Android browser < Chrome 90

A friendly upgrade message will be displayed if your browser doesn't support required features.

---

### Why This Works

**Power users WANT control:**
- Already exporting data (privacy-conscious)
- Understand API keys (technical)
- Appreciate transparency (no black box)
- Willing to pay for their own infrastructure (sovereignty)

---

## Project Status

✅ **MVP Complete** — Personality types, chat, semantic search, zero-backend architecture
✅ **v0.9 Security Hardening Complete** — 23/23 security requirements satisfied (AES-GCM-256 encryption, HMAC-SHA256 messaging)
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

---

## Pricing Strategy

### Three-Pillar Model

| Tier | Price | What You Get | Infrastructure | Purpose |
|------|-------|--------------|----------------|----------|
| **Sovereign** | **$0** | Full local analysis, BYOI chat, basic cards, personality reveal | Client-side only | **Loss Leader**: Build community, validate product, zero server costs |
| **Curator** | **$19.99 one-time** | PKM Export, Relationship Resonance, Deep Enrichment, Metadata Fixer | Client-side only | **Seed Capital**: Funds security audit ($10,000 goal) |
| **Chamber** | **$4.99/mo or $39/yr** | E2EE Sync, Chamber Portal, Managed AI, Weekly Insights | Hybrid (client + server) | **Recurring Revenue**: Sustainable operations, infrastructure costs |

### Security Audit Stretch Goal

**$10,000 raised = Security audit unlocked**

When we reach $10,000 in Supporter revenue, we will commission an external security audit to validate our zero-backend architecture and encryption implementation. This audit will be published publicly to build trust with our community.

### Why This Works

- **Zero Risk Entry**: Users try without payment barrier
- **Community Investment**: Supporters feel ownership in security development
- **Borrowed Trust**: External security firm reputation transfers to your product
- **PKM Export**: "Physical" digital copy of their history that connects to their other notes
- **Relationship Engine**: Viral loop - one user buys to analyze partner/friend, sells the outcome (relationship insight)
- **Zero-Backend**: No payment processing infrastructure needed
- **Viral Loop**: "Compare with Friend" via JSON exchange keeps data private
- **BYOI Model**: Appeals to privacy-conscious power users who want control and choice over models/keys
- **Phase 2 Trigger**: Only after hitting Supporter KPI (~250-1,000) and security audit complete
- **Revenue Allocation**: Supporter funds go directly to security audit and cloud infrastructure
- **Lifetime Protection**: Separates access fee from compute costs
- **Two Points of Failure**: Users can switch between local and cloud modes
- **Never Deprecate Local**: Free tier remains functional forever

### Feature Implementation
- **PKM Export**: Generates folder of Markdown files (one for every Artist, Month, Era) properly interlinked for Obsidian/Notion/Roam
- **Relationship Compatibility Report**: Upload second person's zip/JSON to generate "You and Sarah have 84% overlap in 'Melancholy' but divergent 'Energy' curves in 2021. Your common anthem is 'Bloodbuzz Ohio'."
- **Enrichment Mode** (Strategy 3): Connects to public APIs (MusicBrainz, AcoustID) to fetch BPM, Key, Producer Credits, Lyrics for top tracks
- **Patreon Perks**: Discord access, voting rights, early access
- **Phase 2**: Multi-device sync, encrypted cloud backup, managed AI setup, **external security partnership**

---

## Target Audience

**New framing:** Everyone who screenshots Wrapped (~100M+) + quantified-self enthusiasts + PKM users + relationship-focused users

The data export friction is real, but the payoff is self-discovery and deeper connections, not just stats.

