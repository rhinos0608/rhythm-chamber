---
path: /Users/rhinesharar/rhythm-chamber/js/security/secure-token-store.js
type: module
updated: 2026-01-21
status: active
---

# secure-token-store.js

## Purpose

Single authority token management with mandatory device binding verification, automatic token invalidation on binding mismatch, and comprehensive audit logging.

## Exports

- **SecureTokenStore** - Main token management class with device binding, audit logging, and secure context enforcement

## Dependencies

- [[indexeddb]]

## Used By

TBD

## Notes

Enforces secure context requirements with fallback mode. Uses device fingerprinting via stable UUID-based binding. All token operations must go through this module; direct localStorage/IndexedDB access for tokens is forbidden.