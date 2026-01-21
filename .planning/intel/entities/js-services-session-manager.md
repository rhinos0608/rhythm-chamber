---
path: /Users/rhinesharar/rhythm-chamber/js/services/session-manager.js
type: service
updated: 2026-01-21
status: active
---

# session-manager.js

## Purpose

Session lifecycle management with emergency backup and recovery. Handles session creation, loading, saving, and cleanup. Implements auto-save with debouncing and emergency backup for data loss prevention.

## Exports

- `SessionManager` - Session manager service
- `init()` - Initialize session manager and recover emergency backup
- `createNewSession(initialMessages)` - Create new session with optional initial messages
- `loadSession(sessionId)` - Load existing session
- `saveCurrentSession()` - Save current session immediately
- `getCurrentSessionId()` - Get current session ID
- `getCurrentSession()` - Get current session data
- `deleteSession(sessionId)` - Delete specific session
- `listSessions()` - List all sessions
- `clearCurrentSession()` - Clear current session from memory
- `createEmergencyBackup()` - Create emergency backup of current state
- `recoverEmergencyBackup()` - Recover from emergency backup

## Dependencies

- [[js-storage]] - Session storage operations
- [[js-state-app-state]] - Session state management
- localStorage - Emergency backup storage

## Used By

TBD

## Notes

Key feature: Emergency backup prevents data loss during crashes. Auto-save with debouncing reduces storage operations. Flushes pending saves before creating new session to prevent data loss. UUID-based session IDs for uniqueness.