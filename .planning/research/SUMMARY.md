# Research Summary: Security Hardening

**Research Date:** 2025-01-21
**Milestone:** v0.9 Security Hardening

---

## Executive Summary

Three security areas need hardening before v1.0 launch:

1. **Session Key Management** — Implement proper key derivation with Web Crypto API
2. **Cross-Tab Data Exposure** — Add message signing and validation to BroadcastChannel
3. **Storage Encryption** — Encrypt sensitive data (API keys, chat history) in IndexedDB

**No external libraries required** — Native Web Crypto API provides production-ready implementations.

---

## Key Findings

### Stack
- Use native **Web Crypto API** only (no libraries)
- **PBKDF2** with 100,000+ iterations for key derivation
- **AES-GCM-256** for storage encryption
- **HMAC** for message signing
- All keys must be **non-extractable**

### Features

| Priority | Feature | Complexity |
|----------|---------|------------|
| P1 | Non-extractable keys | Low |
| P1 | PBKDF2 key derivation | Medium |
| P1 | Message signing (HMAC) | Medium |
| P1 | API key encryption | Medium |
| P1 | Chat history encryption | Medium |
| P2 | Key rotation | Medium |
| P2 | Timestamp validation | Low |
| P2 | Message sanitization | Medium |

### Architecture

**New modules needed:**
- `js/security/key-manager.js` — Session key lifecycle
- `js/security/message-security.js` — BroadcastChannel signing
- `js/security/storage-encryption.js` — IndexedDB encryption wrapper

**Integration points:**
- `js/storage/indexeddb.js` — Add encryption wrapper
- `js/services/tab-coordination.js` — Add message signing
- `js/security/secure-token-store.js` — Use storage encryption
- `js/rag.js` — Fix session key storage

**Build order:**
1. Key Manager (foundation for others)
2. Storage Encryption (immediate security impact)
3. Cross-Tab Security (complete the hardening)

### Pitfalls

| Pitfall | Severity | Prevention |
|---------|----------|------------|
| Extractable keys | Critical | Always set `extractable: false` |
| IV reuse | Critical | Use `getRandomValues()` per encryption |
| Timing side channels | High | Use `crypto.subtle.verify()` not string comparison |
| Replay attacks | High | Add timestamps and nonces to messages |
| Keys in localStorage | High | Keep keys in memory only |
| Weak PBKDF2 iterations | High | Use ≥100,000 iterations |
| Missing origin validation | Medium | Validate all BroadcastChannel messages |
| Sensitive data in BroadcastChannel | Medium | Sanitize before sending |

---

## Implementation Estimate

| Phase | Tasks | Estimated Effort |
|-------|-------|------------------|
| 1: Key Foundation | Key Manager, PBKDF2 utilities | 2-3 days |
| 2: Storage Encryption | Encryption wrapper, IndexedDB integration, data migration | 3-4 days |
| 3: Cross-Tab Security | Message signing, TabCoordinator integration | 2-3 days |

**Total: 7-10 days** for all security hardening

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Key rotation breaks data | High | Test migration thoroughly, keep old key until migration complete |
| Performance degradation | Medium | Encrypt only sensitive data, use Web Workers for crypto operations |
| Browser compatibility | Low | Web Crypto API supported in all modern browsers (requires HTTPS) |

---

## Success Criteria

Milestone complete when:

- [ ] All session keys are non-extractable
- [ ] Keys derived via PBKDF2 with ≥100k iterations
- [ ] All BroadcastChannel messages are signed and verified
- [ ] Sensitive IndexedDB data is encrypted (AES-GCM-256)
- [ ] No keys stored in localStorage/sessionStorage
- [ ] Secure context validation exists
- [ ] Detection checklist passes (see PITFALLS.md)

---

## Dependencies

**None** — All features use native Web Crypto API, available in all modern browsers with secure context (HTTPS).

---

## Sources

- Web Crypto API Specification (W3C)
- MDN Web Docs: SubtleCrypto
- "Managing Keys with Web Cryptography API" (Medium, 2024)
- "Best Practices for Key Derivation" (Trail of Bits, 2025)
- OWASP Cryptographic Storage Cheat Sheet
- MDN: BroadcastChannel API

---

*Research summary: 2025-01-21*
