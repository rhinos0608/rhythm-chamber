---
path: /Users/rhinesharar/rhythm-chamber/js/security/encryption.js
type: service
updated: 2026-01-21
status: active
---

# encryption.js

## Purpose

Provides cryptographic operations for Rhythm Chamber security system. Implements AES-GCM encryption, PBKDF2 key derivation (600,000 iterations per OWASP 2024), credential storage with session binding, and session invalidation support.

## Exports

- `deriveKey(password, salt)` - Derive cryptographic key using PBKDF2
- `deriveKeyNonExtractable(password, salt, keyType)` - Derive non-extractable key (KEY-01 compliant)
- `hashData(data)` - SHA-256 hash of data
- `encryptData(data, keyOrPassword)` - Encrypt data using AES-GCM
- `decryptData(encryptedData, keyOrPassword)` - Decrypt AES-GCM data
- `getSessionKey()` - Get session-bound encryption key
- `storeEncryptedCredentials(key, credentials)` - Store credentials with AES-GCM encryption
- `getEncryptedCredentials(key)` - Retrieve and decrypt credentials
- `clearEncryptedCredentials()` - Clear all encrypted credentials
- `getSessionSalt()` - Get or create session salt
- `getSessionVersion()` - Get current session version
- `invalidateSessions()` - Invalidate all sessions (increment version)
- `clearSessionData()` - Full session cleanup
- `generateRandomString(length)` - Generate random string
- `generateSalt(length)` - Generate cryptographically secure salt

## Dependencies

- crypto.subtle - Web Crypto API
- None (core cryptographic functions)

## Used By

TBD

## Notes

Uses 600,000 PBKDF2 iterations (exceeds OWASP 2024 recommendations). All keys are non-extractable per KEY-01 requirement. Session versioning enables invalidation of all encrypted credentials on password changes or security events.