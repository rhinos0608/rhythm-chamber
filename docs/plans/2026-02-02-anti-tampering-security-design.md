# Anti-Tampering Security Design

> **Status**: Pre-Release Design Document
> **Created**: 2026-02-02
> **Author**: Design Session (AI + Human)
> **Related**: [SECURITY.md](../SECURITY.md) | [License Verification Architecture](../security/license-verification-architecture.md)

---

## Executive Summary

Rhythm Chamber's zero-backend philosophy creates a fundamental tension: **client-side license verification can always be patched by determined attackers**. This design document outlines a **defense-in-depth friction strategy** that raises the cost of attack without breaking the zero-backend architecture.

**Goal**: Make patching annoying enough that casual users won't bother, while accepting that skilled attackers will always find a way.

**Non-Goal**: Unhackable DRM (impossible with client-side code)

---

## Threat Model

### Accepted Realities

| Reality | Implication |
|---------|-------------|
| Any client-side check can be patched | We accept some piracy as inevitable |
| Determined attackers will succeed | Focus on raising the bar, not eliminating threat |
| Zero-backend means no revocation | Design around graceful degradation |
| Code is inspectable | Security through obscurity is limited |

### Attacker Tiers

| Tier | Capability | Motivation | Mitigation |
|------|------------|------------|------------|
| **Casual Sharer** | Copy-paste license token | Share with friends | Device binding |
| **Skilled User** | Minify code, find checks, patch | Free premium features | Distributed verification, obfuscation |
| **Determined Cracker** | Reverse engineer, strip DRM | Distribute cracked builds | Canary values, feature flags |
| **Commercial Pirate** | Professional cracking operations | Sell cracked versions | Legal, watermarks, accept loss |

**Primary Target**: Skilled Users (Tier 2) — raise cost from "5 minutes" to "several hours"

---

## Design: 5-Layer Friction System

```
★ Insight ─────────────────────────────────────
• Each layer is independently useful — patching one doesn't defeat others
• Layers are designed to be UPDATED independently, keeping cracked builds stale
• Zero-backend principle maintained: no persistent storage, no user accounts
─────────────────────────────────────────────────
```

### Layer 1: Distributed Verification Calls

**Problem**: Single `LicenseVerifier.verify()` call is easy to find and patch

**Solution**: Sprinkle lightweight verification calls throughout premium code paths

#### Implementation

```javascript
// js/security/license-verifier.js (new export)
let _cachedVerification = null;
let _cacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

export async function quickVerify() {
  const now = Date.now();

  // Return cached result if fresh
  if (_cachedVerification && (now - _cacheTime < CACHE_TTL)) {
    return _cachedVerification;
  }

  // Perform verification (cached internally for 24h)
  const result = await verifyStoredLicense();

  _cachedVerification = result;
  _cacheTime = now;

  return result;
}

// Inline convenience function for critical sections
export function assertPremium(context = 'operation') {
  const verification = await quickVerify();
  if (!verification.valid) {
    throw new PremiumRequiredError(context);
  }
  return verification.tier;
}
```

#### Injection Points

| File | Location | Purpose |
|------|----------|---------|
| `js/services/semantic-search-service.js` | Before `semanticSearch()` | Protect premium feature |
| `js/services/playlist-generator.js` | Before `generatePlaylist()` | Protect unlimited playlists |
| `js/services/personality-insights-service.js` | Before `getPersonalityInsights()` | Protect AI analysis |
| `js/controllers/playlist-controller.js` | Before export operations | UI-layer check |
| `js/controllers/search-controller.js` | Before semantic search | Second check (defense in depth) |

#### Example Integration

```javascript
// js/services/semantic-search-service.js
import { assertPremium } from '../security/license-verifier.js';

export async function semanticSearch(query, options) {
  // Friction check: ~5ms when cached
  const tier = await assertPremium('semantic-search');

  // ... existing logic ...
}
```

**Attack Cost**: Must find and patch 5-10 call sites instead of 1

---

### Layer 2: Integrity-Checked Public Key

**Problem**: Public key is a static string that can be replaced with attacker's key

**Solution**: Embed the public key with integrity verification

#### Implementation

```javascript
// js/security/license-verifier.js

// Build-time constants (generated during build)
const KEY_INTEGRITY_SALT = '__BUILD_SALT__'; // Replaced by build script
const KEY_PART_A = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...';
const KEY_PART_B = '...rest of key';
const EXPECTED_HASH = '__KEY_HASH__'; // SHA-256 of PART_A + PART_B + SALT

async function getPublicKey() {
  // Reconstruct key
  const reconstructed = KEY_PART_A + KEY_PART_B;

  // Verify integrity
  const integrityCheck = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(reconstructed + KEY_INTEGRITY_SALT)
  );

  const hashArray = Array.from(new Uint8Array(integrityCheck));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  if (hashHex !== EXPECTED_HASH) {
    // Key was tampered with
    throw new Error('CORRUPT_INSTALLATION');
  }

  return importPublicKey(reconstructed);
}
```

#### Build Script Integration

```javascript
// scripts/generate-key-integrity.mjs
import crypto from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

const KEY_PART_A = '...'; // From source
const KEY_PART_B = '...'; // From source
const SALT = crypto.randomBytes(16).toString('hex');

const hash = crypto.createHash('sha256')
  .update(KEY_PART_A + KEY_PART_B + SALT)
  .digest('hex');

// Replace placeholders in license-verifier.js
let source = readFileSync('js/security/license-verifier.js', 'utf-8');
source = source.replace('__BUILD_SALT__', SALT);
source = source.replace('__KEY_HASH__', hash);
writeFileSync('js/security/license-verifier.prod.js', source);
```

**Attack Cost**: Must either:
- Find and patch the integrity check (buried in 800-line file)
- Replace key AND compute new hash

---

### Layer 3: Code Obfuscation (Production Only)

**Problem**: Clear code makes finding verification logic trivial

**Solution**: Apply lightweight obfuscation to security-critical paths

#### Tool Selection

**Recommended**: [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator)

**NOT recommended**: commercial tools with `self-defending` (too brittle, causes false positives)

#### Configuration

```javascript
// obfuscator.config.js
export default {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  stringArray: true,
  stringArrayThreshold: 0.5,
  stringArrayIndexesType: ['hexadecimal-number'],
  transformObjectKeys: true,
  unicodeEscapeSequence: false, // Keep code ASCII-readable for debugging

  // AVOID THESE:
  selfDefending: false, // Too aggressive, causes crashes
  debugProtection: false, // Breaks dev tools
};
```

#### Files to Obfuscate

| File | Priority | Notes |
|------|----------|-------|
| `js/security/license-verifier.js` | HIGH | Core verification logic |
| `js/services/premium-gatekeeper.js` | HIGH | Feature access control |
| `js/security/key-manager.js` | MEDIUM | Key derivation (less critical) |

**DO NOT obfuscate**: Everything else (unnecessary, harms debugging)

#### Build Integration

```javascript
// vite.config.js or build script
import JavaScriptObfuscator from 'javascript-obfuscator';
import { readFileSync, writeFileSync } from 'fs';

const obfuscator = JavaScriptObfuscator.obfuscator;

function obfuscateSecurity(inputPath, outputPath) {
  const source = readFileSync(inputPath, 'utf-8');
  const obfuscated = obfuscator(source, config);
  writeFileSync(outputPath, obfuscated.getObfuscatedCode());
}

if (isProductionBuild) {
  obfuscateSecurity(
    'js/security/license-verifier.js',
    'dist/security/license-verifier.js'
  );
  obfuscateSecurity(
    'js/services/premium-gatekeeper.js',
    'dist/services/premium-gatekeeper.js'
  );
}
```

**Attack Cost**: De-obfuscating takes hours vs. minutes for clear code

---

### Layer 4: Canary Values (Honeytokens)

**Problem**: Attacker doesn't know if their patch worked completely

**Solution**: Add fake checks that look real but don't affect functionality

#### Implementation

```javascript
// js/security/canary-watch.js (new file)
const CANARY_VALUES = {
  FAKE_LICENSE_CHECK_1: 'VALID',
  FAKE_LICENSE_CHECK_2: 'VALID',
  FAKE_PREMIUM_GATE: 'UNLOCKED',
  FAKE_TIER_CHECK: 'CHAMBER',
  // ... 10-20 of these scattered across codebase
};

let _canaryCheckEnabled = true;

export function verifyCanaries() {
  if (!_canaryCheckEnabled) return true;

  const checks = [
    CANARY_VALUES.FAKE_LICENSE_CHECK_1 === 'VALID',
    CANARY_VALUES.FAKE_LICENSE_CHECK_2 === 'VALID',
    CANARY_VALUES.FAKE_PREMIUM_GATE === 'UNLOCKED',
    CANARY_VALUES.FAKE_TIER_CHECK === 'CHAMBER',
  ];

  if (checks.some(c => !c)) {
    // Canary was modified → tampering detected
    silentReport('canary_dead');
    _canaryCheckEnabled = false; // Don't spam reports
    return false;
  }

  return true;
}

// Randomly check canaries during app lifecycle (10% chance on premium ops)
export function maybeCheckCanary() {
  if (Math.random() < 0.1) {
    verifyCanaries();
  }
}

function silentReport(reason) {
  // Log to console (dev) or send to analytics (prod)
  if (isProduction) {
    // Could integrate with analytics if available
    console.warn('[Security] Canary check failed:', reason);
  }
}
```

#### Integration

```javascript
// In premium operations
import { maybeCheckCanary } from '../security/canary-watch.js';

export async function semanticSearch(query, options) {
  await assertPremium('semantic-search');
  maybeCheckCanary(); // 10% chance to verify canaries

  // ... existing logic ...
}
```

**Attack Cost**: Must figure out which checks are real vs. fake (20+ values to reverse engineer)

---

### Layer 5: Remote Feature Flagging (Minimal Server Touch)

**Problem**: Cracked builds work forever once released

**Solution**: Embed a "freshness check" that requires periodic re-verification

#### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Static JSON Hosted (GitHub Pages, Cloudflare Workers, etc.) │
│  https://config.rhythmchamber.app/feature-flags.json       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ Fetched during build (NOT at runtime)
┌─────────────────────────────────────────────────────────────┐
│  Build Script embeds flags into client bundle               │
│  FEATURE_FLAGS = { premium_deadline: timestamp }            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ Client checks at runtime
┌─────────────────────────────────────────────────────────────┐
│  If Date.now() > premium_deadline → Require re-verification │
└─────────────────────────────────────────────────────────────┘
```

#### Feature Flags Format

```json
{
  "premium_enabled": true,
  "premium_min_version": "1.0.0",
  "premium_deadline": 1735689600000,
  "flags": {
    "semantic_search": true,
    "personality_insights": true,
    "unlimited_playlists": true
  },
  "announcement": "New version available! Please update."
}
```

#### Client Implementation

```javascript
// js/config/feature-flags.js (generated during build)
export const FEATURE_FLAGS = {
  premium_enabled: true,
  premium_min_version: '1.0.0',
  premium_deadline: 1735689600000, // Embedded by build script
  flags: {
    semantic_search: true,
    personality_insights: true,
    unlimited_playlists: true
  }
};

// js/services/premium-gatekeeper.js
export async function checkFeatureFlag(feature) {
  const now = Date.now();

  // Check if premium deadline has passed
  if (now > FEATURE_FLAGS.premium_deadline) {
    // Server has signaled premium should be re-verified
    const verification = await LicenseService.verifyOnline(); // Force online check

    if (!verification.valid) {
      return { allowed: false, reason: 'REVERIFY_REQUIRED' };
    }
  }

  // Check feature-specific flag
  if (!FEATURE_FLAGS.flags[feature]) {
    return { allowed: false, reason: 'FEATURE_DISABLED' };
  }

  return { allowed: true };
}
```

#### Build Script

```javascript
// scripts/fetch-feature-flags.mjs
import { writeFileSync } from 'fs';

const FLAGS_URL = 'https://config.rhythmchamber.app/feature-flags.json';

async function fetchFlags() {
  const response = await fetch(FLAGS_URL);
  const flags = await response.json();

  // Generate client module
  const output = `export const FEATURE_FLAGS = ${JSON.stringify(flags, null, 2)};`;

  writeFileSync('js/config/feature-flags.js', output);
  console.log('Feature flags updated:', flags.premium_deadline);
}

fetchFlags();
```

#### Hosting Options

| Option | Cost | Complexity | Reliability |
|--------|------|------------|-------------|
| **GitHub Pages** | Free | Low | Good |
| **Cloudflare Workers** | Free tier | Low | Excellent |
| **AWS S3 + CloudFront** | $0.01/mo | Medium | Excellent |

**Recommendation**: Cloudflare Workers (free tier, global CDN, no cold starts)

**Attack Cost**: Cracked builds have a shelf life (e.g., 30-90 days) and must be re-released

---

## Implementation Plan

### Phase 1: Foundation (1-2 days)

| Task | File | Effort |
|------|------|--------|
| Add `quickVerify()` to license-verifier.js | `js/security/license-verifier.js` | 1h |
| Add `assertPremium()` helper | `js/security/license-verifier.js` | 30m |
| Write build script for key integrity | `scripts/generate-key-integrity.mjs` | 2h |
| Implement Layer 2 integrity checks | `js/security/license-verifier.js` | 2h |

### Phase 2: Distribution (1 day)

| Task | Files | Effort |
|------|-------|--------|
| Add verification calls to services | Semantic search, playlist, personality | 1h |
| Add verification calls to controllers | All premium controllers | 1h |
| Test distributed verification | E2E tests | 2h |

### Phase 3: Obfuscation (1 day)

| Task | Effort |
|------|--------|
| Install javascript-obfuscator | 15m |
| Configure obfuscation settings | 30m |
| Integrate into build script | 1h |
| Test obfuscated build | 2h |
| Document obfuscation process | 30m |

### Phase 4: Canaries (1 day)

| Task | File | Effort |
|------|------|--------|
| Create canary-watch module | `js/security/canary-watch.js` | 2h |
| Embed canary values | Scattered across codebase | 1h |
| Add canary checks to premium ops | Service files | 1h |
| Test canary detection | Unit tests | 2h |

### Phase 5: Feature Flags (1 day)

| Task | Files | Effort |
|------|-------|--------|
| Create feature flag fetch script | `scripts/fetch-feature-flags.mjs` | 1h |
| Implement flag checking | `js/config/feature-flags.js` | 1h |
| Integrate into gatekeeper | `js/services/premium-gatekeeper.js` | 1h |
| Deploy flags endpoint | Cloudflare Workers | 1h |
| Test flag updates | Manual + automated | 2h |

### Phase 6: Testing & Documentation (1 day)

| Task | Effort |
|------|--------|
| Write security tests for each layer | 2h |
| Document anti-tampering architecture | Update SECURITY.md | 1h |
| Create troubleshooting guide | docs/security/anti-tampering.md | 1h |
| E2E testing of all layers | 2h |

**Total Estimate**: 6-7 days

---

## Security Analysis

### What's Protected

| Threat | Before | After |
|--------|--------|-------|
| Casual license sharing | Possible (token copy) | Mitigated by device binding |
| Patching single check | Trivial (1 location) | Annoying (10+ locations) |
| Replacing public key | Possible (string replace) | Difficult (integrity check) |
| Reading verification logic | Easy (clear code) | Difficult (obfuscated) |
| Cracked build shelf life | Forever | 30-90 days |
| Detecting tampering | Impossible | Canary values detect |

### What's NOT Protected (Accepted Limitations)

| Threat | Status | Rationale |
|--------|--------|-----------|
| Determined cracker | Still possible | Always true for client-side code |
| Commercial piracy | Still possible | Accept as cost of zero-backend |
| Memory patching | Still possible | Browser limitation, not worth mitigating |
| Reverse engineering | Still possible | Code is inspectable, only made annoying |

---

## Rollout Strategy

### Pre-Release (Current)

1. ✅ Design complete (this document)
2. ⏳ Implement all 5 layers
3. ⏳ Test thoroughly
4. ⏳ Document in SECURITY.md

### Release 1.0

1. Enable all layers in production build
2. Set initial `premium_deadline` to 90 days out
3. Monitor for false positives

### Post-Release

1. Update `premium_deadline` every 30-60 days via feature flags
2. Rotate canary values with each release
3. Update obfuscation settings periodically
4. Add new verification call sites as features are added

---

## Monitoring & Metrics

### What to Track

| Metric | How | Purpose |
|--------|-----|---------|
| Canary deaths | Console warning + analytics | Detect tampering attempts |
| Verification failures | Error tracking | Detect bugs vs. attacks |
| Feature flag fetch failures | Build logs | Ensure flags are fresh |
| Obfuscation success rate | Build success/fail | Prevent broken builds |

### Response Procedures

| Situation | Action |
|-----------|--------|
| Spike in canary deaths | Investigate possible crack release |
| Verification failures | Check if bug or attack pattern |
| Feature flag unreachable | Extend deadline temporarily |
| Obfuscation breaks build | Revert config, investigate |

---

## Open Questions

1. **Feature flags hosting**: GitHub Pages or Cloudflare Workers?
2. **Obfuscation scope**: Just security files or broader?
3. **Canary reporting**: Silent console logs or analytics integration?
4. **Shelf life**: 30, 60, or 90 days for premium deadline?

---

## References

- [SECURITY.md](../SECURITY.md) - Overall security model
- [License Verification Architecture](../security/license-verification-architecture.md) - Current ECDSA implementation
- [javascript-obfuscator documentation](https://github.com/javascript-obfuscator/javascript-obfuscator)
- [Cloudflare Workers docs](https://developers.cloudflare.com/workers/)

---

**Document Version**: 1.0
**Last Updated**: 2026-02-02
**Status**: Ready for Implementation
