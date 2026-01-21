---
path: /Users/rhinesharar/rhythm-chamber/js/storage/migration.js
type: module
updated: 2026-01-21
status: active
---

# migration.js

## Purpose

Handles migration of data from localStorage to IndexedDB with atomic migration, backup, and rollback capabilities.

## Exports

- **StorageMigration** - Main migration orchestrator class with methods for migrating config data and tokens

## Dependencies

- [[indexeddb]] - IndexedDBCore for database operations
- [[config-api]] - ConfigAPI for configuration management
- [[secure-token-store]] - SecureTokenStore for secure token handling

## Used By

TBD

## Notes

Migrates specific config keys (settings, RAG data, session state, sidebar state) and Spotify tokens from localStorage to IndexedDB while maintaining emergency backup in localStorage for disaster recovery.