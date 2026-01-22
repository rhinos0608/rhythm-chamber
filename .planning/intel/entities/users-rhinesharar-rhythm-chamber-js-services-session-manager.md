---
path: /Users/rhinesharar/rhythm-chamber/js/services/session-manager.js
type: service
updated: 2026-01-22
status: active
---

# session-manager.js

## Purpose

Manages chat session lifecycle including creation, loading, saving, deletion, and switching. Provides thread-safe session data management with mutex protection.

## Exports

- **SessionManager** - Main service object with methods for session CRUD operations, auto-save, and message management

## Dependencies

- [[event-bus.js]]
- [[storage.js]]
- [[data-version.js]]
- [[safe-json.js]]
- [[keys.js]]
- [[app-state.js]]

## Used By

TBD

## Notes

- Implements async mutex pattern via `_sessionDataLock` for thread-safe concurrent updates
- Enforces message limit of 100 messages per session with warning threshold at 90
- Uses emergency backup mechanism with 1-hour max age for beforeunload events
- Migrates legacy conversation storage format to new session structure