---
path: /Users/rhinesharar/rhythm-chamber/js/patterns.js
type: module
updated: 2026-01-22
status: active
---

# patterns.js

## Purpose

Detects behavioral patterns from listening data using parallel processing via PatternWorkerPool for 3x speedup on multi-core devices.

## Exports

- `Patterns` - Collection of pattern detection algorithms (comfort/discovery ratio, listening eras, timezone-aware UTC hour analysis)

## Dependencies

- `PatternWorkerPool` (internal worker pool for parallel processing)

## Used By

TBD

## Notes

Uses UTC hours (hourUTC) with fallback to local hour for timezone consistency. Era detection identifies periods where top artists change <40% week-over-week. Comfort/discovery ratio: >50 plays/artist = comfort curator, <10 = discovery junkie.