# Phase 9: Key Foundation - Research

**Researched:** 2026-01-21
**Domain:** Web Crypto API, Key Lifecycle Management, Session Security
**Confidence:** HIGH

## Summary

This research investigates the implementation of secure key lifecycle management as the foundation for Phase 9: Key Foundation. The phase requires establishing a KeyManager module that creates non-extractable CryptoKey objects, derives session keys using PBKDF2, manages keys throughout their lifecycle, and ensures secure context validation.

**Key finding:** The codebase already has significant security infrastructure in place. The existing `encryption.js` module already implements PBKDF2 key derivation with 600,000 iterations (exceeding the requirement of 100,000), AES-GCM encryption, and session management. The `SecureTokenStore` module provides device binding and secure context validation. However, keys are currently extractable (the `extractable: false` requirement KEY-01 is not met), and there is no centralized KeyManager module as required by INFRA-02.

**Primary recommendation:** Build KeyManager as a centralized facade over existing encryption utilities, adding non-extractable key creation and proper key lifecycle management while preserving the existing high-iteration PBKDF2 implementation.

## Standard Stack

The established libraries and APIs for this domain:

### Core
| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| Web Crypto API | Browser Native | Cryptographic operations | Built-in, secure, no dependencies |
| SubtleCrypto | Part of Web Crypto API | Key derivation, encryption/decryption | Standard browser API for crypto |
| PBKDF2 | RFC 2898 via Web Crypto | Password-based key derivation | Industry standard for key derivation |
| AES-GCM-256 | NIST standard via Web Crypto | Authenticated encryption | Provides both confidentiality and integrity |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto.randomUUID() | Browser Native | Generate unique identifiers | Session IDs, salt generation |
| crypto.getRandomValues() | Browser Native | Generate cryptographically secure random bytes | IV generation, salt generation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Web Crypto API | sjcl.js, crypto-js | External libraries add attack surface; native API is faster and more secure |
| PBKDF2 | Argon2, scrypt | Argon2/scrypt are more resistant to GPU attacks but not available in Web Crypto API (would require WASM or external libraries) |
| AES-GCM | AES-CBC, AES-CTR | GCM provides authenticated encryption (built-in integrity), CBC/CTR do not |

**Installation:**
No installation required - all APIs are built into modern browsers.

## Architecture Patterns

### Recommended Project Structure
```
js/security/
├── key-manager.js         # NEW - Centralized key lifecycle management
├── encryption.js          # EXISTING - PBKDF2 utilities (extend with non-extractable support)
├── index.js               # EXISTING - Security module facade (add KeyManager export)
├── secure-token-store.js  # EXISTING - Token storage with device binding
└── token-binding.js       # EXISTING - Secure context validation
```

### Pattern 1: Non-Extractable Key Creation (NEW - Required for KEY-01)

**What:** Create CryptoKey objects that cannot be exported from JavaScript execution context.

**When to use:** For all session keys, encryption keys, and signing keys.

**Example:**
```javascript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey
async function deriveSessionKey(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,  // extractable: false - KEY CAN NEVER BE EXPORTED
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode(salt),
            iterations: 600000,  // OWASP 2024 recommendation (exceeds KEY-02 requirement)
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,  // extractable: false - DERIVED KEY CANNOT BE EXPORTED
        ['encrypt', 'decrypt']
    );
}
```

### Pattern 2: Centralized KeyManager API Design (NEW - Required for INFRA-02)

**What:** Single module that owns all key lifecycle operations.

**When to use:** All crypto operations should go through KeyManager, never directly to Web Crypto API.

**Example:**
```javascript
// js/security/key-manager.js

const KeyManager = {
    // Session key lifecycle
    async initializeSession(password) { /* ... */ },
    async getSessionKey() { /* ... */ },
    async getDataEncryptionKey() { /* ... */ },
    async getSigningKey() { /* ... */ },
    async clearSession() { /* ... */ },

    // Validation
    isSecureContext() { /* ... */ },
    isSessionActive() { /* ... */ }
};
```

### Pattern 3: Secure Context Validation (EXISTING - Already in token-binding.js)

**What:** Block crypto operations on non-HTTPS contexts.

**When to use:** Before any crypto operation.

**Current Implementation (lines 133-217 of token-binding.js):**
```javascript
// Source: /js/security/token-binding.js
function checkSecureContext() {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const isHttps = protocol === 'https:';
    const isLocalHost = ALLOWED_LOCAL_HOSTNAMES.includes(hostname);

    if (!isHttps && !isLocalHost) {
        return {
            secure: false,
            reason: `Insecure connection: ${origin}. Token binding requires HTTPS or localhost.`
        };
    }

    // Additional checks for iframes, data:/blob: protocols, etc.
    // ...
    return { secure: true };
}
```

### Anti-Patterns to Avoid

- **Storing raw key material:** Never write `crypto.subtle.exportKey('raw', key)` to any persistent storage
- **Reusing IVs:** Never reuse an IV with AES-GCM under the same key (catastrophic security failure)
- **Extractable keys:** Avoid `extractable: true` unless absolutely necessary for backup/restore
- **Hardcoded salts:** Never use static salts; generate per-session salts
- **Error details leaking:** Don't include raw crypto errors in user-facing messages

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Key derivation | Custom hash-based derivation | PBKDF2 via Web Crypto | Industry-tested, resistance to brute force |
| Random generation | Math.random() | crypto.getRandomValues() | Cryptographically secure |
| Encryption | Custom XOR/ciphers | AES-GCM via Web Crypto | Authenticated encryption, NIST-approved |
| Session management | Manual session tracking | KeyManager centralized lifecycle | Prevents key leaks, consistent cleanup |

**Key insight:** The existing `encryption.js` already uses PBKDF2 with 600,000 iterations (OWASP 2024 recommendation) and AES-GCM. The main gap is `extractable: false` and centralized lifecycle management.

## Common Pitfalls

### Pitfall 1: Extractable Keys (HIGH - Directly impacts KEY-01)

**What goes wrong:** Keys created with `extractable: true` can be exported via `crypto.subtle.exportKey()`, allowing malicious scripts to extract keys.

**Why it happens:** Default behavior in some tutorials, or needed for key export/backup features.

**How to avoid:** Always set `extractable: false` for both `importKey()` and `deriveKey()` operations unless export is explicitly required.

**Warning signs:** Code calls `crypto.subtle.exportKey()` anywhere in the codebase.

### Pitfall 2: IV Reuse with AES-GCM (CRITICAL)

**What goes wrong:** Reusing an IV with the same AES-GCM key allows attackers to forge messages and recover plaintext.

**Why it happens:** Using a static IV or timestamp-based IV that can collide.

**How to avoid:** Generate a new random IV for every encryption operation using `crypto.getRandomValues(new Uint8Array(12))`.

**Warning signs:** IV is derived from key material instead of randomly generated.

### Pitfall 3: Key Material Persistence (KEY-04 violation)

**What goes wrong:** Raw keys are written to localStorage/sessionStorage/IndexedDB.

**Why it happens:** Attempting to persist keys across sessions.

**How to avoid:** Never export non-extractable keys; regenerate keys per session instead.

**Warning signs:** Calls to `crypto.subtle.exportKey()` followed by storage operations.

### Pitfall 4: Insecure Context Operations (INFRA-01 violation)

**What goes wrong:** Crypto operations run on HTTP (non-HTTPS) connections.

**Why it happens:** Missing secure context validation.

**How to avoid:** Call `checkSecureContext()` before any crypto operation; fail fast if not secure.

**Warning signs:** Crypto operations without `if (window.isSecureContext)` check.

### Pitfall 5: Information Leakage in Error Messages (INFRA-05 violation)

**What goes wrong:** Crypto errors reveal internal implementation details.

**Why it happens:** Directly propagating Web Crypto exceptions to UI.

**How to avoid:** Catch crypto errors and log details to console, return generic messages to users.

**Warning signs:** User-facing error messages contain operation names, algorithm names, or key details.

## Code Examples

Verified patterns from existing codebase and official sources:

### Existing PBKDF2 Implementation (Keep - Exceeds Requirements)

```javascript
// Source: /js/security/encryption.js (lines 79-112)
// SECURITY: Uses 600,000 iterations per OWASP 2024 recommendations
// This EXCEEDS the requirement of 100,000 iterations in KEY-02

async function deriveKey(password, salt = 'rhythm-chamber-v1') {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,  // Key material not extractable
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode(salt),
            iterations: 600000, // OWASP 2024 recommendation
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,  // DERIVED KEY NOT EXTRACTABLE
        ['encrypt', 'decrypt']
    );
}
```

**Note:** This implementation already sets `extractable: false` on `deriveKey()` but uses a default salt that's not unique per session. The new KeyManager should generate unique salts per session.

### AES-GCM Encryption (Keep - Already Correct)

```javascript
// Source: /js/security/encryption.js (lines 114-141)
async function encryptData(data, keyOrPassword) {
    const key = typeof keyOrPassword === 'string'
        ? await deriveKey(keyOrPassword)
        : keyOrPassword;

    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(data)
    );

    // Combine IV + ciphertext for storage
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
}
```

**Note:** IV is randomly generated per encryption (correct pattern). IV is stored with ciphertext for decryption.

### Secure Context Validation (Reuse Existing)

```javascript
// Source: /js/security/token-binding.js (lines 133-217)
function checkSecureContext() {
    // Check HTTPS or localhost
    if (!isHttps && !isLocalHost && !isFile && !isNativeWrapper) {
        return {
            secure: false,
            reason: `Insecure connection: ${origin}. Token binding requires HTTPS or localhost.`
        };
    }

    // Modern secure context check
    if (typeof window.isSecureContext !== 'undefined' && !window.isSecureContext) {
        if (!isLocalHost && !isFile) {
            return {
                secure: false,
                reason: 'Not running in a secure context (HTTPS required for sensitive operations)'
            };
        }
    }

    // Check for suspicious iframe embedding
    if (window.top !== window.self) {
        // ... cross-origin iframe detection
    }

    return { secure: true };
}
```

### New: KeyManager API Skeleton

```javascript
// js/security/key-manager.js (NEW)
const KeyManager = {
    // Private state (module scope)
    _sessionKey: null,
    _dataEncryptionKey: null,
    _signingKey: null,
    _sessionActive: false,
    _sessionSalt: null,

    /**
     * Initialize a new session with unique keys
     * Generates new session salt and derives all required keys
     */
    async initializeSession(password) {
        // Fail fast if not secure context
        if (!this.isSecureContext()) {
            throw new Error('Secure context required for key operations');
        }

        // Generate unique session salt
        this._sessionSalt = this._generateSessionSalt();

        // Derive session key with PBKDF2
        this._sessionKey = await this._deriveKey(password, this._sessionSalt);

        // Derive data encryption key (separate from session key)
        this._dataEncryptionKey = await this._deriveDataEncryptionKey(password, this._sessionSalt);

        // Derive signing key for HMAC operations
        this._signingKey = await this._deriveSigningKey(password, this._sessionSalt);

        this._sessionActive = true;
        return true;
    },

    /**
     * Get current session key (non-extractable)
     * Throws if session not initialized
     */
    async getSessionKey() {
        if (!this._sessionActive || !this._sessionKey) {
            throw new Error('Session not initialized');
        }
        return this._sessionKey;
    },

    /**
     * Get data encryption key for storage operations (non-extractable)
     */
    async getDataEncryptionKey() {
        if (!this._sessionActive || !this._dataEncryptionKey) {
            throw new Error('Session not initialized');
        }
        return this._dataEncryptionKey;
    },

    /**
     * Get signing key for HMAC operations (non-extractable)
     */
    async getSigningKey() {
        if (!this._sessionActive || !this._signingKey) {
            throw new Error('Session not initialized');
        }
        return this._signingKey;
    },

    /**
     * Clear all session keys from memory
     * Call on logout or session end (KEY-05)
     */
    clearSession() {
        this._sessionKey = null;
        this._dataEncryptionKey = null;
        this._signingKey = null;
        this._sessionSalt = null;
        this._sessionActive = false;
    },

    /**
     * Check if running in secure context (INFRA-01)
     */
    isSecureContext() {
        return window.isSecureContext ||
               window.location.protocol === 'https:' ||
               window.location.hostname === 'localhost' ||
               window.location.hostname === '127.0.0.1';
    },

    /**
     * Check if session is active
     */
    isSessionActive() {
        return this._sessionActive;
    },

    // Private methods
    _generateSessionSalt() {
        const saltBytes = crypto.getRandomValues(new Uint8Array(32));
        return Array.from(saltBytes, b => b.toString(16).padStart(2, '0')).join('');
    },

    async _deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt),
                iterations: 600000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,  // extractable: false
            ['encrypt', 'decrypt']
        );
    },

    async _deriveDataEncryptionKey(password, salt) {
        // Derive separate key for data encryption with different purpose
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password + ':data'),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt + ':storage'),
                iterations: 600000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    },

    async _deriveSigningKey(password, salt) {
        // Derive HMAC signing key
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password + ':sign'),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt + ':hmac'),
                iterations: 600000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign', 'verify']
        );
    }
};

export { KeyManager };
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom key derivation | PBKDF2 via Web Crypto | Web Crypto standardization | Industry-tested key derivation |
| Extractable keys by default | Non-extractable keys | Modern best practice | Keys cannot be exported from browser |
| Hardcoded salts | Per-session random salts | Current security practice | Prevents pre-computation attacks |
| Generic error messages | Sanitized error messages | OWASP guidelines | Prevents information leakage |

**Deprecated/outdated:**
- **Extractable keys**: Modern practice is to set `extractable: false` unless export is explicitly required
- **Low PBKDF2 iterations**: Old recommendations of 10,000-100,000 iterations are insufficient; current OWASP guidance is 600,000 for PBKDF2-SHA256
- **Manual crypto implementations**: Never implement crypto algorithms manually; always use Web Crypto API

## Existing Codebase Integration Points

### Session Start / Logout Points

The app currently handles session lifecycle in these locations:

1. **App Initialization** (`js/main.js`):
   - Line 22: `Security.checkSecureContext()` already called early in startup
   - Line 356-474: `bootstrap()` function initializes the app

2. **Logout/Clear Session** (`js/settings.js`, lines 1563-1566):
   ```javascript
   if (Security.clearSessionData) {
       await Security.clearSessionData();
   } else if (Security.invalidateSessions) {
       Security.invalidateSessions();
   }
   ```

3. **Session Invalidation** (`js/security/encryption.js`):
   - Line 51-63: `invalidateSessions()` - increments session version
   - Line 254-257: `clearEncryptedCredentials()` - removes stored credentials
   - Line 263-268: `clearSessionData()` - full session cleanup

### Security Module Facade (`js/security/index.js`)

The security module already exports a unified API. KeyManager should be added here:

```javascript
// Add to existing exports (around line 285-296)
import * as KeyManager from './key-manager.js';

const Security = {
    // ... existing exports ...

    // Key Management (NEW)
    KeyManager,
    initializeKeySession: KeyManager.initializeSession,
    clearKeySession: KeyManager.clearSession
};
```

### Integration Plan

1. **Create `key-manager.js`**: Implement centralized key lifecycle
2. **Update `encryption.js`**: Add helper functions that use non-extractable keys
3. **Update `security/index.js`**: Export KeyManager through Security facade
4. **Update `main.js`**: Initialize KeyManager session early in bootstrap
5. **Update `settings.js`**: Call `KeyManager.clearSession()` on logout

## Open Questions

1. **Key migration strategy**: Existing encrypted credentials use extractable keys. How to migrate to non-extractable keys without data loss?
   - **What we know**: Current encryption is AES-GCM with PBKDF2
   - **What's unclear**: Whether existing encrypted data needs re-encryption or can be gradually migrated
   - **Recommendation**: Implement dual-read path (old key format + new non-extractable) during transition period

2. **Session duration**: How long should a session key be valid?
   - **What we know**: Requirements say "per browser session start"
   - **What's unclear**: Whether this means per-tab session or per-browser session
   - **Recommendation**: Implement per-tab session with re-auth prompt after 30 minutes of inactivity (deferred to future requirements KEY-R2)

3. **Password source**: What password/user secret is used for key derivation?
   - **What we know**: Current implementation uses Spotify refresh token + session salt
   - **What's unclear**: Whether this should change for the new KeyManager
   - **Recommendation**: Keep using existing pattern (Spotify token + session salt) to avoid breaking auth flow

## Sources

### Primary (HIGH confidence)
- [SubtleCrypto: deriveKey() method - Web APIs | MDN](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey) - PBKDF2 usage and parameters
- [SubtleCrypto: generateKey() method - Web APIs | MDN](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/generateKey) - Key generation with extractable: false
- [Web Cryptography API Level 2](https://www.w3.org/TR/webcrypto-2/) - W3C specification (April 2025)
- [Crypto: subtle property - Web APIs | MDN](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/subtle) - Secure context requirements
- **Existing codebase**: `/js/security/encryption.js`, `/js/security/token-binding.js`, `/js/security/secure-token-store.js`

### Secondary (MEDIUM confidence)
- [Modern Algorithms in the Web Cryptography API](https://wicg.github.io/webcrypto-modern-algos/) (December 2025) - Modern best practices for non-extractable keys
- [Web Cryptography Level 2 (W3C Spec)](https://w3c.github.io/webcrypto/) - Authoritative specification
- [Update on Web Cryptography - WebKit Blog](https://webkit.org/blog/7790/update-on-web-cryptography/) - Security architecture of non-extractable keys

### Tertiary (LOW confidence)
- [What do people use non-extractable WebCrypto keys for? - Crypto StackExchange](https://crypto.stackexchange.com/questions/85587/what-do-people-use-non-extractable-webcrypto-keys-for) - Community discussion on use cases
- [Enable non-extractable keys for Web Crypto - Deno Issue #11481](https://github.com/denoland/deno/issues/11481) - Implementation notes noting non-extractable keys are for obfuscation, not complete security

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Web Crypto API is browser native, well-documented
- Architecture: HIGH - Existing codebase patterns are clear; integration points identified
- Pitfalls: HIGH - Crypto pitfalls are well-documented; verified against MDN and W3C specs

**Research date:** 2026-01-21
**Valid until:** 2026-02-20 (30 days - Web Crypto API is stable, but verify if browser compatibility is a concern)
