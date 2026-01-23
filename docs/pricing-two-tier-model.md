# Premium Pricing Model

## Overview

Rhythm Chamber uses a two-tier premium model that separates **Privacy & Growth** from **Premium Features**. This model aligns with the zero-backend architecture and provides a clear upgrade path for users who want advanced features.

## The Two Tiers

### Tier 1: The Sovereign (Free)
**Focus:** Privacy & Viral Growth

**Cost:** $0

**Features:**
- 100% Local analysis (BYOI chat with Ollama/Gemini keys)
- Basic personality cards
- Full data parsing and pattern detection
- Demo mode for instant evaluation
- **1 free playlist** to try AI curation
- Shareable insights

**Infrastructure:** Client-side only (zero backend)

**Purpose:**
- Loss leader to build community
- Validate product-market fit
- Zero server costs
- Viral growth through shareable cards

**Why it works:**
- Zero risk entry
- Builds trust through transparency
- Generates organic marketing via shared cards
- Creates pool of potential Chamber users

---

### Tier 2: The Chamber ($4.99/mo or $39/yr)
**Focus:** Advanced Analytics & Convenience

**Cost:** $4.99/month OR $39/year (≈35% discount)

**Features:**
- **Unlimited Playlists:** AI-curate mood, era, and time machine playlists
- **Metadata Enrichment:** Fetch BPM, Key, Danceability, Energy from Spotify API
- **Semantic Search:** Vibe-based queries using local embeddings
- **AI Playlist Curator:** Describe any mood, get a perfect playlist
- **Monthly Insights:** AI-generated digests of listening patterns (coming soon)

**Infrastructure:** Client-side only (still zero backend)

**Why Lemon Squeezy?**
- **Overlay checkout** stays in your app (no page redirects)
- **Built-in license keys** with activation/validation API
- **No backend required** - Crypto fallback for offline validation
- **Merchant of Record** - Handles global tax/VAT automatically
- **Instant activation** - License key delivered immediately after purchase

**Purpose:**
- Recurring revenue for sustainable operations
- Monetize convenience and advanced analytics
- Cover infrastructure costs (API usage, storage)

**Why it works:**
- Competitive with music analysis apps (stats.fm, Last.fm)
- Appeals to power users who want deeper insights
- Monthly emails create habit formation
- Overlay checkout provides frictionless experience

**Target Audience:**
- Music enthusiasts who want unlimited playlist generation
- Users wanting semantic/vibe-based search
- Data nerds who want BPM, key, and audio features
- Users who value their time and want AI-powered insights

---

## Premium Feature Gates

| Feature | Sovereign (Free) | Chamber (Premium) | Rationale |
|---------|----------------|-------------------|-----------|
| Full local analysis | ✅ | ✅ | Core product value |
| BYOI chat (local/cloud) | ✅ | ✅ | Bring your own intelligence |
| Basic personality cards | ✅ | ✅ | Shareable insights |
| Pattern detection | ✅ | ✅ | Core analytics |
| Semantic search | ❌ | ✅ | WASM embeddings, premium value |
| Playlist generation | 1 free | Unlimited | Quota-limited trial |
| Metadata enrichment | Static only | Full + Audio features | API costs |
| AI playlist curator | ❌ | ✅ | Advanced AI feature |

---

## User Flow

### Sovereign (Free) Experience

```
User uploads data → Personality Reveal → Try 1 playlist → See premium prompt
```

### Premium Upgrade Flow (Lemon Squeezy Overlay)

```
User clicks "Upgrade" → Lemon Squeezy overlay appears IN YOUR APP
  → User enters payment info (~60 seconds)
  → Checkout.Success event fires
  → License key auto-extracted and validated
  → Premium features unlocked instantly
  → Overlay closes - user never leaves your app
```

---

## Payment Integration: Lemon Squeezy

### Why Lemon Squeezy?

| Feature | Stripe | Lemon Squeezy |
|---------|--------|----------------|
| **Checkout Experience** | Redirects to external page | Overlay stays in your app |
| **License Keys** | Build yourself | Built-in + generation API |
| **Backend Required** | Yes (for secure validation) | Optional (crypto fallback) |
| **Tax Handling** | You implement each country | Merchant of Record (automatic) |
| **Complexity** | Higher | Lower (~100 lines of code) |

### Technical Implementation

**Files:**
- `js/services/lemon-squeezy-service.js` - Checkout, validation, crypto fallback
- `workers/license-validator/index.js` - Cloudflare Worker for secure API proxy
- `upgrade.html` - Overlay checkout integration

**Setup:**
1. Create store in Lemon Squeezy Dashboard
2. Create variants (monthly, yearly) with license key generation
3. Deploy Cloudflare Worker (wrangler) for secure validation
4. Configure variant IDs in app config

**Validation Methods:**
1. **Cloudflare Worker** (Recommended) - Secure API proxy, hides API key
2. **Direct API** (Not Recommended) - Exposes API key in client code
3. **Crypto Fallback** (Offline) - HMAC-SHA256 validation, no server needed

---

## Revenue Model

### Pricing Strategy

| Option | Price | Effective Monthly | User Savings |
|--------|-------|------------------|--------------|
| Monthly | $4.99/mo | $4.99 | - |
| Yearly | $39/yr | $3.25/mo | 35% |
| Lifetime | (Future) | (One-time) | - |

### Revenue Projections (Year 1)

| Scenario | Users | Monthly | Annual |
|----------|-------|--------|--------|
| Conservative (5% convert) | 100 | $499 | $3,900 |
| Moderate (10% convert) | 200 | $998 | $7,800 |
| Optimistic (20% convert) | 400 | $1,996 | $15,600 |

### Break-even Analysis

- **Break-even:** ~100 monthly users covers API costs and infrastructure
- **Security Audit Goal:** 250-500 users ($15-30k) funds external security audit

---

## License Key System

### Key Features

- **Format:** UUID (e.g., `38b1460a-5104-4067-a91d-77b872934d51`)
- **Activation Limit:** 3 devices per key
- **Validation:** Via Cloudflare Worker (secure) or crypto (offline)
- **Storage:** Only SHA-256 hash stored locally (never raw key)

### Validation Flow

```
1. Purchase complete → Lemon Squeezy generates license key
2. Checkout.Success event → Key extracted from event data
3. Validation → Cloudflare Worker calls Lemon Squeezy API
4. Storage → Hashed license key stored in localStorage
5. Features Unlocked → App checks license on feature access
```

### Security Notes

- **Never store raw license keys** - Only store SHA-256 hashes
- **Device binding** - 3-device activation limit prevents key sharing
- **Periodic revalidation** - 30-day cache on validation results
- **Graceful degradation** - Offline crypto fallback when worker unavailable

---

## Documentation

| Document | Description |
|----------|-------------|
| [Lemon Squeezy Setup Guide](LEMON_SQUEEZY_SETUP.md) | Configuration and deployment |
| [Pricing Implementation Summary](pricing-implementation-summary.md) | Implementation details |

---

## Success Metrics

### Conversion Goals
- **Free to Premium:** 5-10% within 90 days
- **Feature Usage:** Playlists used by 60%+ of premium users
- **Churn Rate:** <5% monthly (industry standard)

### Overall
- **Free tier growth:** 1,000+ users within 6 months
- **Viral coefficient:** >1.0 (each user brings >1 new user)
- **Security audit:** Commissioned within 6-9 months of launch

---

## Conclusion

The two-tier model aligns with:
- **Zero-backend philosophy** - Client-side validation with optional worker proxy
- **User experience** - In-app overlay checkout (no page redirects)
- **Technical simplicity** - ~100 lines of client code vs complex Stripe integration
- **Financial sustainability** - Recurring revenue covers infrastructure and development

**Key Differentiators:**
- Privacy-first positioning (Sovereign tier always free)
- In-app upgrade experience (Lemon Squeezy overlay)
- Zero-backend architecture (no server infrastructure for payment validation)
- Developer-friendly (Cloudflare Worker = free tier covers most use cases)

---

**Document Version:** 2.0
**Last Updated:** 2025-01-23
**Changes:** Migrated from three-pillar to two-tier model, added Lemon Squeezy integration
