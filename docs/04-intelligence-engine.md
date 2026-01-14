# Intelligence Engine

## Overview

The personality type reveal is the core product moment. This doc covers detection algorithms, life event patterns, duration-based behavioral analysis, and **semantic search capabilities** that differentiate us from stats.fm's static charts.

---

## Personality Types

| Type | Signal | Why It's Compelling |
|------|--------|---------------------|
| **Emotional Archaeologist** | Distinct eras + high repeat + genre shifts | "You mark time through sound" |
| **Mood Engineer** | Time-of-day patterns + mood searching | "You strategically use music to change state" |
| **Discovery Junkie** | Low plays-per-artist + high unique count | "Constantly seeking new territory" |
| **Comfort Curator** | Same songs for years + slow to change | "Knows exactly what they love" |
| **Social Chameleon** | Weekday ≠ weekend patterns | "Music adapts to context" |

**Not Myers-Briggs.** These compete with stats.fm's generic charts by telling you *who you are* through your music.

---

## Duration-Based Metrics (The Moat)

We don't just count plays—we analyze engagement.

| Behavior | Pattern | Insight |
|----------|---------|---------|
| Skip at 0:15 | Wrong vibe | Searching for feeling |
| Skip at 2:47 of 3:30 | Don't like ending | Partial attachment |
| Play 3x in a row | Emotional moment | Deep resonance |
| High plays, low completion | Background music | Not actually a favorite |

### True Favorites Detection

```python
def detect_true_favorites(streams):
    """Top by plays ≠ top by engagement"""
    top_by_plays = Counter(s['artist_name'] for s in streams).most_common(1)[0][0]
    
    # By completion rate
    by_artist = defaultdict(list)
    for s in streams:
        completion = s['ms_played'] / s.get('track_duration_ms', s['ms_played'])
        by_artist[s['artist_name']].append(min(completion, 1.0))
    
    avg_completion = {a: sum(rates)/len(rates) for a, rates in by_artist.items() if len(rates) > 20}
    top_by_engagement = max(avg_completion, key=avg_completion.get)
    
    if top_by_plays != top_by_engagement:
        return f"You play {top_by_plays} the most, but you're way more engaged with {top_by_engagement}."
```

### Mood Search Detection

```python
def detect_mood_searching(streams):
    """5+ skips in 10 minutes = emotional regulation attempt"""
    skip_clusters = []
    for i in range(len(streams) - 5):
        window = streams[i:i+5]
        time_span = (window[-1]['played_at'] - window[0]['played_at']).seconds
        if time_span < 600:  # 10 min
            skips = sum(1 for s in window if s['ms_played'] < 30000)
            if skips >= 4:
                skip_clusters.append(window[0]['played_at'])
    return skip_clusters
```

---

## Detection Signals

### Comfort vs. Discovery Ratio

```python
plays_per_artist = total_plays / unique_artists
# > 50 = comfort curator
# < 10 = discovery junkie
```

### Era Detection

Distinct periods where top artists changed dramatically (< 40% overlap week-over-week).

### Time-of-Day Patterns

Morning vs evening artist overlap < 30% = mood engineer signal.

### Weekday vs Weekend

Weekday vs weekend artist overlap < 40% = social chameleon signal.

---

## Scoring Algorithm

```python
def classify_personality(streams):
    scores = {type: 0 for type in TYPES}
    
    ratio = calc_comfort_discovery_ratio(streams)
    if ratio > 50: scores['comfort_curator'] += 3
    elif ratio < 10: scores['discovery_junkie'] += 3
    
    if len(detect_eras(streams)) >= 3:
        scores['emotional_archaeologist'] += 3
    
    if detect_time_patterns(streams)['is_mood_engineer']:
        scores['mood_engineer'] += 3
    
    if detect_social_patterns(streams)['is_social_chameleon']:
        scores['social_chameleon'] += 2
    
    return max(scores, key=scores.get)
```

### Transparency & Explainability

We show the user *why* they got a specific result using a point-based breakdown.

**Evidence Generation:**
Each test (Comfort Ratio, Eras, etc.) returns:
- **Points**: How much it contributes to a personality type (e.g., +3).
- **Label**: Human-readable explanation (e.g., "Comfort ratio: 65 plays/artist").

This `breakdown` array is passed to the UI to generate the "How did we detect this?" explainer, ensuring the user sees exactly what behaviors led to their classification.

---

## Life Event Detection

The AI doesn't just analyze—it **notices and asks**.

### Detection Patterns (MVP - No API)

| Pattern | Signal | Confidence |
|---------|--------|------------|
| **Ghosted Favorite** | 100+ plays → 0 plays for 1 year | ✅ High |
| **Discovery Explosion** | 3x normal new artist rate | ✅ High |
| **Schedule Change** | Peak hours shift 4+ hours | ✅ High |
| **Mood Searching** | 5+ skips in 10 minutes | ✅ High |

### Detection Patterns (v2 - Needs API)

| Pattern | Signal | Requires |
|---------|--------|----------|
| Workout Drop-Off | High-energy at 6am → stop | Audio features API |
| Breakup Signature | Sad music + high repeat + skip | Valence/mood API |
| Emotional Eras | Genre-based shifts | Genre data |

### Pattern Code Examples

**Ghosted Favorite:**
```python
def detect_ghosted_artist(streams):
    for artist, timeline in build_artist_timelines(streams).items():
        if timeline['peak_plays'] > 100:
            days_since = (now() - timeline['last_played']).days
            if days_since > 365 and timeline['decline'] == 'cliff':
                return f"You used to be obsessed with {artist}. Then you just... stopped. What happened?"
```

**Discovery Explosion:**
```python
def detect_exploration_burst(streams):
    by_month = chunk_by_month(streams)
    baseline = median_new_artist_rate(by_month)
    for month in by_month:
        if month['new_artist_rate'] > baseline * 3:
            return f"In {month['name']}, you discovered {month['unique_artists']} new artists. What opened you up?"
```

---

## Conversational Framework

| ❌ Don't | ✅ Do |
|----------|------|
| "Analysis shows workout music decreased 87%" | "You were hitting the gym, then stopped" |
| "Your breakup in June caused sad music" | "June you went deep on heartbreak songs. Want to talk about it?" |
| State facts | Ask questions |
| Assume causes | Invite reflection |

**The Formula:**
```
"You were [doing X consistently]. 
Then it just [stopped/changed]. 
What happened?"
```

---

## Semantic Search: The Data Depth Advantage

### Why ChatGPT Can't Do This

ChatGPT has a context window limit. Your complete listening history is too big. We handle it locally with semantic search.

### How It Works

1. **Chunking**: Your data is broken into meaningful chunks:
   - Monthly summaries (top artists, stats)
   - Artist profiles (history, patterns)
   - Era summaries (emotional periods)

2. **Embeddings**: Each chunk gets a vector representation using OpenRouter's embedding API.

3. **Search**: When you ask a question, we:
   - Generate embedding for your query
   - Search Qdrant for top 3-5 relevant chunks
   - Inject those chunks into the LLM context
   - LLM generates accurate, contextual response

### Example Queries

**Stats.fm:** "March 2020 Top Artists" → Chart
**Rhythm Chamber:** "What was I listening to during my breakup in March 2020?" → Semantic answer

```
You: "What was I listening to during my breakup in March 2020?"

System: "In March 2020, you played The National's 'I Need My Girl' 
127 times, mostly between 2-4am. Before that, you hadn't played 
it since 2018. This matches your 'Emotional Archaeologist' pattern.

You also discovered 23 new artists that month—unusual for you. 
What opened you up during that time?"
```

### Data Depth vs Real-Time

| Stats.fm | Rhythm Chamber |
|----------|----------------|
| Full history + real-time | Full history only |
| "What are you listening to NOW?" | "What did this period mean?" |
| Surface-level trends | Deep behavioral patterns |

**We're not competing on real-time.** We're competing on depth of understanding.

---

## Template Profiles & Profile Synthesizer

- **TemplateProfileStore** ships with 8 curated placeholders for grounding comparisons and chat suggestions.
- **Profile Synthesizer** combines templates (keyword + function-calling selection) to generate synthetic streams, patterns, and personality types with progress feedback.
- **Local storage only**: Synthetic profiles are saved via ProfileStorage and never mix with real uploads.
- **Demo + onboarding support**: Demo mode and early chats can use these synthetic profiles to showcase depth before a user uploads data.

---

## Known Limitations

> [!WARNING]

1. **No track duration in export** — Estimate from max observed `ms_played`
2. **No genre data** — Can't detect "workout" or "sad" music without API
3. **Artist normalization** — "RHCP" ≠ "Red Hot Chili Peppers"
4. **Personality overlap** — Users may score high on multiple types → show primary + secondary

---

## The Competitive Moat

### What Stats.fm Shows
- Charts, graphs, numbers
- "You listened to X hours"
- "Top artists: A, B, C"

### What Rhythm Chamber Shows
- Identity and meaning
- "You're an Emotional Archaeologist"
- "You mark time through sound"
- "What was this era of your life about?"

**The difference:** Stats.fm tells you *what* you listened to. We tell you *why* it matters and *who* you are because of it.

### Why This Can't Be Copied

1. **Zero-backend architecture** — Stats.fm can't match our free tier
2. **BYOI model** — Power users prefer owning their intelligence path (local or cloud)
3. **Chat-first interface** — Natural language > clicking charts
4. **Semantic search** — Deep data queries vs surface stats
5. **Personality types** — Identity badges vs generic charts

**We're not building a better stats.fm. We're building the next evolution of music self-discovery.**
