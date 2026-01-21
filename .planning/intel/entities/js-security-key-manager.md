---
path: /Users/rhinesharar/rhythm-chamber/js/security/key-manager.js
type: service
updated: 2026-01-21
status: active
---

# key-manager.js

## Purpose

Centralized key lifecycle management for Rhythm Chamber security. Provides non-extractable CryptoKey objects for session keys, data encryption keys, and signing keys. All keys use 600,000 PBKDF2 iterations per OWASP 2024 recommendations.

## Exports

- `KeyManager` - Key management service object
- `initializeSession(password)` - Initialize new cryptographic session with derived keys
- `getSessionKey()` - Get session key (non-extractable)
- `getDataEncryptionKey()` - Get data encryption key for storage (non-extractable)
- `getSigningKey()` - Get signing key for HMAC operations (non-extractable)
- `clearSession()` - Clear all session keys from memory
- `isSecureContext()` - Check if running in secure context (INFRA-01)
- `isSessionActive()` - Check if cryptographic session is active

## Dependencies

- crypto.subtle - Web Crypto API for key operations
- crypto.getRandomValues - Secure random number generation

## Used By

TBD

## Notes

All keys are created with extractable: false per KEY-01 requirement. Uses separate key derivation paths with purpose modifiers for cryptographic separation (session vs data vs signing). 600,000 iterations exceeds KEY-02 requirement of 100,000.