# Roadmap: Rhythm Chamber v0.9 Security Hardening

**Created:** 2025-01-21
**Milestone:** v0.9 Security Hardening
**Previous Phases:** 1-8 (MVP development, completed)

---

## Overview

6 phases to address security gaps before v1.0 launch.

| Phase | Name | Goal | Requirements | Status |
|-------|------|------|--------------|--------|
| 9 | Key Foundation | Establish secure key lifecycle | KEY-01 through KEY-05, INFRA-01, INFRA-02, INFRA-05 | ✓ Complete |
| 10 | Storage Encryption | Encrypt sensitive data at rest | STORE-01 through STORE-08, INFRA-04 | ✗ Not Started |
| 11 | Cross-Tab Security | Secure BroadcastChannel communications | XTAB-01 through XTAB-06, INFRA-03 | ✗ Not Started |
| 12 | KeyManager Integration | Complete Security facade exports | Integration Gap #1, Flow #3 | ○ Gap Closure |
| 13 | Storage Encryption Impl | Implement storage encryption | STORE-01 through STORE-08, Integration Gap #2 | ○ Gap Closure |
| 14 | Cross-Tab Security Impl | Implement message signing | XTAB-01 through XTAB-06, Integration Gap #3 | ○ Gap Closure |

**Total:** 23 requirements + 3 integration gaps + 3 flow fixes mapped to 6 phases

**Audit Status:** Phase 9 complete (8/8 reqs). Phases 10-11 not implemented. Gap closure phases 12-14 created via v0.9-MILESTONE-AUDIT.md.

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
| 9 | ✓ | 4 | 100% (Key Foundation complete) |
| 10 | ✗ | 0 | 0% (Not started - audit gap) |
| 11 | ✗ | 0 | 0% (Not started - audit gap) |
| 12 | ○ | 0 | 0% (Gap closure phase) |
| 13 | ○ | 0 | 0% (Gap closure phase) |
| 14 | ○ | 0 | 0% (Gap closure phase) |

---

## Next Milestone

After v0.9 Security Hardening:

**v1.0 Launch**
- OG tags for social sharing
- Production deployment (Vercel)
- Beta user acquisition

---

## Phase 12: KeyManager Integration (Gap Closure)

**Goal:** Complete KeyManager integration in Security facade to enable Phases 13-14.

**Requirements Closes:** Integration Gap #1, Flow #3 partial

**Audit Findings:**
- KeyManager creates data encryption and signing keys but doesn't export them
- Facade confusion: Encryption.getSessionKey vs KeyManager.getSessionKey
- Other security modules cannot access keys needed for storage/message encryption

**Success Criteria:**
1. Security facade exports getDataEncryptionKey and getSigningKey
2. getSessionKey naming conflict resolved and documented
3. All callers updated to use correct key access methods

**Tasks:**
- Add to `js/security/index.js`: export KeyManager.getDataEncryptionKey
- Add to `js/security/index.js`: export KeyManager.getSigningKey
- Add to `js/security/index.js`: export KeyManager.getSessionKey as getSessionKeyKM
- Deprecate Encryption.getSessionKey (update all callers)
- Document which getSessionKey implementation to use
- Update all callers throughout codebase

**Files to Modify:**
- `js/security/index.js` (add KeyManager exports)
- All files calling Encryption.getSessionKey or KeyManager.getSessionKey

**Estimated Effort:** 2-4 hours

---

## Phase 13: Storage Encryption Implementation (Gap Closure)

**Goal:** Implement storage encryption for API keys and chat history.

**Requirements Closes:** STORE-01 through STORE-08, Integration Gap #2, Flow #1

**Audit Findings:**
- API keys stored unencrypted in IndexedDB CONFIG store
- Chat history stored unencrypted in CHAT_SESSIONS store
- No StorageEncryption module exists
- ConfigAPI has no encryption integration points

**Success Criteria:**
1. All LLM provider API keys encrypted with AES-GCM-256
2. Chat history encrypted with unique IV per operation
3. ConfigAPI wraps put/get with encryption/decryption
4. Existing plaintext API keys migrated to encrypted format
5. Secure deletion implemented for encrypted data

**Tasks:**
- Create `js/security/storage-encryption.js` module
- Implement shouldEncrypt(key, value) for data classification
- Implement encryptData(data, key) with AES-GCM-256
- Implement decryptData(encryptedData, key) with IV extraction
- Implement unique IV generation per encryption (STORE-05)
- Implement IV storage alongside ciphertext (STORE-06)
- Implement migrateData(oldKey, newKey) for key rotation (STORE-07)
- Implement secureDelete(storeName, key) for overwrite (STORE-08)
- Integrate into `js/storage/config-api.js`
- Add encryptValue() wrapper in setConfig()
- Add decryptValue() wrapper in getConfig()
- Migrate existing plaintext API keys to encrypted storage

**Files to Create/Modify:**
- `js/security/storage-encryption.js` (new)
- `js/storage/config-api.js` (integrate encryption)
- `js/storage/indexeddb.js` (optional: wrap CONFIG store operations)

**Estimated Effort:** 16-24 hours

---

## Phase 14: Cross-Tab Security Implementation (Gap Closure)

**Goal:** Implement message signing and verification for cross-tab communication.

**Requirements Closes:** XTAB-01 through XTAB-06, Integration Gap #3, Flow #2

**Audit Findings:**
- BroadcastChannel messages lack HMAC signatures
- No message verification on receive
- No origin validation
- No timestamp validation for replay prevention
- No MessageSecurity module exists

**Success Criteria:**
1. All BroadcastChannel messages include HMAC-SHA256 signature
2. Received messages verified before processing
3. Origin validated on all received messages
4. Sensitive data sanitized from broadcast messages
5. Messages older than 5 seconds rejected
6. Nonce tracking prevents replay attacks

**Tasks:**
- Create `js/security/message-security.js` module
- Implement signMessage(message) using HMAC-SHA256
- Implement verifyMessage(message, signature) using HMAC-SHA256
- Implement sanitizeMessage(message) to remove sensitive data
- Implement validateTimestamp(message) with 5-second window
- Add nonce tracking for replay attack prevention
- Integrate into `js/services/tab-coordination.js`
- Add signMessage() call in sendMessage()
- Add verifyMessage() call in createMessageHandler()
- Add origin validation in message handler
- Add timestamp validation with 5-second window

**Files to Create/Modify:**
- `js/security/message-security.js` (new)
- `js/services/tab-coordination.js` (integrate signing/verification)

**Estimated Effort:** 12-16 hours

---

## Gap Closure Summary

**Total Gap Closure Effort:** 30-44 hours (3 phases, 23 tasks)

| Phase | Gap Type | Requirements | Tasks | Effort |
|-------|----------|--------------|-------|--------|
| 12 | Integration | Gap #1, Flow #3 | 6 | 2-4h |
| 13 | Implementation | STORE-01 to STORE-08, Gap #2, Flow #1 | 12 | 16-24h |
| 14 | Implementation | XTAB-01 to XTAB-06, Gap #3, Flow #2 | 11 | 12-16h |

**All gaps are CRITICAL priority and block v1.0 launch.**

---
*Roadmap created: 2025-01-21*
*Updated: 2026-01-21 - Gap closure phases 12-14 added after audit*
