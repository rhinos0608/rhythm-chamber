# Security Issue: Sensitive Data in localStorage

**Issue ID:** SEC-005
**Severity:** LOW (Design Trade-off)
**Status:** DOCUMENTED
**Date Reported:** 2026-01-22

## Description

The application stores potentially sensitive data in `localStorage`, which is accessible to any JavaScript code running on the same origin. If an XSS vulnerability is discovered, this data could be exfiltrated.

## Affected Data

| Key | Data Type | Risk Level | Notes |
|-----|-----------|------------|-------|
| `spotify_access_token` | OAuth Token | MEDIUM | Short-lived access token |
| `spotify_token_expiry` | Timestamp | LOW | Token expiration time |
| `rhythm_chamber_settings` | User Settings | LOW-MEDIUM | May contain API keys |
| `rhythm_chamber_conversation` | Chat History | LOW | User conversation data |
| `rhythm_chamber_rag` | Embedding Config | LOW | Technical configuration |

## Current Mitigations

### Positive Security Measures Already in Place

1. **Encryption Module**: `js/security/encryption.js` exists
2. **Token Binding**: `js/security/token-binding.js` for session protection
3. **HMAC Message Signing**: Cross-tab communication is signed
4. **Prototype Pollution Protection**: Active prevention in security module

### Key Question

Are OAuth tokens encrypted before storage? Review needed:
- `/Users/rhinesharar/rhythm-chamber/js/security/storage-encryption.js`
- `/Users/rhinesharar/rhythm-chamber/js/security/secure-token-store.js`
- `/Users/rhinesharar/rhythm-chamber/js/spotify.js`

## Risk Assessment

### Why LOW Severity (Acceptable Risk)

1. **Zero-Backend Architecture**: No server-side storage option exists
2. **Client-Side Only**: Tokens must be available to client-side code
3. **Short-Lived Tokens**: Spotify access tokens expire in ~1 hour
4. **No Critical PII**: No passwords, SSNs, or financial data stored

### Residual Risks

1. **XSS Exposure**: If XSS vulnerability found, tokens accessible
2. **Physical Access**: Someone with device access could extract tokens
3. **Browser Extensions**: Malicious extensions could read localStorage

## Recommendations

### Short Term (Do Now)

1. **Document Encryption Status**: Verify if tokens are encrypted
   ```javascript
   // Check if stored tokens are encrypted
   const token = localStorage.getItem('spotify_access_token');
   console.log('Token format:', token.startsWith('encrypted:') ? 'ENCRYPTED' : 'PLAIN');
   ```

2. **Token Expiration**: Verify tokens expire quickly
   - Current: ~1 hour (Spotify standard)
   - Recommendation: Keep as-is

3. **Clear on Logout**: Ensure tokens cleared on logout
   ```javascript
   function logout() {
       localStorage.removeItem('spotify_access_token');
       localStorage.removeItem('spotify_token_expiry');
       localStorage.removeItem('spotify_refresh_token');
   }
   ```

### Medium Term (Consider)

1. **sessionStorage Alternative**: Use sessionStorage instead
   - Pros: Cleared when tab closes, more ephemeral
   - Cons: Lost on tab refresh (bad UX)

2. **Encryption at Rest**: Encrypt sensitive localStorage values
   - Use existing encryption module
   - Key derivation from user session

3. **Token Rotation**: Implement automatic token refresh
   - Already handled by Spotify OAuth flow
   - Consider more frequent rotation

### Long Term (Architectural)

1. **IndexedDB with Encryption**: Move from localStorage to IndexedDB
   - Better encryption support
   - More structured data access
   - Larger storage capacity

2. **Non-Extractable Keys**: Use Web Crypto API for non-extractable keys
   ```javascript
   crypto.subtle.generateKey(
       { name: 'AES-GCM', length: 256 },
       false,  // non-extractable
       ['encrypt', 'decrypt']
   );
   ```

## Implementation Status

- [ ] Verify encryption status of stored tokens
- [ ] Audit all localStorage keys for sensitivity
- [ ] Implement automatic clearing of tokens on expiry
- [ ] Consider migration to IndexedDB for sensitive data

## Privacy Considerations

As a "zero-backend" application, this is a **documented design trade-off**:

| Alternative | Pros | Cons |
|------------|------|-------|
| **Current: localStorage** | Simple, survives refreshs | Accessible to XSS |
| **sessionStorage** | More ephemeral | Lost on refresh (bad UX) |
| **IndexedDB + encryption** | More secure, structured | More complex |
| **Backend storage** | Most secure | Violates "zero-backend" principle |

## References

- OWASP: HTML5 Local Storage - Security Considerations
- MDN: Web Storage API security
- CWE-922: Insecure Storage of Sensitive Information
