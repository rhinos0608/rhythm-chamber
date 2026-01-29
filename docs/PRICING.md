# Rhythm Chamber Pricing & Premium Features

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

## Premium Features

### Spotify Integration

Connect your Spotify account for automatic data import:

1. Click "Connect with Spotify"
2. Authorize via OAuth (PKCE flow)
3. Select analysis mode (Full or Quick Snapshot)
4. Data imported locally - never sent to external servers

### Cloud AI Access

Use OpenRouter for advanced AI capabilities:

- **GPT-4**, **Claude**, and other models available
- Bring your own API key
- Token counting and budget management
- Automatic fallback to local AI

### AI-Generated Profiles

Let AI create rich, personalized music narratives:

- Personality analysis based on listening patterns
- Era detection and musical evolution
- Mood and atmosphere profiling
- Comparative analysis (year-over-year)

### Artifact Visualizations

Beautiful, interactive data visualizations:

- Listening timelines and heatmaps
- Trend analysis charts
- Period comparisons
- Exportable formats

## License Management

### Activating Your License

1. Purchase from [Lemon Squeezy](https://www.lemonsqueezy.com)
2. Copy your license key
3. Paste in the app's license activation screen
4. Features unlock immediately (no restart required)

### License Verification

The app verifies licenses via:
1. Lemon Squeezy API validation
2. Local encrypted storage
3. Periodic re-validation (every 30 days)
4. Grace period for offline use

**Security:** License keys are stored locally using AES-GCM encryption. No personal data is transmitted.

### Implementation Notes

**Architecture Decisions:**
- Client-side validation only (no backend dependency)
- Encrypted local storage for license keys
- Offline-friendly with 30-day grace period
- Automatic fallback to free tier if license expires

**Technical Details:**
- License validation happens at app initialization
- Premium features check license status before activation
- Graceful degradation if license becomes invalid
- No data loss when license expires (features lock, not data)

---

**Last Updated:** 2026-01-29
**For implementation details:** See [CONTRIBUTING.md](../CONTRIBUTING.md)
