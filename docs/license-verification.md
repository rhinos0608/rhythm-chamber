# License Verification System

## Overview

Rhythm Chamber uses Lemon Squeezy for license management and premium feature gating.

## Architecture

```
Client App -> License Verifier -> Cloudflare Worker -> Lemon Squeezy API
     |                |                    |
 Local Cache   Device Binding      HMAC Signature Validation
```

## License Tiers

### Sovereign (Free)
- No license key required
- Local AI only
- Manual data import
- Basic features

### Chamber (Premium - $4.99/month)
- Requires valid license key
- Cloud AI via OpenRouter
- Spotify OAuth integration
- All premium features

## Verification Flow

1. **Initial Check**: Client validates license key format
2. **Cloud Validation**: Cloudflare Worker verifies with Lemon Squeezy
3. **Device Binding**: License bound to device fingerprint
4. **Local Cache**: Result cached for 30 days
5. **Fallback**: Graceful degradation to Sovereign if validation fails

## Implementation Details

### Client-Side (`js/security/license-verifier.js`)
- Format validation of license keys
- Base64 decoding for developer/sovereign licenses
- Caching with expiration
- Tier validation

### Worker-Side (`workers/license-validator/`)
- Lemon Squeezy API integration
- HMAC signature verification for webhooks
- Rate limiting (10 req/min per client)
- Instance activation/deactivation

## Security Features

- **HMAC Signature Verification**: All webhooks verified
- **Rate Limiting**: Prevents abuse of validation endpoint
- **Device Binding**: Prevents license sharing
- **Fail-Closed**: Validation failures result in restricted mode
