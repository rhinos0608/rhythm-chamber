# Features: Security Hardening

**Research Date:** 2025-01-21
**Focus:** Session key management, cross-tab security, storage encryption

---

## Summary

Security hardening requires three categories of features:
1. **Table Stakes** — Must-have for any secure browser app
2. **Nice-to-Haves** — Additional security measures
3. **Anti-Features** — Things to deliberately avoid

---

## SEC-01: Session Key Management

### Table Stakes (Must Have)

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Non-extractable keys** | Set `extractable: false` on all CryptoKey objects | Low |
| **PBKDF2 key derivation** | Derive session keys from user password/passphrase | Medium |
| **Per-session keys** | Generate new keys for each browser session | Low |
| **In-memory only storage** | Never persist raw keys to disk | Low |
| **Key rotation** | Automatic rotation every 7-30 days | Medium |

### Nice-to-Haves

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Biometric unlock** | Use WebAuthn for key derivation | High |
| **Session timeout** | Clear keys after inactivity period | Low |
| **Key versioning** | Track key versions for data migration | Medium |

### Anti-Features (Do NOT Build)

| Feature | Reason |
|---------|--------|
| **Key export UI** | Users shouldn't export keys; defeats security model |
| **Persistent session keys** | Storing session keys defeats their purpose |
|**Recovery questions** | Weak security; use proper key recovery instead |

---

## SEC-02: Cross-Tab Data Exposure

### Table Stakes (Must Have)

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Message signing** | HMAC signature on all BroadcastChannel messages | Medium |
| **Origin validation** | Verify message.origin matches window.location.origin | Low |
| **Message sanitization** | Remove sensitive data before broadcasting | Medium |
| **Timestamp validation** | Reject stale messages (replay attack prevention) | Low |

### Nice-to-Haves

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Message rate limiting** | Prevent flood attacks via BroadcastChannel | Low |
| **Channel whitelisting** | Only allow specific message types | Low |
| **Audit logging** | Log all cross-tab messages for debugging | Low |

### Anti-Features (Do NOT Build)

| Feature | Reason |
|---------|--------|
| **Plaintext sensitive data** | Never send API keys, chat content via BroadcastChannel |
| **Message content encryption** | Wrong layer; encrypt at rest, not in transit (same origin) |
| **Trusting message sender** | Always verify; malicious tabs can exist in same origin |

---

## SEC-03: Storage Encryption

### Table Stakes (Must Have)

| Feature | Description | Complexity |
|---------|-------------|------------|
| **API key encryption** | Encrypt OpenRouter/other API keys in IndexedDB | Medium |
| **Chat history encryption** | Encrypt conversation history | Medium |
| **AES-GCM-256** | Use authenticated encryption with 256-bit keys | Low |
| **Unique IV per encryption** | Never reuse initialization vectors | Low |
| **Key wrapping** | Wrap persistent keys with session-derived keys | Medium |

### Nice-to-Haves

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Full database encryption** | Encrypt all IndexedDB data | High |
| **Key migration** | Re-encrypt data when rotating keys | High |
| **Secure deletion** | Overwrite encrypted data before deletion | Medium |

### Anti-Features (Do NOT Build)

| Feature | Reason |
|---------|--------|
| **Encrypt everything** | Performance impact; low-value data doesn't need encryption |
| **Custom encryption algorithms** | Always use standard, audited algorithms (AES-GCM) |
| **Key in localStorage** | Never store encryption keys in localStorage (even wrapped) |

---

## Data Classification

### What to Encrypt

| Data | Sensitivity | Encrypt? |
|------|-------------|----------|
| OpenRouter API keys | High | ✅ Yes |
| Gemini API keys | High | ✅ Yes |
| Other LLM API keys | High | ✅ Yes |
| Chat history | Medium | ✅ Yes |
| User preferences | Low | ❌ No |
| Streaming history | Low | ❌ No |
| Personality scores | Low | ❌ No |
| Pattern results | Low | ❌ No |
| Demo mode data | None | ❌ No |

---

## Implementation Order

Recommended build order based on dependencies:

1. **SEC-01 Foundation** — Key derivation utilities (needed by others)
2. **SEC-03 Storage** — Encryption wrapper for IndexedDB
3. **SEC-02 Cross-tab** — Message signing for BroadcastChannel

---

## Success Criteria

Each feature is complete when:

| SEC-01 | Keys are non-extractable, derived via PBKDF2, rotated automatically |
|--------|----------------------------------------------------------|
| SEC-02 | All BroadcastChannel messages are signed and verified |
| SEC-03 | Sensitive data is encrypted at rest with AES-GCM-256 |

---

*Features research: 2025-01-21*
