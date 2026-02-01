# File Watcher Improvements: Auto-Start & Corruption Detection

## Current Implementation Analysis

The file watcher in `mcp-server/src/semantic/file-watcher.js` already has excellent incremental reindexing:

### ✅ Good Features (Already Implemented)

1. **Incremental Reindexing**
   - Uses `reindexFiles(toReindex)` - NOT full reindex
   - Only reindexes changed files

2. **Three-Level Debouncing**
   - Per-file debounce (300ms)
   - Coalescing window (1000ms)
   - Queue size limit (1000 files)

3. **Smart Change Handling**
   - Separates reindex vs delete
   - Removes orphaned data from vector store
   - Transient error retry

### ❌ Missing Features

1. **Watcher Not Auto-Started**
   - Must manually start
   - No corruption detection

2. **No Auto-Recovery**
   - Vector mismatches not detected
   - No health checks

## Proposed Improvements

1. Auto-start file watcher on server initialization
2. Add health monitor with corruption detection
3. Auto-reindex on corruption detection

## Benefits

- Automatic maintenance after code changes
- Corruption detection and auto-recovery
- Still efficient (no full reindex on every change)
