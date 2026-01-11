# Intelligence Engine

## Overview

The personality type reveal is the core product moment. This doc covers detection algorithms, life event patterns, and duration-based behavioral analysis.

---

## Personality Types

| Type | Signal |
|------|--------|
| **Emotional Archaeologist** | Distinct eras + high repeat + genre shifts |
| **Mood Engineer** | Time-of-day patterns + mood searching |
| **Discovery Junkie** | Low plays-per-artist + high unique count |
| **Comfort Curator** | Same songs for years + slow to change |
| **Social Chameleon** | Weekday ≠ weekend patterns |

---

## Duration-Based Metrics (The Moat)

We don't just count plays — we analyze engagement.

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

The AI doesn't just analyze — it **notices and asks**.

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

## Known Limitations

> [!WARNING]

1. **No track duration in export** — Estimate from max observed `ms_played`
2. **No genre data** — Can't detect "workout" or "sad" music without API
3. **Artist normalization** — "RHCP" ≠ "Red Hot Chili Peppers"
4. **Personality overlap** — Users may score high on multiple types → show primary + secondary
