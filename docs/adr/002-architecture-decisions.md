# ADR-002: Architecture Decisions

**Status:** Accepted
**Date:** 2025-01-29
**Context:** Phase 2-3 - System Architecture and Refactoring

This ADR consolidates key architectural decisions made during the evolution of Rhythm Chamber.

---

## Decision 1: Modular Architecture for IndexedDB

### Context

The IndexedDB storage module was a 1,348-line god object with multiple responsibilities:

- Connection management and lifecycle
- Schema migrations and upgrades
- Transaction management
- Read/write operations
- Query building and indexing
- Error handling and recovery
- Performance monitoring
- Encryption wrapper integration

This violated Single Responsibility Principle and was difficult to test, understand, maintain, and extend.

### Decision

Split IndexedDB into **10 focused modules** using the facade pattern.

#### Module Structure

```
js/storage/indexeddb/
├── index.js                    # Facade - public API (174 lines)
├── connection-manager.js       # DB connection lifecycle (87 lines)
├── schema-manager.js           # Version management (156 lines)
├── transaction-manager.js      # Transaction coordination (203 lines)
├── query-builder.js            # Query construction (189 lines)
├── index-manager.js            # Index operations (167 lines)
├── migration-runner.js         # Migration execution (198 lines)
├── error-handler.js            # Error classification (145 lines)
├── event-dispatcher.js         # Event emission (98 lines)
├── performance-monitor.js      # Performance tracking (134 lines)
└── validation-helper.js        # Input validation (89 lines)
```

### Consequences

**Positive:**
- Each module has a single, clear responsibility
- Smaller modules are easier to test in isolation
- Modules can be reused independently
- Critical paths can be optimized independently
- New developers can understand individual modules quickly

**Negative:**
- Increased file count (1 → 11 files)
- More complex import structure
- Facade adds a thin layer of indirection

---

## Decision 2: Facade Pattern for Incremental Refactoring

### Context

We needed to break down 40+ god objects without breaking the code that depends on them. The challenge:

- **Many consumers** depend on these objects
- **Tight coupling** throughout the codebase
- **No clear module boundaries** exist
- **Refactoring must be incremental** - can't rewrite everything at once

### Decision

Use the **facade pattern** to maintain backward compatibility while splitting internal implementation.

#### Pattern Structure

**Before (God Object):**
```
┌─────────────────────────────────────┐
│     SessionManager (826 lines)      │
│  ┌───────────────────────────────┐  │
│  │ All methods mixed together    │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**After (Facade + Modules):**
```
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
└──────────────────────┘    └──────────────────────────┘
```

#### Implementation Pattern

**1. Facade (index.js)** - Unchanged Public API

```javascript
// js/storage/indexeddb.js
import { ConnectionManager } from './connection-manager.js';
import { SchemaManager } from './schema-manager.js';
// ... other imports

export const IndexedDB = {
  async init() {
    await ConnectionManager.connect();
    await SchemaManager.initialize();
    await MigrationRunner.runMigrations();
  },

  async get(storeName, key) {
    return await QueryBuilder.buildGetQuery(storeName, key).execute();
  },

  // ... rest of public API
};
```

**2. Internal Modules** - Focused Responsibilities

```javascript
// js/storage/indexeddb/connection-manager.js
export class ConnectionManager {
  async connect() {
    // Connection logic
  }

  async disconnect() {
    // Cleanup logic
  }
}
```

**3. Consumer Code** - Zero Changes Required

```javascript
// This still works exactly as before
import { IndexedDB } from './storage/indexeddb.js';

await IndexedDB.init();
const data = await IndexedDB.get('streams', 1);
```

### Consequences

**Positive:**
- Zero breaking changes to existing code
- Can update consumers gradually
- Clean modular structure behind the facade
- Can test facade and modules independently
- Enables incremental migration

**Negative:**
- Facade adds a thin layer of indirection
- Slight performance overhead from delegation
- Must maintain facade API longer-term
- Two levels of API to document

---

## Decision 3: Parallel Execution Strategy for Large-Scale Refactoring

### Context

Phase 2-3 required refactoring 40+ god objects across the codebase. Given the scope:

- **40+ objects** to refactor
- **20,000+ lines** of affected code
- **4-week timeline** for completion
- **Multiple developers/sub-agents** working in parallel

We needed a systematic approach to:
1. Execute work efficiently with parallel execution
2. Avoid merge conflicts between concurrent work
3. Maintain code stability throughout refactoring
4. Ensure proper testing and documentation

### Decision

Use **sub-agents with maximum 2-3 parallel workers** to balance speed and safety.

#### Parallel Execution Strategy

**Week 1: Test Infrastructure (Sequential)**
- Sub-Agent 1: Test Framework Setup (must complete first)
- Sub-Agent 2: Characterization Tests (depends on test framework)

**Week 2: Low-Risk Refactoring (2-3 Parallel)**
- Sub-Agent 1: Documentation (ADR creation, README updates)
- Sub-Agent 2: Simple Refactoring (utils, helpers, validators)
- Sub-Agent 3: Characterization Tests (for medium-risk modules)

**Week 3: Medium-Risk Refactoring (Sequential or Limited Parallel)**
- Sub-Agent 1: Metrics Exporter Refactoring
- Sub-Agent 2: Session Manager Refactoring (starts after Metrics completes)

**Week 4: High-Risk Refactoring (Sequential)**
- Sub-Agent 1: IndexedDB Refactoring (only one high-risk task at a time)

#### Risk Assessment Criteria

**Low Risk (can parallelize):**
- Doesn't touch core business logic
- No database schema changes
- No API contract changes
- Isolated modules with few dependencies
- Documentation and tests

**Medium Risk (limited parallelization):**
- Touches multiple modules
- Some dependencies on other modules
- Moderate complexity
- Some consumers to update

**High Risk (must be sequential):**
- Core storage layers
- Data migration logic
- Performance-critical code
- Many consumers affected
- Complex inter-module dependencies

### Consequences

**Positive:**
- Reduced overall timeline (4 weeks vs 8+ weeks)
- Parallel work on independent modules
- Systematic risk assessment
- Clear coordination protocol

**Negative:**
- Increased coordination overhead
- Need for careful branch management
- Potential for merge conflicts
- Requires disciplined communication

---

## Decision 4: Zero-Backend Architecture

### Context

Traditional music analytics services like Stats.fm require server infrastructure, which means:

- They must monetize to cover hosting costs
- They control your data
- They can shut down or change pricing
- You depend on their uptime

### Decision

Implement **100% client-side architecture** with zero server dependencies.

#### Architecture

```
User's Browser
├── Two Onboarding Paths:
│   ├── Path A: Quick Snapshot (Spotify OAuth)
│   │   ├── PKCE auth flow (no backend)
│   │   ├── Fetch recent plays & top artists
│   │   └── Lite personality analysis
│   │
│   └── Path B: Full Analysis (File Upload)
│       ├── Upload .zip (endsong.json)
│       ├── Parse in Web Worker
│       ├── Store in IndexedDB
│       └── Full personality detection
│
├── Three Intelligence Layers:
│   ├── Pattern Detection (local)
│   ├── Semantic Search (local WASM)
│   └── LLM Chat (local or cloud, BYOI)
│
└── Storage (IndexedDB)
    ├── Streaming history
    ├── Aggregated chunks
    ├── Embeddings (vectors)
    ├── Chat sessions
    └── Settings
```

### Consequences

**Positive:**
- Zero server infrastructure costs
- Privacy-first (data never leaves device)
- User controls their data completely
- Can't be shut down by service provider
- Open source verifiable security

**Negative:**
- No centralized data collection
- No real-time sync across devices (without E2EE infrastructure)
- Must process everything on user's device
- Limited by client device performance

---

## Decision 5: Bring Your Own Intelligence (BYOI)

### Context

Most AI applications lock users into a specific AI provider. This creates:

- Vendor lock-in
- Potential privacy concerns
- Inability to optimize for cost
- Dependence on specific model availability

### Decision

Implement **BYOI (Bring Your Own Intelligence)** architecture allowing users to choose their AI provider.

#### Supported Providers

| Provider | Type | Cost | Setup |
|----------|------|------|-------|
| **Ollama** | Local | Free | Install Ollama, run model |
| **LM Studio** | Local | Free | Install LM Studio, enable API |
| **OpenRouter** | Cloud | Pay-per-use | Add API key in settings |
| **OpenAI-Compatible** | Cloud or Local | Depends on provider | Configure custom base URL and API key |
| **Gemini** | Cloud | Pay-per-use | Add API key in settings |

### Consequences

**Positive:**
- Users control their AI experience
- Can optimize for cost (local) or quality (cloud)
- No vendor lock-in
- Privacy-focused users can stay 100% local
- Power users can fine-tune their setup

**Negative:**
- More complex configuration for users
- Support burden for multiple providers
- Inconsistent experiences across providers
- Must maintain compatibility with multiple APIs

---

## References

- [ARCHITECTURE.md](../../ARCHITECTURE.md) - Complete system architecture
- [REFACTORING.md](../../REFACTORING.md) - Refactoring history and patterns
- [ADR-001: Testing Methodology](001-testing-methodology.md) - Characterization testing approach
