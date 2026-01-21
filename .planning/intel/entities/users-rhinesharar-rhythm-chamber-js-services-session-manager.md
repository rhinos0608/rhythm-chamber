---
path: /Users/rhinesharar/rhythm-chamber/js/services/session-manager.js
type: service
updated: 2026-01-21
status: active
---

# session-manager.js

## Purpose

Handles chat session lifecycle including creation, loading, saving, deletion, and switching. Extracted from chat.js to separate session concerns from chat orchestration.

## Exports

- **SessionManager** - Main session management service with methods for CRUD operations on chat sessions

## Dependencies

- [[event-bus]]
- [[storage]]
- [[data-version]]
- [[utils/safe-json]]
- [[storage/keys]]

## Used By

TBD

## Notes

- Implements async mutex pattern via `_sessionDataLock` to prevent race conditions in concurrent updates
- Enforces message limit of 100 per session with warning at 90 messages
- Uses emergency backup mechanism on beforeunload for crash recovery
- Migrates legacy conversation storage format to new session structure