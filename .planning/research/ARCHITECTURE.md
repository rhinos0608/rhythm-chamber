# Architecture: Security Hardening

**Research Date:** 2025-01-21
**Focus:** Integration with existing HNW architecture

---

## Current Security Architecture

```
js/security/
├── index.js              # Module exports
├── encryption.js         # Basic encryption utilities
├── token-binding.js      # Token binding for API keys
├── anomaly.js            # Anomaly detection
├── secure-token-store.js # Token storage with fallback
└── recovery-handlers.js  # Recovery handlers
```

**Current capabilities:**
- Token binding (cryptographic association with browser)
- Secure token storage with fallback mechanisms
- Basic encryption utilities
- Anomaly detection

---

## Integration Architecture

### New Security Module Structure

```
js/security/
├── index.js                      # Extended exports
├── encryption.js                 # EXTEND: Add key derivation, rotation
├── key-manager.js                # NEW: Session key lifecycle
├── message-security.js           # NEW: BroadcastChannel signing
├── storage-encryption.js         # NEW: IndexedDB encryption wrapper
├── token-binding.js              # (unchanged)
├── anomaly.js                    # (unchanged)
├── secure-token-store.js         # EXTEND: Use storage-encryption
└── recovery-handlers.js          # (unchanged)
```

---

## Data Flow Changes

### Session Key Lifecycle

```
User Session Start
         │
         ▼
[Key Manager] Derive session key (PBKDF2)
         │
         ├─► [Memory] Non-extractable CryptoKey
         │
         ├─► [Storage Encryption] Derive data encryption key
         │
         └─► [Message Security] Derive signing key
```

### Cross-Tab Message Flow (Enhanced)

```
Tab A                          Tab B
  │                              │
  │ 1. Create message            │
  │ 2. Sign with HMAC            │
  │                              │
  ├────────────────────────────►│
  │    BroadcastChannel          │
  │                              │
  │                    3. Verify signature
  │                    4. Validate origin
  │                    5. Check timestamp
  │                    6. Process message
```

### Storage Encryption Flow

```
Application
     │
     ▼
[Storage Encryption Layer]
     │
     ├─► Is data sensitive?
     │    │
     │    ├─ Yes → Encrypt with AES-GCM
     │    │         │
     │    │         └─► IndexedDB (encrypted)
     │    │
     │    └─ No → IndexedDB (plaintext)
     │
     └─► On read: Decrypt if encrypted
```

---

## Component Integration Points

### 1. Key Manager (NEW)

**Purpose:** Centralize session key lifecycle

**Dependencies:**
- Web Crypto API
- Existing `encryption.js` utilities

**Used by:**
- `storage-encryption.js` (data encryption key)
- `message-security.js` (signing key)
- `secure-token-store.js` (API key wrapping)

**Interface:**
```javascript
class KeyManager {
  async deriveSessionKey(password, salt)      // PBKDF2 derivation
  async getDataEncryptionKey()                 // Wrapped key for storage
  async getSigningKey()                        // HMAC key for messages
  async rotateKeys()                           // Key rotation
  async clearSession()                         // Cleanup on logout
}
```

### 2. Message Security (NEW)

**Purpose:** Secure BroadcastChannel communications

**Dependencies:**
- `KeyManager` (for signing key)
- `js/services/tab-coordination.js` (integration point)

**Interface:**
```javascript
class MessageSecurity {
  async signMessage(message)                   // Add HMAC signature
  async verifyMessage(message)                 // Verify signature
  sanitizeMessage(message)                     // Remove sensitive data
  validateTimestamp(message)                   // Replay protection
}
```

**Integration with TabCoordinator:**
```javascript
// In js/services/tab-coordination.js
import { MessageSecurity } from '../security/message-security.js'

// Wrap broadcast
const originalBroadcast = channel.postMessage
channel.postMessage = (data) => {
  const signed = MessageSecurity.sign(data)
  originalBroadcast(signed)
}
```

### 3. Storage Encryption (NEW)

**Purpose:** Encrypt sensitive IndexedDB data

**Dependencies:**
- `KeyManager` (for data encryption key)
- `js/storage/indexeddb.js` (integration point)

**Interface:**
```javascript
class StorageEncryption {
  async encrypt(data)                          // AES-GCM encrypt
  async decrypt(encryptedData)                  // AES-GCM decrypt
  shouldEncrypt(key, value)                    // Data classification
}
```

**Integration with IndexedDB:**
```javascript
// In js/storage/indexeddb.js
import { StorageEncryption } from '../security/storage-encryption.js'

// Wrap put operations
async put(storeName, key, value) {
  if (StorageEncryption.shouldEncrypt(key, value)) {
    value = await StorageEncryption.encrypt(value)
  }
  return db.put(storeName, value)
}
```

---

## Build Order

Recommended implementation sequence:

### Phase 1: Key Foundation
1. Create `js/security/key-manager.js`
2. Extend `js/security/encryption.js` with PBKDF2 utilities
3. Add key rotation scheduling

### Phase 2: Storage Encryption
1. Create `js/security/storage-encryption.js`
2. Integrate with `js/storage/indexeddb.js`
3. Migrate existing sensitive data (API keys)
4. Update `js/security/secure-token-store.js` to use encryption

### Phase 3: Cross-Tab Security
1. Create `js/security/message-security.js`
2. Integrate with `js/services/tab-coordination.js`
3. Add message sanitization

---

## Error Handling

### Security Failures (Fail-Closed)

| Failure | Action |
|---------|--------|
| Key derivation fails | Abort session, show error |
| Message verification fails | Drop message, log attempt |
| Decryption fails | Assume data corruption, prompt user |
| Non-secure context | Disable app, show HTTPS requirement |

### Degradation Strategy

For non-critical security features:
- Message signing → Log warning, continue (dev mode only)
- Key rotation → Retry with exponential backoff

---

## Testing Considerations

### Unit Tests Needed
- Key derivation with known test vectors
- Message signing/verification round-trip
- Encryption/decryption round-trip
- Key rotation preserves data accessibility

### Integration Tests Needed
- Cross-tab message with invalid signature rejected
- Stored API keys encrypted and decryptable
- Key rotation doesn't break existing encrypted data

---

*Architecture research: 2025-01-21*
