# Multi-Model Embeddings Comparison System

## Overview

This system enables comparison of embeddings across multiple models with isolated caches and serialized execution. Each model processes the same files independently, allowing for detailed analysis of how different embedding models perform on the same codebase.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Multi-Model Comparison System                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              MultiModelCacheManager                          │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │  │
│  │  │ Model A Cache   │  │ Model B Cache   │  │ Model C ...  │ │  │
│  │  │ .mcp-cache/     │  │ .mcp-cache/     │  │              │ │  │
│  │  │ semantic-A.json │  │ semantic-B.json │  │              │ │  │
│  │  └─────────────────┘  └─────────────────┘  └──────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              SerializedModelRunner                           │  │
│  │  Queue-based execution: Model A → Model B → Model C         │  │
│  │  No concurrent calls to different models                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              ComparisonEngine                                │  │
│  │  • Cosine similarity comparison                             │  │
│  │  • Ranking overlap analysis                                 │  │
│  │  • Anomaly detection                                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. MultiModelCacheManager (`multi-model-cache.js`)

Manages isolated cache namespaces for multiple embedding models.

**Key Features:**
- Per-model cache isolation (separate files per model)
- Model-aware cache keys
- Bulk operations across all models
- Comparison capabilities

**Usage:**
```javascript
import { MultiModelCacheManager } from './semantic/multi-model-cache.js';

const cacheManager = new MultiModelCacheManager('.mcp-cache', {
  enabled: true,
});

await cacheManager.initialize();

// Get or create cache for a model
const cache = await cacheManager.getOrCreateCache('Xenova/gte-base');

// Compare chunk across all models
const comparison = cacheManager.compareChunk('chunk-id');

// Get all stats
const stats = cacheManager.getAllStats();
```

### 2. SerializedModelRunner (`model-runner.js`)

Executes embedding models sequentially with no concurrency.

**Key Features:**
- Queue-based execution
- Progress tracking per model
- Error isolation
- Detailed reporting

**Usage:**
```javascript
import { SerializedModelRunner } from './semantic/model-runner.js';

const runner = new SerializedModelRunner(cacheManager, {
  onProgress: (modelName, status, details) => {
    console.log(`${modelName}: ${status}`, details);
  },
  onError: (modelName, error) => {
    console.error(`${modelName} failed:`, error);
  },
  batchSize: 20,
});

// Add models to queue
runner.addModels(
  ['Xenova/gte-base', 'jinaai/jina-embeddings-v2-base-code'],
  files,
  config
);

// Run all models sequentially
const results = await runner.runAll();
```

### 3. ComparisonEngine (`comparison-engine.js`)

Analyzes and compares embeddings across multiple models.

**Key Features:**
- Cosine similarity comparison
- Ranking overlap analysis (Kendall's Tau)
- Score correlation (Pearson)
- Anomaly detection

**Usage:**
```javascript
import { ComparisonEngine } from './semantic/comparison-engine.js';

const engine = new ComparisonEngine(cacheManager);

// Compare specific chunks
const comparison = await engine.compareChunks(['chunk-1', 'chunk-2']);

// Compare search results
const searchComparison = engine.compareSearchResults(query, {
  'model-a': resultsA,
  'model-b': resultsB,
});

// Detect anomalies
const anomalies = await engine.detectAnomalies(chunkIds, 0.5);

// Generate full report
const report = await engine.generateFullReport();
```

## Configuration

### Model Configuration

Models are configured in `mcp-server/src/semantic/config.js`:

```javascript
export const MODEL_DIMENSIONS = {
  // Transformers.js models
  'Xenova/gte-base': 768,
  'jinaai/jina-embeddings-v2-base-code': 768,

  // LM Studio models
  'text-embedding-embeddinggemma-300m': 768,
  'text-embedding-nomic-embed-code@q8_0': 768,

  // ... more models
};
```

### Adding New Models

1. Add model to `MODEL_DIMENSIONS` in `config.js`
2. Specify dimensions (must be 768 for compatibility)
3. Use in model runner:

```javascript
runner.addModels(
  ['text-embedding-embeddinggemma-300m'],
  files,
  {
    'text-embedding-embeddinggemma-300m': {
      mode: 'local',
      endpoint: 'http://localhost:1234/v1',
    },
  }
);
```

## Example Usage

See `mcp-server/examples/multi-model-comparison.js` for a complete example.

```bash
node mcp-server/examples/multi-model-comparison.js ./mcp-server/src
```

This will:
1. Process files with multiple models (serialized)
2. Create isolated caches for each model
3. Generate comparison report
4. Detect anomalies

## Cache Structure

Each model gets its own cache file:

```
.mcp-cache/
├── semantic-embeddings-Xenova_gte-base.json
├── semantic-embeddings-jinaai_jina-embeddings-v2-base-code.json
├── semantic-embeddings-text-embedding-embeddinggemma-300m.json
└── ...
```

This prevents cross-contamination and enables true model comparison.

## Anomaly Detection

The system includes anomaly detection for embeddings across models:

```javascript
const anomalies = await engine.detectAnomalies(chunkIds, 0.5);
// Returns: { total, anomaliesFound, anomalyRate, anomalies[] }
```

An anomaly is detected when:
- Cosine similarity between models < threshold
- Default threshold: 0.5 (configurable)

## Why 0% Anomalies?

If anomaly detection returns 0%, it could be:

1. **Expected value not set** (Wave Telemetry)
   - Call `WaveTelemetry.setExpected(metricName, expectedMs)`

2. **Insufficient samples**
   - Need at least 10 samples per metric
   - Call `WaveTelemetry.record(metricName, actualMs)` repeatedly

3. **Low variance (system operating normally)**
   - Variance below 20% threshold
   - This is GOOD! Timing is consistent.

4. **No metrics registered**
   - Start recording telemetry data

Use the diagnostic script:
```bash
node mcp-server/examples/diagnose-anomalies.js
```

## Metrics

### Comparison Metrics

- **Cosine Similarity**: Vector similarity between embeddings
- **Kendall's Tau**: Ranking correlation between models
- **Pearson Correlation**: Score correlation
- **Top-K Overlap**: Common results in top K

### Performance Metrics

- **Processing Time**: Time per model
- **Chunks Processed**: Number of chunks embedded
- **Files Processed**: Number of files indexed
- **Cache Hit Rate**: Cache effectiveness

## Best Practices

1. **Always use serialized execution** for model comparison
   - Prevents resource conflicts
   - Ensures fair comparison

2. **Use consistent file sets** across models
   - Same files for all models
   - Enables direct comparison

3. **Monitor cache size**
   - Each model multiplies cache size
   - Clean up unused models

4. **Start with small samples**
   - Test with 10-20 files first
   - Scale up after validation

## Troubleshooting

### Models not loading
- Check model name in `MODEL_DIMENSIONS`
- Verify LM Studio is running (for local models)
- Check console for error messages

### Cache corruption
- Delete `.mcp-cache/` directory
- Re-index from scratch

### Out of memory
- Reduce batch size
- Process files in smaller groups
- Close unused model caches

## Future Enhancements

- [ ] Parallel execution with resource limits
- [ ] Incremental comparison (only new files)
- [ ] Visual comparison reports
- [ ] Statistical significance testing
- [ ] Model performance benchmarking
