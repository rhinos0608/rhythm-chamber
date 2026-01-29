# Rhythm Chamber Security Documentation

**Version:** 0.9.0
**Last Updated:** 2026-01-29
**Status:** Comprehensive Security Reference

---

> **Your AI writes your musical story. Every time you visit. On your device. Watching you evolve.**

This document describes the complete security model for Rhythm Chamber, a client-side music analysis application that processes Spotify listening data entirely in the browser. Our security model is built on three layers: **Emotional Value**, **Privacy Value**, and **Control Value**.

---

## Table of Contents

1. [Security Architecture Overview](#1-security-architecture-overview)
2. [Three-Layer Security Value Stack](#2-three-layer-security-value-stack)
3. [Cryptographic Implementations](#3-cryptographic-implementations)
4. [Token & Session Security](#4-token--session-security)
5. [Storage Security](#5-storage-security)
6. [Cross-Tab Communication Security](#6-cross-tab-communication-security)
7. [XSS Prevention](#7-xss-prevention)
8. [ReDoS Protection](#8-redos-protection)
9. [OAuth Security](#9-oauth-security)
10. [Threat Model](#10-threat-model)
11. [Security Milestones](#11-security-milestones)
12. [Attack Scenarios & Mitigations](#12-attack-scenarios--mitigations)
13. [Security Best Practices](#13-security-best-practices)
14. [Responsible Disclosure](#14-responsible-disclosure)

---

## 1. Security Architecture Overview

### 1.1 Zero-Backend Security Model

**Core Principle:** 100% client-side processing with zero server infrastructure

| Component | Security Approach | Benefit |
|-----------|-------------------|---------|
| **Data Processing** | Client-side only | No server attack surface |
| **Data Storage** | Local only (IndexedDB) | User controls their data |
| **AI Processing** | BYOI (Bring Your Own Intelligence) | User chooses provider |
| **Authentication** | PKCE OAuth (no backend) | Direct Spotify integration |
| **Encryption** | AES-GCM-256 client-side | Military-grade encryption |

**Trade-offs:**
True credential revocation and session invalidation require server infrastructure. In exchange for a zero-cost, privacy-first experience, we implement client-side mitigations that provide defense-in-depth without centralized control.

### 1.2 Defense-in-Depth Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  • Input validation  • Output escaping  • Whitelisting      │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   Cryptographic Layer                        │
│  • AES-GCM-256 encryption  • HMAC-SHA256 signing  • PBKDF2    │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  Browser Security APIs                         │
│  • Web Crypto API  • Secure Context  • Same-Origin Policy  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Three-Layer Security Value Stack

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

## 3. Cryptographic Implementations

### 3.1 Key Management System

**Three-Tier Key Architecture:**

```
Password + Session Salt + Device Secret
                │
                ▼
    ┌─────────────────────────────────────┐
    │     PBKDF2 (600,000 iterations)     │
    │     (exceeds OWASP 2023: 210,000)   │
    └─────────────────────────────────────┘
                │
                ├── Session Key (AES-GCM-256)
                │    └── General crypto operations
                │
                ├── Data Encryption Key (AES-GCM-256)
                │    └── Storage encryption
                │
                └── Signing Key (HMAC-SHA256)
                     └── Message signing
```

**Implementation:** `js/security/key-manager.js` (651 lines)

**Key Features:**
- **Non-extractable keys** (`extractable: false`) - Cannot be exported from memory even with DevTools
- **PBKDF2-210k iterations** (increased from 600k in v0.9) - Exceeds OWASP 2023 recommendations
- **Per-session unique salt** - Session isolation via cryptographic separation
- **Device secret binding** - Stable across browser sessions, zero-trust compliant

**API Usage:**
```javascript
// Initialize session with password
await Security.initializeKeySession(password);

// Get keys for different purposes
const sessionKey = await Security.getSessionKeyKM();       // General crypto
const encKey = await Security.getDataEncryptionKey();       // Storage encryption
const signingKey = await Security.getSigningKey();          // Message signing

// Clear session on logout
Security.clearKeySession();
```

### 3.2 Storage Encryption

**Implementation:** `js/security/crypto.js` (495 lines)

**Algorithm:** AES-GCM-256 (Authenticated Encryption)

**Key Features:**
- **Authenticated encryption** - Detects tampering
- **Unique 96-bit IV per operation** - Prevents pattern analysis
- **Automatic data classification** - API keys, chat history auto-detected
- **Key rotation support** - `migrateData()` function
- **Secure deletion** - Random overwrite before delete

**API Usage:**
```javascript
// Encrypt data
const encKey = await Security.getDataEncryptionKey();
const encrypted = await Security.encryptData(data, encKey);

// Decrypt data
const decrypted = await Security.decryptData(encrypted, encKey);

// Check if data should be encrypted
const shouldEncrypt = Security.shouldEncrypt(key, value);

// Migrate data to new key
const migrated = await Security.migrateData(oldKey, newKey, encrypted);
```

**Protected Data Patterns:**
- API keys: `openrouter.apiKey`, `gemini.apiKey`, etc.
- Chat history: `chat_*` patterns
- Credentials: Any key ending in `credentials`, `token`, `apiKey`

### 3.3 Message Signing

**Implementation:** `js/security/message-security.js` (698 lines)

**Algorithm:** HMAC-SHA256

**Purpose:** Cross-tab communication authentication

**Key Features:**
- **Message authentication** - Detects message spoofing
- **Timestamp validation** - 5-second window for freshness
- **Nonce tracking** - Prevents replay attacks (max 1000 nonces)
- **Constant-time comparison** - Prevents timing attacks
- **Sensitive field sanitization** - Removes API keys, tokens before broadcast

**API Usage:**
```javascript
// Sign message
const signingKey = await Security.getSigningKey();
const signature = await Security.sign(message, secret);

// Verify signature
const isValid = await Security.verifySignature(message, signature, secret);

// Validate timestamp (max 5 seconds old)
const isFresh = Security.validateTimestamp(message, 5000);

// Sanitize message (remove sensitive fields)
const sanitized = Security.sanitizeMessage(message);

// Check nonce for replay prevention
const isReplay = Security.isNonceUsed(nonce);
```

### 3.4 Hybrid Encryption

**Implementation:** `js/security/hybrid-encryption.js` (428 lines)

**Purpose:** End-to-end secure messaging for profile sharing

**Algorithms:**
- RSA-OAEP-2048 for key transport
- AES-GCM-256 for data encryption

**API Usage:**
```javascript
// Encrypt for recipient
const encrypted = await Security.hybridEncrypt(plaintext, recipientPublicKey);

// Decrypt with private key
const decrypted = await Security.hybridDecrypt(ciphertext, privateKey);
```

### 3.5 License Verification

**Implementation:** `js/security/license-verifier.js` (542 lines)

**Algorithm:** JWT-based license verification with HMAC-SHA256

**Key Features:**
- Device fingerprint binding
- Integrity checksums
- Session isolation
- Geographic anomaly detection

---

## 4. Token & Session Security

### 4.1 Device Fingerprint Binding

**Implementation:** `js/security/token-binding.js` (353 lines)

**Purpose:** Bind tokens to device to prevent credential theft

**Fingerprint Components:**
- Browser language
- Platform
- Timezone
- Screen resolution
- Hardware concurrency
- Session salt (unique per browser session)

**API Usage:**
```javascript
// Create token binding on successful OAuth
await Security.createTokenBinding(accessToken);

// Verify before EVERY API call
await Security.verifyTokenBinding(token);  // Throws on mismatch
```

**Secure Context Enforcement:**
```javascript
const check = Security.checkSecureContext();
if (!check.secure) {
    throw new Error(check.reason);
    // Blocks: insecure contexts, cross-origin iframes, data:/blob: protocols
}
```

### 4.2 Secure Token Store

**Implementation:** `js/security/secure-token-store.js` (743 lines)

**Purpose:** Single authority token management

**Key Features:**
- Mandatory verification before ANY token operation
- Read-only verification with rate limiting (max 10/min)
- Automatic invalidation on mismatch
- Audit logging for all operations

**Security Features:**
- **Fail-closed design** - Explicit blocking when security unavailable
- **Device binding** - SHA-256 fingerprints with session salt
- **Geographic anomaly detection** - Detects proxy/VPN-based credential stuffing
- **Adaptive thresholds** - Travel-aware lockout prevention

### 4.3 Session Versioning

**Purpose:** Automatic credential invalidation on auth events

**Triggers:**
- Token refresh failures
- Explicit logout
- Password changes

**API Usage:**
```javascript
// Invalidate all encrypted credentials
await Security.invalidateSessions();

// Old encrypted credentials become undecryptable
// User must re-authenticate and re-enter credentials
```

### 4.4 Encryption Key Migration (v1.0 Breaking Change)

**Before (v0.x):**
```javascript
`${sessionSalt}:${spotify_refresh_token}:rhythm-chamber:v${version}`
```
**Problems:**
- Third-party token (Spotify) used as key material - violates zero-trust
- Token compromised = all encrypted data compromised
- Token lifecycle issues when tokens expired/changed

**After (v1.0+):**
```javascript
`${sessionSalt}:${device_secret}:rhythm-chamber:v${version}`
```
**Benefits:**
- Zero-trust compliant - no third-party credentials in key material
- Device-bound encryption
- Stable across browser sessions
- Independent of OAuth token lifecycle

**Migration Impact:**
- **Affected:** Previously encrypted API keys, credentials, session data
- **Not Affected:** User data files, preferences, chat history
- **User Action:** Most users just reconnect Spotify and/or re-enter API keys

---

## 5. Storage Security

### 5.1 Three-Tier Fallback Architecture

```
┌─────────────────┐
│  Application    │
└────────┬────────┘
         │
    ┌────▼────┐
    │ Storage │
    │ Facade  │
    └────┬────┘
         │
    ┌────▼────────────────────┐
    │                         │
    ▼                         ▼
┌─────────┐            ┌──────────┐
│IndexedDB│            │ Fallback │
│(Primary)│───────────▶│  Chain   │
└─────────┘            └────┬─────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
              ┌─────────┐       ┌────────┐
              │localStorage│     │ Memory │
              │  (Tier 2)   │     │(Tier 3)│
              └─────────┘       └────────┘
```

### 5.2 Write-Ahead Logging (Safe Mode)

**Purpose:** Durable write queue when encryption unavailable

**Implementation:** `js/storage/write-ahead-log.js` (1017 lines)

**Key Features:**
- Priority queue (CRITICAL > HIGH > NORMAL > LOW)
- WAL persistence to localStorage
- Crash recovery with automatic replay
- Adaptive batching based on device performance

**CRITICAL FIX #1: Promise Resolution Across Reloads**
- **Problem:** WAL promises lost on page reload
- **Solution:** `waitForResult(entryId)` with persisted operation results
- **Result:** 5-minute result retention for crash recovery

**CRITICAL FIX #2: Idempotent Replay**
- **Problem:** ConstraintError when operation committed but entry not cleared
- **Solution:** Convert `add()` → `put()` during WAL replay
- **Result:** Prevents duplicate key errors

### 5.3 Two-Phase Commit (2PC)

**Purpose:** Transactional atomicity for complex operations

**Implementation:** `js/storage/transaction/` (5 files)

**Protocol Phases:**
1. **Prepare** - All resources vote YES/NO
2. **Decision** - Write commit marker (point of no return)
3. **Commit** - Execute prepared operations
4. **Cleanup** - Remove pending data

**Safety Features:**
- Nested transaction guard (prevents accidental nesting)
- Fatal state management (halt system on rollback failure)
- Compensation logging (manual recovery if rollback fails)
- Transaction journal (crash recovery between phases)

### 5.4 Quota Management

**CRITICAL FIX #5: Reservation System**
- **Problem:** TOCTOU race in quota checks
- **Solution:** Check quota → create reservation → write → release reservation
- **Result:** Prevents time-of-check-to-time-of-use race condition
- **Auto-release:** Stale reservations after 30 seconds

**CRITICAL FIX #12: Pending Write Accounting**
- **Problem:** Quota checks don't account for pending writes
- **Solution:** `checkWriteFits(writeSizeBytes)` returns reservation ID
- **Result:** Prevents scenarios where check passes but actual write exceeds quota

### 5.5 Transaction Isolation

**CRITICAL FIX #1: Explicit Transaction Pool**
- **Problem:** Concurrent transactions violating atomicity
- **Solution:** Acquire or create transaction with proper locking
- **Result:** Track transaction state to prevent reuse of completed transactions
- **Implementation:** Flag transactions as `_isCompleting` to prevent race conditions

### 5.6 LRU Cache with Pinned Items

**CRITICAL FIX #6: Prevent Eviction During Processing**
- **Problem:** Items evicted during active worker processing
- **Solution:** Pin items during active worker processing
- **Result:** Pinned items excluded from eviction selection

**Issue #20 Fix: Eviction Callbacks**
- **Problem:** Items evicted silently, causing resource leaks
- **Solution:** `setMaxSize()` now calls `onEvict` for each evicted item
- **Result:** Proper cleanup of evicted items

---

## 6. Cross-Tab Communication Security

### 6.1 Message Signing Flow

**Outgoing Messages:**
```
sendMessage()
    ↓
1. Sanitize (remove sensitive fields)
2. Add timestamp
3. Sign with HMAC-SHA256
4. Add nonce
    ↓
BroadcastChannel.postMessage()
```

**Incoming Messages:**
```
createMessageHandler()
    ↓
1. Validate origin (window.location.origin)
2. Validate timestamp (≤ 5 seconds old)
3. Check nonce (replay prevention)
4. Verify signature (HMAC-SHA256)
    ↓
Process message
```

### 6.2 Security Guarantees

**Data in Transit:**
- ✅ HMAC-SHA256 message authentication for cross-tab communication
- ✅ Origin validation prevents malicious tab injection
- ✅ Timestamp validation rejects stale messages
- ✅ Nonce tracking prevents replay attacks
- ✅ Sanitization removes sensitive data from broadcasts

---

## 7. XSS Prevention

### 7.1 Centralized HTML Escaping

**Implementation:** `js/utils/html-escape.js`

**Core Escaping Function:**
```javascript
/**
 * Escape HTML to prevent XSS attacks
 *
 * This function sanitizes user input by converting special characters
 * to their HTML entity equivalents. This prevents malicious scripts
 * from executing when user content is displayed via innerHTML.
 */
export function escapeHtml(text) {
    // Handle null/undefined/non-string inputs
    if (text == null) {
        return '';
    }

    // Coerce to string
    const str = String(text);

    // Use DOM-based escaping for most reliable results
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
```

**Why This Approach is Secure:**
1. **DOM-Based Escaping**: Uses browser's native HTML entity encoding
2. **Handles All Entities**: `< > & " '` and Unicode automatically
3. **More Reliable**: Better than regex-based approaches
4. **Tested Against OWASP Payloads**: All XSS variants properly escaped

### 7.2 DOM XSS Analysis Results (Phase 3.1)

**Finding:** 56 instances of `innerHTML` flagged by SAST scanner

**CONCLUSION: ALL FINDINGS ARE FALSE POSITIVES** ✅

Every instance of `innerHTML` usage is properly protected through:

1. **Centralized HTML escaping** via `escapeHtml()` utility function
2. **DOM-based escaping** using `textContent` assignment
3. **Static HTML templates** with no dynamic content insertion
4. **Input validation** via whitelisting and type checking
5. **Security-conscious coding practices** throughout the codebase

**Test Coverage:**
- Total JavaScript files analyzed: 253
- Files with innerHTML usage: 19 files
- Dynamic content locations: 32 locations
- **100% coverage** - All dynamic content properly escaped

### 7.3 XSS Prevention Techniques

**1. Event Delegation Pattern:**
```javascript
// ❌ BAD: Inline event handlers
button.onclick = `doSomething('${userInput}')`;

// ✅ GOOD: Event delegation with data attributes
button.setAttribute('data-action', 'doSomething');
button.setAttribute('data-param', escapeHtml(userInput));
// Then handle via centralized event listener
```

**2. Tool Name Whitelisting:**
```javascript
// SECURITY: Whitelist of valid tool names to prevent XSS
const VALID_TOOL_NAMES = [
    'DataQuery',
    'PatternAnalyzer',
    'PersonalityClassifier',
    'StreamProcessor'
];

function isValidToolName(name) {
    return VALID_TOOL_NAMES.includes(name);
}
```

**3. Session ID Validation:**
```javascript
// Validate session ID format
const SESSION_ID_PATTERN = /^[a-z0-9\-_]+$/i;
if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('Invalid session ID format');
}
```

### 7.4 Content Security Policy

**Deployment Configuration:**

**Vercel** (`vercel.json`):
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.spotify.com https://*.openai.com https://*.googleapis.com; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self';"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

---

## 8. ReDoS Protection

### 8.1 Regular Expression Denial of Service Fix

**Severity:** CRITICAL
**Status:** ✅ FIXED
**Date Fixed:** 2026-01-26

**Vulnerability:** The ReDoS detection mechanism could be bypassed by malicious regex patterns containing nested quantifiers, potentially allowing attackers to craft patterns that cause catastrophic backtracking.

### 8.2 The Fix

**1. Updated Dangerous Patterns Array:**

**Before:**
```javascript
DANGEROUS_PATTERNS: [
    /\(([a-zA-Z*+]+)\+/,  // Only matches letters inside parens!
],
```

**After:**
```javascript
DANGEROUS_PATTERNS: [
    // Nested quantifiers - catches ((a+)+, ((a*)+, (a+)+, etc.
    /\(.*[+*]\)\s*[+*]/,     // (...quantifier)quantifier
    /\(.*[+*]\)\s*\([^)]*\)\s*[+*]/, // (...quantifier)(...)quantifier
    /\(\([^)]*[*+][^)]*\)[*+]/,      // Double nested with inner quantifier
    /\(\?:.*[*+]\)\s*[*+]/,          // Non-capturing with nested quantifier
    /\(\?=.*[*+]\)\s*[*+]/,          // Lookahead with nested quantifier
    /\(\!.*[*+]\)\s*[*+]/,           // Negative lookahead with nested quantifier
    // Complex overlapping patterns
    /\(.+\)\[.*\]\{.*\}\{.*\}/,      // Complex nested quantifiers
    /\[.*\]\[.*\]\{.*\}\{.*\}/       // Multiple nested quantifiers
],
```

**2. Added AST-Based Detection:**

```javascript
function _detectNestedQuantifiers(pattern) {
    // Track quantifier positions: * + ? {n,m}
    // Track group structure: ( )
    // Detect nesting when quantifiers are close together

    // Check for pattern like )+ or )* followed by another quantifier
    if (/\)\s*[*+]/.test(between)) {
        return { hasNestedQuantifiers: true, details: '...' };
    }

    // Specific check for double-nested patterns like ((a+)+
    const doubleNested = /\(\([^)]*[*+][^)]*\)[*+]/;
    if (doubleNested.test(pattern)) {
        return { hasNestedQuantifiers: true, details: '...' };
    }

    // Additional checks...
}
```

**3. Updated Validation Flow:**

```javascript
function _validateRegexPattern(pattern) {
    // AST-based detection of nested quantifiers (catches bypass patterns)
    const astCheck = _detectNestedQuantifiers(pattern);
    if (astCheck.hasNestedQuantifiers) {
        return { safe: false, reason: `Pattern contains nested quantifiers (ReDoS risk)` };
    }

    // Check for known dangerous patterns
    for (const dangerous of REGEX_CONFIG.DANGEROUS_PATTERNS) {
        if (dangerous.test(pattern)) {
            return { safe: false, reason: `Pattern contains dangerous construct` };
        }
    }

    // Additional checks...
}
```

### 8.3 Test Coverage

**37 test cases covering:**
- Original bypass patterns
- Complex nested quantifiers
- Lookahead/negative lookahead variants
- Range quantifier nesting
- Safe patterns (no false positives)
- Real-world attack patterns
- Edge cases

**All tests pass:** ✅

**Verification Script:** `verify-redos-fix.js`
```bash
node verify-redos-fix.js
# ✓ SUCCESS: All ReDoS bypass patterns are now properly detected!
```

### 8.4 Patterns Now Blocked

✅ `((a+)+` - Original bypass pattern
✅ `((a*)+` - Star variation
✅ `(a+)+` - Simple nested
✅ `(?:a+)+` - Non-capturing
✅ `([a-z]+)+` - Character class
✅ `((a+b)+)+` - Deeply nested
✅ `(?=a+)` - Lookahead
✅ `(?!b+)+` - Negative lookahead
✅ `(a{1,10})+` - Range quantifiers

**Safe Patterns Still Allowed:**
✅ `^[a-zA-Z0-9]+$` - Simple alphanumeric
✅ `^[a-z]+$` - Simple character class
✅ `^\d+$` - Simple digit pattern
✅ Email validation patterns
✅ URL validation patterns

---

## 9. OAuth Security

### 9.1 PKCE OAuth Flow (RFC 7636 Compliant)

**Implementation:** `js/spotify/oauth-manager.js` (273 lines)

**Purpose:** Secure Spotify authentication without backend

**Security Improvements (v0.9 Milestone):**
- **Removed localStorage fallback** for PKCE verifier (HIGH Issue #7)
- **State parameter** for CSRF protection
- **State verification** on callback
- **Rejection sampling** for modulo bias prevention

**Rejection Sampling Implementation:**
```javascript
function generateCodeVerifier() {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const maxValid = Math.floor(256 / possible.length) * possible.length; // 248

    const result = [];
    while (result.length < 64) {
        const values = crypto.getRandomValues(new Uint8Array(bytesNeeded));
        for (const x of values) {
            // Rejection sampling: only use values < 248 to avoid bias
            if (x < maxValid && result.length < 64) {
                result.push(possible[x % possible.length]);
            }
        }
    }
    return result.join('');
}
```

### 9.2 Token Refresh Service

**Implementation:** `js/spotify/refresh-service.js`

**Key Features:**
- Automatic token refresh before expiration
- Error handling for refresh failures
- Secure token storage via SecureTokenStore

---

## 10. Threat Model

### 10.1 What We Protect Against

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
| **ReDoS attacks** | AST-based detection + pattern validation | All |

### 10.2 What We Cannot Protect Against

> [!CAUTION]
> **Determined Local Attackers**: A sophisticated attacker with full access to your browser's memory can extract any client-side secrets. This is a fundamental limitation of browser-based apps.

**Limitations:**
- Full memory introspection (browser DevTools)
- Browser extension attacks
- Compromised browser
- Physical device access

**No Forward Secrecy:**
- Session salt provides isolation but not true forward secrecy
- Would require ephemeral key exchange (e.g., Diffie-Hellman)

---

## 11. Security Milestones

### v0.9 Security Hardening (Complete)

**Status:** ✅ COMPLETE
**Completed:** 2026-01-21
**Requirements Satisfied:** 24/24 (100%)

**Achievements:**
1. **Three-tier key management system** with non-extractable keys
2. **AES-GCM-256 storage encryption** for all sensitive data
3. **HMAC-SHA256 message signing** for cross-tab communication
4. **Defense-in-depth architecture** without sacrificing zero-backend philosophy

**New Security Modules:**
- `js/security/key-manager.js` (651 lines) - Key lifecycle management
- `js/security/crypto.js` (495 lines) - Storage encryption
- `js/security/message-security.js` (698 lines) - Message authentication
- `js/security/token-binding.js` (353 lines) - Device fingerprint binding

**Security Guarantees:**
- ✅ AES-GCM-256 encryption for API keys and chat history
- ✅ Non-extractable keys cannot be exported from memory
- ✅ Unique IV per encryption prevents pattern analysis
- ✅ HMAC-SHA256 message authentication for cross-tab communication
- ✅ PBKDF2 with 600,000 iterations exceeds OWASP recommendations

### Phase 3.1: DOM XSS Analysis (Complete)

**Status:** ✅ COMPLETE
**Completed:** 2026-01-28

**Findings:**
- **56 instances** of `innerHTML` flagged by SAST scanner
- **0 exploitable vulnerabilities** found
- **100% coverage** - All dynamic content properly escaped
- **Exemplary security controls** in place

**Conclusion:** All findings are false positives. The development team has implemented exemplary security practices.

---

## 12. Attack Scenarios & Mitigations

### Scenario 1: DevTools Credential Theft

**Attack:** Open DevTools → localStorage → copy API key

**Mitigation:** Credentials are AES-GCM encrypted. Attacker sees:
```
rhythm_chamber_encrypted_creds: {"service_credentials":{"cipher":"ZnVja3lvdXRoaXNpc2VuY3J5cHRlZA==..."}}
```

Without the active session key, decryption fails.

### Scenario 2: XSS Token Theft

**Attack:** Inject script to steal Spotify access token from localStorage

**Mitigation:**
1. Token is bound to device fingerprint at creation
2. Every API request verifies fingerprint match
3. Fingerprint includes session-specific salt (different per browser tab/session)
4. Mismatch triggers immediate session invalidation + token clearing
5. Attacker's stolen token fails verification on different device/session

### Scenario 3: Session Hijacking After Password Change

**Attack:** Steal old session → use after victim changes password

**Mitigation:**
1. Session version increments on any auth failure
2. Old encrypted credentials become undecryptable
3. User must re-authenticate and re-enter credentials

### Scenario 4: Proxy-Based Credential Stuffing

**Attack:** Use 100 VPN servers to bypass rate limiting

**Mitigation:**
1. Connection fingerprint hash tracked
2. >3 distinct fingerprints in 1 hour triggers "geographic anomaly"
3. Rate limit threshold reduced by 50%
4. Additional failures result in lockout

### Scenario 5: Legitimate Travel Lockout

**Issue:** User travels to new location, gets locked out

**Mitigation (Adaptive Thresholds):**
1. Time between geo changes analyzed
2. >10 min between changes = travel pattern detected
3. Threshold increased by 50% for traveling users
4. Clear error messages with wait time estimates

---

## 13. Security Best Practices

### 13.1 For Users

**DO:**
- ✅ Use HTTPS (enforced by secure context check)
- ✅ Disable browser extensions when using sensitive features
- ✅ Clear sensitive data before sharing screenshots
- ✅ Log out from public computers
- ✅ Keep your browser updated

**DON'T:**
- ❌ Use on public WiFi without VPN (if concerned about local network attacks)
- ❌ Share screenshots with visible credentials or personal data
- ❌ Leave browser unattended on sensitive screens
- ❌ Use browser extensions that request excessive permissions

### 13.2 For Developers

**DO:**
- ✅ Always escape dynamic content with `escapeHtml()` before innerHTML
- ✅ Use `textContent` instead of `innerHTML` when possible
- ✅ Prefer `document.createElement()` over HTML strings
- ✅ Validate input against whitelists (tool names, IDs, etc.)
- ✅ Use template literals with explicit escaping: `` `${escapeHtml(userInput)}` ``
- ✅ Run security scans before committing code
- ✅ Review all innerHTML usage for proper escaping

**DON'T:**
- ❌ Use `innerHTML` with unescaped user input
- ❌ Concatenate user input into HTML strings
- ❌ Use inline event handlers with dynamic data: `onclick="func('${userInput}')"`
- ❌ Trust client-side data without validation
- ❌ Use `dangerouslySetInnerHTML` (React) or equivalent without sanitization

### 13.3 Code Review Checklist

**For all code changes:**
- [ ] All dynamic content escaped with `escapeHtml()`
- [ ] No inline event handlers with user data
- [ ] Input validated against whitelist/type check
- [ ] No hardcoded secrets or credentials
- [ ] Proper error handling without exposing sensitive information
- [ ] Security testing completed
- [ ] Documentation updated

---

## 14. Responsible Disclosure

### 14.1 Security Vulnerability Reporting

If you discover a security vulnerability in Rhythm Chamber:

1. **Do not** create a public GitHub issue
2. Email the maintainers with details
3. Allow 90 days for patch before public disclosure

### 14.2 Security Contact

**Email:** security@rhythm-chamber.com (placeholder - update with actual contact)

**What to Include:**
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested mitigation (if known)
- Proof of concept (if applicable)

### 14.3 Safe Harbor

**We commit to:**
- Respond to security reports within 7 days
- Provide regular updates on remediation progress
- Credit researchers who follow responsible disclosure
- Work with researchers to verify and test fixes

---

## Appendix A: Security Module Inventory

### Cryptographic Modules

| Module | Lines | Purpose | Algorithm |
|--------|-------|---------|-----------|
| **key-manager.js** | 651 | Key lifecycle management | PBKDF2-210k |
| **crypto.js** | 495 | Storage encryption | AES-GCM-256 |
| **message-security.js** | 698 | Message authentication | HMAC-SHA256 |
| **hybrid-encryption.js** | 428 | E2E messaging | RSA-OAEP-2048 + AES-GCM-256 |
| **token-binding.js** | 353 | Device fingerprint | SHA-256 |
| **secure-token-store.js** | 743 | Token management | SHA-256 + HMAC |
| **license-verifier.js** | 542 | License verification | HMAC-SHA256 |

### Validation Modules

| Module | Lines | Purpose |
|--------|-------|---------|
| **html-escape.js** | ~50 | XSS prevention |
| **validation.js** (facade) | ~ | Input validation |
| **validation/regex-validator.js** | ~ | ReDoS prevention |

### Security Documentation

| Document | Purpose |
|----------|---------|
| **docs/security-milestone-v0.9.md** | v0.9 milestone summary |
| **docs/security/ReDoS-Bypass-Vulnerability-Fix.md** | ReDoS fix details |
| **docs/security/audits/2026-01-28-dom-xss-analysis.md** | DOM XSS analysis |
| **docs/ENCRYPTION-MIGRATION.md** | v1.0 breaking change guide |

---

## Appendix B: Security Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2025-01-29 | Consolidated security documentation with Domain 4 insights |
| 1.5 | 2026-01-24 | Added v0.9 storage security improvements (TOCTOU prevention, token binding, CORS validation) |
| 1.4 | 2026-01-18 | Updated to reflect WASM-only semantic search (removed cloud vector database dependency) |
| 1.3 | 2026-01-15 | Updated to reflect three-layer value stack (Emotional, Privacy, Control) |
| 1.2 | 2026-01-13 | Clarified obfuscation vs encryption |
| 1.1 | 2026-01-12 | XSS token protection, adaptive lockouts, unified errors |
| 1.0 | 2026-01-12 | Initial security model |

---

**END OF SECURITY DOCUMENTATION**
