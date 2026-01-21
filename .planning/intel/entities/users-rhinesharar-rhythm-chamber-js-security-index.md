---
path: /Users/rhinesharar/rhythm-chamber/js/security/index.js
type: module
updated: 2026-01-21
status: active
---

# index.js

## Purpose

Facade module that aggregates all security modules into a unified API while maintaining backward compatibility with the window.Security API.

## Exports

- **Security** - Main security facade providing access to all security subsystems
- **ErrorContext** - Structured error creation system with recovery paths
- **SecurityCoordinator** - Central coordinator for security operations
- **SecurityChecklist** - Security validation and checklist system
- **SafeMode** - Safe mode functionality for degraded security states
- **Encryption** - Encryption utilities and operations
- **TokenBinding** - Token binding security mechanisms
- **Anomaly** - Anomaly detection system
- **KeyManager** - Cryptographic key management
- **StorageEncryption** - Storage layer encryption
- **MessageSecurity** - Message validation and security

## Dependencies

[[encryption]], [[token-binding]], [[anomaly]], [[key-manager]], [[storage-encryption]], [[message-security]], [[security-coordinator]], [[safe-mode]], [[checklist]], [[recovery-handlers]]

## Used By

TBD

## Notes

Maintains backward compatibility with window.Security API while providing modular architecture. ErrorContext includes recovery path mapping and user-friendly messages for various security-related error conditions.