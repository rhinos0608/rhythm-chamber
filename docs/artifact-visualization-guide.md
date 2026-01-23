# Artifact Visualization System

**Last Updated:** 2026-01-23

---

## Overview

The Artifact Visualization System enables AI-generated inline charts and tables that appear directly in chat conversations. Inspired by Claude Artifacts, this system allows the AI to create visual context alongside narrative responses—helping users see patterns in their listening data without leaving the conversation.

### Design Philosophy

| Principle | Description |
|-----------|-------------|
| **Scoped** | Artifacts are ephemeral and conversation-scoped. They don't persist across sessions. |
| **Narrative-Driven** | Visualizations support the story the AI is telling, not replace it. |
| **Lightweight** | Zero external dependencies—pure SVG rendering with vanilla JS. |
| **Secure** | Allowlist-based validation prevents malicious artifact injection. |

### Why This Matters

**Stats.fm** shows static dashboards. **Rhythm Chamber** lets the AI create custom visualizations based on what you're actually asking about.

```
User: "What happened to my listening in 2020?"

AI: [Creates line chart showing the dramatic drop]
     "You see this cliff in March? That's when you stopped listening
      to your regular favorites. What happened that month?"
```

The chart isn't just data—it's part of the conversation.

---

## Supported Artifact Types

### 1. Line Chart (`line_chart`)

**Use Case:** Trends over time—plays, hours, unique artists, discovery rate.

**Features:**
- Time series with smooth interpolation
- Optional annotations for key events
- Gradient fill under the line
- Automatic date formatting on x-axis

**Example Data:**
```javascript
{
  title: "Your Listening in 2020",
  subtitle: "Monthly plays with annotations",
  view: {
    kind: "line_chart",
    x: { field: "month", type: "temporal" },
    y: { field: "plays", domain: [0, 5000] }
  },
  data: [
    { month: "2020-01-01", plays: 4200 },
    { month: "2020-02-01", plays: 3800 },
    { month: "2020-03-01", plays: 800 },  // The drop
    // ...
  ],
  annotations: [
    { x: "2020-03-01", label: "March" }
  ],
  explanation: [
    "Your listening dropped 80% in March 2020.",
    "This coincides with when you stopped playing your top artist."
  ]
}
```

### 2. Bar Chart (`bar_chart`)

**Use Case:** Categorical comparisons—top artists, tracks, genre distribution.

**Features:**
- Horizontal or vertical orientation
- Auto-scaling bar heights
- Truncated labels for long names
- Value labels on each bar

**Example Data:**
```javascript
{
  title: "Your Top Artists This Year",
  view: {
    kind: "bar_chart",
    horizontal: true,
    x: { field: "plays" },
    y: { field: "artist" }
  },
  data: [
    { artist: "The National", plays: 1247 },
    { artist: "Bon Iver", plays: 892 },
    { artist: "Taylor Swift", plays: 654 }
  ]
}
```

### 3. Table (`table`)

**Use Case:** Detailed data presentation—track lists, era summaries.

**Features:**
- Configurable columns
- Up to 50 rows displayed
- Footer showing total row count
- Clean tabular styling

**Example Data:**
```javascript
{
  title: "Your Ghosted Favorites",
  view: {
    kind: "table",
    columns: [
      { field: "artist", label: "Artist" },
      { field: "peak_plays", label: "Peak Monthly Plays" },
      { field: "last_played", label: "Last Played" },
      { field: "days_since", label: "Days Ago" }
    ]
  },
  data: [
    { artist: "Arctic Monkeys", peak_plays: 127, last_played: "2019-06-15", days_since: 2152 },
    { artist: "Kendrick Lamar", peak_plays: 98, last_played: "2019-08-22", days_since: 2084 }
  ]
}
```

### 4. Timeline (`timeline`)

**Use Case:** Event sequences—artist discovery, milestones, life events.

**Features:**
- Chronological event markers
- Alternating above/below labels
- Date labels for context
- Automatic date sorting

**Example Data:**
```javascript
{
  title: "Your Musical Journey",
  subtitle: "When you discovered new artists",
  view: {
    kind: "timeline",
    dateField: "date",
    labelField: "event"
  },
  data: [
    { date: "2019-03-15", event: "Discovered Bon Iver" },
    { date: "2019-07-22", event: "Breakup month" },
    { date: "2020-01-10", event: "Discovered Phoebe Bridgers" }
  ]
}
```

### 5. Heatmap (`heatmap`)

**Use Case:** Calendar-style intensity—daily listening patterns, activity levels.

**Features:**
- GitHub-style contribution graph
- 52-week view (one year)
- Color intensity based on value
- Day-of-week labels

**Example Data:**
```javascript
{
  title: "Your Listening Activity",
  subtitle: "Last 365 days",
  view: {
    kind: "heatmap",
    x: { field: "date" },
    y: { field: "hours" }
  },
  data: [
    { date: "2025-01-01", hours: 4.2 },
    { date: "2025-01-02", hours: 0 },
    // ... daily entries
  ]
}
```

---

## Architecture

### Module Structure

```
js/artifacts/
├── index.js              # Facade (validate, render, utilities)
├── artifact-spec.js      # Schema builders for each type
├── validation.js         # Allowlist + sanitization
└── renderer.js           # Custom SVG renderer
```

### Data Flow

```
AI Function Call
     │
     ▼
ArtifactSpec Builder
     │
     ▼
Validation (allowlist + sanitize)
     │
     ▼
SVG Renderer
     │
     ▼
Inline Chat Display
```

### Key Components

**ArtifactSpec** (`artifact-spec.js`)
- Schema builders for each visualization type
- Type-safe data structure definitions
- Default values for optional fields

**Validation** (`validation.js`)
- Allowlist-based type checking
- Data sanitization (XSS prevention)
- Row limits (`MAX_DATA_ROWS = 1000`)

**Renderer** (`renderer.js`)
- Pure SVG generation (no libraries)
- Deterministic rendering
- CSP-compliant (no `eval()` or `innerHTML`)

---

## AI Integration

### Function Schemas

The AI can request visualizations through these function calls:

| Function | Artifact Type | Purpose |
|----------|--------------|---------|
| `visualize_trend` | line_chart | Show trends over time |
| `visualize_comparison` | bar_chart | Compare categories |
| `show_data_table` | table | Display detailed data |
| `show_listening_timeline` | timeline | Event sequences |
| `show_listening_heatmap` | heatmap | Calendar activity |

### Example AI Prompt

```
When the user asks about trends or patterns, consider creating
a visualization to support your explanation. Use these guidelines:

1. Line charts for time-based questions ("how did my X change over Y")
2. Bar charts for comparisons ("what are my top X")
3. Tables for detailed lists ("show me the data for X")
4. Timelines for event sequences ("when did I discover X")
5. Heatmaps for activity patterns ("how active was I in Y")

Always provide an explanation that contextualizes the visualization.
The chart shows the data; your response explains the meaning.
```

### Coordinated Responses

The AI generates both narrative and visual:

```
You: "When did I listen to sad music the most?"

AI: [Generates line chart of low-valence tracks over time]
    "February 2020. You can see the spike in the chart—this
     coincides with when you were playing The National's
     'I Need My Girl' at 2am most nights."
```

---

## Security & Performance

### Input Validation

| Threat | Mitigation |
|--------|------------|
| Malicious SVG | Allowlist rendering (no arbitrary elements) |
| XSS injection | Text content only (no `innerHTML`) |
| DoS via data | `MAX_DATA_ROWS = 1000` limit |
| Reuse attacks | Unique artifactId per instance |

### Performance Considerations

- **SVG rendering**: Faster than Canvas for simple charts
- **No external libs**: ~8KB vs 200KB+ for chart libraries
- **Lazy rendering**: Charts render only when scrolled into view
- **Collapse state**: Users can collapse to save DOM nodes

### Memory Limits

| Limit | Purpose |
|-------|---------|
| 1000 rows | Prevent OOM on large datasets |
| 50 table rows | Display limit with footer |
| 10 annotations | Prevent visual clutter |

---

## Styling & Theming

### CSS Classes

```css
.artifact-card          /* Container */
.artifact-header        /* Title/subtitle section */
.artifact-title         /* Main title */
.artifact-subtitle      /* Subtitle */
.artifact-content       /* Chart container */
.artifact-explanation   /* AI commentary */
.artifact-actions       /* Collapse button */
.artifact-svg           /* SVG element */
.artifact-table         /* Table styling */
```

### Color Scheme

```javascript
{
  primary: '#8b5cf6',      // Purple accent (main color)
  secondary: '#06b6d4',    // Cyan (secondary data)
  grid: 'rgba(255,255,255,0.1)',  // Grid lines
  text: '#a1a1aa',         // Labels and values
  background: 'rgba(0,0,0,0.2)',  // Background/empty
  annotation: '#fbbf24'    // Amber (annotations)
}
```

---

## Known Limitations

> [!WARNING]
>
> 1. **No interactivity** — Tooltips, zoom, and hover states are not implemented
> 2. **1000 row limit** — Large datasets are truncated
> 3. **No legends** — Single-series charts only
> 4. **Basic axis formatting** — No custom tick marks or log scales
> 5. **Fixed dimensions** — Responsive but not adaptive to screen size

---

## Future Enhancements

| Feature | Status | Description |
|---------|--------|-------------|
| Multi-series line charts | Planned | Compare multiple metrics |
| Histogram views | Planned | Distribution visualization |
| Export to PNG | Planned | User-requested artifact export |
| Dark/light theme | Planned | Adaptive color schemes |
| Interactive tooltips | Planned | Hover for data values |

---

## Developer Notes

### Adding a New Artifact Type

1. Add constant to `artifact-spec.js`:
   ```javascript
   export const ARTIFACT_TYPES = {
       // ...
       SCATTER_PLOT: 'scatter_plot'
   };
   ```

2. Add schema builder:
   ```javascript
   export function scatterPlot(title, data, options = {}) {
       return {
           title,
           view: { kind: ARTIFACT_TYPES.SCATTER_PLOT, ... },
           data: sanitizeData(data)
       };
   }
   ```

3. Add renderer function:
   ```javascript
   function renderScatterPlot(spec, options = {}) {
       // SVG generation logic
   }
   ```

4. Update validation allowlist:
   ```javascript
   const VALID_KINDS = [
       // ...
       'scatter_plot'
   ];
   ```

---

**Related Documentation:**
- [Intelligence Engine](04-intelligence-engine.md) - How AI uses artifacts
- [Technical Architecture](03-technical-architecture.md) - System architecture
- [API Reference](../API_REFERENCE.md) - Function schemas
