# Roadmap: Rhythm Chamber v0.9 Security Hardening

**Created:** 2025-01-21
**Milestone:** v0.9 Security Hardening
**Previous Phases:** 1-8 (MVP development, completed)

---

## Overview

3 phases to address security gaps before v1.0 launch.

| Phase | Name | Goal | Requirements |
|-------|------|------|--------------|
| 9 | Key Foundation | Establish secure key lifecycle | KEY-01 through KEY-05, INFRA-01, INFRA-02, INFRA-05 |
| 10 | Storage Encryption | Encrypt sensitive data at rest | STORE-01 through STORE-08, INFRA-04 |
| 11 | Cross-Tab Security | Secure BroadcastChannel communications | XTAB-01 through XTAB-06, INFRA-03 |

**Total:** 23 requirements mapped to 3 phases

---

## Phase 9: Key Foundation

**Goal:** Establish secure key lifecycle management as foundation for other security features.

**Requirements:** KEY-01, KEY-02, KEY-03, KEY-04, KEY-05, INFRA-01, INFRA-02, INFRA-05

**Success Criteria:**
1. KeyManager module creates non-extractable CryptoKey objects
2. Keys are derived using PBKDF2 with 100,000+ iterations
3. New session keys are generated on each browser session start
4. Raw key material is never persisted to storage
5. Secure context validation blocks crypto operations on non-HTTPS

**Plans:**
- [ ] 09-01-PLAN.md — Create KeyManager module with non-extractable key lifecycle
- [ ] 09-02-PLAN.md — Extend encryption.js with PBKDF2 utilities
- [ ] 09-03-PLAN.md — Integrate KeyManager into Security facade
- [ ] 09-04-PLAN.md — Wire KeyManager into main.js bootstrap and settings.js logout

**Files to Create/Modify:**
- `js/security/key-manager.js` (new)
- `js/security/encryption.js` (extend)
- `js/security/index.js` (add KeyManager export)
- `js/main.js` (add KeyManager initialization)
- `js/settings.js` (add KeyManager cleanup)

---

## Phase 10: Storage Encryption

**Goal:** Encrypt sensitive data (API keys, chat history) in IndexedDB.

**Requirements:** STORE-01, STORE-02, STORE-03, STORE-04, STORE-05, STORE-06, STORE-07, STORE-08, INFRA-04

**Success Criteria:**
1. All LLM provider API keys are encrypted before IndexedDB storage
2. Chat history is encrypted with AES-GCM-256
3. Each encryption uses a unique IV stored with ciphertext
4. Existing encrypted data can be decrypted after key rotation
5. Deleted encrypted data is overwritten before removal

**Tasks:**
- Create `js/security/storage-encryption.js` module
- Implement `encrypt(data)` using AES-GCM-256
- Implement `decrypt(encryptedData)` using AES-GCM-256
- Implement `shouldEncrypt(key, value)` for data classification
- Implement `migrateData(oldKey, newKey)` for key rotation
- Implement `secureDelete(storeName, key)` for overwriting
- Integrate with `js/storage/indexeddb.js` (wrap put/get operations)
- Migrate existing API keys to encrypted storage
- Update `js/security/secure-token-store.js` to use encryption

**Files to Create/Modify:**
- `js/security/storage-encryption.js` (new)
- `js/storage/indexeddb.js` (integrate encryption)
- `js/security/secure-token-store.js` (use encryption)

---

## Phase 11: Cross-Tab Security

**Goal:** Secure BroadcastChannel communications against malicious tabs.

**Requirements:** XTAB-01, XTAB-02, XTAB-03, XTAB-04, XTAB-05, XTAB-06, INFRA-03

**Success Criteria:**
1. All BroadcastChannel messages include HMAC signature
2. Received messages have signature verified before processing
3. Origin is validated on all received messages
4. Sensitive data is sanitized from broadcast messages
5. Messages older than 5 seconds are rejected

**Tasks:**
- Create `js/security/message-security.js` module
- Implement `signMessage(message)` using HMAC
- Implement `verifyMessage(message)` using HMAC
- Implement `sanitizeMessage(message)` to remove sensitive data
- Implement `validateTimestamp(message)` with 5-second window
- Integrate with `js/services/tab-coordination.js`
- Add nonce tracking for replay attack prevention
- Add timestamp to all BroadcastChannel messages

**Files to Create/Modify:**
- `js/security/message-security.js` (new)
- `js/services/tab-coordination.js` (integrate signing)

---

## Progress

| Phase | Status | Plans | Progress |
|-------|--------|-------|----------|
| 1-8 | ✓ | 8 | 100% (MVP complete) |
| 9 | ○ | 4 | 0% |
| 10 | ○ | 0 | 0% |
| 11 | ○ | 0 | 0% |

---

## Next Milestone

After v0.9 Security Hardening:

**v1.0 Launch**
- OG tags for social sharing
- Production deployment (Vercel)
- Beta user acquisition

---
*Roadmap created: 2025-01-21*
*Updated: 2026-01-21 - Phase 9 plans created*
