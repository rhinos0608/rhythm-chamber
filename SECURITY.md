# Rhythm Chamber Security Model

> **Privacy-First, Zero-Backend Architecture**

This document describes the security model for Rhythm Chamber, a client-side music analysis application that processes Spotify listening data entirely in the browser.

## Core Architecture Principles

### 100% Client-Side Processing
- **No Backend Servers**: All data processing happens in your browser
- **BYOK (Bring Your Own Key)**: Users provide their own API keys
- **Local Storage Only**: Data stays on your device
- **PKCE OAuth**: Secure Spotify authentication without backend

### Trade-offs
True credential revocation and session invalidation require server infrastructure. In exchange for a zero-cost, privacy-first experience, we implement client-side mitigations that provide defense-in-depth without centralized control.

---

## Threat Model

### What We Protect Against

| Threat | Mitigation |
|--------|-----------|
| **Casual DevTools inspection** | AES-GCM encryption for credentials |
| **Credential replay attacks** | Session-bound key derivation |
| **Stale session persistence** | Session versioning with invalidation |
| **Proxy/VPN credential stuffing** | Geographic anomaly detection |
| **Cross-user RAG access** | Namespace isolation per user |
| **Timezone manipulation** | UTC-based time calculations |

### What We Cannot Protect Against

> [!CAUTION]
> **Determined Local Attackers**: A sophisticated attacker with full access to your browser's memory can extract any client-side secrets. This is a fundamental limitation of browser-based apps.

- Full memory introspection
- Browser extension attacks
- Compromised browser
- Physical device access

---

## Security Features

### 1. Credential Encryption (AES-GCM)

RAG credentials (Qdrant API keys) are encrypted using the Web Crypto API with AES-GCM:

```javascript
// Credentials are NEVER stored in plaintext
Security.storeEncryptedCredentials('qdrant_credentials', {
    qdrantUrl: '...',
    qdrantApiKey: '...'
});

// Decryption requires active session
const creds = await Security.getEncryptedCredentials('qdrant_credentials');
```

**Key derivation**: PBKDF2 with 100,000 iterations from session salt + Spotify refresh token + session version.

### 2. Session Versioning & Invalidation

Sessions are bound to a version number that increments on:
- Token refresh failures
- Explicit logout
- Password changes

Old encrypted credentials become undecryptable when the session version changes:

```javascript
// Called automatically on auth failures
Security.invalidateSessions();
```

> [!IMPORTANT]
> **After changing passwords**: Log out of Rhythm Chamber to reset security keys.

### 3. Geographic Anomaly Detection

To detect proxy/VPN-based credential stuffing attacks, we track connection patterns:

- Hash of browser fingerprint (language + timezone + screen size)
- **No IP addresses stored**
- Triggers: >3 distinct patterns in 1 hour + failed attempts

```javascript
const suspicious = await Security.checkSuspiciousActivity('embedding');
if (suspicious.geoAnomaly) {
    // Block with reduced threshold
}
```

### 4. Rate Limiting

Client-side rate limiting prevents abuse of embedding APIs:

```javascript
if (Security.isRateLimited('embedding', 5)) {
    throw new Error('Rate limited');
}
```

### 5. Namespace Isolation

RAG collections are isolated per user using a hash of their Spotify user ID:

```javascript
// Collection: rhythm_chamber_a1b2c3d4
const collection = await RAG.getCollectionName();
```

---

## Attack Scenarios & Mitigations

### Scenario: DevTools Credential Theft
**Attack**: Open DevTools → localStorage → copy API key

**Mitigation**: Credentials are AES-GCM encrypted. Attacker sees:
```
rhythm_chamber_encrypted_creds: {"qdrant_credentials":{"cipher":"ZnVja3lvdXRoaXNpc2VuY3J5cHRlZA==..."}}
```

Without the active session key, decryption fails.

---

### Scenario: Session Hijacking After Password Change
**Attack**: Steal old session → use after victim changes password

**Mitigation**: 
1. Session version increments on any auth failure
2. Old encrypted credentials become undecryptable
3. User must re-authenticate and re-enter credentials

---

### Scenario: Proxy-Based Credential Stuffing
**Attack**: Use 100 VPN servers to bypass rate limiting

**Mitigation**:
1. Connection fingerprint hash tracked
2. >3 distinct fingerprints in 1 hour triggers "geographic anomaly"
3. Rate limit threshold reduced by 50%
4. Additional failures result in lockout

---

## Data Privacy Controls

### Session-Only Mode
```javascript
Storage.setSessionOnlyMode(true);
// Data only lives in memory - cleared on tab close
```

### Sensitive Data Cleanup
```javascript
await Storage.clearSensitiveData();
// Clears: raw streams, credentials, checkpoints
// Keeps: aggregated chunks, personality profile
```

### Transparency
```javascript
const summary = await Storage.getDataSummary();
// { streamCount, chunkCount, hasPersonality, estimatedSizeMB, ... }
```

---

## Responsible Disclosure

If you discover a security vulnerability in Rhythm Chamber:

1. **Do not** create a public GitHub issue
2. Email the maintainers with details
3. Allow 90 days for patch before public disclosure

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-12 | Initial security model |
