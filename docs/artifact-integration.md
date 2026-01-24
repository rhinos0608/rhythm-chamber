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
import { ArtifactSpec } from './artifacts/artifact-spec.js';

const spec = new ArtifactSpec({
  type: 'line-chart',
  title: 'Listening Trends',
  data: processedData,
  metadata: {
    explanation: 'Your listening increased over 2024',
    annotations: ['Peak in summer']
  }
});
```

### 2. Render Artifact

```javascript
import { ArtifactRenderer } from './artifacts/renderer.js';

const renderer = new ArtifactRenderer();
const svg = await renderer.render(spec);
container.appendChild(svg);
```

### 3. Validate Before Rendering

```javascript
import { validateArtifactSpec } from './artifacts/validation.js';

const errors = validateArtifactSpec(spec);
if (errors.length > 0) {
  throw new Error(`Invalid spec: ${errors.join(', ')}`);
}
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
