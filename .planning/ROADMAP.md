# Roadmap: Rhythm Chamber v1.0 Premium Launch

**Created:** 2025-01-24
**Milestone:** v1.0 Premium Launch
**Previous Phases:** 1-9 (MVP + Security, completed)

---

## Overview

5 phases to complete premium features and launch v1.0.

| Phase | Name | Goal | Status |
|-------|------|------|--------|
| 10 | Lemon Squeezy Integration | Enable payment processing | ✗ Not Started |
| 11 | Semantic Search Gating | Gate embeddings behind premium | ✗ Not Started |
| 12 | Metadata Enrichment | Spotify API audio features | ✗ Not Started |
| 13 | AI Playlist Curator | Natural language playlists | ✗ Not Started |
| 14 | Launch Preparation | OG tags, deployment, beta users | ✗ Not Started |

**Total:** 5 phases to v1.0 launch

---

## Phase 10: Lemon Squeezy Integration

**Goal:** Enable payment processing and license validation for The Chamber tier.

### Pricing Model

**Tier 1: The Sovereign (Free)**
- Full local analysis
- BYOI chat (local/cloud)
- Basic personality cards
- 1 free playlist trial

**Tier 2: The Chamber ($4.99/mo or $39/yr)**
- Unlimited playlist generation
- Metadata enrichment (BPM, key, audio features)
- Semantic search with embeddings
- AI playlist curator

### Tasks

1. Create Lemon Squeezy store
2. Create product "The Chamber" with variants:
   - Chamber Monthly: $4.99/mo
   - Chamber Yearly: $39/yr
3. Enable license key generation (3-device limit)
4. Deploy Cloudflare Worker for license validation
5. Configure variant IDs in app
6. Test overlay checkout flow
7. Test license activation and validation

### Files to Modify
- `js/services/config-loader.js` (set variant IDs)
- `workers/license-validator/index.js` (deploy)

### Success Criteria
- User can complete purchase without leaving app (overlay checkout)
- License validates via Cloudflare Worker
- Premium features unlock after purchase
- License persists across page reloads

---

## Phase 11: Semantic Search Gating

**Goal:** Gate semantic embeddings behind premium tier.

### Tasks

1. Review `js/local-embeddings.js` implementation
2. Add `semantic_embeddings` feature check to embedding queries
3. Show upgrade modal when free users try semantic search
4. Add "1 free semantic search" to trial quota
5. Test quota behavior with embeddings

### Files to Modify
- `js/local-embeddings.js` (add premium gates)
- `js/chat.js` (gate semantic queries)
- `js/services/premium-quota.js` (add semantic search quota)

### Success Criteria
- Free users see upgrade prompt for semantic search
- Premium users can use unlimited semantic queries
- Trial quota allows 1 free semantic search

---

## Phase 12: Metadata Enrichment

**Goal:** Fetch and display rich metadata from Spotify Web API.

### Tasks

1. Implement Spotify Web API client
2. Add audio features endpoint (BPM, key, danceability, energy)
3. Add track details endpoint (producer credits, album info)
4. Create enrichment service that batches API calls
5. Store enriched data in IndexedDB
6. Display metadata in UI (track cards, details modal)
7. Implement cache invalidation for stale data

### Files to Create
- `js/services/spotify-api.js` (Spotify Web API client)
- `js/services/metadata-enrichment.js` (enrichment orchestration)

### Files to Modify
- `js/storage/indexeddb.js` (add metadata stores)
- UI components for displaying metadata

### Success Criteria
- Tracks show BPM, key, danceability, energy
- Data persists locally (API not called repeatedly)
- Premium gate enforced

---

## Phase 13: AI Playlist Curator

**Goal:** Natural language to playlist generation.

### Tasks

1. Design prompt template for "vibe → playlist" conversion
2. Create curator service that:
   - Accepts natural language description
   - Queries local embeddings for matching tracks
   - Ranks and filters results
   - Returns ordered playlist
3. Integrate with chat interface
4. Add "Create Playlist" button to chat responses
5. Test with various vibe descriptions

### Files to Create
- `js/services/ai-curator.js`

### Files to Modify
- `js/chat.js` (add curator integration)
- `js/functions/executors/playlist-executors.js` (add curator function)

### Success Criteria
- User can type "songs for a rainy Sunday" and get a playlist
- Playlist is actually relevant to the description
- Works offline after initial embeddings

---

## Phase 14: Launch Preparation

**Goal:** Production-ready deployment and beta user onboarding.

### Tasks

#### OG Tags Implementation
- Add dynamic OG meta tags to index.html
- Generate share preview images
- Test on Twitter, LinkedIn, Facebook

#### Production Deployment
- Deploy to Vercel (configs exist)
- Configure COOP/COEP headers
- Test SharedArrayBuffer in production
- Set up custom domain

#### Beta User Onboarding
- Create onboarding flow
- Set up feedback collection
- Prepare 20 beta user invites

### Files to Modify
- `index.html` (add OG tags)
- `vercel.json` (verify configuration)

### Success Criteria
- Social sharing shows rich previews
- App works in production with SharedArrayBuffer
- 20 beta users onboarded

---

## Progress

| Phase | Status | Plans | Progress |
|-------|--------|-------|----------|
| 1-8 | ✓ | 8 | 100% (MVP complete) |
| 9 | ✓ | - | 100% (Security complete) |
| 10 | ○ | 0 | 0% (Not started) |
| 11 | ○ | 0 | 0% (Not started) |
| 12 | ○ | 0 | 0% (Not started) |
| 13 | ○ | 0 | 0% (Not started) |
| 14 | ○ | 0 | 0% (Not started) |

---

## Two-Tier Pricing Model

### The Sovereign (Free)
- 100% Local analysis
- BYOI chat (Ollama/Gemini keys)
- Basic personality cards
- 1 free playlist trial
- Shareable insights

**Purpose:** Loss leader to build community and validate PMF.

### The Chamber ($4.99/mo or $39/yr)
- Unlimited playlist generation
- Metadata enrichment (BPM, key, audio features)
- Semantic search with embeddings
- AI playlist curator
- Monthly insights (post-MVP)

**Purpose:** Recurring revenue for sustainable operations.

---

## Why Lemon Squeezy?

| Feature | Stripe | Lemon Squeezy |
|---------|--------|---------------|
| Checkout | Redirects to external | Overlay in your app |
| License Keys | Build yourself | Built-in |
| Backend | Required | Optional (crypto fallback) |
| Tax | You implement | Merchant of Record |
| Complexity | Higher | Lower (~100 LOC) |

---

## Next Milestone

After v1.0 Premium Launch:

**v1.1** — Chamber tier advanced features
- E2EE multi-device sync
- Chamber Portal web hosting
- Weekly insight emails

---

## Documentation

| Document | Description |
|----------|-------------|
| [Premium Pricing Model](../docs/pricing-two-tier-model.md) | Two-tier pricing details |
| [Lemon Squeezy Setup](../docs/LEMON_SQUEEZY_SETUP.md) | Configuration guide |
| [Pricing Implementation](../docs/pricing-implementation-summary.md) | Implementation details |

---
*Roadmap created: 2025-01-24*
*Updated: 2025-01-24 - Reset for premium launch, archived security phases 9-14*
