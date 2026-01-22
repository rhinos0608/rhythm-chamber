---
path: /Users/rhinesharar/rhythm-chamber/js/storage/config-api.js
type: module
updated: 2026-01-22
status: active
---

# config-api.js

## Purpose

Unified configuration storage API providing key-value storage with IndexedDB backend, localStorage fallback, and automatic encryption support for sensitive data.

## Exports

- `ConfigAPI` - Main API object with `get`, `set`, `delete`, `clear`, `keys`, `has`, `migrateToEncrypted` methods
- `getConfig` - Get a config value from unified storage
- `setConfig` - Store a config value with optional encryption
- `deleteConfig` - Remove a config value
- `clearConfig` - Clear all config values
- `getConfigKeys` - Get all config keys
- `hasConfig` - Check if a key exists
- `migrateToEncrypted` - Migrate plaintext values to encrypted storage

## Dependencies

- [[indexeddb]]
- [[security-index]]
- [[storage-encryption]]
- [[secure-token-store]]
- [[event-bus]]

## Used By

TBD

## Notes

- Automatically decrypts encrypted data on retrieval via metadata wrapper
- Mixed encrypted/plaintext database state supported with graceful degradation
- Migration versioning embedded in encrypted data metadata for key rotation planning