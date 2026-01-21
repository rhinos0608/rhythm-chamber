---
path: /Users/rhinesharar/rhythm-chamber/js/services/session-manager.js
type: service
updated: 2026-01-21
status: active
---

# session-manager.js

## Purpose

Manages chat session lifecycle including creation, loading, saving, deletion, and switching. Extracted from chat.js to separate session persistence concerns from chat orchestration.

## Exports

- `SessionManager` - Main session management service with initialization, session CRUD operations, auto-save, and emergency backup recovery

## Dependencies

- [[event-bus.js]]
- [[storage.js]]
- [[data-version.js]]

## Used By

TBD

## Notes

Handles legacy migration from sessionStorage, implements dual-storage with unified Storage API and localStorage fallback, includes emergency backup for beforeunload events, and manages auto-save with debouncing. Uses UUID generation for session IDs and includes session list management with metadata.