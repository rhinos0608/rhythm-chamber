# AI Agent Quick Reference — Rhythm Chamber

> **Purpose**: Primary onboarding document for AI agents working on this codebase
> **Target Read Time**: 2 minutes
> **For Deep Dives**: See [AGENT_CONTEXT.md](AGENT_CONTEXT.md) (comprehensive architecture)

---

## What is Rhythm Chamber?

**Rhythm Chamber** is an AI-powered music analytics application that tells users what their Spotify listening history says about their personality — like Spotify Wrapped but deeper, year-round, and conversational. It runs 100% client-side with zero backend, prioritizing privacy through local data processing and user-controlled AI providers (BYOI - Bring Your Own Intelligence).

**Core Value**: Emotional insights + Privacy + Control

**Tech Stack**: Modern vanilla JavaScript (ES6 modules) + IndexedDB + Web Workers + WASM semantic search + Multiple AI providers (local/cloud)

---

## Architecture Principles

### HNW Pattern (Hierarchical Network Wave)

This codebase follows the **HNW** architecture pattern:

```
★ Insight ─────────────────────────────────────
HNW organizes code into three dimensions:
• Hierarchy: Clear command chain (App → Controller → Service → Provider)
• Network: Modular communication via events, not direct coupling
• Wave: Deterministic leader election for cross-tab coordination
─────────────────────────────────────────────────
```

**What this means for you:**
- ✅ **DO** Follow the dependency chain: Controllers call Services, Services call Providers
- ✅ **DO** Use the EventBus for cross-module communication
- ✅ **DO** Let TabCoordinator handle cross-tab conflicts
- ❌ **DON'T** Create circular dependencies
- ❌ **DON'T** Bypass the abstraction layers (e.g., Controllers shouldn't call Providers directly)

### Zero-Backend Philosophy

**Everything runs in the browser.** No servers, no APIs, no data transmission.

- Data storage: IndexedDB (encrypted)
- AI processing: User's chosen provider (local Ollama/LM Studio or cloud via OpenRouter)
- Vector search: WASM-based @xenova/transformers (100% local)
- Authentication: Spotify OAuth (tokens stored client-side, encrypted)

### BYOI Model (Bring Your Own Intelligence)

Users choose their AI provider. The app orchestrates, doesn't dictate.

**Supported providers:**
- **Local**: Ollama, LM Studio (free, offline)
- **Cloud**: OpenRouter, OpenAI-compatible APIs (pay-per-use)

**Key implication**: When working with LLM features, always use the Provider abstraction layer — never hard-code API calls to a specific service.

### Modular Structure

```
js/
├── main.js                    # ENTRY POINT - Bootstrap and initialization
├── app.js                     # Main orchestrator
│
├── controllers/               # UI LAYER (15 controllers)
│   ├── chat-ui-controller.js  # Message rendering, streaming
│   ├── sidebar-controller.js  # Session management
│   └── [13 more...]           # Focused UI components
│
├── services/                  # BUSINESS LOGIC (25+ services)
│   ├── event-bus.js           # ⭐ Central event system
│   ├── llm-api-orchestrator.js # AI provider routing
│   ├── tab-coordination.js    # Cross-tab coordination
│   └── [22 more...]           # Core functionality
│
├── utils/                     # SHARED UTILITIES (13+)
├── storage/                   # IndexedDB + encryption
├── security/                  # AES-GCM, HMAC, key management
├── workers/                   # Web Workers (parallel processing)
└── artifacts/                 # Data visualization (SVG renderer)
```

---

## Critical File Locations

### Entry Points
- **`js/main.js`** - Application bootstrap, security checks, dependency initialization
- **`js/app.js`** - Main orchestrator, controller initialization

### Key Directories
| Directory | Purpose | First Stop For... |
|-----------|---------|-------------------|
| `js/controllers/` | UI components | Adding/modifying UI behavior |
| `js/services/` | Business logic | Core functionality, data processing |
| `js/security/` | Encryption, signing | Security features (review required!) |
| `js/storage/` | IndexedDB operations | Data persistence |
| `tests/unit/` | Vitest tests | Unit testing |
| `tests/rhythm-chamber.spec.ts` | Playwright tests | E2E testing |

### Essential Documentation
- **[AGENT_CONTEXT.md](AGENT_CONTEXT.md)** - Complete technical architecture (777 lines)
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Development workflow, testing, PR process
- **[SECURITY.md](SECURITY.md)** - Security model and threat analysis
- **[docs/INDEX.md](docs/INDEX.md)** - Documentation index (if it exists)

---

## Development Rules

### 1. ES6 Modules Only (No Globals)

```javascript
// ✅ GOOD
import { Storage } from './storage.js';
export function processData() { /* ... */ }

// ❌ BAD
window.Storage = { /* ... */ }
```

**Why?** Prevents pollution, enables tree-shaking, maintains modular architecture

### 2. Security Requirements

**CRITICAL**: Any changes to security modules require security review.

```javascript
// ✅ DO - Use Security facade
import { Security } from './security/index.js';
await Security.storeEncryptedCredentials('provider', { apiKey: '...' });

// ❌ DON'T - Log sensitive data
console.log('API key:', apiKey); // NEVER!
```

**Security checklist:**
- [ ] Never log sensitive data (API keys, tokens, user data)
- [ ] Use `Security.storeEncryptedCredentials()` for credentials
- [ ] Validate all user inputs
- [ ] Follow the threat model in `SECURITY.md`
- [ ] Test for XSS vulnerabilities (avoid `innerHTML` with user input)

### 3. Testing Requirements

```bash
# Unit tests (Vitest)
npm run test:unit          # Run all unit tests
npm run test:unit:watch    # Watch mode for TDD

# E2E tests (Playwright)
npm test                   # Run all E2E tests
npm run test:ui            # Run with UI for debugging
```

**Before committing:**
- [ ] Unit tests pass (`npm run test:unit`)
- [ ] E2E tests pass (`npm test`)
- [ ] Code follows style guidelines (JSDoc for public APIs)
- [ ] Security review completed if needed

### 4. Code Style

- **JSDoc comments** for public interfaces
- **Conventional commits** for commit messages (`feat:`, `fix:`, `docs:`, etc.)
- **Error handling** with Operation Lock system (see below)
- **No accidental globals** - check with `npm run lint:globals`

---

## Common Patterns

### Adding a New Feature

1. **Understand the architecture**: Read AGENT_CONTEXT.md sections relevant to your feature
2. **Identify the layer**: Is this UI (controller), business logic (service), or data (storage)?
3. **Follow HNW**: Controller → Service → Provider chain
4. **Use EventBus**: For cross-module communication
5. **Write tests**: Unit tests for services, E2E for full flows
6. **Document**: Add JSDoc for public APIs

### Fixing a Bug

1. **Reproduce**: Write a test that fails
2. **Locate**: Use Grep/Glob to find relevant code (see AGENT_CONTEXT.md for module locations)
3. **Understand**: Read the existing implementation and related code
4. **Fix**: Make minimal changes to fix the issue
5. **Test**: Ensure all tests pass
6. **Document**: Add comments if the fix is non-obvious

### Working with Storage

```javascript
import { Storage } from './storage.js';

// Read data
const streams = await Storage.streams.getAll();

// Write data (uses write-ahead log for durability)
await Storage.streams.put(streamData);

// Transactions (atomic operations)
await Storage.runTransaction(['STREAMS', 'CHUNKS'], async (stores) => {
    // Multiple operations in one transaction
});
```

**Key points:**
- Storage uses **write-ahead log** for crash recovery
- **Cross-tab coordination** ensures only primary tab writes
- **Encryption** is handled automatically for sensitive data

### Using the Event System

```javascript
import { EventBus } from './services/event-bus.js';

// Subscribe to events
EventBus.on('chat:message:sent', async (data) => {
    // Handle message sent
}, { domain: 'chat' });  // Domain filtering

// Emit events
await EventBus.emit('chat:message:sent', {
    sessionId: '...',
    content: '...'
}, { priority: 'HIGH' });  // Priority dispatch
```

**Event features:**
- **Typed events**: Schema validation for type safety
- **Priority dispatch**: CRITICAL, HIGH, NORMAL, LOW
- **Circuit breaker**: Prevents event storms
- **Domain filtering**: Scoped event delivery

### Error Handling with Operation Lock

```javascript
import { OperationLock } from './operation-lock.js';

const lock = OperationLock.acquire('processing');
try {
    // Your operation here
    await processData();
} catch (error) {
    // Handle error
    console.error('Processing failed:', error);
} finally {
    lock.release();
}
```

**Why Operation Lock?**
- Prevents concurrent operations that could conflict
- Provides clear error messages (LockAcquisitionError)
- Used throughout the codebase for critical operations

---

## Quick Reference

### Development Commands

```bash
# Start development server
npm run dev                  # Port 8080
npm run dev:coop-coep       # With COOP/COEP for SharedArrayBuffer

# Testing
npm run test:unit           # Unit tests (Vitest)
npm run test:unit:watch     # Watch mode
npm test                    # E2E tests (Playwright)
npm run test:ui             # Playwright with UI

# Linting
npm run lint:globals        # Check for accidental globals
```

### Security Checklist

Before committing changes, verify:

- [ ] No sensitive data in logs or error messages
- [ ] API keys encrypted with `Security.storeEncryptedCredentials()`
- [ ] User input validated
- [ ] No `innerHTML` with user input (XSS risk)
- [ ] HTTPS/localhost enforcement (secure context)
- [ ] Security review if modifying `js/security/`

### Common Gotchas

**Issue**: Cross-tab data corruption
**Solution**: Use TabCoordinator, never write directly from non-primary tabs

**Issue**: Data loss on page refresh
**Solution**: Use write-ahead log, transactions, and proper error handling

**Issue**: "CORS error" or "null origin"
**Solution**: Must run on HTTPS or localhost (secure context requirement)

**Issue**: Tests fail with IndexedDB errors
**Solution**: Use `fake-indexeddb` from test utilities

**Issue**: Event handlers firing multiple times
**Solution**: Check EventBus circuit breaker, use domain filtering

---

## Deep Links

### For Architecture Details
- **[AGENT_CONTEXT.md](AGENT_CONTEXT.md)** - Complete technical architecture
  - HNW patterns in detail
  - All 53+ components documented
  - Security model v0.9
  - Enhanced error handling system
  - Provider health monitoring

### For Development Workflow
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Development guidelines
  - Branch strategy
  - Commit message format
  - PR checklist
  - Testing requirements

### For Security
- **[SECURITY.md](SECURITY.md)** - Security model
  - Threat analysis
  - Implementation details
  - Reporting vulnerabilities

### For Deployment
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Deployment guide
- **[README.md](README.md)** - Product overview and features

### For Specific Topics
- **[docs/artifact-visualization-guide.md](docs/artifact-visualization-guide.md)** - Data visualization
- **[docs/ioc-container-implementation-guide.md](docs/ioc-container-implementation-guide.md)** - Dependency injection
- **[docs/operation-lock-contract.md](docs/operation-lock-contract.md)** - Concurrency control
- **[docs/provider-health-monitoring.md](docs/provider-health-monitoring.md)** - AI provider management

---

## Instructions for Agents

1. **Read this file first** (you just did!)
2. **Follow HNW patterns** in all code changes
3. **Respect the security model** — zero-backend is core to the product
4. **Use the EventBus** for cross-module communication
5. **Write tests** for all new functionality
6. **Document public APIs** with JSDoc comments
7. **Check AGENT_CONTEXT.md** for deep dives into specific components
8. **Ask for clarification** if unsure about architecture decisions

---

## Architecture Recap

```
★ Insight ─────────────────────────────────────
The codebase follows clear principles:
• Hierarchy: Controllers → Services → Providers (no bypassing layers)
• Network: EventBus for modular communication (no tight coupling)
• Wave: TabCoordinator for cross-tab coordination (no conflicts)
• Security: Defense-in-depth (encrypt everything sensitive)
• Testing: Unit + E2E for all features
─────────────────────────────────────────────────
```

**When in doubt:**
- Check AGENT_CONTEXT.md for component details
- Follow existing patterns in similar code
- Use the IoC container for dependency injection
- Emit events, don't call directly
- Test everything

---

**Last Updated**: 2025-01-29
**For comprehensive documentation**: See [AGENT_CONTEXT.md](AGENT_CONTEXT.md)
**For contribution guidelines**: See [CONTRIBUTING.md](CONTRIBUTING.md)
