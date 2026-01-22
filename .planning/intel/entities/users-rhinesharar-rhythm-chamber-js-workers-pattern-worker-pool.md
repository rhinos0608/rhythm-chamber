---
path: /Users/rhinesharar/rhythm-chamber/js/workers/pattern-worker-pool.js
type: module
updated: 2026-01-22
status: active
---

# pattern-worker-pool.js

## Purpose

Manages a pool of Web Workers for parallel pattern detection, achieving 3x speedup on multi-core devices through distributed processing and automatic worker health monitoring.

## Exports

- **PatternWorkerPool** - Main class managing worker lifecycle, work distribution, and result aggregation

## Dependencies

- [[patterns]]
- [[event-bus]]

## Used By

TBD

## Notes

Requires COOP/COEP headers for SharedArrayBuffer support; falls back to data partitioning when unavailable. Adapts worker count based on device memory.