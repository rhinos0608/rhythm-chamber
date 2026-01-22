---
path: /Users/rhinesharar/rhythm-chamber/js/security/index.js
type: module
updated: 2026-01-22
status: active
---

# index.js

## Purpose

Security module facade that aggregates all security subsystems into a unified API while maintaining backward compatibility with the legacy window.Security interface.

## Exports

- `Security` - Unified facade for all security functionality
- `ErrorContext` - Structured error context system with recovery paths
- `SecurityCoordinator` - Central coordinator for security operations
- `SecurityChecklist` - Security checklist and validation system
- `SafeMode` - Safe mode operations and state management
- `Encryption` - Encryption utilities and algorithms
- `TokenBinding` - Token binding and validation
- `Anomaly` - Anomaly detection system
- `KeyManager` - Cryptographic key management
- `StorageEncryption` - Storage layer encryption
- `MessageSecurity` - Message security and sanitization
- `ApiKeyManager` - API key storage and validation

## Dependencies

[[encryption]], [[token-binding]], [[anomaly]], [[key-manager]], [[storage-encryption]], [[message-security]], [[security-coordinator]], [[safe-mode]], [[checklist]], [[api-key-manager]], [[recovery-handlers]]

## Used By

TBD

## Notes

Maintains backward compatibility with window.Security global API while providing modular ES6 imports. Recovery-handlers.js is imported as a side-effect to set up window.RecoveryHandlers.