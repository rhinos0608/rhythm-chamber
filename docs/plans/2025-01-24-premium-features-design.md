# Premium Features Integration Design

**Date:** 2025-01-24
**Status:** Foundation Design
**Phases:** 11-13 (Semantic Search, Metadata Enrichment, AI Curator)

---

## Overview

Implement soft-gated premium features with one-time quotas for sovereign tier users. Premium (chamber) tier gets unlimited access.

## Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Gate Type | Soft gate with quota | Allows users to try features before upgrading |
| Quota Reset | Manual button in settings | Simplest implementation, user-controlled |
| Communication | Contextual + upgrade modal | Show impact on use, full picture on upgrade |

## Quota Limits (Sovereign Tier)

| Feature | Free Quota | Premium |
|---------|------------|---------|
| Semantic Search | 5 searches | Unlimited |
| Metadata Enrichment | 3 enrichments | Unlimited |
| AI Playlist Curator | 1 playlist | Unlimited |
| Playlist Generation | 1 playlist | Unlimited |

---

## Architecture

### Storage Structure

```javascript
// localStorage: rhythm_chamber_quota
{
  "semantic_search": 0,      // used out of 5
  "metadata_enrichment": 0,  // used out of 3
  "ai_curator": 0,           // used out of 1
  "playlist_generation": 1,  // existing, used out of 1
  "resetDate": "2025-01-24"
}
```

### Quota Check Flow

```
User clicks feature button
    ↓
Check Payments.isPremium()
    ↓ yes → Execute feature (bypass quota)
    ↓ no
Check remaining quota
    ↓ > 0
Decrement quota
Show "X remaining" toast
Execute feature
    ↓ = 0
Show upgrade modal with quota summary
```

---

## Phase 11: Semantic Search Gating

### Changes

**File: `js/rag.js`**
- Change `PREMIUM_RAG_ENABLED = false` → `true`
- Wrap `performSemanticSearch()` with quota check
- Show remaining count on use

**File: `js/services/premium-quota.js`**
- Add `semantic_search` to QUOTA_LIMITS (value: 5)
- Add `checkAndDecrement()` helper
- Add `getRemaining(feature)` helper

### User Messages

- On use: "4 semantic searches remaining"
- Exhausted: "You've used all 5 free semantic searches. Upgrade to The Chamber for unlimited access."

---

## Phase 12: Metadata Enrichment

### New File: `js/services/spotify-metadata.js`

```javascript
// Spotify Web API - Audio Features
// Endpoints:
// - GET /v1/audio-features/{id} → BPM, key, danceability, energy
// - GET /v1/tracks/{id} → album, producer, release date

// Batch enrichment to minimize API calls
// Store results in IndexedDB
```

### Changes

**File: `js/services/premium-quota.js`**
- Add `metadata_enrichment` to QUOTA_LIMITS (value: 3)

**File: `js/controllers/premium-controller.js`**
- Add quota display modal
- Show summary on upgrade page

---

## Phase 13: AI Playlist Curator

### New File: `js/services/ai-curator.js`

```javascript
// Natural language → playlist generation
// Flow:
// 1. Accept user description ("chill rainy day vibes")
// 2. Query local embeddings for semantic matches
// 3. Rank by similarity + audio features (if available)
// 4. Return ordered playlist
```

### Changes

**File: `js/services/premium-quota.js`**
- Add `ai_curator` to QUOTA_LIMITS (value: 1)

**File: `js/chat.js`**
- Add curator function call integration
- Add "Create Playlist" button to chat responses

---

## Files Summary

### New Files
| File | Purpose |
|------|---------|
| `js/services/spotify-metadata.js` | Spotify audio features API |
| `js/services/ai-curator.js` | Natural language → playlist |

### Modified Files
| File | Changes |
|------|---------|
| `js/services/premium-quota.js` | Add new quotas, helpers |
| `js/rag.js` | Enable premium gate, quota checks |
| `js/spotify.js` | Extend with audio features |
| `js/chat.js` | Add curator integration |
| `js/controllers/premium-controller.js` | Add quota modal |
| `upgrade.html` | Add quota summary display |

---

## Implementation Order

1. **Phase 11** - Semantic Search Gating (foundations)
2. **Phase 12** - Metadata Enrichment
3. **Phase 13** - AI Playlist Curator

After these phases: Onboarding tutorial implementation.

---

*Design approved: 2025-01-24*
*Iterative refinement expected during implementation*
