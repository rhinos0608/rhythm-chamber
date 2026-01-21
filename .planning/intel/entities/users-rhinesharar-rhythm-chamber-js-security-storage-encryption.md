---
path: /Users/rhinesharar/rhythm-chamber/js/security/storage-encryption.js
type: util
updated: 2026-01-21
status: active
---

# storage-encryption.js

## Purpose

Provides AES-GCM-256 encryption/decryption operations for sensitive data storage in IndexedDB, including automatic data classification for API keys, chat history, and conversation data.

## Exports

- **StorageEncryption** - Class with static encrypt/decrypt methods using AES-GCM-256 with unique IVs per operation
- **shouldEncrypt** - Function to classify data as sensitive based on key/value patterns
- **secureDelete** - Function to securely wipe sensitive data from storage

## Dependencies

- [[logger.js]]

## Used By

TBD

## Notes

Uses non-extractable CryptoKey objects from KeyManager, enforces unique 96-bit IVs per encryption (never reused), and includes centralized logging with automatic sensitive data sanitization. Follows OWASP guidelines for secrets identification.