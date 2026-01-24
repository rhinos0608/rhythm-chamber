# Documentation Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update all outdated documentation to reflect the current state of Rhythm Chamber, including new premium features, security improvements, and architectural changes.

**Architecture:** Structured documentation updates prioritized by user impact, with critical updates first (pricing, security, premium features), followed by technical documentation, then testing guides.

**Tech Stack:** Markdown documentation, existing file structure

---

## Investigation Summary

Based on parallel investigation by 4 agents, the following documentation issues were identified:

### Key Findings:
1. **Core Architecture**: IoC Container pattern, service-oriented architecture, event-driven communication
2. **Business Logic**: Function calling system with executors, schemas, and artifact generation
3. **Security**: v0.9 milestone with AES-GCM-256, token binding, TOCTOU fixes, 100% client-side
4. **AI/ML**: WASM-based embeddings, BYOI model, local-first semantic search (no Qdrant cloud)

### Outdated Documentation Found:
- README pricing references old three-tier model
- SECURITY.md mentions Qdrant cloud dependency
- API_REFERENCE.md has legacy encryption patterns
- Missing license verification documentation
- Testing docs incomplete

---

## Task 1: Update README.md - Critical User-Facing Changes

**Files:**
- Modify: `README.md:217-257` (pricing section)
- Modify: `README.md:152-158` (project status)

**Step 1: Update pricing section**

Replace the outdated "Three-Pillar Model" with current "Two-Tier Pricing Model":

```markdown
## Pricing & Licensing

Rhythm Chamber offers a simple two-tier pricing model:

| Tier | Price | Features |
|------|-------|----------|
| **Sovereign** | Free | Local AI only, manual data import, basic chat, manual profile creation |
| **Chamber** | $4.99/month | Cloud AI access, Spotify integration, AI-generated profiles, premium features |

### Premium Features (Chamber Tier)
- Spotify OAuth integration (automatic data import)
- OpenRouter cloud AI access
- AI-generated profile narratives
- Unlimited chat sessions
- Artifact visualizations
- Advanced analytics features

### License Verification
- Licenses managed through Lemon Squeezy
- Local validation with encrypted storage
- Graceful fallback to Sovereign tier
- 30-day validation cache
```

**Step 2: Update project status**

Change from "In Progress" to reflect current state:

```markdown
## Project Status

✅ **Complete** — Core analytics engine, local AI processing, premium integration
✅ **Complete** — Zero-backend architecture with client-side security
✅ **Complete** — BYOI (Bring Your Own Intelligence) provider support
🔄 **Active** — Feature refinement and user experience improvements
```

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update pricing model and project status in README"
```

---

## Task 2: Update SECURITY.md - Remove Outdated Architecture References

**Files:**
- Modify: `SECURITY.md:83-86` (Qdrant references)
- Modify: `SECURITY.md` (semantic search section)

**Step 1: Remove Qdrant cloud references**

Find and replace mentions of Qdrant cloud dependency with WASM-based semantic search:

```markdown
### Semantic Search

All semantic search functionality is implemented using:
- **100% Client-Side**: WASM-compiled transformers running in the browser
- **No External Dependencies**: No cloud vector databases or API calls
- **Local Embeddings**: Generated using @xenova/transformers
- **Privacy Preserving**: Search queries never leave the device
```

**Step 2: Update security architecture section**

Add TOCTOU race condition fix documentation:

```markdown
### Storage Security

Recent security improvements (v0.9):
- **TOCTOU Prevention**: Reservation mechanism in QuotaManager prevents race conditions
- **Token Binding**: SHA-256 hashed device fingerprints for all API access
- **Session Versioning**: Automatic credential invalidation on auth events
- **CORS Validation**: Proper handling of null origins from file:// URLs
```

**Step 3: Commit**

```bash
git add SECURITY.md
git commit -m "docs: remove Qdrant references, add v0.9 security improvements"
```

---

## Task 3: Create License Verification Documentation

**Files:**
- Create: `docs/license-verification.md`

**Step 1: Write the new documentation file**

```markdown
# License Verification System

## Overview

Rhythm Chamber uses Lemon Squeezy for license management and premium feature gating.

## Architecture

```
Client App → License Verifier → Cloudflare Worker → Lemon Squeezy API
     ↓                ↓                    ↓
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
```

**Step 2: Update docs/INDEX.md to include new document**

Add to the index:

```markdown
## Technical Documentation
- [License Verification](license-verification.md) - Premium feature licensing
```

**Step 3: Commit**

```bash
git add docs/license-verification.md docs/INDEX.md
git commit -m "docs: add license verification system documentation"
```

---

## Task 4: Update API_REFERENCE.md - Security Section

**Files:**
- Modify: `API_REFERENCE.md:690-964` (security section)

**Step 1: Update encryption documentation**

Replace legacy hybrid encryption references with current v0.9 implementation:

```markdown
### Security Module

#### AES-GCM-256 Encryption

The `Crypto` module implements AES-GCM-256 encryption for sensitive data:

```javascript
import { encryptData, decryptData } from './security/crypto.js';

// Encrypt API keys
const encrypted = await encryptData(apiKey, keyMaterial);

// Decrypt with key derivation
const decrypted = await decryptData(encrypted, keyMaterial);
```

#### Key Derivation (PBKDF2)

Keys are derived using:
- 600,000 iterations (PBKDF2)
- Session salt + Spotify refresh token + session version
- SHA-256 HMAC

#### Token Binding

All token access requires device binding verification:

```javascript
import { SecureTokenStore } from './security/secure-token-store.js';

const tokenStore = new SecureTokenStore();
const token = await tokenStore.getToken(); // Automatic binding verification
```
```

**Step 2: Add recent security fixes**

```markdown
### Recent Security Fixes (v0.9)

#### TOCTOU Race Condition
Added reservation mechanism to `QuotaManager.checkWriteFits()`:
- Space reserved before write operation
- 30-second auto-release for stale reservations
- Prevents concurrent write quota violations

#### CORS Validation
- Handle null origin from file:// URLs
- Fail closed when license verification unavailable
- State parameter validation for OAuth callbacks

#### Device Secret Race Condition
Protected device secret generation from race conditions during initialization.
```

**Step 3: Commit**

```bash
git add API_REFERENCE.md
git commit -m "docs: update security section with v0.9 implementation"
```

---

## Task 5: Create Premium Features User Guide

**Files:**
- Create: `docs/premium-features-guide.md`

**Step 1: Write the premium features guide**

```markdown
# Premium Features Guide

## Overview

Rhythm Chamber Chamber tier unlocks powerful AI-driven features for music analytics.

## Premium Features

### Spotify Integration

Connect your Spotify account for automatic data import:

1. Click "Connect with Spotify"
2. Authorize via OAuth (PKCE flow)
3. Select analysis mode (Full or Quick Snapshot)
4. Data imported locally - never sent to external servers

### Cloud AI Access

Use OpenRouter for advanced AI capabilities:

- **GPT-4**, **Claude**, and other models available
- Bring your own API key
- Token counting and budget management
- Automatic fallback to local AI

### AI-Generated Profiles

Let AI create rich, personalized music narratives:

- Personality analysis based on listening patterns
- Era detection and musical evolution
- Mood and atmosphere profiling
- Comparative analysis (year-over-year)

### Artifact Visualizations

Beautiful, interactive data visualizations:

- Listening timelines and heatmaps
- Trend analysis charts
- Period comparisons
- Exportable formats

## License Management

### Activating Your License

1. Purchase from [Lemon Squeezy]
2. Copy your license key
3. Enter in Settings → License
4. Features unlock automatically

### License Tiers

| Feature | Sovereign (Free) | Chamber ($4.99/mo) |
|---------|------------------|---------------------|
| Local AI | ✅ | ✅ |
| Cloud AI | ❌ | ✅ |
| Spotify Import | Manual | Auto (OAuth) |
| AI Profiles | Manual | Auto-Generated |
| Artifacts | Basic | Advanced |
| Chat Sessions | Limited | Unlimited |

### Troubleshooting

**License not validating?**
- Check internet connection (required for initial validation)
- Verify license key format
- Check if license expired in Lemon Squeezy dashboard

**Features still locked?**
- Refresh the page after activation
- Clear browser cache if needed
- Contact support if issue persists
```

**Step 2: Update docs/INDEX.md**

```markdown
## User Guides
- [Premium Features Guide](premium-features-guide.md) - Chamber tier features
```

**Step 3: Commit**

```bash
git add docs/premium-features-guide.md docs/INDEX.md
git commit -m "docs: add premium features user guide"
```

---

## Task 6: Update TESTING.md - Complete Testing Documentation

**Files:**
- Modify: `TESTING.md`

**Step 1: Update test structure documentation**

```markdown
## Test Structure

```
tests/
├── unit/                    # Unit tests (56 files)
│   ├── observability/       # Performance monitoring tests
│   ├── critical-*.test.js   # Security and bug fix tests
│   └── [module].test.js     # Module-specific tests
├── integration/             # Integration tests (4 files)
├── e2e/                     # End-to-end tests (2 files)
├── fixtures/                # Test data files
└── rhythm-chamber.spec.ts  # Main E2E test suite
```

## Test Frameworks

- **Vitest**: Unit and integration tests with happy-dom environment
- **Playwright**: End-to-end testing with visual debugging
- **Happy-DOM**: Browser-like environment for unit tests
```

**Step 2: Add test commands**

```markdown
## Running Tests

```bash
# Unit tests
npm run test:unit

# E2E tests
npm run test:e2e

# All tests
npm run test

# With coverage
npm run test:unit -- --coverage
```
```

**Step 3: Add integration testing section**

```markdown
## Integration Testing

Integration tests verify cross-module functionality:

- **Storage encryption**: End-to-end data encryption workflows
- **License verification**: Complete license validation flow
- **Spotify integration**: OAuth to data import pipeline
- **Premium gating**: Feature unlock with valid license

### Writing Integration Tests

```javascript
import { describe, it, expect } from 'vitest';
import { Storage, Crypto } from '@/js/services/index.js';

describe('Storage Encryption Integration', () => {
  it('should encrypt and decrypt data end-to-end', async () => {
    const storage = new Storage();
    const testData = { sensitive: 'data' };

    await storage.set('test-key', testData);
    const retrieved = await storage.get('test-key');

    expect(retrieved).toEqual(testData);
  });
});
```
```

**Step 4: Add security testing patterns**

```markdown
## Security Testing

### Race Condition Testing

```javascript
describe('TOCTOU Race Conditions', () => {
  it('should prevent concurrent write quota violations', async () => {
    const quotaManager = new QuotaManager(1000);

    // Reserve space before write
    await quotaManager.reserve(500);

    // Parallel writes should respect reservation
    const results = await Promise.allSettled([
      quotaManager.write('key1', new Uint8Array(500)),
      quotaManager.write('key2', new Uint8Array(500))
    ]);

    expect(results[1].status).toBe('rejected');
  });
});
```

### License Verification Testing

```javascript
describe('License Verification', () => {
  it('should validate Chamber tier license', async () => {
    const verifier = new LicenseVerifier();
    const result = await verifier.verify('chamber-license-key');

    expect(result.valid).toBe(true);
    expect(result.tier).toBe('chamber');
  });
});
```
```

**Step 5: Commit**

```bash
git add TESTING.md
git commit -m "docs: complete testing documentation with new patterns"
```

---

## Task 7: Update docs/03-technical-architecture.md

**Files:**
- Modify: `docs/03-technical-architecture.md`

**Step 1: Update architecture overview**

Remove Qdrant references and update WASM-based semantic search:

```markdown
### Semantic Search Architecture

```
User Query
    ↓
WASM Embedding Generator (@xenova/transformers)
    ↓
Local Vector Store (IndexedDB)
    ↓
Cosine Similarity Calculation
    ↓
Ranked Results
```

All processing happens client-side with no external dependencies.
```

**Step 2: Update IoC Container section**

```markdown
### IoC Container Pattern

The application uses a custom IoC (Inversion of Control) Container for dependency injection:

```javascript
// Service Registration
container.register('Storage', () => new Storage());
container.register('AppState', () => new AppState());

// Controller Initialization with Auto-wiring
const chatController = new ChatUIController({
  chat: container.resolve('Chat'),
  artifacts: container.resolve('Artifacts')
});
```

Benefits:
- Centralized dependency management
- Easier testing with mock injection
- Clear dependency graph
- Singleton service lifecycle
```

**Step 3: Commit**

```bash
git add docs/03-technical-architecture.md
git commit -m "docs: update technical architecture with IoC and WASM details"
```

---

## Task 8: Update docs/04-intelligence-engine.md

**Files:**
- Modify: `docs/04-intelligence-engine.md:194-240`

**Step 1: Update semantic search section**

```markdown
### Semantic Search

**Implementation**: 100% client-side using WASM-compiled transformers

```javascript
import { pipeline } from '@xenova/transformers';

// Generate embeddings locally
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
const embedding = await extractor(query, { pooling: 'mean', normalize: true });
```

**Performance**:
- ~500ms for first query (model loading)
- ~50ms for subsequent queries
- No network latency
- Works offline after initial model load

**Privacy**:
- No API calls to external services
- Queries processed locally
- No data transmitted
```

**Step 2: Update BYOI section**

```markdown
### Bring Your Own Intelligence (BYOI)

Users can choose their AI provider:

| Provider | Type | Cost | Setup |
|----------|------|------|-------|
| Ollama | Local | Free | Install Ollama, run model |
| LM Studio | Local | Free | Install LM Studio, enable API |
| OpenRouter | Cloud | Pay-per-use | Add API key in settings |

The system automatically detects available providers and falls back gracefully.
```

**Step 3: Commit**

```bash
git add docs/04-intelligence-engine.md
git commit -m "docs: update intelligence engine with WASM embeddings"
```

---

## Task 9: Create Provider Health Monitoring Documentation

**Files:**
- Create: `docs/provider-health-monitoring.md`

**Step 1: Write the documentation**

```markdown
# Provider Health Monitoring

## Overview

Rhythm Chamber implements circuit breaker pattern for AI provider reliability.

## Architecture

```
Provider Health Monitor
    ↓
├── Ollama (localhost:11434)
├── LM Studio (localhost:1234)
└── OpenRouter (api.openrouter.ai)

Status: Healthy | Degraded | Unhealthy
    ↓
Fallback: Local AI → Next Provider → Error
```

## Health Checks

### Local Providers
- TCP connection check
- /health endpoint
- Model availability
- Response time monitoring

### Cloud Providers
- API reachability
- Rate limit status
- Error rate tracking
- Credit balance

## Circuit Breaker

States:
1. **Closed**: Normal operation
2. **Open**: Provider marked unhealthy, requests bypassed
3. **Half-Open**: Test requests to check recovery

Configuration:
```javascript
{
  failureThreshold: 3,
  resetTimeout: 60000,  // 1 minute
  monitoringInterval: 30000  // 30 seconds
}
```

## Fallback Chain

```
Preferred Provider (User Selected)
    ↓ (if unhealthy)
Next Available Provider
    ↓ (if all unhealthy)
Local AI (WASM transformers)
    ↓ (if unavailable)
Error Message
```

## Implementation

See: `js/services/provider-health-monitor.js`

## Monitoring UI

Status indicators in Settings:
- 🟢 Green: Provider healthy
- 🟡 Yellow: Provider degraded
- 🔴 Red: Provider unavailable
```

**Step 2: Update docs/INDEX.md**

```markdown
## Technical Documentation
- [Provider Health Monitoring](provider-health-monitoring.md) - AI provider reliability
```

**Step 3: Commit**

```bash
git add docs/provider-health-monitoring.md docs/INDEX.md
git commit -m "docs: add provider health monitoring documentation"
```

---

## Task 10: Create Artifact Integration Guide

**Files:**
- Create: `docs/artifact-integration.md`

**Step 1: Write the integration guide**

```markdown
# Artifact Visualization Integration Guide

## Overview

Artifacts are dynamically generated visualizations with narrative context.

## Artifact Types

| Type | Description | Use Case |
|------|-------------|----------|
| Line Chart | Trends over time | Listening patterns |
| Bar Chart | Categorical comparison | Top artists/tracks |
| Table | Structured data | Detailed statistics |
| Timeline | Temporal events | Listening history |
| Heatmap | Density visualization | Listening clock |

## Creating Artifacts

### 1. Define ArtifactSpec

```javascript
import { ArtifactSpec } from './artifacts/artifact-spec.js';

const spec = new ArtifactSpec({
  type: 'line-chart',
  title: 'Listening Trends',
  data: processedData,
  metadata: {
    explanation: 'Your listening increased over 2024',
    annotations: ['Peak in summer']
  }
});
```

### 2. Render Artifact

```javascript
import { ArtifactRenderer } from './artifacts/renderer.js';

const renderer = new ArtifactRenderer();
const svg = await renderer.render(spec);
container.appendChild(svg);
```

### 3. Validate Before Rendering

```javascript
import { validateArtifactSpec } from './artifacts/validation.js';

const errors = validateArtifactSpec(spec);
if (errors.length > 0) {
  throw new Error(`Invalid spec: ${errors.join(', ')}`);
}
```

## CSP Compliance

All rendering is deterministic SVG generation - no inline scripts or eval.

## Examples

See: `js/functions/executors/artifact-executors.js`

## Styling

Artifacts support color themes:
- Light mode (default)
- Dark mode
- Custom color palettes
```

**Step 2: Update docs/INDEX.md**

```markdown
## Technical Documentation
- [Artifact Integration](artifact-integration.md) - Visualization development
```

**Step 3: Commit**

```bash
git add docs/artifact-integration.md docs/INDEX.md
git commit -m "docs: add artifact integration guide for developers"
```

---

## Summary of Changes

### Updated Files
1. `README.md` - Pricing, project status
2. `SECURITY.md` - Qdrant removal, v0.9 improvements
3. `API_REFERENCE.md` - Security section update
4. `TESTING.md` - Complete testing guide
5. `docs/03-technical-architecture.md` - IoC, WASM
6. `docs/04-intelligence-engine.md` - Semantic search
7. `docs/INDEX.md` - New document links

### New Files
1. `docs/license-verification.md` - License system docs
2. `docs/premium-features-guide.md` - User guide
3. `docs/provider-health-monitoring.md` - Circuit breaker docs
4. `docs/artifact-integration.md` - Developer guide

---

**Plan complete and saved to `docs/plans/2026-01-24-documentation-update.md`.**

**Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
