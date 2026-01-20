# Stack: Security Hardening

**Research Date:** 2025-01-21
**Focus:** Web Crypto API, BroadcastChannel security, IndexedDB encryption

---

## Summary

Use native Web Crypto API for all cryptographic operations. No additional libraries required. The browser provides production-ready implementations of key derivation, encryption/decryption, and signing.

---

## Key Derivation (SEC-01)

### Web Crypto API Methods

```javascript
// Key derivation with PBKDF2
crypto.subtle.deriveKey(
  {
    name: "PBKDF2",
    salt: saltBuffer,
    iterations: 100000,
    hash: "SHA-256"
  },
  passwordKey,
  { name: "AES-GCM", length: 256 },
  false,  // extractable = FALSE (critical)
  ["encrypt", "decrypt"]
)
```

### Best Practices

| Practice | Rationale |
|----------|-----------|
| **Set `extractable: false`** | Keys cannot be exported via JS, preventing memory dump extraction |
| **Use PBKDF2 with 100k+ iterations** | Industry standard for password-based key derivation |
| **Per-session key derivation** | Limit exposure window; derive new keys for each session |
| **Key rotation every 7-30 days** | Reduce impact of compromised keys via automated rotation |

### Key Storage

- **In-memory only** for session keys (never persist to storage)
- Use `sessionStorage` only for key references, never raw keys
- Mark keys as non-extractable to prevent serialization

---

## Message Signing (SEC-02)

### BroadcastChannel Security

BroadcastChannel API provides same-origin messaging but **no built-in security**. Must implement:

```javascript
// Message signing with HMAC
const signature = await crypto.subtle.sign(
  "HMAC",
  signingKey,
  messageBuffer
)

// Message validation on receive
const isValid = await crypto.subtle.verify(
  "HMAC",
  signingKey,
  signature,
  messageBuffer
)
```

### Origin Validation

```javascript
// Always validate message structure
function validateMessage(message) {
  return message &&
         typeof message === 'object' &&
         message.origin === window.location.origin &&
         message.signature &&
         message.timestamp  // Prevent replay attacks
}
```

### What NOT to Use

- ❌ Do NOT use external crypto libraries for signing (native Web Crypto is faster, better audited)
- ❌ Do NOT trust message content without signature verification
- ❌ Do NOT send sensitive data plaintext through BroadcastChannel

---

## Storage Encryption (SEC-03)

### IndexedDB Encryption Strategy

| Data Type | Encrypt? | Method |
|-----------|----------|--------|
| User API keys | ✅ Yes | AES-GCM-256 |
| Chat history | ✅ Yes | AES-GCM-256 |
| Personality data | ❌ No | Not sensitive |
| Streaming history | ❌ No | Not sensitive |
| Pattern results | ❌ No | Not sensitive |

### AES-GCM Encryption Pattern

```javascript
// Encrypt for IndexedDB storage
const encrypted = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv: iv },
  encryptionKey,
  plaintextBuffer
)

// Store as: { iv, ciphertext, tag }
// IV must be unique per encryption (never reuse)
```

### Key Wrap for Persistent Keys

For keys that must persist (e.g., user API keys):

```javascript
// Wrap a key with a session-derived key
const wrappedKey = await crypto.subtle.wrapKey(
  "raw",  // exportable format
  keyToWrap,
  wrappingKey,  // session-derived, non-extractable
  "AES-KW"
)
```

---

## Integration Points

### Existing Security Module

`js/security/` already has:
- `encryption.js` - Basic encryption utilities
- `secure-token-store.js` - Token binding and storage
- `index.js` - Security module exports

**Approach:** Extend existing modules rather than replace.

### Files to Modify

| File | Changes |
|------|---------|
| `js/security/encryption.js` | Add key derivation, key rotation |
| `js/security/` | Add message signing utilities |
| `js/storage/indexeddb.js` | Add encryption wrapper for sensitive data |
| `js/services/tab-coordination.js` | Add message signing/verification |
| `js/rag.js` | Fix session key storage (move to non-extractable keys) |

---

## Dependencies to Add

**None** - Web Crypto API is built into all modern browsers (secure context required).

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Web Crypto API | 37+ | 34+ | 7+ | 12+ |
| AES-GCM | 37+ | 34+ | 7+ | 12+ |
| PBKDF2 | 37+ | 34+ | 7+ | 12+ |
| HMAC | 37+ | 34+ | 7+ | 12+ |

All features supported in browsers with secure context (HTTPS).

---

## What NOT to Add

| Library | Reason |
|---------|--------|
| `crypto-js` | Pure JS, slower than native, vulnerable to timing attacks |
| `sjcl` | Unmaintained since 2017 |
| `node-forge` | Designed for Node, not browser |
| Any JWT library | Not needed for our use case |

---

*Stack research: 2025-01-21*
