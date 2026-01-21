---
path: /Users/rhinesharar/rhythm-chamber/js/security/storage-encryption.js
type: service
updated: 2026-01-21
status: active
---

# storage-encryption.js

## Purpose

AES-GCM-256 encryption/decryption operations for sensitive data storage. Each encryption uses a unique 96-bit IV per operation. Provides data classification for automatic encryption of API keys, chat history, and sensitive patterns.

## Exports

- `shouldEncrypt(key, value)` - Classify data as sensitive for encryption
- `StorageEncryption` - Main encryption service object
- `encrypt(data, key)` - Encrypt data using AES-GCM-256 with unique IV
- `decrypt(encryptedData, key)` - Decrypt AES-GCM-256 encrypted data
- `encryptWithMetadata(data, key, keyVersion)` - Encrypt with metadata wrapper for storage
- `decryptFromMetadata(wrappedData, key)` - Decrypt from metadata wrapper
- `migrateData(oldKey, newKey, encryptedData)` - Key rotation for encrypted data
- `secureDelete(storeName, key)` - Secure deletion with data overwriting

## Dependencies

- [[js-storage-indexeddb]] - IndexedDB operations for secure deletion
- crypto.subtle - Web Crypto API for AES-GCM operations
- crypto.getRandomValues - IV generation

## Used By

TBD

## Notes

Each encryption MUST use a unique IV (never reused) for security. IV is public but must be unique per operation. Implements defense-in-depth with key-based, value-based, and pattern-based classification for sensitive data detection.