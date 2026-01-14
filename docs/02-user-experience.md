# User Experience

## Chat-First Onboarding

```mermaid
flowchart TD
    A["Landing: 'Chat with your Spotify data'"] --> B{Choose path}
    B -->|Instant| C[Connect Spotify OAuth]
    B -->|Full depth| D[Upload data export]
    C --> E["Lite Profile: Current vibe (50 songs)"]
    E --> F[Chat with limited context]
    F --> G["Upsell: For full history, upload data"]
    G --> D
    D --> H[Wait 5-30 days]
    H --> I[Upload .zip]
    I --> J[Full Personality Reveal]
    J --> K[Chat with full context + semantic search]
    K --> L[Share Card]
```

**Key shift:** Chat is the primary interface, not a dashboard. Users ask questions naturally.

---

## Path 0: Demo (Immediate, Sample Data)

- Loads the pre-built "Emo Teen" persona with full streams/patterns/personality
- Demo data is isolated in `AppState.demo` so nothing leaks into real uploads
- Demo badge + exit CTA keep users oriented
- Chat suggestions swap to demo-specific prompts to showcase depth instantly

Use case: let users feel the reveal and chat quality without OAuth or upload friction.

---

## Path A: Lite (Instant)

**Spotify OAuth gives us:**
- Last 50 recently played tracks
- Top artists (4 weeks / 6 months / all time)

**We generate:**
- Current vibe snapshot
- Exploring vs. repeating pattern
- Soft upsell in every chat response

**What we CAN'T show:**
- Era detection, ghosted artists, life events, skip patterns

```
🎵 Your Current Vibe

Right now you're deep in:
• Radiohead • The National • Bon Iver

This is a snapshot. For your full emotional 
eras — the eras, the ghosts, the patterns — 
upload your complete data.
```

---

## Path B: Full (Patient)

1. Request data from Spotify
2. Wait 5-30 days
3. Upload .zip
4. Full personality reveal + semantic search

**New capability:** Semantic search across your entire history

```
You: "What was I listening to during my breakup in March 2020?"

System: "In March 2020, you played The National's 'I Need My Girl' 
127 times, mostly between 2-4am. Before that, you hadn't played 
it since 2018. This matches your 'Emotional Archaeologist' pattern."
```

---

## UX Philosophy: Chat-First Design

> ChatGPT works because you ask what you want.
> We apply that to your personal data.

### Zero-Choice Consumption

**Aggressively resist:**
- ❌ Filters
- ❌ Sliders
- ❌ "Show me more like this"
- ❌ Settings that affect content

**Instead:**
- ✅ One insight in feed (optional, 0-3x/week)
- ✅ Chat interface for exploration
- ✅ Natural language queries

### Progressive Reveal

- Week 1: "You've been avoiding high-energy music."
- Week 2: "Still in the quiet zone."
- Week 3: "Three weeks of soft listening. Something settling?"

**Recognition is the reward.** Don't explain it away.

> [!IMPORTANT]
> **Zero insights in a week is valid.** Silence is part of the product language.
> Returning `None` is a feature. Forced "notability" causes pattern hallucination.

### Monetization Integration

#### Phase 1: Sovereign Community (Zero Cost to User)
- **Free users**: Full chat experience with free models, BYOI, 100% local
- **Supporters**: $19 Lifetime - Unlock PKM Export + Relationship Compatibility Reports
  - **Purpose**: Funds external security audit & cloud infrastructure
- **Transparency**: "Your $19 funds our security partnership"
- **Patrons**: $7/month - Community access + early features
- **No paywalls**: Personality reveal always free, builds trust

#### Phase 2: Managed Cloud & AI (Trust-First Launch)
- **Cloud Sync**: $50 lifetime + $10/month OR $15/month
- **Features**: Multi-device sync, encrypted backup, managed AI setup
- **Trust Signal**: "Secured by [External Firm]" badge
- **Trigger**: Only after ~250-1,000 Supporters + security audit complete
- **Architecture**: Hybrid (server-side DB + client-side E2EE)
- **Two Points of Failure**: Users can switch between local and cloud modes
- **Never Deprecate Local**: Free tier remains functional forever

---

## Insight Tone

| ❌ Don't | ✅ Do |
|----------|------|
| "You listened to 847 songs, up 12%" | "Heavier listening lately." |
| "Skip rate 47%, suggesting..." | "You keep starting songs but not finishing them." |
| "Based on your patterns..." | "You've been looking for something." |

**Short. Evocative. Incomplete.** User finishes the thought.

---

## First Insight (The Reveal)

```
🎵 Your Music Personality: "The Emotional Archaeologist"

You don't just listen to music — you use it to process feelings.
Your patterns show distinct "emotional eras":
• Spring 2020: Same 30 songs on repeat
• Summer 2022: Explosion of new artists

You mark time through sound.

[Share this ↗]  [Explore in chat →]
```

---

## Chat Interface

```
┌─────────────────────────────────────────────┐
│  Rhythm Chamber                    [⚙️] [↗] │
├─────────────────────────────────────────────┤
│  🎵 You're "The Emotional Archaeologist"    │
│  [Verified] ← Supporter badge               │
│                                             │
│  What do you want to explore?               │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ Type your question...        [Send] │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  💭 Try: "What was I like in 2019?"         │
│  💭 Try: "Show me my breakup music"         │
│  💭 Try: "When did I discover new artists?" │
│                                             │
│  [PKM Export Available] ← Supporter feature │
│  [Friend Compare Available] ← Supporter     │
└─────────────────────────────────────────────┘
```

### Chat Controls
- **Regenerate**: For when the insight didn't land.
- **Edit**: To refine the question without typing it all again.
- **Delete**: To curate the conversation history.
- **Export Chat**: Supporter feature - save conversations locally

**Chat = active exploration. Feed = ambient awareness.**

## Profile Synthesizer UX

- Users can ask, "Create a profile for my marathon training friend" → LLM calls `synthesize_profile` to build synthetic streams/patterns/personality.
- Template search functions (`get_templates_by_genre/personality/pattern`) let chat surface curated personas for comparison.
- Synthesized profiles are saved locally (ProfileStorage) so users can revisit, compare, or delete without touching real data.
- Works alongside demo mode: try synthesis before ever uploading personal data.

---

## Shareable Cards (Viral Loop)

```
┌─────────────────────────────────────┐
│   🎵 Your Music Personality 🎵      │
│                                     │
│    "The Emotional Archaeologist"    │
│                                     │
│  You mark time through sound.       │
│  Your library is a scrapbook.       │
│                                     │
│  [Discover yours at RhythmChamber]  │
└─────────────────────────────────────┘
```

**Supporter Features on Cards:**
- Premium theme styling (FREE for all - dropped paid themes)
- "Verified" badge (if supporter)
- Custom backgrounds
- Enhanced visual design

**Friend Compare Flow:**
1. User A exports profile as JSON
2. Shares via Discord/Signal (zero backend)
3. User B imports JSON
4. App runs local comparison
5. Shows: "You and Alex both have 'Emotional Archaeologist' patterns"

---

## What's NOT in MVP

- Dashboard
- Mood logging
- PDF reports
- Apple Music
- **Cloud sync**: Phase 2 (Market Signal Triggered)
- **CLI Tool**: Made open source/free (dropped from paid tier)
- **Premium Themes**: Kept free for all users

## Monetization Features

### Phase 1: Sovereign Community (Zero Cost to User)

#### Free Tier ($0)
- **Full Local Analysis**: Complete personality engine and pattern detection
- **BYOI Chat**: Bring your own intelligence—local models or your own API keys
- **Basic Cards**: Shareable personality cards
- **100% Client-Side**: Zero server costs, maximum privacy
- **Premium Themes**: Dark, Cyberpunk, Minimal styles (FREE for all)
- **Purpose**: Loss leader to build community and validate product

#### Supporter Tier ($19 Lifetime) - Seed Capital
- **Obsidian/Notion Export**: Generates folder of Markdown files with proper interlinking
  - One file per Artist, Month, and Era
  - Example: [[The National]] links to [[Sad Dad Era]] and [[March 2019]]
- **Relationship Compatibility Reports**: Upload friend's data to generate insights
  - Example: "You and Sarah have 84% overlap in 'Melancholy' but divergent 'Energy' curves in 2021. Your common anthem is 'Bloodbuzz Ohio'."
- **Verified Badge**: Visual indicator on shareable cards
- **Purpose**: Funds external security audit & cloud infrastructure
- **Transparency**: "Your $19 funds our security partnership"
- **KPI**: Need ~250-1,000 Supporters to fund Phase 2

#### Patreon Tier ($7/month) - Community
- **Dev Discord**: Community access and support
- **Roadmap Voting**: Influence feature priorities
- **Early Beta Access**: Try new features before release
- **Priority Support**: Faster response times
- **Purpose**: Sustainable community funding

### Phase 2: Managed Cloud & AI (Trust-First Launch)

#### Cloud Sync Tier ($50 Lifetime + $10/month OR $15/month)
- **Multi-device Chat Sync**: Sync sessions across desktop/mobile
- **Encrypted Cloud Backup**: E2EE storage of conversation history
- **Managed AI Setup**: Pre-configured embeddings & API integration
- **Security Signatures**: EV Code Signing + Apple notarization
- **Hybrid Architecture**: Optional server-side layer alongside local-first core
- **Two Points of Failure**: Users can switch between local and cloud modes
- **Trust Signal**: "Secured by [External Firm]" badge
- **Trigger**: Only after security audit complete and KPI met

### Implementation Strategy
- **One Codebase**: All features in main app, unlocked with license key
- **No Separate Versions**: Avoids maintenance nightmare
- **Hacker-Resistant**: Accept bypassing, target supporters who want to pay
- **Transparency**: Explicitly state revenue purpose
- **Never Deprecate Local**: Free tier remains functional forever
- **Phase 2 Trigger**: Only after ~250-1,000 Supporters + security audit
- **Revenue Allocation**: Supporter funds go directly to security audit
- **Ongoing Costs**: $10/month covers API/embedding costs with margin
- **Lifetime Protection**: Separates access fee from compute costs
