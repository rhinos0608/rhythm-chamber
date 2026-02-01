# Multi-Model Embeddings - Configuration Guide

## Overview

The multi-model embeddings system now uses **configuration-based model selection** instead of tool parameters. This allows you to set your preferred embedding model once, and all semantic search operations will use it automatically.

## Configuration Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Configuration-Based Selection                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Set Active Model (once)                                         │
│     └─> model_config {"action": "set_active", "model": "..."}      │
│                                                                      │
│  2. All Operations Use Active Model                                │
│     ├─> semantic_search() → Uses active model's cache              │
│     ├─> deep_code_search() → Uses active model's cache             │
│     └─> indexing → Uses active model's cache                       │
│                                                                      │
│  3. Compare Multiple Models (optional)                              │
│     └─> run_multi_models() → Run multiple models for comparison   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## MCP Tools

### 1. model_config - Configure Active Model

**Set the active model for all semantic operations:**

```json
{
  "tool": "model_config",
  "arguments": {
    "action": "set_active",
    "model": "text-embedding-embeddinggemma-300m"
  }
}
```

**Get current active model:**

```json
{
  "tool": "model_config",
  "arguments": {
    "action": "get_active"
  }
}
```

**List all available models:**

```json
{
  "tool": "model_config",
  "arguments": {
    "action": "list_available"
  }
}
```

### 2. semantic_search - Uses Active Model

Now semantic search automatically uses the configured active model:

```json
{
  "tool": "semantic_search",
  "arguments": {
    "query": "how to handle file uploads"
  }
}
```

No need to specify the model - it uses the active model's cache!

### 3. run_multi_models - Run Comparison (Optional)

For multi-model comparison, run multiple models and compare results:

```json
{
  "tool": "run_multi_models",
  "arguments": {
    "models": ["Xenova/gte-base", "text-embedding-embeddinggemma-300m"],
    "pattern": "**/*.js",
    "limit": 50
  }
}
```

### 4. multi_model_compare - Compare Results

After running multiple models, compare their embeddings:

```json
{
  "tool": "multi_model_compare",
  "arguments": {
    "generateReport": true
  }
}
```

## Available Models

### Transformers.js (Local, CPU-based)

| Model | Dimension | Type | Use Case |
|-------|-----------|------|----------|
| `Xenova/gte-base` | 768 | General | Default, high quality |
| `jinaai/jina-embeddings-v2-base-code` | 768 | Code | Code-specific queries |

### LM Studio (Local, GPU-accelerated)

| Model | Dimension | Type | Use Case |
|-------|-----------|------|----------|
| `text-embedding-nomic-embed-code@q8_0` | 768 | Code | Fast with GPU |
| `text-embedding-embeddinggemma-300m` | 768 | General | Gemma model |

## Configuration File

The active model is stored in:
```
.mcp-cache/model-config.json
```

Format:
```json
{
  "activeModel": "Xenova/gte-base",
  "comparisonModels": [],
  "autoSwitch": false
}
```

## Cache Structure

Each model has its own isolated cache:

```
.mcp-cache/
├── model-config.json              # Active model configuration
├── semantic-embeddings-Xenova%2Fgte-base-{hash}.json    # Active model cache
├── semantic-embeddings-text-embedding-embeddinggemma-300m-{hash}.json  # Comparison model cache
└── ...
```

## Typical Workflow

### Workflow 1: Use Default Model

```bash
# 1. Default model is already set (Xenova/gte-base)
# 2. Just use semantic search directly
{
  "tool": "semantic_search",
  "arguments": {
    "query": "how to create a session"
  }
}
```

### Workflow 2: Switch to Different Model

```bash
# 1. Switch to Gemma model
{
  "tool": "model_config",
  "arguments": {
    "action": "set_active",
    "model": "text-embedding-embeddinggemma-300m"
  }
}

# 2. Now all semantic search uses Gemma
{
  "tool": "semantic_search",
  "arguments": {
    "query": "how to create a session"
  }
}
```

### Workflow 3: Compare Multiple Models

```bash
# 1. Run multiple models for comparison
{
  "tool": "run_multi_models",
  "arguments": {
    "models": ["Xenova/gte-base", "text-embedding-embeddinggemma-300m"],
    "pattern": "js/services/*.js",
    "limit": 20
  }
}

# 2. Generate comparison report
{
  "tool": "multi_model_compare",
  "arguments": {
    "generateReport": true
  }
}

# 3. Switch back to your preferred model
{
  "tool": "model_config",
  "arguments": {
    "action": "set_active",
    "model": "Xenova/gte-base"
  }
}
```

## Key Differences from Original Design

| Before | After |
|--------|-------|
| Model passed in every tool call | Model set once via configuration |
| Hard to switch models | Easy runtime switching |
| All caches mixed | Each model has isolated cache |
| No way to see active model | Can query current configuration |

## Best Practices

1. **Set your preferred model early** - Configure at startup or before indexing
2. **Use default for most work** - `Xenova/gte-base` is excellent for general queries
3. **Switch to code model for code** - Use `jinaai/jina-embeddings-v2-base-code` for code-specific tasks
4. **Use comparison for analysis** - Only run multiple models when comparing results
5. **Switch back after comparison** - Return to your preferred model after multi-model runs

## Troubleshooting

### Model not found

```json
{
  "error": "Unknown model: typo-model-name",
  "availableModels": "Xenova/gte-base, jinaai/jina-embeddings-v2-base-code, ..."
}
```

**Fix**: Check available models with `{"action": "list_available"}`

### Cache not found after switching

After switching models, you may need to re-index:

```json
{
  "tool": "indexing_control",
  "arguments": {
    "action": "reindex"
  }
}
```

### Wrong model being used

Check current active model:

```json
{
  "tool": "model_config",
  "arguments": {
    "action": "get_active"
  }
}
```

## API Reference

### model_config Actions

| Action | Parameters | Description |
|--------|------------|-------------|
| `set_active` | `model` (string) | Set the active embedding model |
| `get_active` | none | Get current active model |
| `list_available` | none | List all available models with details |
| `set_comparison` | `models` (array) | Set models for comparison analysis |
| `get_comparison` | none | Get configured comparison models |
| `reset` | none | Reset to default configuration |

### Model Information

Each model provides:
- `dimension`: Embedding vector dimension
- `isCompatible`: Whether it matches the 768-dim standard
- `type`: "code" or "general" purpose
- `provider`: "transformers", "lmstudio", or "cloud"
