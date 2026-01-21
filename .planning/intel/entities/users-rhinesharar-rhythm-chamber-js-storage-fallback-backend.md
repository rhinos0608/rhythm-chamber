---
path: /Users/rhinesharar/rhythm-chamber/js/storage/fallback-backend.js
type: module
updated: 2026-01-21
status: active
---

# fallback-backend.js

## Purpose

Provides in-memory and localStorage-based storage fallback when IndexedDB is unavailable, enabling the app to work in private browsing mode or when IndexedDB is blocked.

## Exports

- **FallbackBackend** - Fallback storage backend with memory and localStorage modes

## Dependencies

- [[event-bus.js]]

## Used By

TBD

## Notes

- In-memory mode loses data on page refresh
- localStorage mode limited to ~5MB total quota
- Data lost on logout/browser close in private mode