# Authentication Issues - Medium Priority (UPDATED)

This document tracks medium-priority issues found during the authentication and session flow audit.

## Summary

**Date**: 2025-01-22
**Total Issues**: 5
**Fixed**: 3
**Remaining**: 2

---

## FIXED ISSUES

## Issue 2: Bootstrap Window Unsigned Messages

**File**: `/Users/rhinesharar/rhythm-chamber/js/services/tab-coordination.js`
**Lines**: 118-123
**Severity**: MEDIUM
**Type**: Security

### Description
Unsigned messages were allowed for 30 seconds after module initialization.

### Fix Applied
Reduced bootstrap window from 30 seconds to 5 seconds:
```javascript
bootstrap: {
    windowMs: 5000  // 5 seconds - sufficient for session initialization, reduced from 30s for security
}
```

### Status
- [x] Issue acknowledged
- [x] Fix implemented
- [ ] Tested
- [ ] Deployed

---

## Issue 3: Token Binding Before Persist

**File**: `/Users/rhinesharar/rhythm-chamber/js/spotify.js`
**Lines**: 289-307 (handleCallback), 509-529 (refreshToken)
**Severity**: MEDIUM
**Type**: Consistency

### Description
Token binding was created before confirming token persistence succeeded, creating a potential inconsistency.

### Fix Applied
Changed order to persist BEFORE binding, with rollback on failure:
```javascript
// Persist tokens BEFORE creating binding
await persistTokens(data, true);

// Create binding AFTER successful persistence
if (Security.createTokenBinding) {
    const bindingSuccess = await Security.createTokenBinding(data.access_token);
    if (!bindingSuccess) {
        // Rollback: clear tokens that were just persisted since binding failed
        await clearTokens();
        throw new Error(failureMessage);
    }
}
```

### Status
- [x] Issue acknowledged
- [x] Fix implemented
- [ ] Tested
- [ ] Deployed

---

## Issue 4: Code Verifier in localStorage

**File**: `/Users/rhinesharar/rhythm-chamber/js/spotify.js`
**Lines**: 221-229 (initiateLogin), 254-263 (handleCallback), 339-347 (clearTokens)
**Severity**: MEDIUM
**Type**: Security (XSS)

### Description
PKCE code verifier was stored in localStorage instead of sessionStorage.

### Fix Applied
Changed to use sessionStorage with localStorage fallback:
```javascript
// Store verifier in sessionStorage (more secure)
try {
    sessionStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);
} catch (e) {
    // Fallback to localStorage if sessionStorage unavailable
    console.warn('[Spotify] sessionStorage unavailable, using localStorage for PKCE verifier');
    localStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);
}
```

Also updated handleCallback to read from sessionStorage first, and clearTokens to clear from both.

### Status
- [x] Issue acknowledged
- [x] Fix implemented
- [ ] Tested
- [ ] Deployed

---

## REMAINING ISSUES

## Issue 1: Silent Message Truncation

**File**: `/Users/rhinesharar/rhythm-chamber/js/services/session-manager.js`
**Lines**: 26-29, 283
**Severity**: MEDIUM
**Type**: Data Loss

### Description
Sessions are silently truncated to 100 messages:
```javascript
const MAX_SAVED_MESSAGES = 100;  // Maximum messages saved per session
// ...
messages: messages.slice(-MAX_SAVED_MESSAGES), // Limit to MAX_SAVED_MESSAGES messages
```

### Impact
Users lose conversation history without explicit consent when exceeding 100 messages.

### Recommended Fix
```javascript
// Before truncating, check if user has been warned
if (messageCount > MAX_SAVED_MESSAGES && !hasUserConsented) {
    // Show modal asking for consent
    const consent = await showTruncationWarning(messageCount, MAX_SAVED_MESSAGES);
    if (!consent) {
        // Don't save, or save to separate archive
        return;
    }
}
```

### Status
- [x] Issue acknowledged
- [ ] Fix implemented
- [ ] Tested
- [ ] Deployed

---

## Issue 5: Silent Fallback Mode

**File**: `/Users/rhinesharar/rhythm-chamber/js/security/secure-token-store.js`
**Lines**: 66-73
**Severity**: MEDIUM
**Type**: Security

### Description
Secure token store silently degrades to "fallback mode" when secure context unavailable.

### Impact
Tokens are stored without encryption when accessed over HTTP or file:// protocol, but user is not warned.

### Recommended Fix
Add UI warning banner when operating in fallback mode:
```javascript
function showSecurityWarning() {
    const banner = document.createElement('div');
    banner.className = 'security-warning-banner';
    banner.textContent = 'Warning: Running in insecure mode. Tokens are not encrypted.';
    document.body.prepend(banner);
}

// Call when fallback mode detected
if (!_secureContextAvailable) {
    showSecurityWarning();
}
```

### Status
- [x] Issue acknowledged
- [ ] Fix implemented
- [ ] Tested
- [ ] Deployed
