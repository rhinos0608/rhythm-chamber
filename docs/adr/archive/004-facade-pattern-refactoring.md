# ADR-004: Facade Pattern for God Object Refactoring

**Status:** Accepted
**Date:** 2025-01-29
**Context:** Phase 3 - God Objects Remediation

## Context

We need to break down 40+ god objects without breaking the code that depends on them. The challenge:

- **Many consumers** depend on these objects
- **Tight coupling** throughout the codebase
- **No clear module boundaries** exist
- **Refactoring must be incremental** - can't rewrite everything at once

### Example: Session Manager

**Current state:** One 826-line file with everything mixed together

```javascript
// js/services/session-manager.js
export class SessionManager {
  // 50+ methods, all mixed together
  createSession() { /* ... */ }
  validateSession() { /* ... */ }
  updateState() { /* ... */ }
  cleanup() { /* ... */ }
  // ... 46 more methods
}
```

**Consumers throughout codebase:**

```javascript
// Multiple files import like this
import { SessionManager } from './services/session-manager'

const manager = new SessionManager()
manager.createSession()  // ← Will break if we change this
```

## Decision

Use the **facade pattern** to maintain backward compatibility while splitting internal implementation.

### Pattern Structure

```
Before (God Object):
┌─────────────────────────────────────┐
│     SessionManager (826 lines)      │
│  ┌───────────────────────────────┐  │
│  │ All methods mixed together    │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘

After (Facade + Modules):
┌─────────────────────────────────────┐
│   index.js (Facade) - Public API    │
│  ┌───────────────────────────────┐  │
│  │ Exports same 50+ methods      │  │
│  │ Delegates to internal modules │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
           │
           ├──────────────────────────────┐
           ↓                              ↓
┌──────────────────────┐    ┌──────────────────────────┐
│  session-lifecycle.js │    │ session-state.js         │
│  (200 lines)          │    │ (150 lines)              │
│  - createSession()    │    │ - updateState()          │
│  - destroySession()   │    │ - getState()             │
│  - validateSession()  │    │ - setState()             │
└──────────────────────┘    └──────────────────────────┘
           │                              │
           └──────────────────────────────┘
                    │
                    ↓
         ┌─────────────────────┐
         │  Additional modules │
         │  - crypto.js        │
         │  - persistence.js   │
         │  - events.js        │
         └─────────────────────┘
```

### Implementation Pattern

**1. Facade (index.js)** - Unchanged Public API

```javascript
// js/services/session-manager/index.js
import { SessionLifecycle } from './session-lifecycle'
import { SessionState } from './session-state'
import { SessionCrypto } from './session-crypto'
import { SessionPersistence } from './session-persistence'

export class SessionManager {
  constructor(config) {
    this.lifecycle = new SessionLifecycle(config)
    this.state = new SessionState(config)
    this.crypto = new SessionCrypto(config)
    this.persistence = new SessionPersistence(config)
  }

  // Facade methods - delegate to modules
  async createSession(options) {
    return this.lifecycle.create(options)
  }

  async validateSession(sessionId) {
    return this.lifecycle.validate(sessionId)
  }

  getState(sessionId) {
    return this.state.get(sessionId)
  }

  updateState(sessionId, updates) {
    return this.state.update(sessionId, updates)
  }

  // ... 46 more facade methods
}
```

**2. Internal Modules** - Focused Responsibilities

```javascript
// js/services/session-manager/session-lifecycle.js
export class SessionLifecycle {
  constructor(config) {
    this.config = config
  }

  async create(options) {
    // Session creation logic
  }

  async validate(sessionId) {
    // Validation logic
  }

  async destroy(sessionId) {
    // Cleanup logic
  }
}
```

**3. Consumer Code** - Zero Changes Required

```javascript
// Still works exactly as before
import { SessionManager } from './services/session-manager'

const manager = new SessionManager()
await manager.createSession()  // ← Facade handles this
```

## Benefits

### 1. Zero Breaking Changes

- All existing code continues to work
- No need to update consumers immediately
- Incremental migration path

### 2. Clear Module Boundaries

- Each module has single responsibility
- Easy to understand and test
- Dependencies are explicit

### 3. Independent Refactoring

- Can refactor modules independently
- Tests ensure modules work correctly
- Facade isolates changes

### 4. Incremental Migration

```javascript
// Phase 1: Use facade
import { SessionManager } from './services/session-manager'

// Phase 2: Optionally use internals (when refactoring consumer)
import { SessionState } from './services/session-manager/session-state'

// Phase 3: Migrate fully to new structure
import { SessionState } from './services/session-state'
```

## Consequences

### Positive

- **Zero breaking changes** - all existing code works
- **Can incrementally refactor consumers** - migrate at own pace
- **Clear separation of concerns** - modules have single responsibility
- **Independent testing** - each module tested in isolation
- **Parallel development** - different modules can be worked on simultaneously
- **Documentation improvement** - facade documents public API
- **Type safety** - easier to add TypeScript to modules

### Negative

- **Indirection through facade** - extra layer of abstraction
- **May temporarily import both facade and internals** - during migration
- **Facade becomes large** - still has 50+ methods (but simpler)
- **Dependency management** - must coordinate module interactions
- **Potential over-abstraction** - some facades may be unnecessary

## Migration Strategy

### Phase 1: Characterization Testing (ADR-001)

```javascript
// Write comprehensive tests for current SessionManager
describe('SessionManager', () => {
  test('createSession creates valid session', async () => {
    // Document current behavior
  })

  // ... 45 more tests
})
```

### Phase 2: Create Modules

```javascript
// Create internal modules
// - Move code from god object to modules
// - Ensure all tests pass
```

### Phase 3: Build Facade

```javascript
// Create index.js with facade
// - Delegate to modules
// - Verify all tests pass
// - Confirm backward compatibility
```

### Phase 4: Incremental Consumer Migration (Optional)

```javascript
// Consumers can optionally migrate to using modules directly
import { SessionState } from './services/session-manager/session-state'
```

### Phase 5: Cleanup (Future)

```javascript
// Once all consumers migrated, can remove facade
// Or keep facade if it provides value
```

## When to Use Facade Pattern

**Use facade when:**

- Breaking down large objects with many consumers
- Need to maintain backward compatibility
- Want incremental refactoring path
- Object has clear public API

**Don't use facade when:**

- Object has few consumers (just update them)
- Public API is unclear or changing
- Can afford breaking changes
- Object is already small

## Success Criteria

- All existing tests pass with facade
- Zero breaking changes to public API
- Each module <400 lines
- Each module has >80% test coverage
- No performance regression
- Consumers work unchanged

## Examples in Codebase

### Session Manager Facade

```javascript
// js/services/session-manager/index.js
export class SessionManager {
  // 50+ facade methods delegating to:
  // - session-lifecycle.js (200 lines)
  // - session-state.js (150 lines)
  // - session-crypto.js (120 lines)
  // - session-persistence.js (180 lines)
  // - session-events.js (100 lines)
}
```

### Metrics Exporter Facade

```javascript
// js/observability/metrics-exporter/index.js
export class MetricsExporter {
  // 30+ facade methods delegating to:
  // - export-strategies.js (300 lines)
  // - metrics-formatters.js (250 lines)
  // - metrics-aggregators.js (200 lines)
  // - transport-layer.js (150 lines)
}
```

### IndexedDB Facade (ADR-002)

```javascript
// js/storage/indexeddb/index.js
export class IndexedDBStorage {
  // 40+ facade methods delegating to 9 modules
}
```

## References

- ADR-001: Characterization Testing
- ADR-002: Module Structure for IndexedDB
- Phase 3 Plan: `docs/plans/PHASE-3-GOD-OBJECTS-COMPLETE.md`
- Facade Pattern: Gang of Four Design Patterns
