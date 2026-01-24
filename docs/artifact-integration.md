# Artifact Visualization Integration Guide

## Overview

Artifacts are dynamically generated visualizations with narrative context.

## Artifact Types

| Type | Description | Use Case |
|------|-------------|----------|
| Line Chart | Trends over time | Listening patterns |
| Bar Chart | Categorical comparison | Top artists/tracks |
| Table | Structured data | Detailed statistics |
| Timeline | Temporal events | Listening history |
| Heatmap | Density visualization | Listening clock |

## Creating Artifacts

### 1. Define ArtifactSpec

```javascript
import { createLineChart, createBarChart, createTable } from '../js/artifacts/index.js';

// Line chart for trends over time
const lineChart = createLineChart({
  title: 'Listening Trends',
  data: processedData,
  xField: 'date',
  yField: 'plays',
  xType: 'temporal',
  explanation: ['Your listening increased over 2024', 'Peak activity in summer'],
  annotations: [{ x: '2024-06-15', label: 'Summer peak' }]
});

// Bar chart for categorical comparison
const barChart = createBarChart({
  title: 'Top Artists',
  data: artistData,
  categoryField: 'artist',
  valueField: 'playCount',
  horizontal: true,
  explanation: ['Your top 5 artists by play count']
});

// Table for structured data
const table = createTable({
  title: 'Listening Statistics',
  data: statsData,
  columns: [
    { field: 'metric', label: 'Metric' },
    { field: 'value', label: 'Value' }
  ],
  explanation: ['Detailed breakdown of your listening habits']
});
```

### 2. Render Artifact

```javascript
import { Artifacts } from '../js/artifacts/index.js';

// Validate and render in one step
const result = Artifacts.render(spec, container);

if (!result.success) {
  console.error('Render failed:', result.errors);
}
```

### 3. Validate Before Rendering

```javascript
import { Artifacts } from '../js/artifacts/index.js';

const validation = Artifacts.validate(spec);
if (!validation.valid) {
  throw new Error(`Invalid spec: ${validation.errors.join(', ')}`);
}

// Use sanitized spec for rendering
await Artifacts.render(validation.sanitized, container);
```

## CSP Compliance

All rendering is deterministic SVG generation - no inline scripts or eval.

## Examples

See: `js/functions/executors/artifact-executors.js`

## Styling

Artifacts support color themes:
- Light mode (default)
- Dark mode
- Custom color palettes
