# License Verification Security Architecture

## Overview

Rhythm Chamber uses **asymmetric cryptography (ECDSA)** for secure license verification. This approach ensures that even with complete access to client-side code, licenses cannot be forged.

## Security Model

### Before: Vulnerable XOR/HMAC Approach

**Previous Implementation:**

- Used XOR obfuscation (trivially reversible)
- Later used HMAC-SHA256 with a key stored in localStorage
- Offline mode derived keys via PBKDF2 but **stored the derived key locally**

**Vulnerabilities:**

- Secret keys visible in client code or localStorage
- Anyone could extract the key and forge licenses
- XOR obfuscation provides no real security

### After: Secure ECDSA Asymmetric Cryptography

**Current Implementation:**

- Uses Elliptic Curve Digital Signature Algorithm (ECDSA) with P-256 curve
- Private key: **NEVER leaves the server**
- Public key: Embedded in client code (safe to be public)
- Licenses: Cryptographically signed by server, verified by client

**Security Properties:**

- Private key never exposed to client
- Public key can only verify signatures, not create them
- Even with full client code access, licenses cannot be forged

## Technical Details

### Algorithm: ECDSA with secp256r1 (P-256)

```
Curve: NIST P-256 (secp256r1)
Hash: SHA-256
Signature Format: DER-encoded
JWT Algorithm: ES256
```

### Key Generation

Server-side (one-time setup):

```javascript
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

// Store privateKey SECURELY on server (HSM/KMS recommended)
// Embed publicKey in client code
```

### License Signing (Server)

```javascript
const payload = {
  tier: 'chamber',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
  features: ['advanced_analysis', 'api_access'],
};

const token = createJWT(payload, privateKey);
```

### License Verification (Client)

```javascript
// Client only has the public key
const publicKeySpki = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...';

const isValid = await crypto.subtle.verify(
  { name: 'ECDSA', hash: { name: 'SHA-256' } },
  importedPublicKey,
  signatureBytes,
  dataBytes
);
```

## License Format

Licenses are JSON Web Tokens (JWT) with ES256 algorithm:

```
Header:
{
    "alg": "ES256",
    "typ": "JWT"
}

Payload:
{
    "tier": "chamber",           // sovereign | chamber | curator
    "iat": 1706400000,           // Issued at (Unix timestamp)
    "exp": 1737936000,           // Expiration (Unix timestamp)
    "instanceId": "...",         // Optional: Instance binding
    "deviceBinding": "...",      // Optional: Device fingerprint
    "features": [...]            // Optional: Feature list
}
```

## Server-Side Tools

### License Generator

Generate licenses using the provided script:

```bash
# Generate a 1-year chamber tier license
node scripts/generate-license.mjs --tier chamber --expires-in 365

# Generate license with specific features
node scripts/generate-license.mjs --tier curator --features advanced_analysis,api_access

# Export public key for client embedding
node scripts/generate-license.mjs --export-public-key
```

### Key Storage

**IMPORTANT:** Never commit private keys to version control.

- Private key: `.license-keys/private.pem` (mode 0600)
- Public key: `.license-keys/public.pem` (mode 0644)
- Add `.license-keys/private.pem` to `.gitignore`

## Client Implementation

### Public Key Embedding

The public key is embedded in `/workspaces/rhythm-chamber/js/security/license-verifier.js`:

```javascript
const PUBLIC_KEY_SPKI =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...' +
  '0qC6PgZMlZoAPsKP7dZBE8c7ey-OGBsyUkuhUUofAJG0imK28WHuY3BMQ' +
  'cVbXUFH74PUzIdyx6wlez4YQ9MFAQ';
```

### Verification Flow

1. **Online Mode:** Client sends token to server for verification
2. **Offline Fallback:** Client verifies ECDSA signature locally using public key
3. **Cache:** Valid licenses are cached for 24 hours

## Security Considerations

### What's Protected

- License forging: Impossible without private key
- Signature tampering: Detected by ECDSA verification
- Payload modification: Invalidates signature

### What's Not Protected

- License sharing: Users can still share their tokens
- Reverse engineering: Client code can be inspected (but that's safe)

### Best Practices

1. **Private Key Security:**
   - Store in HSM or KMS in production
   - Restrict file permissions (0600)
   - Never log or expose private key
   - Rotate keys periodically

2. **License Binding:**
   - Use `deviceBinding` for device-locked licenses
   - Use `instanceId` for per-installation licensing

3. **Expiration:**
   - Set reasonable `exp` claims
   - Verify expiration on every check

4. **Server Verification:**
   - Always verify licenses server-side for critical operations
   - Use online verification when available
   - Cache results appropriately

## Testing

The security implementation is tested in:

- `/workspaces/rhythm-chamber/tests/unit/security-license-verifier.test.js`

Run tests:

```bash
npm test -- tests/unit/security-license-verifier.test.js
```

## Migration from Old System

If migrating from the old XOR/HMAC system:

1. Generate new ECDSA key pair
2. Update client code with new public key
3. Reissue all existing licenses with new signatures
4. Remove old HMAC/PBKDF2 code
5. Update `.gitignore` to exclude private keys

## References

- [ECDSA on Wikipedia](https://en.wikipedia.org/wiki/Elliptic_Curve_Digital_Signature_Algorithm)
- [JWT RFC 7519](https://tools.ietf.org/html/rfc7519)
- [JWK RFC 7518](https://tools.ietf.org/html/rfc7518)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
