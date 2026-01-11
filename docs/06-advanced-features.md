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
