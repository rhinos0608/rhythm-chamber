# Product Vision

## The Insight

**Chat with your Spotify data—the way ChatGPT can't.**

Your complete listening history is too big for ChatGPT. We handle it locally, with privacy, semantic search, and accurate data queries. Upload your Spotify export and ask questions like:

- "What was I listening to during my breakup in March?"
- "How did my taste change after college?"
- "When did I stop listening to The National, and why?"

Plus: Get your listener personality type based on actual patterns in your data.

---

## The Product

**Chat-first analysis, not charts:**
- Natural language queries ("What was I like in 2019?")
- Semantic search across your entire history
- Personality types based on behavioral patterns, not play counts
- Zero-backend architecture—your data never leaves your device

> [!IMPORTANT]
> **Core positioning:** We don't show you stats. We help you understand yourself.

---

## Music Personality Types

| Type | Description | Evidence |
|------|-------------|----------|
| **Emotional Archaeologist** | Uses music to process past events | Distinct eras, high repeat, sudden shifts |
| **Mood Engineer** | Strategically uses music to change state | Morning vs evening patterns, mood searching |
| **Discovery Junkie** | Constantly seeking new artists | High unique count, low plays-per-artist |
| **Comfort Curator** | Small rotation of beloved songs | Same 200 songs for years, slow change |
| **Social Chameleon** | Listening shifts by context | Weekday ≠ weekend patterns |

**Not Myers-Briggs.** These compete with stats.fm's generic charts by telling you *who you are* through your music.

---

## First Insight Example

**Stats.fm shows:**
> "You listened to 12,847 hours since 2016"

**Rhythm Chamber shows:**
> 🎵 Your Music Personality: "The Emotional Archaeologist"
>
> You don't just listen to music—you use it to process feelings.
> Your patterns show distinct "emotional eras":
> - Spring 2020: Heavy rotation of sad songs (grief processing)
> - Summer 2022: Explosion of new artists (rebuilding phase)
>
> You mark time through sound. Want to explore what each era meant?

---

## Competitive Position

| Stats.fm | Rhythm Chamber |
|----------|----------------|
| **WHAT** | **WHY & WHO** |
| "You listened to X hours" | "You're a Mood Engineer because..." |
| Charts & graphs | Identity & meaning |
| Full history + real-time | Full history only |
| Low technical barrier (OAuth) | Medium (file upload OR OAuth) |
| Click to explore | Ask questions naturally |

**We're not competing for stats nerds.** We're competing for everyone who screenshots Wrapped and wants deeper self-understanding.

---

## The BYOK Advantage

**Bring Your Own Keys—this is a feature, not a bug:**

Power users WANT control:
- **Privacy-conscious**: Already exporting data, understand data sovereignty
- **Technical**: Know what API keys are, appreciate transparency
- **Sovereignty**: Willing to pay for their own infrastructure
- **No black box**: They control the AI, we provide the interface

**Zero-backend architecture is our moat:**
- Stats.fm needs servers → must monetize → controls your data
- Rhythm Chamber: "Your data never leaves your device, runs in your browser, you control everything"

For the quantified-self crowd, this is hugely compelling.

---

## Monetization

| Tier | Price | What You Get |
|------|-------|--------------|
| **Free** | $0 | Full local analysis, BYOK chat, basic cards, personality reveal |
| **Supporter** | **$19 Lifetime** | CLI tool, premium themes, "Verified" badge, friend compare JSON import |
| **Patron** | $7/month | Dev Discord access, roadmap voting, early beta features |

### Why This Works
- **Psychology**: $19 is a "no-brainer" impulse buy for developers who find the tool useful
- **CLI Version**: Killer feature for power users who want scripting capabilities
- **Zero-Backend**: No payment processing infrastructure needed
- **Viral Loop**: "Compare with Friend" via JSON exchange keeps data private
- **BYOK Model**: Appeals to privacy-conscious power users who want control

### Patreon Integration Strategy
- **One Codebase**: All features in main app, unlocked with license key
- **No Maintenance Nightmare**: No separate codebases to sync
- **Hacker-Resistant**: It's okay if people bypass - they weren't going to pay anyway
- **Supporter Key**: Static key given to Patreon supporters

### Feature Implementation
- **CLI Version**: Wraps existing `js/parser.js` and `js/data-query.js` in Node.js
- **Themes**: CSS-based, unlocked via license key in `js/settings.js`
- **Badges**: Canvas-based visual elements on shareable cards
- **Friend Compare**: Local JSON export/import, zero backend
- **Patreon Perks**: Discord access, voting rights, early access

---

## Target Audience

**Old framing:** Stats nerds who export data (~5M)

**New framing:** Everyone who screenshots Wrapped (~100M+) + quantified-self enthusiasts

The data export friction is real, but the payoff is self-discovery, not just stats.
