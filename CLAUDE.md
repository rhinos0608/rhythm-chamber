# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Rhythm Chamber** is a 100% client-side music analytics application that analyzes Spotify listening data to provide personalized insights. Users can upload their Spotify export data (JSON/ZIP) or use OAuth quick snapshot for analysis. The app features AI-powered chat with function calling, pattern detection, personality classification, and semantic search capabilities.

**Key Differentiator**: Zero-backend architecture with "Bring Your Own Intelligence" (BYOI) - users choose local models (Ollama/LM Studio) or cloud providers (OpenRouter) with their own keys.

## Development Commands

### Local Development
```bash
npm run dev          # Start local server on port 8080 (http-server)
```

### Testing
```bash
npm test            # Run E2E tests (Playwright) - runs lint:globals first
npm run test:unit   # Run unit tests (Vitest)
npm run test:unit:watch  # Unit tests in watch mode
npm run test:ui     # E2E tests with Playwright UI
npm run test:headed # E2E tests in headed mode
npm run test:report # View Playwright test report
```

### Linting
```bash
npm run lint:globals # Check for new window global variables
```

**Important**: The `lint:globals` script runs automatically before tests (`pretest` hook). It will fail CI if you introduce new `window.X` global variables. Only update the allowlist in `js/window-globals-debug.js` when removing legacy globals, not adding new ones.

## Architecture Overview

### Modular Architecture (HNW Compliant)

The codebase follows a **Hierarchy-Network-Wave (HNW)** framework with strict separation of concerns:

**Core Structure:**
- **Entry Point**: `js/main.js` - Single ES Module entry with security-first initialization
- **Main Controller**: `js/app.js` (794 lines) - Orchestrates initialization, delegates to services/controllers
- **Chat Module**: `js/chat.js` (941 lines) - Chat orchestration with 4 dedicated services

**Modular Breakdown:**
- **7 Controllers** (`js/controllers/`) - UI logic (ChatUI, Sidebar, View, FileUpload, Spotify, Demo, Reset)
- **17 Services** (`js/services/`) - Business logic (SessionManager, TabCoordinator, EventBus, etc.)
- **3 Providers** (`js/providers/`) - LLM provider interfaces (OpenRouter, LM Studio, Ollama)
- **Storage Facade** (`js/storage/`) - Unified storage with IndexedDB, localStorage, migration support
- **Security Facade** (`js/security/`) - Client-side security (AES-GCM encryption, token binding, anomaly detection)

**Key Architectural Principle**: Delegation over god objects. Each module has single responsibility and clear interfaces.

### Data Flow Patterns

**Three Analysis Paths:**
1. **Full Analysis**: Upload .zip → Web Worker parse → Store in IndexedDB → Full pattern detection → Chat + Semantic Search
2. **Quick Snapshot**: Spotify OAuth → Fetch API data → Lite patterns → Lite personality → Upsell
3. **Demo Mode**: Pre-built "Emo Teen" persona → Isolated data domain → Instant exploration

**BYOI (Bring Your Own Intelligence)**:
- Local AI: Ollama (http://localhost:11434) or LM Studio (http://localhost:1234/v1)
- Cloud AI: OpenRouter (user provides API key)
- No vendor lock-in - users control their intelligence path

### State Management

**Centralized State**: `js/state/app-state.js`
- Isolated demo mode data (`AppState.demo`)
- Real user data (`AppState.user`)
- View state and configuration

**Storage Architecture**: `js/storage/` modules
- **IndexedDB**: Raw streams, chunks, personality, chat sessions
- **localStorage**: Settings, tokens (encrypted), configuration
- **Migration System**: One-way localStorage → IndexedDB with checkpointing

## Key Technical Concepts

### Function Calling System

The chat uses OpenAI-style function calling with 22 available functions across 4 categories:
- **Core Data Queries** (6): Top artists/tracks, artist history, listening stats, period comparison
- **Stats.fm Analytics** (6): Bottom tracks/artists, listening clock, streaks, platform stats
- **Spotify Wrapped Analytics** (6): Discovery stats, skip patterns, completion rates, peak listening
- **Template Profiles** (4): Genre search, pattern matching, personality synthesis, profile generation

**4-Level Fallback Network**:
1. Native Function Calling (OpenAI `tool_calls`)
2. Prompt Injection (`<function_call>` tags in text)
3. Regex Parsing (extract structured data from natural language)
4. Intent Extraction (direct query based on user message)

Located in: `js/functions/`, `js/services/tool-strategies/`, `js/services/tool-call-handling-service.js`

### Security Model

**100% Client-Side Security** (documented in `SECURITY.md`):
- **AES-GCM Encryption**: RAG credentials encrypted with session-derived keys
- **XSS Token Binding**: Spotify tokens bound to device fingerprint
- **Fail-Closed Architecture**: Safe Mode disables persistence if security modules fail
- **Session Versioning**: Keys invalidated on auth failures
- **Geographic Anomaly Detection**: Proxy/VPN attack detection
- **Prototype Pollution Prevention**: `Object.freeze()` on critical prototypes

**Security Trade-off**: True credential revocation requires server infrastructure. This app provides defense-in-depth but cannot match server-side security.

### Operation Lock Contract

**Critical** for coordinating concurrent operations:

**Standardized Error Classes** (`js/operation-lock-errors.js`):
- `LockAcquisitionError` - Lock blocked by operations
- `LockTimeoutError` - Acquisition timeout
- `LockReleaseError` - Release failures

**Correct Pattern**:
```javascript
try {
    const lockId = await OperationLock.acquire('operation_name');
    // ... work ...
    OperationLock.release('operation_name', lockId);
} catch (error) {
    if (error instanceof LockAcquisitionError) {
        // Handle lock acquisition failure
    }
}
```

**Never** use the `isLocked() + acquire()` pattern (race condition). Always acquire directly in try-catch.

See `docs/operation-lock-contract.md` for complete documentation.

### Event-Driven Architecture

**EventBus System** (`js/services/event-bus.js`):
- Centralized typed event system with priority dispatch
- Schema validation for event payloads
- Circuit breaker for queue overflow handling
- Replaces bespoke listeners in Storage and SessionManager

**Event Types**:
- `DATA:*` events (streams loaded, chunks saved)
- `CHAT:*` events (message sent, session changed)
- `UI:*` events (view transitions, modal states)

### Cross-Tab Coordination

**TabCoordinator** (`js/services/tab-coordination.js`):
- Deterministic leader election (300ms window, lowest ID wins)
- 5-second heartbeat with 10-second promotion threshold
- Prevents duplicate operations across browser tabs
- Critical for storage operations and embedding generation

## File Structure Highlights

**Core Application Files**:
- `js/main.js` - ES Module entry point (security-first initialization)
- `js/app.js` - Main controller (794 lines, delegates to services/controllers)
- `js/chat.js` - Chat orchestration (941 lines, 4 dedicated services)
- `js/parser-worker.js` - Web Worker for incremental parsing
- `js/storage.js` - Storage facade (delegates to `js/storage/` modules)
- `js/security.js` - Security facade (delegates to `js/security/` modules)

**Testing**:
- `tests/unit/` - Vitest unit tests (250+ tests covering schemas, patterns, architecture)
- `tests/rhythm-chamber.spec.ts` - Playwright E2E tests

**Configuration**:
- `js/config.js` - API keys (gitignored)
- `js/config.example.js` - Configuration template
- `js/settings.js` - In-app settings modal

## Development Guidelines

### Code Organization Principles

**HNW Framework**:
- **Hierarchy**: Clear chain of command (App → Controller → Service → Provider)
- **Network**: Modular communication via facades and events
- **Wave**: Deterministic timing (leader election, heartbeat failover, migration checkpointing)

**Modular Architecture**:
- Use delegation pattern - don't create god objects
- Single responsibility per module
- Dependency injection for all controllers/services
- Event-driven communication for cross-module coordination

### ES Module Migration

**Status**: Legacy `window.ModuleName` globals are deprecated. Use ES imports:

**Correct**:
```javascript
import { Storage } from './storage.js';
import { Chat } from './chat.js';
```

**Incorrect** (will trigger lint:globals warning):
```javascript
const Storage = window.Storage;
const Chat = window.Chat;
```

Run `npm run lint:globals` before committing to catch new window globals.

### Testing Best Practices

**Unit Tests** (Vitest):
- Test schema validation, pattern detection, service logic
- Run `npm run test:unit:watch` during development
- Aim for high coverage of core algorithms

**E2E Tests** (Playwright):
- Test user flows (upload, chat, settings)
- Run `npm run test:ui` for interactive debugging
- Tests run automatically in CI (`npm test`)

### Security Considerations

**Always**:
- Use `Security.storeEncryptedCredentials()` for sensitive data
- Validate secure context before crypto operations
- Handle `Security.ErrorContext` for structured error recovery
- Follow fail-closed principles (disable features if security fails)

**Never**:
- Store API keys in plaintext
- Bypass security checks for convenience
- Assume client-side security equals server-side security

### Performance Optimization

**Web Workers**:
- File parsing runs in `js/parser-worker.js`
- Vector search offloaded to `js/workers/vector-search-worker.js`
- Pattern detection uses `js/workers/pattern-worker-pool.js` (3 workers)

**60fps Target**:
- Use async operations for heavy computation
- Implement incremental UI updates via `PatternStream`
- Circuit breakers prevent runaway operations

## Important Architectural Decisions

**Why Zero-Backend?**
- Competitive advantage against server-dependent competitors
- Privacy-first positioning (data never leaves device)
- Zero infrastructure costs (free tier sustainable)
- BYOI appeals to power users who want control

**Why Modular Architecture?**
- 77% reduction in main app complexity (3,426 → 794 lines in app.js)
- Improved testability (each module can be tested independently)
- Better maintainability (clear separation of concerns)
- Enhanced extensibility (new features don't touch core modules)

**Why 4-Level Fallback?**
- LLM provider lock-in risk mitigation
- Graceful degradation when function calling unsupported
- Maximum compatibility across different providers/models
- User experience consistency regardless of provider

## Common Tasks

**Adding a New Chat Function**:
1. Add schema to `js/functions/schemas/`
2. Add executor to `js/functions/executors/`
3. Export from `js/functions/index.js`
4. Update test coverage in `tests/unit/schemas.test.js`

**Creating a New Service**:
1. Create file in `js/services/`
2. Use ES exports (named exports preferred)
3. Import in `js/main.js` for initialization
4. Add unit tests in `tests/unit/`

**Adding a New Controller**:
1. Create file in `js/controllers/`
2. Implement `init(dependencies)` method
3. Register in `js/app.js` initialization
4. Use `data-action` attributes for UI events (event delegation)

**Updating Storage Schema**:
1. Add migration to `js/storage/migration.js`
2. Update version in `js/storage/keys.js`
3. Test migration in `tests/unit/storage-migration.test.js`
4. Use checkpointing for long-running migrations

## Troubleshooting

**Lock Acquisition Errors**:
- Check `OperationLock.getLockStatus()` for diagnostic info
- Review failure propagation in `docs/operation-lock-contract.md`
- Ensure proper error handling with `LockAcquisitionError`

**Module Loading Failures**:
- Check browser console for import errors
- Verify ES module syntax (no `require()`)
- Ensure `type="module"` in script tags
- Run `npm run lint:globals` to check for new window globals

**Test Failures**:
- Run `npm run test:unit` for unit tests
- Run `npm run test:ui` for E2E test debugging
- Check `AGENT_CONTEXT.md` for recent architecture changes
- Verify dependencies are installed (`npm install`)

**Security Mode Issues**:
- Check `Security.checkSecureContext()` return value
- Verify HTTPS or localhost for development
- Review Safe Mode warnings in browser console
- Check `Security.ErrorContext` for structured recovery paths

## Additional Resources

- **AGENT_CONTEXT.md** - Comprehensive AI agent reference with session history
- **SECURITY.md** - Complete threat model and security architecture
- **docs/03-technical-architecture.md** - Detailed technical documentation
- **docs/operation-lock-contract.md** - Operation locking patterns and error handling
- **README.md** - Project overview and user-facing documentation