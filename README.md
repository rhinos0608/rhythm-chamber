# Rhythm Chamber

**Your AI writes your musical story. Every time you visit. On your device. Watching you evolve.**

Your complete listening history is too big for ChatGPT. We handle it locally, with privacy, semantic search, and accurate data queries. Upload your Spotify export and ask questions like:

- "What was I listening to during my breakup in March?"
- "How did my taste change after college?"
- "When did I stop listening to The National, and why?"

Plus: Your AI notices your patterns and writes personalized narratives about your musical journey.

---

## Table of Contents

- [The Three-Layer Value Stack](#the-three-layer-value-stack)
- [Key Differentiators](#key-differentiators)
- [Getting Started](#getting-started)
- [Documentation](#documentation)
- [Development](#development)
- [Browser Compatibility](#browser-compatibility)
- [Project Status](#project-status)
- [Pricing & Licensing](#pricing--licensing)

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
| [API Reference](API_REFERENCE.md) | Core module API documentation |
| [Troubleshooting](TROUBLESHOOTING.md) | Common issues and solutions |
| [Changelog](CHANGELOG.md) | Version history and changes |
| [Code of Conduct](CODE_OF_CONDUCT.md) | Community guidelines |
| [Technical Debt](docs/plans/TECHNICAL_DEBT.md) | ✅ All 20 items resolved - see remediation report |

### Development Tools

#### Documentation Sync Script

Keep documentation synchronized with actual code using the automated sync script:

```bash
# Preview changes without writing
npm run sync-docs

# Actually update documentation files
npm run sync-docs:update

# Full output with JSON
node scripts/sync-documentation.mjs --verbose
```

The sync script tracks:
- Facade file line counts
- Internal module line counts
- Test counts per suite
- Total source statistics

Run `npm run sync-docs:update` after making significant changes to keep docs accurate.

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

### Enhanced Features

- **Intelligent Error Handling** — Automatic error classification with adaptive circuit breaker
- **Real-time Streaming** — Smooth streaming responses with proper buffering
- **Modular Architecture** — 15 controllers, 25+ services, 13+ utilities with focused modules
- **Cross-Tab Coordination** — Seamless session sharing across browser tabs
- **Security Hardening** — Content sanitization, rate limiting, data protection
- **Refactored Core** — Write-ahead log refactored from 1,016-line god object into 11 focused modules (largest 254 lines)

### What Stats.fm Can't Match

- **"Your data never leaves your device"** — For the quantified-self crowd, this is hugely compelling
- **"Bring Your Own Intelligence"** — Run local models or your own cloud keys; you own the compute path
- **"Chat with your complete history"** — ChatGPT can't handle your full Spotify export
- **"Try before you upload"** — Demo mode ships with a full sample persona, isolated from real data
- **"Template & Synth profiles"** — Generate synthetic profiles for comparison via the profile synthesizer
- **"Identity over statistics"** — "You're an Emotional Archaeologist" vs "Top Artists: A, B, C"
- **"Self-healing AI providers"** — Automatic fallback when providers fail, with real-time health monitoring

---

## Getting Started

### 0. Demo Mode (Instant sample)
- Load the built-in "Emo Teen" persona
- Chat with pre-seeded insights without uploading anything
- Exit demo to keep sample data isolated from your real analysis

### 1. Quick Snapshot (Instant)
- Connect Spotify OAuth (Chamber tier)
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

## Documentation

### Core Documentation

| Document | Description |
|----------|-------------|
| [Architecture](ARCHITECTURE.md) | System design, modules, data flow, zero-backend architecture |
| [API Reference](API.md) | Complete API documentation for all modules |
| [Testing Guide](TESTING.md) | Running and writing tests, test methodologies |
| [Security Model](SECURITY.md) | Comprehensive security model, threat analysis, audit results |

### Development Guides

| Document | Description |
|----------|-------------|
| [Contributing](CONTRIBUTING.md) | Development setup, patterns, guidelines |
| [Deployment](DEPLOYMENT.md) | Build process, deployment to Vercel/Netlify, COOP/COEP headers |
| [Refactoring](REFACTORING.md) | Refactoring history, patterns, characterization testing methodology |
| [Troubleshooting](TROUBLESHOOTING.md) | Common issues and solutions |
| [Changelog](CHANGELOG.md) | Version history and breaking changes |

### Decision Records

| Document | Description |
|----------|-------------|
| [ADR Index](docs/ADR/README.md) | Architecture Decision Records index |
| [Testing Methodology](docs/ADR/001-testing-methodology.md) | Characterization testing and worker mock architecture |
| [Architecture Decisions](docs/ADR/002-architecture-decisions.md) | IndexedDB structure, facade pattern, sub-agent execution |

### Additional Resources

| Document | Description |
|----------|-------------|
| [Agent Reference](AGENT_CONTEXT.md) | Technical documentation for AI agents |
| [Code of Conduct](CODE_OF_CONDUCT.md) | Community guidelines |

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

## Browser Compatibility

Rhythm Chamber is built for **modern browsers** and uses contemporary web platform APIs.

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

## Project Status

✅ **Complete** — Core analytics engine, local AI processing, premium integration
✅ **Complete** — Zero-backend architecture with client-side security
✅ **Complete** — BYOI (Bring Your Own Intelligence) provider support
🔄 **Active** — Feature refinement and user experience improvements

---

## Pricing & Licensing

Rhythm Chamber offers a simple two-tier pricing model:

| Tier | Price | Features |
|------|-------|----------|
| **Sovereign** | Free | Local AI only, manual data import, basic chat, manual profile creation |
| **Chamber** | $4.99/month | Cloud AI access, Spotify integration, AI-generated profiles, premium features |

### Premium Features (Chamber Tier)
- Spotify OAuth integration (automatic data import)
- OpenRouter cloud AI access
- AI-generated profile narratives
- Unlimited chat sessions
- Artifact visualizations
- Advanced analytics features

### License Verification
- Licenses managed through Lemon Squeezy
- Local validation with encrypted storage
- Graceful fallback to Sovereign tier
- 30-day validation cache

---

**Rhythm Chamber is for power users who want to understand themselves through their music data.**

We're not building a better stats.fm. We're building the next evolution of music self-discovery.

**Your data. Your intelligence. Your control. Your insights.**
