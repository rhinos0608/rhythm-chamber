# Rhythm Chamber Security Model

> **Your AI writes your musical story. Every time you visit. On your device. Watching you evolve.**

This document describes the security model for Rhythm Chamber, a client-side music analysis application that processes Spotify listening data entirely in the browser. Our security model is built on three layers: **Emotional Value**, **Privacy Value**, and **Control Value**.

## Core Architecture Principles

### 100% Client-Side Processing
- **No Backend Servers**: All data processing happens in your browser
- **BYOI (Bring Your Own Intelligence)**: Users choose local/offline models or supply their own API keys
- **Local Storage Only**: Data stays on your device
- **PKCE OAuth**: Secure Spotify authentication without backend

### Trade-offs
True credential revocation and session invalidation require server infrastructure. In exchange for a zero-cost, privacy-first experience, we implement client-side mitigations that provide defense-in-depth without centralized control.

---

## The Three-Layer Security Value Stack

### Layer 1: Emotional Value
**Your AI notices your patterns. Writes personalized narratives. Witnesses your evolution. Creates meaning from data.**

Security enables emotional value by:
- **Preserving narrative continuity**: Your AI witness maintains context across sessions
- **Protecting personal stories**: Your musical journey remains private and intact
- **Enabling deep reflection**: Safe exploration of emotional patterns without external judgment

### Layer 2: Privacy Value
**Data never leaves your device. Your AI, not a company's AI. Structurally private by design. Verifiable through open source.**

Security enables privacy value by:
- **Zero data transmission**: No servers, no cloud storage, no data collection
- **Client-side encryption**: AES-GCM encryption for credentials
- **Session isolation**: Each browser session is cryptographically isolated
- **Transparent architecture**: Open source code allows verification

### Layer 3: Control Value
**Choose your AI provider. Own your data completely. No vendor lock-in. Full transparency.**

Security enables control value by:
- **User-owned intelligence**: You control the AI model and API keys
- **Data sovereignty**: You own your data completely
- **No lock-in**: Export anytime, switch providers freely
- **Full transparency**: See exactly how your data is processed

---

## Threat Model

### What We Protect Against

| Threat | Mitigation | Value Layer |
|--------|-----------|-------------|
| **Casual DevTools inspection** | AES-GCM encryption for credentials | Privacy |
| **Credential replay attacks** | Session-bound key derivation | Privacy |
| **Stale session persistence** | Session versioning with invalidation | Privacy |
| **Proxy/VPN credential stuffing** | Geographic anomaly detection | Privacy |
| **Timezone manipulation** | UTC-based time calculations | Privacy |
| **XSS token theft** | Device fingerprint binding | Privacy |
| **Token hijacking** | Secure context enforcement | Privacy |
| **False positive lockouts** | Travel-aware adaptive thresholds | Privacy |
| **Narrative corruption** | Checksum validation for AI context | Emotional |
| **Story fragmentation** | Session continuity preservation | Emotional |

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

**WASM-Only Architecture**: Semantic search now uses 100% client-side local embeddings (WASM-based). No external credentials or cloud services are required for RAG functionality.

Previously, RAG credentials (Qdrant API keys) were encrypted using the Web Crypto API with AES-GCM. This infrastructure remains available for future extensions if needed:

```javascript
// Credentials are NEVER stored in plaintext
Security.storeEncryptedCredentials('service_credentials', {
    apiKey: '...',
    apiUrl: '...'
});

// Decryption requires active session
const creds = await Security.getEncryptedCredentials('service_credentials');
```

**Key derivation**: PBKDF2 with 600,000 iterations from session salt + Spotify refresh token + session version.

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

### 3. XSS Token Protection (NEW)

Spotify access tokens are bound to device fingerprints to mitigate localStorage theft:

```javascript
// Token binding created on successful OAuth
await Security.createTokenBinding(accessToken);

// Verified before EVERY API call
await Security.verifyTokenBinding(token);  // Throws on mismatch
```

**Components of device fingerprint:**
- Browser language
- Platform
- Timezone
- Screen resolution
- Hardware concurrency
- Session salt (unique per browser session)

**Secure context enforcement:**
```javascript
const check = Security.checkSecureContext();
if (!check.secure) {
    throw new Error(check.reason);
    // Blocks: insecure contexts, cross-origin iframes, data:/blob: protocols
}
```

### 4. Geographic Anomaly Detection

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

**Travel-aware adaptive thresholds:**
```javascript
// Adjusts lockout thresholds based on change patterns:
// - >10 min between geo changes = likely travel (1.5x tolerance)
// - <1 min between changes = likely attack (0.5x threshold)
const threshold = Security.calculateAdaptiveThreshold(5, 'embedding');
```

### 5. Rate Limiting

Client-side rate limiting prevents abuse of embedding APIs:

```javascript
if (Security.isRateLimited('embedding', 5)) {
    throw new Error('Rate limited');
}
```

### 6. Obfuscation vs Encryption

> [!IMPORTANT]
> Rhythm Chamber uses **two different protection levels** depending on data sensitivity:

| Method | Algorithm | Use Case | Threat Model |
|--------|-----------|----------|-------------|
| **Obfuscation** | XOR with session salt | Non-critical data | Casual inspection |
| **Encryption** | AES-GCM 256-bit | API keys, credentials | DevTools/memory attack |

**Obfuscation** (`Security.obfuscate()`) uses simple XOR with a session salt. It prevents casual reading but is NOT cryptographically secure.

**Encryption** (`Security.encryptData()`) uses AES-GCM with PBKDF2 key derivation (600k iterations). This is real encryption, though keys are still client-side.

### 7. Unified Error Context (NEW)

Structured error handling with recovery paths:

```javascript
const error = Security.ErrorContext.create('GEO_LOCKOUT', 'Too many location changes', {
    isLikelyTravel: true,
    cooldownMinutes: 60
});
// Returns: { code, rootCause, recoveryPath, userMessage, severity, ... }
```

### 8. Navigation Cleanup

Tab visibility and navigation events are monitored for suspicious patterns:

- Extended hidden tab periods (>30 min) trigger re-auth suggestion
- Page unload events are logged for audit trail

### 9. Fail-Closed Architecture (Safe Mode) (NEW)
**Problem**: If security modules fail to load (e.g., spotty connection), the app should not fallback to unencrypted storage.

**Solution**:
- **Safe Mode**: When security modules fail, the app enters "Safe Mode".
- **Visual Warning**: An orange banner alerts the user.
- **Functionality Lock**: Data persistence (writing to storage) is **disabled**.
- **Result**: You can browse existing data (read-only) but new sensitive data (credentials, checkpoints) is NEVER saved unencrypted.

---

### 10. Security Checklist (First-Run Waiver) (NEW)

To ensure users understand the client-side security model, a mandatory checklist appears on first run:

- **Education**: Users explicitly acknowledge that "Your device's security is your responsibility."
- **Expectation Setting**: Clarifies that we cannot protect against OS-level compromises (keyloggers, screen capture).
- **Best Practices**: Recommends HTTPS, disabling extensions, and avoiding public computers.

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

### Scenario: XSS Token Theft (NEW)
**Attack**: Inject script to steal Spotify access token from localStorage

**Mitigation**:
1. Token is bound to device fingerprint at creation
2. Every API request verifies fingerprint match
3. Fingerprint includes session-specific salt (different per browser tab/session)
4. Mismatch triggers immediate session invalidation + token clearing
5. Attacker's stolen token fails verification on different device/session

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

### Scenario: Legitimate Travel Lockout (NEW)
**Issue**: User travels to new location, gets locked out

**Mitigation (Adaptive Thresholds)**:
1. Time between geo changes analyzed
2. >10 min between changes = travel pattern detected
3. Threshold increased by 50% for traveling users
4. Clear error messages with wait time estimates

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
| 1.4 | 2026-01-18 | Updated to reflect WASM-only semantic search (removed Qdrant cloud dependency) |
| 1.3 | 2026-01-15 | Updated to reflect three-layer value stack (Emotional, Privacy, Control) |
| 1.2 | 2026-01-13 | Clarified obfuscation vs encryption, removed namespace isolation (user owns Qdrant) |
| 1.1 | 2026-01-12 | XSS token protection, adaptive lockouts, unified errors |
| 1.0 | 2026-01-12 | Initial security model |
