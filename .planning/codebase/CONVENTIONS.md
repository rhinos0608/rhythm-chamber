# Coding Conventions

**Analysis Date:** 2025-01-21

## Naming Patterns

**Files:**
- kebab-case for module files: `event-bus.js`, `provider-interface.js`
- kebab-case for services: `config-loader.js`, `health-monitor.js`
- Descriptive names indicating purpose: `storage-degradation-manager.js`, `cascading-abort-controller.js`

**Functions:**
- camelCase for function names: `getProviderHealth()`, `loadConfig()`, `emit()`
- Async functions use camelCase: `fetchWithTimeout()`, `createChunksWithWorker()`
- Private/internal functions prefixed with underscore: `_cache`, `_evictionCount`, `_hitCount`

**Variables:**
- camelCase for variables: `const max retryAttempts = 3;`
- UPPER_SNAKE_CASE for constants: `DEFAULT_MAX_SIZE`, `PROVIDER_TIMEOUTS`, `API_RATE_LIMIT_MS`
- Module-level constants use UPPER_SNAKE_CASE: `LLM_PROVIDERS`, `AVAILABLE_MODELS`, `DEFAULT_ENDPOINTS`

**Types/Classes:**
- PascalCase for classes: `LRUCache`, `ErrorBoundary`, `EventBus`, `ProviderHealthMonitor`
- PascalCase for exported enums/objects: `HealthStatus`, `CleanupPriority`, `RecoveryPriority`
- Interface-like objects use PascalCase: `GenreEnrichment`, `DataQuery`, `ConversationOrchestrator`

## Code Style

**Formatting:**
- No explicit formatter detected (no .prettierrc or similar config found)
- Consistent use of semicolons
- 2-space indentation in test files
- 4-space indentation in source files (inconsistent in some areas)

**Linting:**
- Custom lint script: `npm run lint:globals` - checks for window globals usage
- Script located at: `scripts/lint-window-globals.mjs`
- Enforces ES module usage over window global dependencies

**Module System:**
- ES modules throughout: `import { X } from './path.js'`
- Explicit `.js` extensions in imports
- No CommonJS `require()` usage
- Package.json: `"type": "module"`

## Import Organization

**Order:**
1. External dependencies (third-party packages)
2. Internal security modules (must be first for fail-fast behavior)
3. Core utilities and services
4. Feature-specific modules
5. Relative imports

**Example from `js/app.js`:**
```javascript
// Security (must be first for fail-fast behavior)
import { Security, SecurityChecklist } from './security.js';

// Core utilities
import { ModuleRegistry } from './module-registry.js';

// State management
import { AppState } from './state/app-state.js';

// Feature modules
import { Patterns } from './patterns.js';
```

**Path Aliases:**
- No explicit path aliases configured
- Relative imports used: `import { X } from '../../js/services/event-bus.js'`

## Error Handling

**Patterns:**
- Custom Error classes: `TimeoutError`, `CascadingAbortError`
- Try-catch with specific error messages
- Error boundaries for UI isolation: `ErrorBoundary` class in `js/services/error-boundary.js`
- Safe Mode enforcement for security-critical operations

**Example error handling:**
```javascript
async function assertWriteAllowed(operation) {
  if (!SafeMode.canEncrypt()) {
    const status = SafeMode.getSafeModeStatus();
    if (status.isSafeMode) {
      throw new Error(
        `[Storage] Write blocked: Safe Mode active. ` +
        `Operation '${operation}' requires security capabilities.`
      );
    }
  }
}
```

**Timeout wrappers:**
- `withTimeout()` utility from `js/utils/timeout-wrapper.js`
- Operation-specific timeouts: `PROVIDER_TIMEOUTS.cloud = 60000`, `PROVIDER_TIMEOUTS.local = 90000`

**Recovery patterns:**
- Circuit breakers: `ProviderCircuitBreaker` in `js/services/provider-circuit-breaker.js`
- Retry logic with exponential backoff: `ConfigLoader.load()` in `js/services/config-loader.js`
- Fallback mechanisms: `FunctionCallingFallback` in `js/services/function-calling-fallback.js`

## Logging

**Framework:** Console API (no structured logging framework detected)

**Patterns:**
- Module-prefixed logging: `console.log('[RAG] EmbeddingWorker initialized')`
- Error logging: `console.error('[RAG] Failed to get config:', e)`
- Warning logging: `console.warn('[GenreEnrichment] Failed to load cache:', e)`
- No log levels (all use console methods directly)

**Log categories:**
- Debug/module initialization: `console.log()`
- Non-critical failures: `console.warn()`
- Critical errors: `console.error()`

## Comments

**When to Comment:**
- JSDoc for exported functions and classes
- Inline comments for HNW (Hierarchy-Network-Wave) architectural decisions
- Implementation notes for complex algorithms
- Security-related annotations

**JSDoc/TSDoc:**
- Comprehensive JSDoc on exported functions
- `@module` tags for file-level documentation
- `@param` and `@returns` for function signatures
- Example from `js/storage/lru-cache.js`:
```javascript
/**
 * Get an item from the cache
 * Updates access recency (moves to most recent)
 * @param {string|number} key - Cache key
 * @returns {any} The cached value or undefined
 */
get(key) {
  // ...
}
```

**Architectural comments:**
```javascript
/**
 * HNW Considerations:
 * - Hierarchy: Single source of truth for all cross-module events
 * - Network: Decouples producers from consumers, reduces direct dependencies
 * - Wave: Priority ordering ensures critical events arrive first
 */
```

## Function Design

**Size:**
- Functions typically 20-50 lines
- Large functions exist (e.g., `settings.js` has very long functions)
- No strict size limit enforced

**Parameters:**
- Destructured objects for multiple parameters: `function buildProviderConfig(provider, settings, baseConfig)`
- Options objects for optional parameters: `constructor(maxSize = DEFAULT_MAX_SIZE, options = {})`
- Explicit parameter defaults: `async function fetchWithTimeout(url, options = {}, timeoutMs = 30000)`

**Return Values:**
- Async functions return Promises
- Error functions throw (don't return error objects)
- Early returns for guard clauses
- Return objects for complex data: `{ status: 'success', data: [...] }`

## Module Design

**Exports:**
- Named exports preferred: `export const EventBus = { ... }`
- Class exports: `export class LRUCache { ... }`
- Default exports rare (mostly for test mocks)

**Barrel Files:**
- `js/functions/index.js` - aggregator for function definitions
- `js/services/` - individual service files (no barrel file)
- `js/controllers/` - individual controller files (no barrel file)

**Module organization:**
- Controllers: UI interaction logic
- Services: Business logic and cross-cutting concerns
- Providers: External API integrations
- Storage: Data persistence layers
- Security: Authentication and encryption
- Utils: Shared utilities

**Module dependency pattern:**
```javascript
// Core imports first (security, utilities)
import { Security } from './security.js';
import { ModuleRegistry } from './module-registry.js';

// Feature imports second
import { Patterns } from './patterns.js';
import { Personality } from './personality.js';

// UI imports last
import { ViewController } from './controllers/view-controller.js';
```

---

*Convention analysis: 2025-01-21*