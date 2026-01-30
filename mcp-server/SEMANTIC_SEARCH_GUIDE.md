# Semantic Search Setup Guide

**Rhythm Chamber MCP Server** - Last Updated: 2025-01-30

## 📊 Current Configuration

### ✅ Working Setup (Recommended)

```bash
Model: Xenova/all-MiniLM-L6-v2 (Transformers.js)
Dimensions: 384
Source: CPU-based (no GPU required)
Files Indexed: 402
Chunks: 17,078
Index Time: ~3 minutes (first run)
Cache: .mcp-cache/semantic-embeddings.json
Quality: Good (65-80% semantic similarity)
```

### Performance Characteristics

| Metric | Value |
|--------|-------|
| **Speed** | ⚡ Fast (14.7ms per 1K tokens) |
| **Quality** | 🟡 Good (56% Top-5 accuracy) |
| **RAM Usage** | ~300-400MB (model + embeddings) |
| **CPU Load** | Moderate during indexing |
| **Reliability** | ✅ 100% (no failures) |

---

## 🔧 Restart Script

Save as `restart-semantic-search.sh`:

```bash
#!/bin/bash

set -e

echo "🚀 Rhythm Chamber Semantic Search - Restart Script"
echo "=================================================="

# Configuration
PROJECT_ROOT="/Users/rhinesharar/rhythm-chamber"
MCP_SERVER_DIR="$PROJECT_ROOT/mcp-server"
CACHE_DIR="$MCP_SERVER_DIR/.mcp-cache"
LOG_FILE="$MCP_SERVER_DIR/.restart-log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Stop existing servers
echo "🛑 Stopping existing MCP servers..."
pkill -f "node.*mcp-server/server.js" || true
sleep 2

# Clear cache (optional - remove if you want to preserve index)
read -p "Clear cache and re-index? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  Clearing cache..."
    rm -rf "$CACHE_DIR/semantic-embeddings.json"
fi

# Start server
echo "🚀 Starting MCP server..."
cd "$MCP_SERVER_DIR"

# Environment variables
export RC_PROJECT_ROOT="$PROJECT_ROOT"
export RC_EMBEDDING_DIM=384  # Must match model dimension

# Start in background with logging
nohup node server.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

echo "✅ Server started with PID: $SERVER_PID"
echo "📝 Log file: $LOG_FILE"
echo ""
echo "📊 Monitoring startup (10 seconds)..."
sleep 10

# Check if server is running
if ps -p $SERVER_PID > /dev/null; then
    echo -e "${GREEN}✅ Server is running successfully!${NC}"
    echo ""
    echo "🔍 Check indexing status:"
    tail -20 "$LOG_FILE" | grep -E "Indexing|Indexed|complete|Error" || echo "Still initializing..."
    echo ""
    echo "💡 To monitor logs:"
    echo "   tail -f $LOG_FILE"
else
    echo -e "${RED}❌ Server failed to start. Check logs:${NC}"
    echo "   cat $LOG_FILE"
    exit 1
fi
```

Make it executable:
```bash
chmod +x restart-semantic-search.sh
```

---

## 🧪 Testing Semantic Search

After restart, test with:

```bash
# Test session management
echo "Testing semantic search..."

# Via Claude Code interface, query:
# - "session creation and management"
# - "spotify authentication oauth"
# - "error handling retry logic"
```

Expected results:
- ✅ Returns 5 relevant code chunks
- ✅ Similarity scores: 65-80%
- ✅ Correct file locations and context

---

## 🔍 Research Summary: Model Options

### Current: Xenova/all-MiniLM-L6-v2

**Pros:**
- ✅ Extremely fast (14.7ms/1K tokens)
- ✅ Lightweight (22M params)
- ✅ 100% reliable
- ✅ Good quality for general text

**Cons:**
- ⚠️ Lower accuracy (56% Top-5)
- ⚠️ Only 384 dimensions
- ⚠️ Not specifically trained on code

**Verdict:** Excellent for development/testing, acceptable for production.

---

### Alternative: Xenova/gte-base (Upgrade Path)

**Why Consider:**
- ✅ 768 dimensions (2x capacity)
- ✅ Higher quality than MiniLM
- ✅ Still CPU-based (no GPU needed)
- ✅ Good balance of speed/quality

**Trade-offs:**
- ⚠️ Slower (but reasonable)
- ⚠️ More RAM (~500-600MB)
- ⚠~ Slightly longer index time

**Migration:**
```bash
# Edit mcp-server/src/semantic/embeddings.js
FALLBACK_MODEL = 'Xenova/gte-base'
DEFAULT_DIM = 768

# Clear cache and restart
rm -rf .mcp-cache/semantic-embeddings.json
./restart-semantic-search.sh
```

**Recommendation:** Stick with MiniLM for now unless you need higher precision.

---

### ❌ Attempted: LM Studio Integration

**Tested Models:**
1. text-embedding-qwen3-embedding-0.6b (768 dim)
2. text-embedding-nomic-embed-text-v1.5 (768 dim)

**Issues:**
- ❌ Batch requests abort: "This operation was aborted"
- ❌ Falls back to Transformers.js mid-indexing
- ❌ Inconsistent with large batch sizes (17K+ chunks)

**Root Cause:** LM Studio's batch embedding API appears unstable for large-scale operations, even in v0.4.0 with parallel request improvements.

**Status:** Not recommended for production use until batch API is more stable.

---

## 📈 Performance Benchmarks

### Indexing Performance

| Model | Dimensions | Time (402 files) | Reliability |
|-------|------------|-------------------|-------------|
| MiniLM-L6-v2 | 384 | ~3 min | ✅ 100% |
| gte-base | 768 | ~4 min (est.) | ✅ 100% |
| LM Studio Nomic | 768 | Falls back | ❌ Unstable |

### Search Quality

| Query Type | MiniLM Results | Expected gte-base |
|------------|----------------|-------------------|
| Session management | 80% similarity | ~85-90% |
| Authentication | 65% similarity | ~75-85% |
| Error handling | 76% similarity | ~80-88% |

---

## 🛠️ Troubleshooting

### "Embedding dimensions must match"

**Cause:** Stored vectors (384) ≠ Query embeddings (768)

**Fix:**
```bash
# Ensure DEFAULT_DIM in embeddings.js matches actual model
# For MiniLM: DEFAULT_DIM = 384
# For gte-base: DEFAULT_DIM = 768

# Clear cache and restart
rm -rf .mcp-cache/semantic-embeddings.json
kill <server-pid>
node server.js
```

### "Indexing in Progress" message

**Normal:** First-time indexing takes 2-3 minutes

**Check progress:**
```bash
tail -f .mcp-cache/*.log | grep "Indexed"
```

### Server crashes after indexing

**Cause:** Cache write failure or dimension mismatch

**Fix:**
```bash
# Check logs
tail -50 .restart-log

# Verify directory exists
ls -la .mcp-cache/

# Restart with clean cache
rm -rf .mcp-cache/*
./restart-semantic-search.sh
```

---

## 📚 LM Studio Integration Notes

### Why It Failed

**Symptoms:**
- LM Studio detected successfully
- Single embedding requests work
- Batch requests (17K chunks) abort silently
- System falls back to Transformers.js

**LM Studio 0.4.0 Changes:**
- ✅ Parallel requests (n_parallel=4)
- ✅ Continuous batching
- ✅ New stateful REST API
- ❌ Embedding batch API still unstable

**Recommendation:** Re-test in future LM Studio versions. The parallel request infrastructure is promising and may improve.

---

## 🎯 Optimization Tips

### For Development/Fast Iteration
```bash
# Use MiniLM (current setup)
# Clear cache only when code changes significantly
# Index time: ~3 minutes
```

### For Production Quality
```bash
# Consider upgrading to gte-base
# Better semantic matching
# Still CPU-based, no GPU needed
# Index time: ~4 minutes
```

### For Maximum Performance (GPU)
```bash
# LM Studio + Nomic model (when stable)
# GPU-accelerated embeddings
# 768 dimensions, highest quality
# Currently unstable for large batches
```

---

## 📝 Maintenance

### Regular Tasks

**Weekly:**
- Check indexing logs for errors
- Verify semantic search quality
- Monitor cache size (~30-50MB typical)

**After Code Changes:**
```bash
# If adding/removing many files
rm -rf .mcp-cache/semantic-embeddings.json
./restart-semantic-search.sh
```

**Performance Monitoring:**
```bash
# Check server resource usage
ps aux | grep "node.*server.js"

# View recent logs
tail -100 .restart-log

# Index statistics
# (Via Claude Code: list_indexed_files tool)
```

---

## 🚀 Quick Start Commands

```bash
# Start server
cd /Users/rhinesharar/rhythm-chamber/mcp-server
RC_PROJECT_ROOT=/Users/rhinesharar/rhythm-chamber \
RC_EMBEDDING_DIM=384 \
node server.js

# In separate terminal, monitor
tail -f .restart-log

# Or use restart script
./restart-semantic-search.sh
```

---

## 📖 References

### Research Sources
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) - Embedding model benchmarks
- [SuperMemory Benchmark](https://supermemory.ai/blog/best-open-source-embedding-models-benchmarked-and-ranked/) - Model comparison
- [Nomic Technical Report](https://static.ai/reports/2024_Nomic_Embed_Text_Technical_Report.pdf) - Nomic v1 research

### Key Findings
- MiniLM-L6-v2: Fastest (14.7ms/1K tokens), good quality
- Nomic-embed: Best quality (8192 context), but slower
- gte-base: Balanced performance, 768 dimensions

---

## 📞 Support

**Issues?** Check:
1. Server logs: `.restart-log`
2. Cache directory: `.mcp-cache/`
3. Configuration: `src/semantic/embeddings.js`

**Common Fixes:**
1. Dimension mismatch → Clear cache, restart
2. Server crash → Check logs, verify RAM
3. Poor results → Wait for full indexing to complete

---

**Last Updated:** 2025-01-30
**Status:** ✅ Production Ready (Transformers.js + MiniLM)
