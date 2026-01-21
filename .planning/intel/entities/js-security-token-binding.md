---
path: /Users/rhinesharar/rhythm-chamber/js/security/token-binding.js
type: service
updated: 2026-01-21
status: active
---

# token-binding.js

## Purpose

XSS token protection layer that mitigates localStorage token theft through device fingerprinting and secure context validation. Binds tokens to device characteristics to prevent unauthorized access.

## Exports

- `generateDeviceFingerprint()` - Generate device/session fingerprint for token binding
- `checkSecureContext()` - Comprehensive secure context validation (HTTPS, localhost, file://)
- `createTokenBinding(token)` - Create token binding after successful auth
- `verifyTokenBinding(token)` - Verify token binding before usage (throws if mismatch)
- `clearTokenBinding()` - Clear token binding on logout
- `calculateProcessingTokenExpiry(spotifyExpiresIn)` - Calculate recommended token expiry
- `checkTokenRefreshNeeded(expiryTime, isProcessing)` - Check if token should be refreshed
- `setupNavigationCleanup()` - Setup cleanup on page navigation

## Dependencies

- crypto.subtle - Web Crypto API for fingerprinting
- crypto.getRandomValues - Random number generation

## Used By

TBD

## Notes

Enhanced validation allows HTTPS, HTTP localhost/127.0.0.1, app://capacitor://, and file:// (with warning). Blocks data://, blob://, and cross-origin iframes. Implements navigation cleanup with tab visibility tracking for extended hidden periods.