# Rhythm Chamber

## What This Is

Rhythm Chamber is an AI-powered Spotify data analytics application that analyzes what your music says about you. Think Spotify Wrapped but year-round and actually personalized. Upload your JSON/ZIP export or connect via Spotify OAuth for instant insights. The app is 100% client-side; only your chosen AI provider and music service see your data.

Users discover their "listening personality" through 5 archetype types, then explore their data through an AI chat that understands their music history.

## Core Value

Your data stays on your device. You control everything. We help you understand yourself through your music—not show you charts you could get anywhere else.

## Requirements

### Validated

- Data upload and parsing (Spotify JSON/ZIP exports)
- Weekly chunking with IndexedDB storage (crash-safe)
- 5 personality types with scoring and evidence
- AI chat with OpenRouter + BYOI (local models or user's API keys)
- Spotify OAuth for "Quick Snapshot" lite version
- Demo mode with sample persona
- Template profiles + profile synthesizer
- Semantic search (local WASM embeddings)
- Pattern detection (ghosted artists, discovery rate)
- Web Worker pool with heartbeat and timeout budget management
- In-app settings UI
- Shareable personality cards

### Active

- [ ] **SEC-01**: Session key management — Secure key derivation with Web Crypto API, key rotation
- [ ] **SEC-02**: Cross-tab data exposure — Message signing, origin validation, data sanitization
- [ ] **SEC-03**: Storage encryption — Audit and encrypt sensitive data in IndexedDB/localStorage

### Out of Scope

- **Genre-dependent patterns** (workout, breakup) — Requires Spotify API, deferred to post-MVP
- **Proactive observations** — Creepy risk, user must initiate
- **Apple Music support** — Post-MVP market expansion
- **Friend comparisons** — Post-MVP social feature
- **E2EE sync** — Phase 2 (Chamber tier, after security audit)

## Context

**Technical environment:**
- Zero-backend SPA (100% client-side processing)
- HNW (Hierarchy-Network-Wave) modular architecture
- ES6 modules with dependency injection
- Multi-tab coordination via BroadcastChannel
- Web Workers for heavy computation (embeddings, pattern detection)

**Current state:**
- Core features complete (data pipeline, personality engine, chat)
- Preparing for v1.0 launch
- Security audit identified gaps in session keys, cross-tab messaging, and storage encryption

**Known issues from CONCERNS.md:**
- Large files (settings.js 2,222 lines, several services 1,300+ lines) — deferred to post-launch
- Lazy import patterns for circular dependency prevention — deferred to post-launch
- Provider fallback chain race conditions — lower priority
- Window global pollution (124+ globals) — deferred to post-launch

## Constraints

- **Zero-backend**: Must remain 100% client-side for MVP; server-side features deferred to Chamber tier (Phase 2)
- **Security-first**: Any launch blocker security issues must be resolved before v1.0
- **Performance**: Web Worker failures must fall back gracefully without blocking UI
- **Browser compatibility**: Must work in modern browsers (HTTPS/secure context required for Web Crypto API)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Zero-backend architecture | Privacy-first positioning, no infrastructure costs | ✓ Good |
| BYOI (Bring Your Own Intelligence) | Appeals to power users, no AI costs for us | ✓ Good |
| Three-pillar pricing (Sovereign/Curator/Chamber) | Free tier builds community, Curator funds security audit, Chamber provides recurring revenue | — Pending launch |
| Security hardening before launch | Address identified gaps before exposing to wider audience | — Pending |

---
*Last updated: 2025-01-21 after milestone v0.9 initialization*
