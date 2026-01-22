---
path: /Users/rhinesharar/rhythm-chamber/js/window-globals-debug.js
type: util
updated: 2026-01-22
status: deprecated
---

# window-globals-debug.js

## Purpose

Provides development-only guards for legacy window globals during ES Module migration. Maintains deprecation tracking for backwards compatibility debugging.

## Exports

- `DEPRECATED_WINDOW_GLOBALS` - Array of legacy global variable names
- `setupDeprecatedWindowGlobals()` - Sets up deprecation warnings for window globals
- `getDeprecationStats()` - Returns deprecation usage statistics
- `printDeprecationSummary()` - Logs summary of deprecated global usage
- `resetDeprecationStats()` - Clears deprecation tracking data

## Dependencies

None

## Used By

TBD

## Notes

Migration to ES modules complete - this file only retained for lint-window-globals.mjs script. Can be removed in v1.0 when lint script updated.