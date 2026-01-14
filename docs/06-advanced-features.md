# Advanced Features (v2)

## Transparency Features

> "The AI that shows its work."

### View Detection Logic (MVP)

Users can see exactly why they got classified:

```
┌─────────────────────────────────────────┐
│  How We Detected: Mood Engineer         │
├─────────────────────────────────────────┤
│  Signal 1: Time-of-Day Patterns         │
│  Morning vs evening overlap: 23%        │
│  Threshold: 30% → ✅ Strong signal      │
│                                         │
│  Signal 2: Mood Search Clusters         │
│  47 moments of rapid skipping           │
│  → ✅ Strong signal                     │
└─────────────────────────────────────────┘
```

### Show System Prompts (v2)

```
☐ Show system prompts
```

When enabled: user sees exact prompt sent to LLM.

### Allow Prompt Editing (v2)

```
Default: "Be empathetic and ask questions"
User edits: "Be more analytical, less therapy-speak"
```

### Local Model Support (v2)

```
☐ Use local model (bring your own)
  Endpoint: http://localhost:11434
  Model: llama3.1:8b
```

**Why this matters:**
- "Your data never leaves your device"
- Privacy-conscious users want this
- Competitive advantage vs cloud-only

---

## Spotify Audio Features API (v2)

Enables genre-dependent patterns:

| Pattern | Requires |
|---------|----------|
| Workout detection | energy, BPM |
| Breakup signature | valence, mood |
| Emotional eras | genre classification |

```python
# Spotify audio features
GET /audio-features/{track_id}
# Returns: energy, danceability, valence, tempo
```

---

## Proactive Observations (v2)

The AI notices changes and asks about them:

```
"You've been in a 'comfort music' loop the past 2 weeks. 
Usually when you do this, something's up. Everything okay?"
```

**Caution:** High creep factor. Only after trust established.

---

## Real-time Sync (v2)

Instead of one-time export:
- Connect Spotify → get updates as they listen
- Daily/weekly insight notifications
- "Your listening shifted yesterday"

---

## Feature Priority

| Feature | Priority | Requires |
|---------|----------|----------|
| View detection logic | MVP | Nothing |
| Audio features API | v1.1 | Spotify API |
| Show system prompts | v2 | UI work |
| Prompt editing | v2 | Safety review |
| Local model support | v2 | Ollama integration |
| Real-time sync | v2+ | Streaming API |

---

## The BYOI Advantage (v2)

**Bring Your Own Intelligence = you own the compute path:**
- **Privacy-first:** Local/offline models run keyless; cloud keys are optional when premium quality is desired.
- **Transparency:** Users pick the provider (Ollama, LM Studio, OpenRouter) and vector store (local or their Qdrant).
- **Sovereignty:** No lock-in or forced billing; cost and model selection stay with the user.

**Implementation:**
- Local endpoints auto-detected; cloud endpoints require user-provided keys.
- Settings UI + ConfigAPI let users toggle between local and cloud without code changes.
- Consistent BYOI stance across chat, RAG, and synthesizer flows.

---

## Local Model Support (v2)

### Why It Matters

```
You: "Use my local model"
System: "Connecting to llama3.1:8b on localhost:11434"
Result: "Your data never leaves your device"
```

### Supported Models

| Model | Use Case | Setup |
|-------|----------|-------|
| Llama 3.1 8B | General chat | Ollama |
| Mistral 7B | Personality analysis | Ollama |
| CodeLlama | Pattern detection | Ollama |

### Benefits

1. **Privacy**: Zero data transmission
2. **Cost**: No API fees
3. **Speed**: Local inference
4. **Control**: Full transparency

---

## Semantic Search Deep Dive

### Why It's a Competitive Moat

**Stats.fm:** "Search your history" → Filter by date/artist
**Rhythm Chamber:** "What was I listening to during my breakup?" → Semantic understanding

### How It Works

1. **User asks question**
2. **Generate embedding** of question
3. **Search Qdrant** for relevant chunks
4. **Inject context** into LLM
5. **Generate response** with semantic understanding

### Example Queries

```
❌ Stats.fm: "Show me March 2020"
✅ Rhythm Chamber: "What was I like in March 2020?"

❌ Stats.fm: "Top artists: Taylor Swift"
✅ Rhythm Chamber: "Why did I stop listening to Taylor Swift?"

❌ Stats.fm: "Skip rate: 47%"
✅ Rhythm Chamber: "What am I searching for?"
```

### Chunk Strategy

| Chunk Type | Content | Use Case |
|------------|---------|----------|
| Monthly Summary | Top artists, play counts, patterns | Period analysis |
| Artist Profile | Full history, first/last listen | Artist deep-dives |
| Era Summary | Emotional periods, transitions | Life event detection |

---

## Privacy-First Architecture

### Data Flow

```
User's Device
├── Spotify Export (.zip)
├── Parse (Web Worker)
├── Store (IndexedDB)
├── Analyze (Local)
├── Chat (OpenRouter API)
└── Share (Canvas API)

Data never touches our servers.
```

### Security Model

**Client-side only:**
- No backend database
- No server-side processing
- No data collection

**User controls:**
- API keys (encrypted locally)
- Data storage (local/IndexedDB)
- Cloud sync (optional, paid)

### Competitive Advantage

| Service | Data Control | Cost | Privacy |
|---------|--------------|------|---------|
| Stats.fm | They control | $$$ | Cloud storage |
| Rhythm Chamber | You control | $0 | Local-first |

---

## Template Profiles + Profile Synthesizer (v2)

- **Template search functions** (`get_templates_by_*`) surface curated personas for chat comparisons.
- **Profile Synthesizer** mixes templates (keyword/function-calling selection) to generate synthetic streams, patterns, and personality classifications with progress updates.
- **Storage isolation**: Synthesized profiles are saved locally via ProfileStorage and do not mix with user uploads.
- **Onboarding value**: Works with demo mode so users can explore deep analysis before providing real data.

---

## The Power User Pitch

### Why They'll Switch

**Stats.fm user:**
- "I want to understand my patterns better"
- "Charts are boring, I want insights"
- "I don't want my data in the cloud"

**Rhythm Chamber:**
- "Chat with your data naturally"
- "Personality types based on actual patterns"
- "Your data never leaves your device"

### The Conversation

**User:** "Why should I switch from Stats.fm?"
**You:** "Stats.fm shows you what. We show you why and who."
**User:** "But I already have all my data in Stats.fm"
**You:** "Upload it here and ask questions like 'What was I like in 2019?'"
**User:** "Is it secure?"
**You:** "More secure than Stats.fm. Your data stays on your device."

---

## Future Vision (v3+)

### Real-time Insights

```
"Your listening shifted yesterday. You're in a new era."
```

### Social Features (Opt-in)

```
"You and Alex both have 'Emotional Archaeologist' patterns."
```

### Playlist Generation

```
"Based on your breakup pattern, here's a healing playlist."
```

### Life Event Detection

```
"Your listening suggests a major life change in March 2020. Want to explore?"
```

---

## The Bottom Line

**We're not building features for everyone. We're building features for power users who:**

1. **Care about privacy** → Local-first, BYOI (local or your keys)
2. **Want control** → Transparent, open-source
3. **Value depth** → Semantic search, personality types
4. **Understand tech** → API keys, self-hosting

**Stats.fm is for casual users who want charts. Rhythm Chamber is for power users who want understanding.**

---

## New Pricing Strategy Features

### Strategy 1: Knowledge Graph Export (Supporter Tier)

**Feature:** "Export to Obsidian/Notion/Roam"

**What it generates:**
- Folder of Markdown files for every Artist, Month, and Era
- Proper interlinking: `[[The National]]` → `[[Sad Dad Era]]` → `[[March 2019]]`
- Backlinks for relationship mapping
- Metadata tags for easy filtering

**Use cases:**
- **Emotional Archaeologists** can build a personal wiki of their music history
- **Researchers** can cross-reference listening patterns with life events
- **Writers** can use music history as creative prompts
- **Therapists** can use exported data for music therapy sessions

**Technical implementation:**
- Client-side Markdown generation
- Template system for different PKM platforms
- Batch export with progress tracking
- Optional compression for large histories

### Strategy 2: Relationship Resonance Engine (Supporter Tier)

**Feature:** "Deep Comparison Reports"

**Free tier:**
- See your own stats and patterns
- Basic friend comparison (same personality type)

**Supporter tier:**
- Upload friend's JSON export
- Generate compatibility report with specific insights
- Example output: "You and Sarah have 84% overlap in 'Melancholy' but divergent 'Energy' curves in 2021. Your common anthem is 'Bloodbuzz Ohio'."

**Use cases:**
- **Couples** understanding musical compatibility
- **Friends** discovering shared experiences
- **Music groups** analyzing collective patterns
- **Therapists** understanding relationship dynamics through music

**Technical implementation:**
- Local JSON parsing and comparison
- Statistical analysis of pattern overlap
- Natural language report generation
- Privacy-first: all processing client-side

### Strategy 3: Deep Enrichment Mode (Separate Tier)

**Feature:** "Enrichment Mode"

**What it does:**
- Connects to MusicBrainz API for detailed metadata
- Uses AcoustID for audio fingerprinting
- Fetches BPM, Key, Producer Credits, Lyrics
- Creates "Super-Metadata" library

**Unlock features:**
- "Show me my listening habits by Producer instead of Artist"
- "What's the BPM distribution of my breakup music?"
- "Which producers appear most in my comfort songs?"

**Use cases:**
- **Music nerds** wanting deeper analysis
- **Producers** studying their own influences
- **DJs** analyzing energy patterns
- **Researchers** studying production trends

**Technical implementation:**
- Client-side API calls to public databases
- Caching system to avoid rate limits
- Metadata merging with Spotify data
- New visualization types (BPM charts, key distributions)

### Combined Supporter Tier

**Price:** $19 Lifetime

**Includes:**
- ✅ Obsidian/Notion Export (Strategy 1)
- ✅ Relationship Compatibility Reports (Strategy 2)
- ✅ Verified Badge on cards
- ✅ Priority support
- ✅ Early access to new features

**Dropped from paid:**
- ❌ CLI Tool (now open source/free)
- ❌ Premium Themes (free for all users)

**Purpose:** Fund security audit and cloud infrastructure

### Phase 2: Cloud Sync (Separate Tier)

**Price:** $50 Lifetime + $10/month OR $15/month

**Includes:**
- Multi-device chat sync
- Encrypted cloud backup
- Managed AI setup
- External security partnership badge

**Trigger:** Only after 250-1,000 Supporters + security audit

---

## Implementation Notes

### PKM Export Technical Details

**File structure:**
```
rhythm-chamber-export/
├── Artists/
│   ├── The National.md
│   ├── Bon Iver.md
│   └── Radiohead.md
├── Months/
│   ├── 2020-03.md
│   ├── 2020-04.md
│   └── 2022-07.md
├── Eras/
│   ├── Sad Dad Era.md
│   ├── Rebuilding Phase.md
│   └── Discovery Period.md
└── README.md
```

**Markdown format:**
```markdown
# The National

**Total Plays:** 1,247
**First Listen:** March 2018
**Last Listen:** January 2025
**Eras:** [[Sad Dad Era]], [[Rebuilding Phase]]

## Patterns
- High repeat rate (89%)
- Evening preference (73% after 8pm)
- Associated with breakup period

## Related Artists
- [[Bon Iver]] (shared era)
- [[Radiohead]] (similar patterns)
```

### Relationship Report Technical Details

**Comparison algorithm:**
1. Parse both JSON exports
2. Calculate pattern overlap (eras, skip behavior, time-of-day)
3. Identify common artists/tracks
4. Generate statistical insights
5. Create natural language summary

**Output format:**
```
Relationship Compatibility Report: You & Sarah

Overall Compatibility: 78%

Key Similarities:
- 84% overlap in "Melancholy" patterns
- Both show "Emotional Archaeologist" traits
- Shared anthem: "Bloodbuzz Ohio" (played 47x each)

Key Differences:
- Your "Energy" curve peaked in 2021, Sarah's in 2020
- You prefer mornings, Sarah prefers evenings
- Sarah has higher "Discovery Junkie" score

Insights:
Your musical journeys diverged in 2021 but share emotional 
core. Consider exploring Sarah's 2020 playlist for context.
```

### Enrichment Mode Technical Details

**API integration:**
- MusicBrainz: Artist/album metadata
- AcoustID: Audio fingerprinting
- Genius: Lyrics (optional)
- Spotify Audio Features: BPM, key, energy

**Caching strategy:**
- Store enriched data locally
- Rate limit handling (respect API limits)
- Incremental updates (only fetch new tracks)
- Offline mode (use cached data)

**New analytics:**
- Producer analysis: "Jack Antonoff appears in 23% of your library"
- BPM distribution: "Your breakup music averages 85 BPM"
- Key analysis: "You gravitate toward minor keys when sad"
- Energy flow: "Your energy peaks in summer months"

---

## Market Positioning

### Why This Works

**For the Emotional Archaeologist:**
- PKM export turns data into a personal archive
- Relationship reports validate their music-as-memory approach
- Enrichment provides deeper context for their analysis

**For the Discovery Junkie:**
- Enrichment reveals production details they crave
- Relationship reports help find musically compatible friends
- PKM export helps organize their vast library

**For the Power User:**
- All features work locally (privacy)
- Export formats are open standards (longevity)
- No vendor lock-in (can leave anytime)

### Competitive Moat

**Stats.fm can't compete because:**
- They need server infrastructure (cost, privacy concerns)
- They can't offer PKM integration (data leaves their platform)
- They don't do relationship analysis (server-side processing)
- They lack enrichment (API rate limits, cost)

**Rhythm Chamber wins because:**
- Zero-backend = zero infrastructure cost
- Client-side = maximum privacy
- Open formats = user ownership
- Modular = easy to add features

---

## Success Metrics for New Features

### PKM Export Adoption
- Target: 30% of Supporters use export within first month
- Success: Users share exported vaults on social media
- Validation: Positive feedback on interlinking quality

### Relationship Reports
- Target: 50% of Supporters try friend comparison
- Success: Viral loop - one user buys to analyze partner
- Validation: Users report deeper understanding of relationships

### Enrichment Mode
- Target: 20% of Supporters enable enrichment
- Success: Users discover new insights about producers/BPM
- Validation: Requests for additional metadata sources

---

## The Bottom Line

**New pricing strategy creates multiple value propositions:**

1. **Free tier:** Full local analysis, BYOI chat, basic cards
2. **Supporter ($19):** PKM Export + Relationship Reports + Badge
3. **Patron ($7/month):** Community + early access
4. **Cloud Sync ($50+):** Multi-device + managed AI

**This aligns perfectly with the "Sovereignty" angle:**
- Users get "physical" digital copies (PKM export)
- Users control relationship data (local comparison)
- Users choose their level of investment
- No forced subscriptions, no data lock-in

**The viral loop:**
- Free users try demo → love the concept
- One user buys Supporter for relationship insight
- They share report → friend wants their own
- Friend buys Supporter → cycle continues

**Result:** Community growth without server costs, revenue for security audit, and features that power users actually want.
