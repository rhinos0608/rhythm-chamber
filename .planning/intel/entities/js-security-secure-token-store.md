---
path: /Users/rhinesharar/rhythm-chamber/js/security/secure-token-store.js
type: service
updated: 2026-01-21
status: active
---

# secure-token-store.js

## Purpose

Single authority token management with mandatory device binding verification. All token operations require binding verification - impossible to bypass. Provides audit logging and automatic token invalidation on binding mismatch.

## Exports

- `SecureTokenStore` - Secure token store service
- `isAvailable()` - Check if secure context is available
- `init()` - Initialize the store
- `store(tokenKey, value, options)` - Store token with mandatory binding
- `retrieve(tokenKey)` - Retrieve token with binding verification (returns null if binding fails)
- `retrieveWithOptions(tokenKey)` - Retrieve token with full options (expiry, metadata)
- `invalidate(tokenKey)` - Invalidate specific token
- `invalidateAllTokens(reason)` - Invalidate ALL tokens (security breach response)
- `verifyBinding()` - Verify device binding (MANDATORY before any operation)
- `getAuditLog()` - Get audit log
- `clearAuditLog()` - Clear audit log
- `getStatus()` - Get store status (uses read-only binding check)

## Dependencies

- [[js-storage-indexeddb]] - IndexedDB operations for token storage
- crypto.subtle - Web Crypto API for fingerprinting
- crypto.randomUUID - Stable device ID generation
- localStorage/sessionStorage - Binding and audit storage

## Used By

TBD

## Notes

Uses stable UUID-based device fingerprint stored in localStorage for reliability. Every token operation (store/retrieve/invalidate) requires binding verification - no bypass possible. Automatic token invalidation on fingerprint mismatch prevents token theft.