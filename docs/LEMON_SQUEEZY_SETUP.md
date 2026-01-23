# Lemon Squeezy Payment Integration Setup

This document describes the Lemon Squeezy payment integration for Rhythm Chamber.

## Why Lemon Squeezy?

**Overlay checkout** - Stays in your app, no page redirects
**Built-in license keys** - Automatic generation and validation API
**No backend required** - Can validate client-side with crypto fallback
**Merchant of Record** - Handles global tax/VAT automatically

## Configuration

### Environment Variables

Set these in your config or environment:

```javascript
// Store URL (from Lemon Squeezy dashboard)
ConfigLoader.set('LEMONSQUEEZY_STORE_URL', 'https://yourstore.lemonsqueezy.com');

// Variant IDs (from Lemon Squeezy products)
ConfigLoader.set('LEMON_VARIANT_CHAMBER_MONTHLY', 'xxx');
ConfigLoader.set('LEMON_VARIANT_CHAMBER_YEARLY', 'xxx');
ConfigLoader.set('LEMON_VARIANT_CHAMBER_LIFETIME', 'xxx');

// Optional: Cloudflare Worker endpoint for secure validation
ConfigLoader.set('LEMON_VALIDATION_ENDPOINT', 'https://your-worker.workers.dev/validate');

// Optional: Direct API key (not recommended for production)
ConfigLoader.set('LEMONSQUEEZY_API_KEY', 'your-api-key');
```

## Setup Steps

### 1. Create Lemon Squeezy Store

1. Sign up at [lemonsqueezy.com](https://www.lemonsqueezy.com)
2. Create a new store
3. Note your store URL: `https://yourstore.lemonsqueezy.com`

### 2. Create Products

Create a product called "The Chamber" with multiple variants:

| Variant | Price | Interval | Variant ID |
|---------|-------|----------|------------|
| Chamber Monthly | $4.99 | Month | `LEMON_VARIANT_CHAMBER_MONTHLY` |
| Chamber Yearly | $39.00 | Year | `LEMON_VARIANT_CHAMBER_YEARLY` |
| Chamber Lifetime | $99.00 | One-time | `LEMON_VARIANT_CHAMBER_LIFETIME` |

**Important:** Enable **"Generate License Keys"** in variant settings:
- License length: Lifetime (or set expiry)
- Activation limit: 3 devices

### 3. Deploy Cloudflare Worker (Recommended)

The Cloudflare Worker acts as a secure proxy, hiding your API key from the client.

```bash
# Install wrangler
npm install -g wrangler

# Login
wrangler login

# Add your Lemon Squeezy API key as a secret
wrangler secret put LEMONSQUEEZY_API_KEY

# Deploy the worker
cd workers/license-validator
wrangler deploy
```

Update `LEMON_VALIDATION_ENDPOINT` to your worker URL:
```
https://your-worker.workers.dev/validate
```

### 4. Configure Webhook (Optional)

For instant license activation, set up a webhook:

1. In Lemon Squeezy Dashboard, go to Settings > Webhooks
2. Add endpoint: `https://your-worker.workers.dev/webhook`
3. Add signing secret (generate a random string)
4. Select events: `order_created`, `license_key_created`
5. Add webhook secret to worker: `wrangler secret put WEBHOOK_SECRET`

## User Flow

```
User clicks "Upgrade to Premium"
  → Lemon Squeezy overlay appears IN YOUR APP
  → User enters payment info
  → Payment processed
  → Checkout.Success event fires
  → License key automatically extracted
  → License validated via Cloudflare Worker
  → License stored (hashed) in localStorage
  → Features unlocked instantly
  → Overlay closes

Total time: ~60 seconds
```

## Files Created/Modified

### Created
- `js/services/lemon-squeezy-service.js` - Lemon Squeezy integration
- `workers/license-validator/index.js` - Cloudflare Worker for secure validation
- `workers/license-validator/wrangler.jsonc` - Worker configuration

### Modified
- `upgrade.html` - Uses Lemon Squeezy overlay checkout
- `js/payments.js` - Updated for Lemon Squeezy

## Testing

### Test Mode

Lemon Squeezy doesn't have a separate test mode. For testing:

1. Create a test variant for $1.00
2. Use Lemon Squeezy's test card numbers if available
3. Or use the real checkout and refund immediately

### License Key Format

Lemon Squeezy license keys are UUID format:
```
38b1460a-5104-4067-a91d-77b872934d51
```

For offline/crypto validation, use the JWT-like format:
```
payload.signature
```

Where payload is Base64URL-encoded JSON and signature is hex HMAC-SHA256.

## API Reference

### POST /validate (Cloudflare Worker)

Validates a license key securely.

**Request:**
```json
{
  "licenseKey": "38b1460a-5104-4067-a91d-77b872934d51",
  "instanceId": "optional-instance-id"
}
```

**Response (valid):**
```json
{
  "valid": true,
  "tier": "chamber",
  "instanceId": "f90ec370-fd83-46a5-8bbd-44a241e78665",
  "activatedAt": "2025-01-23T00:00:00Z",
  "expiresAt": null,
  "cacheFor": 2592000
}
```

**Response (invalid):**
```json
{
  "valid": false,
  "error": "INACTIVE",
  "message": "License status: disabled"
}
```

## Cost Breakdown

| Service | Cost | What It Does |
|---------|------|--------------|
| **Lemon Squeezy** | 5% + $0.50/transaction | Payment processing, tax, licenses |
| **Cloudflare Worker** | $0 (100k requests/day) | Secure license validation |
| **Your revenue** | ~87% | $4.43 of $4.99 monthly |

## Security Notes

### Client-Side Validation (Crypto Fallback)

When Cloudflare Worker is unavailable, the app falls back to crypto validation:
- Uses HMAC-SHA256 with derived secret
- Secret is XOR-obfuscated in source code
- Provides "good enough" security for $20 product
- Determined hackers can bypass, but most won't bother

### License Key Storage

- Only store **SHA-256 hash** of license key, never the raw key
- Hash prevents key extraction from localStorage
- Original key must be re-entered for new devices

### Best Practices

1. **Never store raw API keys** in client code
2. **Use Cloudflare Worker** for production validation
3. **Set activation limits** (3 devices recommended)
4. **Implement license expiry** for subscriptions
5. **Monitor for abuse** via Lemon Squeezy dashboard
