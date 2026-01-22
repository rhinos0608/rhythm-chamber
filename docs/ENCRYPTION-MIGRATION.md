# Encryption Key Migration Guide

**Version:** 1.0.0
**Date:** 2026-01-23
**Type:** Breaking Change

---

## Overview

Starting with v1.0.0, Rhythm Chamber has changed its encryption key derivation mechanism to improve security. **This is a breaking change that affects encrypted data.**

---

## What Changed?

### Before (v0.x)
Encryption keys were derived using:
```javascript
`${sessionSalt}:${spotify_refresh_token}:rhythm-chamber:v${version}`
```

**Problems:**
- Third-party token (Spotify) used as key material - violates zero-trust
- If Spotify token was compromised, all encrypted data could be decrypted
- Token lifecycle issues when tokens expired/changed

### After (v1.0+)
Encryption keys are now derived using:
```javascript
`${sessionSalt}:${device_secret}:rhythm-chamber:v${version}`
```

Where `device_secret` is a randomly generated 32-byte value stored in localStorage.

**Benefits:**
- Zero-trust compliant - no third-party credentials in key material
- Device-bound encryption
- Stable across browser sessions
- Independent of OAuth token lifecycle

---

## Impact to Users

### Data That Will Be Affected

**Previously encrypted data will become unreadable** after updating to v1.0.0, including:
- Stored API keys (if any were persisted)
- Any credentials stored via the encrypted storage system
- Session data encrypted with the old key

### Data That Is NOT Affected

- User data files (JSON exports, Spotify data)
- User preferences and settings
- Chat history and profiles
- Any data not explicitly encrypted

---

## User Action Required

### Option 1: Fresh Start (Recommended for Most Users)

Most users can simply:
1. Update to v1.0.0
2. Re-connect Spotify (if using)
3. Re-enter any API keys
4. Continue using the app normally

**No data loss occurs** for standard usage patterns. The encrypted storage was primarily used for temporary session credentials.

### Option 2: Export Before Update (Advanced Users)

If you have critical encrypted data:

**Before updating:**
1. Export any data through the app's export feature
2. Save API keys separately (re-enter them after update)

**After updating:**
1. Import your exported data
2. Re-enter API keys
3. Re-connect services

### Option 3: Manual Migration (Developers Only)

For developers who need to preserve encrypted data:

```javascript
// 1. Before update, retrieve the old encryption key
const oldKey = `${sessionSalt}:${localStorage.getItem('spotify_refresh_token')}:rhythm-chamber:v0`;

// 2. Decrypt data with old key
const decryptedData = await decryptData(encryptedData, oldKey);

// 3. After update, encrypt with new key
const newKey = await getSessionKey(); // Uses new device secret
const reencryptedData = await encryptData(decryptedData, newKey);

// 4. Store re-encrypted data
```

---

## Technical Details

### Device Secret Generation

The device secret is generated once per browser profile:
```javascript
const randomBytes = crypto.getRandomValues(new Uint8Array(32));
const deviceSecret = Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('');
localStorage.setItem('rhythm_chamber_device_secret', deviceSecret);
```

### Race Condition Protection

Multiple tabs initializing simultaneously won't generate conflicting secrets:
```javascript
// Compare-and-set pattern prevents race condition
if (!deviceSecret) {
    const newSecret = generateSecret();
    const currentValue = localStorage.getItem(SECRET_KEY);
    if (!currentValue) {
        localStorage.setItem(SECRET_KEY, newSecret);
        deviceSecret = newSecret;
    } else {
        deviceSecret = currentValue; // Use other tab's secret
    }
}
```

---

## Security Improvements

| Aspect | Before | After |
|--------|--------|-------|
| Key Material | Spotify token (external) | Device secret (internal) |
| Zero-Trust | ❌ Violated | ✅ Compliant |
| Key Stability | Token-dependent | Device-bound |
| Compromise Impact | Token leak = data breach | Device access required |
| Crypto Standards | PBKDF2 600K iterations | PBKDF2 600K + HKDF |

---

## FAQ

**Q: Will I lose my music data?**
A: No. Music data from Spotify and file imports is not encrypted with this mechanism.

**Q: Will I lose my chat history?**
A: No. Chat history is stored separately.

**Q: Do I need to do anything?**
A: Most users just need to reconnect Spotify and/or re-enter API keys.

**Q: Is this more secure?**
A: Yes. The new approach follows zero-trust principles and doesn't depend on third-party tokens.

**Q: What if I clear my browser data?**
A: You'll need to reconnect services, just like before. The device secret is stored in localStorage.

---

## Rollback Instructions

If you need to rollback to a version before v1.0.0:

1. The old version will not be able to read newly encrypted data
2. You'll need to clear encrypted storage and start fresh
3. Re-authenticate with all services

**There is no automatic rollback path** due to the security improvement.

---

For questions or issues, please visit:
https://github.com/rhinos0608/rhythm-chamber/issues
