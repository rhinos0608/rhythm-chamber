---
path: /Users/rhinesharar/rhythm-chamber/js/workers/pattern-worker-pool.js
type: module
updated: 2026-01-22
status: active
---

# pattern-worker-pool.js

## Purpose

Spawns multiple Web Workers for parallel pattern detection with 3x speedup on multi-core devices. Distributes work across workers, aggregates results, and implements bidirectional liveness checks with automatic worker restart.

## Exports

- `PatternWorkerPool` - Manages pool of Web Workers for parallel pattern detection with automatic health monitoring and restart

## Dependencies

- [[patterns]]
- [[event-bus]]
- [[timeouts]]

## Used By

TBD

## Notes

- Uses SharedArrayBuffer when COOP/COEP headers present, falls back to data partitioning
- Adapts worker count based on navigator.deviceMemory
- Requires server headers: Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: require-corp