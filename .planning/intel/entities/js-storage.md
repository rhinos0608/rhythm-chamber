---
path: /Users/rhinesharar/rhythm-chamber/js/storage.js
type: service
updated: 2026-01-21
status: active
---

# storage.js

## Purpose

Thin storage facade that provides unified API combining IndexedDB operations, config/token storage, migration, and Safe Mode enforcement. Implements HNW hierarchy with write blocking when encryption unavailable.

## Exports

- `Storage` - Main storage facade service
- `STORES` - Store constants (STREAMS, CHUNKS, EMBEDDINGS, PERSONALITY, SETTINGS, CHAT_SESSIONS, CONFIG, TOKENS, MIGRATION)
- `init()` - Initialize storage and run migrations
- `saveStreams(streams)` - Save streaming data
- `getStreams()` - Get streaming data
- `appendStreams(newStreams)` - Append new streams with atomic update
- `clearStreams()` - Clear streaming data
- `saveChunks(chunks)` - Save embedding chunks
- `getChunks()` - Get embedding chunks
- `savePersonality(personality)` - Save personality data
- `getPersonality()` - Get personality data
- `saveSetting(key, value)` - Save setting
- `getSetting(key)` - Get setting
- `saveSession(session)` - Save chat session
- `getSession(id)` - Get chat session
- `getAllSessions()` - Get all sessions sorted by updated time
- `deleteSession(id)` - Delete session
- `getSessionCount()` - Get session count
- `clearAllSessions()` - Clear all sessions
- `getConfig(key, defaultValue)` - Get config value (delegates to ConfigAPI)
- `setConfig(key, value)` - Set config value (delegates to ConfigAPI)
- `removeConfig(key)` - Remove config value (delegates to ConfigAPI)
- `getToken(key)` - Get token (delegates to ConfigAPI)
- `setToken(key, value)` - Set token (delegates to ConfigAPI)
- `removeToken(key)` - Remove token (delegates to ConfigAPI)
- `beginTransaction(callback)` - Begin atomic transaction across backends
- `clearAllData()` - Clear all data from all stores
- `archiveOldStreams(options)` - Archive streams older than cutoff date
- `restoreFromArchive(options)` - Restore archived streams
- `getArchiveStats()` - Get archive statistics
- `clearArchive()` - Clear archive permanently
- `isReady()` - Check if Storage module is loaded
- `isInitialized()` - Check if IndexedDB is initialized
- `setSessionOnlyMode(enabled)` - Enable/disable session-only mode
- `setDataPersistenceConsent(consent)` - Set data persistence consent
- `clearSensitiveData()` - Clear sensitive data (raw streams)
- `getDataSummary()` - Get data summary
- `validateConsistency()` - Validate data consistency
- `getSyncManager()` - Get sync manager
- `getSyncStrategy()` - Get current sync strategy
- `getSyncStatus()` - Get sync status

## Dependencies

- [[js-storage-transaction]] - Atomic transactions across backends
- [[js-storage-migration]] - localStorage to IndexedDB migration
- [[js-module-registry]] - Module registry
- [[js-services-event-bus]] - Event emission
- [[js-security-safe-mode]] - Safe Mode enforcement
- [[js-storage-write-ahead-log]] - Write-ahead logging
- [[js-storage-archive-service]] - Stream archival for quota management
- [[js-storage-quota-manager]] - Quota monitoring
- [[js-storage-indexeddb]] - Core IndexedDB operations
- [[js-operation-lock]] - Privacy clear lock
- [[js-storage-profiles]] - Profile storage management
- [[js-storage-config-api]] - Config and token storage
- [[js-storage-sync-strategy]] - Sync strategy management

## Used By

TBD

## Notes

Implements operation queue for critical writes with version change deferral. Auto-archives streams when quota exceeds 90%. Safe Mode enforcement blocks writes when encryption unavailable. Delegates to specialized modules for profiles, config/tokens, transactions, and migration.