# User Experience

## Two-Path Onboarding

```mermaid
flowchart TD
    A["Landing: 'What does your music say about you?'"] --> B{Choose path}
    B -->|Instant| C[Connect Spotify OAuth]
    B -->|Full depth| D[Request data export]
    C --> E["Lite Profile: Current vibe (50 songs)"]
    E --> F[Chat with limited context]
    F --> G["Upsell: For full history, upload data"]
    G --> D
    D --> H[Wait 5-30 days]
    H --> I[Upload .zip]
    I --> J[Full Personality Reveal]
    J --> K[Chat with full context]
    K --> L[Share Card]
```

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
history — the eras, the ghosts, the patterns — 
upload your complete data.
```

---

## Path B: Full (Patient)

1. Request data from Spotify
2. Wait 5-30 days
3. Upload .zip
4. Full personality reveal + deep chat

---

## UX Philosophy: Minimal Insight Design

> TikTok works because there's nothing to decide.
> One insight appears. It leaves. Memory does the rest.

### Micro-Insights (0-3x/week)

**Rules:**
- One sentence
- No explanation
- No action required

**Examples:**
```
"Your listening has been circling the same emotional register for three days."
"Still in the quiet zone."
"You keep starting songs but not finishing them."
```

### Progressive Reveal

- Week 1: "You've been avoiding high-energy music."
- Week 2: "Still in the quiet zone."
- Week 3: "Three weeks of soft listening. Something settling?"

**Recognition is the reward.** Don't explain it away.

### Zero-Choice Consumption

**Aggressively resist:**
- ❌ Filters
- ❌ Sliders
- ❌ "Show me more like this"
- ❌ Settings that affect content

One insight appears. It leaves. If they want more, they chat.

> [!IMPORTANT]
> **Zero insights in a week is valid.** Silence is part of the product language.
> Returning `None` is a feature. Forced "notability" causes pattern hallucination.

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
│                                             │
│  What do you want to explore?               │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ Type your question...        [Send] │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  💭 Try: "What was I like in 2019?"         │
└─────────────────────────────────────────────┘
```

**Feed = ambient awareness. Chat = active exploration.**

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

---

## What's NOT in MVP

- Dashboard
- Mood logging
- PDF reports
- Premium tiers
- Apple Music
- Friend comparisons
