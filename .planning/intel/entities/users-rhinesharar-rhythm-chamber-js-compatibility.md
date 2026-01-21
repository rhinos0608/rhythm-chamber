---
path: /Users/rhinesharar/rhythm-chamber/js/compatibility.js
type: util
updated: 2026-01-21
status: active
---

# compatibility.js

## Purpose

Browser compatibility checker that runs before the main application to detect required browser features. Provides graceful degradation with upgrade messaging for unsupported browsers.

## Exports

None (sets global `window.__COMPATIBILITY_PASSED__` flag)

## Dependencies

None

## Used By

TBD

## Notes

- Must be loaded as regular (non-module) script to execute even if ES modules unsupported
- Uses `new Function()` to safely test async/await syntax without parse errors
- Target browsers: Chrome 90+, Edge 90+, Firefox 90+, Safari 14.5+, iOS 14.5+