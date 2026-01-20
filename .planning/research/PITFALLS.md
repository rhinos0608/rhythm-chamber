# Pitfalls: Security Hardening

**Research Date:** 2025-01-21
**Focus:** Common mistakes in browser security implementation

---

## Critical Pitfalls

### 1. Extractable Keys

**Warning:** Keys with `extractable: true` can be serialized via JSON.stringify() or captured in memory dumps.

**Prevention:**
```javascript
// WRONG
const key = await crypto.subtle.generateKey(
  { name: "AES-GCM", length: 256 },
  true,  // ❌ EXTRACTABLE
  ["encrypt", "decrypt"]
)

// RIGHT
const key = await crypto.subtle.generateKey(
  { name: "AES-GCM", length: 256 },
  false,  // ✅ NON-EXTRACTABLE
  ["encrypt", "decrypt"]
)
```

**Detection:** Audit all `crypto.subtle.generateKey()` and `deriveKey()` calls.

---

### 2. IV Reuse

**Warning:** Reusing initialization vectors with AES-GCM destroys confidentiality.

**Prevention:**
```javascript
// WRONG
const iv = new Uint8Array(12)  // ❌ All zeros = reuse

// RIGHT
const iv = crypto.getRandomValues(new Uint8Array(12))  // ✅ Unique per encryption

// Store IV with ciphertext (IV is not secret)
await db.put({
  iv: Array.from(iv),
  ciphertext: Array.from(encrypted)
})
```

**Detection:** Search for hardcoded IV values or IV generation without `getRandomValues()`.

---

### 3. Timing Side Channels

**Warning:** String comparison of signatures leaks information via timing.

**Prevention:**
```javascript
// WRONG
if (signature === expectedSignature) { }  // ❌ Timing leak

// RIGHT
const isValid = await crypto.subtle.verify(  // ✅ Constant-time
  "HMAC",
  key,
  signature,
  message
)
```

**Detection:** Audit all signature/message comparisons.

---

### 4. Replay Attacks

**Warning:** Captured BroadcastChannel messages can be replayed.

**Prevention:**
```javascript
// Add timestamp to all messages
const message = {
  type: "data-update",
  timestamp: Date.now(),
  nonce: crypto.getRandomValues(new Uint8Array(16)),
  data: sanitizedData
}

// Verify freshness
if (Date.now() - message.timestamp > 5000) {
  throw new Error("Stale message rejected")
}

// Track seen nonces (short window)
if (seenNonces.has(message.nonce)) {
  throw new Error("Duplicate message rejected")
}
```

**Detection:** Review BroadcastChannel message handling.

---

### 5. Key Storage in localStorage

**Warning:** localStorage is accessible to any script in the same origin (including XSS).

**Prevention:**
```javascript
// WRONG
localStorage.setItem('encryptionKey', JSON.stringify(key))  // ❌

// RIGHT
// 1. Keep keys in memory only (CryptoKey objects)
// 2. For persistent data: encrypt with non-extractable key
// 3. Never store key material in localStorage/sessionStorage
```

**Detection:** Search for `localStorage.setItem` with "key", "secret", "token".

---

## High-Severity Pitfalls

### 6. Weak PBKDF2 Iterations

**Warning:** Too few iterations makes brute force feasible.

**Prevention:**
```javascript
// WRONG
iterations: 1000  // ❌ Too weak (2012 era)

// RIGHT
iterations: 100000  // ✅ 100k minimum (2025 standard)
// Or use calculateOptimalIterations() to target ~100ms delay
```

**Detection:** Check PBKDF2 iteration count.

---

### 7. Missing Origin Validation

**Warning:** BroadcastChannel messages should be validated even with same-origin guarantee.

**Prevention:**
```javascript
// Even though BroadcastChannel is same-origin only:
channel.onmessage = (event) => {
  // Still validate structure and content
  if (!event.data || typeof event.data !== 'object') return
  if (event.data.origin !== window.location.origin) return
  if (!event.data.signature) return

  // Then verify signature
}
```

**Detection:** Review BroadcastChannel message handlers.

---

### 8. Sensitive Data in BroadcastChannel

**Warning:** BroadcastChannel messages are readable by any script in same origin.

**Prevention:**
```javascript
// WRONG
channel.postMessage({
  type: "chat-update",
  apiKey: userApiKey  // ❌ Exposed to malicious tabs
})

// RIGHT
channel.postMessage({
  type: "chat-update",
  hasNew: true  // ✅ Only send flags/counters
  // Or send encrypted data (with key from memory, not message)
})
```

**Detection:** Audit all `channel.postMessage()` calls.

---

## Medium-Severity Pitfalls

### 9. Key Rotation Data Loss

**Warning:** Rotating keys without re-encrypting data causes data loss.

**Prevention:**
```javascript
// Key rotation process:
async function rotateKeys(oldKey, newKey) {
  // 1. Derive new key
  // 2. For each encrypted item:
  //    a. Decrypt with oldKey
  //    b. Encrypt with newKey
  //    c. Replace in storage
  // 3. Only after all items migrated: delete oldKey
}
```

**Detection:** Review key rotation implementation.

---

### 10. No Secure Context Check

**Warning:** Web Crypto API only works in secure contexts (HTTPS/localhost).

**Prevention:**
```javascript
// In js/main.js
if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  showFatalError("Secure context required")
  // Block all crypto operations
}
```

**Detection:** Check if secure context validation exists.

---

## Low-Severity Pitfalls

### 11. Error Messages Leak Info

**Warning:** Detailed crypto errors can reveal implementation details.

**Prevention:**
```javascript
// WRONG
throw new Error(`AES-GCM encryption failed: ${operation}, key: ${key.algorithm.name}`)

// RIGHT
throw new Error("Encryption failed")
```

---

### 12. Missing CSP Headers

**Warning:** Without Content Security Policy, XSS attacks are easier.

**Prevention:**
```http
Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'self' https://api.openrouter.ai https://generativelanguage.googleapis.com
```

**Note:** For zero-backend static hosting, add CSP via hosting platform or meta tag.

---

## Detection Checklist

Before launch, verify:

- [ ] All keys have `extractable: false`
- [ ] All IVs are randomly generated per encryption
- [ ] PBKDF2 iterations ≥ 100,000
- [ ] BroadcastChannel messages are signed
- [ ] BroadcastChannel messages have timestamps
- [ ] No sensitive data in BroadcastChannel
- [ ] No keys in localStorage/sessionStorage
- [ ] Secure context check exists
- [ ] Key rotation preserves data access
- [ ] Crypto errors don't leak implementation details

---

*Pitfalls research: 2025-01-21*
