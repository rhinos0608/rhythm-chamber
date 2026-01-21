# Requirements: Security Hardening

**Defined:** 2025-01-21
**Core Value:** Your data stays on your device. You control everything.

---

## Milestone v0.9 Requirements

Requirements for security hardening before v1.0 launch.

### Session Key Management

- [x] **KEY-01**: All CryptoKey objects are created with `extractable: false` property
- [x] **KEY-02**: Session keys are derived using PBKDF2 with minimum 100,000 iterations
- [x] **KEY-03**: New session keys are generated for each browser session start
- [x] **KEY-04**: Raw key material is never persisted to localStorage, sessionStorage, or IndexedDB
- [x] **KEY-05**: Session keys are cleared from memory on user logout or session end

### Cross-Tab Security

- [x] **XTAB-01**: All BroadcastChannel messages include HMAC signature
- [x] **XTAB-02**: Received messages have HMAC signature verified before processing
- [x] **XTAB-03**: All BroadcastChannel messages validate origin matches `window.location.origin`
- [x] **XTAB-04**: Sensitive data (API keys, chat content) is removed from messages before broadcast
- [x] **XTAB-05**: BroadcastChannel messages include timestamp for replay attack prevention
- [x] **XTAB-06**: Messages older than 5 seconds are rejected as stale

### Storage Encryption

- [x] **STORE-01**: OpenRouter API keys are encrypted with AES-GCM-256 before IndexedDB storage
- [x] **STORE-02**: Gemini API keys are encrypted with AES-GCM-256 before IndexedDB storage
- [x] **STORE-03**: All LLM provider API keys are encrypted with AES-GCM-256 before IndexedDB storage
- [x] **STORE-04**: Chat history (conversation messages) are encrypted with AES-GCM-256
- [x] **STORE-05**: Each encryption operation uses a unique randomly generated IV
- [x] **STORE-06**: IV is stored alongside ciphertext in IndexedDB
- [x] **STORE-07**: Encrypted data can be decrypted after key rotation (key migration)
- [x] **STORE-08**: Deleted encrypted data is overwritten before removal (secure deletion)

### Security Infrastructure

- [x] **INFRA-01**: Application validates secure context (HTTPS) before crypto operations
- [x] **INFRA-02**: KeyManager module provides centralized key lifecycle management
- [x] **INFRA-03**: MessageSecurity module provides signing and verification utilities
- [x] **INFRA-04**: StorageEncryption module provides encrypt/decrypt wrapper for IndexedDB
- [x] **INFRA-05**: Crypto errors do not leak implementation details in messages

---

## Future Requirements

Deferred to post-v1.0 milestone.

### Session Key Management

- **KEY-R1**: Automated key rotation every 7-30 days
- **KEY-R2**: Session timeout after period of inactivity
- **KEY-R3**: Biometric unlock using WebAuthn

### Cross-Tab Security

- **XTAB-R1**: Message rate limiting to prevent flood attacks
- **XTAB-R2**: Audit logging for all cross-tab messages

### Additional Security

- **SEC-R1**: Content Security Policy headers
- **SEC-R2**: Removal of window global pollution (124+ globals)
- **SEC-R3**: Cross-tab message spoofing tests

---

## Out of Scope

Explicitly excluded from v0.9.

| Feature | Reason |
|---------|--------|
| Full database encryption | Performance impact; low-value data doesn't need encryption |
| Custom encryption algorithms | Must use standard, audited algorithms (AES-GCM) only |
| Biometric authentication | Defer to post-MVP for complexity reduction |
| Automated key rotation | Nice-to-have; can ship manual rotation first |
| CSP implementation | Deploy-time concern; separate from codebase security |

---

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| KEY-01 | Phase 9 | Complete |
| KEY-02 | Phase 9 | Complete |
| KEY-03 | Phase 9 | Complete |
| KEY-04 | Phase 9 | Complete |
| KEY-05 | Phase 9 | Complete |
| XTAB-01 | Phase 14 | Complete |
| XTAB-02 | Phase 14 | Complete |
| XTAB-03 | Phase 14 | Complete |
| XTAB-04 | Phase 14 | Complete |
| XTAB-05 | Phase 14 | Complete |
| XTAB-06 | Phase 14 | Complete |
| STORE-01 | Phase 13 | Complete |
| STORE-02 | Phase 13 | Complete |
| STORE-03 | Phase 13 | Complete |
| STORE-04 | Phase 13 | Complete |
| STORE-05 | Phase 13 | Complete |
| STORE-06 | Phase 13 | Complete |
| STORE-07 | Phase 13 | Complete |
| STORE-08 | Phase 13 | Complete |
| INFRA-01 | Phase 9 | Complete |
| INFRA-02 | Phase 9 | Complete |
| INFRA-03 | Phase 14 | Complete |
| INFRA-04 | Phase 13 | Complete |
| INFRA-05 | Phase 9 | Complete |

**Coverage:**
- v0.9 requirements: 23 total
- Mapped to phases: 23 (after roadmap)
- Unmapped: 0 ✓

---
*Requirements defined: 2025-01-21*
*Last updated: 2025-01-21 after initial definition*
