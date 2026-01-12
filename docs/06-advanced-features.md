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

## The BYOK Advantage (v2)

### Why Power Users Want Control

**Privacy-conscious users:**
- Already exporting data
- Understand data sovereignty
- Won't trust cloud-only services

**Technical users:**
- Know what API keys are
- Appreciate transparency
- Want to inspect the code

**Sovereignty-focused users:**
- Willing to pay for their own infrastructure
- Don't want vendor lock-in
- Prefer open standards

### Implementation

**Bring Your Own Keys:**
- OpenRouter API key (for LLM)
- Qdrant cluster URL + API key (for semantic search)
- Optional: Local Ollama endpoint

**This is a feature, not a bug.** For our target audience, control is the selling point.

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

1. **Care about privacy** → Local-first, BYOK
2. **Want control** → Transparent, open-source
3. **Value depth** → Semantic search, personality types
4. **Understand tech** → API keys, self-hosting

**Stats.fm is for casual users who want charts. Rhythm Chamber is for power users who want understanding.**
