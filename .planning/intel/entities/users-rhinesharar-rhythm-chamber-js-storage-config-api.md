---
path: /Users/rhinesharar/rhythm-chamber/js/storage/config-api.js
type: api
updated: 2026-01-21
status: active
---

# config-api.js

## Purpose

Unified configuration storage API providing key-value storage with IndexedDB backend and localStorage fallback, including automatic encryption support for sensitive data.

## Exports

- `getConfig` - Retrieves configuration values with automatic decryption support
- `setConfig` - Stores configuration values with optional encryption
- `deleteConfig` - Removes configuration values with secure deletion
- `clearConfig` - Clears all configuration data
- `ConfigAPI` - Main export object containing all config operations

## Dependencies

- [[js-storage-indexeddb]] - IndexedDB core storage backend
- [[js-security-index]] - Security coordinator and key management
- [[js-security-storage-encryption]] - Encryption/decryption utilities
- [[js-security-secure-token-store]] - Secure token storage

## Used By

TBD

## Notes

- Supports automatic encryption through `shouldEncrypt()` utility
- Implements graceful degradation with fallback to defaultValue on decryption failure
- Tracks migration version (v1) for future key rotation and data migration planning